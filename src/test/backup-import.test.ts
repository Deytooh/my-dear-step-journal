import { describe, expect, it } from "vitest";
import { planBackupImport } from "@/lib/backup-import";
import { inventory } from "@/lib/inventory";
import type { JournalSnapshot, MemoryRec, Purchase } from "@/lib/journal";
import { validateSnapshot } from "@/lib/snapshot";

const identity = JSON.stringify(["Fictional medication", "single", null]);
const adjustment = { identity, delta: -3 };
const empty = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, locale: "en", timezone: "UTC" },
});
const purchase = (id = "lot"): Purchase => ({
  id,
  localDate: "2026-11-04",
  amount: 0,
  currency: "USD",
  doses: 4,
  medication: "Fictional medication",
  stockUnit: "single",
  addsStock: true,
});
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-04T12:00:00Z",
  source: "manual_text",
  note: "Fictional backup fixture",
});
const adjusted = (): JournalSnapshot => ({
  ...empty(),
  purchases: [purchase()],
  settings: { ...empty().settings, stockAdjustments: { lot: adjustment } },
});

describe("additive backup planning", () => {
  it("copies a new lot and its exact correction together, without mutating either source", () => {
    const before = empty();
    const backup = adjusted();
    const originals = JSON.stringify([before, backup]);
    const plan = planBackupImport(before, validateSnapshot(backup));
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("Expected a safe import");
    expect(plan.added).toBe(1);
    expect(plan.skipped).toBe(0);
    expect(plan.snapshot.settings.stockAdjustments).toEqual({ lot: adjustment });
    expect(
      inventory(plan.snapshot.purchases, [], plan.snapshot.settings.stockAdjustments).lots,
    ).toEqual([expect.objectContaining({ id: "lot", balance: 1 })]);
    expect(validateSnapshot(plan.snapshot)).toEqual(plan.snapshot);
    expect(JSON.stringify([before, backup])).toBe(originals);
  });

  it("preserves local preferences, reminders, legacy review state, and unrelated corrections", () => {
    const before: JournalSnapshot = {
      ...empty(),
      stockAdjust: 2,
      reminder: { id: "reminder", at: "2026-11-05T12:00:00Z" },
      settings: {
        showMomo: false,
        locale: "fr",
        timezone: "Europe/Paris",
        onboarding: { status: "skipped" },
        prompts: { aiConsent: false },
        legacyAdjustmentConfirmed: false,
        stockAdjustments: { missing: { identity: "Unresolved local identity", delta: 2 } },
      },
    };
    const plan = planBackupImport(before, adjusted());
    if (plan.status !== "ready") throw new Error("Expected a safe import");
    expect(plan.snapshot.reminder).toBe(before.reminder);
    expect(plan.snapshot.stockAdjust).toBe(2);
    expect(plan.snapshot.settings).toEqual({
      ...before.settings,
      stockAdjustments: { ...before.settings.stockAdjustments, lot: adjustment },
    });
    expect(
      inventory(plan.snapshot.purchases, [], plan.snapshot.settings.stockAdjustments)
        .unresolvedAdjustments,
    ).toEqual(["missing"]);
  });

  it("uses one ID namespace for records and purchases and reports actual added/skipped counts", () => {
    const before = { ...empty(), records: [memory("record")], purchases: [purchase("purchase")] };
    const backup = {
      ...empty(),
      records: [memory("purchase"), memory("new-record")],
      purchases: [purchase("record"), purchase("new-purchase")],
    };
    const plan = planBackupImport(before, backup);
    if (plan.status !== "ready") throw new Error("Expected a safe import");
    expect(plan.added).toBe(2);
    expect(plan.skipped).toBe(2);
    expect(plan.snapshot.records).toEqual([before.records[0], backup.records[1]]);
    expect(plan.snapshot.purchases).toEqual([before.purchases[0], backup.purchases[1]]);
    expect(validateSnapshot(plan.snapshot)).toEqual(plan.snapshot);
  });

  it("keeps existing IDs unchanged and permits an unchanged existing lot correction", () => {
    const before = adjusted();
    const backup = adjusted();
    backup.purchases[0]!.amount = 200;
    backup.records.push(memory("new-record"));
    const plan = planBackupImport(before, backup);
    if (plan.status !== "ready") throw new Error("Expected a safe import");
    expect(plan.added).toBe(1);
    expect(plan.skipped).toBe(1);
    expect(plan.snapshot.purchases[0]).toBe(before.purchases[0]);
    expect(plan.snapshot.settings).toBe(before.settings);
  });

  it("identifies an identical repeat import as adding nothing", () => {
    const before = adjusted();
    const plan = planBackupImport(before, adjusted());
    expect(plan).toEqual({ status: "ready", added: 0, skipped: 1, snapshot: before });
  });

  it.each([false, true])(
    "refuses a legacy global correction even if acknowledged (%s)",
    (confirmed) => {
      const backup = { ...adjusted(), stockAdjust: -3 };
      backup.settings.legacyAdjustmentConfirmed = confirmed;
      expect(planBackupImport(empty(), backup)).toEqual({ status: "stock-conflict" });
    },
  );

  it.each(["missing", "wrong-identity", "expense-only"])(
    "refuses a %s source correction",
    (kind) => {
      const backup = adjusted();
      if (kind === "missing") backup.purchases = [];
      if (kind === "wrong-identity") backup.purchases[0]!.product = "Different presentation";
      if (kind === "expense-only") backup.purchases[0]!.addsStock = false;
      expect(planBackupImport(empty(), backup)).toEqual({ status: "stock-conflict" });
    },
  );

  it.each(["same", "different", "zero"])(
    "does not activate or overwrite a %s unresolved local correction",
    (kind) => {
      const before = empty();
      before.settings.stockAdjustments = {
        lot:
          kind === "same"
            ? adjustment
            : { identity: "Unresolved local identity", delta: kind === "zero" ? 0 : 2 },
      };
      // Even a backup without a correction could otherwise activate this stale key.
      const backup = { ...empty(), purchases: [purchase()] };
      const original = JSON.stringify(before);
      expect(planBackupImport(before, backup)).toEqual({ status: "stock-conflict" });
      expect(JSON.stringify(before)).toBe(original);
    },
  );

  it.each(["missing", "different-delta", "different-identity", "different-lot"])(
    "refuses a %s local correction for a skipped source lot",
    (kind) => {
      const before = adjusted();
      if (kind === "missing") delete before.settings.stockAdjustments;
      if (kind === "different-delta")
        before.settings.stockAdjustments = { lot: { identity, delta: 2 } };
      if (kind === "different-identity")
        before.settings.stockAdjustments = { lot: { identity: "Other identity", delta: -3 } };
      if (kind === "different-lot") before.purchases[0]!.product = "Other product";
      expect(planBackupImport(before, adjusted())).toEqual({ status: "stock-conflict" });
    },
  );

  it("refuses a corrected purchase colliding with an existing record ID", () => {
    const before = { ...empty(), records: [memory("lot")] };
    expect(planBackupImport(before, adjusted())).toEqual({ status: "stock-conflict" });
  });

  it("retains unresolved purchase and injection information for the existing inventory review flow", () => {
    const backup: JournalSnapshot = {
      ...empty(),
      purchases: [{ ...purchase(), stockUnit: null }],
      records: [
        {
          ...memory("injection"),
          type: "injection",
          medication: "Fictional medication",
          doseValue: null,
          doseUnit: null,
          site: null,
          usedStock: true,
          stockPurchaseId: "missing",
          stockIdentity: identity,
        },
      ],
    };
    const plan = planBackupImport(empty(), backup);
    if (plan.status !== "ready") throw new Error("Expected a safe import");
    const stock = inventory(plan.snapshot.purchases, plan.snapshot.records);
    expect(stock.unresolvedPurchases).toHaveLength(1);
    expect(stock.unresolved).toHaveLength(1);
  });
});
