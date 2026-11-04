import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot, type MemoryRec } from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";

const auth = vi.hoisted(() => ({ listener: (_event: string, _session: unknown) => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: (cb: typeof auth.listener) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
  clearPhotoCache: vi.fn(),
}));
const key = "mds.journal.v1.user.A";
const baseKey = `${key}.base`;
const damagedRaw = "{ damaged-baseline, keep original bytes";
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  note: id,
  localDate: "2026-11-03",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-03T10:00:00Z",
  source: "manual_text",
});
const snapshot = (id: string): JournalSnapshot => ({
  records: [memory(id)],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const sign = (id: string | null = "A") =>
  act(() =>
    auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null),
  );
const saved = (storageKey: string) => JSON.parse(localStorage.getItem(storageKey)!);
const start = async (local: JournalSnapshot, remote: JournalSnapshot | null, raw = damagedRaw) => {
  const primaryRaw = JSON.stringify(local, null, 2);
  localStorage.setItem(key, primaryRaw);
  localStorage.setItem(baseKey, raw);
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign();
  await waitFor(() => expect(hook.result.current.storageBlocked).toBe(true));
  return { ...hook, primaryRaw };
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([damagedRaw, "", "{}"])(
  "preserves both raw snapshots and requires a choice even when local and cloud match (%j)",
  async (raw) => {
    const healthy = snapshot("healthy");
    const hook = await start(healthy, healthy, raw);
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.sync).toBe("error");
    expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
    expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
    expect(localStorage.getItem(baseKey)).toBe(raw);
    expect(hook.result.current.snapshot()).toEqual(healthy);
    expect(pushDiff).not.toHaveBeenCalled();
  },
);

it.each(["local", "cloud"] as const)(
  "resumes sync after the explicit %s choice and keeps later local edits syncable",
  async (choice) => {
    const local = snapshot("local");
    const remote = snapshot("remote");
    const hook = await start(local, remote);
    act(() => hook.result.current.resolveConflict(choice));
    expect(hook.result.current.conflict).toBe(false);
    expect(hook.result.current.storageBlocked).toBe(false);
    expect(hook.result.current.storageRecovery).toBeNull();
    const chosen = choice === "local" ? local : remote;
    expect(hook.result.current.snapshot()).toEqual(chosen);
    expect(saved(key)).toEqual(chosen);
    expect(saved(baseKey)).toEqual(remote);
    act(() => hook.result.current.saveRecord(memory("later")));
    await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
    expect(pushDiff).toHaveBeenCalledExactlyOnceWith("A", remote, {
      ...chosen,
      records: [...chosen.records, memory("later")],
    });
    expect(saved(baseKey)).toEqual(hook.result.current.snapshot());
  },
);

it("preserves an empty saved journal until an explicit choice establishes deletion intent", async () => {
  const local = { ...snapshot("deleted"), records: [] };
  const remote = snapshot("cloud-record");
  const hook = await start(local, remote);
  expect(hook.result.current.conflict).toBe(true);
  expect(hook.result.current.snapshot()).toEqual(local);
  expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  expect(pushDiff).not.toHaveBeenCalled();
  act(() => hook.result.current.resolveConflict("local"));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(pushDiff).toHaveBeenCalledExactlyOnceWith("A", remote, local);
});

it("requires an explicit choice before copying a local journal into an empty cloud account", async () => {
  const local = snapshot("local-only");
  const hook = await start(local, null);
  expect(hook.result.current.conflict).toBe(true);
  expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  expect(pushDiff).not.toHaveBeenCalled();
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(hook.result.current.storageBlocked).toBe(false);
  expect(hook.result.current.records).toEqual([]);
  expect(hook.result.current.sync).toBe("synced");
  expect(pushDiff).not.toHaveBeenCalled();
});

it("revalidates a transiently unreadable baseline on Retry without forcing a stale conflict", async () => {
  const healthy = snapshot("healthy");
  const primaryRaw = JSON.stringify(healthy, null, 2);
  localStorage.setItem(key, primaryRaw);
  localStorage.setItem(baseKey, JSON.stringify(healthy));
  const getItem = Storage.prototype.getItem;
  let unreadable = true;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    storageKey: string,
  ) {
    if (unreadable && storageKey === baseKey) throw new Error("temporarily unavailable");
    return getItem.call(this, storageKey);
  });
  const write = vi.spyOn(Storage.prototype, "setItem");
  vi.mocked(loadCloud).mockResolvedValue(healthy);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign();
  await waitFor(() => expect(hook.result.current.storageBlocked).toBe(true));
  expect(hook.result.current.conflict).toBe(true);
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(primaryRaw);
  unreadable = false;
  act(() => hook.result.current.retrySync());
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.storageBlocked).toBe(false);
  expect(loadCloud).toHaveBeenCalledTimes(2);
  expect(pushDiff).not.toHaveBeenCalled();
});

