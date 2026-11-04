import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot, type MemoryRec } from "@/lib/journal";
import { localDateOf } from "@/lib/dates";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), listener: (_e: string, _s: unknown) => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: auth.getUser,
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn().mockResolvedValue(null),
  pushDiff: vi.fn().mockResolvedValue([]),
  clearPhotoCache: vi.fn(),
}));
const key = "mds.journal.v1";
const entry: MemoryRec = {
  id: "fictional-entry",
  type: "memory",
  note: "Fictional first entry",
  localDate: "2026-11-04",
  at: null,
  precision: "date_only",
  createdAt: "2026-11-04T12:00:00Z",
  source: "manual_text",
};
const blank = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const renderJournal = () => renderHook(() => useJournal(), { wrapper: JournalProvider });
function deferAuth() {
  let finish!: (value: { data: { user: null }; error?: Error }) => void;
  const pending = new Promise<{ data: { user: null }; error?: Error }>((resolve) => {
    finish = resolve;
  });
  auth.getUser.mockReturnValue(pending);
  return finish;
}
beforeEach(() => {
  localStorage.clear();
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("retains locale, timezone, onboarding, interests and explicit prompt preferences through demo reset and clear", async () => {
  const saved: JournalSnapshot = {
    ...blank(),
    records: [entry],
    stockAdjust: 5,
    settings: {
      showMomo: false,
      timezone: "America/Los_Angeles",
      locale: "fr",
      onboarding: { status: "completed", dismissedHints: ["manual"] },
      trackingInterests: ["meal", "memory"],
      guestImported: true,
      legacyAdjustmentConfirmed: true,
      stockAdjustments: { "old-purchase": { identity: "old-identity", delta: 8 } },
      prompts: {
        aiConsent: false,
        hidden: true,
        off: ["weight"],
        answered: { water: "2026-11-04" },
        skipped: { memory: "2026-11-04" },
        done: { feel: "2026-11-04" },
        context: { day: "2026-11-04", id: "old", status: "answered" },
      },
    },
  };
  localStorage.setItem(key, JSON.stringify(saved));
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.resetDemo());
  expect(hook.result.current.settings).toMatchObject({
    showMomo: false,
    timezone: "America/Los_Angeles",
    locale: "fr",
    onboarding: saved.settings.onboarding,
    trackingInterests: ["meal", "memory"],
    demoMode: true,
  });
  expect(hook.result.current.settings.prompts).toEqual({
    aiConsent: false,
    hidden: true,
    off: ["weight"],
  });
  expect(hook.result.current.settings.guestImported).toBeUndefined();
  expect(hook.result.current.settings.legacyAdjustmentConfirmed).toBeUndefined();
  expect(hook.result.current.settings.stockAdjustments).not.toHaveProperty("old-purchase");
  expect(hook.result.current.stockAdjust).toBe(0);
  expect(hook.result.current.records.every((record) => record.demo)).toBe(true);
  expect(hook.result.current.purchases.every((purchase) => purchase.demo)).toBe(true);
  expect(hook.result.current.reminder?.demo).toBe(true);
  for (const record of hook.result.current.records) {
    if (record.at) expect(localDateOf(record.at, hook.result.current.tz)).toBe(record.localDate);
  }
  act(() => hook.result.current.clearDemo());
  expect(hook.result.current.records).toEqual([]);
  expect(hook.result.current.purchases).toEqual([]);
  expect(hook.result.current.reminder).toBeNull();
  expect(hook.result.current.settings).toMatchObject({
    locale: "fr",
    showMomo: false,
    timezone: "America/Los_Angeles",
    onboarding: saved.settings.onboarding,
    trackingInterests: ["meal", "memory"],
    demoMode: false,
    stockAdjustments: {},
  });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(hook.result.current.snapshot());
  hook.unmount();
  const remount = renderJournal();
  await waitFor(() => expect(remount.result.current.ready).toBe(true));
  expect(remount.result.current.settings.locale).toBe("fr");
  expect(remount.result.current.introductionPending).toBe(false);
});

it.each([false, true])(
  "does not change explicit AI consent %s while replacing fictional activity",
  async (aiConsent) => {
    localStorage.setItem(
      key,
      JSON.stringify({ ...blank(), settings: { ...blank().settings, prompts: { aiConsent } } }),
    );
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.resetDemo());
    act(() => hook.result.current.clearDemo());
    expect(hook.result.current.settings.prompts?.aiConsent).toBe(aiConsent);
  },
);

