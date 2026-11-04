import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { setLocale, t } from "@/lib/i18n";
import type { JournalContextValue } from "@/lib/journal";

const effects = vi.hoisted(() => ({
  download: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
}));
const j = vi.hoisted(() => ({
  ready: true,
  introductionPending: false,
  user: { id: "fixture-user", email: null },
  records: [],
  purchases: [],
  settings: { showMomo: true, locale: "en" as const },
  sync: "error",
  storageBlocked: true,
  storageRecovery: null as JournalContextValue["storageRecovery"],
  conflict: false,
  baselineConflict: true,
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
vi.mock("@/lib/download", () => ({ downloadText: effects.download }));
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: effects.signOut } },
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
  j.isCurrentOwner.mockReturnValue(true);
  j.importGuest.mockReset().mockResolvedValue(undefined);
  j.user = { id: "fixture-user", email: null };
  j.sync = "error";
  localStorage.clear();
  j.storageBlocked = true;
  j.storageRecovery = {
    key: "mds.journal.v1.user.fixture-user.base",
    source: "baseline",
  };
  j.conflict = true;
  j.baselineConflict = true;
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

it("downloads the damaged baseline's original bytes with a distinct filename, never the healthy primary", () => {
  const primaryRaw = '{ "healthy": "primary fixture" }';
  const damagedBase = "{ damaged-baseline, original spacing";
  localStorage.setItem("mds.journal.v1.user.fixture-user", primaryRaw);
  localStorage.setItem("mds.journal.v1.user.fixture-user.base", damagedBase);
  const read = vi.spyOn(Storage.prototype, "getItem");
  const success = vi.spyOn(toast, "success");
  showShell();
  expect(screen.getByRole("alert")).toHaveTextContent(t("backup.invalidBaseline"));
  expect(screen.queryByText(t("backup.invalidLocal"))).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  expect(read).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(t("backup.baselineChoice"))).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: t("backup.baselineRecovery") }));
  expect(read).toHaveBeenCalledExactlyOnceWith("mds.journal.v1.user.fixture-user.base");
  expect(effects.download).toHaveBeenCalledExactlyOnceWith(
    damagedBase,
    "my-dear-step-sync-history-recovery.json",
    "application/json",
  );
  expect(success).toHaveBeenCalledExactlyOnceWith(t("toast.exported"));
  expect(j.resolveConflict).not.toHaveBeenCalled();
});

it("offers Retry alongside a baseline recovery conflict", () => {
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  fireEvent.click(screen.getByRole("button", { name: t("momo.retry") }));
  expect(j.retrySync).toHaveBeenCalledOnce();
  expect(j.resolveConflict).not.toHaveBeenCalled();
  expect(effects.download).not.toHaveBeenCalled();
});

it("does not read or download recovery data from an outgoing owner's control", () => {
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  j.isCurrentOwner.mockReturnValue(false);
  const read = vi.spyOn(Storage.prototype, "getItem");
  fireEvent.click(screen.getByRole("button", { name: t("backup.baselineRecovery") }));
  expect(read).not.toHaveBeenCalled();
  expect(effects.download).not.toHaveBeenCalled();
});

it.each(["unreadable", "missing", "download"])(
  "reports %s baseline recovery failure without substituting the healthy primary",
  (kind) => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      if (kind === "unreadable") throw new Error("unreadable");
      return kind === "missing" ? null : "{damaged-baseline";
    });
    if (kind === "download")
      effects.download.mockImplementationOnce(() => {
        throw new Error("download");
      });
    const failure = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    showShell();
    fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
    fireEvent.click(screen.getByRole("button", { name: t("backup.baselineRecovery") }));
    expect(read).toHaveBeenCalledExactlyOnceWith("mds.journal.v1.user.fixture-user.base");
    expect(failure).toHaveBeenCalledExactlyOnceWith(t("export.failed"));
    expect(success).not.toHaveBeenCalled();
    if (kind !== "download") expect(effects.download).not.toHaveBeenCalled();
  },
);

it("updates the recovery target when the visible account changes", () => {
  const view = showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  j.user = { id: "next-user", email: null };
  j.storageRecovery = { key: "mds.journal.v1.user.next-user.base", source: "baseline" };
  const raw = "{next-user-baseline";
  localStorage.setItem(j.storageRecovery.key, raw);
  view.rerender(
    <AppShell>
      <p>Journal fixture</p>
    </AppShell>,
  );
  const read = vi.spyOn(Storage.prototype, "getItem");
  fireEvent.click(screen.getByRole("button", { name: t("backup.baselineRecovery") }));
  expect(read).toHaveBeenCalledExactlyOnceWith("mds.journal.v1.user.next-user.base");
  expect(effects.download).toHaveBeenCalledExactlyOnceWith(
    raw,
    "my-dear-step-sync-history-recovery.json",
    "application/json",
  );
});

it("does not describe an intervening tab conflict as a cloud journal choice", () => {
  j.baselineConflict = false;
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(t("sync.conflict"))).toBeInTheDocument();
  expect(within(dialog).queryByText(t("backup.baselineChoice"))).not.toBeInTheDocument();
});
