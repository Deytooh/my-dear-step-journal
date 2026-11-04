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
const key = "mds.journal.v1";
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
const saved = (storageKey = key): JournalSnapshot => JSON.parse(localStorage.getItem(storageKey)!);
const renderJournal = () => renderHook(() => useJournal(), { wrapper: JournalProvider });
const otherTabWrites = (incoming: JournalSnapshot, storageKey = key) => {
  const oldValue = localStorage.getItem(storageKey);
  const newValue = JSON.stringify(incoming);
  localStorage.setItem(storageKey, newValue);
  act(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey, oldValue, newValue })),
  );
};
const sign = (id: string | null) =>
  act(() =>
    auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null),
  );
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(snapshot("this-tab")));
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["local", "cloud"] as const)(
  "durably keeps the selected %s guest snapshot through reload",
  async (choice) => {
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("this-tab"));
    otherTabWrites(snapshot("other-tab"));
    expect(hook.result.current.conflict).toBe(true);
    act(() => hook.result.current.resolveConflict(choice));
    const selected = snapshot(choice === "local" ? "this-tab" : "other-tab");
    expect(hook.result.current.snapshot()).toEqual(selected);
    expect(saved()).toEqual(selected);
    expect(hook.result.current.conflict).toBe(false);
    expect(hook.result.current.sync).toBe("local");
    hook.unmount();
    const reloaded = renderJournal();
    await waitFor(() => expect(reloaded.result.current.ready).toBe(true));
    expect(reloaded.result.current.snapshot()).toEqual(selected);
    expect(pushDiff).not.toHaveBeenCalled();
  },
);

it.each(["local", "cloud"] as const)(
  "retains both conflict choices when the %s write fails and permits retry",
  async (choice) => {
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("this-tab"));
    otherTabWrites(snapshot("other-tab"));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => act(() => hook.result.current.resolveConflict(choice))).not.toThrow();
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.sync).toBe("error");
    expect(hook.result.current.snapshot()).toEqual(snapshot("this-tab"));
    expect(saved()).toEqual(snapshot("other-tab"));
    write.mockRestore();
    act(() => hook.result.current.resolveConflict(choice));
    expect(hook.result.current.conflict).toBe(false);
    expect(saved()).toEqual(snapshot(choice === "local" ? "this-tab" : "other-tab"));
  },
);

it("persists the latest local edit made while the conflict is open", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  otherTabWrites(snapshot("other-tab"));
  act(() => hook.result.current.saveRecord(memory("newer-local")));
  const chosen = hook.result.current.snapshot();
  // Another tab can write again while the user considers the two versions.
  otherTabWrites(snapshot("newer-other-tab"));
  act(() => hook.result.current.resolveConflict("local"));
  expect(saved()).toEqual(chosen);
  expect(hook.result.current.snapshot()).toEqual(chosen);
});

it("keeps a chosen account snapshot in its own namespace and pushes against the cloud conflict baseline", async () => {
  const accountKey = `${key}.user.A`;
  localStorage.setItem(accountKey, JSON.stringify(snapshot("account-local")));
  const remote = snapshot("account-cloud");
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  act(() => hook.result.current.resolveConflict("local"));
  expect(saved(accountKey)).toEqual(snapshot("account-local"));
  expect(saved()).toEqual(snapshot("this-tab"));
  await waitFor(
    () => expect(pushDiff).toHaveBeenCalledExactlyOnceWith("A", remote, snapshot("account-local")),
    { timeout: 3000 },
  );
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
});

it("does not discard a failed cloud choice or resume remote writes until the retry succeeds", async () => {
  localStorage.setItem(`${key}.user.A`, JSON.stringify(snapshot("account-local")));
  const remote = snapshot("account-cloud");
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() => act(() => hook.result.current.resolveConflict("cloud"))).not.toThrow();
  expect(hook.result.current.conflict).toBe(true);
  expect(hook.result.current.records[0]?.id).toBe("account-local");
  expect(pushDiff).not.toHaveBeenCalled();
  write.mockRestore();
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.sync).toBe("synced");
  expect(saved(`${key}.user.A`)).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("persists the chosen cloud baseline so signing back in does not reopen the same conflict", async () => {
  const accountKey = `${key}.user.A`;
  const oldBase = snapshot("old-base");
  localStorage.setItem(accountKey, JSON.stringify(snapshot("account-local")));
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(oldBase));
  const remote = snapshot("account-cloud");
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(saved(accountKey)).toEqual(remote);
  expect(saved(`${accountKey}.base`)).toEqual(remote);
  sign(null);
  sign("A");
  await waitFor(() => expect(loadCloud).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.snapshot()).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it.each(["local", "cloud"] as const)(
  "keeps a %s cloud conflict pending if its durable baseline write fails",
  async (choice) => {
    const accountKey = `${key}.user.A`;
    const oldBase = snapshot("old-base");
    const local = snapshot("account-local");
    const remote = snapshot("account-cloud");
    localStorage.setItem(accountKey, JSON.stringify(local));
    localStorage.setItem(`${accountKey}.base`, JSON.stringify(oldBase));
    vi.mocked(loadCloud).mockResolvedValue(remote);
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    sign("A");
    await waitFor(() => expect(hook.result.current.conflict).toBe(true));
    const setItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      storageKey,
      value,
    ) {
      if (storageKey === `${accountKey}.base`) throw new Error("quota");
      setItem.call(this, storageKey, value);
    });
    expect(() => act(() => hook.result.current.resolveConflict(choice))).not.toThrow();
    expect(hook.result.current.conflict).toBe(true);
    expect(hook.result.current.sync).toBe("error");
    expect(hook.result.current.snapshot()).toEqual(local);
    expect(saved(`${accountKey}.base`)).toEqual(oldBase);
    expect(pushDiff).not.toHaveBeenCalled();
    write.mockRestore();
    act(() => hook.result.current.resolveConflict(choice));
    expect(hook.result.current.conflict).toBe(false);
    expect(saved(accountKey)).toEqual(choice === "local" ? local : remote);
    expect(saved(`${accountKey}.base`)).toEqual(remote);
  },
);

