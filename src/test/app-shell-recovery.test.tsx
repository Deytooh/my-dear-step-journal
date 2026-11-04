import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { setLocale, t } from "@/lib/i18n";
import { inventory } from "@/lib/inventory";
import type { JournalSnapshot, MemoryRec } from "@/lib/journal";

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
function expectNoActions() {
  [
    effects.download,
    effects.signOut,
    effects.navigate,
    j.retrySync,
    j.resolveConflict,
    j.snapshot,
    j.restoreSnapshot,
    j.resetDemo,
    j.clearDemo,
    j.importGuest,
    j.setSetting,
  ].forEach((action) => expect(action).not.toHaveBeenCalled());
}
it("opens the conflict choices, focuses their explanation, and waits for an explicit choice", async () => {
  j.conflict = true;
  const write = vi.spyOn(Storage.prototype, "setItem");
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  showShell();
  const trigger = screen.getByRole("button", { name: t("sync.reviewConflict") });
  trigger.focus();
  fireEvent.click(trigger);
  const section = screen.getByRole("group", { name: t("sync.reviewConflict") });
  expect(within(section).getByText(t("sync.conflict"))).toBeInTheDocument();
  expect(within(section).getByRole("button", { name: t("sync.keepLocal") })).toBeInTheDocument();
  expect(within(section).getByRole("button", { name: t("sync.useCloud") })).toBeInTheDocument();
  await waitFor(() => expect(section).toHaveFocus());
  expectNoActions();
  expect(write).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();

  fireEvent.keyDown(section, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  expectNoActions();
});
it("opens recovery with the download control without reading or downloading local data", async () => {
  j.storageBlocked = true;
  // Storage recovery takes precedence when both warnings are present.
  j.conflict = true;
  const read = vi.spyOn(Storage.prototype, "getItem");
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click");
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  const section = screen.getByRole("group", { name: t("backup.recoverData") });
  expect(within(section).getByRole("button", { name: t("backup.recovery") })).toBeInTheDocument();
  await waitFor(() => expect(section).toHaveFocus());
  expect(read).not.toHaveBeenCalled();
  expect(anchorClick).not.toHaveBeenCalled();
  expectNoActions();
});
it("keeps the ordinary sync Retry action unchanged", () => {
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("momo.retry") }));
  expect(j.retrySync).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(j.resolveConflict).not.toHaveBeenCalled();
  expect(effects.download).not.toHaveBeenCalled();
});
it("preserves normal Settings focus after a recovery shortcut was used", async () => {
  j.conflict = true;
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("sync.reviewConflict") }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const settings = screen.getByRole("button", { name: t("set.settings") });
  fireEvent.click(settings);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: t("sync.keepLocal") })).toHaveFocus(),
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(settings).toHaveFocus());
  expectNoActions();
});

it.each([
  ["local", "sync.keepLocal"],
  ["cloud", "sync.useCloud"],
] as const)("only resolves with %s after that option is explicitly selected", (choice, label) => {
  j.conflict = true;
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("sync.reviewConflict") }));
  expect(j.resolveConflict).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t(label) }));
  expect(j.resolveConflict).toHaveBeenCalledExactlyOnceWith(choice);
});

it.each(["syncing", "local", "synced"] as const)(
  "keeps unresolved conflicts visible when sync changes to %s",
  async (sync) => {
    j.conflict = true;
    const view = showShell();
    j.sync = sync;
    view.rerender(
      <AppShell>
        <p>Journal fixture</p>
      </AppShell>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(t("sync.conflict"));
    const trigger = screen.getByRole("button", { name: t("sync.reviewConflict") });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t("sync.reviewConflict"))).toBeInTheDocument();
    expect(within(dialog).queryByText(t(`sync.${sync}`))).not.toBeInTheDocument();
    const section = within(dialog).getByRole("group", { name: t("sync.reviewConflict") });
    await waitFor(() => expect(section).toHaveFocus());
    expect(within(section).getByRole("button", { name: t("sync.keepLocal") })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: t("sync.useCloud") })).toBeInTheDocument();
    expectNoActions();
  },
);

