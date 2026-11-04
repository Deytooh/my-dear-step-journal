import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { t } from "@/lib/i18n";
import type { JournalRecord } from "@/lib/journal";
const ai = vi.hoisted(() => ({ extract: vi.fn() }));
const photo = vi.hoisted(() => ({ shrink: vi.fn() }));
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  shrinkPhoto: photo.shrink,
}));
const j = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: null as { id: string } | null,
  tz: "Asia/Seoul",
  settings: { showMomo: true },
  records: [] as JournalRecord[],
  purchases: [],
  inventory: { lots: [] },
  reminder: null,
  newId: () => "new-id",
  saveRecords: vi.fn(),
  saveRecord: vi.fn(),
  savePurchase: vi.fn(),
  setReminder: vi.fn(),
  saveMomoBatch: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(() => vi.fn()),
  sync: "synced",
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j, canDeduct: () => true }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/today" } }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => ai.extract }));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/app/AppFeel")>()),
  celebrateSave: vi.fn(),
}));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
beforeEach(() => {
  j.user = null;
  j.tz = "Asia/Seoul";
  vi.useFakeTimers({ toFake: ["Date"] });
  // Seoul is already the next calendar day, while UTC is still November 4.
  vi.setSystemTime(new Date("2026-11-04T17:30:00Z"));
  j.records = [];
  sessionStorage.clear();
  vi.clearAllMocks();
  ai.extract.mockReset();
  j.snapshot.mockImplementation(() => ({
    records: j.records,
    purchases: j.purchases,
    settings: j.settings,
    reminder: j.reminder,
    stockAdjust: 0,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["water", "weight", "injection", "condition", "memory", "measure"] as const)(
  "defaults a new historical %s entry to unknown time rather than the current clock",
  (kind) => {
    render(
      <QuickAddSheet
        open
        onOpenChange={vi.fn()}
        kind={kind}
        setKind={vi.fn()}
        initialDate="2026-11-03"
      />,
    );
    expect(screen.getByLabelText(t("f.date"), { exact: true })).toHaveValue("2026-11-03");
    expect(screen.getByLabelText(t("f.timeUnknown"))).toBeChecked();
    const time = screen.getByLabelText(t("f.time"), { exact: true });
    expect(time).toBeDisabled();
    expect(time).toHaveValue("");
  },
);

it.each(["2026-11-03", "2026-11-06", "2026-11-04"])(
  "saves a new non-today entry for %s without inventing an exact historical/future clock",
  (initialDate) => {
    render(
      <QuickAddSheet
        open
        onOpenChange={vi.fn()}
        kind="water"
        setKind={vi.fn()}
        initialDate={initialDate}
      />,
    );
    fireEvent.submit(document.querySelector("form")!);
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        localDate: initialDate,
        precision: "date_only",
        at: null,
        partOfDay: null,
      }),
    );
  },
);

it.each([undefined, "2026-11-05"])(
  "preserves the normal current-clock default for today's entry (%s)",
  (initialDate) => {
    render(
      <QuickAddSheet
        open
        onOpenChange={vi.fn()}
        kind="water"
        setKind={vi.fn()}
        initialDate={initialDate}
      />,
    );
    expect(screen.getByLabelText(t("f.timeUnknown"))).not.toBeChecked();
    expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue("02:30");
    fireEvent.submit(document.querySelector("form")!);
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        localDate: "2026-11-05",
        precision: "exact",
        at: "2026-11-04T17:30:00.000Z",
      }),
    );
  },
);

it.each(["exact", "date_only", "part_of_day"] as const)(
  "preserves an existing historical entry's %s precision even with a different initialDate",
  (precision) => {
    const editing = {
      id: "existing-water",
      type: "water" as const,
      answer: "yes" as const,
      localDate: "2026-11-03",
      precision,
      at: precision === "exact" ? "2026-11-03T04:15:00.000Z" : null,
      partOfDay: precision === "part_of_day" ? ("evening" as const) : null,
      source: "manual_text" as const,
      createdAt: "2026-11-03T10:00:00.000Z",
    };
    render(
      <QuickAddSheet
        open
        onOpenChange={vi.fn()}
        kind="water"
        setKind={vi.fn()}
        editing={editing}
        initialDate="2026-11-05"
      />,
    );
    const time = screen.getByLabelText(t("f.time"), { exact: true });
    expect(time).toHaveValue(precision === "exact" ? "13:15" : "");
    fireEvent.submit(document.querySelector("form")!);
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: editing.id,
        localDate: editing.localDate,
        precision,
        at: editing.at,
        partOfDay: editing.partOfDay,
      }),
    );
  },
);

it("allows an explicit historical clock after choosing to supply its time", () => {
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="water"
      setKind={vi.fn()}
      initialDate="2026-11-03"
    />,
  );
  fireEvent.click(screen.getByLabelText(t("f.timeUnknown")));
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "18:45" },
  });
  fireEvent.submit(document.querySelector("form")!);
  expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      localDate: "2026-11-03",
      precision: "exact",
      at: "2026-11-03T09:45:00.000Z",
    }),
  );
});
