import type { JournalRecord, Purchase } from "./journal";
import { sortByTime } from "./journal";
import { purchaseMoneyFacts, formatPurchaseMoney } from "./purchase-money";
import { t } from "./i18n";
import { siteLabel } from "./injection-sites";
import { DEFAULT_TZ, timeOf, fmtTime } from "./dates";
// Only comparison text is normalized. The original journal and source quotes stay intact.
const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLowerCase();
export function matchesKeywords(text: string, query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const value = normalize(text);
  return words.length > 0 && words.every((word) => value.includes(word));
}
const numberText = (value: number | null | undefined, unit = "") =>
  value == null
    ? ""
    : [String(value), String(value).replace(".", ",")].flatMap((n) => [n, n + unit]).join(" ");

/** Search confirmed fields and original quotations; never add inferred facts. */
export function recordText(r: JournalRecord) {
  switch (r.type) {
    case "meal":
      return `${r.meal.title} ${r.meal.note ?? ""} ${r.meal.consumptionNote ?? ""} ${r.meal.items.map((i) => [i.name, i.portionDescription, ...i.ingredients.map((ingredient) => ingredient.name)].filter(Boolean).join(" ")).join(" ")}`;
    case "memory":
      return r.note;
    case "condition":
      return `${r.label} ${r.note ?? ""}`;
    case "injection":
      return `${r.medication ?? ""} ${r.site ?? ""} ${r.site ? siteLabel(r.site) : ""} ${numberText(r.doseValue, r.doseUnit ?? "")} ${r.doseValue === null ? "" : (r.doseUnit ?? "")}`;
    case "weight":
      return `${numberText(r.value, r.unit)} ${r.unit}`;
    case "measure":
      return `${numberText(r.waist, r.unit)} ${numberText(r.hip, r.unit)} ${numberText(r.chest, r.unit)} ${numberText(r.thigh, r.unit)} ${r.unit}`;
    case "water":
      return t(r.answer === "yes" ? "pr.water.yes" : "pr.water.notYet");
    default:
      return "";
  }
}

export function findRecords(records: JournalRecord[], q: string, timezone = DEFAULT_TZ) {
  if (!q.trim()) return [];
  return records
    .filter((r) => {
      const savedTime =
        r.precision === "part_of_day" && r.partOfDay
          ? t(`pod.${r.partOfDay}`)
          : r.precision === "exact" && r.at
            ? [
                timeOf(r.at, timezone),
                fmtTime(r.at, timezone),
                fmtTime(r.at, timezone).replace(/\s/gu, ""),
              ].join(" ")
            : "";
      const txt = `${r.localDate} ${savedTime} ${r.type} ${t(`type.${r.type}`)} ${recordText(r)} ${r.evidence?.quote ?? ""}`;
      return matchesKeywords(txt, q);
    })
    .sort(sortByTime);
}

export function findPurchases(purchases: Purchase[], query: string) {
  return purchases.filter((p) =>
    matchesKeywords(
      [
        p.localDate,
        p.medication,
        p.product,
        p.merchant,
        p.quantity ?? (p.addsStock !== false ? p.doses : null),
        p.stockUnit ? t(`unit.${p.stockUnit}`) : null,
        purchaseMoneyFacts(p).amount,
        purchaseMoneyFacts(p).amount === null ? null : String(p.amount).replace(".", ","),
        formatPurchaseMoney(p),
        purchaseMoneyFacts(p).currency,
        t(p.addsStock === false ? "type.expense" : "type.purchase"),
        p.evidence?.quote,
      ]
        .filter((value) => value != null)
        .join(" "),
      query,
    ),
  );
}
