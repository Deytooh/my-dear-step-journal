import { expect, it } from "vitest";
import {
  explicitMoneyUnknown,
  purchaseMoneyFacts,
  formatPurchaseMoney,
  summarizePurchaseMoney,
} from "@/lib/purchase-money";
import { t, fmtMoney } from "@/lib/i18n";
import type { Purchase } from "@/lib/journal";
const purchase = (
  id: string,
  amount = 0,
  currency = "KRW",
  confirmed?: Record<string, string>,
): Purchase => ({
  id,
  localDate: "2026-11-04",
  amount,
  currency,
  doses: 2,
  quantity: 2,
  medication: "Fictional medicine",
  stockUnit: "single",
  addsStock: true,
  ...(confirmed
    ? {
        evidence: {
          method: "text",
          text: "Fictional purchase source",
          quote: null,
          photos: [],
          proposed: { ...confirmed },
          confirmed: { ...confirmed },
        },
      }
    : {}),
});
it("distinguishes explicitly unknown source fields from zero and existing legacy values", () => {
  expect(purchaseMoneyFacts(purchase("unknown", 0, "KRW", { amount: "", currency: "" }))).toEqual({
    amount: null,
    currency: null,
  });
  expect(purchaseMoneyFacts(purchase("free", 0, "EUR", { amount: "0", currency: "EUR" }))).toEqual({
    amount: 0,
    currency: "EUR",
  });
  expect(purchaseMoneyFacts(purchase("legacy", 0, "KRW"))).toEqual({ amount: 0, currency: "KRW" });
  expect(explicitMoneyUnknown(null, "amount")).toBe(false);
  expect(explicitMoneyUnknown({ confirmed: { amount: "  " } }, "amount")).toBe(true);
});
it("does not display a missing amount or currency as a free KRW purchase", () => {
  expect(formatPurchaseMoney(purchase("unknown", 0, "KRW", { amount: "", currency: "" }))).toBe(
    t("money.unknown"),
  );
  expect(
    formatPurchaseMoney(purchase("no-currency", 12.5, "KRW", { amount: "12.5", currency: "" })),
  ).toContain(t("money.currencyUnknown", { amount: "12.5" }).split(" · ").at(-1));
  expect(formatPurchaseMoney(purchase("free", 0, "EUR", { amount: "0", currency: "EUR" }))).toBe(
    fmtMoney(0, "EUR"),
  );
});
it("sums only known prices per currency and counts incomplete prices without mutating sources", () => {
  const rows = [
    purchase("eur", 12.5, "EUR"),
    purchase("usd", 10, "USD"),
    purchase("unknown", 0, "KRW", { amount: "", currency: "KRW" }),
    purchase("currency", 12, "KRW", { amount: "12", currency: "" }),
  ];
  const before = JSON.stringify(rows);
  const result = summarizePurchaseMoney(rows);
  expect([...result.totals]).toEqual([
    ["EUR", 12.5],
    ["USD", 10],
  ]);
  expect(result.unknown).toBe(2);
  expect(JSON.stringify(rows)).toBe(before);
});
