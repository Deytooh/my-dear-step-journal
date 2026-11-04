import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  JournalProvider,
  useJournal,
  type JournalContextValue,
  type JournalSnapshot,
  type MemoryRec,
  type Purchase,
} from "@/lib/journal";

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
// Deliberately unresolved: this suite isolates local ownership, never cloud hydration.
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn(() => new Promise(() => {})),
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
const purchase = (id: string): Purchase => ({
  id,
  localDate: "2026-11-03",
  amount: 10,
  currency: "USD",
  doses: 4,
  medication: "test medicine",
  stockUnit: "single",
  addsStock: true,
});
const snapshot = (owner: string): JournalSnapshot => ({
  records: [memory(`${owner}-private`), memory("shared-id"), { ...memory("demo-id"), demo: true }],
  purchases: [purchase("shared-lot")],
  reminder: null,
  stockAdjust: 1,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const transition = (id: string | null) =>
  auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null);
const attempt = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    expect(error).toEqual(new Error("journal_owner_changed"));
  }
};
const actions: [string, (journal: JournalContextValue) => unknown][] = [
  ["saveRecord", (j) => j.saveRecord(memory("outgoing-private"))],
  ["restoreRecord", (j) => j.restoreRecord(memory("outgoing-private"))],
  ["deleteRecord", (j) => j.deleteRecord("shared-id")],
  ["savePurchase", (j) => j.savePurchase(purchase("outgoing-purchase"))],
  ["deletePurchase", (j) => j.deletePurchase("shared-lot")],
  ["setReminder", (j) => j.setReminder("2026-11-10T10:00:00Z")],
  ["setStock", (j) => j.setStock(20, "shared-lot")],
  ["setSetting", (j) => j.setSetting("showMomo", false)],
  ["confirmLegacyAdjustment", (j) => j.confirmLegacyAdjustment()],
  ["clearDemo", (j) => j.clearDemo()],
  ["respondPrompt", (j) => j.respondPrompt("memory", "2026-11-03", memory("outgoing-private"))],
  [
    "saveMomoBatch without explicit owner",
    (j) => j.saveMomoBatch([memory("outgoing-private")], []),
  ],
  ["late undoFor acquisition", (j) => j.undoFor(snapshot("A"))()],
];
beforeEach(() => {
  localStorage.clear();
  for (const owner of ["guest", "A", "B"])
    localStorage.setItem(
      owner === "guest" ? key : `${key}.user.${owner}`,
      JSON.stringify(snapshot(owner)),
    );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(actions)(
  "rejects stale %s before React renders the incoming account",
  async (_name, action) => {
    const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => transition("A"));
    const captured = hook.result.current;
    const incomingBefore = localStorage.getItem(`${key}.user.B`);
    const outgoingBefore = localStorage.getItem(`${key}.user.A`);
    act(() => {
      transition("B");
      expect(hook.result.current).toBe(captured);
      expect(captured.isCurrentOwner()).toBe(false);
      attempt(() => action(captured));
    });
    expect(localStorage.getItem(`${key}.user.B`)).toBe(incomingBefore);
    expect(localStorage.getItem(`${key}.user.A`)).toBe(outgoingBefore);
    expect(hook.result.current.records).toEqual(snapshot("B").records);
  },
  5000,
);

it.each([null, "A"])(
  "invalidates a saved record action across A → B → %s",
  async (lastOwner) => {
    const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => transition("A"));
    const captured = hook.result.current;
    const destination = lastOwner ? `${key}.user.${lastOwner}` : key;
    const before = localStorage.getItem(destination);
    act(() => {
      transition("B");
      transition(lastOwner);
      attempt(() => captured.saveRecord(memory("outgoing-private")));
    });
    expect(localStorage.getItem(destination)).toBe(before);
  },
  5000,
);

it("does not expose incoming private records through an outgoing snapshot closure", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  act(() => {
    transition("B");
    expect(() => captured.snapshot()).toThrow("journal_owner_changed");
  });
}, 5000);

it("invalidates saved actions after unmount", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const captured = hook.result.current;
  const before = localStorage.getItem(key);
  hook.unmount();
  attempt(() => captured.saveRecord(memory("after-unmount")));
  expect(localStorage.getItem(key)).toBe(before);
}, 5000);

it("keeps captured actions usable across ordinary same-owner rerenders", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const captured = hook.result.current;
  act(() => hook.result.current.setSetting("showMomo", false));
  expect(hook.result.current).not.toBe(captured);
  act(() => captured.saveRecord(memory("same-owner")));
  expect(hook.result.current.records).toContainEqual(memory("same-owner"));
  expect(hook.result.current.settings.showMomo).toBe(false);
}, 5000);

it("does not let an outgoing account reset the incoming guest to demo data", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  const before = localStorage.getItem(key);
  act(() => {
    transition(null);
    attempt(() => captured.resetDemo());
  });
  expect(localStorage.getItem(key)).toBe(before);
}, 5000);

it("does not let a stale retry persist the incoming guest snapshot", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  const writes = vi.spyOn(Storage.prototype, "setItem");
  act(() => {
    transition(null);
    attempt(() => captured.retrySync());
  });
  expect(writes).not.toHaveBeenCalled();
}, 5000);

it("does not let an outgoing conflict choice resolve an incoming account's conflict", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  const before = localStorage.getItem(`${key}.user.B`);
  act(() => {
    transition("B");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: `${key}.user.B`,
        newValue: JSON.stringify(snapshot("B-other-tab")),
      }),
    );
    attempt(() => captured.resolveConflict("cloud"));
  });
  expect(localStorage.getItem(`${key}.user.B`)).toBe(before);
  expect(hook.result.current.conflict).toBe(true);
}, 5000);

it("rejects a stale guest import before reading either journal", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  await act(async () => {
    transition("B");
    const reads = vi.spyOn(Storage.prototype, "getItem");
    await expect(captured.importGuest()).rejects.toThrow("journal_owner_changed");
    expect(reads).not.toHaveBeenCalled();
  });
}, 5000);

it("rejects an old Momo batch even when an A → B → A transition matches its explicit owner", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => transition("A"));
  const captured = hook.result.current;
  const before = localStorage.getItem(`${key}.user.A`);
  act(() => {
    transition("B");
    transition("A");
    expect(() => captured.saveMomoBatch([memory("old-session")], [], "A")).toThrow(
      "journal_owner_changed",
    );
  });
  expect(localStorage.getItem(`${key}.user.A`)).toBe(before);
}, 5000);
