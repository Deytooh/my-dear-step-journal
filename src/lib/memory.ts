import type { JournalRecord, Purchase } from "./journal";
import { addDays, previousWeek } from "./dates";
import { validDate } from "./snapshot";
export function memoryCandidates(
  records: JournalRecord[],
  purchases: Purchase[],
  query: string,
  today: string,
) {
  const words = query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .toLowerCase();
  const dates = [...new Set(words.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])].filter(validDate);
  // Only narrow clear dates/periods. Comparisons and exclusions need the broader
  // candidate set; treating "before yesterday" as yesterday would hide the answer.
  const broad =
    /\b(before|after|since|until|between|through|avant|apres|depuis|jusqu|entre|not|except|excluding|pas|sauf)\b|이전|이후|부터|까지|말고|제외/.test(
      words,
    ) || /\d{4}-\d{2}-\d{2}\s+(?:to|au|a|-)\s+\d{4}-\d{2}-\d{2}/.test(words);
  const periods: Array<{ start: string; end: string }> = broad
    ? []
    : dates.map((date) => ({ start: date, end: date }));
  if (!broad) {
    if (/\byesterday\b|\bhier\b|어제/.test(words))
      periods.push({ start: addDays(today, -1), end: addDays(today, -1) });
    if (/\btoday\b|\baujourd'hui\b|오늘/.test(words)) periods.push({ start: today, end: today });
    if (/\btomorrow\b|\bdemain\b|내일/.test(words))
      periods.push({ start: addDays(today, 1), end: addDays(today, 1) });
    if (/\blast\s+week\b|\bsemaine\s+derniere\b|지난\s*주/.test(words))
      periods.push(previousWeek(today));
    if (/\bthis\s+month\b|\bce\s+mois\b|이번\s*달/.test(words))
      periods.push({ start: today.slice(0, 8) + "01", end: today });
  }
  const rows = [
    ...records.map((r) => ({ key: `record:${r.id}`, date: r.localDate })),
    ...purchases.map((p) => ({ key: `purchase:${p.id}`, date: p.localDate })),
  ];
  return rows
    .filter(
      (r) =>
        !periods.length || periods.some((period) => r.date >= period.start && r.date <= period.end),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60)
    .map((r) => r.key);
}
export function validateMemoryIds(raw: unknown, allowed: string[]): string[] {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || !allowed.includes(id)))
    throw new Error("unrecognized_id");
  return [...new Set(raw as string[])].slice(0, 20);
}
