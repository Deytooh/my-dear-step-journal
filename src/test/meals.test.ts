import { describe, expect, it } from "vitest";
import {
  draftMealSchema,
  emptyMeal,
  mealSchema,
  mealTotals,
  parseMealAnalysis,
  type MealDetails,
} from "@/lib/meals";
import { validateSnapshot } from "@/lib/snapshot";
import { journalCSV } from "@/lib/export";
import { undoDelta } from "@/lib/journal-safety";
import { memoryCandidates, validateMemoryIds } from "@/lib/memory";
import type { JournalSnapshot, MealRec } from "@/lib/journal";

const meal = (): MealDetails => ({
  ...emptyMeal(),
  title: "비빔밥과 반찬",
  items: [
    {
      id: "dish",
      name: "비빔밥",
      portionDescription: "한 그릇",
      ingredients: [{ name: "참기름", basis: "possible" }],
      kcal: { low: 500, high: 700, basis: "photo_estimate" },
      included: true,
    },
  ],
});
const record = (): MealRec => ({
  id: "meal1",
  type: "meal",
  localDate: "2026-10-30",
  precision: "date_only",
  at: null,
  createdAt: "2026-10-30T00:00:00Z",
  source: "manual_text",
  meal: meal(),
});
const snapshot = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
describe("meal estimates", () => {
  it("sums dishes once, not nested ingredients, and never assumes how much was eaten", () => {
    const m = meal();
    expect(mealTotals(m)).toEqual({
      pictured: { low: 500, high: 700 },
      consumed: null,
      partial: false,
    });
    m.consumedFraction = 0.5;
    expect(mealTotals(m).consumed).toEqual({ low: 250, high: 350 });
    expect(mealTotals(m).pictured).toEqual({ low: 500, high: 700 });
    expect(mealTotals(m).consumed).toEqual({ low: 250, high: 350 });
  });
  it("labels missing food estimates as partial, rather than zero", () => {
    const m = meal();
    m.items.push({ ...m.items[0]!, id: "side", name: "공유 반찬", kcal: null });
    expect(mealTotals(m).partial).toBe(true);
    m.items[0]!.included = false;
    expect(mealTotals(m)).toEqual({ pictured: null, consumed: null, partial: true });
  });
  it.each([-1, Infinity, NaN, 10001])("rejects invalid kcal %s", (value) => {
    const m = meal();
    m.items[0]!.kcal!.low = value;
    expect(mealSchema.safeParse(m).success).toBe(false);
  });
  it("rejects reversed ranges, duplicate item IDs, and fractions outside 0–1", () => {
    const m = meal();
    m.items[0]!.kcal = { low: 700, high: 500, basis: "label" };
    expect(mealSchema.safeParse(m).success).toBe(false);
    const valid = meal();
    valid.items.push(valid.items[0]!);
    expect(mealSchema.safeParse(valid).success).toBe(false);
    expect(mealSchema.safeParse({ ...meal(), consumedFraction: 2 }).success).toBe(false);
  });
  it("discards model aggregate totals and inferred consumption/photo URLs", () => {
    const raw = { ...meal(), total: 12345, consumedFraction: 1, photoRefs: [] };
    const result = parseMealAnalysis(raw, "meta-models/muse-spark-open");
    expect(result?.consumedFraction).toBeNull();
    expect(result).not.toHaveProperty("total");
    expect(result?.analysis?.model).toContain("meta-models/");
    expect(parseMealAnalysis({ ...raw, items: [] }, "model")).toBeNull();
  });
  it("preserves corrected meal structure, sources and precision through backup and CSV", () => {
    const r = record();
    r.meal.consumedFraction = 0.5;
    r.evidence = {
      method: "photos",
      text: "밥은 반만 먹었어요",
      quote: null,
      photos: [],
      proposed: { meal: "proposal" },
      confirmed: { meal: JSON.stringify(r.meal) },
    };
    const s = { ...snapshot(), records: [r] };
    expect(validateSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const csv = journalCSV(s);
    expect(csv).toContain("consumed_fraction");
    expect(csv).toContain("비빔밥");
    expect(csv).toContain('"250"');
  });
});
describe("safe restoration and bounded memory", () => {
  it("rejects invalid dates, unknown types, duplicate IDs and arbitrary photo URLs", () => {
    const s = snapshot(),
      r = record();
    for (const records of [
      [{ ...r, localDate: "2026-02-30" }],
      [{ ...r, type: "unknown" }],
      [r, r],
      [{ ...r, meal: { ...meal(), photoRefs: ["https://untrusted.invalid/photo"] } }],
    ])
      expect(() => validateSnapshot({ ...s, records })).toThrow();
  });
  it("Undo keeps unrelated later records, settings and prompt statuses", () => {
    const before = snapshot(),
      r = record();
    const after = {
      ...before,
      records: [r],
      settings: { ...before.settings, prompts: { answered: { water: "2026-10-30" } } },
    };
    const later = {
      ...after,
      records: [r, { ...r, id: "later" }],
      settings: {
        ...after.settings,
        locale: "fr" as const,
        prompts: { answered: { water: "2026-10-30", feel: "2026-10-30" } },
      },
    };
    const result = undoDelta(before, after, later);
    expect(result.records.map((x) => x.id)).toEqual(["later"]);
    expect(result.settings.locale).toBe("fr");
    expect(result.settings.prompts?.answered?.feel).toBe("2026-10-30");
    expect(result.settings.prompts?.answered?.water).toBeUndefined();
  });
  it("never undoes a subsequent correction to the same record", () => {
    const before = snapshot(),
      r = record();
    const corrected = { ...r, meal: { ...r.meal, title: "수정한 제목" } };
    expect(
      undoDelta(before, { ...before, records: [r] }, { ...before, records: [corrected] }).records,
    ).toEqual([corrected]);
  });
  it("validates returned memory IDs and filters the previous calendar week", () => {
    const r = record();
    const keys = memoryCandidates(
      [
        { ...r, id: "last-week", localDate: "2026-10-19" },
        { ...r, id: "this-week", localDate: "2026-10-26" },
      ],
      [],
      "지난주 식사",
      "2026-10-30",
    );
    expect(keys).toEqual(["record:last-week"]);
    expect(validateMemoryIds([keys[0], keys[0]], keys)).toEqual(keys);
    expect(() => validateMemoryIds(["record:invented"], keys)).toThrow();
    expect(
      memoryCandidates(
        Array.from({ length: 100 }, (_, n) => ({ ...r, id: String(n) })),
        [],
        "식사",
        "2026-10-30",
      ),
    ).toHaveLength(60);
  });
});

it("recovers unfinished energy/name edits without accepting them as confirmed records", () => {
  const draft = {
    ...meal(),
    title: "",
    items: [
      { ...meal().items[0]!, name: "", kcal: { low: null, high: null, basis: "user_entered" } },
    ],
  };
  const recovered = draftMealSchema.parse(JSON.parse(JSON.stringify(draft)));
  expect(Number.isNaN(recovered.items[0]!.kcal!.low)).toBe(true);
  expect(mealTotals(recovered).pictured).toBeNull();
  expect(mealSchema.safeParse(recovered).success).toBe(false);
});