const backupData: JournalSnapshot = {
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, locale: "en", timezone: "UTC" },
};
const backupRecord: MemoryRec = {
  id: "fictional-memory",
  type: "memory",
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  createdAt: "2026-11-04T12:00:00Z",
  source: "manual_text",
  note: "Fictional backup fixture",
};
const newEntries: JournalSnapshot = { ...backupData, records: [backupRecord] };
function startDeferredRestore() {
  let resolve!: (text: string) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const file = new File([], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => pending });
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.change(screen.getByLabelText(t("set.restore")), { target: { files: [file] } });
  return { resolve, reject };
}
it.each(["switch", "switch-back", "unmount"] as const)(
  "discards a delayed restore after an account %s without confirmation, writes, or toasts",
  async (change) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const success = vi.spyOn(toast, "success");
    const failure = vi.spyOn(toast, "error");
    const view = showShell();
    const pending = startDeferredRestore();
    if (change === "unmount") {
      view.unmount();
    } else {
      j.user = { id: "other-user", email: null };
      view.rerender(
        <AppShell>
          <p>Journal fixture</p>
        </AppShell>,
      );
      if (change === "switch-back") {
        j.user = { id: "fixture-user", email: null };
        view.rerender(
          <AppShell>
            <p>Journal fixture</p>
          </AppShell>,
        );
      }
    }
    await act(async () =>
      pending.resolve(
        JSON.stringify({
          app: "my-dear-step",
          version: 2,
          data: newEntries,
        }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
    expectNoActions();
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  },
);
it("suppresses a late file-read error after the account changes", async () => {
  const failure = vi.spyOn(toast, "error");
  const view = showShell();
  const pending = startDeferredRestore();
  j.user = { id: "other-user", email: null };
  view.rerender(
    <AppShell>
      <p>Journal fixture</p>
    </AppShell>,
  );
  await act(async () => pending.reject(new Error("unreadable file")));
  expect(failure).not.toHaveBeenCalled();
  expectNoActions();
});
it.each([true, false])(
  "still requires explicit restore confirmation (%s) for the same owner",
  async (confirmed) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(confirmed);
    const success = vi.spyOn(toast, "success");
    j.snapshot.mockReturnValue(backupData);
    showShell();
    const pending = startDeferredRestore();
    await act(async () =>
      pending.resolve(
        JSON.stringify({
          app: "my-dear-step",
          version: 2,
          data: newEntries,
        }),
      ),
    );
    expect(confirm).toHaveBeenCalledExactlyOnceWith(t("backup.preview", { n: 1, skipped: 0 }));
    if (confirmed) {
      expect(j.restoreSnapshot).toHaveBeenCalledExactlyOnceWith(newEntries);
      expect(success).toHaveBeenCalledOnce();
    } else {
      expect(j.restoreSnapshot).not.toHaveBeenCalled();
      expect(j.undoFor).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
    }
  },
);

it("discards a delayed restore when the provider owner changes before Header rerenders", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  showShell();
  const pending = startDeferredRestore();
  // Auth refs have changed, but this render still exposes the original user.
  j.isCurrentOwner.mockReturnValue(false);
  await act(async () =>
    pending.resolve(
      JSON.stringify({
        app: "my-dear-step",
        version: 2,
        data: backupData,
      }),
    ),
  );
  expect(j.user.id).toBe("fixture-user");
  expect(confirm).not.toHaveBeenCalled();
  expectNoActions();
  expect(success).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});

