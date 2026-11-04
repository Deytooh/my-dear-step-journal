import type { Purchase } from "./journal";
import { t, fmtMoney, fmtNumber } from "./i18n";

/** Legacy numeric fields may contain placeholders; an explicitly blank confirmed field remains unknown. */
export function explicitMoneyUnknown(evidence: unknown, field: "amount" | "currency") {
  if (!evidence || typeof evidence !== "object") return false;
  const confirmed = (evidence as Record<string, unknown>)["confirmed"];
  if (!confirmed || typeof confirmed !== "object") return false;
  const value = (confirmed as Record<string, unknown>)[field];
  return typeof value === "string" && !value.trim();
}
export function purchaseMoneyFacts(p: Pick<Purchase, "amount" | "currency" | "evidence">) {
  return {
    amount: explicitMoneyUnknown(p.evidence, "amount") ? null : p.amount,
    currency: explicitMoneyUnknown(p.evidence, "currency") ? null : p.currency,
  };
}
export function formatPurchaseMoney(p: Pick<Purchase, "amount" | "currency" | "evidence">) {
  const { amount, currency } = purchaseMoneyFacts(p);
  if (amount === null) return t("money.unknown") + (currency ? " · " + currency : "");
  if (currency === null) return t("money.currencyUnknown", { amount: fmtNumber(amount, 20) });
  return fmtMoney(amount, currency);
}
export function summarizePurchaseMoney(purchases: Purchase[]) {
  const totals = new Map<string, number>();
  let unknown = 0;
  for (const purchase of purchases) {
    const { amount, currency } = purchaseMoneyFacts(purchase);
    if (amount === null || currency === null) unknown++;
    else totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return { totals, unknown };
}
