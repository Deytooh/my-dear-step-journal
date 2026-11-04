import { describe, expect, it } from "vitest";
import { candidateToDraft, draftToEntry, isDuplicate, missingFields } from "@/lib/momo-drafts";
import { inventory, canDeduct } from "@/lib/inventory";
import { emptyMeal } from "@/lib/meals";
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
          amount: 12000,
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
      [{ type: "weight", value: 78.2, date: today, quote: "78.2kg", photoIndices: [0] }],
      note,
      1,
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

describe("Momo water check-ins", () => {
  it.each([
    { answer: "yes", words: "Fictional example: I had water today." },
    { answer: "not_yet", words: "Fictional example: I have not had water yet today." },
  ])(
    "retains an explicit $answer answer and its words without inferring a volume or photo evidence",
    ({ answer, words }) => {
      const [candidate] = sanitizeCandidates(
        [{ type: "water", answer, date: today, quote: words, photoIndices: [0] }],
        words,
        1,
      );
      expect(candidate).toMatchObject({ type: "water", answer, photoIndices: [] });
      const draft = candidateToDraft(candidate!, "water-entry", today, {
        method: "mixed",
        text: words,
        photos: ["data:image/jpeg;base64,YWJj"],
      });
      const entry = draftToEntry(draft, draft.key, tz, today);
      expect(entry).toMatchObject({
        record: {
          type: "water",
          answer,
          localDate: today,
          at: null,
          evidence: {
            text: words,
            quote: words,
            photos: [],
            proposed: { answer },
            confirmed: { answer },
          },
        },
      });
      expect("record" in entry && "volume" in entry.record).toBe(false);
    },
  );
  it("does not create a water suggestion from a photo or an invented quotation", () => {
    expect(
      sanitizeCandidates(
        [{ type: "water", answer: "yes", date: today, quote: null, photoIndices: [0] }],
        "",
        1,
      ),
    ).toEqual([]);
    expect(
      sanitizeCandidates(
        [{ type: "water", answer: "yes", date: today, quote: "invented water statement" }],
        "Fictional day",
        0,
      ),
    ).toEqual([]);
  });
  it("requires an explicit answer and date instead of turning an unknown answer into yes", () => {
    const [candidate] = sanitizeCandidates(
      [{ type: "water", answer: "maybe", date: today, quote: "Fictional water note" }],
      "Fictional water note",
    );
    const draft = candidateToDraft(candidate!, "unknown-water", today);
    expect(draft.f["answer"]).toBe("");
    expect(missingFields(draft)).toContain("answer");
    expect(draftToEntry(draft, draft.key, tz, today)).toEqual({ error: "answer" });
    draft.f["answer"] = "not_yet";
    draft.f["date"] = "";
    expect(draftToEntry(draft, draft.key, tz, today)).toEqual({ error: "date" });
  });
  it("flags an equal check-in while retaining a different water answer", () => {
    const [candidate] = sanitizeCandidates(
      [{ type: "water", answer: "yes", date: today, quote: "Fictional water" }],
      "Fictional water",
    );
    const entry = draftToEntry(candidateToDraft(candidate!, "water", today), "water", tz, today);
    if (!("record" in entry) || entry.record.type !== "water")
      throw new Error("Expected a water record");
    const old = { ...entry.record, id: "old" };
    delete old.partOfDay;
    expect(isDuplicate(entry, [old], [])).toBe(true);
    expect(isDuplicate(entry, [{ ...entry.record, id: "different", answer: "not_yet" }], [])).toBe(
      false,
    );
  });
});

it("does not mark equal receipt numbers in different currencies as duplicates", () => {
  const words = "Fictional receipt";
  const [candidate] = sanitizeCandidates(
    [
      {
        type: "expense",
        date: today,
        quote: words,
        amount: 12.5,
        currency: "EUR",
        product: "Fictional receipt",
      },
    ],
    words,
  );
  const entry = draftToEntry(candidateToDraft(candidate!, "receipt", today), "receipt", tz, today);
  if (!("purchase" in entry)) throw new Error("Expected receipt");
  expect(isDuplicate(entry, [], [{ ...entry.purchase, id: "usd", currency: "USD" }])).toBe(false);
});