it("preserves an imported lot's exact stock correction and offers Undo only after saving", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const success = vi.spyOn(toast, "success");
  const undo = vi.fn();
  j.undoFor.mockReturnValueOnce(undo);
  j.snapshot.mockReturnValue(backupData);
  const imported: JournalSnapshot = {
    ...backupData,
    purchases: [
      {
        id: "fictional-lot",
        localDate: "2026-11-04",
        amount: 0,
        currency: "USD",
        doses: 4,
        medication: "Fictional medication",
        stockUnit: "single",
        addsStock: true,
      },
    ],
    settings: {
      ...backupData.settings,
      stockAdjustments: {
        "fictional-lot": {
          identity: JSON.stringify(["Fictional medication", "single", null]),
          delta: -3,
        },
      },
    },
  };
  showShell();
  const pending = startDeferredRestore();
  await act(async () =>
    pending.resolve(JSON.stringify({ app: "my-dear-step", version: 2, data: imported })),
  );
  expect(confirm).toHaveBeenCalledExactlyOnceWith(t("backup.preview", { n: 1, skipped: 0 }));
  const restored = j.restoreSnapshot.mock.calls[0]![0] as JournalSnapshot;
  expect(
    inventory(restored.purchases, restored.records, restored.settings.stockAdjustments).lots[0]!
      .balance,
  ).toBe(1);
  expect(success).toHaveBeenCalledExactlyOnceWith(t("backup.imported", { n: 1, skipped: 0 }), {
    action: { label: t("toast.undo"), onClick: undo },
  });
  expect(j.restoreSnapshot.mock.invocationCallOrder[0]!).toBeLessThan(
    j.undoFor.mock.invocationCallOrder[0]!,
  );
  expect(j.undoFor).toHaveBeenCalledExactlyOnceWith(backupData);
});

it("reports valid-file persistence failures separately and never offers Undo or success", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const failure = vi.spyOn(toast, "error");
  const success = vi.spyOn(toast, "success");
  j.snapshot.mockReturnValue(backupData);
  j.restoreSnapshot.mockImplementationOnce(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  showShell();
  const pending = startDeferredRestore();
  await act(async () =>
    pending.resolve(JSON.stringify({ app: "my-dear-step", version: 2, data: newEntries })),
  );
  expect(failure).toHaveBeenCalledExactlyOnceWith(t("backup.saveFailed"));
  expect(failure).not.toHaveBeenCalledWith(t("set.badFile"));
  expect(success).not.toHaveBeenCalled();
  expect(j.undoFor).not.toHaveBeenCalled();
});

it.each([
  "not json",
  JSON.stringify({ app: "other-app", version: 2, data: newEntries }),
  JSON.stringify({ app: "my-dear-step", version: 2, data: {} }),
])("reports an invalid backup without planning or writing (%s)", async (text) => {
  const failure = vi.spyOn(toast, "error");
  const confirm = vi.spyOn(window, "confirm");
  showShell();
  const pending = startDeferredRestore();
  await act(async () => pending.resolve(text));
  expect(failure).toHaveBeenCalledExactlyOnceWith(t("set.badFile"));
  expect(confirm).not.toHaveBeenCalled();
  expectNoActions();
});

