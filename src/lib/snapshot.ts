import { z } from "zod";
import { mealSchema, photoRefSchema } from "./meals";
import type { JournalSnapshot } from "./journal";
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
const date = z.string().refine(validDate);
const num = z.number().finite();
const evidence = z
  .object({
    method: z.enum(["manual", "text", "voice", "photos", "mixed"]),
    text: z.string().max(4000),
    photos: z.array(photoRefSchema).max(3),
    quote: z.string().nullable(),
    attribution: z
      .object({
        status: z.enum(["linked", "unclear"]),
        linkedPhotoIndices: z.array(z.number().int().min(0).max(2)).max(3),
      })
      .optional(),
    proposed: z.record(z.string()),
    confirmed: z.record(z.string()),
  })
  .passthrough()
  .refine(
    (e) => !e.attribution || e.attribution.linkedPhotoIndices.every((i) => i < e.photos.length),
    "photo attribution",
  )
  .refine((e) => e.quote === null || e.text.includes(e.quote), "quote");
const base = z
  .object({
    id: z.string().min(1),
    localDate: date,
    precision: z.enum(["exact", "date_only", "part_of_day", "unknown"]),
    at: z.string().datetime().nullable(),
    createdAt: z.string(),
    source: z.literal("manual_text"),
    demo: z.boolean().optional(),
    evidence: evidence.optional(),
    partOfDay: z.enum(["morning", "afternoon", "evening", "night"]).nullable().optional(),
  })
  .passthrough();
const record = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("weight"), value: num.min(20).max(400), unit: z.literal("kg") }),
  base.extend({
    type: z.literal("injection"),
    medication: z.string().nullable(),
    doseValue: num.nonnegative().nullable(),
    doseUnit: z.string().nullable(),
    site: z.string().nullable(),
    usedStock: z.boolean(),
    stockPurchaseId: z.string().nullable().optional(),
    stockIdentity: z.string().nullable().optional(),
  }),
  base.extend({ type: z.literal("condition"), label: z.string() }),
  base.extend({
    type: z.literal("memory"),
    note: z.string(),
    photo: photoRefSchema.nullable().optional(),
  }),
  base.extend({
    type: z.literal("measure"),
    unit: z.literal("cm"),
    waist: num.nullable(),
    hip: num.nullable(),
    chest: num.nullable(),
    thigh: num.nullable(),
  }),
  base.extend({ type: z.literal("water"), answer: z.enum(["yes", "not_yet"]) }),
  base.extend({ type: z.literal("meal"), meal: mealSchema }),
]);
const schema = z
  .object({
    records: z.array(record),
    purchases: z.array(
      z
        .object({
          id: z.string().min(1),
          localDate: date,
          amount: num.nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          doses: num.nonnegative(),
          medication: z.string().nullable(),
          evidence: evidence.optional(),
          stockUnit: z.enum(["pen", "single", "dose"]).nullable().optional(),
          addsStock: z.boolean().optional(),
          quantity: num.nonnegative().nullable().optional(),
        })
        .passthrough(),
    ),
    reminder: z.object({ id: z.string(), at: z.string().datetime() }).passthrough().nullable(),
    stockAdjust: num,
    settings: z
      .object({
        showMomo: z.boolean(),
        locale: z.enum(["ko", "en", "fr"]).optional(),
        trackingInterests: z
          .array(z.enum(["injection", "weight", "condition", "meal", "memory"]))
          .max(5)
          .optional(),
        onboarding: z
          .object({
            status: z.enum(["completed", "skipped"]),
            dismissedHints: z
              .array(z.enum(["manual", "momo"]))
              .max(2)
              .optional(),
          })
          .optional(),
        demoMode: z.boolean().optional(),
        stockAdjustments: z.record(z.object({ identity: z.string(), delta: num })).optional(),
        prompts: z
          .object({
            hidden: z.boolean().optional(),
            aiConsent: z.boolean().optional(),
            context: z
              .object({
                day: date,
                id: z.string().max(180),
                status: z.enum(["answered", "skipped"]),
              })
              .optional(),
            off: z.array(z.string()).optional(),
            answered: z.record(date).optional(),
            skipped: z.record(date).optional(),
            done: z.record(date).optional(),
          })
          .passthrough()
          .optional(),
        timezone: z.string().refine((tz) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        }),
      })
      .passthrough(),
  })
  .passthrough();
export function validateSnapshot(raw: unknown): JournalSnapshot {
  const value = schema.parse(raw);
  const ids = [...value.records, ...value.purchases].map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_ids");
  for (const r of value.records)
    if ((r.precision === "exact") !== (r.at !== null)) throw new Error("precision");
  return value as unknown as JournalSnapshot;
}
