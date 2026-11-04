import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppShell, useQuickAdd } from "@/components/app/AppShell";
import type { MemoryRec } from "@/lib/journal";
import { setLocale, t } from "@/lib/i18n";
import { toast } from "sonner";
const downloads = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/download", () => ({ downloadText: downloads.start }));
const j = vi.hoisted(() => ({
  ready: true,
  introductionPending: false,
  user: { id: "A", email: null } as { id: string; email: null } | null,
  records: [] as MemoryRec[],
  purchases: [],
  settings: { showMomo: true, locale: "en" as const },
  sync: "synced",
  storageBlocked: false,
  conflict: false,
  hasDemo: false,
  tz: "Asia/Seoul",
  snapshot: vi.fn(),
  isCurrentOwner: vi.fn(() => true),
}));
const sheet = vi.hoisted(() => ({
  seen: [] as Array<{
    owner: string;
    open: boolean;
    editing?: MemoryRec;
    kind: string;
    initialDate?: string;
  }>,
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({
      location: { pathname: "/today" },
      matches: [{ meta: [{ title: "Original route title" }] }],
    }),
}));
vi.mock("@/components/app/AppFeel", () => ({ AppFeel: () => null }));
vi.mock("@/components/app/Onboarding", () => ({
  Onboarding: () => null,
  FirstUseHint: () => null,
  InterestChoices: () => null,
}));
vi.mock("@/components/app/QuickAddSheet", () => ({
  QuickAddSheet: (props: {
    open: boolean;
    editing?: MemoryRec;
    kind: string;
    initialDate?: string;
  }) => {
    sheet.seen.push({ ...props, owner: j.user?.id ?? "guest" });
    return props.open ? (
      <div data-testid="open-editor">{props.editing?.note ?? "New entry"}</div>
    ) : null;
  },
}));
const fixture: MemoryRec = {
  id: "A-entry",
  type: "memory",
  note: "Fictional A-only note",
  at: null,
  localDate: "2026-11-04",
  precision: "date_only",
  createdAt: "2026-11-04T00:00:00Z",
  source: "manual_text",
};
function Controls() {
  const open = useQuickAdd();
  return (
    <>
      <button onClick={() => open("memory", fixture)}>Edit A fixture</button>
      <button onClick={() => open("meal", undefined, "2026-11-03")}>New meal fixture</button>
    </>
  );
}
beforeEach(() => {
  j.user = { id: "A", email: null };
  j.records = [];
  sheet.seen = [];
  vi.clearAllMocks();
  j.isCurrentOwner.mockReturnValue(true);
  downloads.start.mockReset();
  j.snapshot.mockImplementation(() => ({
    records: j.records,
    purchases: j.purchases,
    reminder: null,
    stockAdjust: 0,
    settings: j.settings,
  }));
  setLocale("en");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("closes the current editor without passing its record or date to the next account", () => {
  const view = render(
    <AppShell>
      <Controls />
    </AppShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit A fixture" }));
  expect(screen.getByTestId("open-editor")).toHaveTextContent(fixture.note);
  j.user = { id: "B", email: null };
  view.rerender(
    <AppShell>
      <Controls />
    </AppShell>,
  );
  expect(screen.queryByTestId("open-editor")).not.toBeInTheDocument();
  const received = sheet.seen.filter((props) => props.owner === "B");
  expect(received.length).toBeGreaterThan(0);
  expect(
    received.every(
      (props) => !props.open && props.kind === "menu" && !props.editing && !props.initialDate,
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "New meal fixture" }));
  expect(screen.getByTestId("open-editor")).toHaveTextContent("New entry");
  expect(sheet.seen.at(-1)).toEqual(
    expect.objectContaining({
      owner: "B",
      open: true,
      kind: "meal",
      initialDate: "2026-11-03",
      editing: undefined,
    }),
  );
});
it("does not reopen a stale editor when returning to an earlier account", () => {
  const view = render(
    <AppShell>
      <Controls />
    </AppShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit A fixture" }));
  j.user = null;
  view.rerender(
    <AppShell>
      <Controls />
    </AppShell>,
  );
  expect(screen.queryByTestId("open-editor")).not.toBeInTheDocument();
  j.user = { id: "A", email: null };
  view.rerender(
    <AppShell>
      <Controls />
    </AppShell>,
  );
  expect(screen.queryByTestId("open-editor")).not.toBeInTheDocument();
  expect(sheet.seen.at(-1)).toEqual(
    expect.objectContaining({ owner: "A", open: false, editing: undefined, kind: "menu" }),
  );
});

it("exports a JSON backup using the journal day rather than the UTC filename date", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T16:30:00Z"));
  const success = vi.spyOn(toast, "success");
  j.records = [fixture];
  render(
    <AppShell>
      <div>Journal</div>
    </AppShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("set.backup") }));
  expect(downloads.start).toHaveBeenCalledOnce();
  const [contents, filename, mime] = downloads.start.mock.calls[0]!;
  expect(JSON.parse(contents)).toMatchObject({
    app: "my-dear-step",
    version: 2,
    data: { records: [fixture] },
  });
  expect(filename).toBe("my-dear-step-2026-11-05.json");
  expect(mime).toBe("application/json");
  expect(success).toHaveBeenCalledWith(t("toast.exported"));
});
it("reports a failed backup download without claiming success or changing saved entries", () => {
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  j.records = [fixture];
  downloads.start.mockImplementationOnce(() => {
    throw new Error("download unavailable");
  });
  render(
    <AppShell>
      <div>Journal</div>
    </AppShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("set.backup") }));
  expect(failure).toHaveBeenCalledWith(t("export.failed"));
  expect(success).not.toHaveBeenCalled();
  expect(j.records).toEqual([fixture]);
});

it("does not read or export a newer owner's snapshot through a stale JSON export control", () => {
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  render(
    <AppShell>
      <div>Journal</div>
    </AppShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  // Auth refs can change before this component rerenders for the new owner.
  j.isCurrentOwner.mockReturnValue(false);
  j.snapshot.mockReturnValue({
    records: [{ ...fixture, id: "B-entry", note: "Fictional B-only note" }],
  });
  fireEvent.click(screen.getByRole("button", { name: t("set.backup") }));
  expect(j.isCurrentOwner).toHaveBeenCalledOnce();
  expect(j.snapshot).not.toHaveBeenCalled();
  expect(downloads.start).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});
