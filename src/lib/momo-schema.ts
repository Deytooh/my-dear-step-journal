import { parseMealAnalysis, type MealDetails } from "./meals";
import { validDate } from "./snapshot";
// Server-side validation of model output. Anything not matching the expected types becomes null.
type S = string | null;
type N = number | null;
type Common = { date: S; quote: S; photoIndices?: number[]; time?: S; timeHint?: S };
export type MomoCandidate =
  | (Common & { type: "water"; answer: "yes" | "not_yet" | null })
  | (Common & { type: "meal"; meal: MealDetails })
  | (Common & { type: "weight"; value: N; time: S; timeHint: S })
  | (Common & {
      type: "injection";
      medication: S;
      doseValue: N;
      doseUnit: S;
      site: S;
      time: S;
      timeHint: S;
    })
  | (Common & { type: "condition"; label: S; note: S; time: S; timeHint: S })
  | (Common & { type: "measure"; waist: N; hip: N; chest: N; thigh: N })
  | (Common & { type: "memory"; note: S })
  | (Common & {
      type: "purchase";
      medication: S;
      quantity: N;
      stockUnit: "pen" | "single" | "dose" | null;
      amount: N;
      currency: S;
      merchant: S;
    })
  | (Common & { type: "expense"; amount: N; currency: S; merchant: S; product: S; quantity: N });

const str = (v: unknown, max = 200): S =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown): N => {
  // JSON numbers and unambiguous decimal strings only. Never turn a decimal comma dose into a larger dose.
  const n = typeof v === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const date = (v: unknown): S => (typeof v === "string" && validDate(v) ? v : null);
const time = (v: unknown): S =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;

type PurchaseUnit = "pen" | "single" | "dose";
function statedStockUnit(quote: string): PurchaseUnit | null {
  const words = quote.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC").toLowerCase();
  const patterns: Array<[PurchaseUnit, RegExp]> = [
    ["pen", /\bpens?\b|\bstylos?\b|(?:^|[\s\d])펜(?=$|[\s\d개을를은는이가과와])/],
    ["dose", /\bdoses?\b|회분/],
    ["single", /\bsingle[ -]use\b|\ba\s+usage\s+unique\b|일회용|1회용/],
  ];
  const matches = patterns.filter(([, pattern]) => pattern.test(words));
  return matches.length === 1 ? matches[0]![0] : null;
}

export function sanitizeCandidates(
  raw: unknown[],
  sourceText: string,
  imageCount = 0,
): MomoCandidate[] {
  const out: MomoCandidate[] = [];
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    const c = r as Record<string, unknown>;
    let quote = str(c["quote"], 300);
    // A quote must come from the user's words (or describe a photo); otherwise drop it rather than show invented evidence.
    if (quote && !sourceText.includes(quote)) quote = null;
    const photoIndices = Array.isArray(c["photoIndices"])
      ? [
          ...new Set(
            c["photoIndices"].filter(
              (i): i is number =>
                typeof i === "number" && Number.isInteger(i) && i >= 0 && i < imageCount,
            ),
          ),
        ]
      : [];
    const common = {
      date: date(c["date"]),
      quote,
      photoIndices,
      time: time(c["time"]),
      timeHint:
        typeof c["timeHint"] === "string" && sourceText.includes(c["timeHint"])
          ? str(c["timeHint"], 40)
          : null,
    };

    switch (c["type"]) {
      case "water":
        // A water check-in needs words from the user, never an inference from a photo.
        if (quote)
          out.push({
            ...common,
            photoIndices: [],
            type: "water",
            answer: c["answer"] === "yes" || c["answer"] === "not_yet" ? c["answer"] : null,
          });
        break;
      case "meal": {
        const meal = parseMealAnalysis(c["meal"], "pending");
        if (meal) out.push({ ...common, type: "meal", meal });
        break;
      }
      case "weight":
        out.push({
          ...common,
          type: "weight",
          value: num(c["value"]),
          time: time(c["time"]),
          timeHint:
            typeof c["timeHint"] === "string" && sourceText.includes(c["timeHint"])
              ? str(c["timeHint"], 40)
              : null,
        });
        break;
      case "injection":
        out.push({
          ...common,
          type: "injection",
          medication: str(c["medication"], 60),
          doseValue: num(c["doseValue"]),
          doseUnit: str(c["doseUnit"], 10),
          site: str(c["site"], 40),
          time: time(c["time"]),
          timeHint:
            typeof c["timeHint"] === "string" && sourceText.includes(c["timeHint"])
              ? str(c["timeHint"], 40)
              : null,
        });
        break;
      case "condition":
        out.push({
          ...common,
          type: "condition",
          label: str(c["label"], 40),
          note: str(c["note"], 500),
          time: time(c["time"]),
          timeHint:
            typeof c["timeHint"] === "string" && sourceText.includes(c["timeHint"])
              ? str(c["timeHint"], 40)
              : null,
        });
        break;
      case "measure":
        out.push({
          ...common,
          type: "measure",
          waist: num(c["waist"]),
          hip: num(c["hip"]),
          chest: num(c["chest"]),
          thigh: num(c["thigh"]),
        });
        break;
      case "memory":
        out.push({ ...common, type: "memory", note: str(c["note"], 1000) });
        break;
      case "purchase": {
        if (!quote) break;
        const statedUnit = statedStockUnit(quote);
        out.push({
          ...common,
          type: "purchase",
          stockUnit:
            c["stockUnit"] === undefined || c["stockUnit"] === null || c["stockUnit"] === statedUnit
              ? statedUnit
              : null,
          medication: str(c["medication"], 60),
          quantity: num(c["quantity"]),
          amount: num(c["amount"]),
          currency: str(c["currency"], 5),
          merchant: str(c["merchant"], 80),
        });
        break;
      }
      case "expense":
        out.push({
          ...common,
          type: "expense",
          amount: num(c["amount"]),
          currency: str(c["currency"], 5),
          merchant: str(c["merchant"], 80),
          product: str(c["product"], 80),
          quantity: num(c["quantity"]),
        });
        break;
    }
  }
  return out;
}
