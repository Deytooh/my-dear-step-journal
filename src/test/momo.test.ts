import { describe, expect, it } from "vitest";
import { candidateToDraft, draftToEntry, isDuplicate, missingFields } from "@/lib/momo-drafts";
import { sanitizeCandidates } from "@/lib/momo-schema";

const tz = "Asia/Seoul";
const today = "2026-10-28";
const note =
  "오늘 체중은 78.2kg이에요. 어제 저녁에 주사를 맞았는데 정확한 시간과 용량은 모르겠어요.";

describe("Momo drafts", () => {
  it("keeps unknown injection details null and preserves 저녁 as approximate", () => {
    const [c] = sanitizeCandidates(
      [
        {
          type: "injection",
          date: "2026-10-27",
          time: null,
          timeHint: "저녁",
          doseValue: null,
          medication: null,
          quote: "어제 저녁에 주사를 맞았는데",
        },
      ],
      note,
    );
    const d = candidateToDraft(c!, "k", today);
    expect(missingFields(d)).toEqual(
      expect.arrayContaining(["medication", "doseValue", "site", "time"]),
    );
    const e = draftToEntry(d, "id1", tz, today);
    expect(e).toMatchObject({
      record: {
        type: "injection",
        localDate: "2026-10-27",
        at: null,
        precision: "part_of_day",
        partOfDay: "evening",
        doseValue: null,
        medication: null,
        site: null,
        usedStock: false,
      },
    });
  });
  it("turns the weight into 78.2 kg today", () => {
    const [c] = sanitizeCandidates(
      [{ type: "weight", value: 78.2, date: today, quote: "오늘 체중은 78.2kg이에요." }],
      note,
    );
    expect(draftToEntry(candidateToDraft(c!, "k", today), "id2", tz, today)).toMatchObject({
      record: { type: "weight", value: 78.2, localDate: today },
    });
  });
  it("drops quotes that are not in the user's words", () => {
    const [c] = sanitizeCandidates(
      [{ type: "weight", value: 78.2, quote: "invented sentence" }],
      note,
    );
    expect(c!.quote).toBeNull();
  });
  it("rejects a weight outside 20–400 kg", () => {
    const [c] = sanitizeCandidates([{ type: "weight", value: 5, date: today }], "5kg");
    expect(draftToEntry(candidateToDraft(c!, "k", today), "id", tz, today)).toEqual({
      error: "value",
    });
  });
  it("records receipts as expenses that never add stock", () => {
    const [c] = sanitizeCandidates(
      [
        {
          type: "expense",
          amount: "12,000",
          currency: "KRW",
          merchant: "약국",
          date: today,
          quote: "photo",
        },
      ],
      "",
    );
    const e = draftToEntry(candidateToDraft(c!, "k", today), "p1", tz, today);
    expect(e).toMatchObject({
      purchase: { amount: 12000, addsStock: false, doses: 0, product: null },
    });
  });
  it("flags a same-day duplicate weight", () => {
    const [c] = sanitizeCandidates([{ type: "weight", value: 78.2, date: today }], note);
    const e = draftToEntry(candidateToDraft(c!, "k", today), "id3", tz, today);
    const existing = "record" in e ? [{ ...e.record, id: "old" }] : [];
    expect(isDuplicate(e, existing, [])).toBe(true);
  });
});

describe("Momo source evidence", () => {
  it("does not invent a date or a photo quotation", () => {
    const [c] = sanitizeCandidates([{ type: "injection", quote: "photo: invented text" }], "");
    expect(c?.quote).toBeNull();
    const d = candidateToDraft(c!, "unknown", today);
    expect(d.f["date"]).toBe("");
    expect(draftToEntry(d, d.key, tz, today)).toEqual({ error: "date" });
  });
  it("retains exact text, photo references, proposals and user corrections through serialization", () => {
    const [c] = sanitizeCandidates(
      [{ type: "weight", value: 78.2, date: today, quote: "78.2kg" }],
      note,
    );
    const d = candidateToDraft(c!, "source", today, {
      method: "mixed",
      text: note,
      photos: ["data:image/jpeg;base64,abc"],
    });
    d.f["value"] = "78.3";
    const e = JSON.parse(JSON.stringify(draftToEntry(d, d.key, tz, today)));
    expect(e.record.evidence).toMatchObject({
      text: note,
      quote: "78.2kg",
      photos: ["data:image/jpeg;base64,abc"],
      proposed: { value: "78.2" },
      confirmed: { value: "78.3" },
    });
  });
  it("rejects impossible dates and times rather than normalizing them", () => {
    const [c] = sanitizeCandidates([{ type: "injection", date: today }], "");
    const d = candidateToDraft(c!, "bad", today);
    d.f["date"] = "2026-02-30";
    expect(draftToEntry(d, d.key, tz, today)).toEqual({ error: "date" });
    d.f["date"] = today;
    d.f["time"] = "25:00";
    expect(draftToEntry(d, d.key, tz, today)).toEqual({ error: "time" });
  });
});
