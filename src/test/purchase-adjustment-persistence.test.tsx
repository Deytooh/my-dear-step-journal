import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot, type Purchase } from "@/lib/journal";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
  clearPhotoCache: vi.fn(),
}));
const key = "mds.journal.v1";
const purchase = (id: string): Purchase => ({
  id,
  localDate: "2026-11-03",
  amount: 100,
  currency: "KRW",
  doses: 4,
  quantity: 4,
  medication: "Fictional medicine",
  stockUnit: "single",
  addsStock: true,
});
const initial = (): JournalSnapshot => ({
  records: [],
  purchases: [purchase("deleted-lot"), purchase("kept-lot")],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul", locale: "en" },
});
const saved = (): JournalSnapshot => JSON.parse(localStorage.getItem(key)!);
const renderJournal = () => renderHook(() => useJournal(), { wrapper: JournalProvider });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(initial()));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("deletes only the removed lot's stock adjustment in the same durable snapshot", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.purchases).toHaveLength(2));
  act(() => {
    hook.result.current.setStock(2, "deleted-lot");
    hook.result.current.setStock(3, "kept-lot");
  });
  const kept = hook.result.current.settings.stockAdjustments!["kept-lot"];
  act(() => hook.result.current.deletePurchase("deleted-lot"));
  expect(hook.result.current.purchases.map((p) => p.id)).toEqual(["kept-lot"]);
  expect(hook.result.current.settings.stockAdjustments).toEqual({ "kept-lot": kept });
  expect(hook.result.current.stockNeedsReview).toBe(false);
  expect(hook.result.current.stock).toBe(3);
  expect(hook.result.current.settings.locale).toBe("en");
  expect(saved()).toEqual(hook.result.current.snapshot());
  hook.unmount();
  const reloaded = renderJournal();
  await waitFor(() => expect(reloaded.result.current.ready).toBe(true));
  expect(reloaded.result.current.stockNeedsReview).toBe(false);
  expect(reloaded.result.current.settings.stockAdjustments).toEqual({ "kept-lot": kept });
});

it("Undo restores the deleted lot and its adjustment without replacing later changes to other lots", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.purchases).toHaveLength(2));
  act(() => {
    hook.result.current.setStock(2, "deleted-lot");
    hook.result.current.setStock(3, "kept-lot");
  });
  const before = hook.result.current.snapshot();
  act(() => hook.result.current.deletePurchase("deleted-lot"));
  const undo = hook.result.current.undoFor(before);
  act(() => {
    hook.result.current.setStock(1, "kept-lot");
    hook.result.current.setSetting("showMomo", false);
  });
  act(undo);
  expect(hook.result.current.purchases.map((p) => p.id).sort()).toEqual([
    "deleted-lot",
    "kept-lot",
  ]);
  expect(hook.result.current.settings.stockAdjustments!["deleted-lot"]).toEqual(
    before.settings.stockAdjustments!["deleted-lot"],
  );
  expect(hook.result.current.settings.stockAdjustments!["kept-lot"]?.delta).toBe(-3);
  expect(hook.result.current.settings.showMomo).toBe(false);
  expect(hook.result.current.stockNeedsReview).toBe(false);
  expect(saved()).toEqual(hook.result.current.snapshot());
});

it("preserves the purchase and adjustment together when deletion cannot be saved", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.purchases).toHaveLength(2));
  act(() => hook.result.current.setStock(2, "deleted-lot"));
  const before = hook.result.current.snapshot();
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() => act(() => hook.result.current.deletePurchase("deleted-lot"))).toThrow("quota");
  expect(hook.result.current.snapshot()).toEqual(before);
  expect(saved()).toEqual(before);
});
