// Server-side validation of model output. Anything not matching the expected types becomes null.
type S = string | null;
type N = number | null;
type Common = { date: S; quote: S };
export type MomoCandidate =
  | (Common & { type: "weight"; value: N; time: S; timeHint: S })
  | (Common & { type: "injection"; medication: S; doseValue: N; doseUnit: S; site: S; time: S; timeHint: S })
  | (Common & { type: "condition"; label: S; note: S; time: S; timeHint: S })
  | (Common & { type: "measure"; waist: N; hip: N; chest: N; thigh: N })
  | (Common & { type: "memory"; note: S })
  | (Common & { type: "expense"; amount: N; currency: S; merchant: S; product: S; quantity: N });

const str = (v: unknown, max = 200): S => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): N => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const date = (v: unknown): S => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const time = (v: unknown): S => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

export function sanitizeCandidates(raw: unknown[], sourceText: string): MomoCandidate[] {
  const out: MomoCandidate[] = [];
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    const c = r as Record<string, unknown>;
    let quote = str(c["quote"], 300);
    // A quote must come from the user's words (or describe a photo); otherwise drop it rather than show invented evidence.
    if (quote && !sourceText.includes(quote) && !/photo|사진|receipt|영수증/i.test(quote)) quote = null;
    const common = { date: date(c["date"]), quote };
    switch (c["type"]) {
      case "weight": out.push({ ...common, type: "weight", value: num(c["value"]), time: time(c["time"]), timeHint: str(c["timeHint"], 40) }); break;
      case "injection": out.push({ ...common, type: "injection", medication: str(c["medication"], 60), doseValue: num(c["doseValue"]), doseUnit: str(c["doseUnit"], 10), site: str(c["site"], 40), time: time(c["time"]), timeHint: str(c["timeHint"], 40) }); break;
      case "condition": out.push({ ...common, type: "condition", label: str(c["label"], 40), note: str(c["note"], 500), time: time(c["time"]), timeHint: str(c["timeHint"], 40) }); break;
      case "measure": out.push({ ...common, type: "measure", waist: num(c["waist"]), hip: num(c["hip"]), chest: num(c["chest"]), thigh: num(c["thigh"]) }); break;
      case "memory": out.push({ ...common, type: "memory", note: str(c["note"], 1000) }); break;
      case "expense": out.push({ ...common, type: "expense", amount: num(c["amount"]), currency: str(c["currency"], 5), merchant: str(c["merchant"], 80), product: str(c["product"], 80), quantity: num(c["quantity"]) }); break;
    }
  }
  return out;
}
