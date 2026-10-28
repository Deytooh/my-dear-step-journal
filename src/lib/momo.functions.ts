import { createServerFn } from "@tanstack/react-start";

export type MomoCandidate =
  | { type: "weight"; value: number; date?: string | null; time?: string | null }
  | { type: "injection"; medication?: string | null; doseValue?: number | null; doseUnit?: string | null; site?: string | null; date?: string | null; time?: string | null }
  | { type: "condition"; label: string; note?: string | null; date?: string | null; time?: string | null }
  | { type: "measure"; waist?: number | null; hip?: number | null; chest?: number | null; thigh?: number | null; date?: string | null }
  | { type: "memory"; note: string; date?: string | null };

export type MomoResult = { candidates: MomoCandidate[]; reply: string; error?: string };

const SYSTEM = `You extract health-journal records for a GLP-1 user from their message.
Today's local date is {today}. Resolve relative dates ("어제", "yesterday") to YYYY-MM-DD.
Return ONLY JSON: {"reply": string (one warm short sentence in the user's language, no medical advice; never claim anything was saved — the user reviews and confirms first), "candidates": [...]}.
Candidate types:
- {"type":"weight","value":number(kg),"date","time"}
- {"type":"injection","medication","doseValue","doseUnit","site","date","time"}
- {"type":"condition","label","note","date","time"}
- {"type":"measure","waist","hip","chest","thigh","date"} (cm)
- {"type":"memory","note","date"}
Use null when unknown; time is HH:MM 24h or null. Never invent values not stated. Empty list if nothing to record.`;

export const extractWithMomo = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; today: string }) => {
    if (typeof d?.text !== "string" || d.text.trim().length === 0 || d.text.length > 4000) throw new Error("invalid text");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.today)) throw new Error("invalid date");
    return d;
  })
  .handler(async ({ data }): Promise<MomoResult> => {
    const key = process.env["BASETEN_API_KEY"];
    if (!key) return { candidates: [], reply: "", error: "not_configured" };
    const model = "meta-models/muse-spark-open-1026";
    try {
      const res = await fetch("https://inference.baseten.co/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 2500,
          messages: [{ role: "system", content: SYSTEM.replace("{today}", data.today) }, { role: "user", content: data.text }],
        }),
      });
      if (!res.ok) { console.error("baseten", res.status, await res.text()); return { candidates: [], reply: "", error: "service" }; }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { candidates: [], reply: "" };
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.filter((c: { type?: string }) =>
        ["weight", "injection", "condition", "measure", "memory"].includes(c?.type ?? "")) : [];
      return { candidates, reply: typeof parsed.reply === "string" ? parsed.reply : "" };
    } catch (e) {
      console.error("momo", e);
      return { candidates: [], reply: "", error: "service" };
    }
  });
