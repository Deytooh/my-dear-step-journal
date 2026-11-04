import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type MemoryRec, type Purchase } from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";

const auth = vi.hoisted(() => ({ listener: (_event: string, _session: unknown) => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
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
const local = `localphoto:A:${"a".repeat(64)}`;
const stored = `storage:A/source-${"a".repeat(64)}`;
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  note: "Synthetic example",
  photo: local,
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-04T10:00:00Z",
  source: "manual_text",
});
const purchase = (id: string): Purchase => ({
  id,
  localDate: "2026-11-04",
  amount: 1,
  currency: "EUR",
  doses: 0,
  medication: null,
  addsStock: false,
});
const start = async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadCloud).mockReset().mockResolvedValue(null);
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("repeats the same stable IDs without duplicates or overwriting original creation time", async () => {
  const hook = await start();
  act(() => hook.result.current.saveMomoBatch([memory("one")], [purchase("two")], null));
  act(() =>
    hook.result.current.saveMomoBatch(
      [{ ...memory("one"), photo: stored, createdAt: "2026-11-04T11:00:00Z" }],
      [purchase("two")],
      null,
    ),
  );
  expect(hook.result.current.records).toEqual([memory("one")]);
  expect(hook.result.current.purchases).toEqual([purchase("two")]);
});

it.each(["record", "purchase"] as const)(
  "rejects a changed existing %s before persisting any part of a batch",
  async (kind) => {
    const hook = await start();
    act(() => hook.result.current.saveMomoBatch([memory("one")], [purchase("two")], null));
    const before = localStorage.getItem("mds.journal.v1");
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() =>
      act(() =>
        hook.result.current.saveMomoBatch(
          [
            kind === "record" ? { ...memory("one"), note: "New correction" } : memory("one"),
            memory("new"),
          ],
          [
            kind === "purchase" ? { ...purchase("two"), amount: 2 } : purchase("two"),
            purchase("new-purchase"),
          ],
          null,
        ),
      ),
    ).toThrow("momo_existing_entry_changed");
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem("mds.journal.v1")).toBe(before);
    expect(hook.result.current.records).toEqual([memory("one")]);
    expect(hook.result.current.purchases).toEqual([purchase("two")]);
  },
);

it("keeps a failed multi-record write atomic and accepts the same-ID retry", async () => {
  const hook = await start();
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() =>
    act(() =>
      hook.result.current.saveMomoBatch([memory("one"), memory("two")], [purchase("three")], null),
    ),
  ).toThrow("quota");
  expect(hook.result.current.records).toEqual([]);
  expect(hook.result.current.purchases).toEqual([]);
  storage.mockRestore();
  act(() =>
    hook.result.current.saveMomoBatch([memory("one"), memory("two")], [purchase("three")], null),
  );
  expect(hook.result.current.records).toHaveLength(2);
  expect(hook.result.current.purchases).toHaveLength(1);
});

it("rejects a captured batch after the owner changes and leaves the new namespace untouched", async () => {
  const hook = await start();
  const captured = hook.result.current;
  act(() => {
    auth.listener("SIGNED_IN", { user: { id: "A", email: null } });
    expect(() => captured.saveMomoBatch([memory("private")], [], null)).toThrow(
      "momo_owner_changed",
    );
  });
  expect(hook.result.current.records).toEqual([]);
  expect(localStorage.getItem("mds.journal.v1.user.A") ?? "").not.toContain("private");
});

it("keeps a captured Undo inside its original ownership session", async () => {
  const hook = await start();
  act(() => auth.listener("SIGNED_IN", { user: { id: "A", email: null } }));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  const before = hook.result.current.snapshot();
  act(() => hook.result.current.saveMomoBatch([memory("same-id")], [], "A"));
  const undo = hook.result.current.undoFor(before);
  localStorage.setItem(
    "mds.journal.v1.user.B",
    JSON.stringify({ ...before, records: [memory("same-id")] }),
  );
  act(() => auth.listener("SIGNED_IN", { user: { id: "B", email: null } }));
  const originalB = localStorage.getItem("mds.journal.v1.user.B");
  const storage = vi.spyOn(Storage.prototype, "setItem");
  act(undo);
  expect(storage).not.toHaveBeenCalled();
  expect(hook.result.current.records).toEqual([memory("same-id")]);
  expect(localStorage.getItem("mds.journal.v1.user.B")).toBe(originalB);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records).toEqual([
    memory("same-id"),
  ]);
});

it("undoes a batch after its ordinary cloud upload has migrated its photo reference", async () => {
  const hook = await start();
  act(() => auth.listener("SIGNED_IN", { user: { id: "A", email: null } }));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  vi.mocked(pushDiff).mockResolvedValueOnce([{ ...memory("photo"), photo: stored }]);
  const before = hook.result.current.snapshot();
  act(() => hook.result.current.saveMomoBatch([memory("photo")], [], "A"));
  const undo = hook.result.current.undoFor(before);
  await waitFor(() => expect(hook.result.current.records[0]).toMatchObject({ photo: stored }), {
    timeout: 3000,
  });
  act(undo);
  expect(hook.result.current.records).toEqual([]);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records).toEqual([]);
});
