import { z } from "zod";

export const photoRefSchema = z
  .string()
  .max(2000000)
  .refine(
    (v) =>
      /^(storage:[a-zA-Z0-9-]+\/[^\s]+|localphoto:[a-zA-Z0-9-]+:[a-f0-9]{64}|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*)$/.test(
        v,
      ),
    "photo_ref",
  );
const text = z.string().trim().min(1).max(300);
export const kcalSchema = z
  .object({
    low: z.number().finite().min(0).max(10000),
    high: z.number().finite().min(0).max(10000),
    basis: z.enum(["photo_estimate", "label", "user_entered"]),
  })
  .refine((k) => k.low <= k.high, "range");
export const mealItemSchema = z.object({
  id: text,
  name: text,
  portionDescription: z.string().max(300).nullable(),
  ingredients: z
    .array(
      z.object({
        name: text,
        basis: z.enum(["visible_estimate", "possible", "user_provided", "label"]),
      }),
    )
    .max(30),
  kcal: kcalSchema.nullable(),
  included: z.boolean(),
});
export const mealSchema = z
  .object({
    title: text,
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other", "unknown"]),
    items: z.array(mealItemSchema).max(30),
    photoRefs: z.array(photoRefSchema).max(3),
    consumedFraction: z.number().finite().min(0).max(1).nullable(),
    consumptionNote: z.string().max(1000).optional(),
    note: z.string().max(4000).optional(),
    estimateAssumptions: z.array(z.string().max(500)).max(10),
    analysis: z
      .object({
        model: text,
        promptVersion: text,
        schemaVersion: z.number().int(),
        analyzedAt: z.string().datetime(),
      })
      .optional(),
  })
  .refine((m) => new Set(m.items.map((i) => i.id)).size === m.items.length, "duplicate_food_ids");
export type MealItem = z.infer<typeof mealItemSchema>;
export type MealDetails = z.infer<typeof mealSchema>;
export function mealTotals(meal: MealDetails) {
  const included = meal.items.filter((i) => i.included);
  const known = included.filter(
    (i) =>
      i.kcal !== null &&
      Number.isFinite(i.kcal.low) &&
      Number.isFinite(i.kcal.high) &&
      i.kcal.low >= 0 &&
      i.kcal.low <= i.kcal.high,
  );
  const pictured = known.length
    ? {
        low: known.reduce((s, i) => s + i.kcal!.low, 0),
        high: known.reduce((s, i) => s + i.kcal!.high, 0),
      }
    : null;
  return {
    pictured,
    partial: known.length < included.length,
    consumed:
      pictured && meal.consumedFraction !== null
        ? { low: pictured.low * meal.consumedFraction, high: pictured.high * meal.consumedFraction }
        : null,
  };
}
export const emptyMeal = (): MealDetails => ({
  title: "",
  mealType: "unknown",
  items: [],
  photoRefs: [],
  consumedFraction: null,
  estimateAssumptions: [],
});

/** No aggregate from the model is accepted; eaten amounts are always a user choice. */
export function parseMealAnalysis(raw: unknown, model: string): MealDetails | null {
  const result = mealSchema.safeParse(raw);
  if (!result.success || !result.data.items.length) return null;
  return {
    ...result.data,
    mealType: "unknown",
    photoRefs: [],
    consumedFraction: null,
    analysis: {
      model,
      promptVersion: "meal-v1",
      schemaVersion: 1,
      analyzedAt: new Date().toISOString(),
    },
  };
}

// Recovery accepts unfinished fields; the strict meal schema is still mandatory at commit.
export const draftMealSchema = mealSchema
  .innerType()
  .extend({
    title: z.string().max(300),
    items: z
      .array(
        mealItemSchema.extend({
          name: z.string().max(300),
          kcal: z
            .object({
              low: z.number().nullable(),
              high: z.number().nullable(),
              basis: z.enum(["photo_estimate", "label", "user_entered"]),
            })
            .nullable(),
        }),
      )
      .max(30),
  })
  .transform((m): MealDetails => ({
    ...m,
    items: m.items.map((i) => ({
      ...i,
      kcal: i.kcal ? { ...i.kcal, low: i.kcal.low ?? NaN, high: i.kcal.high ?? NaN } : null,
    })),
  }));

/** Copy a starting point, never old photo estimates or a claim about today's intake. */
export function mealForRepeat(previous: MealDetails, newId: () => string): MealDetails {
  return {
    ...emptyMeal(),
    title: previous.title,
    mealType: previous.mealType,
    items: previous.items
      .filter((item) => item.included)
      .map((item) => ({
        id: newId(),
        name: item.name,
        portionDescription: item.portionDescription,
        included: true,
        ingredients: [],
        kcal: null,
      })),
  };
}
