import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JournalSummary } from "@/components/app/JournalSummary";
import { setLocale, t } from "@/lib/i18n";
import type { JournalRecord, Purchase } from "@/lib/journal";
const calls = vi.hoisted(() => ({
  download: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
const j = vi.hoisted(() => ({
  records: [] as JournalRecord[],
  purchases: [] as Purchase[],
  tz: "Asia/Seoul",
  hasDemo: true,
  user: { id: "A" },
  snapshot: vi.fn(),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
vi.mock("@/lib/download", () => ({ downloadText: calls.download }));
vi.mock("sonner", () => ({
  toast: { success: calls.success, error: calls.error, info: calls.info },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
const memory = (
  id: string,
  note: string,
  localDate = "2026-11-04",
  demo = false,
): JournalRecord => ({
  id,
  note,
  localDate,
  demo,
  type: "memory",
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: localDate + "T00:00:00Z",
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
  setLocale("en");
  vi.clearAllMocks();
  calls.download.mockReset();
  j.records = [
    memory("current", "PERSONAL CURRENT"),
    memory("old", "PERSONAL OLDER", "2026-10-25"),
    memory("demo", "FICTIONAL DEMO", "2026-11-04", true),
  ];
  j.purchases = [];
  j.hasDemo = true;
  j.snapshot.mockImplementation(() => ({ records: j.records, purchases: j.purchases }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function openSummary() {
  const view = render(<JournalSummary />);
  fireEvent.click(screen.getByText(t("sum.title"), { selector: "summary" }));
  return view;
}
it("reviews a chosen period and excludes demo data unless explicitly included", () => {
  openSummary();
  expect(screen.getByRole("status")).toHaveTextContent(t("sum.count", { n: 1 }));
  expect(screen.getByRole("checkbox", { name: t("sum.demo") })).not.toBeChecked();
  fireEvent.click(screen.getByText(t("sum.preview"), { selector: "summary" }));
  const preview = screen.getByRole("region", { name: t("sum.preview") });
  expect(preview).toHaveTextContent("PERSONAL CURRENT");
  expect(preview).not.toHaveTextContent("PERSONAL OLDER");
  expect(preview).not.toHaveTextContent("FICTIONAL DEMO");
  fireEvent.click(screen.getByRole("checkbox", { name: t("sum.demo") }));
  expect(screen.getByRole("status")).toHaveTextContent(t("sum.count", { n: 2 }));
  expect(preview).toHaveTextContent("FICTIONAL DEMO");
  expect(preview).toHaveTextContent("Includes fictional demo entries");
  fireEvent.change(screen.getByRole("combobox", { name: t("sum.range") }), {
    target: { value: "30" },
  });
  expect(preview).toHaveTextContent("PERSONAL OLDER");
  expect(screen.getByRole("status")).toHaveTextContent(t("sum.count", { n: 3 }));
  expect(screen.getByRole("link", { name: t("sum.edit") })).toHaveAttribute("href", "/history");
  expect(calls.download).not.toHaveBeenCalled();
});
it("downloads the reviewed text with the journal's local date and reports only initiation", () => {
  vi.setSystemTime(new Date("2026-11-04T16:30:00Z"));
  j.records = [memory("local-next-day", "LOCAL NOVEMBER FIVE", "2026-11-05")];
  openSummary();
  fireEvent.click(screen.getByRole("button", { name: t("sum.download") }));
  expect(calls.download).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("LOCAL NOVEMBER FIVE"),
    "my-dear-step-summary-2026-11-05.txt",
  );
  expect(calls.success).toHaveBeenCalledExactlyOnceWith(t("toast.exported"));
  expect(calls.error).not.toHaveBeenCalled();
});
it("keeps the preview and saved data available when the download fails", () => {
  const before = JSON.stringify(j.records);
  calls.download.mockImplementationOnce(() => {
    throw new Error("blocked download");
  });
  openSummary();
  fireEvent.click(screen.getByText(t("sum.preview"), { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: t("sum.download") }));
  expect(calls.error).toHaveBeenCalledExactlyOnceWith(t("export.failed"));
  expect(calls.success).not.toHaveBeenCalled();
  expect(screen.getByRole("region", { name: t("sum.preview") })).toHaveTextContent(
    "PERSONAL CURRENT",
  );
  expect(JSON.stringify(j.records)).toBe(before);
});
it("does not add a late synced entry to the downloaded text before the user reviews the updated summary", () => {
  const view = openSummary();
  j.records = [...j.records, memory("late", "LATE UPDATED ENTRY")];
  fireEvent.click(screen.getByRole("button", { name: t("sum.download") }));
  expect(calls.download).not.toHaveBeenCalled();
  expect(calls.info).toHaveBeenCalledWith(t("sum.changed"));
  view.rerender(<JournalSummary />);
  fireEvent.click(screen.getByText(t("sum.preview"), { selector: "summary" }));
  expect(screen.getByRole("region", { name: t("sum.preview") })).toHaveTextContent(
    "LATE UPDATED ENTRY",
  );
  fireEvent.click(screen.getByRole("button", { name: t("sum.download") }));
  expect(calls.download).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("LATE UPDATED ENTRY"),
    "my-dear-step-summary-2026-11-04.txt",
  );
});
it("does not offer an empty or demo-only summary as a personal export", () => {
  j.records = [memory("only-demo", "FICTIONAL DEMO", "2026-11-04", true)];
  openSummary();
  expect(screen.getByRole("status")).toHaveTextContent(t("sum.empty"));
  expect(screen.getByRole("button", { name: t("sum.download") })).toBeDisabled();
  expect(calls.download).not.toHaveBeenCalled();
});
