import { monthGrid } from "./dates";
import { sortByTime, type JournalRecord, type Purchase } from "./journal";

export type TimelineEntry =
  { kind: "record"; value: JournalRecord } | { kind: "purchase"; value: Purchase };

/** Purchases are date-only: keep them after the day's records without inventing a time. */
export function journalTimeline(records: JournalRecord[], purchases: Purchase[]): TimelineEntry[] {
  return [
    ...records.map((value): TimelineEntry => ({ kind: "record", value })),
    ...purchases.map((value): TimelineEntry => ({ kind: "purchase", value })),
  ].sort((a, b) => {
    const dayOrder = b.value.localDate.localeCompare(a.value.localDate);
    if (dayOrder) return dayOrder;
    if (a.kind === "record" && b.kind === "record") return sortByTime(a.value, b.value);
    if (a.kind !== b.kind) return a.kind === "record" ? -1 : 1;
    return b.value.id.localeCompare(a.value.id);
  });
}

/** Shift a selected local day, clamping to the last valid day of the target month. */
export function shiftCalendarMonth(selected: string, delta: number): string {
  const year = Number(selected.slice(0, 4));
  const month = Number(selected.slice(5, 7));
  const day = Number(selected.slice(8, 10));
  const index = year * 12 + month - 1 + delta;
  const y = Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const days = monthGrid(y, m).filter((cell) => cell.inMonth);
  return days[Math.min(day, days.length) - 1]!.date;
}