describe("Momo purchase stock units", () => {
  it.each([
    ["Fictional Medicine: bought 2 pens", "pen"],
    ["Fictional Medicine : acheté 2 stylos", "pen"],
    ["Fictional Medicine 2펜을 샀어요", "pen"],
    ["Fictional Medicine: bought 2 doses", "dose"],
    ["Fictional Medicine: bought 2 single-use units", "single"],
  ])("keeps the stated unit in %s", (words, unit) => {
    const [candidate] = sanitizeCandidates(
      [
        {
          type: "purchase",
          medication: "Fictional Medicine",
          quantity: 2,
          stockUnit: unit,
          date: today,
          quote: words,
        },
      ],
      words,
    );
    const draft = candidateToDraft(candidate!, "quoted-purchase", today, {
      method: "text",
      text: words,
      photos: [],
    });
    const entry = draftToEntry(draft, draft.key, tz, today);
    if (!("purchase" in entry)) throw new Error("Expected purchase");
    expect(entry.purchase.stockUnit).toBe(unit);
    expect(inventory([entry.purchase], []).lots[0]).toMatchObject({ unit, balance: 2 });
    if (unit === "pen") expect(canDeduct("pen")).toBe(false);
  });
  it("keeps absent, contradictory and ambiguous stock units unresolved instead of defaulting to single-use units", () => {
    for (const [words, proposedUnit] of [
      ["Fictional Medicine: bought 2 boxes", "single"],
      ["Fictional Medicine: bought 2 pens", "dose"],
      ["Fictional Medicine: bought 2 pens and 2 doses", "pen"],
    ]) {
      const [candidate] = sanitizeCandidates(
        [
          {
            type: "purchase",
            medication: "Fictional Medicine",
            quantity: 2,
            stockUnit: proposedUnit,
            date: today,
            quote: words,
          },
        ],
        words!,
      );
      expect(candidate).toMatchObject({ stockUnit: null });
      const draft = candidateToDraft(candidate!, "unknown-unit", today, {
        method: "text",
        text: words!,
        photos: [],
      });
      const entry = draftToEntry(draft, draft.key, tz, today);
      if (!("purchase" in entry)) throw new Error("Expected purchase");
      expect(entry.purchase.stockUnit).toBeNull();
      expect(inventory([entry.purchase], []).lots).toEqual([]);
      expect(inventory([entry.purchase], []).unresolvedPurchases).toHaveLength(1);
    }
  });
  it("does not propose stock from a photo without an exact user-text quote", () => {
    expect(
      sanitizeCandidates(
        [
          {
            type: "purchase",
            quantity: 4,
            stockUnit: "pen",
            date: today,
            quote: null,
            photoIndices: [0],
          },
        ],
        "",
        1,
      ),
    ).toEqual([]);
  });
});

describe("receipt duplicate identity", () => {
  const receipt = {
    id: "receipt",
    localDate: today,
    amount: 4,
    currency: "EUR",
    doses: 0,
    quantity: 1,
    medication: null,
    product: "Coffee",
    merchant: "Fictional cafe",
    stockUnit: null,
    addsStock: false,
  } as const;
  it("keeps separate same-price products, stores, quantities and stock purchases selected", () => {
    for (const change of [
      { product: "Lunch" },
      { merchant: "Different cafe" },
      { quantity: 2 },
      { medication: "Fictional medicine", addsStock: true },
    ])
      expect(isDuplicate({ purchase: receipt }, [], [{ ...receipt, ...change }])).toBe(false);
    expect(isDuplicate({ purchase: receipt }, [], [{ ...receipt, id: "older" }])).toBe(true);
  });
  it("does not deselect two unidentifiable expenses on price alone", () => {
    const unknown = { ...receipt, product: null, merchant: null };
    expect(isDuplicate({ purchase: unknown }, [], [{ ...unknown, id: "older" }])).toBe(false);
  });
  it("uses exact source facts for repeated unknown-price purchases", () => {
    const evidence = {
      method: "text" as const,
      text: "Bought two fictional pens",
      quote: "two fictional pens",
      photos: [],
      proposed: { amount: "", currency: "" },
      confirmed: { amount: "", currency: "" },
    };
    const pending = {
      ...receipt,
      medication: "Fictional medicine",
      product: null,
      addsStock: true,
      amount: 0,
      currency: "KRW",
      quantity: 2,
      doses: 2,
      stockUnit: "pen" as const,
      evidence,
    };
    expect(isDuplicate({ purchase: pending }, [], [{ ...pending, id: "older" }])).toBe(true);
    expect(
      isDuplicate(
        { purchase: pending },
        [],
        [{ ...pending, id: "other", evidence: { ...evidence, quote: "a different source" } }],
      ),
    ).toBe(false);
    expect(
      isDuplicate(
        { purchase: pending },
        [],
        [
          {
            ...pending,
            id: "known",
            evidence: { ...evidence, confirmed: { amount: "0", currency: "KRW" } },
          },
        ],
      ),
    ).toBe(false);
  });
});

