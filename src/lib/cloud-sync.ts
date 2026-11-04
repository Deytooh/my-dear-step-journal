import { validateSnapshot } from "./snapshot";
import { mediaOwner, readLocalPhoto } from "./media";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { JournalRecord, JournalSnapshot, Purchase } from "./journal";

// Cloud persistence for the journal. Page code never calls this directly; journal.tsx diffs state and pushes.
const STORAGE_PREFIX = "storage:";

export async function loadCloud(): Promise<JournalSnapshot | null> {
  async function rows(table: "journal_records" | "purchases") {
    const all: { data: Json }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase
        .from(table)
        .select("data")
        .order("id")
        .range(offset, offset + 999);
      if (result.error) throw result.error;
      all.push(...result.data);
      if (result.data.length < 1000) return all;
    }
  }
  const [records, purchases, s] = await Promise.all([
    rows("journal_records"),
    rows("purchases"),
    supabase.from("journal_settings").select("*").maybeSingle(),
  ]);
  if (s.error) throw s.error;
  const r = { data: records },
    p = { data: purchases };
  if (!s.data && r.data.length === 0 && p.data.length === 0) return null; // brand-new account
  return validateSnapshot({
    records: r.data.map((x) => x.data as unknown as JournalRecord),
    purchases: p.data.map((x) => x.data as unknown as Purchase),
    reminder: (s.data?.reminder as unknown as JournalSnapshot["reminder"]) ?? null,
    stockAdjust: s.data?.stock_adjust ?? 0,
    settings: { showMomo: true, timezone: "Asia/Seoul", ...((s.data?.settings as object) ?? {}) },
  });
}

async function dataUrlToBlob(u: string) {
  return (await fetch(u)).blob();
}

async function privatePhoto(userId: string, ref: string): Promise<string> {
  if (ref.startsWith("storage:")) {
    if (!ref.slice(8).startsWith(`${userId}/`)) throw new Error("photo_owner");
    return ref;
  }
  const data = ref.startsWith("localphoto:") ? await readLocalPhoto(ref) : ref;
  if (!data?.startsWith("data:image/")) throw new Error("photo_unavailable");
  const bytes = new TextEncoder().encode(data);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const path = `${userId}/source-${digest}`;
  const blob = await dataUrlToBlob(data);
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  return STORAGE_PREFIX + path;
}
async function prepareEntry<T extends JournalRecord | Purchase>(
  userId: string,
  entry: T,
): Promise<T> {
  let next = entry;
  if (entry.evidence?.photos.length)
    next = {
      ...next,
      evidence: {
        ...entry.evidence,
        photos: await Promise.all(entry.evidence.photos.map((p) => privatePhoto(userId, p))),
      },
    };
  if ("type" in entry && entry.type === "memory" && entry.photo)
    next = { ...next, photo: await privatePhoto(userId, entry.photo) };
  if ("type" in entry && entry.type === "meal")
    next = {
      ...next,
      meal: {
        ...entry.meal,
        photoRefs: await Promise.all(entry.meal.photoRefs.map((p) => privatePhoto(userId, p))),
      },
    };
  return JSON.stringify(next) === JSON.stringify(entry) ? entry : next;
}

const changed = <T>(a: T | undefined, b: T) => !a || JSON.stringify(a) !== JSON.stringify(b);

