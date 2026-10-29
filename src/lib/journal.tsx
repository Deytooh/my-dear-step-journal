import { inventory, lotIdentity } from "./inventory";
export { canDeduct } from "./inventory";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadCloud, pushDiff } from "./cloud-sync";
import { setLocale } from "./i18n";
import { addDays, DEFAULT_TZ, instantFromLocal, localDateOf, todayLocal } from "./dates";

// Journal store: works on-device when signed out; when signed in, mirrors every change to Lovable Cloud.
export type Precision = "exact" | "date_only" | "part_of_day" | "unknown";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export type Evidence = { method: "text" | "voice" | "photos" | "mixed"; text: string; photos: string[]; quote: string | null; proposed: Record<string, string>; confirmed: Record<string, string> };

type Base = {
  evidence?: Evidence;
  id: string; localDate: string; precision: Precision; at: string | null; partOfDay?: PartOfDay | null;
  demo?: boolean; createdAt: string; source: "manual_text";
};
export type WeightRec = Base & { type: "weight"; value: number; unit: "kg" };
export type InjectionRec = Base & { type: "injection"; medication: string | null; doseValue: number | null; doseUnit: string | null; site: string | null; usedStock: boolean; stockPurchaseId?: string | null; stockIdentity?: string | null };
export type ConditionRec = Base & { type: "condition"; label: string; note?: string };
export type MemoryRec = Base & { type: "memory"; note: string; photo?: string | null };
export type MeasureRec = Base & { type: "measure"; waist: number | null; hip: number | null; chest: number | null; thigh: number | null; unit: "cm" };
/** A momentary answer to "did you drink water?" — no volume is ever implied. */
export type WaterRec = Base & { type: "water"; answer: "yes" | "not_yet" };
export type JournalRecord = WeightRec | InjectionRec | ConditionRec | MemoryRec | MeasureRec | WaterRec;

export type Reminder = { id: string; at: string; demo?: boolean };
export type StockUnit = "pen" | "single" | "dose";
/** doses = quantity in stockUnit. addsStock false = expense only (never touches inventory). */
export type Purchase = { id: string; localDate: string; amount: number; currency: string; doses: number; medication: string | null; demo?: boolean;
  evidence?: Evidence; quantity?: number | null; stockUnit?: StockUnit | null; addsStock?: boolean; merchant?: string | null; product?: string | null };
export type PromptId = "feel" | "water" | "memory" | "weight";
export type PromptSettings = { hidden?: boolean; off?: PromptId[]; answered?: Partial<Record<PromptId, string>>; skipped?: Partial<Record<PromptId, string>>; done?: Partial<Record<PromptId, string>> };

/** A scalar is available only when there is exactly one confirmed lot. */
export function computeStock(purchases: Purchase[], records: JournalRecord[]) {
  const { lots, unresolved, unresolvedPurchases } = inventory(purchases, records);
  return lots.length === 1 && !unresolved.length && !unresolvedPurchases.length ? lots[0]!.balance : null;
}

type State = {
  records: JournalRecord[]; reminder: Reminder | null; purchases: Purchase[];
  stockAdjust: number; // manual adjustments to computed stock (in doses)
  settings: { showMomo: boolean; timezone: string; locale?: "ko" | "en" | "fr"; stockAdjustments?: Record<string, { identity: string; delta: number }>; legacyAdjustmentConfirmed?: boolean; prompts?: PromptSettings };
};

