import type { JournalSnapshot } from "./journal";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function photoIdentity(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // The local and uploaded forms use the same SHA-256 of the original data URL.
  // Keep both the owner and complete digest: another photo is a real edit.
  const local = /^localphoto:([^:]+):([a-f0-9]{64})$/.exec(value);
  const stored = /^storage:([^/]+)\/source-([a-f0-9]{64})$/.exec(value);
  const parts = local ?? stored;
  return parts ? `localphoto:${parts[1]}:${parts[2]}` : value;
}

function comparableEntry(value: unknown, ignoreCreatedAt = false): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entry = { ...(value as Record<string, unknown>) };
  if (ignoreCreatedAt) delete entry["createdAt"];
  const evidence = entry["evidence"] as Record<string, unknown> | undefined;
  if (Array.isArray(evidence?.["photos"]))
    entry["evidence"] = { ...evidence, photos: evidence["photos"].map(photoIdentity) };
  if (entry["type"] === "memory") entry["photo"] = photoIdentity(entry["photo"]);
  const meal = entry["meal"] as Record<string, unknown> | undefined;
  if (entry["type"] === "meal" && Array.isArray(meal?.["photoRefs"]))
    entry["meal"] = { ...meal, photoRefs: meal["photoRefs"].map(photoIdentity) };
  return entry;
}

/** Reconfirming an existing draft ID is safe only when its confirmed content still matches. */
export const sameConfirmedEntry = (a: unknown, b: unknown) =>
  equal(comparableEntry(a, true), comparableEntry(b, true));

const sameUndoEntry = (a: unknown, b: unknown) => equal(comparableEntry(a), comparableEntry(b));

export function sameSnapshot(a: JournalSnapshot | null, b: JournalSnapshot | null) {
  const normalize = (s: JournalSnapshot | null) =>
    s
      ? {
          ...s,
          records: [...s.records].sort((x, y) => x.id.localeCompare(y.id)),
          purchases: [...s.purchases].sort((x, y) => x.id.localeCompare(y.id)),
        }
      : null;
  return equal(normalize(a), normalize(b));
}
function inverse(before: unknown, after: unknown, current: unknown): unknown {
  if (equal(before, after)) return current;
  if (equal(current, after)) return before;
  if (
    (before === undefined || (before && typeof before === "object" && !Array.isArray(before))) &&
    after &&
    current &&
    typeof after === "object" &&
    typeof current === "object" &&
    !Array.isArray(after)
  ) {
    const b = (before ?? {}) as Record<string, unknown>,
      a = after as Record<string, unknown>,
      c = current as Record<string, unknown>;
    const result = { ...c };
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const value = inverse(b[key], a[key], c[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  return current; // a later edit wins
}

/** Reverse only this action; never erase a later record or correction. */
export function undoDelta(
  before: JournalSnapshot,
  after: JournalSnapshot,
  current: JournalSnapshot,
): JournalSnapshot {
  function rows<T extends { id: string }>(b: T[], a: T[], c: T[]): T[] {
    const result = new Map(c.map((r) => [r.id, r]));
    for (const id of new Set([...b.map((r) => r.id), ...a.map((r) => r.id)])) {
      const old = b.find((r) => r.id === id),
        changed = a.find((r) => r.id === id);
      if (sameUndoEntry(old, changed) || !sameUndoEntry(result.get(id), changed)) continue;
      if (old) result.set(id, old);
      else result.delete(id);
    }
    return [...result.values()];
  }
  return {
    ...current,
    records: rows(before.records, after.records, current.records),
    purchases: rows(before.purchases, after.purchases, current.purchases),
    reminder: inverse(
      before.reminder,
      after.reminder,
      current.reminder,
    ) as JournalSnapshot["reminder"],
    stockAdjust: inverse(before.stockAdjust, after.stockAdjust, current.stockAdjust) as number,
    settings: inverse(
      before.settings,
      after.settings,
      current.settings,
    ) as JournalSnapshot["settings"],
  };
}
