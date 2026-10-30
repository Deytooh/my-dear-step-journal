import type { JournalRecord, Purchase } from "./journal";
import { addDays, previousWeek } from "./dates";
export function memoryCandidates(
  records: JournalRecord[],
  purchases: Purchase[],
  query: string,
  today: string,
) {
  let start = "",
    end = today;
  if (/어제|yesterday|hier/i.test(query)) start = end = addDays(today, -1);
  else if (/오늘|today|aujourd/i.test(query)) start = today;
  else if (/지난주|last week|semaine dernière/i.test(query)) {
    ({ start, end } = previousWeek(today));
  } else if (/이번 달|this month|ce mois/i.test(query)) start = today.slice(0, 8) + "01";
  const rows = [
    ...records.map((r) => ({ key: `record:${r.id}`, date: r.localDate })),
    ...purchases.map((p) => ({ key: `purchase:${p.id}`, date: p.localDate })),
  ];
  return rows
    .filter((r) => (!start || r.date >= start) && r.date <= end)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60)
    .map((r) => r.key);
}
export function validateMemoryIds(raw: unknown, allowed: string[]): string[] {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || !allowed.includes(id)))
    throw new Error("unrecognized_id");
  return [...new Set(raw as string[])].slice(0, 20);
}
