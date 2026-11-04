import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { JournalProvider, useJournal, type JournalSnapshot, type MemoryRec } from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";
import { t } from "@/lib/i18n";

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
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    activeProps: _activeProps,
    ...props
  }: {
    to: string;
    children: ReactNode;
    activeProps?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/today" }, matches: [] }),
}));
vi.mock("@/components/app/AppFeel", () => ({ AppFeel: () => null }));
vi.mock("@/components/app/Onboarding", () => ({
  Onboarding: () => null,
  FirstUseHint: () => null,
  InterestChoices: () => null,
}));
vi.mock("@/components/app/QuickAddSheet", () => ({ QuickAddSheet: () => null }));
const key = "mds.journal.v1.user.A";
const baseKey = `${key}.base`;
const guestKey = "mds.journal.v1";
const damagedRaw = "{damaged-baseline";
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
  settings: { showMomo: true, timezone: "UTC", locale: "en" },
});
const sign = () => act(() => auth.listener("SIGNED_IN", { user: { id: "A", email: null } }));
const wrapper = ({ children }: { children: ReactNode }) => (
  <JournalProvider>
    <AppShell>{children}</AppShell>
  </JournalProvider>
);
async function start(damaged = false) {
  const local = snapshot("local");
  localStorage.setItem(key, JSON.stringify(local));
  localStorage.setItem(baseKey, damaged ? damagedRaw : JSON.stringify(local));
  vi.mocked(loadCloud).mockResolvedValue(damaged ? snapshot("cloud") : local);
  const hook = renderHook(() => useJournal(), { wrapper });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign();
  await waitFor(() => expect(hook.result.current.sync).toBe(damaged ? "error" : "synced"));
  return hook;
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("does not describe an incoming tab conflict as the cloud version during baseline recovery", async () => {
  const hook = await start(true);
  const incoming = snapshot("other-tab");
  const raw = JSON.stringify(incoming);
  localStorage.setItem(key, raw);
  act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue: raw })));
  expect(hook.result.current.conflict).toBe(true);
  expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  const section = screen.getByRole("group", { name: t("sync.reviewConflict") });
  expect(within(section).getByRole("alert")).toHaveTextContent(t("sync.conflict"));
  fireEvent.click(within(section).getByRole("button", { name: t("sync.useCloud") }));
  expect(hook.result.current.snapshot()).toEqual(incoming);
  expect(localStorage.getItem(baseKey)).toBe(damagedRaw);
  expect(pushDiff).not.toHaveBeenCalled();
});

it.each(["malformed", "invalid", "unreadable"])(
  "rejects a %s guest import without blocking the healthy account's sync",
  async (kind) => {
    const hook = await start();
    const raw = kind === "invalid" ? "{}" : "{damaged-guest";
    localStorage.setItem(guestKey, raw);
    const getItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
    ) {
      if (kind === "unreadable" && storageKey === guestKey) throw new Error("unavailable");
      return getItem.call(this, storageKey);
    });
    const write = vi.spyOn(Storage.prototype, "setItem");
    let outcome: unknown;
    await act(async () => {
      outcome = await hook.result.current.importGuest().then(
        () => "fulfilled",
        (error) => error,
      );
    });
    read.mockRestore();
    expect(hook.result.current.snapshot()).toEqual(snapshot("local"));
    expect(localStorage.getItem(guestKey)).toBe(raw);
    expect(hook.result.current.storageRecovery).toBeNull();
    expect(hook.result.current.storageBlocked).toBe(false);
    expect(outcome).toBeInstanceOf(Error);
    expect(write).not.toHaveBeenCalled();
    act(() => hook.result.current.saveRecord(memory("later")));
    await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
    expect(pushDiff).toHaveBeenCalledOnce();
  },
);

it("keeps baseline recovery assigned to the active account when a guest import is malformed", async () => {
  const hook = await start(true);
  localStorage.setItem(guestKey, "{damaged-guest");
  let outcome: unknown;
  await act(async () => {
    outcome = await hook.result.current.importGuest().then(
      () => "fulfilled",
      (error) => error,
    );
  });
  expect(hook.result.current.conflict).toBe(true);
  expect(hook.result.current.storageRecovery).toEqual({ key: baseKey, source: "baseline" });
  expect(outcome).toBeInstanceOf(Error);
  act(() => hook.result.current.resolveConflict("cloud"));
  expect(hook.result.current.storageBlocked).toBe(false);
  expect(hook.result.current.snapshot()).toEqual(snapshot("cloud"));
  expect(localStorage.getItem(guestKey)).toBe("{damaged-guest");
  act(() => auth.listener("SIGNED_OUT", null));
  expect(hook.result.current.storageRecovery).toEqual({ key: guestKey, source: "journal" });
  expect(() => act(() => hook.result.current.saveRecord(memory("blocked")))).toThrow(
    "invalid_local_snapshot",
  );
  expect(localStorage.getItem(guestKey)).toBe("{damaged-guest");
});
