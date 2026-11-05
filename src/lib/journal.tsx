import { copyGuestMedia, setMediaOwner } from "./media";
import type { MealDetails } from "./meals";
import { validateSnapshot } from "./snapshot";
import { planBackupImport } from "./backup-import";
import { sameConfirmedEntry, sameSnapshot, undoDelta } from "./journal-safety";
import { clearPhotoCache } from "./cloud-sync";
import { inventory, lotIdentity } from "./inventory";
export { canDeduct } from "./inventory";
import {
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

// Storage stays behind the stable journal context: local first, with account changes mirrored to Lovable Cloud.
export type Precision = "exact" | "date_only" | "part_of_day" | "unknown";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export type Evidence = {
  /** All original photos stay in photos; only these indices support this item. */
  attribution?: { status: "linked" | "unclear"; linkedPhotoIndices: number[] };
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
export type TrackingInterest = "injection" | "weight" | "condition" | "meal" | "memory";
export type OnboardingState = {
  status: "completed" | "skipped";
  dismissedHints?: ("manual" | "momo")[];
};
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
    trackingInterests?: TrackingInterest[];
    onboarding?: OnboardingState;
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

function demoState(preferences: State["settings"]): State {
  const tz = preferences.timezone;
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
  const weights = Array.from(
    { length: 30 },
    (_, index) =>
      [
        index - 29,
        Math.round((80.6 - index * 0.075 + Math.sin(index * 1.7) * 0.15) * 10) / 10,
      ] as const,
  );
  return {
    records: [
      ...weights.map(([n, v]) => w(n, v)),
      ...weights.flatMap(([n], index): JournalRecord[] => [
        {
          id: `demo-feeling-${n}`,
          type: "condition",
          label: ["편안해요", "괜찮아요", "피곤해요"][index % 3] ?? "편안해요",
          localDate: d(n),
          precision: "date_only",
          at: null,
          demo: true,
          createdAt: now,
          source: "manual_text",
        },
        {
          id: `demo-water-${n}`,
          type: "water",
          answer: index % 5 === 0 ? "not_yet" : "yes",
          localDate: d(n),
          precision: "date_only",
          at: null,
          demo: true,
          createdAt: now,
          source: "manual_text",
        },
      ]),
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
      inj(-26, "허벅지 오른쪽"),
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
        localDate: d(-29),
        amount: 320000,
        currency: "KRW",
        doses: 6,
        medication: "마운자로",
        stockUnit: "single",
        addsStock: true,
        demo: true,
      },
    ],
    stockAdjust: 0,
    settings: {
      // Reset fictional activity, not the person's interface or consent choices.
      showMomo: preferences.showMomo,
      timezone: tz,
      ...(preferences.locale ? { locale: preferences.locale } : {}),
      ...(preferences.onboarding ? { onboarding: preferences.onboarding } : {}),
      ...(preferences.trackingInterests
        ? { trackingInterests: preferences.trackingInterests }
        : {}),
      ...(preferences.prompts
        ? {
            prompts: {
              ...(preferences.prompts.aiConsent !== undefined
                ? { aiConsent: preferences.prompts.aiConsent }
                : {}),
              ...(preferences.prompts.hidden !== undefined
                ? { hidden: preferences.prompts.hidden }
                : {}),
              ...(preferences.prompts.off ? { off: preferences.prompts.off } : {}),
            },
          }
        : {}),
      demoMode: true,
      stockAdjustments: {},
    },
  };
}

export type SyncStatus = "local" | "syncing" | "synced" | "error";
export type JournalContextValue = State & {
  storageBlocked: boolean;
  storageRecovery: { key: string; source: "journal" | "baseline" } | null;
  conflict: boolean;
  baselineConflict: boolean;
  resolveConflict: (choice: "local" | "cloud") => void;
  importGuest: () => Promise<void>;
  resetDemo: () => void;
  addDemo: () => void;
  undoFor: (before: State) => () => void;
  respondPrompt: (id: PromptId, day: string, record?: JournalRecord, contextId?: string) => void;
  saveMomoBatch: (
    records: JournalRecord[],
    purchases: Purchase[],
    expectedOwner?: string | null,
  ) => void;
  retrySync: () => void;
  ready: boolean;
  introductionPending: boolean;
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
  /** A captured context stays valid only while its ownership session is current. */
  isCurrentOwner: () => boolean;
  restoreSnapshot: (s: State) => void;
};
export type JournalSnapshot = State;

// Context identity must survive edits to this provider module.
import { JournalCtx } from "./journal-context";

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
  const [introductionPending, setIntroductionPending] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [sync, setSync] = useState<SyncStatus>("local");
  const [storageRecovery, setStorageRecovery] =
    useState<JournalContextValue["storageRecovery"]>(null);
  const storageBlocked = storageRecovery !== null;
  const invalidKeys = useRef(new Set<string>());
  const orphanBaseKey = useRef<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const conflictSource = useRef<"cloud" | "tab" | "baseline">("cloud");
  const remoteConflict = useRef<State | null>(null);
  const synced = useRef<State | null>(null);
  const latest = useRef(state);
  const owner = useRef<string | null>(null);
  const accountLocale = useRef<{
    owner: string;
    locale: NonNullable<State["settings"]["locale"]>;
  } | null>(null);
  const epoch = useRef(0);
  const remoteUnknown = useRef(false);
  const pushQueue = useRef<Promise<void>>(Promise.resolve());
  const [bump, setBump] = useState(0);
  const keyFor = (id: string | null) => (id ? `${KEY}.user.${id}` : KEY);
  const read = (key: string): State | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : validateSnapshot(JSON.parse(raw));
    } catch {
      invalidKeys.current.add(key);
      setStorageRecovery({ key, source: key.endsWith(".base") ? "baseline" : "journal" });
      return null;
    }
  };
  const retireOrphanBase = useCallback(() => {
    if (!orphanBaseKey.current) return;
    // A baseline contains only acknowledged cloud data, never unsynced edits.
    // Without its local snapshot it cannot establish any intended deletions.
    localStorage.removeItem(orphanBaseKey.current);
    orphanBaseKey.current = null;
  }, []);
  const commit = useCallback(
    (change: (s: State) => State, cloudBase?: State) => {
      const key = owner.current ? `${KEY}.user.${owner.current}` : KEY;
      if (invalidKeys.current.has(key)) throw new Error("invalid_local_snapshot");
      const next = change(latest.current);
      try {
        retireOrphanBase();
        localStorage.setItem(key, JSON.stringify(next));
        // Save the chosen snapshot first: a failed baseline write must never make
        // an older local snapshot look like a new edit against the accepted cloud.
        if (cloudBase) localStorage.setItem(`${key}.base`, JSON.stringify(cloudBase));
      } catch (error) {
        setSync("error");
        throw error;
      }
      latest.current = next;
      setState(next);
      if (next.settings.onboarding || next.records.length || next.purchases.length || next.reminder)
        setIntroductionPending(false);
      setSync(owner.current ? "syncing" : "local");
    },
    [retireOrphanBase],
  );
  useEffect(() => {
    const switchUser = (u: { id: string; email?: string | undefined | null } | null) => {
      const guestLocale = owner.current === null ? latest.current.settings.locale : undefined;
      // Confirming the initial guest is handled separately. Every actual auth
      // transition, including sign-out, invalidates the earlier ownership epoch.
      epoch.current += 1;
      owner.current = u?.id ?? null;
      setStorageRecovery(null);
      setMediaOwner(owner.current);
      clearPhotoCache();
      synced.current = null;
      remoteUnknown.current = false;
      remoteConflict.current = null;
      setConflict(false);
      const stored = read(keyFor(owner.current));
      orphanBaseKey.current =
        u && !stored && !invalidKeys.current.has(keyFor(u.id)) ? `${keyFor(u.id)}.base` : null;
      const next = stored ?? empty();
      // Carry only an explicit guest interface language; never journal data, consent or account-to-account preferences.
      accountLocale.current =
        !stored && u && guestLocale ? { owner: u.id, locale: guestLocale } : null;
      if (accountLocale.current)
        next.settings = { ...next.settings, locale: accountLocale.current.locale };
      // Only a genuinely new guest sees the automatic introduction. Existing accounts
      // and existing guest snapshots (including empty ones) keep their current experience.
      setIntroductionPending(!u && !stored && !invalidKeys.current.has(KEY));
      latest.current = next;
      setState(next);
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      setSync(u ? "syncing" : "local");
      setReady(true);
    };
    // Guest UI can initialize before the network; no account data is loaded into the guest namespace.
    const storedGuest = read(KEY);
    const guest = storedGuest ?? empty();
    setMediaOwner(null);
    clearPhotoCache();
    latest.current = guest;
    setState(guest);
    setReady(true);
    const initialEpoch = epoch.current;
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (epoch.current !== initialEpoch) return;
        if (error && error.name !== "AuthSessionMissingError") return;
        if (data.user) {
          switchUser(data.user);
          return;
        }
        // Confirming the guest is not an account transition: keep in-progress
        // work, storage errors and conflict state instead of reloading a snapshot.
        const current = latest.current;
        setIntroductionPending(
          !storedGuest &&
            // Any successful guest action since boot may have created even an
            // empty snapshot (for example Save, then Undo). Do not restart it.
            localStorage.getItem(KEY) === null &&
            !invalidKeys.current.has(KEY) &&
            !current.settings.onboarding &&
            !current.records.length &&
            !current.purchases.length &&
            !current.reminder,
        );
      })
      .catch(() => {
        // An unavailable auth service must not interrupt local work or pretend
        // an unknown signed-in account is a confirmed first-time guest.
      });
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
        retireOrphanBase();
        const cloud = await loadCloud();
        if (!live || generation !== epoch.current || owner.current !== id) return;
        const local = latest.current;
        const localKey = keyFor(id);
        const stored = read(localKey);
        // A read may fail after sign-in while the cloud request is pending.
        // Never replace that primary snapshot with a cloud response.
        if (invalidKeys.current.has(localKey)) {
          setStorageRecovery({ key: localKey, source: "journal" });
          setSync("error");
          return;
        }
        const baseKey = `${localKey}.base`;
        const base = read(baseKey);
        // A retry can establish that an inaccessible baseline is valid again.
        // Missing previously damaged metadata still cannot prove deletion intent.
        if (base) invalidKeys.current.delete(baseKey);
        if (invalidKeys.current.has(baseKey)) {
          setStorageRecovery({ key: baseKey, source: "baseline" });
          conflictSource.current = "baseline";
          remoteConflict.current = cloud ?? empty();
          setConflict(true);
          setSync("error");
          return;
        }
        if (
          cloud &&
          !sameSnapshot(local, base) &&
          stored &&
          !sameSnapshot(cloud, base) &&
          !sameSnapshot(local, cloud) &&
          (base || local.records.length || local.purchases.length || local.reminder)
        ) {
          conflictSource.current = "cloud";
          remoteConflict.current = cloud;
          setConflict(true);
          setSync("error");
          return;
        }
        // A leftover baseline alone is not a saved offline deletion. Re-read
        // after loading so edits committed while the request ran still count.
        const target = !cloud
          ? local
          : stored && base && !sameSnapshot(local, base)
            ? local
            : cloud;
        if (target === cloud) {
          const preference = accountLocale.current;
          const locale =
            preference?.owner === id ? (local.settings.locale ?? preference.locale) : undefined;
          const received =
            locale && !target.settings.locale
              ? { ...target, settings: { ...target.settings, locale } }
              : target;
          localStorage.setItem(keyFor(id), JSON.stringify(received));
          localStorage.setItem(`${keyFor(id)}.base`, JSON.stringify(target));
          latest.current = received;
          setState(received);
          synced.current = target;
          accountLocale.current = null;
          setSync(received === target ? "synced" : "syncing");
        } else {
          synced.current = cloud ?? empty();
          accountLocale.current = null;
          setBump((n) => n + 1);
        }
      } catch {
        if (live && generation === epoch.current) {
          synced.current = null;
          const baseKey = `${keyFor(id)}.base`;
          if (invalidKeys.current.has(baseKey))
            setStorageRecovery((current) => current ?? { key: baseKey, source: "baseline" });
          setSync("error");
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [user, ready, bump, conflict, storageBlocked, retireOrphanBase]);

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
          // A new version can replace an already-open conflict, so its source
          // must render even when both booleans above were already unchanged.
          setBump((n) => n + 1);
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

  // Public actions belong to the ownership session that rendered their control.
  // Auth callbacks invalidate it synchronously, before React replaces the UI.
  const renderEpoch = epoch.current;
  const assertCurrentOwner = useCallback(() => {
    if (renderEpoch !== epoch.current) throw new Error("journal_owner_changed");
  }, [renderEpoch]);
  const commitForOwner = useCallback(
    (change: (s: State) => State, cloudBase?: State) => {
      assertCurrentOwner();
      commit(change, cloudBase);
    },
    [assertCurrentOwner, commit],
  );

  const saveRecord = useCallback(
    (r: JournalRecord) =>
      commitForOwner((s) => {
        const record = !owner.current && s.settings.demoMode ? { ...r, demo: true } : r;
        return {
          ...s,
          records: s.records.some((x) => x.id === r.id)
            ? s.records.map((x) => (x.id === r.id ? record : x))
            : [...s.records, record],
        };
      }),
    [commitForOwner],
  );

  setLocale(state.settings.locale ?? "ko");
  const value: JournalContextValue = {
    storageBlocked,
    storageRecovery,
    conflict,
    baselineConflict: conflict && conflictSource.current === "baseline",
    resolveConflict: (choice) => {
      assertCurrentOwner();
      const remote = remoteConflict.current;
      if (!remote) return;
      const isCloud = conflictSource.current !== "tab";
      const isBaselineRecovery = conflictSource.current === "baseline";
      try {
        // Even keeping this tab needs a write: another tab has already replaced
        // its on-disk snapshot. Keep both choices available until persistence succeeds.
        commitForOwner(
          (current) => (choice === "cloud" ? remote : current),
          isCloud ? remote : undefined,
        );
      } catch {
        setSync("error");
        return;
      }
      if (isCloud) synced.current = remote;
      if (isBaselineRecovery) {
        const baseKey = `${keyFor(owner.current)}.base`;
        invalidKeys.current.delete(baseKey);
        setStorageRecovery((current) => (current?.key === baseKey ? null : current));
      }
      remoteConflict.current = null;
      setConflict(false);
      if (isCloud && choice === "cloud") setSync("synced");
      setBump((n) => n + 1);
    },
    resetDemo: () => {
      assertCurrentOwner();
      if (!owner.current) commitForOwner((current) => demoState(current.settings));
    },
    addDemo: () =>
      commitForOwner((current) => {
        const examples = demoState(current.settings);
        const realRecords = current.records.filter((record) => !record.demo);
        const realPurchases = current.purchases.filter((purchase) => !purchase.demo);
        const realReminder = current.reminder?.demo ? null : current.reminder;
        return {
          ...current,
          records: [...realRecords, ...examples.records],
          purchases: [...realPurchases, ...examples.purchases],
          reminder: realReminder ?? examples.reminder,
          settings: {
            ...current.settings,
            demoMode:
              !owner.current && !realRecords.length && !realPurchases.length && !realReminder,
            stockAdjustments: Object.fromEntries(
              Object.entries(current.settings.stockAdjustments ?? {}).filter(
                ([id]) =>
                  !current.purchases.some((purchase) => purchase.id === id && purchase.demo),
              ),
            ),
          },
        };
      }),
    importGuest: async () => {
      assertCurrentOwner();
      const account = owner.current,
        generation = epoch.current;
      if (!account) return;
      // Import errors belong to the guest source, not the active account. Keep
      // its recovery state intact and reject so the import control reports failure.
      const raw = localStorage.getItem(KEY);
      if (raw === null) return;
      const guest = validateSnapshot(JSON.parse(raw));
      const demoLotIds = new Set(guest.purchases.filter((p) => p.demo).map((p) => p.id));
      const real = {
        ...guest,
        records: guest.records.filter((r) => !r.demo),
        purchases: guest.purchases.filter((p) => !p.demo),
        settings: {
          ...guest.settings,
          stockAdjustments: Object.fromEntries(
            Object.entries(guest.settings.stockAdjustments ?? {}).filter(
              ([id]) => !demoLotIds.has(id),
            ),
          ),
        },
      };
      // Refuse ambiguous stock before copying media, including orphan corrections
      // and legacy scalars whose meaning cannot be carried into another journal.
      if (planBackupImport(latest.current, real).status === "stock-conflict")
        throw new Error("guest_stock_conflict");
      if (!real.records.length && !real.purchases.length) return;
      const copied = await copyGuestMedia(real, account);
      if (generation !== epoch.current || owner.current !== account) return;
      commitForOwner((s) => {
        // Account edits may have happened while media was being copied. Replan
        // against the latest state so a new correction or ID is never overwritten.
        const plan = planBackupImport(s, copied);
        if (plan.status === "stock-conflict") throw new Error("guest_stock_conflict");
        return validateSnapshot({
          ...plan.snapshot,
          settings: { ...plan.snapshot.settings, guestImported: true },
        });
      });
    },
    undoFor: (before) => {
      assertCurrentOwner();
      const after = latest.current,
        generation = epoch.current;
      return () => {
        if (generation === epoch.current)
          commitForOwner((current) => undoDelta(before, after, current));
      };
    },
    respondPrompt: (id, day, record, contextId) => {
      assertCurrentOwner();
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
      commitForOwner(() => next);
    },
    saveMomoBatch: (records, purchases, expectedOwner) => {
      if (expectedOwner !== undefined && expectedOwner !== owner.current)
        throw new Error("momo_owner_changed");
      assertCurrentOwner();
      const current = latest.current;
      // Stable IDs make retries idempotent, not permission to drop a correction
      // or overwrite a later edit. Check the whole batch before any local write.
      for (const [incoming, existing] of [
        [records, current.records],
        [purchases, current.purchases],
      ] as const)
        for (const entry of incoming) {
          const saved = existing.find((row) => row.id === entry.id);
          if (saved && !sameConfirmedEntry(saved, entry))
            throw new Error("momo_existing_entry_changed");
        }
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
      commitForOwner(() => next);
    },
    retrySync: () => {
      assertCurrentOwner();
      if (invalidKeys.current.has(keyFor(owner.current))) return;
      if (owner.current) {
        if (storageRecovery?.source === "baseline") {
          // Keep the recovery choices available unless this metadata can be
          // validated again. Preserve unrelated tab conflicts as well.
          if (conflict && conflictSource.current !== "baseline") return;
          const recovered = read(storageRecovery.key);
          if (!recovered && conflict) {
            setSync("error");
            return;
          }
          if (recovered) invalidKeys.current.delete(storageRecovery.key);
          synced.current = null;
          remoteConflict.current = null;
          setConflict(false);
          setStorageRecovery(null);
        }
        setBump((n) => n + 1);
      } else {
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
    introductionPending,
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
      assertCurrentOwner();
      const r = state.records.find((x) => x.id === id);
      commitForOwner((s) => ({ ...s, records: s.records.filter((x) => x.id !== id) }));
      return r;
    },
    restoreRecord: (r) => saveRecord(r),
    setReminder: (at) =>
      commitForOwner((s) => ({
        ...s,
        reminder: at
          ? { id: uid(), at, ...(!owner.current && s.settings.demoMode ? { demo: true } : {}) }
          : null,
      })),
    savePurchase: (purchase) =>
      commitForOwner((s) => {
        const p = !owner.current && s.settings.demoMode ? { ...purchase, demo: true } : purchase;
        return {
          ...s,
          purchases: s.purchases.some((x) => x.id === p.id)
            ? s.purchases.map((x) => (x.id === p.id ? p : x))
            : [...s.purchases, p],
        };
      }),
    deletePurchase: (id) =>
      commitForOwner((s) => ({
        ...s,
        purchases: s.purchases.filter((p) => p.id !== id),
        settings: s.settings.stockAdjustments?.[id]
          ? {
              ...s.settings,
              stockAdjustments: Object.fromEntries(
                Object.entries(s.settings.stockAdjustments).filter(([lotId]) => lotId !== id),
              ),
            }
          : s.settings,
      })),
    setStock: (n, purchaseId) =>
      commitForOwner((s) => {
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
      commitForOwner((s) => ({
        ...s,
        settings: { ...s.settings, legacyAdjustmentConfirmed: true },
      })),
    setSetting: (k, v) => commitForOwner((s) => ({ ...s, settings: { ...s.settings, [k]: v } })),
    clearDemo: () =>
      commitForOwner((s) => ({
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
    snapshot: () => {
      assertCurrentOwner();
      return latest.current;
    },
    isCurrentOwner: () => renderEpoch === epoch.current,
    restoreSnapshot: (s) => {
      // Auth changes update the epoch before React renders. An asynchronous
      // restore captured by an earlier session must not write into the new one.
      assertCurrentOwner();
      commitForOwner(() => validateSnapshot(s));
    },
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

export const latestRecord = <T extends JournalRecord["type"]>(rs: JournalRecord[], type: T) => {
  let latest: Extract<JournalRecord, { type: T }> | undefined;
  for (const record of rs) {
    if (record.type === type && (!latest || sortByTime(record, latest) < 0))
      latest = record as Extract<JournalRecord, { type: T }>;
  }
  return latest;
};

export { localDateOf };
