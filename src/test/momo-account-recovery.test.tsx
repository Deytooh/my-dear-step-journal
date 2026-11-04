import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import { MomoSheet } from "@/components/app/MomoSheet";

const journal = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: { id: "A" } as { id: string } | null,
  tz: "UTC",
  settings: { showMomo: true },
  records: [],
  purchases: [],
  inventory: { lots: [] },
  newId: vi.fn(),
  saveMomoBatch: vi.fn(),
  snapshot: vi.fn(() => ({ records: [], purchases: [] })),
  undoFor: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => journal }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  journal.user = { id: "A" };
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("flushes an unsent edit to its old owner before switching accounts within the debounce window", () => {
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional owner A words" } });
  journal.user = { id: "B" };
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  act(() => vi.advanceTimersByTime(200));
  expect(sessionStorage.getItem("mds.momo.draft.B")).toBeNull();
  journal.user = { id: "A" };
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("Fictional owner A words");
});

it("retains a reviewed field correction and deselection only in the outgoing owner's draft", () => {
  const recovery = (owner: string) => ({
    text: `Fictional ${owner} source`,
    images: [],
    step: "review",
    drafts: [
      {
        key: `draft-${owner}`,
        type: "memory",
        on: true,
        quote: null,
        timeHint: null,
        f: { note: `Fictional ${owner} note`, date: "2026-11-04", time: "" },
      },
    ],
  });
  sessionStorage.setItem("mds.momo.draft.A", JSON.stringify(recovery("A")));
  sessionStorage.setItem("mds.momo.draft.B", JSON.stringify(recovery("B")));
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Fictional corrected A note" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  journal.user = { id: "B" };
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(document.querySelector('[data-draft-key="draft-A"]')).toBeNull();
  expect(document.querySelector('[data-draft-key="draft-B"]')).toHaveTextContent(
    "Fictional B note",
  );
  act(() => vi.advanceTimersByTime(200));
  expect(JSON.parse(sessionStorage.getItem("mds.momo.draft.B")!).drafts[0].f.note).toBe(
    "Fictional B note",
  );
  journal.user = { id: "A" };
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(document.querySelector('[data-draft-key="draft-A"]')).toHaveTextContent(
    "Fictional corrected A note",
  );
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeEnabled();
  expect(journal.saveMomoBatch).not.toHaveBeenCalled();
});

it("flushes source edits on immediate unmount without waiting for the debounce", () => {
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional unmounted edit" } });
  view.unmount();
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("Fictional unmounted edit");
});

it("preserves changed source text without reopening its stale review after an account switch", () => {
  sessionStorage.setItem(
    "mds.momo.draft.A",
    JSON.stringify({
      text: "Fictional original source",
      images: [],
      step: "review",
      drafts: [
        {
          key: "stale-review",
          type: "memory",
          on: true,
          quote: null,
          timeHint: null,
          f: { note: "Fictional original note", date: "2026-11-04", time: "" },
        },
      ],
    }),
  );
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("momo.original") }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional changed source" } });
  journal.user = null;
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  act(() => vi.advanceTimersByTime(200));
  expect(sessionStorage.getItem("mds.momo.draft.guest")).toBeNull();
  journal.user = { id: "A" };
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("Fictional changed source");
  expect(screen.queryByRole("button", { name: t("mm.resume") })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) })).not.toBeInTheDocument();
  expect(journal.saveMomoBatch).not.toHaveBeenCalled();
});
