import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
import { t } from "@/lib/i18n";
import type { JournalRecord, MealRec, Reminder } from "@/lib/journal";
import { emptyMeal } from "@/lib/meals";
import { localDateOf, timeOf } from "@/lib/dates";
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
  reminder: null as Reminder | null,
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
  j.reminder = null;
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

const cases = [
  {
    tz: "Europe/Paris",
    date: "2026-10-25",
    time: "02:30",
    at: "2026-10-25T01:30:56.789Z",
    changed: "2026-10-25T00:31:00.000Z",
  },
  {
    tz: "America/New_York",
    date: "2026-11-01",
    time: "01:30",
    at: "2026-11-01T06:30:56.789Z",
    changed: "2026-11-01T05:31:00.000Z",
  },
  {
    tz: "Australia/Lord_Howe",
    date: "2026-04-05",
    time: "01:45",
    at: "2026-04-04T15:15:56.789Z",
    changed: "2026-04-04T14:46:00.000Z",
  },
  {
    tz: "Asia/Seoul",
    date: "2026-11-04",
    time: "10:15",
    at: "2026-11-04T01:15:43.210Z",
    changed: "2026-11-04T01:16:00.000Z",
  },
];

function originalRecord(at: string, date = localDateOf(at, j.tz)): JournalRecord {
  return {
    id: "existing-record",
    type: "memory",
    note: "Synthetic original note",
    at,
    localDate: date,
    precision: "exact",
    partOfDay: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    source: "manual_text",
    evidence: {
      method: "text",
      text: "Synthetic original source",
      photos: [],
      quote: "original source",
      proposed: { date, time: timeOf(at, j.tz), note: "Synthetic original note" },
      confirmed: { date, time: timeOf(at, j.tz), note: "Synthetic original note" },
    },
  };
}

function editingForm(form: "manual" | "meal", original: JournalRecord) {
  if (form === "manual") {
    return (
      <QuickAddSheet
        open
        onOpenChange={vi.fn()}
        kind="memory"
        setKind={vi.fn()}
        editing={original}
      />
    );
  }
  const meal: MealRec = {
    ...original,
    type: "meal",
    meal: { ...emptyMeal(), title: "Synthetic meal" },
  };
  return <MealForm editing={meal} onDone={vi.fn()} />;
}

function renderEditing(form: "manual" | "meal", original: JournalRecord) {
  return render(editingForm(form, original));
}

function submit() {
  fireEvent.submit(document.querySelector("form")!);
}

function changeTime(time: string) {
  fireEvent.change(screen.getByLabelText(t("f.time"), { exact: true }), {
    target: { value: time },
  });
}

function changeDate(date: string) {
  fireEvent.change(screen.getByLabelText(t("f.date"), { exact: true }), {
    target: { value: date },
  });
}

describe.each(["manual", "meal"] as const)("editing %s records", (form) => {
  it.each(cases)(
    "retains the later fold and all seconds in $tz after unrelated edits",
    ({ tz, date, time, at }) => {
      j.tz = tz;
      const original = originalRecord(at, date);
      renderEditing(form, original);
      expect(screen.getByLabelText(t("f.date"), { exact: true })).toHaveValue(date);
      expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue(time);
      const field =
        form === "meal"
          ? screen.getByLabelText(t("meal.title"))
          : screen.getByLabelText(t("f.note"));
      fireEvent.change(field, { target: { value: "Synthetic edited text" } });
      submit();
      expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: original.id,
          at,
          localDate: date,
          precision: "exact",
          partOfDay: null,
          createdAt: original.createdAt,
          evidence: expect.objectContaining({
            text: original.evidence!.text,
            photos: [],
            quote: original.evidence!.quote,
          }),
        }),
      );
    },
  );

  it.each(cases)(
    "resolves a changed minute in $tz instead of retaining the old instant",
    ({ tz, date, at, changed }) => {
      j.tz = tz;
      renderEditing(form, originalRecord(at, date));
      changeTime(timeOf(changed, tz));
      submit();
      expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ at: changed, localDate: date, precision: "exact" }),
      );
    },
  );

  it("resolves a changed date even when the clock is unchanged", () => {
    j.tz = "Europe/Paris";
    renderEditing(form, originalRecord("2026-10-25T01:30:56.789Z"));
    changeDate("2026-10-26");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ at: "2026-10-26T01:30:00.000Z", localDate: "2026-10-26" }),
    );
  });

  it("does not mistake a stored date for the instant's date after a timezone change", () => {
    j.tz = "America/New_York";
    renderEditing(form, originalRecord("2026-10-25T01:30:56.789Z", "2026-10-25"));
    expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue("21:30");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ at: "2026-10-26T01:30:00.000Z", localDate: "2026-10-25" }),
    );
  });

  it("can preserve the exact instant after correcting the date to match the selected timezone", () => {
    j.tz = "America/New_York";
    const at = "2026-10-25T01:30:56.789Z";
    renderEditing(form, originalRecord(at, "2026-10-25"));
    changeDate("2026-10-24");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ at, localDate: "2026-10-24" }),
    );
  });

  it("resolves the visible clock in the current timezone when the timezone changes while editing", () => {
    j.tz = "Europe/Paris";
    const original = originalRecord("2026-10-25T01:30:56.789Z");
    const view = renderEditing(form, original);
    expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue("02:30");
    j.tz = "UTC";
    view.rerender(editingForm(form, original));
    expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue("02:30");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ at: "2026-10-25T02:30:00.000Z", localDate: "2026-10-25" }),
    );
  });

  it.each([
    { tz: "America/New_York", at: "2026-03-07T07:30:56.789Z", date: "2026-03-08" },
    { tz: "Europe/Paris", at: "2026-03-28T01:30:56.789Z", date: "2026-03-29" },
    { tz: "Australia/Lord_Howe", at: "2026-10-02T15:45:56.789Z", date: "2026-10-04" },
  ])("rejects a date edit into a nonexistent clock in $tz", ({ tz, at, date }) => {
    j.tz = tz;
    renderEditing(form, originalRecord(at));
    changeDate(date);
    submit();
    expect(j.saveRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      t(form === "meal" ? "meal.invalid" : "validation.date"),
    );
  });

  it.each(["date_only", "part_of_day"] as const)(
    "retains %s precision without inventing a timestamp",
    (precision) => {
      const original = {
        ...originalRecord("2026-11-01T06:30:56.789Z"),
        at: null,
        precision,
        partOfDay: precision === "part_of_day" ? ("evening" as const) : null,
      };
      renderEditing(form, original);
      submit();
      expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ at: null, precision, partOfDay: original.partOfDay }),
      );
    },
  );

  it("removes an existing exact instant when the user chooses unknown time", () => {
    renderEditing(form, originalRecord("2026-11-01T06:30:56.789Z"));
    if (form === "manual") fireEvent.click(screen.getByLabelText(t("f.timeUnknown")));
    else changeTime("");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ at: null, precision: "date_only", partOfDay: null }),
    );
  });
});

