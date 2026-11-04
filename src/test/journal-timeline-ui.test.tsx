import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalRecord, Purchase, Reminder } from "@/lib/journal";
import { t } from "@/lib/i18n";
import { fmtMonthDayWeekday, fmtYearMonth } from "@/lib/dates";
import { shiftCalendarMonth } from "@/lib/journal-timeline";
import { Route as HistoryRoute } from "@/routes/history";
import { Route as CalendarRoute } from "@/routes/calendar";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
const j = vi.hoisted(() => ({
  tz: "UTC",
  settings: { showMomo: false },
  records: [] as JournalRecord[],
  purchases: [] as Purchase[],
  reminder: null as Reminder | null,
}));
vi.mock("@/lib/journal", async (original) => ({
  ...(await original<typeof import("@/lib/journal")>()),
  useJournal: () => j,
}));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => mocks.open }));
vi.mock("@/components/app/RecordFinder", () => ({ RecordFinder: () => null }));
vi.mock("@/components/app/ReminderCard", () => ({ NextReminder: () => null }));
const History = HistoryRoute.options.component as ComponentType;
const Calendar = CalendarRoute.options.component as ComponentType;
const base = {
  localDate: "2026-01-31",
  at: null,
  precision: "date_only" as const,
  createdAt: "2026-01-31T12:00:00Z",
  source: "manual_text" as const,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-31T12:00:00Z"));
  mocks.open.mockReset();
  j.reminder = null;
  j.records = [{ ...base, id: "weight", type: "weight", value: 70, unit: "kg" }];
  j.purchases = [
    {
      id: "purchase",
      localDate: base.localDate,
      amount: 25,
      currency: "EUR",
      doses: 1,
      medication: "Fixture medicine",
      demo: true,
    },
    {
      id: "expense",
      localDate: base.localDate,
      amount: 8,
      currency: "EUR",
      doses: 0,
      medication: null,
      product: "Fixture lunch",
      addsStock: false,
    },
  ];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("calendar month selection", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-31"],
    ["2027-01-31", -1, "2026-12-31"],
    ["2026-03-31", -1, "2026-02-28"],
  ])("clamps %s by %i month(s) to %s", (date, delta, expected) => {
    expect(shiftCalendarMonth(date, delta)).toBe(expected);
  });
  it("keeps month, selection and add-entry date together, then returns to Today", () => {
    render(<Calendar />);
    fireEvent.click(screen.getByRole("button", { name: t("cal.nextMonth") }));
    expect(screen.getByRole("heading", { name: fmtYearMonth(2026, 2) })).toBeVisible();
    const selected = screen.getByRole("button", {
      name: fmtMonthDayWeekday("2026-02-28"),
    });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: `${t("nav.add")} · ${fmtMonthDayWeekday("2026-02-28")}` }),
    );
    expect(mocks.open).toHaveBeenLastCalledWith("menu", undefined, "2026-02-28");
    fireEvent.click(screen.getByRole("button", { name: t("today") }));
    expect(screen.getByRole("heading", { name: fmtYearMonth(2026, 1) })).toBeVisible();
    expect(screen.getByRole("button", { name: fmtMonthDayWeekday("2026-01-31") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

it.each([History, Calendar])(
  "includes purchases and expenses with truthful demo labels and original edit targets",
  (Page) => {
    render(<Page />);
    const purchase = screen.getByRole("button", { name: /Fixture medicine/ });
    const expense = screen.getByRole("button", { name: /Fixture lunch/ });
    expect(within(purchase).getByText(t("demo.badge"))).toBeVisible();
    expect(within(expense).queryByText(t("demo.badge"))).not.toBeInTheDocument();
    expect(expense).toHaveTextContent(t("type.expense"));
    fireEvent.click(purchase);
    expect(mocks.open).toHaveBeenLastCalledWith("purchase", j.purchases[0]);
    fireEvent.click(expense);
    expect(mocks.open).toHaveBeenLastCalledWith("purchase", j.purchases[1]);
  },
);
it("shows a calendar dot for a purchase-only day", () => {
  j.records = [];
  render(<Calendar />);
  const cell = screen.getByRole("button", {
    name: fmtMonthDayWeekday(base.localDate),
  });
  expect(cell.querySelector(".rounded-full")).not.toBeNull();
  expect(screen.queryByText(t("cal.empty"))).not.toBeInTheDocument();
});
it("record filters exclude purchases; no matches can clear back to all entries", () => {
  render(<History />);
  fireEvent.click(screen.getByRole("button", { name: t("type.condition") }));
  expect(screen.queryByText("Fixture lunch")).not.toBeInTheDocument();
  expect(screen.getByText(t("hist.noMatches"))).toBeVisible();
  expect(screen.queryByText(t("hist.empty"))).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("hist.clearFilters") }));
  expect(screen.getByText("Fixture lunch")).toBeVisible();
});
it("explains inverted dates and clears both fields", () => {
  render(<History />);
  fireEvent.click(screen.getByText(t("hist.range")));
  fireEvent.change(screen.getByLabelText(t("hist.from")), { target: { value: "2026-02-01" } });
  fireEvent.change(screen.getByLabelText(t("hist.until")), { target: { value: "2026-01-01" } });
  expect(screen.getByRole("alert")).toHaveTextContent(t("hist.invalidRange"));
  fireEvent.click(screen.getByRole("button", { name: t("hist.clearFilters") }));
  expect(screen.getByLabelText(t("hist.from"))).toHaveValue("");
  expect(screen.getByLabelText(t("hist.until"))).toHaveValue("");
  expect(screen.getByText("Fixture lunch")).toBeVisible();
});
it("offers Add entry for a genuinely empty journal", () => {
  j.records = [];
  j.purchases = [];
  render(<History />);
  expect(screen.getByText(t("hist.empty"))).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("nav.add") }));
  expect(mocks.open).toHaveBeenCalledWith("menu");
});

