import { copyGuestMedia, setMediaOwner } from "./media";
import type { MealDetails } from "./meals";
import { validateSnapshot } from "./snapshot";
import { sameSnapshot, undoDelta } from "./journal-safety";
import { clearPhotoCache } from "./cloud-sync";
import { inventory, lotIdentity } from "./inventory";
export { canDeduct } from "./inventory";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadCloud, pushDiff } from "./cloud-sync";
import { setLocale } from "./i18n";
import { addDays, DEFAULT_TZ, instantFromLocal, localDateOf, todayLocal } from "./dates";

// Journal store: works on-device when signed out; when signed in, mirrors every change to Lovable Cloud.
export type Precision = "exact" | "date_only" | "part_of_day" | "unknown";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export type Evidence = {
  analysis?: { model: string; promptVersion: string; schemaVersion: number; analyzedAt: string };
  method: "manual" | "text" | "voice" | "photos" | "mixed";
  text: string;
  photos: string[];
  quote: string | null;
  proposed: Record<string, string>;
  confirmed: Record<string, string>;
};

type Base = {
  evidence?: Evidence;
  id: string;
  localDate: string;
  precision: Precision;
  at: string | null;
  partOfDay?: PartOfDay | null;
  demo?: boolean;
  createdAt: string;
  source: "manual_text";
};
export type WeightRec = Base & { type: "weight"; value: number; unit: "kg" };
export type InjectionRec = Base & {
  type: "injection";
  medication: string | null;
  doseValue: number | null;
  doseUnit: string | null;
  site: string | null;
  usedStock: boolean;
  stockPurchaseId?: string | null;
  stockIdentity?: string | null;
};
export type ConditionRec = Base & { type: "condition"; label: string; note?: string };
export type MemoryRec = Base & { type: "memory"; note: string; photo?: string | null };
export type MeasureRec = Base & {
  type: "measure";
  waist: number | null;
  hip: number | null;
  chest: number | null;
  thigh: number | null;
  unit: "cm";
};
/** A momentary answer to "did you drink water?" — no volume is ever implied. */
export type WaterRec = Base & { type: "water"; answer: "yes" | "not_yet" };
export type MealRec = Base & { type: "meal"; meal: MealDetails };
export type JournalRecord =
  MealRec | WeightRec | InjectionRec | ConditionRec | MemoryRec | MeasureRec | WaterRec;

export type Reminder = { id: string; at: string; demo?: boolean };
export type StockUnit = "pen" | "single" | "dose";
/** doses = quantity in stockUnit. addsStock false = expense only (never touches inventory). */
export type Purchase = {
  id: string;
  localDate: string;
  amount: number;
  currency: string;
  doses: number;
  medication: string | null;
  demo?: boolean;
  evidence?: Evidence;
  quantity?: number | null;
  stockUnit?: StockUnit | null;
  addsStock?: boolean;
  merchant?: string | null;
  product?: string | null;
};
export type PromptId = "feel" | "water" | "memory" | "weight";
export type PromptSettings = {
  aiConsent?: boolean;
  context?: { day: string; id: string; status: "answered" | "skipped" };
  hidden?: boolean;
  off?: PromptId[];
  answered?: Partial<Record<PromptId, string>>;
  skipped?: Partial<Record<PromptId, string>>;
  done?: Partial<Record<PromptId, string>>;
};

/** A scalar is available only when there is exactly one confirmed lot. */
export function computeStock(purchases: Purchase[], records: JournalRecord[]) {
  const { lots, unresolved, unresolvedPurchases } = inventory(purchases, records);
  return lots.length === 1 && !unresolved.length && !unresolvedPurchases.length
    ? lots[0]!.balance
    : null;
}

type State = {
  records: JournalRecord[];
  reminder: Reminder | null;
  purchases: Purchase[];
  stockAdjust: number; // manual adjustments to computed stock (in doses)
  settings: {
    showMomo: boolean;
    timezone: string;
    locale?: "ko" | "en" | "fr";
    guestImported?: boolean;
    demoMode?: boolean;
    stockAdjustments?: Record<string, { identity: string; delta: number }>;
    legacyAdjustmentConfirmed?: boolean;
    prompts?: PromptSettings;
  };
};

