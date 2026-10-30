import type { JournalSnapshot } from "./journal";
import { mealTotals } from "./meals";
const cell = (value: unknown) => {
  const s = String(value ?? "");
  return `"${(/^[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
export function journalCSV(state: JournalSnapshot) {
  const header = [
    "kind",
    "id",
    "local_date",
    "precision",
    "instant_utc",
    "data_json",
    "pictured_kcal_low",
    "pictured_kcal_high",
    "consumed_fraction",
    "consumed_kcal_low",
    "consumed_kcal_high",
    "partial",
    "demo",
  ];
  const rows: unknown[][] = state.records.map((r) => {
    const totals = r.type === "meal" ? mealTotals(r.meal) : null;
    return [
      r.type,
      r.id,
      r.localDate,
      r.precision,
      r.at,
      JSON.stringify(r),
      totals?.pictured?.low,
      totals?.pictured?.high,
      r.type === "meal" ? r.meal.consumedFraction : null,
      totals?.consumed?.low,
      totals?.consumed?.high,
      totals?.partial ?? "",
      !!r.demo,
    ];
  });
  rows.push(
    ...state.purchases.map((p) => [
      "purchase",
      p.id,
      p.localDate,
      "date_only",
      "",
      JSON.stringify(p),
      "",
      "",
      "",
      "",
      "",
      "",
      !!p.demo,
    ]),
  );
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
