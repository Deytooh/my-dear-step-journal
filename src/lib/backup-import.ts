import type { JournalSnapshot } from "./journal";
import { inventory, lotIdentity } from "./inventory";

type ImportPlan =
  | { status: "stock-conflict" }
  | { status: "ready"; snapshot: JournalSnapshot; added: number; skipped: number };

/** Plan an additive import of validated snapshots without guessing stock corrections. */
export function planBackupImport(before: JournalSnapshot, backup: JournalSnapshot): ImportPlan {
  // The legacy scalar has no lot identity. Applying, distributing, or dropping it
  // would invent a stock balance, even if the source journal acknowledged it.
  if (backup.stockAdjust !== 0) return { status: "stock-conflict" };

  const ids = new Set([...before.records, ...before.purchases].map((entry) => entry.id));
  const records = backup.records.filter((entry) => !ids.has(entry.id));
  const purchases = backup.purchases.filter((entry) => !ids.has(entry.id));
  const newPurchaseIds = new Set(purchases.map((entry) => entry.id));
  const currentAdjustments = before.settings.stockAdjustments ?? {};
  // Even an exact identity match must not silently activate an unresolved local
  // adjustment by adding the purchase it previously could not be linked to.
  if (purchases.some((purchase) => Object.hasOwn(currentAdjustments, purchase.id)))
    return { status: "stock-conflict" };

  const source = inventory(backup.purchases, backup.records, backup.settings.stockAdjustments);
  if (source.unresolvedAdjustments.length) return { status: "stock-conflict" };
  const current = inventory(before.purchases, before.records, currentAdjustments);
  const addedAdjustments: [string, { identity: string; delta: number }][] = [];
  for (const [id, adjustment] of Object.entries(backup.settings.stockAdjustments ?? {})) {
    if (newPurchaseIds.has(id)) {
      // The source inventory above verified the purchase and exact lot identity.
      addedAdjustments.push([id, adjustment]);
    } else {
      const existing = Object.hasOwn(currentAdjustments, id) ? currentAdjustments[id] : undefined;
      if (
        !existing ||
        existing.identity !== adjustment.identity ||
        existing.delta !== adjustment.delta ||
        !current.lots.some((lot) => lot.id === id && lotIdentity(lot) === adjustment.identity)
      )
        return { status: "stock-conflict" };
    }
  }

  const added = records.length + purchases.length;
  return {
    status: "ready",
    added,
    skipped: backup.records.length + backup.purchases.length - added,
    snapshot: {
      ...before,
      records: [...before.records, ...records],
      purchases: [...before.purchases, ...purchases],
      settings: addedAdjustments.length
        ? {
            ...before.settings,
            stockAdjustments: {
              ...currentAdjustments,
              ...Object.fromEntries(addedAdjustments),
            },
          }
        : before.settings,
    },
  };
}