/** Push the difference between two journal states. Returns record replacements (e.g. uploaded photo paths). */
export async function pushDiff(
  userId: string,
  prev: JournalSnapshot,
  next: JournalSnapshot,
): Promise<(JournalRecord | Purchase)[]> {
  if (mediaOwner() !== userId) throw new Error("session_changed");
  const prevR = new Map(prev.records.map((r) => [r.id, r]));
  const nextR = new Map(next.records.map((r) => [r.id, r]));
  const replaced: (JournalRecord | Purchase)[] = [];
  const upserts = [];
  for (const r of next.records) {
    if (!changed(prevR.get(r.id), r)) continue;
    const ready = await prepareEntry(userId, r);
    if (ready !== r) replaced.push(ready);
    upserts.push({
      id: r.id,
      user_id: userId,
      type: r.type,
      local_date: r.localDate,
      data: ready as unknown as Json,
      is_demo: !!r.demo,
      updated_at: new Date().toISOString(),
    });
  }
  const delR = prev.records.filter((r) => !nextR.has(r.id)).map((r) => r.id);
  const prevP = new Map(prev.purchases.map((p) => [p.id, p]));
  const nextP = new Set(next.purchases.map((p) => p.id));
  const upP = [];
  for (const p of next.purchases.filter((p) => changed(prevP.get(p.id), p))) {
    const ready = await prepareEntry(userId, p);
    if (ready !== p) replaced.push(ready);
    upP.push({
      id: p.id,
      user_id: userId,
      local_date: p.localDate,
      data: ready as unknown as Json,
      is_demo: !!p.demo,
    });
  }
  const delP = prev.purchases.filter((p) => !nextP.has(p.id)).map((p) => p.id);

  if (mediaOwner() !== userId) throw new Error("session_changed");
  const ops: PromiseLike<{ error: unknown }>[] = [];
  if (upserts.length)
    ops.push(supabase.from("journal_records").upsert(upserts, { onConflict: "user_id,id" }));
  if (delR.length) ops.push(supabase.from("journal_records").delete().in("id", delR));
  if (upP.length) ops.push(supabase.from("purchases").upsert(upP, { onConflict: "user_id,id" }));
  if (delP.length) ops.push(supabase.from("purchases").delete().in("id", delP));
  if (
    changed(prev.settings, next.settings) ||
    changed(prev.reminder ?? undefined, next.reminder as never) ||
    prev.stockAdjust !== next.stockAdjust ||
    prev === next
  ) {
    ops.push(
      supabase.from("journal_settings").upsert({
        user_id: userId,
        reminder: (next.reminder ?? null) as unknown as Json,
        stock_adjust: next.stockAdjust,
        settings: next.settings as unknown as Json,
        updated_at: new Date().toISOString(),
      }),
    );
  }
  const results = await Promise.all(ops);
  const err = results.find((x) => x.error)?.error;
  if (err) throw err;
  return replaced;
}

export const isStoredPhoto = (p?: string | null) => !!p?.startsWith(STORAGE_PREFIX);

const urlCache = new Map<string, { url: string; until: number }>();
const photoEpochs = new Map<string, number>();
let cacheEpoch = 0;
export const clearPhotoCache = () => {
  cacheEpoch++;
  urlCache.clear();
  photoEpochs.clear();
};

/** Evict only the failed photo; unrelated pending requests remain valid. */
export const invalidatePhotoUrl = (p: string) => {
  if (!isStoredPhoto(p)) return;
  const path = p.slice(STORAGE_PREFIX.length);
  urlCache.delete(path);
  photoEpochs.set(path, (photoEpochs.get(path) ?? 0) + 1);
};
export async function photoUrl(p: string): Promise<string | null> {
  if (p.startsWith("localphoto:")) return readLocalPhoto(p);
  if (!isStoredPhoto(p)) return p;
  const path = p.slice(STORAGE_PREFIX.length);
  if (!path.startsWith(`${mediaOwner()}/`)) return null;
  const generation = cacheEpoch;
  const photoGeneration = photoEpochs.get(path) ?? 0;
  const cached = urlCache.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data } = await supabase.storage.from("photos").createSignedUrl(path, 60 * 60);
  if (generation !== cacheEpoch) return null;
  // Another rendering refreshed this photo while our request was pending.
  // Resolve the current generation instead of failing that healthy sibling.
  if (photoGeneration !== (photoEpochs.get(path) ?? 0)) return photoUrl(p);
  if (data?.signedUrl)
    urlCache.set(path, { url: data.signedUrl, until: Date.now() + 55 * 60 * 1000 });
  return data?.signedUrl ?? null;
}
