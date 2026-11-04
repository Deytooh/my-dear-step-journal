import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { inventory, lotIdentity, matchesLot } from "@/lib/inventory";
import type { InjectionRec, JournalRecord, Purchase } from "@/lib/journal";
import { setLocale, t } from "@/lib/i18n";
import { findMedication } from "@/lib/medications";

const j = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: null,
  tz: "Asia/Seoul",
  settings: { showMomo: false },
  records: [] as JournalRecord[],
  purchases: [] as Purchase[],
  inventory: {
    lots: [],
    unresolved: [],
    unresolvedAdjustments: [],
    unresolvedPurchases: [],
  } as ReturnType<typeof inventory>,
  reminder: null,
  newId: () => "new-injection",
  saveRecord: vi.fn(),
  savePurchase: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(() => vi.fn()),
  sync: "synced",
}));
vi.mock("@/lib/journal", async () => ({
  useJournal: () => j,
  canDeduct: (await import("@/lib/inventory")).canDeduct,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/today" } }),
}));
vi.mock("@/components/app/MomoSheet", () => ({ MomoSheet: () => null }));
vi.mock("@/components/app/MealForm", () => ({ MealForm: () => null }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
vi.mock("@/components/app/EntrySheet", () => ({
  EntrySheet: ({ children, header }: { children: ReactNode; header: ReactNode }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const purchase = (
  id: string,
  medication = "Mounjaro",
  overrides: Partial<Purchase> = {},
): Purchase => ({
  id,
  localDate: "2026-11-03",
  amount: 100,
  currency: "KRW",
  doses: 4,
  medication,
  stockUnit: "single",
  addsStock: true,
  ...overrides,
});
const renderInjection = () => {
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="injection"
      setKind={vi.fn()}
      initialDate="2026-11-03"
    />,
  );
  fireEvent.click(screen.getByText(t("ui.injectionDetails"), { selector: "summary" }));
};
const chooseMedication = (name: string) => {
  const medication = findMedication(name)!;
  fireEvent.click(screen.getByRole("button", { name: t("med.select") }));
  fireEvent.click(
    screen.getByRole("option", {
      name: `${medication.ko} ${medication.ingredientKo}`,
    }),
  );
};
const stockSelect = () => screen.getByRole("combobox", { name: t("stock.lot") });
const choices = () =>
  Array.from((stockSelect() as HTMLSelectElement).options).map((option) => option.value);
const save = () => fireEvent.submit(document.querySelector("form")!);
const savedInjection = () => j.saveRecord.mock.calls[0]![0] as InjectionRec;

beforeEach(() => {
  vi.clearAllMocks();
  setLocale("ko");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  j.records = [];
  j.purchases = [purchase("english-lot")];
  j.inventory = inventory(j.purchases, []);
  j.snapshot.mockImplementation(() => ({
    records: j.records,
    purchases: j.purchases,
    settings: j.settings,
    reminder: j.reminder,
    stockAdjust: 0,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("explicit stock-lot choice across existing brand aliases", () => {
  it("shows an English Mounjaro lot after a fresh Korean picker selection without selecting or deducting it", () => {
    renderInjection();
    chooseMedication("마운자로");
    expect(choices()).toEqual(["", "english-lot"]);
    expect(stockSelect()).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: t("ux.stockUse") })).toBeDisabled();
    expect(j.saveRecord).not.toHaveBeenCalled();
    expect(j.savePurchase).not.toHaveBeenCalled();
    save();
    expect(savedInjection()).toMatchObject({
      medication: "마운자로",
      usedStock: false,
      stockPurchaseId: null,
      stockIdentity: null,
    });
    expect(inventory(j.purchases, [savedInjection()]).lots[0]?.balance).toBe(4);
    expect(j.purchases[0]?.medication).toBe("Mounjaro");
  });

  it("keeps alias-matched lots distinct and deducts only an explicitly selected and enabled lot", () => {
    j.purchases = [
      purchase("english-lot"),
      purchase("korean-lot", "마운자로", { product: "Second lot" }),
    ];
    j.inventory = inventory(j.purchases, []);
    renderInjection();
    chooseMedication("마운자로");
    expect(choices()).toEqual(["", "english-lot", "korean-lot"]);
    fireEvent.change(stockSelect(), { target: { value: "english-lot" } });
    const useStock = screen.getByRole("checkbox", {
      name: t("stock.deduct", { u: t("unit.single") }),
    });
    expect(useStock).toBeEnabled();
    expect(useStock).not.toBeChecked();
    expect(j.saveRecord).not.toHaveBeenCalled();
    fireEvent.click(useStock);
    save();
    const record = savedInjection();
    expect(record).toMatchObject({
      medication: "Mounjaro",
      usedStock: true,
      stockPurchaseId: "english-lot",
      stockIdentity: lotIdentity(j.inventory.lots[0]!),
    });
    expect(matchesLot(record, j.inventory.lots[0]!)).toBe(true);
    expect(matchesLot(record, j.inventory.lots[1]!)).toBe(false);
    expect(matchesLot({ ...record, medication: "마운자로" }, j.inventory.lots[0]!)).toBe(false);
    expect(inventory(j.purchases, [record]).lots.map((lot) => [lot.id, lot.balance])).toEqual([
      ["english-lot", 3],
      ["korean-lot", 4],
    ]);
    expect(j.purchases.map((p) => p.medication)).toEqual(["Mounjaro", "마운자로"]);
    expect(j.savePurchase).not.toHaveBeenCalled();
  });

  it("does not enable stock use just by choosing a matching lot", () => {
    renderInjection();
    chooseMedication("마운자로");
    fireEvent.change(stockSelect(), { target: { value: "english-lot" } });
    save();
    expect(savedInjection()).toMatchObject({
      medication: "Mounjaro",
      usedStock: false,
      stockPurchaseId: null,
      stockIdentity: null,
    });
    expect(inventory(j.purchases, [savedInjection()]).lots[0]?.balance).toBe(4);
  });

  it("excludes different brands with the same ingredient, pens, and expense-only purchases", () => {
    j.purchases = [
      purchase("english-lot"),
      purchase("different-brand", "Zepbound"),
      purchase("pen-lot", "Mounjaro", { stockUnit: "pen" }),
      purchase("expense", "Mounjaro", { addsStock: false }),
    ];
    j.inventory = inventory(j.purchases, []);
    renderInjection();
    chooseMedication("마운자로");
    expect(choices()).toEqual(["", "english-lot"]);
  });

  it("does not match a different formulation of the same brand", () => {
    j.purchases = [purchase("injection-lot", "Wegovy"), purchase("tablet-lot", "Wegovy (tablet)")];
    j.inventory = inventory(j.purchases, []);
    renderInjection();
    chooseMedication("위고비");
    expect(choices()).toEqual(["", "injection-lot"]);
  });

  it("shows only an exact custom medication and keeps non-exact custom strings separate", () => {
    j.purchases = [
      purchase("exact-custom", "Custom medicine"),
      purchase("case-variant", "custom medicine"),
      purchase("other-custom", "Another medicine"),
    ];
    j.inventory = inventory(j.purchases, []);
    renderInjection();
    fireEvent.click(screen.getByRole("button", { name: t("med.select") }));
    fireEvent.click(screen.getByRole("button", { name: t("med.other") }));
    fireEvent.change(screen.getByRole("textbox", { name: t("med.custom") }), {
      target: { value: " Custom medicine " },
    });
    expect(choices()).toEqual(["", "exact-custom"]);
  });

  it("blocks an old lot after medication changes and never treats an alias as an inventory match", () => {
    renderInjection();
    chooseMedication("마운자로");
    fireEvent.change(stockSelect(), { target: { value: "english-lot" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: t("stock.deduct", { u: t("unit.single") }) }),
    );
    chooseMedication("젭바운드");
    expect(
      within(stockSelect()).queryByRole("option", { name: /Mounjaro/ }),
    ).not.toBeInTheDocument();
    save();
    expect(j.saveRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(t("stock.choose"));
  });
});
