import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot } from "@/lib/journal";
import { planBackupImport } from "@/lib/backup-import";

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
const empty = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: false, timezone: "UTC", locale: "en" },
});
const imported = (): JournalSnapshot => ({
  ...empty(),
  purchases: [
    {
      id: "fictional-lot",
      localDate: "2026-11-04",
      amount: 0,
      currency: "USD",
      doses: 4,
      medication: "Fictional medication",
      stockUnit: "single",
      addsStock: true,
    },
  ],
  settings: {
    ...empty().settings,
    stockAdjustments: {
      "fictional-lot": {
        identity: JSON.stringify(["Fictional medication", "single", null]),
        delta: -3,
      },
    },
  },
});
const saved = (): JournalSnapshot => JSON.parse(localStorage.getItem(key)!);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(empty()));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("durably imports the purchase and correction together and keeps them after reload", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const plan = planBackupImport(hook.result.current.snapshot(), imported());
  if (plan.status !== "ready") throw new Error("Expected a safe import");
  act(() => hook.result.current.restoreSnapshot(plan.snapshot));
  expect(hook.result.current.stockNeedsReview).toBe(false);
  expect(hook.result.current.stock).toBe(1);
  expect(saved()).toEqual(plan.snapshot);
  hook.unmount();
  const reloaded = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(reloaded.result.current.ready).toBe(true));
  expect(reloaded.result.current.stockNeedsReview).toBe(false);
  expect(reloaded.result.current.stock).toBe(1);
  expect(reloaded.result.current.settings.showMomo).toBe(false);
});

it("leaves both durable and visible journals untouched when the import write runs out of space", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const before = hook.result.current.snapshot();
  const plan = planBackupImport(before, imported());
  if (plan.status !== "ready") throw new Error("Expected a safe import");
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  expect(() => act(() => hook.result.current.restoreSnapshot(plan.snapshot))).toThrow(
    "Storage is full",
  );
  expect(hook.result.current.snapshot()).toEqual(before);
  expect(saved()).toEqual(before);
});

it("Undo removes the imported purchase and correction while preserving later unrelated settings", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const before = hook.result.current.snapshot();
  const plan = planBackupImport(before, imported());
  if (plan.status !== "ready") throw new Error("Expected a safe import");
  act(() => hook.result.current.restoreSnapshot(plan.snapshot));
  const undo = hook.result.current.undoFor(before);
  act(() => hook.result.current.setSetting("showMomo", true));
  act(undo);
  expect(hook.result.current.purchases).toEqual([]);
  expect(hook.result.current.settings.stockAdjustments).toBeUndefined();
  expect(hook.result.current.settings.showMomo).toBe(true);
  expect(hook.result.current.stockNeedsReview).toBe(false);
  expect(saved()).toEqual(hook.result.current.snapshot());
});
