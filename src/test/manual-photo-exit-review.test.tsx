import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { QuickAddSheet, type EntryKind } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
import type { MealRec } from "@/lib/journal";
import { emptyMeal } from "@/lib/meals";
import { t } from "@/lib/i18n";

const fixture = vi.hoisted(() => ({
  shrink: vi.fn(),
  retain: vi.fn(),
  photoUrl: vi.fn(),
  analyze: vi.fn(),
  journal: {
    user: { id: "A" },
    isCurrentOwner: () => true,
    tz: "UTC",
    settings: { showMomo: true },
    records: [],
    purchases: [],
    inventory: { lots: [] },
    reminder: null,
    newId: () => "exit-review-new",
    saveRecord: vi.fn(),
    snapshot: vi.fn(),
    undoFor: vi.fn(),
    sync: "synced",
  },
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => fixture.journal, canDeduct: () => true }));
vi.mock("@/lib/media", () => ({ shrinkPhoto: fixture.shrink, retainPhoto: fixture.retain }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: fixture.photoUrl }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => fixture.analyze }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/calendar" } }),
}));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/components/app/MomoSheet", () => ({ MomoSheet: () => null }));
vi.mock("@/components/app/PhotoImg", () => ({
  PhotoImg: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/components/app/EntrySheet", () => ({
  // Real Radix Presence retains these children until the 240 ms exit animation ends.
  EntrySheet: ({
    open,
    header,
    children,
  }: {
    open: boolean;
    header: ReactNode;
    children: ReactNode;
  }) => (
    <div data-testid="retained-sheet" data-state={open ? "open" : "closed"}>
      {header}
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const source = "data:image/jpeg;base64,ZmljdGlvbmFs";
const meal: MealRec = {
  id: "exit-review-meal",
  type: "meal",
  localDate: "2026-11-03",
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: "2026-11-03T12:00:00Z",
  meal: { ...emptyMeal(), title: "Original meal", photoRefs: [source] },
};
function Sheet({ kind }: { kind: EntryKind }) {
  const [open, setOpen] = useState(true);
  return (
    <QuickAddSheet
      open={open}
      kind={kind}
      editing={kind === "meal" ? meal : undefined}
      setKind={vi.fn()}
      onOpenChange={setOpen}
    />
  );
}
function close() {
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  expect(screen.getByTestId("retained-sheet")).toHaveAttribute("data-state", "closed");
}
function analyze() {
  fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  fixture.journal.tz = "UTC";
  fixture.shrink.mockReset().mockResolvedValue(source);
  fixture.retain.mockReset().mockResolvedValue(source);
  fixture.photoUrl.mockReset().mockResolvedValue(source);
  fixture.analyze.mockReset().mockResolvedValue({ meal: { ...emptyMeal(), title: "Late result" } });
});
afterEach(cleanup);

it("does not retain a memory photo after Close while the exit subtree is still mounted", async () => {
  let finish!: (data: string) => void;
  fixture.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Sheet kind="memory" />);
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  close();
  await act(async () => finish(source));
  expect(fixture.retain).not.toHaveBeenCalled();
});

it("does not dispatch meal analysis after Close while source resolution completes during exit", async () => {
  let finish!: (data: string) => void;
  fixture.photoUrl.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Sheet kind="meal" />);
  analyze();
  close();
  await act(async () => finish(source));
  expect(fixture.analyze).not.toHaveBeenCalled();
});

it("does not overwrite recoverable meal edits with a result received during Close animation", async () => {
  let finish!: (result: unknown) => void;
  fixture.analyze.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Sheet kind="meal" />);
  analyze();
  await waitFor(() => expect(fixture.analyze).toHaveBeenCalledOnce());
  close();
  await act(async () => finish({ meal: { ...emptyMeal(), title: "Late result" } }));
  expect(JSON.parse(sessionStorage.getItem(`mds.meal.draft.A.${meal.id}`)!).meal.title).toBe(
    "Original meal",
  );
});

it("cancels memory work synchronously even before the parent commits Close", async () => {
  let finish!: (data: string) => void;
  fixture.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const onOpenChange = vi.fn();
  render(<QuickAddSheet open kind="memory" setKind={vi.fn()} onOpenChange={onOpenChange} />);
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  await act(async () => finish(source));
  expect(fixture.retain).not.toHaveBeenCalled();
});

it("cancels prop-driven memory Close and does not revive old work on same-session reopen", async () => {
  let finishOld!: (data: string) => void, finishNew!: (data: string) => void;
  fixture.shrink
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishNew = resolve;
        }),
    );
  const sheet = (open: boolean) => (
    <QuickAddSheet open={open} kind="memory" setKind={vi.fn()} onOpenChange={vi.fn()} />
  );
  const view = render(sheet(true));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const selectPhoto = () =>
    fireEvent.change(input, {
      target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
    });
  selectPhoto();
  view.rerender(sheet(false));
  view.rerender(sheet(true));
  expect(input).toBeEnabled();
  selectPhoto();
  await act(async () => finishOld(source));
  expect(fixture.retain).not.toHaveBeenCalled();
  expect(input).toBeDisabled();
  await act(async () => finishNew(source));
  expect(fixture.retain).toHaveBeenCalledOnce();
  expect(input).toBeEnabled();
});

it("keeps a newer meal analysis pending after a closed session returns a result", async () => {
  let finishOld!: (result: unknown) => void, finishNew!: (result: unknown) => void;
  fixture.analyze
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        }),
    );
  const sheet = (open: boolean) => (
    <QuickAddSheet
      open={open}
      kind="meal"
      editing={meal}
      setKind={vi.fn()}
      onOpenChange={vi.fn()}
    />
  );
  const view = render(sheet(true));
  analyze();
  await waitFor(() => expect(fixture.analyze).toHaveBeenCalledOnce());
  view.rerender(sheet(false));
  view.rerender(sheet(true));
  fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
  await waitFor(() => expect(fixture.analyze).toHaveBeenCalledTimes(2));
  await act(async () => finishOld({ meal: { ...emptyMeal(), title: "Old result" } }));
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue("Original meal");
  expect(screen.getByRole("button", { name: t("momo.thinking") })).toBeDisabled();
  await act(async () => finishNew({ meal: { ...emptyMeal(), title: "New result" } }));
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue("New result");
});

it("releases meal photo controls when timezone recovery invalidates pending compression", async () => {
  let finish!: (data: string) => void;
  fixture.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<MealForm editing={meal} onDone={vi.fn()} />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  fixture.journal.tz = "Asia/Seoul";
  view.rerender(<MealForm editing={meal} onDone={vi.fn()} />);
  await act(async () => finish(source));
  expect(input).toBeEnabled();
  expect(screen.getByRole("button", { name: t("ux.saveMeal") })).toBeEnabled();
  expect(fixture.retain).not.toHaveBeenCalled();
});

it("releases meal analysis controls when timezone recovery invalidates a pending result", async () => {
  let finish!: (result: unknown) => void;
  fixture.analyze.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<MealForm editing={meal} onDone={vi.fn()} />);
  analyze();
  await waitFor(() => expect(fixture.analyze).toHaveBeenCalledOnce());
  fixture.journal.tz = "Asia/Seoul";
  view.rerender(<MealForm editing={meal} onDone={vi.fn()} />);
  await act(async () => finish({ meal: { ...emptyMeal(), title: "Late result" } }));
  expect(screen.getByRole("button", { name: t("meal.analyze") })).toBeEnabled();
  expect(screen.getByRole("button", { name: t("ux.saveMeal") })).toBeEnabled();
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue("Original meal");
});
