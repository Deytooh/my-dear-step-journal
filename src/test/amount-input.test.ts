import { expect, it } from "vitest";
import { parseAmountInput } from "@/lib/amount-input";
it("preserves canonical decimals, decimal commas and an explicit zero", () => {
  for (const [input, expected] of [
    ["12.50", 12.5],
    ["12,50", 12.5],
    ["12000", 12000],
    [" 12.5 ", 12.5],
    ["0", 0],
    ["0.125", 0.125],
  ] as const)
    expect(parseAmountInput(input)).toBe(expected);
  expect(parseAmountInput("")).toBeNull();
  expect(parseAmountInput(undefined)).toBeNull();
});
it("rejects ambiguous separators and invalid characters instead of stripping digits into a different amount", () => {
  for (const input of [
    "12,000",
    "1,234.56",
    "1.234,56",
    "1 234",
    "-12",
    "+12",
    "1e3",
    "$12.50",
    "12abc",
  ])
    expect(Number.isNaN(parseAmountInput(input))).toBe(true);
});
it("rejects overflow instead of producing a non-finite stored amount", () => {
  expect(Number.isNaN(parseAmountInput("9".repeat(400)))).toBe(true);
});
