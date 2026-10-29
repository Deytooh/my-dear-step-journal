import type { InjectionRec, JournalRecord, Purchase, StockUnit } from "./journal";

export type StockLot = {
  id: string;
  medication: string;
  product: string | null;
  unit: StockUnit;
  balance: number;
  localDate: string;
  demo: boolean;
};
export const canDeduct = (unit: StockUnit) => unit !== "pen";
export const lotIdentity = (lot: Pick<StockLot, "medication" | "unit" | "product">) =>
  JSON.stringify([lot.medication, lot.unit, lot.product]);
export const matchesLot = (r: InjectionRec, lot: StockLot) =>
  r.stockPurchaseId === lot.id &&
  r.medication === lot.medication &&
  r.stockIdentity === lotIdentity(lot) &&
  canDeduct(lot.unit);

/** Purchase IDs are stable lot identities. Never merge brands, presentations, or units. */
export function inventory(
  purchases: Purchase[],
  records: JournalRecord[],
  adjustments: Record<string, { identity: string; delta: number }> = {},
) {
  const lots: StockLot[] = purchases
    .filter((p) => p.addsStock !== false && !!p.medication && !!p.stockUnit)
    .map((p) => ({
      id: p.id,
      medication: p.medication!,
      product: p.product ?? null,
      unit: p.stockUnit!,
      localDate: p.localDate,
      demo: !!p.demo,
      balance: p.doses,
    }));
  const unresolvedAdjustments: string[] = [];
  for (const [id, adjustment] of Object.entries(adjustments)) {
    const lot = lots.find((l) => l.id === id && lotIdentity(l) === adjustment.identity);
    if (lot) lot.balance += adjustment.delta;
    else unresolvedAdjustments.push(id);
  }
  const unresolved: InjectionRec[] = [];
  // A record ID represents one movement, including when a backup contains duplicate IDs.
  const injections = new Map(
    records.filter((r): r is InjectionRec => r.type === "injection").map((r) => [r.id, r]),
  );
  for (const r of injections.values()) {
    if (!r.usedStock) continue;
    const lot = lots.find((l) => matchesLot(r, l));
    if (lot) lot.balance -= 1;
    else unresolved.push(r);
  }
  return {
    lots,
    unresolved,
    unresolvedAdjustments,
    unresolvedPurchases: purchases.filter(
      (p) => p.addsStock !== false && (!p.medication || !p.stockUnit),
    ),
  };
}
