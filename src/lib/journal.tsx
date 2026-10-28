import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setLocale } from "./i18n";
import { addDays, DEFAULT_TZ, instantFromLocal, localDateOf, todayLocal } from "./dates";

// Phase 1 local store (browser only). Will be replaced by Lovable Cloud persistence in Phase 3.
export type Precision = "exact" | "date_only" | "part_of_day" | "unknown";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

type Base = {
  id: string; localDate: string; precision: Precision; at: string | null; partOfDay?: PartOfDay | null;
  demo?: boolean; createdAt: string; source: "manual_text";
};
export type WeightRec = Base & { type: "weight"; value: number; unit: "kg" };
export type InjectionRec = Base & { type: "injection"; medication: string | null; doseValue: number | null; doseUnit: string | null; site: string | null; usedStock: boolean };
export type ConditionRec = Base & { type: "condition"; label: string; note?: string };
export type MemoryRec = Base & { type: "memory"; note: string; photo?: string | null };
export type MeasureRec = Base & { type: "measure"; waist: number | null; hip: number | null; chest: number | null; thigh: number | null; unit: "cm" };
export type JournalRecord = WeightRec | InjectionRec | ConditionRec | MemoryRec | MeasureRec;

export type Reminder = { id: string; at: string; demo?: boolean };
export type Purchase = { id: string; localDate: string; amount: number; currency: "KRW"; doses: number; medication: string | null; demo?: boolean };

type State = {
  records: JournalRecord[]; reminder: Reminder | null; purchases: Purchase[];
  stockAdjust: number; // manual adjustments to computed stock (in doses)
  settings: { showMomo: boolean; timezone: string; locale?: "ko" | "en" | "fr" };
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
    id: `demo-i${n}`, type: "injection", medication: "마운자로", doseValue: 2.5, doseUnit: "mg", site, usedStock: true,
    localDate: d(n), precision: "exact", at: instantFromLocal(d(n), "20:00", tz), demo: true, createdAt: now, source: "manual_text",
  });
  const weights = [[-27, 80.6], [-24, 80.5], [-21, 80.0], [-18, 79.9], [-15, 79.9], [-12, 79.5], [-9, 79.2], [-7, 78.7], [-4, 78.9], [-2, 78.6], [0, 78.4]] as const;
  return {
    records: [
      ...weights.map(([n, v]) => w(n, v)),
      inj(-5, "복부 왼쪽"), inj(-12, "복부 오른쪽"), inj(-19, "복부 왼쪽"),
      { id: "demo-m1", type: "measure", unit: "cm", waist: 92, hip: 104, chest: 101, thigh: null, localDate: d(-21), precision: "date_only", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-m2", type: "measure", unit: "cm", waist: 89.5, hip: 103, chest: 100, thigh: null, localDate: d(-2), precision: "date_only", at: null, demo: true, createdAt: now, source: "manual_text" },
      { id: "demo-c0", type: "condition", label: "편안해요", localDate: today, precision: "exact", at: instantFromLocal(today, "08:15", tz), demo: true, createdAt: now, source: "manual_text" },
    ],
    reminder: { id: "demo-r", at: instantFromLocal(d(2), "20:00", tz), demo: true },
    purchases: [{ id: "demo-p1", localDate: d(-12), amount: 320000, currency: "KRW", doses: 4, medication: "마운자로", demo: true }],
    stockAdjust: 1,
    settings: { showMomo: true, timezone: tz },
  };
}

type Ctx = State & {
  ready: boolean;
  tz: string;
  stock: number;
  hasDemo: boolean;
  saveRecord: (r: JournalRecord) => void;
  deleteRecord: (id: string) => JournalRecord | undefined;
  restoreRecord: (r: JournalRecord) => void;
  setReminder: (at: string | null) => void;
  savePurchase: (p: Purchase) => void;
  deletePurchase: (id: string) => void;
  setStock: (n: number) => void;
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
  const synced = useRef<State | null>(null); // last state known to be in the cloud
  const pushing = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
    supabase.auth.getUser().then(({ data }) => data.user && setUser({ id: data.user.id, email: data.user.email ?? null }));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { setUser(null); synced.current = null; setSync("local"); return; }
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
        if (cloud) { synced.current = cloud; setState(cloud); }
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
  }, [user, ready]);

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
      finally { pushing.current = false; setState((s) => ({ ...s })); }
    }, 600);
    return () => clearTimeout(tm);
  }, [state, user]);

  const computedStock = useMemo(() => {
    const bought = state.purchases.reduce((s, p) => s + p.doses, 0);
    const used = state.records.filter((r) => r.type === "injection" && r.usedStock).length;
    return bought - used;
  }, [state.purchases, state.records]);

  const saveRecord = useCallback((r: JournalRecord) => setState((s) => {
    const exists = s.records.some((x) => x.id === r.id);
    return { ...s, records: exists ? s.records.map((x) => (x.id === r.id ? r : x)) : [...s.records, r] };
  }), []);

  setLocale(state.settings.locale ?? "ko");
  const value: Ctx = {
    ...state, ready, tz: state.settings.timezone,
    stock: Math.max(0, computedStock + state.stockAdjust),
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
    setStock: (n) => setState((s) => ({ ...s, stockAdjust: n - computedStock })),
    setSetting: (k, v) => setState((s) => ({ ...s, settings: { ...s.settings, [k]: v } })),
    clearDemo: () => setState((s) => ({
      ...s, records: s.records.filter((r) => !r.demo), purchases: s.purchases.filter((p) => !p.demo),
      reminder: s.reminder?.demo ? null : s.reminder, stockAdjust: 0,
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

export const sortByTime = (a: JournalRecord, b: JournalRecord) =>
  (b.at ?? b.localDate).localeCompare(a.at ?? a.localDate);

export { localDateOf };
