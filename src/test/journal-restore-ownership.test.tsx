import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot, type MemoryRec } from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";

const auth = vi.hoisted(() => ({
  listener: (_event: string, _session: unknown) => {},
  getUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: auth.getUser,
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
const snapshot = (id: string): JournalSnapshot => ({
  records: [
    {
      id,
      type: "memory",
      note: id,
      localDate: "2026-11-03",
      precision: "date_only",
      at: null,
      createdAt: "2026-11-03T10:00:00Z",
      source: "manual_text",
    } satisfies MemoryRec,
  ],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const transition = (id: string | null) =>
  auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null);
const renderJournal = () => renderHook(() => useJournal(), { wrapper: JournalProvider });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify(snapshot("guest")));
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null } });
  vi.mocked(loadCloud).mockReset().mockResolvedValue(null);
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["A", null])(
  "rejects an old restore closure immediately on switching from B to %s, before React renders",
  async (nextOwner) => {
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => transition("B"));
    await waitFor(() => expect(hook.result.current.user?.id).toBe("B"));
    const captured = hook.result.current;
    act(() => {
      transition(nextOwner);
      expect(hook.result.current).toBe(captured);
      expect(() => captured.restoreSnapshot(snapshot("private-backup"))).toThrow(
        "journal_owner_changed",
      );
      expect(captured.isCurrentOwner()).toBe(false);
    });
    expect(localStorage.getItem(`${key}.user.B`) ?? "").not.toContain("private-backup");
    expect(localStorage.getItem(`${key}.user.A`) ?? "").not.toContain("private-backup");
    expect(localStorage.getItem(key)).not.toContain("private-backup");
  },
);

it.each([{ owners: ["B"] }, { owners: ["B", "A"] }])(
  "cancels a deferred restore before confirmation across same-act auth transitions $owners",
  async ({ owners }) => {
    localStorage.setItem(`${key}.user.A`, JSON.stringify(snapshot("account-A")));
    const hook = renderJournal();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => transition("A"));
    await waitFor(() => expect(hook.result.current.user?.id).toBe("A"));
    const captured = hook.result.current;
    let finish!: (text: string) => void;
    const file = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const confirm = vi.fn(() => true);
    const completion = (async () => {
      const text = await file;
      if (!captured.isCurrentOwner()) return;
      if (confirm()) captured.restoreSnapshot(JSON.parse(text));
    })();
    await act(async () => {
      for (const owner of owners) transition(owner);
      expect(hook.result.current).toBe(captured);
      finish(JSON.stringify(snapshot("private-backup")));
      await completion;
      expect(confirm).not.toHaveBeenCalled();
      expect(() => captured.restoreSnapshot(snapshot("private-backup"))).toThrow(
        "journal_owner_changed",
      );
    });
    expect(localStorage.getItem(`${key}.user.A`) ?? "").not.toContain("private-backup");
    expect(localStorage.getItem(`${key}.user.B`) ?? "").not.toContain("private-backup");
    expect(localStorage.getItem(key)).not.toContain("private-backup");
  },
);

it("keeps a captured restore valid through ordinary edits in the same ownership epoch", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const captured = hook.result.current;
  act(() => hook.result.current.setSetting("showMomo", false));
  expect(hook.result.current).not.toBe(captured);
  expect(captured.isCurrentOwner()).toBe(true);
  act(() => captured.restoreSnapshot(snapshot("chosen-backup")));
  expect(hook.result.current.snapshot()).toEqual(snapshot("chosen-backup"));
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(snapshot("chosen-backup"));
});

it("invalidates a captured restore after provider unmount", async () => {
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const captured = hook.result.current;
  hook.unmount();
  expect(() => captured.restoreSnapshot(snapshot("private-backup"))).toThrow(
    "journal_owner_changed",
  );
  expect(captured.isCurrentOwner()).toBe(false);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(snapshot("guest"));
});

it("keeps the already-loaded guest ownership valid when initial authentication confirms that same guest", async () => {
  let finish!: (value: { data: { user: null } }) => void;
  const initialized = new Promise<{ data: { user: null } }>((resolve) => {
    finish = resolve;
  });
  auth.getUser.mockReturnValue(initialized);
  const hook = renderJournal();
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const captured = hook.result.current;
  await act(async () => {
    finish({ data: { user: null } });
    await initialized;
    expect(hook.result.current).toBe(captured);
    expect(captured.isCurrentOwner()).toBe(true);
    captured.restoreSnapshot(snapshot("chosen-guest-backup"));
  });
  expect(hook.result.current.snapshot()).toEqual(snapshot("chosen-guest-backup"));
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(snapshot("chosen-guest-backup"));
});