describe("same-day record duplicate facts", () => {
  const base = {
    id: "new",
    localDate: today,
    at: null,
    precision: "date_only" as const,
    createdAt: "2026-10-28T00:00:00Z",
    source: "manual_text" as const,
  };
  it("distinguishes measurement values and known times while warning on a repeat", () => {
    const measure = {
      ...base,
      type: "measure" as const,
      waist: 80,
      hip: null,
      chest: null,
      thigh: null,
      unit: "cm" as const,
    };
    expect(isDuplicate({ record: measure }, [{ ...measure, id: "old" }], [])).toBe(true);
    expect(isDuplicate({ record: measure }, [{ ...measure, waist: 81 }], [])).toBe(false);
    expect(isDuplicate({ record: measure }, [{ ...measure, hip: 90 }], [])).toBe(false);
    const weight = {
      ...base,
      type: "weight" as const,
      value: 78,
      unit: "kg" as const,
      at: "2026-10-28T00:00:00Z",
    };
    expect(isDuplicate({ record: weight }, [{ ...weight, at: "2026-10-28T10:00:00Z" }], [])).toBe(
      false,
    );
  });
  it("does not deselect a different injection or infer that two unknown shots are identical", () => {
    const injection = {
      ...base,
      type: "injection" as const,
      medication: "Fictional medicine",
      doseValue: 1,
      doseUnit: "mg",
      site: "arm",
      usedStock: false,
    };
    expect(isDuplicate({ record: injection }, [{ ...injection, id: "old" }], [])).toBe(true);
    for (const change of [
      { medication: "Other fictional medicine" },
      { doseValue: 2 },
      { doseUnit: "ml" },
      { site: "leg" },
      { partOfDay: "evening" as const },
    ])
      expect(isDuplicate({ record: injection }, [{ ...injection, ...change }], [])).toBe(false);
    const unknown = { ...injection, medication: null, doseValue: null, doseUnit: null, site: null };
    expect(isDuplicate({ record: unknown }, [{ ...unknown, id: "old" }], [])).toBe(false);
  });
  it("keeps distinct notes attached to the same feeling", () => {
    const feeling = { ...base, type: "condition" as const, label: "tired", note: "After lunch" };
    expect(isDuplicate({ record: feeling }, [{ ...feeling, note: "After a walk" }], [])).toBe(
      false,
    );
    expect(isDuplicate({ record: feeling }, [{ ...feeling, id: "old" }], [])).toBe(true);
  });
});

it("compares meal contents and user edits rather than the title alone", () => {
  const meal = {
    ...emptyMeal(),
    title: "Lunch",
    consumedFraction: 0.5,
    items: [
      {
        id: "food-new",
        name: "Rice",
        portionDescription: null,
        ingredients: [],
        kcal: { low: 100, high: 150, basis: "photo_estimate" as const },
        included: true,
      },
    ],
  };
  const record = {
    id: "meal",
    type: "meal" as const,
    localDate: today,
    at: null,
    precision: "date_only" as const,
    createdAt: "2026-10-28T00:00:00Z",
    source: "manual_text" as const,
    meal,
  };
  const prior = {
    ...record,
    id: "older",
    meal: { ...meal, items: [{ ...meal.items[0]!, id: "older-food-id" }] },
  };
  expect(isDuplicate({ record }, [prior], [])).toBe(true);
  for (const change of [
    { consumedFraction: 1 },
    { note: "Different meal" },
    { items: [{ ...meal.items[0]!, name: "Pasta" }] },
  ])
    expect(isDuplicate({ record }, [{ ...prior, meal: { ...prior.meal, ...change } }], [])).toBe(
      false,
    );
});

describe("editable approximate time", () => {
  const make = () => {
    const words = "Fictional evening walk";
    const [candidate] = sanitizeCandidates(
      [{ type: "memory", date: today, note: "Walk", timeHint: "evening", quote: words }],
      words,
    );
    return candidateToDraft(candidate!, "period", today, {
      method: "text",
      text: words,
      photos: [],
    });
  };
  it.each([
    ["morning", "part_of_day", "morning"],
    ["", "date_only", null],
  ])(
    "retains the original period when explicitly changed to %s",
    (period, precision, savedPeriod) => {
      const draft = make();
      draft.f["partOfDay"] = period!;
      const entry = draftToEntry(draft, draft.key, tz, today);
      expect(entry).toMatchObject({
        record: {
          precision,
          at: null,
          partOfDay: savedPeriod,
          evidence: { proposed: { partOfDay: "evening" }, confirmed: { partOfDay: period } },
        },
      });
    },
  );
  it("gives exact clock time priority and rejects invalid period values", () => {
    const draft = make();
    draft.f["time"] = "14:30";
    expect(draftToEntry(draft, draft.key, tz, today)).toMatchObject({
      record: {
        precision: "exact",
        partOfDay: null,
        evidence: { confirmed: { time: "14:30", partOfDay: "" } },
      },
    });
    draft.f["partOfDay"] = "invented";
    expect(draftToEntry(draft, draft.key, tz, today)).toEqual({ error: "partOfDay" });
  });
  it("retains an old cached hint until a user explicitly clears it", () => {
    const draft = make();
    delete draft.f["partOfDay"];
    delete draft.evidence!.proposed["partOfDay"];
    expect(draftToEntry(draft, draft.key, tz, today)).toMatchObject({
      record: { partOfDay: "evening" },
    });
    draft.f["partOfDay"] = "";
    expect(draftToEntry(draft, draft.key, tz, today)).toMatchObject({
      record: {
        partOfDay: null,
        evidence: { proposed: { partOfDay: "evening" }, confirmed: { partOfDay: "" } },
      },
    });
  });
});