it("separates purchase and expense filters, including legacy purchases without addsStock", () => {
  j.purchases.push({
    ...j.purchases[0]!,
    id: "explicit-stock",
    medication: "Explicit stock",
    addsStock: true,
  });
  render(<History />);
  fireEvent.click(screen.getByRole("button", { name: t("type.purchase") }));
  expect(screen.getByText("Fixture medicine")).toBeVisible();
  expect(screen.getByText("Explicit stock")).toBeVisible();
  expect(screen.queryByText("Fixture lunch")).not.toBeInTheDocument();
  expect(screen.queryByText("70 kg")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("type.expense") }));
  expect(screen.getByText("Fixture lunch")).toBeVisible();
  expect(screen.queryByText("Fixture medicine")).not.toBeInTheDocument();
  expect(screen.queryByText("Explicit stock")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Fixture lunch/ }));
  expect(mocks.open).toHaveBeenLastCalledWith("purchase", j.purchases[1]);
  fireEvent.click(screen.getByRole("button", { name: t("hist.all") }));
  expect(screen.getByText("Fixture medicine")).toBeVisible();
  expect(screen.getByText("Fixture lunch")).toBeVisible();
});
it.each(["purchase", "expense"] as const)(
  "applies date bounds to %s filters and clears back to all entries",
  (filter) => {
    render(<History />);
    fireEvent.click(screen.getByRole("button", { name: t(`type.${filter}`) }));
    fireEvent.click(screen.getByText(t("hist.range")));
    fireEvent.change(screen.getByLabelText(t("hist.from")), { target: { value: "2026-02-01" } });
    expect(screen.getByText(t("hist.noMatches"))).toBeVisible();
    expect(screen.queryByText("Fixture medicine")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixture lunch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("hist.clearFilters") }));
    expect(screen.getByRole("button", { name: t("hist.all") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText(t("hist.from"))).toHaveValue("");
    expect(screen.getByText("Fixture medicine")).toBeVisible();
    expect(screen.getByText("Fixture lunch")).toBeVisible();
  },
);

