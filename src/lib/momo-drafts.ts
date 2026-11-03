// Editable Momo drafts. Model output never becomes a record until the user confirms a draft.
import type { MomoCandidate } from "./momo-schema";
import type { Evidence, JournalRecord, PartOfDay, Purchase } from "./journal";
import { mealSchema } from "./meals";
import { instantFromLocal } from "./dates";

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
  meal: [
    { k: "meal", label: "type.meal", kind: "text" },
    { k: "date", label: "f.date", kind: "date", important: true },
    { k: "time", label: "f.time", kind: "time" },
  ],
  weight: [
    { k: "value", label: "f.value", kind: "num", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time", important: true },
  ],
  injection: [
    { k: "medication", label: "f.medication", kind: "text", important: true },
    { k: "doseValue", label: "f.dose", kind: "num", important: true },
    { k: "doseUnit", label: "f.unit", kind: "text" },
    { k: "site", label: "f.site", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time", important: true },
  ],
  condition: [
    { k: "label", label: "f.feeling", kind: "text", important: true },
    { k: "note", label: "f.note", kind: "text" },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
  ],
  measure: [
    { k: "waist", label: "f.waist", kind: "num" },
    { k: "hip", label: "f.hip", kind: "num" },
    { k: "chest", label: "f.chest", kind: "num" },
    { k: "thigh", label: "f.thigh", kind: "num" },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
  ],
  memory: [
    { k: "note", label: "f.note", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" },
    { k: "time", label: "f.time", kind: "time" },
  ],
  purchase: [
    { k: "medication", label: "f.medication", kind: "text", important: true },
    { k: "quantity", label: "f.quantity", kind: "num", important: true },
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
  for (const def of FIELDS[c.type]) f[def.k] = def.k === "date" ? s(rec["date"]) : s(rec[def.k]);
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
  const pod = time ? null : partOfDayFromHint(d.timeHint);
  if (
    f["date"] &&
    (!date || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
  )
    return { error: "date" };
  if (f["time"] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f["time"])) return { error: "time" };
  const evidence = d.evidence ? { ...d.evidence, confirmed: { ...f } } : undefined;
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
      const a = n(f["amount"]);
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
          stockUnit: "single",
          addsStock: true,
        },
      };
    }
    case "expense": {
      const a = n(f["amount"]);
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
  if ("purchase" in e)
    return purchases.some(
      (p) => p.localDate === e.purchase.localDate && p.amount === e.purchase.amount,
    );
  if (!("record" in e)) return false;
  const r = e.record;
  return records.some((x) => {
    if (x.type !== r.type || x.localDate !== r.localDate) return false;
    if (r.type === "weight" && x.type === "weight") return x.value === r.value;
    if (r.type === "condition" && x.type === "condition") return x.label === r.label;
    if (r.type === "meal" && x.type === "meal") return x.meal.title === r.meal.title;
    if (r.type === "memory" && x.type === "memory") return x.note === r.note;
    return r.type === "injection" || r.type === "measure";
  });
}
