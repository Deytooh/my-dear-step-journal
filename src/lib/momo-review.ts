import { z } from "zod";
import { photoRefSchema } from "./meals";
import type { JournalSnapshot } from "./journal";
import { FIELDS, isDuplicate, type Draft, type Entry } from "./momo-drafts";

/**
 * Recheck edited selections immediately before saving, including earlier drafts
 * in this batch. A duplicate warning followed by deliberate re-inclusion is
 * allowed; callers must clear `dup` when the draft's fields change again.
 */
export function unexpectedDuplicateKeys(
  entries: Array<{ d: Draft; e: Entry }>,
  snapshot: Pick<JournalSnapshot, "records" | "purchases">,
): string[] {
  const records = [...snapshot.records];
  const purchases = [...snapshot.purchases];
  const unexpected: string[] = [];
  for (const { d, e } of entries) {
    if (!d.on || "error" in e) continue;
    if (
      !d.dup &&
      isDuplicate(
        e,
        records.filter((record) => record.id !== d.key),
        purchases.filter((purchase) => purchase.id !== d.key),
      )
    ) {
      unexpected.push(d.key);
      continue;
    }
    if ("record" in e) records.push(e.record);
    else purchases.push(e.purchase);
  }
  return unexpected;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isStringDictionary = (value: unknown): value is Record<string, string> =>
  isPlainObject(value) && Object.values(value).every((field) => typeof field === "string");
const nullableText = (value: unknown) => value === null || typeof value === "string";
const analysisSchema = z.object({
  model: z.string().trim().min(1).max(300),
  promptVersion: z.string().trim().min(1).max(300),
  schemaVersion: z.number().int(),
  analyzedAt: z.string().datetime(),
});
const recoveredEvidenceSchema = z
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
    analysis: analysisSchema.optional(),
  })
  .refine(
    (e) => !e.attribution || e.attribution.linkedPhotoIndices.every((i) => i < e.photos.length),
    "photo attribution",
  )
  .refine((evidence) => evidence.quote === null || evidence.text.includes(evidence.quote), "quote");

/**
 * Validate recovery data before it reaches draft controls or source viewers.
 * This checks structure, not save readiness: incomplete/invalid field values
 * remain editable. A false result must not discard the separate raw capture.
 */
export function isRecoveredDrafts(value: unknown): value is Draft[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  const keys = new Set<string>();
  return value.every((draft: unknown) => {
    if (
      !isPlainObject(draft) ||
      typeof draft["key"] !== "string" ||
      !draft["key"].trim() ||
      keys.has(draft["key"]) ||
      typeof draft["on"] !== "boolean" ||
      (draft["dup"] !== undefined && typeof draft["dup"] !== "boolean") ||
      typeof draft["type"] !== "string" ||
      !Object.prototype.hasOwnProperty.call(FIELDS, draft["type"]) ||
      !isStringDictionary(draft["f"]) ||
      (draft["mealFractionInput"] !== undefined &&
        typeof draft["mealFractionInput"] !== "string") ||
      !nullableText(draft["quote"]) ||
      !nullableText(draft["timeHint"])
    )
      return false;
    const evidence = draft["evidence"];
    if (
      evidence !== undefined &&
      (!isPlainObject(evidence) ||
        !isStringDictionary(evidence["proposed"]) ||
        !isStringDictionary(evidence["confirmed"]) ||
        (evidence["analysis"] !== undefined && !isPlainObject(evidence["analysis"])) ||
        !recoveredEvidenceSchema.safeParse(evidence).success)
    )
      return false;
    keys.add(draft["key"]);
    return true;
  });
}

/** Recover the valid parts of raw input without allowing external image loads. */
export function recoveredCaptureSources(value: unknown) {
  const data = isPlainObject(value) ? value : {};
  const text = typeof data["text"] === "string" ? data["text"] : "";
  const rawImages = Array.isArray(data["images"]) ? data["images"] : [];
  const images = rawImages
    .filter(
      (photo): photo is string =>
        typeof photo === "string" &&
        photo.length <= 2_000_000 &&
        /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo),
    )
    .slice(0, 3);
  const complete =
    typeof data["text"] === "string" &&
    Array.isArray(data["images"]) &&
    rawImages.length === images.length;
  return { text, images, complete };
}
