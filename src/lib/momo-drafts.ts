// Editable Momo drafts. Model output never becomes a record until the user confirms a draft.
import type { MomoCandidate } from "./momo-schema";
import type { JournalRecord, PartOfDay, Purchase } from "./journal";
import { instantFromLocal } from "./dates";

export type DraftType = MomoCandidate["type"];
export type FieldKind = "text" | "num" | "date" | "time";
export type FieldDef = { k: string; label: string; kind: FieldKind; important?: boolean };
export type Draft = { key: string; type: DraftType; on: boolean; quote: string | null; timeHint: string | null; f: Record<string, string> };

export const FIELDS: Record<DraftType, FieldDef[]> = {
  weight: [{ k: "value", label: "f.value", kind: "num", important: true }, { k: "date", label: "f.date", kind: "date" }, { k: "time", label: "f.time", kind: "time", important: true }],
  injection: [
    { k: "medication", label: "f.medication", kind: "text", important: true }, { k: "doseValue", label: "f.dose", kind: "num", important: true },
    { k: "doseUnit", label: "f.unit", kind: "text" }, { k: "site", label: "f.site", kind: "text", important: true },
    { k: "date", label: "f.date", kind: "date" }, { k: "time", label: "f.time", kind: "time", important: true },
  ],
  condition: [{ k: "label", label: "f.feeling", kind: "text", important: true }, { k: "note", label: "f.note", kind: "text" }, { k: "date", label: "f.date", kind: "date" }, { k: "time", label: "f.time", kind: "time" }],
  measure: [{ k: "waist", label: "f.waist", kind: "num" }, { k: "hip", label: "f.hip", kind: "num" }, { k: "chest", label: "f.chest", kind: "num" }, { k: "thigh", label: "f.thigh", kind: "num" }, { k: "date", label: "f.date", kind: "date" }],
  memory: [{ k: "note", label: "f.note", kind: "text", important: true }, { k: "date", label: "f.date", kind: "date" }],
  expense: [
    { k: "amount", label: "f.amount", kind: "num", important: true }, { k: "merchant", label: "f.merchant", kind: "text", important: true },
    { k: "product", label: "f.product", kind: "text", important: true }, { k: "quantity", label: "f.quantity", kind: "num" }, { k: "date", label: "f.date", kind: "date", important: true },
  ],
};

const s = (v: unknown) => (v == null ? "" : String(v));

export function candidateToDraft(c: MomoCandidate, key: string, today: string): Draft {
  const f: Record<string, string> = {};
  const rec = c as unknown as Record<string, unknown>;
  for (const def of FIELDS[c.type]) f[def.k] = def.k === "date" ? s(rec["date"]) || (c.type === "expense" ? "" : today) : s(rec[def.k]);
  return { key, type: c.type, on: true, quote: c.quote, timeHint: "timeHint" in c ? c.timeHint : null, f };
}

export const missingFields = (d: Draft) => FIELDS[d.type].filter((x) => x.important && !d.f[x.k]?.trim()).map((x) => x.k);

const HINTS: [RegExp, PartOfDay][] = [[/아침|오전|morning|matin/i, "morning"], [/오후|점심|afternoon|après-midi|midi/i, "afternoon"], [/저녁|evening|soir/i, "evening"], [/밤|night|nuit/i, "night"]];
export function partOfDayFromHint(h: string | null): PartOfDay | null {
  if (!h) return null;
  return HINTS.find(([re]) => re.test(h))?.[1] ?? null;
}

const n = (v: string | undefined) => { if (!v?.trim()) return null; const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : NaN; };

export type Entry = { record: JournalRecord } | { purchase: Purchase } | { error: string };

export function draftToEntry(d: Draft, id: string, tz: string, today: string): Entry {
  const f = d.f;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(f["date"] ?? "") ? f["date"]! : d.type === "expense" ? "" : today;
  const time = /^\d{2}:\d{2}$/.test(f["time"] ?? "") ? f["time"]! : null;
  const pod = time ? null : partOfDayFromHint(d.timeHint);
  const base = { id, localDate: date, createdAt: new Date().toISOString(), source: "manual_text" as const,
    precision: time ? ("exact" as const) : pod ? ("part_of_day" as const) : ("date_only" as const),
    at: time ? instantFromLocal(date, time, tz) : null, partOfDay: pod };
  const bad = (k: string) => ({ error: k });
  switch (d.type) {
    case "weight": { const v = n(f["value"]); if (v == null || Number.isNaN(v) || v < 20 || v > 400) return bad("value"); return { record: { ...base, type: "weight", value: Math.round(v * 10) / 10, unit: "kg" } }; }
    case "injection": {
      const dv = n(f["doseValue"]); if (Number.isNaN(dv)) return bad("doseValue");
      return { record: { ...base, type: "injection", medication: f["medication"]?.trim() || null, doseValue: dv, doseUnit: dv != null ? f["doseUnit"]?.trim() || null : null, site: f["site"]?.trim() || null, usedStock: false } };
    }
    case "condition": { const label = f["label"]?.trim(); if (!label) return bad("label"); return { record: { ...base, type: "condition", label, ...(f["note"]?.trim() ? { note: f["note"].trim() } : {}) } }; }
    case "measure": {
      const m = { waist: n(f["waist"]), hip: n(f["hip"]), chest: n(f["chest"]), thigh: n(f["thigh"]) };
      if (Object.values(m).some((v) => Number.isNaN(v))) return bad("waist");
      if (Object.values(m).every((v) => v == null)) return bad("waist");
      return { record: { ...base, type: "measure", unit: "cm", ...m } };
    }
    case "memory": { const note = f["note"]?.trim(); if (!note) return bad("note"); return { record: { ...base, type: "memory", note, photo: null } }; }
    case "expense": {
      const a = n(f["amount"]); if (a == null || Number.isNaN(a) || a <= 0) return bad("amount");
      if (!date) return bad("date");
      const q = n(f["quantity"]); if (Number.isNaN(q)) return bad("quantity");
      // Receipts are recorded as expenses only; inventory is never changed from a photo.
      return { purchase: { id, localDate: date, amount: Math.round(a), currency: "KRW", doses: 0, medication: null, product: f["product"]?.trim() || null,
        merchant: f["merchant"]?.trim() || null, stockUnit: null, addsStock: false } };
    }
  }
}

/** A conservative duplicate check against what's already in the journal. */
export function isDuplicate(e: Entry, records: JournalRecord[], purchases: Purchase[]) {
  if ("purchase" in e) return purchases.some((p) => p.localDate === e.purchase.localDate && p.amount === e.purchase.amount);
  if (!("record" in e)) return false;
  const r = e.record;
  return records.some((x) => {
    if (x.type !== r.type || x.localDate !== r.localDate) return false;
    if (r.type === "weight" && x.type === "weight") return x.value === r.value;
    if (r.type === "condition" && x.type === "condition") return x.label === r.label;
    if (r.type === "memory" && x.type === "memory") return x.note === r.note;
    return r.type === "injection" || r.type === "measure";
  });
}