const KEY = "mds.journal.v1";
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function demoState(): State {
  const tz = DEFAULT_TZ;
  const today = todayLocal(tz);
  const now = new Date().toISOString();
  const d = (n: number) => addDays(today, n);
  const w = (n: number, v: number, time = "08:12"): WeightRec => ({
    id: `demo-w${n}`,
    type: "weight",
    value: v,
    unit: "kg",
    localDate: d(n),
    precision: "exact",
    at: instantFromLocal(d(n), time, tz),
    demo: true,
    createdAt: now,
    source: "manual_text",
  });
  const inj = (n: number, site: string): InjectionRec => ({
    id: `demo-i${n}`,
    type: "injection",
    medication: "마운자로",
    doseValue: 2.5,
    doseUnit: "mg",
    site,
    usedStock: true,
    stockPurchaseId: "demo-p1",
    stockIdentity: JSON.stringify(["마운자로", "single", null]),
    localDate: d(n),
    precision: "exact",
    at: instantFromLocal(d(n), "20:00", tz),
    demo: true,
    createdAt: now,
    source: "manual_text",
  });
  const weights = [
    [-27, 80.6],
    [-24, 80.5],
    [-21, 80.0],
    [-18, 79.9],
    [-15, 79.9],
    [-12, 79.5],
    [-9, 79.2],
    [-7, 78.7],
    [-4, 78.9],
    [-2, 78.6],
    [0, 78.4],
  ] as const;
  return {
    records: [
      ...weights.map(([n, v]) => w(n, v)),
      {
        id: "demo-meal",
        type: "meal",
        localDate: today,
        precision: "date_only",
        at: null,
        createdAt: now,
        source: "manual_text",
        demo: true,
        meal: {
          title: "예시 · 비빔밥",
          mealType: "unknown",
          photoRefs: [],
          consumedFraction: null,
          note: "가상 예시 기록 · 실제 사진 분석 결과가 아니에요.",
          estimateAssumptions: ["가상 예시 수치"],
          items: [
            {
              id: "demo-food",
              name: "비빔밥",
              portionDescription: "예시 한 그릇",
              ingredients: [],
              included: true,
              kcal: { low: 500, high: 700, basis: "user_entered" },
            },
          ],
        },
      },
      inj(-5, "복부 왼쪽"),
      inj(-12, "복부 오른쪽"),
      inj(-19, "복부 왼쪽"),
      {
        id: "demo-m1",
        type: "measure",
        unit: "cm",
        waist: 92,
        hip: 104,
        chest: 101,
        thigh: null,
        localDate: d(-21),
        precision: "date_only",
        at: null,
        demo: true,
        createdAt: now,
        source: "manual_text",
      },
      {
        id: "demo-m2",
        type: "measure",
        unit: "cm",
        waist: 89.5,
        hip: 103,
        chest: 100,
        thigh: null,
        localDate: d(-2),
        precision: "date_only",
        at: null,
        demo: true,
        createdAt: now,
        source: "manual_text",
      },
      {
        id: "demo-mem1",
        type: "memory",
        note: "예시 · 강가를 30분 산책했어요. 바람이 시원했어요.",
        photo: null,
        localDate: d(-6),
        precision: "part_of_day",
        partOfDay: "evening",
        at: null,
        demo: true,
        createdAt: now,
        source: "manual_text",
      },
      {
        id: "demo-mem2",
        type: "memory",
        note: "예시 · 친구와 카페에서 오랜만에 이야기했어요.",
        photo: null,
        localDate: d(-13),
        precision: "date_only",
        at: null,
        demo: true,
        createdAt: now,
        source: "manual_text",
      },
      {
        id: "demo-c0",
        type: "condition",
        label: "편안해요",
        localDate: today,
        precision: "exact",
        at: instantFromLocal(today, "08:15", tz),
        demo: true,
        createdAt: now,
        source: "manual_text",
      },
    ],
    reminder: { id: "demo-r", at: instantFromLocal(d(2), "20:00", tz), demo: true },
    purchases: [
      {
        id: "demo-p1",
        localDate: d(-12),
        amount: 320000,
        currency: "KRW",
        doses: 4,
        medication: "마운자로",
        stockUnit: "single",
        addsStock: true,
        demo: true,
      },
    ],
    stockAdjust: 0,
    settings: {
      showMomo: true,
      timezone: tz,
      demoMode: true,
      stockAdjustments: {
        "demo-p1": { identity: JSON.stringify(["마운자로", "single", null]), delta: 1 },
      },
    },
  };
}