it("requires a choice when offline deletion emptied an existing account and the cloud changed concurrently", async () => {
  const accountKey = `${key}.user.A`;
  const base = snapshot("original");
  const local = { ...base, records: [] };
  const remote = { ...base, records: [...base.records, memory("unseen-cloud-addition")] };
  localStorage.setItem(accountKey, JSON.stringify(local));
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(base));
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  expect(hook.result.current.snapshot()).toEqual(local);
  expect(saved(accountKey)).toEqual(local);
  expect(pushDiff).not.toHaveBeenCalled();
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(hook.result.current.snapshot()).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("still adopts the cloud for a fresh empty account with no saved baseline", async () => {
  const accountKey = `${key}.user.A`;
  const local = { ...snapshot("unused"), records: [] };
  const remote = snapshot("cloud-existing");
  localStorage.setItem(accountKey, JSON.stringify(local));
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.snapshot()).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("does not invent a conflict when local and cloud both deleted the last entry", async () => {
  const accountKey = `${key}.user.A`;
  const base = snapshot("original");
  const empty = { ...base, records: [] };
  localStorage.setItem(accountKey, JSON.stringify(empty));
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(base));
  vi.mocked(loadCloud).mockResolvedValue(empty);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.conflict).toBe(false);
  expect(hook.result.current.snapshot()).toEqual(empty);
});

it("adopts cloud rather than treating a missing account snapshot with a leftover baseline as an offline deletion", async () => {
  const accountKey = `${key}.user.A`;
  const remote = snapshot("cloud-kept");
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(remote));
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.snapshot()).toEqual(remote);
  expect(saved(accountKey)).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("keeps a new local edit without deleting unseen cloud rows when the initial snapshot was missing", async () => {
  const accountKey = `${key}.user.A`;
  const remote = snapshot("cloud-kept");
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(remote));
  let finish!: (value: JournalSnapshot) => void;
  vi.mocked(loadCloud).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(loadCloud).toHaveBeenCalledOnce());
  expect(localStorage.getItem(`${accountKey}.base`)).toBeNull();
  act(() => hook.result.current.saveRecord(memory("created-during-load")));
  await act(async () => finish(remote));
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  expect(hook.result.current.records.map((record) => record.id)).toEqual(["created-during-load"]);
  expect(saved(accountKey).records.map((record) => record.id)).toEqual(["created-during-load"]);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("keeps orphaned comparison history retired through a failed load, retry and provider reload", async () => {
  const accountKey = `${key}.user.A`;
  const remote = snapshot("cloud-kept");
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(remote));
  vi.mocked(loadCloud).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("error"));
  act(() => hook.result.current.saveRecord(memory("new-offline-edit")));
  act(() => hook.result.current.retrySync());
  await waitFor(() => expect(hook.result.current.conflict).toBe(true));
  expect(hook.result.current.records.map((record) => record.id)).toEqual(["new-offline-edit"]);
  expect(pushDiff).not.toHaveBeenCalled();
  hook.unmount();
  const reloaded = renderJournal();
  await waitFor(() => expect(reloaded.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(reloaded.result.current.conflict).toBe(true));
  expect(reloaded.result.current.records.map((record) => record.id)).toEqual(["new-offline-edit"]);
  expect(pushDiff).not.toHaveBeenCalled();
});

it("blocks new local saves and cloud writes if orphan-baseline retirement fails, then safely retries", async () => {
  const accountKey = `${key}.user.A`;
  const remote = snapshot("cloud-kept");
  localStorage.setItem(`${accountKey}.base`, JSON.stringify(remote));
  vi.mocked(loadCloud).mockResolvedValue(remote);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("error"));
  expect(loadCloud).not.toHaveBeenCalled();
  expect(() => act(() => hook.result.current.saveRecord(memory("blocked-edit")))).toThrow(
    "storage unavailable",
  );
  expect(localStorage.getItem(accountKey)).toBeNull();
  expect(saved(`${accountKey}.base`)).toEqual(remote);
  expect(hook.result.current.records).toEqual([]);
  expect(pushDiff).not.toHaveBeenCalled();
  remove.mockRestore();
  act(() => hook.result.current.retrySync());
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.snapshot()).toEqual(remote);
  expect(pushDiff).not.toHaveBeenCalled();
});

it.each(["", "{damaged"])(
  "does not retire baseline recovery metadata when the local snapshot is unreadable (%j)",
  async (raw) => {
    const accountKey = `${key}.user.A`;
    const remote = snapshot("cloud-kept");
    localStorage.setItem(accountKey, raw);
    localStorage.setItem(`${accountKey}.base`, JSON.stringify(remote));
    vi.mocked(loadCloud).mockResolvedValue(remote);
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    sign("A");
    await waitFor(() => expect(hook.result.current.storageBlocked).toBe(true));
    expect(localStorage.getItem(accountKey)).toBe(raw);
    expect(saved(`${accountKey}.base`)).toEqual(remote);
    expect(() => act(() => hook.result.current.saveRecord(memory("blocked-edit")))).toThrow();
    expect(loadCloud).not.toHaveBeenCalled();
    expect(pushDiff).not.toHaveBeenCalled();
  },
);