const KEY = "mds.journal.v1";
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function demoState(): State {
  const tz = DEFAULT_TZ;
  const today = todayLocal(tz);
  const now = new Date().toISOString();
  const d = (n: number) => addDays(today, n);
  const w = (n: number, v: number, time = "08:12"): WeightRec => ({
    id: `demo-w${n}`, type: "weight", value: v, unit: "kg", localDate: d(n), precision: "exact",
    at: instantFromLocal(d(n), time, tz), demo: true, createdAt: now, source: "manual_text",
  });
  const inj = (n: number, site: string): InjectionRec => ({
    id: `demo-i${n}`, type: "injection", medication: "마운자로", doseValue: 2.5, doseUnit: "mg", site, usedStock: true, stockPurchaseId: "demo-p1", stockIdentity: JSON.stringify(["마운자로", "single", null]),
    localDate: d(n), precision: "exact", at: instantFromLocal(d(n), "20:00", tz), demo: true, createdAt: now, source: "manual_text",
  });
  const weights = [[-27, 80.6], [-24, 80.5], [-21, 80.0], [-18, 79.9], [-15, 79.9], [-12, 79.5], [-9, 79.2], [-7, 78.7], [-4, 78.9], [-2, 78.6], [0, 78.4]] as const;
  return {
    records: [
      ...weights.map(([n, v]) => w(n, v)),
      inj(-5, "복부 왼쪽"), inj(-12, "복부 오른쪽"), inj(-19, "복부 왼쪽"),
      { id: "demo-m1", type: "measure", unit: "cm", waist: 92, hip: 104, chest: 101, thigh: null, localDate: d(-21), precision: "date_only", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-m2", type: "measure", unit: "cm", waist: 89.5, hip: 103, chest: 100, thigh: null, localDate: d(-2), precision: "date_only", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-mem1", type: "memory", note: "예시 · 강가를 30분 산책했어요. 바람이 시원했어요.", photo: null, localDate: d(-6), precision: "part_of_day", partOfDay: "evening", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-mem2", type: "memory", note: "예시 · 친구와 카페에서 오랜만에 이야기했어요.", photo: null, localDate: d(-13), precision: "date_only", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-c0", type: "condition", label: "편안해요", localDate: today, precision: "exact", at: instantFromLocal(today, "08:15", tz), demo: true, createdAt: now, source: "manual_text" },
    ],
    reminder: { id: "demo-r", at: instantFromLocal(d(2), "20:00", tz), demo: true },
    purchases: [{ id: "demo-p1", localDate: d(-12), amount: 320000, currency: "KRW", doses: 4, medication: "마운자로", stockUnit: "single", addsStock: true, demo: true }],
    stockAdjust: 0,
    settings: { showMomo: true, timezone: tz, stockAdjustments: { "demo-p1": { identity: JSON.stringify(["마운자로", "single", null]), delta: 1 } } },
  };
}

