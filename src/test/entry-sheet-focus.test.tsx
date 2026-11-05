import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppShell, useQuickAdd } from "@/components/app/AppShell";
import { preloadQuickAdd } from "@/components/app/quick-add-loader";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import type { WaterRec } from "@/lib/journal";
import { setLocale, t } from "@/lib/i18n";

const route = vi.hoisted(() => ({ pathname: "/today" }));
const j = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  ready: true,
  introductionPending: false,
  user: { id: "focus-fixture", email: null },
  records: [],
  purchases: [],
  settings: { showMomo: true, locale: "en" as const },
  sync: "synced",
  storageBlocked: false,
  conflict: false,
  hasDemo: false,
  tz: "UTC",
  reminder: null,
  inventory: { lots: [] },
  newId: () => "new-focus-fixture",
  saveRecord: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(),
  resolveConflict: vi.fn(),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j, canDeduct: () => true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
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
    select({ location: { pathname: route.pathname }, matches: [] }),
}));
vi.mock("@/components/app/AppFeel", () => ({ AppFeel: () => null, celebrateSave: vi.fn() }));
vi.mock("@/components/app/Onboarding", () => ({
  Onboarding: () => null,
  FirstUseHint: () => null,
  InterestChoices: () => null,
}));
vi.mock("@/components/app/MealForm", () => ({ MealForm: () => null }));
vi.mock("@/components/app/MomoSheet", () => ({
  MomoSheet: () => (
    <>
      <DrawerTitle>Momo fixture</DrawerTitle>
      <DrawerDescription>Capture fixture</DrawerDescription>
      <textarea aria-label="Momo sheet input" />
    </>
  ),
}));

const record: WaterRec = {
  id: "focus-record",
  type: "water",
  answer: "yes",
  localDate: "2026-11-03",
  at: null,
  precision: "date_only",
  createdAt: "2026-11-03T12:00:00Z",
  source: "manual_text",
};

function Controls({
  showEditor = true,
  disabled = false,
  hidden = false,
}: {
  showEditor?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}) {
  const open = useQuickAdd();
  return (
    <>
      {showEditor && (
        <button disabled={disabled} hidden={hidden} onClick={() => open("water", record)}>
          Edit fixture record
        </button>
      )}
      <button onClick={() => open("voice")}>Open Momo fixture</button>
      <div id="momo-workspace">
        <textarea aria-label="Home Momo input" />
      </div>
    </>
  );
}
function shell(props: { showEditor?: boolean; disabled?: boolean; hidden?: boolean } = {}) {
  return (
    <AppShell>
      <Controls {...props} />
    </AppShell>
  );
}
function openWithFocus(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
}
async function expectClosedAt(button: HTMLElement) {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(button).toHaveFocus());
}

beforeEach(async () => {
  // These cases exercise the loaded forms; cold-download cancellation has its own tests.
  await preloadQuickAdd();
  vi.clearAllMocks();
  j.user = { id: "focus-fixture", email: null };
  j.sync = "synced";
  j.conflict = false;
  route.pathname = "/today";
  j.snapshot.mockReturnValue({ records: [], purchases: [], settings: j.settings });
  j.undoFor.mockReturnValue(vi.fn());
  setLocale("en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["Escape", "Close", "Save"] as const)(
  "returns central Add focus after %s without focusing an input on open",
  async (action) => {
    render(shell());
    const add = screen.getByRole("button", { name: t("nav.add") });
    openWithFocus(add);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    if (action === "Save") {
      fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(t("type.water")) }));
      fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
      expect(j.saveRecord).toHaveBeenCalledOnce();
    } else if (action === "Close") {
      fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
    } else {
      fireEvent.keyDown(dialog, { key: "Escape" });
    }
    await expectClosedAt(add);
  },
);

it.each(["Escape", "Close", "Save"] as const)(
  "returns to the specific record editor control after %s",
  async (action) => {
    render(shell());
    const edit = screen.getByRole("button", { name: "Edit fixture record" });
    openWithFocus(edit);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    if (action === "Save") {
      fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
      expect(j.saveRecord).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }));
    } else if (action === "Close") {
      fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
    } else {
      fireEvent.keyDown(dialog, { key: "Escape" });
    }
    await expectClosedAt(edit);
  },
);