it("keeps the original snapshot on a failed demo write and permits a safe retry", async () => {
  const saved = {
    ...blank(),
    records: [entry],
    settings: { ...blank().settings, locale: "fr" as const },
  };
  localStorage.setItem(key, JSON.stringify(saved));
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("fictional quota failure");
  });
  expect(() => act(() => hook.result.current.resetDemo())).toThrow("fictional quota failure");
  expect(hook.result.current.snapshot()).toEqual(saved);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
  write.mockRestore();
  act(() => hook.result.current.resetDemo());
  expect(hook.result.current.settings.locale).toBe("fr");
  expect(hook.result.current.settings.demoMode).toBe(true);
});

it("does not reinitialize the guest or discard a conflict when delayed auth confirms the same guest", async () => {
  const finish = deferAuth();
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setSetting("locale", "fr"));
  const before = hook.result.current.snapshot();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: JSON.stringify({ ...blank(), records: [entry] }),
      }),
    ),
  );
  expect(hook.result.current.conflict).toBe(true);
  await act(async () => finish({ data: { user: null } }));
  expect(hook.result.current.snapshot()).toBe(before);
  expect(hook.result.current.conflict).toBe(true);
});

it("never opens automatic onboarding after a first entry was durably saved, even if it is later deleted", async () => {
  const finish = deferAuth();
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.saveRecord(entry));
  await act(async () => finish({ data: { user: null } }));
  expect(hook.result.current.introductionPending).toBe(false);
  act(() => hook.result.current.deleteRecord(entry.id));
  expect(hook.result.current.introductionPending).toBe(false);
});

it("clears pending introduction only after a successful first save", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.introductionPending).toBe(true));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("fictional quota failure");
  });
  expect(() => act(() => hook.result.current.saveRecord(entry))).toThrow();
  expect(hook.result.current.introductionPending).toBe(true);
  write.mockRestore();
  act(() => hook.result.current.saveRecord(entry));
  expect(hook.result.current.introductionPending).toBe(false);
});

it.each(["reject", "returned-error"])(
  "keeps local work available without unsolicited onboarding when initial auth fails: %s",
  async (failure) => {
    if (failure === "reject")
      auth.getUser.mockRejectedValue(new Error("fictional network failure"));
    else
      auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error("fictional network failure"),
      });
    const hook = renderJournal();
    await act(async () => {});
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.introductionPending).toBe(false);
    act(() => hook.result.current.saveRecord(entry));
    expect(hook.result.current.records).toEqual([entry]);
  },
);

it.each(["existing-empty", "damaged"])(
  "never introduces an existing or damaged guest as a new journal: %s",
  async (kind) => {
    localStorage.setItem(key, kind === "damaged" ? "{damaged" : JSON.stringify(blank()));
    const hook = renderJournal();
    await act(async () => {});
    expect(hook.result.current.introductionPending).toBe(false);
    expect(hook.result.current.storageBlocked).toBe(kind === "damaged");
  },
);

it("marks a reminder made during practice as fictional and clears it with the examples", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.resetDemo());
  act(() => hook.result.current.setReminder("2026-11-06T10:00:00Z"));
  expect(hook.result.current.reminder).toMatchObject({ at: "2026-11-06T10:00:00Z", demo: true });
  act(() => hook.result.current.clearDemo());
  expect(hook.result.current.reminder).toBeNull();
  act(() => hook.result.current.setReminder("2026-11-07T10:00:00Z"));
  expect(hook.result.current.reminder?.demo).toBeUndefined();
  act(() => hook.result.current.clearDemo());
  expect(hook.result.current.reminder?.at).toBe("2026-11-07T10:00:00Z");
});

it("does not restart onboarding when a first save is removed before initial auth finishes", async () => {
  const finish = deferAuth();
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.saveRecord(entry));
  act(() => hook.result.current.deleteRecord(entry.id));
  await act(async () => finish({ data: { user: null } }));
  expect(hook.result.current.records).toEqual([]);
  expect(hook.result.current.introductionPending).toBe(false);
});
