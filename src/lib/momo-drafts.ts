// Editable Momo drafts. Model output never becomes a record until the user confirms a draft.
import type { MomoCandidate } from "./momo-schema";
import type { Evidence, JournalRecord, PartOfDay, Purchase } from "./journal";
import { mealSchema } from "./meals";
import { instantFromLocal } from "./dates";
import { parseAmountInput } from "./amount-input";
import { purchaseMoneyFacts } from "./purchase-money";
import { isPartOfDay } from "./time-of-day";

export type DraftType = MomoCandidate["type"];
export type FieldKind = "text" | "num" | "date" | "time";
export type FieldDef = { k: string; label: string; kind: FieldKind; important?: boolean };
export type Draft = {
  evidence?: Evidence;
  key: string;
  type: DraftType;
  on: boolean;
  dup?: boolean;
  quote: string | null;
  timeHint: string | null;
  f: Record<string, string>;
};

export const FIELDS: Record<DraftType, FieldDef[]> = {
  water: [
    { k: "answer", label: "type.water", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  meal: [
    { k: "meal", label: "type.meal", kind: "text" },
    { k: "date", label: "f.date", kind: "date", important: true },
    { k: "time", label: "f.time", kind: "time" },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  weight: [
    { k: "value", label: "f.value", kind: "num", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time", important: true },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  injection: [
    { k: "medication", label: "f.medication", kind: "text", important: true },
    { k: "doseValue", label: "f.dose", kind: "num", important: true },
    { k: "doseUnit", label: "ux.doseUnit", kind: "text" },
    { k: "site", label: "f.site", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time", important: true },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  condition: [
    { k: "label", label: "f.feeling", kind: "text", important: true },
    { k: "note", label: "f.note", kind: "text" },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  measure: [
    { k: "waist", label: "f.waist", kind: "num" },
    { k: "hip", label: "f.hip", kind: "num" },
    { k: "chest", label: "f.chest", kind: "num" },
    { k: "thigh", label: "f.thigh", kind: "num" },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  memory: [
    { k: "note", label: "f.note", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
    { k: "partOfDay", label: "time.period", kind: "text" },
  ],
  purchase: [
    { k: "medication", label: "f.medication", kind: "text", important: true },
    { k: "quantity", label: "f.quantity", kind: "num", important: true },
    { k: "stockUnit", label: "f.unit", kind: "text", important: true },
    { k: "amount", label: "f.amount", kind: "num" },
    { k: "currency", label: "evidence.currency", kind: "text" },
    { k: "merchant", label: "f.merchant", kind: "text" },
    { k: "date", label: "f.date", kind: "date", important: true },
  ],
  expense: [
    { k: "currency", label: "evidence.currency", kind: "text", important: true },
    { k: "amount", label: "f.amount", kind: "num", important: true },
    { k: "merchant", label: "f.merchant", kind: "text", important: true },
    { k: "product", label: "f.product", kind: "text", important: true },
    { k: "quantity", label: "f.quantity", kind: "num" },
    { k: "date", label: "f.date", kind: "date", important: true },
  ],
};

const s = (v: unknown) => (v == null ? "" : String(v));

export function candidateToDraft(
  c: MomoCandidate,
  key: string,
  today: string,
  input?: Pick<Evidence, "method" | "text" | "photos">,
): Draft {
  const f: Record<string, string> = {};
  const rec = c as unknown as Record<string, unknown>;
  for (const def of FIELDS[c.type])
    f[def.k] =
      def.k === "partOfDay"
        ? s(c.time ? null : partOfDayFromHint(c.timeHint ?? null))
        : def.k === "date"
          ? s(rec["date"])
          : s(rec[def.k]);
  const photos = c.photoIndices?.length
    ? c.photoIndices.flatMap((i) => (input?.photos[i] ? [input.photos[i]!] : []))
    : c.quote
      ? []
      : (input?.photos ?? []);
  if (c.type === "meal") f["meal"] = JSON.stringify({ ...c.meal, photoRefs: photos });
  return {
    ...(input
      ? {
          evidence: {
            ...input,
            photos,
            quote: c.quote && input.text.includes(c.quote) ? c.quote : null,
            proposed: { ...f },
            confirmed: {},
          },
        }
      : {}),
    key,
    type: c.type,
    on: true,
    quote: c.quote,
    timeHint: c.timeHint ?? null,
    f,
  };
}

export const missingFields = (d: Draft) =>
  FIELDS[d.type].filter((x) => x.important && !d.f[x.k]?.trim()).map((x) => x.k);

const HINTS: [RegExp, PartOfDay][] = [
  [/아침|오전|morning|matin/i, "morning"],
  [/오후|점심|afternoon|après-midi|midi/i, "afternoon"],
  [/저녁|evening|soir/i, "evening"],
  [/밤|night|nuit/i, "night"],
];
export function partOfDayFromHint(h: string | null): PartOfDay | null {
  if (!h) return null;
  return HINTS.find(([re]) => re.test(h))?.[1] ?? null;
}

const n = (v: string | undefined) => {
  if (!v?.trim()) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
};

export type Entry = { record: JournalRecord } | { purchase: Purchase } | { error: string };

export function draftToEntry(d: Draft, id: string, tz: string, today: string): Entry {
  const f = d.f;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(f["date"] ?? "") ? f["date"]! : "";
  const time = /^\d{2}:\d{2}$/.test(f["time"] ?? "") ? f["time"]! : null;
  const period = f["partOfDay"];
  const validatedPeriod = isPartOfDay(period) ? period : null;
  if (period && !validatedPeriod) return { error: "partOfDay" };
  // An explicit blank clears an approximate suggestion; old cached drafts still retain their hint.
  const pod = time ? null : period === undefined ? partOfDayFromHint(d.timeHint) : validatedPeriod;
  if (
    f["date"] &&
    (!date || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
  )
    return { error: "date" };
  if (f["time"] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f["time"])) return { error: "time" };
  const evidence = d.evidence
    ? {
        ...d.evidence,
        proposed: {
          ...d.evidence.proposed,
          ...(period !== undefined && d.evidence.proposed["partOfDay"] === undefined
            ? { partOfDay: d.evidence.proposed["time"] ? "" : s(partOfDayFromHint(d.timeHint)) }
            : {}),
        },
        confirmed: { ...f, ...(period !== undefined ? { partOfDay: s(pod) } : {}) },
      }
    : undefined;
  const base = {
    ...(evidence ? { evidence } : {}),
    id,
    localDate: date,
    createdAt: new Date().toISOString(),
    source: "manual_text" as const,
    precision: time ? ("exact" as const) : pod ? ("part_of_day" as const) : ("date_only" as const),
    at: time ? instantFromLocal(date, time, tz) : null,
    partOfDay: pod,
  };
  const bad = (k: string) => ({ error: k });
  // The journal requires a calendar day: ask for it rather than silently using today.
  if (!date) return bad("date");
  switch (d.type) {
    case "water": {
      const answer = f["answer"];
      if (answer !== "yes" && answer !== "not_yet") return bad("answer");
      return { record: { ...base, type: "water", answer } };
    }
    case "meal": {
      try {
        const parsed = mealSchema.safeParse(JSON.parse(f["meal"] ?? ""));
        if (!parsed.success) return bad("meal");
        const meal = {
          ...parsed.data,
          photoRefs: d.evidence?.photos ?? parsed.data.photoRefs,
          ...(d.evidence?.analysis ? { analysis: d.evidence.analysis } : {}),
        };
        return { record: { ...base, type: "meal", meal } };
      } catch {
        return bad("meal");
      }
    }
    case "weight": {
      const v = n(f["value"]);
      if (v == null || Number.isNaN(v) || v < 20 || v > 400) return bad("value");
      return { record: { ...base, type: "weight", value: Math.round(v * 10) / 10, unit: "kg" } };
    }
    case "injection": {
      const dv = n(f["doseValue"]);
      if (Number.isNaN(dv) || (dv !== null && dv < 0)) return bad("doseValue");
      if (
        dv !== null &&
        f["doseUnit"] &&
        !["mg", "mcg", "µg", "mL", "ml", "IU", "unit"].includes(f["doseUnit"]!)
      )
        return bad("doseUnit");
      return {
        record: {
          ...base,
          type: "injection",
          medication: f["medication"]?.trim() || null,
          doseValue: dv,
          doseUnit: dv != null ? f["doseUnit"]?.trim() || null : null,
          site: f["site"]?.trim() || null,
          usedStock: false,
        },
      };
    }
    case "condition": {
      const label = f["label"]?.trim();
      if (!label) return bad("label");
      return {
        record: {
          ...base,
          type: "condition",
          label,
          ...(f["note"]?.trim() ? { note: f["note"].trim() } : {}),
        },
      };
    }
    case "measure": {
      const m = {
        waist: n(f["waist"]),
        hip: n(f["hip"]),
        chest: n(f["chest"]),
        thigh: n(f["thigh"]),
      };
      if (Object.values(m).some((v) => Number.isNaN(v) || (v !== null && (v < 10 || v > 300))))
        return bad("waist");
      if (Object.values(m).every((v) => v == null)) return bad("waist");
      return { record: { ...base, type: "measure", unit: "cm", ...m } };
    }
    case "memory": {
      const note = f["note"]?.trim();
      if (!note) return bad("note");
      return { record: { ...base, type: "memory", note, photo: evidence?.photos[0] ?? null } };
    }
    case "purchase": {
      const q = n(f["quantity"]);
      if (q == null || !Number.isInteger(q) || q <= 0) return bad("quantity");
      if (!date) return bad("date");
      const unit = f["stockUnit"]?.trim() || "";
      const stockUnit = unit === "pen" || unit === "single" || unit === "dose" ? unit : null;
      if (unit && !stockUnit) return bad("stockUnit");
      const a = parseAmountInput(f["amount"]);
      if (a !== null && (Number.isNaN(a) || a < 0)) return bad("amount");
      const cur = (f["currency"] ?? "").trim().toUpperCase() || "KRW";
      if (!/^[A-Z]{3}$/.test(cur)) return bad("currency");
      // Stated purchases add stock only after the user confirms this draft.
      return {
        purchase: {
          ...(evidence ? { evidence } : {}),
          id,
          localDate: date,
          amount: a ?? 0,
          currency: cur,
          quantity: q,
          doses: q,
          medication: f["medication"]?.trim() || null,
          product: null,
          merchant: f["merchant"]?.trim() || null,
          stockUnit,
          addsStock: true,
        },
      };
    }
    case "expense": {
      const a = parseAmountInput(f["amount"]);
      if (a == null || Number.isNaN(a) || a <= 0) return bad("amount");
      if (!date) return bad("date");
      if (!/^[A-Z]{3}$/.test(f["currency"] ?? "")) return bad("currency");
      const q = n(f["quantity"]);
      if (q !== null && (!Number.isInteger(q) || q <= 0)) return bad("quantity");
      // Receipts are recorded as expenses only; inventory is never changed from a photo.
      return {
        purchase: {
          ...(evidence ? { evidence } : {}),
          quantity: q,
          id,
          localDate: date,
          amount: a,
          currency: f["currency"]!,
          doses: 0,
          medication: null,
          product: f["product"]?.trim() || null,
          merchant: f["merchant"]?.trim() || null,
          stockUnit: null,
          addsStock: false,
        },
      };
    }
  }
}

/** A conservative duplicate check against what's already in the journal. */
export function isDuplicate(e: Entry, records: JournalRecord[], purchases: Purchase[]) {
  if ("purchase" in e) {
    const next = e.purchase;
    const money = purchaseMoneyFacts(next);
    return purchases.some((purchase) => {
      if (purchase.localDate !== next.localDate) return false;
      const prior = purchaseMoneyFacts(purchase);
      const text = (value: string | null | undefined) => value?.trim().normalize("NFC") || "";
      const sameDetails =
        (purchase.addsStock !== false) === (next.addsStock !== false) &&
        text(purchase.medication) === text(next.medication) &&
        text(purchase.product) === text(next.product) &&
        text(purchase.merchant) === text(next.merchant) &&
        (purchase.stockUnit ?? null) === (next.stockUnit ?? null) &&
        (purchase.quantity ?? purchase.doses) === (next.quantity ?? next.doses);
      if (!sameDetails) return false;
      const sameSource =
        !!purchase.evidence?.quote &&
        purchase.evidence.quote === next.evidence?.quote &&
        purchase.evidence.text === next.evidence?.text;
      if (
        money.amount !== null &&
        money.currency !== null &&
        prior.amount !== null &&
        prior.currency !== null
      )
        return (
          prior.amount === money.amount &&
          prior.currency === money.currency &&
          (!!text(next.medication) || !!text(next.product) || !!text(next.merchant) || sameSource)
        );
      // Unknown prices need matching source facts, never placeholder zeroes.
      return prior.amount === money.amount && prior.currency === money.currency && sameSource;
    });
  }
  if (!("record" in e)) return false;
  const r = e.record;
  return records.some((x) => {
    if (x.type !== r.type || x.localDate !== r.localDate) return false;
    if (r.type === "water" && x.type === "water")
      return (
        x.answer === r.answer && x.at === r.at && (x.partOfDay ?? null) === (r.partOfDay ?? null)
      );
    if (x.at !== r.at || (x.partOfDay ?? null) !== (r.partOfDay ?? null)) return false;
    if (r.type === "weight" && x.type === "weight") return x.value === r.value;
    if (r.type === "condition" && x.type === "condition")
      return x.label === r.label && (x.note ?? "") === (r.note ?? "");
    if (r.type === "meal" && x.type === "meal") {
      const facts = (meal: typeof r.meal) => ({
        title: meal.title,
        mealType: meal.mealType,
        consumedFraction: meal.consumedFraction,
        consumptionNote: meal.consumptionNote ?? "",
        note: meal.note ?? "",
        // Generated item IDs and analysis timestamps do not identify a meal.
        items: meal.items.map(({ id: _id, ...item }) => item),
      });
      return JSON.stringify(facts(x.meal)) === JSON.stringify(facts(r.meal));
    }
    if (r.type === "memory" && x.type === "memory") return x.note === r.note;
    if (r.type === "measure" && x.type === "measure")
      return x.waist === r.waist && x.hip === r.hip && x.chest === r.chest && x.thigh === r.thigh;
    if (r.type === "injection" && x.type === "injection") {
      if (
        x.medication !== r.medication ||
        x.doseValue !== r.doseValue ||
        x.doseUnit !== r.doseUnit ||
        x.site !== r.site
      )
        return false;
      // Two unspecified injections on one date are not enough evidence of a duplicate.
      return !!(
        r.medication ||
        r.doseValue !== null ||
        r.site ||
        (r.evidence?.quote &&
          r.evidence.quote === x.evidence?.quote &&
          r.evidence.text === x.evidence?.text)
      );
    }
    return false;
  });
}
