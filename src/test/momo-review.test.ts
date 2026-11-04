import { describe, expect, it } from "vitest";
import { candidateToDraft, draftToEntry, type Draft } from "@/lib/momo-drafts";
import { sanitizeCandidates } from "@/lib/momo-schema";
import { isRecoveredDrafts, unexpectedDuplicateKeys } from "@/lib/momo-review";

const today = "2026-11-04";
const empty = { records: [], purchases: [] };
const asEntry = (d: Draft) => ({ d, e: draftToEntry(d, d.key, "Asia/Seoul", today) });
const weight = (key: string, value = 78, date: string | null = today) => {
  const [candidate] = sanitizeCandidates([{ type: "weight", value, date }], "");
  return candidateToDraft(candidate!, key, today);
};
const purchase = (key: string, medication = "Fictional Medicine") => {
  const words = "I bought 2 pens of Fictional Medicine";
  const [candidate] = sanitizeCandidates(
    [
      {
        type: "purchase",
        medication,
        quantity: 2,
        stockUnit: "pen",
        date: today,
        amount: 10,
        currency: "USD",
        quote: words,
      },
    ],
    words,
  );
  return candidateToDraft(candidate!, key, today, { method: "text", text: words, photos: [] });
};

describe("edited Momo batch duplicate review", () => {
  it("flags the later purchase after two distinct drafts are edited to the same facts", () => {
    const first = purchase("first");
    const second = purchase("second", "Different medicine");
    expect(unexpectedDuplicateKeys([asEntry(first), asEntry(second)], empty)).toEqual([]);
    second.f["medication"] = first.f["medication"]!;
    expect(unexpectedDuplicateKeys([asEntry(first), asEntry(second)], empty)).toEqual(["second"]);
  });
  it("detects a duplicate after two undated drafts are assigned the same day", () => {
    const first = weight("first", 78, null);
    const second = weight("second", 78, null);
    expect(unexpectedDuplicateKeys([asEntry(first), asEntry(second)], empty)).toEqual([]);
    first.f["date"] = today;
    second.f["date"] = today;
    expect(unexpectedDuplicateKeys([asEntry(first), asEntry(second)], empty)).toEqual(["second"]);
  });
  it("honors deliberate re-inclusion and compares subsequent drafts against it", () => {
    const first = weight("first");
    const second = { ...weight("second"), dup: true };
    const third = weight("third");
    expect(
      unexpectedDuplicateKeys([asEntry(first), asEntry(second), asEntry(third)], empty),
    ).toEqual(["third"]);
  });
  it("checks the current snapshot without treating the same stable-ID retry as a duplicate", () => {
    const original = asEntry(weight("original"));
    if (!("record" in original.e)) throw new Error("Expected record");
    const snapshot = { records: [original.e.record], purchases: [] };
    expect(unexpectedDuplicateKeys([original], snapshot)).toEqual([]);
    expect(unexpectedDuplicateKeys([asEntry(weight("new"))], snapshot)).toEqual(["new"]);
    expect(unexpectedDuplicateKeys([asEntry({ ...weight("new"), dup: true })], snapshot)).toEqual(
      [],
    );
  });
  it("ignores unchecked and invalid drafts, and retains distinct same-day facts", () => {
    const excluded = { ...weight("unchecked"), on: false };
    const invalid = weight("invalid", 5);
    expect(
      unexpectedDuplicateKeys(
        [
          asEntry(excluded),
          asEntry(invalid),
          asEntry(weight("first")),
          asEntry(weight("different", 79)),
        ],
        empty,
      ),
    ).toEqual([]);
  });
  it("never mutates the selection, entries or persisted snapshot", () => {
    const entries = [asEntry(purchase("first")), asEntry(purchase("second"))];
    const before = JSON.stringify({ entries, snapshot: empty });
    unexpectedDuplicateKeys(entries, empty);
    expect(JSON.stringify({ entries, snapshot: empty })).toBe(before);
  });
});