describe("calendar keyboard navigation", () => {
  const day = (date: string) => screen.getByRole("button", { name: fmtMonthDayWeekday(date) });

  it("provides complete rows and cells, a named grid and exactly one day in the tab order", () => {
    render(<Calendar />);
    const grid = screen.getByRole("grid", { name: fmtYearMonth(2026, 1) });
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(5);
    rows.forEach((row) => expect(within(row).getAllByRole("gridcell")).toHaveLength(7));
    expect(
      within(grid)
        .getAllByRole("button")
        .filter((button) => button.tabIndex === 0),
    ).toEqual([day("2026-01-31")]);
    expect(grid).toHaveAccessibleDescription(t("cal.keyboardHelp"));
    expect(day("2026-01-31")).toHaveAttribute("aria-current", "date");
  });

  it.each([
    ["ArrowLeft", "2026-01-30"],
    ["ArrowRight", "2026-02-01"],
    ["ArrowUp", "2026-01-24"],
    ["ArrowDown", "2026-02-07"],
    ["Home", "2026-01-26"],
    ["End", "2026-02-01"],
    ["PageUp", "2025-12-31"],
    ["PageDown", "2026-02-28"],
  ])("%s updates focused selection and the date used for Add", (key, expected) => {
    render(<Calendar />);
    day("2026-01-31").focus();
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    fireEvent(day("2026-01-31"), event);
    expect(event.defaultPrevented).toBe(true);
    expect(day(expected)).toHaveFocus();
    expect(day(expected)).toHaveAttribute("aria-pressed", "true");
    expect(day(expected).closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("grid"))
        .getAllByRole("button")
        .filter((button) => button.tabIndex === 0),
    ).toEqual([day(expected)]);
    fireEvent.click(
      screen.getByRole("button", { name: `${t("nav.add")} · ${fmtMonthDayWeekday(expected)}` }),
    );
    expect(mocks.open).toHaveBeenLastCalledWith("menu", undefined, expected);
  });

  it("supports yearly jumps and clamps leap day without stealing Tab or browser shortcuts", () => {
    vi.setSystemTime(new Date("2024-02-29T12:00:00Z"));
    render(<Calendar />);
    fireEvent.keyDown(day("2024-02-29"), { key: "PageDown", shiftKey: true });
    expect(day("2025-02-28")).toHaveFocus();
    fireEvent.keyDown(day("2025-02-28"), { key: "PageUp", shiftKey: true });
    expect(day("2024-02-28")).toHaveFocus();
    for (const init of [
      { key: "Tab" },
      { key: "ArrowLeft", altKey: true },
      { key: "Home", ctrlKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      fireEvent(day("2024-02-28"), event);
      expect(event.defaultPrevented).toBe(false);
      expect(day("2024-02-28")).toHaveFocus();
    }
  });

  it("keeps an adjacent-month click focused after redraw and Today focuses the current day", () => {
    render(<Calendar />);
    fireEvent.click(day("2026-02-01"));
    expect(day("2026-02-01")).toHaveFocus();
    expect(screen.getByRole("heading", { name: fmtYearMonth(2026, 2) })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("today") }));
    expect(day("2026-01-31")).toHaveFocus();
  });

  it("does not steal focus from the month toolbar after an unchanged day selection", () => {
    render(<Calendar />);
    fireEvent.click(day("2026-01-31"));
    const nextMonth = screen.getByRole("button", { name: t("cal.nextMonth") });
    nextMonth.focus();
    fireEvent.click(nextMonth);
    expect(nextMonth).toHaveFocus();
    expect(day("2026-02-28")).toHaveAttribute("tabindex", "0");
  });

  it("exposes logged and planned markers without relying on a dot or icon", () => {
    j.reminder = { id: "fictional-reminder", at: "2026-01-31T20:00:00Z" };
    render(<Calendar />);
    expect(day("2026-01-31")).toHaveAccessibleDescription(
      `${t("cal.recorded")} · ${t("cal.planned")}`,
    );
    expect(day("2026-01-30")).not.toHaveAttribute("aria-describedby");
  });
});
