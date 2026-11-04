import { describe, expect, it } from "vitest";
import { journalCSV } from "@/lib/export";
import type { JournalSnapshot, MemoryRec, Purchase } from "@/lib/journal";
import { validateSnapshot } from "@/lib/snapshot";

const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-04T12:00:00Z",
  source: "manual_text",
  note: 'Fictional note, with "quotes"\r\nand =1+2',
});
const purchase = (id: string): Purchase => ({
  id,
  localDate: "2026-11-04",
  amount: 0,
  currency: "USD",
  doses: 1,
  medication: null,
});
const snapshot = (id: string): JournalSnapshot =>
  validateSnapshot({
    records: [memory(id)],
    purchases: [purchase(id + "-purchase")],
    reminder: null,
    stockAdjust: 0,
    settings: { showMomo: true, timezone: "UTC" },
  });

// Parse quoted CSV independently of the serializer, including embedded CRLF.
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\r")) {
      row.push(value);
      value = "";
      if (char === "\r") {
        expect(csv[++i]).toBe("\n");
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  expect(quoted).toBe(false);
  row.push(value);
  rows.push(row);
  return rows;
}

describe("CSV export safety", () => {
  it.each([
    "=1+2",
    "+1",
    "-1",
    "@SUM(1)",
    " =1+2",
    "\t=1+2",
    "\r=1+2",
    "\n=1+2",
    " \t\r\n+1",
    "\u0000=1+2",
    "\u0001@SUM(1)",
    "\u007f-1",
    "\v=1+2",
    "\f=1+2",
    "\u00a0=1+2",
    "\ufeff=1+2",
    "＝1+2",
    "＋1",
    "－1",
    "＠SUM(1)",
    " \t＝1+2",
    "\tplain",
    "\rplain",
    "\nplain",
    " \tplain",
  ])("text-prefixes unsafe imported IDs without changing source JSON: %j", (id) => {
    const state = snapshot(id);
    const before = JSON.stringify(state);
    const rows = parseCSV(journalCSV(state));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === 13)).toBe(true);
    expect(rows[1]![1]).toBe("'" + id);
    expect(rows[2]![1]).toBe("'" + id + "-purchase");
    expect(rows[1]![5]).toBe(JSON.stringify(state.records[0]));
    expect(rows[2]![5]).toBe(JSON.stringify(state.purchases[0]));
    expect(JSON.parse(rows[1]![5]!)).toEqual(state.records[0]);
    expect(JSON.parse(rows[2]![5]!)).toEqual(state.purchases[0]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(["ordinary-id", "한글-id", " leading space", "a+b", "a=b", "'already-text"])(
    "preserves normal IDs and ordinary export columns: %j",
    (id) => {
      const state = snapshot(id);
      const rows = parseCSV(journalCSV(state));
      expect(rows[1]).toEqual([
        "memory",
        id,
        "2026-11-04",
        "date_only",
        "",
        JSON.stringify(state.records[0]),
        "",
        "",
        "",
        "",
        "",
        "",
        "false",
      ]);
      expect(rows[2]![1]).toBe(id + "-purchase");
    },
  );

  it("keeps commas, quotes, CRLF and embedded formula text inside the original cells", () => {
    const id = 'safe,"quoted"\r\n=1+2;@SUM(1)';
    const state = snapshot(id);
    const csv = journalCSV(state);
    const rows = parseCSV(csv);
    expect(csv).toContain('"safe,""quoted""\r\n=1+2;@SUM(1)"');
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === 13)).toBe(true);
    expect(rows[1]![1]).toBe(id);
    expect(rows[2]![1]).toBe(id + "-purchase");
    expect(JSON.parse(rows[1]![5]!)).toEqual(state.records[0]);
    expect(JSON.parse(rows[2]![5]!)).toEqual(state.purchases[0]);
  });
});