export type SyncStatus = "local" | "syncing" | "synced" | "error";
type Ctx = State & {
  storageBlocked: boolean;
  conflict: boolean;
  resolveConflict: (choice: "local" | "cloud") => void;
  importGuest: () => Promise<void>;
  resetDemo: () => void;
  undoFor: (before: State) => () => void;
  respondPrompt: (id: PromptId, day: string, record?: JournalRecord, contextId?: string) => void;
  saveMomoBatch: (records: JournalRecord[], purchases: Purchase[]) => void;
  retrySync: () => void;
  ready: boolean;
  user: { id: string; email: string | null } | null;
  sync: SyncStatus;
  tz: string;
  inventory: ReturnType<typeof inventory>;
  stockNeedsReview: boolean;
  stock: number;
  stockUnit: StockUnit;
  stockMedication: string | null;
  hasStock: boolean;
  hasDemo: boolean;
  saveRecord: (r: JournalRecord) => void;
  deleteRecord: (id: string) => JournalRecord | undefined;
  restoreRecord: (r: JournalRecord) => void;
  setReminder: (at: string | null) => void;
  savePurchase: (p: Purchase) => void;
  deletePurchase: (id: string) => void;
  setStock: (n: number, purchaseId: string) => void;
  confirmLegacyAdjustment: () => void;
  setSetting: <K extends keyof State["settings"]>(k: K, v: State["settings"][K]) => void;
  clearDemo: () => void;
  newId: () => string;
  /** Capture the whole journal so any change can be undone with restoreSnapshot. */
  snapshot: () => State;
  restoreSnapshot: (s: State) => void;
};
export type JournalSnapshot = State;