it.each([backupData, newEntries])(
  "reports no new entries without confirmation, writes, or Undo",
  async (existing) => {
    const info = vi.spyOn(toast, "info");
    const success = vi.spyOn(toast, "success");
    const confirm = vi.spyOn(window, "confirm");
    j.snapshot.mockReturnValue(existing);
    showShell();
    const pending = startDeferredRestore();
    await act(async () =>
      pending.resolve(JSON.stringify({ app: "my-dear-step", version: 2, data: existing })),
    );
    expect(info).toHaveBeenCalledExactlyOnceWith(
      t("backup.noNew", { skipped: existing.records.length }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(j.restoreSnapshot).not.toHaveBeenCalled();
    expect(j.undoFor).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  },
);

it("refuses ambiguous stock explicitly without calling the file invalid or partially importing", async () => {
  const failure = vi.spyOn(toast, "error");
  const confirm = vi.spyOn(window, "confirm");
  j.snapshot.mockReturnValue(backupData);
  showShell();
  const pending = startDeferredRestore();
  await act(async () =>
    pending.resolve(
      JSON.stringify({ app: "my-dear-step", version: 1, data: { ...newEntries, stockAdjust: -3 } }),
    ),
  );
  expect(failure).toHaveBeenCalledExactlyOnceWith(t("backup.stockConflict"));
  expect(confirm).not.toHaveBeenCalled();
  expect(j.restoreSnapshot).not.toHaveBeenCalled();
  expect(j.undoFor).not.toHaveBeenCalled();
});

it("rechecks owner validity after the import confirmation", async () => {
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  j.snapshot.mockReturnValue(backupData);
  vi.spyOn(window, "confirm").mockImplementation(() => {
    j.isCurrentOwner.mockReturnValue(false);
    return true;
  });
  showShell();
  const pending = startDeferredRestore();
  await act(async () =>
    pending.resolve(JSON.stringify({ app: "my-dear-step", version: 2, data: newEntries })),
  );
  expect(j.restoreSnapshot).not.toHaveBeenCalled();
  expect(j.undoFor).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});

it("starts a recovery download with the untouched owner-specific raw bytes", () => {
  j.storageBlocked = true;
  const raw = '{ "fictional": "invalid journal, keep original bytes"';
  const read = vi.spyOn(Storage.prototype, "getItem").mockReturnValue(raw);
  const success = vi.spyOn(toast, "success");
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
  fireEvent.click(screen.getByRole("button", { name: t("backup.recovery") }));
  expect(read).toHaveBeenCalledExactlyOnceWith("mds.journal.v1.user.fixture-user");
  expect(effects.download).toHaveBeenCalledExactlyOnceWith(
    raw,
    "my-dear-step-recovery.json",
    "application/json",
  );
  expect(success).toHaveBeenCalledExactlyOnceWith(t("toast.exported"));
  expect(j.restoreSnapshot).not.toHaveBeenCalled();
});

it.each(["read", "missing", "download"])(
  "reports a recovery-copy %s failure without claiming success",
  (kind) => {
    j.storageBlocked = true;
    const failure = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      if (kind === "read") throw new Error("Storage unavailable");
      return kind === "missing" ? null : "Fictional invalid local journal";
    });
    if (kind === "download")
      effects.download.mockImplementationOnce(() => {
        throw new Error("Object URLs unavailable");
      });
    showShell();
    fireEvent.click(screen.getByRole("button", { name: t("backup.recoverData") }));
    fireEvent.click(screen.getByRole("button", { name: t("backup.recovery") }));
    expect(failure).toHaveBeenCalledExactlyOnceWith(t("export.failed"));
    expect(success).not.toHaveBeenCalled();
    if (kind !== "download") expect(effects.download).not.toHaveBeenCalled();
  },
);

it.each([
  ["guest_stock_conflict", "sync.importStockConflict"],
  ["photo_unavailable", "sync.importFailed"],
] as const)(
  "explains guest import refusal %s without claiming success",
  async (reason, message) => {
    const failure = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    j.importGuest.mockRejectedValueOnce(new Error(reason));
    showShell();
    fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
    fireEvent.click(screen.getByRole("button", { name: t("sync.importGuest") }));
    await waitFor(() => expect(failure).toHaveBeenCalledExactlyOnceWith(t(message)));
    expect(success).not.toHaveBeenCalled();
  },
);

it("does not start guest import from an outgoing owner's settings control", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  j.isCurrentOwner.mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: t("sync.importGuest") }));
  expect(confirm).not.toHaveBeenCalled();
  expect(j.importGuest).not.toHaveBeenCalled();
});

it("does not show a late guest import failure to a different owner", async () => {
  const failure = vi.spyOn(toast, "error");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let reject!: (error: Error) => void;
  j.importGuest.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("sync.importGuest") }));
  j.isCurrentOwner.mockReturnValue(false);
  await act(async () => reject(new Error("guest_stock_conflict")));
  expect(failure).not.toHaveBeenCalled();
});
