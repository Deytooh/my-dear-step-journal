import { expect, it } from "vitest";
import { memoryCandidates } from "@/lib/memory";
import { addDays, previousWeek } from "@/lib/dates";
import type { MemoryRec } from "@/lib/journal";
const today = "2026-11-04";
const memory = (id: string, date: string): MemoryRec => ({
  id,
  type: "memory",
  note: "Fictional " + id,
  localDate: date,
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: "2026-11-04T00:00:00Z",
});
const records = [
  memory("today", today),
  memory("yesterday", addDays(today, -1)),
  memory("older", addDays(today, -2)),
];
it("does not mistake a word such as hierarchy for the French word hier", () => {
  expect(memoryCandidates(records, [], "hierarchy", today)).toEqual([
    "record:today",
    "record:yesterday",
    "record:older",
  ]);
});
it("includes each explicitly mentioned period instead of dropping today when yesterday is also mentioned", () => {
  expect(memoryCandidates(records, [], "today or yesterday", today)).toEqual([
    "record:today",
    "record:yesterday",
  ]);
});
it("can select an explicitly dated entry beyond the latest 60 records", () => {
  const many = [
    ...Array.from({ length: 70 }, (_, index) => memory("recent-" + index, addDays(today, -index))),
    memory("old-date", "2026-08-03"),
  ];
  expect(memoryCandidates(many, [], "on 2026-08-03", today)).toEqual(["record:old-date"]);
  expect(memoryCandidates(many, [], "a memory", today)).toHaveLength(60);
});
it("does not force an exact day for before, after or excluded-date questions", () => {
  for (const query of ["before yesterday", "not yesterday", "after 2026-11-03"]) {
    expect(memoryCandidates(records, [], query, today)).toEqual([
      "record:today",
      "record:yesterday",
      "record:older",
    ]);
  }
});
it("normalizes French accents and curly apostrophes for period matching", () => {
  expect(memoryCandidates(records, [], "aujourd’hui", today)).toEqual(["record:today"]);
  const week = previousWeek(today);
  expect(
    memoryCandidates([memory("last-week", week.start), ...records], [], "semaine derniere", today),
  ).toEqual(["record:last-week"]);
});
it("can select future-dated journal entries when the user explicitly asks for tomorrow", () => {
  expect(
    memoryCandidates([...records, memory("tomorrow", addDays(today, 1))], [], "tomorrow", today),
  ).toEqual(["record:tomorrow"]);
});

it("keeps Korean date phrases working after accent normalization", () => {
  expect(memoryCandidates(records, [], "오늘 기록", today)).toEqual(["record:today"]);
  expect(memoryCandidates(records, [], "어제 기록", today)).toEqual(["record:yesterday"]);
  const week = previousWeek(today);
  for (const query of ["지난주", "지난 주"])
    expect(
      memoryCandidates([memory("last-week", week.start), ...records], [], query, today),
    ).toEqual(["record:last-week"]);
});
