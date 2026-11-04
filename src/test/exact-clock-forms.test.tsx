import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
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
  j.tz = "America/New_York";
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
afterEach(cleanup);

it("requires a real local clock for a manual record and permits correcting it", () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="water" setKind={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("f.date"), { exact: true }), {
    target: { value: "2026-03-08" },
  });
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "02:30" },
  });
  fireEvent.submit(document.querySelector("form")!);
  expect(j.saveRecord).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(t("validation.date"));
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "03:30" },
  });
  fireEvent.submit(document.querySelector("form")!);
  expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      localDate: "2026-03-08",
      at: "2026-03-08T07:30:00.000Z",
      precision: "exact",
    }),
  );
});

it("allows explicitly unknown time on a daylight-saving transition date", () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="water" setKind={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("f.date"), { exact: true }), {
    target: { value: "2026-03-08" },
  });
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "02:30" },
  });
  fireEvent.click(screen.getByLabelText(t("f.timeUnknown")));
  fireEvent.submit(document.querySelector("form")!);
  expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      localDate: "2026-03-08",
      at: null,
      precision: "date_only",
    }),
  );
});

it("does not silently move a reminder out of a nonexistent local time", () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="reminder" setKind={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("f.date"), { exact: true }), {
    target: { value: "2026-03-08" },
  });
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "02:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(j.setReminder).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(t("validation.date"));
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: "03:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(j.setReminder).toHaveBeenCalledExactlyOnceWith("2026-03-08T07:30:00.000Z");
});

it("retains a meal draft when its selected clock is nonexistent and saves a valid correction", () => {
  render(<MealForm onDone={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("meal.title")), { target: { value: "Fictional meal" } });
  fireEvent.change(screen.getByLabelText(t("f.date")), { target: { value: "2026-03-08" } });
  fireEvent.click(screen.getByText(t("meal.optional"), { selector: "summary" }));
  fireEvent.change(screen.getByLabelText(t("f.time")), { target: { value: "02:30" } });
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  expect(j.saveRecord).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(t("meal.invalid"));
  expect(screen.getByLabelText(t("f.time"))).toHaveValue("02:30");
  fireEvent.change(screen.getByLabelText(t("f.time")), { target: { value: "03:30" } });
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      localDate: "2026-03-08",
      at: "2026-03-08T07:30:00.000Z",
      precision: "exact",
    }),
  );
});
