import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MomoSheet } from "@/components/app/MomoSheet";
import { t } from "@/lib/i18n";

const fixture = vi.hoisted(() => ({
  shrink: vi.fn(),
  retain: vi.fn(),
  extract: vi.fn(),
  ownerCurrent: true,
  journal: {
    user: { id: "A" },
    isCurrentOwner: vi.fn(),
    tz: "UTC",
    settings: { showMomo: true },
    records: [],
    purchases: [],
    inventory: { lots: [] },
    newId: () => "exit-draft",
    saveMomoBatch: vi.fn(),
    snapshot: () => ({ records: [], purchases: [] }),
    undoFor: () => vi.fn(),
  },
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => fixture.journal, canDeduct: () => true }));
vi.mock("@/lib/media", () => ({ shrinkPhoto: fixture.shrink, retainPhoto: fixture.retain }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => fixture.extract }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/calendar" } }),
}));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/components/app/PhotoImg", () => ({
  PhotoImg: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/app/EntrySheet", () => ({
  // Radix Presence keeps this subtree mounted throughout the 240 ms exit animation.
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
const words = "Fictional typed source";
const response = {
  candidates: [{ type: "memory", note: "Late extraction", date: "2026-11-04", quote: null }],
};
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Sheet() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen fixture</button>
      <QuickAddSheet open={open} kind="voice" setKind={vi.fn()} onOpenChange={setOpen} />
    </>
  );
}
function close() {
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  expect(screen.getByTestId("retained-sheet")).toHaveAttribute("data-state", "closed");
}
function capture() {
  fireEvent(window, new Event("pagehide"));
  return JSON.parse(sessionStorage.getItem("mds.momo.draft.A")!);
}
function analyze() {
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
}
function seed(images = [source]) {
  sessionStorage.setItem(
    "mds.momo.draft.A",
    JSON.stringify({ text: words, images, drafts: [], step: "input" }),
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  fixture.ownerCurrent = true;
  fixture.journal.isCurrentOwner.mockImplementation(() => fixture.ownerCurrent);
  fixture.shrink.mockReset().mockResolvedValue(source);
  fixture.retain.mockReset().mockResolvedValue("localphoto:A:fixture");
  fixture.extract.mockReset().mockResolvedValue(response);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps typed recovery intact when compression resolves during the retained close subtree", async () => {
  const shrink = pending<string>();
  fixture.shrink.mockReturnValueOnce(shrink.promise);
  seed([]);
  render(<Sheet />);
  fireEvent.change(screen.getByLabelText(t("momo.photos")), {
    target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  close();
  await act(async () => shrink.resolve(source));
  expect(capture()).toMatchObject({ text: words, images: [], drafts: [] });
  expect(fixture.retain).not.toHaveBeenCalled();
});

it("does not retain photos when extraction resolves after Close, before unmount", async () => {
  const extraction = pending<typeof response>();
  fixture.extract.mockReturnValueOnce(extraction.promise);
  seed();
  render(<Sheet />);
  analyze();
  close();
  await act(async () => extraction.resolve(response));
  expect(fixture.retain).not.toHaveBeenCalled();
  expect(capture()).toMatchObject({ text: words, images: [source], drafts: [], step: "input" });
});

it("does not persist extracted drafts when photo retention finishes after Close", async () => {
  const retained = pending<string>();
  fixture.retain.mockReturnValueOnce(retained.promise);
  seed();
  render(<Sheet />);
  analyze();
  await act(async () => {});
  expect(fixture.retain).toHaveBeenCalledOnce();
  close();
  await act(async () => retained.resolve("localphoto:A:fixture"));
  expect(capture()).toMatchObject({ text: words, images: [source], drafts: [], step: "input" });
});

it("cannot revive an old extraction on a rapid reopen of the retained component", async () => {
  const extraction = pending<typeof response>();
  fixture.extract.mockReturnValueOnce(extraction.promise);
  seed();
  render(<Sheet />);
  analyze();
  close();
  fireEvent.click(screen.getByRole("button", { name: "Reopen fixture" }));
  await act(async () => extraction.resolve(response));
  expect(fixture.retain).not.toHaveBeenCalled();
  expect(capture()).toMatchObject({ text: words, drafts: [] });
  expect(screen.getByRole("button", { name: t("mc.organize") })).toBeEnabled();
});

it("rejects an extraction at the ownership boundary before React rerenders the composer", async () => {
  const extraction = pending<typeof response>();
  fixture.extract.mockReturnValueOnce(extraction.promise);
  seed();
  render(<Sheet />);
  analyze();
  fixture.ownerCurrent = false;
  await act(async () => extraction.resolve(response));
  expect(fixture.retain).not.toHaveBeenCalled();
  expect(capture()).toMatchObject({ text: words, drafts: [] });
});

it("preserves a reviewed correction and deselection through Close and reopen", () => {
  sessionStorage.setItem(
    "mds.momo.draft.A",
    JSON.stringify({
      text: words,
      images: [],
      step: "review",
      drafts: [
        {
          key: "reviewed",
          type: "memory",
          on: true,
          quote: null,
          timeHint: null,
          f: { note: "Fictional original note", date: "2026-11-04", time: "" },
        },
      ],
    }),
  );
  render(<Sheet />);
  fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Fictional reviewed correction" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  close();
  expect(capture().drafts[0]).toMatchObject({
    on: false,
    f: { note: "Fictional reviewed correction" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reopen fixture" }));
  expect(screen.getByRole("textbox")).toHaveValue("Fictional reviewed correction");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(fixture.journal.saveMomoBatch).not.toHaveBeenCalled();
});

it("rejects confirm from an obsolete owner even while the review controls remain mounted", () => {
  sessionStorage.setItem(
    "mds.momo.draft.A",
    JSON.stringify({
      text: words,
      images: [],
      step: "review",
      drafts: [
        {
          key: "reviewed",
          type: "memory",
          on: true,
          quote: null,
          timeHint: null,
          f: { note: "Fictional reviewed note", date: "2026-11-04", time: "" },
        },
      ],
    }),
  );
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fixture.ownerCurrent = false;
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  expect(fixture.journal.saveMomoBatch).not.toHaveBeenCalled();
});

it("does not reopen a meal after pending source retention completes during exit", async () => {
  const retained = pending<string>();
  fixture.retain.mockReturnValueOnce(retained.promise);
  const onMeal = vi.fn();
  let current = true;
  seed();
  render(
    <MomoSheet
      inline
      isSessionCurrent={() => current}
      onMeal={onMeal}
      onDone={vi.fn()}
      onManual={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("meal.open") }));
  current = false;
  await act(async () => retained.resolve("localphoto:A:fixture"));
  expect(onMeal).not.toHaveBeenCalled();
  expect(capture()).toMatchObject({ text: words, drafts: [] });
});

it("rejects compressed photos immediately when the owner has been invalidated", async () => {
  const shrink = pending<string>();
  fixture.shrink.mockReturnValueOnce(shrink.promise);
  seed([]);
  render(<Sheet />);
  fireEvent.change(screen.getByLabelText(t("momo.photos")), {
    target: { files: [new File(["fictional"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  fixture.ownerCurrent = false;
  await act(async () => shrink.resolve(source));
  expect(capture()).toMatchObject({ text: words, images: [], drafts: [] });
});

it("releases the microphone on Close before the retained sheet unmounts", () => {
  const original = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
  const engines: Recognition[] = [];
  const result = (text: string) => Object.assign([{ transcript: text }], { isFinal: true });
  class Recognition {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart?: () => void;
    onend?: () => void;
    onresult?: (event: { results: ReturnType<typeof result>[] }) => void;
    start = vi.fn(() => this.onstart?.());
    abort = vi.fn(() => this.onend?.());
    constructor() {
      engines.push(this);
    }
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  try {
    seed([]);
    render(<Sheet />);
    fireEvent.click(screen.getByRole("button", { name: t("mm.voice") }));
    const engine = engines[0]!;
    act(() => engine.onresult?.({ results: [result("accepted voice")] }));
    close();
    expect(engine.abort).toHaveBeenCalledOnce();
    act(() => engine.onresult?.({ results: [result("late voice")] }));
    expect(capture()).toMatchObject({
      text: `${words} accepted voice`,
      voiceSession: { before: words, wasVoice: false },
    });
  } finally {
    if (original) Object.defineProperty(window, "SpeechRecognition", original);
    else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
  }
});