it.each(["removed", "disabled", "hidden"] as const)(
  "uses visible central Add when the original opener is %s",
  async (condition) => {
    const view = render(shell());
    openWithFocus(screen.getByRole("button", { name: "Edit fixture record" }));
    view.rerender(
      shell({
        showEditor: condition !== "removed",
        disabled: condition === "disabled",
        hidden: condition === "hidden",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
    await expectClosedAt(screen.getByRole("button", { name: t("nav.add") }));
  },
);

it("keeps a failed save in the editor instead of returning focus to its opener", async () => {
  render(shell());
  const edit = screen.getByRole("button", { name: "Edit fixture record" });
  openWithFocus(edit);
  j.saveRecord.mockImplementationOnce(() => {
    throw new Error("Fixture persistence failure");
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(edit).not.toHaveFocus();
});

it.each(["Add", "record"] as const)(
  "restores the actual %s click target when a browser leaves focus on the previous input",
  async (entry) => {
    render(shell());
    screen.getByRole("textbox", { name: "Home Momo input" }).focus();
    const opener = screen.getByRole("button", {
      name: entry === "Add" ? t("nav.add") : "Edit fixture record",
    });
    // fireEvent does not implicitly focus a clicked button, like pointer clicks on Safari.
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
    await expectClosedAt(opener);
  },
);

it("retains the direct Home Momo focus handoff without opening a sheet", async () => {
  render(shell());
  openWithFocus(screen.getByRole("button", { name: "Open Momo fixture" }));
  await expectClosedAt(screen.getByRole("textbox", { name: "Home Momo input" }));
});

it("does not let a delayed close steal focus from a newly reopened sheet", async () => {
  render(shell());
  openWithFocus(screen.getByRole("button", { name: "Edit fixture record" }));
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  const add = screen.getByRole("button", { name: t("nav.add") });
  fireEvent.click(add);
  const dialog = screen.getByRole("dialog");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(dialog).toHaveFocus();
  expect(within(dialog).getByText(t("qa.title"))).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await expectClosedAt(add);
});

it("does not restore Add over the Home Momo handoff when its menu closes", async () => {
  render(shell());
  openWithFocus(screen.getByRole("button", { name: t("nav.add") }));
  const dialog = screen.getByRole("dialog");
  openWithFocus(within(dialog).getByRole("button", { name: new RegExp(t("voice.all")) }));
  const input = screen.getByRole("textbox", { name: "Home Momo input" });
  await expectClosedAt(input);
  // Radix closes its FocusScope asynchronously. The handoff must survive that callback.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(input).toHaveFocus();
});

it("keeps Momo on other routes in the sheet and restores its opener", async () => {
  route.pathname = "/calendar";
  render(shell());
  const openMomo = screen.getByRole("button", { name: "Open Momo fixture" });
  openWithFocus(openMomo);
  expect(screen.getByRole("dialog")).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Momo sheet input" })).not.toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await expectClosedAt(openMomo);
});

it.each(["local", "cloud"] as const)(
  "focuses the truthful Settings status after a successful %s conflict choice",
  async (choice) => {
    j.conflict = true;
    const view = render(shell());
    openWithFocus(screen.getByRole("button", { name: t("sync.reviewConflict") }));
    openWithFocus(
      screen.getByRole("button", {
        name: t(choice === "local" ? "sync.keepLocal" : "sync.useCloud"),
      }),
    );
    expect(j.resolveConflict).toHaveBeenCalledExactlyOnceWith(choice);
    j.conflict = false;
    j.sync = choice === "local" ? "syncing" : "synced";
    view.rerender(shell());
    const status = within(screen.getByRole("dialog")).getByRole("status");
    expect(status).toHaveTextContent(t(choice === "local" ? "sync.syncing" : "sync.synced"));
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole("button", { name: t("sync.keepLocal") })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await expectClosedAt(screen.getByRole("button", { name: t("set.settings") }));
  },
);

it("keeps a failed conflict choice focused and available", () => {
  j.conflict = true;
  const view = render(shell());
  openWithFocus(screen.getByRole("button", { name: t("sync.reviewConflict") }));
  const choice = screen.getByRole("button", { name: t("sync.keepLocal") });
  openWithFocus(choice);
  j.sync = "error";
  view.rerender(shell());
  expect(choice).toHaveFocus();
  expect(choice).toBeEnabled();
  expect(screen.getByRole("button", { name: t("sync.useCloud") })).toBeEnabled();
  expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent(
    t("sync.reviewConflict"),
  );
});

it("gives the backup import label a visible focus-within indicator", () => {
  render(shell());
  openWithFocus(screen.getByRole("button", { name: t("set.settings") }));
  const input = screen.getByLabelText(t("set.restore"));
  input.focus();
  expect(input).toHaveFocus();
  expect(input.closest("label")).toHaveClass("focus-within:ring-2", "focus-within:ring-ring");
});