it.each(["damaged", "missing"])(
  "keeps a previously %s baseline actionable after Retry without inferring deletion intent",
  async (kind) => {
    const local = { ...snapshot("removed"), records: [] };
    const hook = await start(local, snapshot("remote"));
    if (kind === "missing") localStorage.removeItem(baseKey);
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => hook.result.current.retrySync());
    expect(loadCloud).toHaveBeenCalledTimes(1);
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.storageBlocked).toBe(true);
    expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
    expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
    expect(localStorage.getItem(baseKey)).toBe(kind === "missing" ? null : damagedRaw);
    expect(write).not.toHaveBeenCalled();
    expect(pushDiff).not.toHaveBeenCalled();
  },
);

it.each([
  ["local", "primary"],
  ["cloud", "primary"],
  ["local", "baseline"],
  ["cloud", "baseline"],
] as const)(
  "retains recovery and the conflict after %s choice fails writing %s",
  async (choice, fail) => {
    const local = snapshot("local");
    const remote = snapshot("remote");
    const hook = await start(local, remote);
    const setItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      raw: string,
    ) {
      if (storageKey === (fail === "primary" ? key : baseKey)) throw new Error("quota");
      setItem.call(this, storageKey, raw);
    });
    act(() => hook.result.current.resolveConflict(choice));
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.storageBlocked).toBe(true);
    expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
    expect(hook.result.current.sync).toBe("error");
    expect(hook.result.current.snapshot()).toEqual(local);
    expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
    if (fail === "primary") expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
    else expect(saved(key)).toEqual(choice === "local" ? local : remote);
    expect(pushDiff).not.toHaveBeenCalled();
    write.mockRestore();
    act(() => hook.result.current.resolveConflict(choice));
    expect(hook.result.current.conflict).toBe(false);
    expect(hook.result.current.storageBlocked).toBe(false);
    expect(saved(key)).toEqual(choice === "local" ? local : remote);
    expect(saved(baseKey)).toEqual(remote);
  },
);

it("ignores outgoing-owner recovery actions and restores account-specific recovery after switching back", async () => {
  const hook = await start(snapshot("A-local"), snapshot("A-cloud"));
  const stale = hook.result.current;
  vi.mocked(loadCloud).mockResolvedValue(snapshot("B-cloud"));
  sign("B");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.storageRecovery).toBeNull();
  expect(() => act(() => stale.resolveConflict("cloud"))).toThrow("journal_owner_changed");
  expect(() => act(() => stale.retrySync())).toThrow("journal_owner_changed");
  expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  vi.mocked(loadCloud).mockResolvedValue(snapshot("A-cloud"));
  sign("A");
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
  expect(() => act(() => stale.resolveConflict("local"))).toThrow("journal_owner_changed");
  expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
});