describe("recovered Momo draft validation", () => {
  it("accepts empty batches, valid legacy drafts without evidence, and incomplete editable fields", () => {
    expect(isRecoveredDrafts([])).toBe(true);
    const draft = weight("legacy", 78, null);
    draft.f["value"] = "unfinished correction";
    expect(draft.evidence).toBeUndefined();
    expect(isRecoveredDrafts([draft])).toBe(true);
    expect(isRecoveredDrafts(Array.from({ length: 20 }, (_, i) => weight(String(i))))).toBe(true);
  });
  it("rejects oversized batches, duplicate keys and blank keys", () => {
    expect(isRecoveredDrafts(Array.from({ length: 21 }, (_, i) => weight(String(i))))).toBe(false);
    expect(isRecoveredDrafts([weight("same"), weight("same")])).toBe(false);
    expect(isRecoveredDrafts([weight(" ")])).toBe(false);
  });
  it.each([
    { on: "false" },
    { on: 1 },
    { on: undefined },
    { dup: "false" },
    { dup: null },
    { type: "toString" },
    { type: "__proto__" },
    { type: "unsupported" },
    { f: [] },
    { f: "date" },
    { f: { value: 78 } },
    { f: null },
    { f: new Date() },
    { quote: {} },
    { quote: undefined },
    { timeHint: [] },
    { timeHint: undefined },
  ])("rejects malformed draft structure %j", (patch) => {
    expect(isRecoveredDrafts([{ ...weight("legacy"), ...patch }])).toBe(false);
  });
  it("accepts evidence, valid photo references and complete analysis without mutating them", () => {
    const draft = purchase("source");
    draft.evidence!.photos = ["data:image/jpeg;base64,YWJj"];
    draft.evidence!.analysis = {
      model: "test-model",
      promptVersion: "journal-v5",
      schemaVersion: 1,
      analyzedAt: "2026-11-04T00:00:00.000Z",
    };
    const before = JSON.stringify(draft);
    expect(isRecoveredDrafts([draft])).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
  });
  it.each([
    null,
    [],
    "evidence",
    { method: "unknown" },
    { text: 4 },
    { text: "x".repeat(4001) },
    { photos: "photo" },
    { photos: [4] },
    { photos: ["https://untrusted.example/photo"] },
    { photos: Array(4).fill("data:image/jpeg;base64,YWJj") },
    { quote: "invented text" },
    { quote: {} },
    { proposed: [] },
    { proposed: null },
    { proposed: { amount: 10 } },
    { confirmed: [] },
    { confirmed: null },
    { confirmed: { amount: false } },
    { analysis: null },
    { analysis: [] },
    { analysis: "model" },
    { analysis: {} },
    {
      analysis: {
        model: "test",
        promptVersion: "v1",
        schemaVersion: "1",
        analyzedAt: "2026-11-04T00:00:00Z",
      },
    },
    {
      analysis: { model: "test", promptVersion: "v1", schemaVersion: 1, analyzedAt: "not a date" },
    },
  ])("rejects unsafe evidence %j", (patch) => {
    const draft = purchase("source");
    const evidence =
      patch !== null && !Array.isArray(patch) && typeof patch === "object"
        ? { ...draft.evidence, ...patch }
        : patch;
    expect(isRecoveredDrafts([{ ...draft, evidence }])).toBe(false);
  });
  it("requires analysis strings and a finite integer version", () => {
    const draft = purchase("source");
    for (const schemaVersion of [NaN, Infinity, 1.5]) {
      expect(
        isRecoveredDrafts([
          {
            ...draft,
            evidence: {
              ...draft.evidence,
              analysis: {
                model: "test",
                promptVersion: "v1",
                schemaVersion,
                analyzedAt: "2026-11-04T00:00:00Z",
              },
            },
          },
        ]),
      ).toBe(false);
    }
  });
  it("does not mistake array-like objects or inherited draft fields for a batch", () => {
    expect(isRecoveredDrafts({ 0: weight("legacy"), length: 1 })).toBe(false);
    expect(isRecoveredDrafts([Object.create(weight("inherited"))])).toBe(false);
  });
});
