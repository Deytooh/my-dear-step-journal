import { describe, expect, it } from "vitest";
import { journalSummary } from "@/lib/journal-summary";
import { emptyMeal } from "@/lib/meals";
import { SITE_ZONES } from "@/lib/injection-sites";
import { tFor } from "@/lib/i18n";
import type { JournalSnapshot, JournalRecord, Purchase } from "@/lib/journal";
const base = {
  localDate: "2026-11-04",
  at: null,
  precision: "date_only" as const,
  createdAt: "2026-11-04T00:00:00Z",
  source: "manual_text" as const,
};
const options = {
  locale: "en" as const,
  tz: "Asia/Seoul",
  from: "2026-11-01",
  to: "2026-11-04",
  includeDemo: false,
};
const image = "data:image/jpeg;base64,ZmFrZQ==";
const evidence = {
  method: "text" as const,
  text: "ORIGINAL SOURCE NOT IN SUMMARY",
  quote: null,
  photos: [image],
  proposed: { value: "78.2" },
  confirmed: { value: "78.3" },
};
function fixture(): Pick<JournalSnapshot, "records" | "purchases"> {
  const records: JournalRecord[] = [
    {
      ...base,
      id: "weight",
      type: "weight",
      unit: "kg",
      value: 78.3,
      precision: "exact",
      at: "2026-11-03T15:45:00Z",
      evidence,
    },
    {
      ...base,
      id: "date-only",
      localDate: "2026-11-02",
      type: "weight",
      unit: "kg",
      value: 79,
      at: "2026-11-02T12:00:00Z",
    },
    {
      ...base,
      id: "shot",
      type: "injection",
      precision: "part_of_day",
      partOfDay: "evening",
      medication: null,
      doseValue: 1e-21,
      doseUnit: null,
      site: SITE_ZONES[0].id,
      usedStock: false,
    },
    {
      ...base,
      id: "feeling",
      type: "condition",
      label: "Fictional tiredness",
      note: "Fictional morning note",
    },
    { ...base, id: "water", type: "water", answer: "not_yet" },
    {
      ...base,
      id: "meal",
      type: "meal",
      meal: {
        ...emptyMeal(),
        title: "Fictional lunch",
        consumedFraction: 0.29,
        photoRefs: [image],
        items: [
          {
            id: "rice",
            name: "Rice",
            portionDescription: "One bowl",
            included: true,
            kcal: null,
            ingredients: [],
          },
          {
            id: "excluded",
            name: "Excluded sauce",
            portionDescription: null,
            included: false,
            kcal: null,
            ingredients: [],
          },
        ],
      },
    },
    { ...base, id: "memory", type: "memory", note: "Fictional walk\nSecond line", photo: image },
    {
      ...base,
      id: "measure",
      type: "measure",
      unit: "cm",
      waist: 82.1,
      hip: null,
      chest: null,
      thigh: null,
    },
    { ...base, id: "demo", type: "memory", note: "DEMO FICTIONAL MOMENT", demo: true },
    { ...base, id: "old", localDate: "2026-10-30", type: "memory", note: "OUTSIDE OLD" },
    { ...base, id: "future", localDate: "2026-11-05", type: "memory", note: "OUTSIDE FUTURE" },
  ];
  const purchase = (id: string, product: string): Purchase => ({
    id,
    product,
    localDate: base.localDate,
    amount: 12.5,
    currency: "EUR",
    doses: 0,
    medication: null,
    addsStock: false,
  });
  return {
    records,
    purchases: [
      { ...purchase("known", "Known groceries"), merchant: "Fictional cafe" },
      { ...purchase("zero", "Explicit zero expense"), amount: 0, currency: "USD" },
      {
        ...purchase("unknown-amount", "Unknown-price purchase"),
        amount: 0,
        currency: "KRW",
        evidence: { ...evidence, confirmed: { amount: "", currency: "" } },
      },
      {
        ...purchase("unknown-currency", "Unknown-currency purchase"),
        currency: "KRW",
        evidence: { ...evidence, confirmed: { currency: "" } },
      },
    ],
  };
}
describe("local journal summary", () => {
  it("exports only selected confirmed dates, preserves current values and leaves source photos in the journal", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const result = journalSummary(state, options);
    expect(result.count).toBe(12);
    expect(result.hasDemo).toBe(false);
    expect(result.text).toContain("2026-11-04 · 00:45 · Weight\n78.3 kg");
    expect(result.text).toContain("2026-11-02 · Time unknown · Weight\n79 kg");
    expect(result.text).toContain("Fictional morning note");
    expect(result.text).toContain("Fictional walk\nSecond line");
    expect(result.text).toContain("Rice — One bowl");
    expect(result.text).toContain("Amount eaten: 29%");
    expect(result.text).toContain("Photo available in the journal.");
    for (const excluded of [
      "OUTSIDE OLD",
      "OUTSIDE FUTURE",
      "DEMO FICTIONAL",
      "Excluded sauce",
      image,
      "ORIGINAL SOURCE",
      "78.2",
    ])
      expect(result.text).not.toContain(excluded);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("keeps unknown money, currency and dose units distinct from an explicit zero", () => {
    const text = journalSummary(fixture(), options).text;
    expect(text).toContain("Explicit zero expense\nAmount: 0\nCurrency: USD");
    expect(text).toContain("Unknown-price purchase\nAmount: Amount unknown\nCurrency: Unknown");
    expect(text).toContain("Unknown-currency purchase\nAmount: 12.5\nCurrency: Unknown");
    expect(text).toContain("Medication: Unknown");
    expect(text).toContain("Dose: 0.000000000000000000001");
    expect(text).toContain("Dose unit: Unknown");
    expect(text).not.toContain("KRW");
    expect(text).not.toContain(" mg");
    expect(text).toContain(tFor("en", "water.notYet"));
    expect(text).not.toContain(" ml");
  });
  it("includes fictional examples only when chosen and labels them in the file", () => {
    const result = journalSummary(fixture(), { ...options, includeDemo: true });
    expect(result.count).toBe(13);
    expect(result.hasDemo).toBe(true);
    expect(result.text).toContain("Includes fictional demo entries");
    expect(result.text).toContain("[Example] 2026-11-04");
    expect(result.text).toContain("DEMO FICTIONAL MOMENT");
  });
  it("localizes labels, decimal values and sites independently of the current UI language", () => {
    const text = journalSummary(fixture(), { ...options, locale: "fr" }).text;
    expect(text).toContain(tFor("fr", "sum.title"));
    expect(text).toContain(tFor("fr", "site.arm.left"));
    expect(text).toContain("12,5");
    expect(text).toContain("78,3 kg");
    expect(text).toMatch(/29\s*%/);
    expect(text).toContain("Fictional morning note");
  });
  it("keeps unknown consumption and measurements unknown instead of creating zeros", () => {
    const state = fixture();
    const meal = state.records.find((record) => record.type === "meal")!;
    if (meal.type === "meal") meal.meal.consumedFraction = null;
    state.records.push({
      ...base,
      id: "unknown-measure",
      type: "measure",
      unit: "cm",
      waist: null,
      hip: null,
      chest: null,
      thigh: null,
    });
    const text = journalSummary(state, options).text;
    expect(text).toContain("Amount eaten: Unknown");
    expect(text).toContain("Measurements\nUnknown");
    expect(text).not.toContain("0%");
  });
  it("supports an explicitly all-dates overview without imposing today's date on entries", () => {
    const result = journalSummary(fixture(), { ...options, from: null, to: null });
    expect(result.text).toContain("OUTSIDE OLD");
    expect(result.text).toContain("OUTSIDE FUTURE");
    expect(result.text).toContain("2026-11-05");
    expect(result.text).toContain("All entries");
  });
});