export type SyncStatus = "local" | "syncing" | "synced" | "error";
type Ctx = State & {
  respondPrompt: (id: PromptId, day: string, record?: JournalRecord) => void;
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
  const [state, setState] = useState<State>(() => demoState());
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [sync, setSync] = useState<SyncStatus>("local");
  const pendingMomo = useRef(new Set<string>());
  const synced = useRef<State | null>(null); // last state known to be in the cloud
  const pushing = useRef(false);
  const latest = useRef(state); latest.current = state;
  const [loadRetry, setLoadRetry] = useState(0);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
    supabase.auth.getUser().then(({ data }) => data.user && setUser({ id: data.user.id, email: data.user.email ?? null }));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { pendingMomo.current.clear(); setUser(null); synced.current = null; setSync("local"); setState(demoState()); return; }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const u = session?.user; if (u) setUser((p) => (p?.id === u.id ? p : { id: u.id, email: u.email ?? null }));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(state)); }, [state, ready]);

  // On sign-in: load the account's journal; a new account receives this device's records.
  useEffect(() => {
    if (!user || !ready) return;
    let live = true;
    setSync("syncing");
    (async () => {
      try {
        const cloud = await loadCloud();
        if (!live) return;
        if (cloud) {
          const local = latest.current;
          const merged = { ...cloud, records: [...cloud.records.filter((r) => !pendingMomo.current.has(r.id)), ...local.records.filter((r) => pendingMomo.current.has(r.id))], purchases: [...cloud.purchases.filter((p) => !pendingMomo.current.has(p.id)), ...local.purchases.filter((p) => pendingMomo.current.has(p.id))] };
          synced.current = cloud;
          setState(merged);
          if (pendingMomo.current.size) await pushDiff(user.id, cloud, merged);
          if (!live) return;
          synced.current = merged;
        }
        else {
          const local = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null ?? demoState();
          const empty: State = { records: [], purchases: [], reminder: null, stockAdjust: 0, settings: local.settings };
          await pushDiff(user.id, empty, local);
          synced.current = local; setState(local);
        }
        setSync("synced");
      } catch (e) { console.error(e); if (live) setSync("error"); }
    })();
    return () => { live = false; };
  }, [user, ready, loadRetry]);

  // Push every later change to the cloud (debounced).
  useEffect(() => {
    if (!user || !synced.current || synced.current === state || pushing.current) return;
    const tm = setTimeout(async () => {
      const prev = synced.current; if (!prev) return;
      pushing.current = true; setSync("syncing");
      const target = state;
      try {
        const replaced = await pushDiff(user.id, prev, target);
        let next = target;
        if (replaced.length) {
          const m = new Map(replaced.map((r) => [r.id, r]));
          next = { ...target, records: target.records.map((r) => m.get(r.id) ?? r) };
        }
        synced.current = next;
        if (next !== target) setState((s) => (s === target ? next : s));
        setSync("synced");
      } catch (e) { console.error(e); setSync("error"); }
      finally { pushing.current = false; if (latest.current !== target) setBump((b) => b + 1); }
    }, 600);
    return () => clearTimeout(tm);
  }, [state, user, bump]);

  const stockInventory = useMemo(() => inventory(state.purchases, state.records, state.settings.stockAdjustments), [state.purchases, state.records, state.settings.stockAdjustments]);
  const stockNeedsReview = !!(stockInventory.unresolved.length || stockInventory.unresolvedPurchases.length || stockInventory.unresolvedAdjustments.length || (state.stockAdjust !== 0 && !state.settings.legacyAdjustmentConfirmed));
  const soleLot = stockInventory.lots.length === 1 ? stockInventory.lots[0] : undefined;

  const saveRecord = useCallback((r: JournalRecord) => setState((s) => {
    const exists = s.records.some((x) => x.id === r.id);
    return { ...s, records: exists ? s.records.map((x) => (x.id === r.id ? r : x)) : [...s.records, r] };
  }), []);

  setLocale(state.settings.locale ?? "ko");
  const value: Ctx = {
    respondPrompt: (id, day, record) => {
      const current = latest.current;
      const prompts = current.settings.prompts ?? {};
      const status = record ? "answered" : "skipped";
      const next = { ...current, records: record ? [...current.records.filter((r) => r.id !== record.id), record] : current.records, settings: { ...current.settings, prompts: { ...prompts, [status]: { ...prompts[status], [id]: day } } } };
      localStorage.setItem(KEY, JSON.stringify(next));
      latest.current = next; setState(next);
    },
    saveMomoBatch: (records, purchases) => {
      const current = latest.current;
      const next = { ...current, records: [...current.records, ...records.filter((r) => !current.records.some((x) => x.id === r.id))], purchases: [...current.purchases, ...purchases.filter((p) => !current.purchases.some((x) => x.id === p.id))] };
      localStorage.setItem(KEY, JSON.stringify(next)); // fail before updating UI; caller retains drafts
      for (const entry of [...records, ...purchases]) pendingMomo.current.add(entry.id);
      latest.current = next;
      setState(next);
      if (user) setSync("syncing");
    },
    retrySync: () => { if (!synced.current) setLoadRetry((n) => n + 1); else setBump((b) => b + 1); },
    ...state, ready, user, sync, tz: state.settings.timezone,
    inventory: stockInventory, stockNeedsReview,
    stock: soleLot?.balance ?? 0,
    stockUnit: soleLot?.unit ?? "dose", stockMedication: soleLot?.medication ?? null, hasStock: !!soleLot && !stockNeedsReview,
    hasDemo: state.records.some((r) => r.demo) || state.purchases.some((p) => p.demo) || !!state.reminder?.demo,
    saveRecord,
    deleteRecord: (id) => {
      const r = state.records.find((x) => x.id === id);
      setState((s) => ({ ...s, records: s.records.filter((x) => x.id !== id) }));
      return r;
    },
    restoreRecord: (r) => saveRecord(r),
    setReminder: (at) => setState((s) => ({ ...s, reminder: at ? { id: uid(), at } : null })),
    savePurchase: (p) => setState((s) => ({ ...s, purchases: s.purchases.some((x) => x.id === p.id) ? s.purchases.map((x) => (x.id === p.id ? p : x)) : [...s.purchases, p] })),
    deletePurchase: (id) => setState((s) => ({ ...s, purchases: s.purchases.filter((p) => p.id !== id) })),
    setStock: (n, purchaseId) => setState((s) => {
      const lot = inventory(s.purchases, s.records).lots.find((l) => l.id === purchaseId);
      if (!lot) return s;
      return { ...s, settings: { ...s.settings, stockAdjustments: { ...s.settings.stockAdjustments, [purchaseId]: { identity: lotIdentity(lot), delta: n - lot.balance } } } };
    }),
    confirmLegacyAdjustment: () => setState((s) => ({ ...s, settings: { ...s.settings, legacyAdjustmentConfirmed: true } })),
    setSetting: (k, v) => setState((s) => ({ ...s, settings: { ...s.settings, [k]: v } })),
    clearDemo: () => setState((s) => ({
      ...s, records: s.records.filter((r) => !r.demo), purchases: s.purchases.filter((p) => !p.demo),
      reminder: s.reminder?.demo ? null : s.reminder,
      settings: { ...s.settings, stockAdjustments: Object.fromEntries(Object.entries(s.settings.stockAdjustments ?? {}).filter(([id]) => !s.purchases.some((p) => p.id === id && p.demo))) },
    })),
    newId: uid,
    snapshot: () => state,
    restoreSnapshot: (s) => setState(s),
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
  ((b.precision === "exact" && b.at ? 1 : 0) - (a.precision === "exact" && a.at ? 1 : 0)) ||
  (a.precision === "exact" && b.precision === "exact" && a.at && b.at ? b.at.localeCompare(a.at) : 0) ||
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export const latestRecord = <T extends JournalRecord["type"]>(rs: JournalRecord[], type: T) =>
  rs.filter((r): r is Extract<JournalRecord, { type: T }> => r.type === type).sort(sortByTime)[0];

export { localDateOf };