const JournalCtx = createContext<Ctx | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const empty = (): State => ({
    records: [],
    purchases: [],
    reminder: null,
    stockAdjust: 0,
    settings: { showMomo: true, timezone: DEFAULT_TZ },
  });
  const [state, setState] = useState<State>(empty);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [sync, setSync] = useState<SyncStatus>("local");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const invalidKeys = useRef(new Set<string>());
  const [conflict, setConflict] = useState(false);
  const conflictSource = useRef<"cloud" | "tab">("cloud");
  const remoteConflict = useRef<State | null>(null);
  const synced = useRef<State | null>(null);
  const latest = useRef(state);
  const owner = useRef<string | null>(null);
  const epoch = useRef(0);
  const remoteUnknown = useRef(false);
  const pushQueue = useRef<Promise<void>>(Promise.resolve());
  const [bump, setBump] = useState(0);
  const keyFor = (id: string | null) => (id ? `${KEY}.user.${id}` : KEY);
  const read = (key: string): State | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? validateSnapshot(JSON.parse(raw)) : null;
    } catch {
      invalidKeys.current.add(key);
      setStorageBlocked(true);
      return null;
    }
  };
  const commit = useCallback((change: (s: State) => State) => {
    const key = owner.current ? `${KEY}.user.${owner.current}` : KEY;
    if (invalidKeys.current.has(key)) throw new Error("invalid_local_snapshot");
    const next = change(latest.current);
    try {
      localStorage.setItem(
        owner.current ? `${KEY}.user.${owner.current}` : KEY,
        JSON.stringify(next),
      );
    } catch (error) {
      setSync("error");
      throw error;
    }
    latest.current = next;
    setState(next);
    setSync(owner.current ? "syncing" : "local");
  }, []);
  useEffect(() => {
    const switchUser = (u: { id: string; email?: string | undefined | null } | null) => {
      epoch.current += 1;
      owner.current = u?.id ?? null;
      setStorageBlocked(false);
      setMediaOwner(owner.current);
      clearPhotoCache();
      synced.current = null;
      remoteUnknown.current = false;
      remoteConflict.current = null;
      setConflict(false);
      const next = read(keyFor(owner.current)) ?? empty();
      latest.current = next;
      setState(next);
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      setSync(u ? "syncing" : "local");
      setReady(true);
    };
    const initialEpoch = epoch.current;
    supabase.auth.getUser().then(({ data }) => {
      if (epoch.current === initialEpoch) switchUser(data.user);
    });
    // Guest UI can initialize before the network; no account data is loaded into the guest namespace.
    const guest = read(KEY) ?? empty();
    latest.current = guest;
    setState(guest);
    setReady(true);
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") switchUser(null);
      else if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        session?.user.id !== owner.current
      )
        switchUser(session?.user ?? null);
    });
    return () => {
      epoch.current += 1;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !ready || synced.current || conflict || storageBlocked) return;
    const generation = epoch.current,
      id = user.id;
    let live = true;
    setSync("syncing");
    (async () => {
      try {
        const cloud = await loadCloud();
        if (!live || generation !== epoch.current || owner.current !== id) return;
        const local = latest.current;
        const base = read(`${keyFor(id)}.base`);
        if (
          cloud &&
          !sameSnapshot(local, base) &&
          read(keyFor(id)) &&
          !sameSnapshot(cloud, base) &&
          (local.records.length || local.purchases.length || local.reminder)
        ) {
          conflictSource.current = "cloud";
          remoteConflict.current = cloud;
          setConflict(true);
          setSync("error");
          return;
        }
        const target = !cloud ? local : base && !sameSnapshot(local, base) ? local : cloud;
        if (target === cloud) {
          localStorage.setItem(keyFor(id), JSON.stringify(target));
          localStorage.setItem(`${keyFor(id)}.base`, JSON.stringify(target));
          latest.current = target;
          setState(target);
          synced.current = target;
          setSync("synced");
        } else {
          synced.current = cloud ?? empty();
          setBump((n) => n + 1);
        }
      } catch {
        if (live && generation === epoch.current) {
          synced.current = null;
          setSync("error");
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [user, ready, bump, conflict, storageBlocked]);

  useEffect(() => {
    if (!user || !synced.current || synced.current === state || conflict || storageBlocked) return;
    const generation = epoch.current,
      id = user.id;
    let live = true;
    const timer = setTimeout(() => {
      pushQueue.current = pushQueue.current
        .catch(() => {})
        .then(async () => {
          if (!live || generation !== epoch.current || owner.current !== id) return;
          let prev = synced.current;
          if (!prev) return;
          setSync("syncing");
          try {
            if (remoteUnknown.current) {
              const actual = (await loadCloud()) ?? empty();
              if (generation !== epoch.current || owner.current !== id) return;
              remoteUnknown.current = false;
              if (!sameSnapshot(actual, prev)) {
                conflictSource.current = "cloud";
                remoteConflict.current = actual;
                setConflict(true);
                setSync("error");
                return;
              }
              prev = actual;
            }
            const replaced = await pushDiff(id, prev, state);
            // A successful stale write is still the remote baseline: the next diff must undo it if the entry was deleted meanwhile.
            if (generation !== epoch.current || owner.current !== id) return;
            const replacements = new Map(replaced.map((r) => [r.id, r]));
            const target = {
              ...state,
              records: state.records.map(
                (r) => (replacements.get(r.id) as JournalRecord | undefined) ?? r,
              ),
              purchases: state.purchases.map(
                (p) => (replacements.get(p.id) as Purchase | undefined) ?? p,
              ),
            };
            synced.current = target;
            localStorage.setItem(`${keyFor(id)}.base`, JSON.stringify(target));
            // Never overwrite an edit made while an upload was in flight.
            if (latest.current === state) {
              localStorage.setItem(keyFor(id), JSON.stringify(target));
              latest.current = target;
              setState(target);
              setSync("synced");
            } else {
              setSync("syncing");
              setBump((n) => n + 1);
            }
          } catch {
            if (generation === epoch.current) {
              remoteUnknown.current = true;
              if (live) setSync("error");
            }
          }
        });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [state, user, bump, conflict, storageBlocked]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== keyFor(owner.current) || !event.newValue) return;
      try {
        const incoming = validateSnapshot(JSON.parse(event.newValue));
        if (!sameSnapshot(incoming, latest.current)) {
          conflictSource.current = "tab";
          remoteConflict.current = incoming;
          setConflict(true);
          setSync("error");
        }
      } catch {
        /* do not import invalid external state */
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const stockInventory = useMemo(
    () => inventory(state.purchases, state.records, state.settings.stockAdjustments),
    [state.purchases, state.records, state.settings.stockAdjustments],
  );
  const stockNeedsReview = !!(
    stockInventory.unresolved.length ||
    stockInventory.unresolvedPurchases.length ||
    stockInventory.unresolvedAdjustments.length ||
    (state.stockAdjust !== 0 && !state.settings.legacyAdjustmentConfirmed)
  );
  const soleLot = stockInventory.lots.length === 1 ? stockInventory.lots[0] : undefined;

  const saveRecord = useCallback(
    (r: JournalRecord) =>
      commit((s) => {
        const record = !owner.current && s.settings.demoMode ? { ...r, demo: true } : r;
        return {
          ...s,
          records: s.records.some((x) => x.id === r.id)
            ? s.records.map((x) => (x.id === r.id ? record : x))
            : [...s.records, record],
        };
      }),
    [commit],
  );

  setLocale(state.settings.locale ?? "ko");
  const value: Ctx = {
    storageBlocked,
    conflict,
    resolveConflict: (choice) => {
      const remote = remoteConflict.current;
      if (!remote) return;
      const isCloud = conflictSource.current === "cloud";
      if (isCloud) synced.current = remote;
      remoteConflict.current = null;
      setConflict(false);
      if (choice === "cloud") {
        commit(() => remote);
        if (isCloud) setSync("synced");
      }
      setBump((n) => n + 1);
    },
    resetDemo: () => {
      if (!owner.current) commit(() => demoState());
    },
    importGuest: async () => {
      const guest = read(KEY),
        account = owner.current,
        generation = epoch.current;
      if (!guest || !account) return;
      const real = {
        ...guest,
        records: guest.records.filter((r) => !r.demo),
        purchases: guest.purchases.filter((p) => !p.demo),
      };
      if (!real.records.length && !real.purchases.length) return;
      const copied = await copyGuestMedia(real, account);
      if (generation !== epoch.current || owner.current !== account) return;
      commit((s) => ({
        ...s,
        records: [
          ...s.records,
          ...copied.records.filter((r) => !s.records.some((x) => x.id === r.id)),
        ],
        purchases: [
          ...s.purchases,
          ...copied.purchases.filter((p) => !s.purchases.some((x) => x.id === p.id)),
        ],
        stockAdjust: s.stockAdjust + (s.settings.guestImported ? 0 : copied.stockAdjust),
        settings: {
          ...s.settings,
          guestImported: true,
          stockAdjustments: { ...copied.settings.stockAdjustments, ...s.settings.stockAdjustments },
        },
      }));
    },
    undoFor: (before) => {
      const after = latest.current,
        generation = epoch.current;
      return () => {
        if (generation === epoch.current) commit((current) => undoDelta(before, after, current));
      };
    },
    respondPrompt: (id, day, record, contextId) => {
      const current = latest.current;
      const prompts = current.settings.prompts ?? {};
      if (record && !owner.current && current.settings.demoMode) record = { ...record, demo: true };
      const status: "answered" | "skipped" = record ? "answered" : "skipped";
      const next = {
        ...current,
        records: record
          ? [...current.records.filter((r) => r.id !== record.id), record]
          : current.records,
        settings: {
          ...current.settings,
          prompts: {
            ...prompts,
            [status]: { ...prompts[status], [id]: day },
            ...(contextId ? { context: { day, id: contextId, status } } : {}),
          },
        },
      };
      commit(() => next);
    },
    saveMomoBatch: (records, purchases) => {
      const current = latest.current;
      const next = {
        ...current,
        records: [
          ...current.records,
          ...records.filter((r) => !current.records.some((x) => x.id === r.id)),
        ],
        purchases: [
          ...current.purchases,
          ...purchases.filter((p) => !current.purchases.some((x) => x.id === p.id)),
        ],
      };
      commit(() => next);
    },
    retrySync: () => {
      if (owner.current) setBump((n) => n + 1);
      else {
        try {
          localStorage.setItem(KEY, JSON.stringify(latest.current));
          setSync("local");
        } catch {
          setSync("error");
        }
      }
    },
    ...state,
    ready,
    user,
    sync,
    tz: state.settings.timezone,
    inventory: stockInventory,
    stockNeedsReview,
    stock: soleLot?.balance ?? 0,
    stockUnit: soleLot?.unit ?? "dose",
    stockMedication: soleLot?.medication ?? null,
    hasStock: !!soleLot && !stockNeedsReview,
    hasDemo:
      state.records.some((r) => r.demo) ||
      state.purchases.some((p) => p.demo) ||
      !!state.reminder?.demo,
    saveRecord,
    deleteRecord: (id) => {
      const r = state.records.find((x) => x.id === id);
      commit((s) => ({ ...s, records: s.records.filter((x) => x.id !== id) }));
      return r;
    },
    restoreRecord: (r) => saveRecord(r),
    setReminder: (at) => commit((s) => ({ ...s, reminder: at ? { id: uid(), at } : null })),
    savePurchase: (purchase) =>
      commit((s) => {
        const p = !owner.current && s.settings.demoMode ? { ...purchase, demo: true } : purchase;
        return {
          ...s,
          purchases: s.purchases.some((x) => x.id === p.id)
            ? s.purchases.map((x) => (x.id === p.id ? p : x))
            : [...s.purchases, p],
        };
      }),
    deletePurchase: (id) =>
      commit((s) => ({ ...s, purchases: s.purchases.filter((p) => p.id !== id) })),
    setStock: (n, purchaseId) =>
      commit((s) => {
        const lot = inventory(s.purchases, s.records).lots.find((l) => l.id === purchaseId);
        if (!lot) return s;
        return {
          ...s,
          settings: {
            ...s.settings,
            stockAdjustments: {
              ...s.settings.stockAdjustments,
              [purchaseId]: { identity: lotIdentity(lot), delta: n - lot.balance },
            },
          },
        };
      }),
    confirmLegacyAdjustment: () =>
      commit((s) => ({ ...s, settings: { ...s.settings, legacyAdjustmentConfirmed: true } })),
    setSetting: (k, v) => commit((s) => ({ ...s, settings: { ...s.settings, [k]: v } })),
    clearDemo: () =>
      commit((s) => ({
        ...s,
        records: s.records.filter((r) => !r.demo),
        purchases: s.purchases.filter((p) => !p.demo),
        reminder: s.reminder?.demo ? null : s.reminder,
        settings: {
          ...s.settings,
          demoMode: false,
          stockAdjustments: Object.fromEntries(
            Object.entries(s.settings.stockAdjustments ?? {}).filter(
              ([id]) => !s.purchases.some((p) => p.id === id && p.demo),
            ),
          ),
        },
      })),
    newId: uid,
    snapshot: () => latest.current,
    restoreSnapshot: (s) => commit(() => validateSnapshot(s)),
  };
  return <JournalCtx.Provider value={value}>{children}</JournalCtx.Provider>;
}

export function useJournal() {
  const c = useContext(JournalCtx);
  if (!c) throw new Error("useJournal outside provider");
  return c;
}

/** Descending by recorded local day, then known instants. Untimed entries follow timed entries; creation order breaks their ties without inventing a time. */
export const sortByTime = (a: JournalRecord, b: JournalRecord) =>
  b.localDate.localeCompare(a.localDate) ||
  (b.precision === "exact" && b.at ? 1 : 0) - (a.precision === "exact" && a.at ? 1 : 0) ||
  (a.precision === "exact" && b.precision === "exact" && a.at && b.at
    ? b.at.localeCompare(a.at)
    : 0) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

export const latestRecord = <T extends JournalRecord["type"]>(rs: JournalRecord[], type: T) =>
  rs.filter((r): r is Extract<JournalRecord, { type: T }> => r.type === type).sort(sortByTime)[0];

export { localDateOf };
