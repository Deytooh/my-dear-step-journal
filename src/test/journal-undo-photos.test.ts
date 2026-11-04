import { describe, expect, it } from "vitest";
import { sameConfirmedEntry, undoDelta } from "@/lib/journal-safety";
import type { JournalSnapshot, MemoryRec, Purchase } from "@/lib/journal";

const hash = "a".repeat(64);
const local = `localphoto:A:${hash}`;
const stored = `storage:A/source-${hash}`;
const evidence = (photo: string) => ({
  method: "photos" as const,
  text: "Synthetic example",
  photos: [photo],
  quote: null,
  proposed: { note: "Synthetic example" },
  confirmed: { note: "Synthetic example" },
});
const memory = (id: string, photo = local): MemoryRec => ({
  id,
  type: "memory",
  note: "Synthetic example",
  photo,
  evidence: evidence(photo),
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-04T10:00:00Z",
  source: "manual_text",
});
const snapshot = (
  records: JournalSnapshot["records"] = [],
  purchases: Purchase[] = [],
): JournalSnapshot => ({
  records,
  purchases,
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "UTC" },
});

describe("photo transport changes during Undo", () => {
  it("undoes an uploaded memory and its evidence without mutating either snapshot", () => {
    const before = snapshot();
    const after = snapshot([memory("photo")]);
    const current = snapshot([memory("photo", stored)]);
    expect(undoDelta(before, after, current).records).toEqual([]);
    expect(after.records).toEqual([memory("photo")]);
    expect(current.records).toEqual([memory("photo", stored)]);
  });

  it("undoes uploaded meal references and purchase evidence in the same batch", () => {
    const meal = (photo: string) => ({
      ...memory("meal", photo),
      type: "meal" as const,
      meal: {
        title: "Synthetic meal",
        mealType: "unknown" as const,
        photoRefs: [photo],
        consumedFraction: null,
        note: "",
        estimateAssumptions: [],
        items: [],
      },
    });
    const purchase = (photo: string): Purchase => ({
      id: "purchase",
      localDate: "2026-11-04",
      amount: 1,
      currency: "EUR",
      doses: 0,
      medication: null,
      addsStock: false,
      evidence: evidence(photo),
    });
    // A meal has no top-level memory photo; only its actual photo fields migrate.
    const { photo: _localPhoto, ...localMeal } = meal(local);
    const { photo: _storedPhoto, ...storedMeal } = meal(stored);
    const result = undoDelta(
      snapshot(),
      snapshot([localMeal], [purchase(local)]),
      snapshot([storedMeal], [purchase(stored)]),
    );
    expect(result.records).toEqual([]);
    expect(result.purchases).toEqual([]);
  });

  it.each([
    `storage:B/source-${hash}`,
    `storage:A/source-${"b".repeat(64)}`,
    "storage:A/source-short",
    "https://example.invalid/photo",
  ])("preserves a different or unverified photo reference %s", (photo) => {
    const current = memory("photo", photo);
    expect(undoDelta(snapshot(), snapshot([memory("photo")]), snapshot([current])).records).toEqual(
      [current],
    );
    expect(sameConfirmedEntry(memory("photo"), current)).toBe(false);
  });

  it("does not normalize photo-looking text in a note or in confirmed evidence", () => {
    const original = { ...memory("photo"), note: local };
    const changedNote = { ...memory("photo", stored), note: stored };
    expect(undoDelta(snapshot(), snapshot([original]), snapshot([changedNote])).records).toEqual([
      changedNote,
    ]);
    const changedEvidence = {
      ...memory("photo", stored),
      evidence: { ...evidence(stored), confirmed: { note: stored } },
    };
    expect(sameConfirmedEntry(memory("photo"), changedEvidence)).toBe(false);
  });

  it("keeps a genuine later correction but removes other uploaded entries in a partial Undo", () => {
    const corrected = { ...memory("edited", stored), note: "Later synthetic correction" };
    const result = undoDelta(
      snapshot(),
      snapshot([memory("edited"), memory("unchanged")]),
      snapshot([corrected, memory("unchanged", stored), memory("later")]),
    );
    expect(result.records).toEqual([corrected, memory("later")]);
  });

  it("ignores only creation time for stable-ID confirmation retries, not for Undo", () => {
    const later = { ...memory("photo", stored), createdAt: "2026-11-04T10:01:00Z" };
    expect(sameConfirmedEntry(memory("photo"), later)).toBe(true);
    expect(undoDelta(snapshot(), snapshot([memory("photo")]), snapshot([later])).records).toEqual([
      later,
    ]);
    expect(sameConfirmedEntry(memory("photo"), { ...later, note: "Different" })).toBe(false);
  });
});