it("never clears a corrupt active primary marker through recovery actions", async () => {
  const raw = "{damaged-primary";
  localStorage.setItem(key, raw);
  localStorage.setItem(baseKey, JSON.stringify(snapshot("baseline")));
  vi.mocked(loadCloud).mockResolvedValue(snapshot("cloud"));
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign();
  expect(hook.result.current.storageRecovery).toEqual({ key, source: "journal" });
  const write = vi.spyOn(Storage.prototype, "setItem");
  act(() => hook.result.current.resolveConflict("local"));
  act(() => hook.result.current.resolveConflict("cloud"));
  act(() => hook.result.current.retrySync());
  expect(() => act(() => hook.result.current.saveRecord(memory("blocked")))).toThrow(
    "invalid_local_snapshot",
  );
  expect(hook.result.current.storageBlocked).toBe(true);
  expect(localStorage.getItem(key)).toBe(raw);
  expect(saved(baseKey)).toEqual(snapshot("baseline"));
  expect(loadCloud).not.toHaveBeenCalled();
  expect(pushDiff).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it("does not overwrite a primary snapshot that became unreadable during cloud loading", async () => {
  localStorage.setItem(key, JSON.stringify(snapshot("local")));
  localStorage.setItem(baseKey, damagedRaw);
  let finish!: (value: JournalSnapshot) => void;
  vi.mocked(loadCloud).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign();
  localStorage.setItem(key, "{damaged-primary");
  const write = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => finish(snapshot("cloud")));
  expect(hook.result.current.storageRecovery).toEqual({ key, source: "journal" });
  expect(hook.result.current.conflict).toBe(false);
  expect(localStorage.getItem(key)).toBe("{damaged-primary");
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  act(() => hook.result.current.retrySync());
  expect(write).not.toHaveBeenCalled();
  expect(pushDiff).not.toHaveBeenCalled();
});

it("keeps an actionable choice when the baseline remains unreadable on Retry", async () => {
  const local = snapshot("local");
  const remote = snapshot("remote");
  const hook = await start(local, remote);
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    storageKey: string,
  ) {
    if (storageKey === baseKey) throw new Error("still unreadable");
    return getItem.call(this, storageKey);
  });
  const write = vi.spyOn(Storage.prototype, "setItem");
  act(() => hook.result.current.retrySync());
  expect(hook.result.current.conflict).toBe(true);
  expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
  expect(loadCloud).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(key)).toBe(hook.primaryRaw);
  expect(write).not.toHaveBeenCalled();
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(hook.result.current.storageBlocked).toBe(false);
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.snapshot()).toEqual(remote);
});

it("keeps new readable local work while recovery is pending and uses it for the explicit local choice", async () => {
  const local = snapshot("local");
  const remote = snapshot("remote");
  const hook = await start(local, remote);
  act(() => hook.result.current.saveRecord(memory("new-local")));
  const latest = { ...local, records: [...local.records, memory("new-local")] };
  expect(saved(key)).toEqual(latest);
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  expect(hook.result.current.storageBlocked).toBe(true);
  expect(hook.result.current.conflict).toBe(true);
  expect(pushDiff).not.toHaveBeenCalled();
  act(() => hook.result.current.resolveConflict("local"));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(pushDiff).toHaveBeenCalledExactlyOnceWith("A", remote, latest);
});

it.each([false, true])(
  "recovers after an intervening tab conflict (cloud retry fails: %s)",
  async (failLoad) => {
    const remote = snapshot("cloud");
    const hook = await start(snapshot("local"), remote);
    const incoming = snapshot("other-tab");
    const newValue = JSON.stringify(incoming);
    localStorage.setItem(key, newValue);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue })));
    expect(hook.result.current.baselineConflict).toBe(false);
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.storageBlocked).toBe(true);
    // Retry must not throw away the newer tab's explicit choice.
    act(() => hook.result.current.retrySync());
    expect(loadCloud).toHaveBeenCalledTimes(1);
    expect(hook.result.current.conflict).toBe(true);
    act(() => hook.result.current.resolveConflict("cloud"));
    expect(hook.result.current.snapshot()).toEqual(incoming);
    expect(hook.result.current.conflict).toBe(false);
    expect(hook.result.current.storageBlocked).toBe(true);
    if (failLoad) vi.mocked(loadCloud).mockRejectedValueOnce(new Error("offline"));
    act(() => hook.result.current.retrySync());
    if (failLoad) {
      await waitFor(() => expect(hook.result.current.sync).toBe("error"));
      expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
      expect(hook.result.current.conflict).toBe(false);
      act(() => hook.result.current.retrySync());
    }
    await waitFor(() => expect(hook.result.current.baselineConflict).toBe(true));
    expect(hook.result.current.storageBlocked).toBe(true);
    expect(saved(key)).toEqual(incoming);
    expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
    expect(pushDiff).not.toHaveBeenCalled();
    act(() => hook.result.current.resolveConflict("local"));
    await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
    expect(pushDiff).toHaveBeenCalledExactlyOnceWith("A", remote, incoming);
  },
);
