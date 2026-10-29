import { createServerFn } from "@tanstack/react-start";
import { sanitizeCandidates, type MomoCandidate } from "./momo-schema";

export type { MomoCandidate } from "./momo-schema";
export type MomoResult = { candidates: MomoCandidate[]; reply: string; error?: "not_configured" | "service" | "parse" };

const SYSTEM = `You extract journal records for a GLP-1 user from their message and any attached photos.
Today's local date is {today}. Resolve relative dates ("오늘", "어제", "yesterday") to YYYY-MM-DD.
Return ONLY one JSON object, no prose, no markdown:
{"reply": string, "candidates": [...]}
"reply": one short warm sentence in the user's language. No medical advice. Never claim anything was saved: the user reviews first.
Every candidate MUST include "quote": the exact words copied from the user's text (or "photo" + visible text) that justify it.
Candidate shapes:
- {"type":"weight","value":number(kg),"date","time","timeHint","quote"}
- {"type":"injection","medication","doseValue","doseUnit","site","date","time","timeHint","quote"}
- {"type":"condition","label","note","date","time","timeHint","quote"}
- {"type":"measure","waist","hip","chest","thigh","date","quote"} (cm)
- {"type":"memory","note","date","quote"}
- {"type":"expense","amount":number,"currency","merchant","product","quantity":number,"date","quote"} (receipts only)
Rules:
- Use null for anything not explicitly stated. Never guess medication, dose, site, quantity or time.
- "time" is HH:MM 24h only if an exact clock time is stated; otherwise null.
- "timeHint" keeps approximate wording verbatim (e.g. "저녁", "this morning"), else null.
- For receipts copy only legible values. A pharmacy payment does NOT prove a GLP-1 purchase: product null unless printed.
- Never infer stock movements. Empty candidates list if nothing to record.`;

type Img = string; // data URL
type Input = { text: string; today: string; images?: Img[] };

function parseJson(content: string): { reply?: unknown; candidates?: unknown } | null {
  const cleaned = content.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export const extractWithMomo = createServerFn({ method: "POST" })
  .inputValidator((d: Input) => {
    const images = Array.isArray(d?.images) ? d.images : [];
    const text = typeof d?.text === "string" ? d.text : "";
    if ((text.trim().length === 0 && images.length === 0) || text.length > 4000) throw new Error("invalid text");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.today)) throw new Error("invalid date");
    if (images.length > 3 || images.some((u) => typeof u !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(u) || u.length > 2_000_000)) throw new Error("invalid images");
    return { text, today: d.today, images };
  })
  .handler(async ({ data }): Promise<MomoResult> => {
    const key = process.env["BASETEN_API_KEY"];
    if (!key) return { candidates: [], reply: "", error: "not_configured" };
    const userContent = data.images.length
      ? [{ type: "text", text: data.text || "(photo only)" }, ...data.images.map((url) => ({ type: "image_url", image_url: { url } }))]
      : data.text;
    const messages: { role: string; content: unknown }[] = [
      { role: "system", content: SYSTEM.replace("{today}", data.today) }, { role: "user", content: userContent },
    ];
    // Muse Spark Open has no guaranteed JSON mode: validate here and allow one repair attempt.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("https://inference.baseten.co/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "meta-models/muse-spark-open-1026", temperature: 0, max_tokens: 3000, messages }),
        });
        if (!res.ok) { console.error("baseten", res.status, (await res.text()).slice(0, 300)); return { candidates: [], reply: "", error: "service" }; }
        const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
        const content = json.choices?.[0]?.message?.content ?? "";
        const parsed = content ? parseJson(content) : null;
        if (parsed && Array.isArray(parsed.candidates)) {
          return { candidates: sanitizeCandidates(parsed.candidates, data.text), reply: typeof parsed.reply === "string" ? parsed.reply.slice(0, 300) : "" };
        }
        messages.push({ role: "assistant", content: content || "(empty)" }, { role: "user", content: "Your previous answer was not valid JSON. Reply again with ONLY the JSON object described." });
      } catch (e) {
        console.error("momo", e);
        return { candidates: [], reply: "", error: "service" };
      }
    }
    return { candidates: [], reply: "", error: "parse" };
  });