describe("editing reminders", () => {
  function renderReminder(at: string) {
    j.reminder = { id: "existing-reminder", at };
    return render(<QuickAddSheet open onOpenChange={vi.fn()} kind="reminder" setKind={vi.fn()} />);
  }

  it.each(cases)("retains an unchanged reminder's exact instant in $tz", ({ tz, at }) => {
    j.tz = tz;
    renderReminder(at);
    submit();
    expect(j.setReminder).toHaveBeenCalledExactlyOnceWith(at);
  });

  it.each(cases)("resolves an edited reminder's minute in $tz", ({ tz, at, changed }) => {
    j.tz = tz;
    renderReminder(at);
    changeTime(timeOf(changed, tz));
    submit();
    expect(j.setReminder).toHaveBeenCalledExactlyOnceWith(changed);
  });

  it("uses the reminder instant's actual local date after a timezone change", () => {
    j.tz = "America/New_York";
    const at = "2026-10-25T01:30:56.789Z";
    renderReminder(at);
    expect(screen.getByLabelText(t("f.date"), { exact: true })).toHaveValue("2026-10-24");
    expect(screen.getByLabelText(t("f.time"), { exact: true })).toHaveValue("21:30");
    submit();
    expect(j.setReminder).toHaveBeenCalledExactlyOnceWith(at);
  });

  it("resolves a changed reminder date rather than keeping the existing instant", () => {
    j.tz = "Europe/Paris";
    renderReminder("2026-10-25T01:30:56.789Z");
    changeDate("2026-10-26");
    submit();
    expect(j.setReminder).toHaveBeenCalledExactlyOnceWith("2026-10-26T01:30:00.000Z");
  });

  it("rejects a reminder date edit into a gap and allows correcting it", () => {
    renderReminder("2026-03-07T07:30:56.789Z");
    changeDate("2026-03-08");
    submit();
    expect(j.setReminder).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(t("validation.date"));
    changeTime("03:30");
    submit();
    expect(j.setReminder).toHaveBeenCalledExactlyOnceWith("2026-03-08T07:30:00.000Z");
  });
});

it.each([false, true])(
  "preserves an existing meal instant after recovery (changed clock: %s)",
  (changed) => {
    j.tz = "Europe/Paris";
    const original = originalRecord("2026-10-25T01:30:56.789Z");
    const view = renderEditing("meal", original);
    fireEvent.change(screen.getByLabelText(t("meal.title")), {
      target: { value: "Recovered synthetic meal" },
    });
    if (changed) changeTime("02:31");
    view.unmount();
    renderEditing("meal", original);
    expect(screen.getByLabelText(t("meal.title"))).toHaveValue("Recovered synthetic meal");
    submit();
    expect(j.saveRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        at: changed ? "2026-10-25T00:31:00.000Z" : original.at,
        localDate: original.localDate,
        precision: "exact",
      }),
    );
  },
);
