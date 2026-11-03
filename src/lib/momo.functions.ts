import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeCandidates, type MomoCandidate } from "./momo-schema";
import { DEFAULT_TZ } from "./dates";
import { validDate } from "./snapshot";
import { inputSchema, metaJSON, quota, ProviderError, type AIError } from "./meta-provider.server";
import { z } from "zod";
export type { MomoCandidate } from "./momo-schema";
export type MomoResult = {
  candidates: MomoCandidate[];
  reply: string;
  model?: string;
  error?: AIError;
};
const SYSTEM = `You extract journal records for a GLP-1 user from their message and any attached photos.
Today's explicit local date is {today}, timezone {timezone}. Resolve relative dates ("오늘", "어제", "yesterday", weekday names) against this local context. A past-tense "Friday evening" means the corresponding most recent Friday and timeHint "evening", not an invented clock time. If ambiguous, date null.
Return ONLY one JSON object, no prose, no markdown:
{"reply": string, "candidates": [...]}
"reply": one short warm sentence in the user's language. No medical advice. Never claim anything was saved: the user reviews first.
For text-derived candidates, quote must be an exact substring of the input text. For photo-derived candidates quote must be null. Never invent quotations.
Each candidate may include photoIndices: zero-based indices of supporting attached images. Only reference images actually used.
Candidate shapes:
- {"type":"meal","date","time","timeHint","quote","photoIndices","meal":{"title":string,"mealType":"unknown","items":[{"id":string,"name":string,"portionDescription":string|null,"ingredients":[{"name":string,"basis":"visible_estimate"|"possible"|"user_provided"|"label"}],"kcal":{"low":number,"high":number,"basis":"photo_estimate"|"label"|"user_entered"}|null,"included":true}],"photoRefs":[],"consumedFraction":null,"estimateAssumptions":[string]}}
- {"type":"weight","value":number(kg),"date","time","timeHint","quote"}
- {"type":"injection","medication","doseValue","doseUnit","site","date","time","timeHint","quote"}
- {"type":"condition","label","note","date","time","timeHint","quote"}
- {"type":"measure","waist","hip","chest","thigh","date","time","timeHint","quote"} (cm)
- {"type":"memory","note","date","time","timeHint","quote"}
- {"type":"purchase","medication","quantity":number,"amount":number|null,"currency":"KRW"|"EUR"|"USD"|null,"merchant","date","quote"} when the user SAYS they bought/received medication or pens/injections (e.g. "마운자로 하나 샀어", "주사 2개 샀어", "bought 4 pens"). quantity = stated count ("하나"=1, "두 개"=2). This is the only way stock is added, and the user confirms it.
- {"type":"expense","amount":number,"currency","merchant","product","quantity":number,"date","quote"} (receipts only)
Rules:
- Use null for anything not explicitly stated. Never guess medication, dose, date, site, quantity or time. A missing date remains null.
- "time" is HH:MM 24h only if an exact clock time is stated; otherwise null.
- "timeHint" keeps approximate wording verbatim (e.g. "저녁", "this morning"), else null.
- For receipts copy only legible values. A pharmacy payment does NOT prove a GLP-1 purchase: product null unless printed.
- A meal photo only gives estimates: state portion assumptions, do not infer date, time, meal type, eaten fraction, hidden ingredients or allergens. Mixed dishes are one calorie row with ingredient descriptions; no aggregate totals. No meal candidate for an unclear/non-food photo. Do not convert meal information into memory or expense.
- Never infer stock movements beyond an explicitly stated purchase. Empty candidates list if nothing to record.`;

export const extractWithMomo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    inputSchema.extend({
      today: z.string().refine(validDate),
      timezone: z
        .string()
        .max(100)
        .refine((tz) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        })
        .default(DEFAULT_TZ),
    }),
  )
  .handler(async ({ data, context }): Promise<MomoResult> => {
    try {
      const result = await metaJSON(
        SYSTEM.replace("{today}", data.today).replace("{timezone}", data.timezone),
        { text: data.text, today: data.today, timezone: data.timezone, locale: data.locale },
        data.images,
        (raw) => {
          const parsed = z
            .object({ candidates: z.array(z.unknown()).max(20), reply: z.string().max(300) })
            .parse(raw);
          return {
            candidates: sanitizeCandidates(parsed.candidates, data.text, data.images.length),
            reply: parsed.reply,
          };
        },
        quota(context.supabase),
      );
      return {
        ...result.value,
        candidates: result.value.candidates.map((candidate) =>
          candidate.type === "meal"
            ? {
                ...candidate,
                meal: {
                  ...candidate.meal,
                  analysis: {
                    model: result.model,
                    promptVersion: "journal-v3",
                    schemaVersion: 1,
                    analyzedAt: new Date().toISOString(),
                  },
                },
              }
            : candidate,
        ),
        model: result.model,
      };
    } catch (error) {
      return {
        candidates: [],
        reply: "",
        error: error instanceof ProviderError ? error.code : "service",
      };
    }
  });
