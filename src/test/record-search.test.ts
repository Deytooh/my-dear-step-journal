import { expect, it } from "vitest";
import { findRecords, findPurchases, matchesKeywords } from "@/lib/record-search";
import { setLocale, getLocale, t } from "@/lib/i18n";
import { SITE_ZONES } from "@/lib/injection-sites";
import { emptyMeal } from "@/lib/meals";
import type { MemoryRec, Purchase } from "@/lib/journal";
const evidence = {
  method: "text" as const,
  text: "A fictional déjeuner at the café",
  quote: "déjeuner at the café",
  photos: [],
  proposed: {},
  confirmed: {},
};
const record: MemoryRec = {
  id: "r",
  type: "memory",
  note: "A calm afternoon",
  localDate: "2026-10-30",
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: "2026-10-30T00:00:00Z",
  evidence,
};
it("matches accents and apostrophe variants without changing original text", () => {
  expect(matchesKeywords("Déjeuner au café d’aujourd’hui", "dejeuner cafe d'aujourd'hui")).toBe(
    true,
  );
  expect(evidence.quote).toBe("déjeuner at the café");
  expect(matchesKeywords("식사 기록", "식사")).toBe(true);
});
it("finds an entry through its exact original source quote as well as its edited note", () => {
  expect(findRecords([record], "dejeuner cafe")).toEqual([record]);
  expect(findRecords([record], "calm")).toEqual([record]);
  expect(findRecords([record], "unrelated")).toEqual([]);
  expect(findRecords([record], "  ")).toEqual([]);
});
it("uses the same local keyword matching for purchases and preserves currency and values", () => {
  const purchase: Purchase = {
    id: "p",
    localDate: "2026-10-30",
    medication: null,
    product: "Fictional café receipt",
    amount: 12.5,
    currency: "EUR",
    doses: 0,
    stockUnit: null,
    addsStock: false,
    evidence,
  };
  expect(findPurchases([purchase], "cafe EUR")).toEqual([purchase]);
  expect(findPurchases([purchase], "12.5")).toEqual([purchase]);
  expect(findPurchases([purchase], "12,5")).toEqual([purchase]);
  expect(findPurchases([purchase], "")).toEqual([]);
});

it("finds confirmed dose values with either decimal separator and translated site names", () => {
  const locale = getLocale();
  try {
    setLocale("en");
    const injection = {
      ...record,
      type: "injection" as const,
      medication: "Fictional medicine",
      doseValue: 2.5,
      doseUnit: "mg",
      site: SITE_ZONES[0].id,
      usedStock: false,
    };
    delete injection.evidence;
    for (const query of ["2.5mg", "2,5 mg", t("site.arm.left")])
      expect(findRecords([injection], query)).toEqual([injection]);
    expect(findRecords([{ ...injection, doseValue: null, doseUnit: null }], "2.5mg")).toEqual([]);
  } finally {
    setLocale(locale);
  }
});

it("finds confirmed ingredient, portion and consumption notes without changing the meal", () => {
  const meal = {
    ...record,
    type: "meal" as const,
    meal: {
      ...emptyMeal(),
      title: "Lunch",
      consumptionNote: "Shared with a friend",
      items: [
        {
          id: "rice",
          name: "Rice bowl",
          portionDescription: "Small bowl",
          ingredients: [{ name: "Sesame", basis: "user_provided" as const }],
          kcal: null,
          included: true,
        },
      ],
    },
  };
  const before = JSON.stringify(meal);
  for (const query of ["sesame", "small bowl", "shared friend"])
    expect(findRecords([meal], query)).toEqual([meal]);
  expect(JSON.stringify(meal)).toBe(before);
});

it("finds purchase quantities and units without inventing unknown units", () => {
  const locale = getLocale();
  try {
    setLocale("en");
    const purchase: Purchase = {
      id: "stock",
      localDate: "2026-11-04",
      amount: 20,
      currency: "EUR",
      medication: "Fictional medicine",
      quantity: 2,
      doses: 2,
      addsStock: true,
      stockUnit: "pen",
    };
    expect(findPurchases([purchase], "2 pens")).toEqual([purchase]);
    expect(findPurchases([{ ...purchase, stockUnit: null }], "pens")).toEqual([]);
  } finally {
    setLocale(locale);
  }
});

it("finds the saved localized time of day and excludes a cleared period", () => {
  const locale = getLocale();
  try {
    setLocale("en");
    const morning = { ...record, precision: "part_of_day" as const, partOfDay: "morning" as const };
    delete morning.evidence;
    expect(findRecords([morning], "morning calm")).toEqual([morning]);
    expect(
      findRecords([{ ...morning, precision: "date_only", partOfDay: null }], "morning"),
    ).toEqual([]);
  } finally {
    setLocale(locale);
  }
});

it("finds exact clock times in the selected timezone without inventing times for date-only entries", () => {
  const exact = { ...record, precision: "exact" as const, at: "2026-10-30T09:30:00Z" };
  expect(findRecords([exact], "09:30", "UTC")).toEqual([exact]);
  expect(findRecords([exact], "18:30", "Asia/Seoul")).toEqual([exact]);
  expect(findRecords([exact], "09:30", "Asia/Seoul")).toEqual([]);
  expect(findRecords([{ ...exact, precision: "date_only" }], "09:30", "UTC")).toEqual([]);
});
