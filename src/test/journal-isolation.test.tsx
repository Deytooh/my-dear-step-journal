import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
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
const blank = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  note: id,
  localDate: "2026-10-30",
  precision: "date_only",
  at: null,
  source: "manual_text",
  createdAt: "2026-10-30T00:00:00Z",
});
const sign = (id: string | null) =>
  act(() =>
    auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null),
  );
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
it("never imports guest or demo data into a new account automatically", async () => {
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({ ...blank(), records: [memory("guest"), { ...memory("demo"), demo: true }] }),
  );
  vi.mocked(loadCloud).mockResolvedValue(null);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.records).toHaveLength(2));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.records).toHaveLength(0);
  await act(async () => hook.result.current.importGuest());
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["guest"]);
  sign(null);
  await waitFor(() => expect(hook.result.current.user).toBeNull());
  expect(hook.result.current.records).toHaveLength(2);
  sign("B");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.records).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records).toHaveLength(1);
  hook.unmount();
});
it("ignores a late account load and preserves unsynced work in its original namespace", async () => {
  let finishA!: (s: JournalSnapshot) => void;
  vi.mocked(loadCloud)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        }),
    )
    .mockResolvedValue({ ...blank(), records: [memory("B-only")] });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(loadCloud).toHaveBeenCalledTimes(1));
  act(() => hook.result.current.saveRecord(memory("A-unsynced")));
  sign("B");
  await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("B-only"));
  await act(async () => finishA({ ...blank(), records: [memory("A-late")] }));
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["B-only"]);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records[0].id).toBe(
    "A-unsynced",
  );
  hook.unmount();
});
it("serializes uploads so a late snapshot cannot overwrite a newer correction", async () => {
  vi.mocked(loadCloud).mockResolvedValue(blank());
  let finish!: (rows: MemoryRec[]) => void;
  vi.mocked(pushDiff)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([]);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  const original = memory("edit");
  act(() => hook.result.current.saveRecord(original));
  await waitFor(() => expect(pushDiff).toHaveBeenCalledTimes(1), { timeout: 3000 });
  act(() => hook.result.current.saveRecord({ ...original, note: "new correction" }));
  await act(async () => finish([{ ...original, photo: "storage:A/photo" }]));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 4000 });
  expect(hook.result.current.records[0]).toMatchObject({ note: "new correction" });
  expect(vi.mocked(pushDiff).mock.calls.at(-1)![2].records[0]).toMatchObject({
    note: "new correction",
  });
  hook.unmount();
});
it("targeted Undo retains later entries and restores only its prompt marker", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const before = hook.result.current.snapshot();
  act(() => hook.result.current.respondPrompt("memory", "2026-10-30", memory("first")));
  const undo = hook.result.current.undoFor(before);
  act(() => hook.result.current.saveRecord(memory("later")));
  act(undo);
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["later"]);
  expect(hook.result.current.settings.prompts?.answered?.memory).toBeUndefined();
  hook.unmount();
});

it("deletes an entry remotely even when deletion happened during its first upload", async () => {
  vi.mocked(loadCloud).mockResolvedValue(blank());
  let finish!: (rows: MemoryRec[]) => void;
  vi.mocked(pushDiff)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([]);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  act(() => hook.result.current.saveRecord(memory("delete-during-upload")));
  await waitFor(() => expect(pushDiff).toHaveBeenCalledTimes(1), { timeout: 3000 });
  act(() => hook.result.current.deleteRecord("delete-during-upload"));
  await act(async () => finish([]));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 4000 });
  const last = vi.mocked(pushDiff).mock.calls.at(-1)!;
  expect(last[1].records.map((r) => r.id)).toContain("delete-during-upload");
  expect(last[2].records).toHaveLength(0);
  hook.unmount();
});

it("never treats a failed local cache write during cloud load as an instruction to delete remote data", async () => {
  vi.mocked(loadCloud).mockResolvedValue({ ...blank(), records: [memory("remote-safe")] });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("error"));
  storage.mockRestore();
  act(() => hook.result.current.retrySync());
  await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("remote-safe"));
  expect(pushDiff).not.toHaveBeenCalled();
  hook.unmount();
});
it("keeps an invalid local snapshot untouched instead of overwriting it with an empty journal", async () => {
  localStorage.setItem("mds.journal.v1", "{damaged");
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.storageBlocked).toBe(true));
  expect(() => act(() => hook.result.current.saveRecord(memory("new")))).toThrow();
  expect(localStorage.getItem("mds.journal.v1")).toBe("{damaged");
  hook.unmount();
});
