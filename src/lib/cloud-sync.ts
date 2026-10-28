import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { JournalRecord, JournalSnapshot, Purchase } from "./journal";

// Cloud persistence for the journal. Page code never calls this directly; journal.tsx diffs state and pushes.
const STORAGE_PREFIX = "storage:";

export async function loadCloud(): Promise<JournalSnapshot | null> {
  const [r, p, s] = await Promise.all([
    supabase.from("journal_records").select("data").limit(5000),
    supabase.from("purchases").select("data").limit(5000),
    supabase.from("journal_settings").select("*").maybeSingle(),
  ]);
  if (r.error || p.error || s.error) throw r.error ?? p.error ?? s.error;
  if (!s.data && r.data.length === 0 && p.data.length === 0) return null; // brand-new account
  return {
    records: r.data.map((x) => x.data as unknown as JournalRecord),
    purchases: p.data.map((x) => x.data as unknown as Purchase),
    reminder: (s.data?.reminder as unknown as JournalSnapshot["reminder"]) ?? null,
    stockAdjust: s.data?.stock_adjust ?? 0,
    settings: { showMomo: true, timezone: "Asia/Seoul", ...((s.data?.settings as object) ?? {}) },
  };
}

async function dataUrlToBlob(u: string) { return (await fetch(u)).blob(); }

async function prepareRecord(userId: string, r: JournalRecord): Promise<JournalRecord> {
  if (r.type === "memory" && r.photo?.startsWith("data:")) {
    const blob = await dataUrlToBlob(r.photo);
    const path = `${userId}/${r.id}-${Date.now()}`;
    const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw error;
    return { ...r, photo: STORAGE_PREFIX + path };
  }
  return r;
}

const changed = <T,>(a: T | undefined, b: T) => !a || JSON.stringify(a) !== JSON.stringify(b);

/** Push the difference between two journal states. Returns record replacements (e.g. uploaded photo paths). */
export async function pushDiff(userId: string, prev: JournalSnapshot, next: JournalSnapshot): Promise<JournalRecord[]> {
  const prevR = new Map(prev.records.map((r) => [r.id, r]));
  const nextR = new Map(next.records.map((r) => [r.id, r]));
  const replaced: JournalRecord[] = [];
  const upserts = [];
  for (const r of next.records) {
    if (!changed(prevR.get(r.id), r)) continue;
    const ready = await prepareRecord(userId, r);
    if (ready !== r) replaced.push(ready);
    upserts.push({ id: r.id, user_id: userId, type: r.type, local_date: r.localDate, data: ready as unknown as Json, is_demo: !!r.demo, updated_at: new Date().toISOString() });
  }
  const delR = prev.records.filter((r) => !nextR.has(r.id)).map((r) => r.id);
  const prevP = new Map(prev.purchases.map((p) => [p.id, p]));
  const nextP = new Set(next.purchases.map((p) => p.id));
  const upP = next.purchases.filter((p) => changed(prevP.get(p.id), p))
    .map((p) => ({ id: p.id, user_id: userId, local_date: p.localDate, data: p as unknown as Json, is_demo: !!p.demo }));
  const delP = prev.purchases.filter((p) => !nextP.has(p.id)).map((p) => p.id);

  const ops: PromiseLike<{ error: unknown }>[] = [];
  if (upserts.length) ops.push(supabase.from("journal_records").upsert(upserts, { onConflict: "user_id,id" }));
  if (delR.length) ops.push(supabase.from("journal_records").delete().in("id", delR));
  if (upP.length) ops.push(supabase.from("purchases").upsert(upP, { onConflict: "user_id,id" }));
  if (delP.length) ops.push(supabase.from("purchases").delete().in("id", delP));
  if (changed(prev.settings, next.settings) || changed(prev.reminder ?? undefined, next.reminder as never) || prev.stockAdjust !== next.stockAdjust || prev === next) {
    ops.push(supabase.from("journal_settings").upsert({
      user_id: userId, reminder: (next.reminder ?? null) as unknown as Json, stock_adjust: next.stockAdjust,
      settings: next.settings as unknown as Json, updated_at: new Date().toISOString(),
    }));
  }
  const results = await Promise.all(ops);
  const err = results.find((x) => x.error)?.error;
  if (err) throw err;
  return replaced;
}

export const isStoredPhoto = (p?: string | null) => !!p?.startsWith(STORAGE_PREFIX);

const urlCache = new Map<string, string>();
export async function photoUrl(p: string): Promise<string | null> {
  if (!isStoredPhoto(p)) return p;
  const path = p.slice(STORAGE_PREFIX.length);
  if (urlCache.has(path)) return urlCache.get(path)!;
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60);
  if (data?.signedUrl) urlCache.set(path, data.signedUrl);
  return data?.signedUrl ?? null;
}
