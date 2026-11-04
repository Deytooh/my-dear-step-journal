import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { setLocale, t } from "@/lib/i18n";

const effects = vi.hoisted(() => ({
  download: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
  unsubscribe: vi.fn(),
  listener: (_event: string, _session: unknown) => {},
}));
const j = vi.hoisted(() => ({
  ready: true,
  introductionPending: false,
  user: { id: "fixture-user", email: null } as { id: string; email: null } | null,
  records: [],
  purchases: [],
  settings: { showMomo: true, locale: "en" as const },
  sync: "error",
  storageBlocked: false,
  conflict: false,
  hasDemo: false,
  tz: "UTC",
  retrySync: vi.fn(),
  resolveConflict: vi.fn(),
  snapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  isCurrentOwner: vi.fn(() => true),
  undoFor: vi.fn(),
  resetDemo: vi.fn(),
  clearDemo: vi.fn(),
  importGuest: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/download", () => ({ downloadText: effects.download }));
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: effects.signOut,
      onAuthStateChange: (listener: typeof effects.listener) => {
        effects.listener = listener;
        return { data: { subscription: { unsubscribe: effects.unsubscribe } } };
      },
    },
  },
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
  useNavigate: () => effects.navigate,
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

beforeEach(() => {
  vi.clearAllMocks();
  effects.signOut.mockReset();
  j.isCurrentOwner.mockReturnValue(true);
  j.user = { id: "fixture-user", email: null };
  j.sync = "error";
  j.storageBlocked = false;
  j.conflict = false;
  setLocale("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function showShell() {
  return render(
    <AppShell>
      <p>Journal fixture</p>
    </AppShell>,
  );
}
function clickSignOut() {
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("sync.signout") }));
}
function pendingSignOut() {
  let finish!: (value: { error: Error | null }) => void;
  effects.signOut.mockReturnValue(
    new Promise<{ error: Error | null }>((resolve) => {
      finish = resolve;
    }),
  );
  return finish;
}

it("uses only the current session and accepts one click until the pending attempt completes", async () => {
  const finish = pendingSignOut();
  showShell();
  clickSignOut();
  const button = screen.getByRole("button", { name: t("sync.signingOut") });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  fireEvent.click(button);
  expect(effects.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(effects.navigate).not.toHaveBeenCalled();
  await act(async () => finish({ error: null }));
  expect(effects.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/auth", replace: true });
  expect(effects.unsubscribe).toHaveBeenCalledTimes(1);
  expect(toast.error).not.toHaveBeenCalled();
});

it.each(["returned-error", "rejection"])(
  "shows neutral failure feedback and permits retry without false navigation: %s",
  async (failure) => {
    const error = new Error("fictional connection failure");
    if (failure === "rejection") effects.signOut.mockRejectedValueOnce(error);
    else effects.signOut.mockResolvedValueOnce({ error });
    effects.signOut.mockResolvedValueOnce({ error: null });
    showShell();
    clickSignOut();
    await waitFor(() =>
      expect(screen.getByText(t("sync.signoutError"))).toHaveAttribute("role", "alert"),
    );
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(t("sync.signoutError"));
    expect(effects.navigate).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: t("sync.signout") });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(effects.navigate).toHaveBeenCalledTimes(1));
    expect(effects.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(screen.queryByText(t("sync.signoutError"))).not.toBeInTheDocument();
  },
);

it("does not claim the session remains signed in when the SDK emits SIGNED_OUT before returning an error", async () => {
  const finish = pendingSignOut();
  const view = showShell();
  clickSignOut();
  act(() => {
    j.user = null;
    effects.listener("SIGNED_OUT", null);
  });
  view.rerender(
    <AppShell>
      <p>Journal fixture</p>
    </AppShell>,
  );
  await act(async () => finish({ error: new Error("fictional server revocation failure") }));
  expect(effects.navigate).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(t("sync.signoutError"));
  expect(screen.getByText(t("sync.signoutError"))).toHaveAttribute("role", "alert");
  expect(screen.getByRole("link", { name: t("sync.signin") })).toBeVisible();
  expect(screen.queryByRole("button", { name: t("sync.signout") })).not.toBeInTheDocument();
});

it("navigates on confirmed success even when the SDK already emitted SIGNED_OUT", async () => {
  const finish = pendingSignOut();
  const view = showShell();
  clickSignOut();
  act(() => {
    j.user = null;
    effects.listener("SIGNED_OUT", null);
  });
  view.rerender(
    <AppShell>
      <p>Journal fixture</p>
    </AppShell>,
  );
  await act(async () => finish({ error: null }));
  expect(effects.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/auth", replace: true });
});

it.each([null, new Error("fictional stale failure")])(
  "ignores an old result after a different account signs in: %s",
  async (error) => {
    const finish = pendingSignOut();
    const view = showShell();
    clickSignOut();
    act(() => {
      effects.listener("SIGNED_IN", { user: { id: "new-account" } });
      j.user = { id: "new-account", email: null };
    });
    view.rerender(
      <AppShell>
        <p>Journal fixture</p>
      </AppShell>,
    );
    await act(async () => finish({ error }));
    expect(effects.navigate).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: t("sync.signout") })).toBeEnabled();
  },
);

it("ignores a stale result after A signs out and signs back in before React renders", async () => {
  const finish = pendingSignOut();
  showShell();
  clickSignOut();
  await act(async () => {
    effects.listener("SIGNED_OUT", null);
    effects.listener("SIGNED_IN", { user: { id: "fixture-user" } });
    finish({ error: null });
  });
  expect(effects.navigate).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

it("cleans up its listener and ignores completion after unmount", async () => {
  const finish = pendingSignOut();
  const view = showShell();
  clickSignOut();
  view.unmount();
  expect(effects.unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => finish({ error: new Error("fictional late failure") }));
  expect(effects.navigate).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
  expect(effects.unsubscribe).toHaveBeenCalledTimes(1);
});

it("does not let a stale handler sign out a new ownership session", () => {
  j.isCurrentOwner.mockReturnValue(false);
  showShell();
  clickSignOut();
  expect(effects.signOut).not.toHaveBeenCalled();
});
