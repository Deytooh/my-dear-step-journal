import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocale, t } from "@/lib/i18n";
import type { JournalRecord } from "@/lib/journal";
import { Route } from "@/routes/progress";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({ open: vi.fn(), download: vi.fn() }));
const j = vi.hoisted(() => ({
  tz: "UTC",
  settings: { showMomo: false },
  records: [] as JournalRecord[],
  snapshot: vi.fn(),
  isCurrentOwner: vi.fn(() => true),
}));
vi.mock("@/lib/download", () => ({ downloadText: mocks.download }));
vi.mock("@/lib/journal", async (original) => ({
  ...(await original<typeof import("@/lib/journal")>()),
  useJournal: () => j,
}));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => mocks.open }));
vi.mock("@/components/app/JournalSummary", () => ({ JournalSummary: () => null }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: () => <div />,
}));
const Progress = Route.options.component as ComponentType;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-31T12:00:00Z"));
  mocks.open.mockReset();
  mocks.download.mockReset();
  j.isCurrentOwner.mockReset().mockReturnValue(true);
  j.snapshot.mockReset().mockImplementation(() => ({
    records: j.records,
    purchases: [],
    reminder: null,
    stockAdjust: 0,
    settings: { ...j.settings, timezone: j.tz },
  }));
  j.tz = "UTC";
  j.records = [];
  setLocale("en");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("offers all dates when saved weights are outside the current range, without false manual provenance", () => {
  j.records = [
    {
      id: "weight",
      type: "weight",
      value: 70,
      unit: "kg",
      localDate: "2025-10-01",
      at: null,
      precision: "date_only",
      createdAt: "2025-10-01T00:00:00Z",
      source: "manual_text",
      evidence: {
        method: "photos",
        text: "",
        photos: [],
        quote: null,
        proposed: {},
        confirmed: {},
      },
    },
  ];
  render(<Progress />);
  expect(screen.queryByText(new RegExp(t("prog.manual")))).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("prog.showAll") }));
  expect(screen.queryByText(t("prog.noData"))).not.toBeInTheDocument();
  expect(screen.getByText(t("chart.table"))).toBeVisible();
});
it("offers Add weight rather than widening a range when no weights exist", () => {
  render(<Progress />);
  expect(screen.queryByRole("button", { name: t("prog.showAll") })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `${t("nav.add")} · ${t("type.weight")}` }));
  expect(mocks.open).toHaveBeenCalledWith("weight");
});

it("does not read or export a newer owner's snapshot through a stale CSV export control", () => {
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  render(<Progress />);
  // Auth refs have changed, but the previous owner's UI has not rerendered yet.
  j.isCurrentOwner.mockReturnValue(false);
  j.snapshot.mockReturnValue({ records: [{ id: "B-entry", note: "Fictional B-only note" }] });
  fireEvent.click(screen.getByRole("button", { name: t("prog.export") }));
  expect(j.isCurrentOwner).toHaveBeenCalledOnce();
  expect(j.snapshot).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});

it("still exports CSV for the current owner with the journal-local filename date", () => {
  vi.setSystemTime(new Date("2026-11-04T16:30:00Z"));
  j.tz = "Asia/Seoul";
  const success = vi.spyOn(toast, "success");
  render(<Progress />);
  fireEvent.click(screen.getByRole("button", { name: t("prog.export") }));
  expect(j.snapshot).toHaveBeenCalledOnce();
  expect(mocks.download).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^\uFEFF/),
    "my-dear-step-2026-11-05.csv",
    "text/csv;charset=utf-8",
  );
  expect(success).toHaveBeenCalledExactlyOnceWith(t("toast.exported"));
});

it("still reports a CSV download failure without success for the current owner", () => {
  const success = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  mocks.download.mockImplementationOnce(() => {
    throw new Error("Download unavailable");
  });
  render(<Progress />);
  fireEvent.click(screen.getByRole("button", { name: t("prog.export") }));
  expect(failure).toHaveBeenCalledExactlyOnceWith(t("export.failed"));
  expect(success).not.toHaveBeenCalled();
});
