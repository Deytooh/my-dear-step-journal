import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeCandidates, type MomoCandidate } from "./momo-schema";
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
Today's local date is {today}. Resolve relative dates ("오늘", "어제", "yesterday") to YYYY-MM-DD.
Return ONLY one JSON object, no prose, no markdown:
{"reply": string, "candidates": [...]}
"reply": one short warm sentence in the user's language. No medical advice. Never claim anything was saved: the user reviews first.
For text-derived candidates, quote must be an exact substring of the input text. For photo-derived candidates quote must be null. Never invent quotations.
Candidate shapes:
- {"type":"weight","value":number(kg),"date","time","timeHint","quote"}
- {"type":"injection","medication","doseValue","doseUnit","site","date","time","timeHint","quote"}
- {"type":"condition","label","note","date","time","timeHint","quote"}
- {"type":"measure","waist","hip","chest","thigh","date","quote"} (cm)
- {"type":"memory","note","date","quote"}
- {"type":"expense","amount":number,"currency","merchant","product","quantity":number,"date","quote"} (receipts only)
Rules:
- Use null for anything not explicitly stated. Never guess medication, dose, date, site, quantity or time. A missing date remains null.
- "time" is HH:MM 24h only if an exact clock time is stated; otherwise null.
- "timeHint" keeps approximate wording verbatim (e.g. "저녁", "this morning"), else null.
- For receipts copy only legible values. A pharmacy payment does NOT prove a GLP-1 purchase: product null unless printed.
- Never infer stock movements. Empty candidates list if nothing to record.`;

export const extractWithMomo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema.extend({ today: z.string().refine(validDate) }))
  .handler(async ({ data, context }): Promise<MomoResult> => {
    try {
      const result = await metaJSON(
        SYSTEM.replace("{today}", data.today),
        { text: data.text, today: data.today, locale: data.locale },
        data.images,
        (raw) => {
          const parsed = z
            .object({ candidates: z.array(z.unknown()).max(20), reply: z.string().max(300) })
            .parse(raw);
          return {
            candidates: sanitizeCandidates(parsed.candidates, data.text),
            reply: parsed.reply,
          };
        },
        quota(context.supabase),
      );
      return { ...result.value, model: result.model };
    } catch (error) {
      return {
        candidates: [],
        reply: "",
        error: error instanceof ProviderError ? error.code : "service",
      };
    }
  });
