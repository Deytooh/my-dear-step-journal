import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordFinder } from "@/components/app/RecordFinder";
import { t } from "@/lib/i18n";
import { recordWhen } from "@/components/app/ui";
import type { JournalRecord, Purchase } from "@/lib/journal";
const mocks = vi.hoisted(() => ({ request: vi.fn(), open: vi.fn() }));
const j = vi.hoisted(() => ({
  user: { id: "A" } as { id: string } | null,
  tz: "Asia/Seoul",
  sync: "synced",
  records: [] as JournalRecord[],
  purchases: [] as Purchase[],
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j, sortByTime: () => 0 }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.request }));
vi.mock("@/lib/momo-tasks.functions", () => ({ retrieveMemory: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => mocks.open }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  j.user = { id: "A" };
  j.sync = "synced";
  j.purchases = [];
  j.records = [
    {
      id: "walk",
      type: "memory",
      note: "Fictional walk in the park",
      localDate: "2026-10-30",
      at: null,
      precision: "date_only",
      createdAt: "2026-10-30T00:00:00Z",
      source: "manual_text",
    },
  ];
});
afterEach(cleanup);
function compose() {
  render(<RecordFinder />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "walk" } });
  fireEvent.click(screen.getByText(t("find.ai"), { selector: "summary" }));
}
it("can switch to keyword search while AI is pending without getting stuck or accepting a late result", async () => {
  let finish!: (result: { ids: string[] }) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  compose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: t("find.ai") }));
  expect(screen.getByRole("button", { name: t("momo.thinking") })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(screen.getByRole("button", { name: t("find.ai") })).toBeEnabled();
  expect(screen.getByText(t("find.fallback"))).toBeVisible();
  await act(async () => finish({ ids: [] }));
  expect(screen.getByText(/Fictional walk in the park/)).toBeVisible();
});
it("clears an old AI error when starting a different search", async () => {
  mocks.request.mockResolvedValue({ ids: [], error: "service" });
  compose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: t("find.ai") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("ai.service"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "park" } });
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
it("keeps AI optional and offers guests a direct sign-in route", () => {
  j.user = null;
  compose();
  expect(screen.getByRole("button", { name: t("find.ai") })).toBeDisabled();
  expect(screen.getByRole("link", { name: t("sync.signin") })).toHaveAttribute("href", "/auth");
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(mocks.request).not.toHaveBeenCalled();
  expect(screen.getByText(/Fictional walk in the park/)).toBeVisible();
});

it("keeps keyword search available while cloud entries are waiting to sync", () => {
  j.sync = "syncing";
  compose();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: t("find.ai") })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(t("find.syncRequired"));
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(screen.getByText(/Fictional walk in the park/)).toBeVisible();
  expect(mocks.request).not.toHaveBeenCalled();
});
it("clears private search text and consent on account switch and ignores the old request", async () => {
  let finish!: (result: { ids: string[] }) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = render(<RecordFinder />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Private fictional query for A" },
  });
  fireEvent.click(screen.getByText(t("find.ai"), { selector: "summary" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: t("find.ai") }));
  j.user = { id: "B" };
  view.rerender(<RecordFinder />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.click(screen.getByText(t("find.ai"), { selector: "summary" }));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await act(async () => finish({ ids: ["record:walk"] }));
  expect(screen.queryByText(/Fictional walk in the park/)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("lets the user reach all matching entries instead of silently stopping after twenty", () => {
  j.records = Array.from({ length: 25 }, (_, i) => ({
    ...j.records[0]!,
    id: String(i).padStart(2, "0"),
    note: "Fictional walk " + String(i).padStart(2, "0"),
  }));
  compose();
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  expect(screen.getByText(t("find.showing", { shown: 20, total: 25 }))).toBeVisible();
  expect(screen.queryByText(/Fictional walk 24/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("find.more") }));
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
  fireEvent.click(screen.getByText(/Fictional walk 24/));
  expect(mocks.open).toHaveBeenCalledWith("memory", j.records[24]);
});
it("shows and enforces the AI query limit while retaining local search", () => {
  compose();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "300");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(301) } });
  expect(screen.getByText(t("find.queryLimit", { n: 301 }))).toBeVisible();
  expect(screen.getByRole("button", { name: t("find.ai") })).toBeDisabled();
  expect(screen.getByRole("button", { name: t("find.keywords") })).toBeEnabled();
  expect(mocks.request).not.toHaveBeenCalled();
});
it("discards a pending result if search consent is withdrawn", async () => {
  let finish!: (result: { ids: string[] }) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  compose();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: t("find.ai") }));
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => finish({ ids: ["record:walk"] }));
  expect(screen.queryByText(/Fictional walk in the park/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("find.ai") })).toBeDisabled();
});

it("gives same-day record results distinct accessible names", () => {
  j.records.push({
    ...j.records[0]!,
    id: "second",
    type: "memory",
    note: "Fictional walk by the river",
  });
  compose();
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(screen.getByRole("button", { name: /Fictional walk in the park/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Fictional walk by the river/ })).toBeVisible();
});
it("keeps fictional purchase matches labeled as examples", () => {
  j.purchases = [
    {
      id: "example-receipt",
      localDate: "2026-10-31",
      product: "Fictional walk receipt",
      medication: null,
      amount: 12.5,
      currency: "EUR",
      doses: 0,
      addsStock: false,
      demo: true,
    },
  ];
  compose();
  fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
  expect(screen.getByText(t("demo.badge"))).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Fictional walk receipt/ }));
  expect(mocks.open).toHaveBeenCalledWith("purchase", j.purchases[0]);
});

it("uses the journal timezone for keyword times and displays that same saved time in the result", () => {
  const timezone = j.tz;
  try {
    j.tz = "UTC";
    const rec = { ...j.records[0]!, precision: "exact" as const, at: "2026-10-30T09:30:00Z" };
    j.records = [rec];
    render(<RecordFinder />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: t("find.keywords") }));
    expect(screen.getByRole("button", { name: new RegExp(recordWhen(rec, "UTC")) })).toBeVisible();
    expect(mocks.request).not.toHaveBeenCalled();
  } finally {
    j.tz = timezone;
  }
});
