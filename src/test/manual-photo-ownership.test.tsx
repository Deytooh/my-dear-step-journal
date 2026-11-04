import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
import type { Evidence, MemoryRec } from "@/lib/journal";
import { emptyMeal } from "@/lib/meals";
import { t } from "@/lib/i18n";

const fixtures = vi.hoisted(() => ({
  currentOwner: true,
  shrink: vi.fn(),
  retain: vi.fn(),
  photoUrl: vi.fn(),
  analyze: vi.fn(),
  journal: {
    user: { id: "A" } as { id: string } | null,
    tz: "UTC",
    settings: { showMomo: true },
    records: [],
    purchases: [],
    inventory: { lots: [] },
    reminder: null,
    newId: () => "fictional-new-id",
    saveRecord: vi.fn(),
    deleteRecord: vi.fn(),
    snapshot: vi.fn(),
    undoFor: vi.fn(() => vi.fn()),
    sync: "synced",
  },
}));
vi.mock("@/lib/journal", () => ({
  useJournal: () => ({ ...fixtures.journal, isCurrentOwner: () => fixtures.currentOwner }),
  canDeduct: () => true,
}));
vi.mock("@/lib/media", () => ({ shrinkPhoto: fixtures.shrink, retainPhoto: fixtures.retain }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: fixtures.photoUrl }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => fixtures.analyze }));
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
  EntrySheet: ({
    open,
    header,
    children,
  }: {
    open: boolean;
    header: ReactNode;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {header}
        {children}
      </div>
    ) : null,
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const source = "data:image/jpeg;base64,ZmljdGlvbmFs";
const evidence: Evidence = {
  method: "mixed",
  text: "Fictional original note",
  quote: "original note",
  photos: ["localphoto:A:original-source"],
  proposed: { note: "Fictional original note" },
  confirmed: { note: "Fictional saved note" },
};
const memory: MemoryRec = {
  id: "fictional-memory",
  type: "memory",
  note: "Fictional saved note",
  photo: "localphoto:A:old-cover",
  localDate: "2026-11-03",
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: "2026-11-03T12:00:00Z",
  evidence,
};
const file = () => new File(["fictional photo"], "fictional.jpg", { type: "image/jpeg" });
const upload = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const sheet = (session = 0, open = true) => (
  <QuickAddSheet
    open={open}
    session={session}
    kind="memory"
    editing={memory}
    setKind={vi.fn()}
    onOpenChange={vi.fn()}
  />
);
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  fixtures.currentOwner = true;
  fixtures.journal.user = { id: "A" };
  fixtures.shrink.mockReset().mockResolvedValue(source);
  fixtures.retain.mockReset().mockResolvedValue("localphoto:A:new-cover");
  fixtures.photoUrl.mockReset().mockResolvedValue(source);
  fixtures.analyze
    .mockReset()
    .mockResolvedValue({ meal: { ...emptyMeal(), title: "Fictional result" } });
  fixtures.journal.snapshot.mockReturnValue({ records: [], purchases: [], settings: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not restore a removed memory photo when pending compression completes", async () => {
  let resolve!: (data: string) => void;
  fixtures.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(sheet());
  fireEvent.change(upload(), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  await act(async () => resolve(source));
  expect(screen.queryByRole("img", { name: t("f.photo") })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(fixtures.journal.saveRecord).toHaveBeenCalledWith(
    expect.objectContaining({ photo: null }),
  );
});

it("preserves original evidence when the user removes a saved memory cover", () => {
  render(sheet());
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(fixtures.journal.saveRecord).toHaveBeenCalledWith(
    expect.objectContaining({
      photo: null,
      evidence: expect.objectContaining({
        text: evidence.text,
        quote: evidence.quote,
        photos: evidence.photos,
        proposed: expect.objectContaining(evidence.proposed),
      }),
    }),
  );
});

it("does not start meal analysis if ownership changes while a source photo resolves", async () => {
  let resolve!: (data: string) => void;
  fixtures.photoUrl.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(<MealForm images={["localphoto:A:source"]} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
  // Auth ownership invalidates synchronously before React has committed a new owner render.
  fixtures.currentOwner = false;
  await act(async () => resolve(source));
  expect(fixtures.analyze).not.toHaveBeenCalled();
});

it("does not apply meal analysis if ownership changes before the result returns", async () => {
  let resolve!: (result: unknown) => void;
  fixtures.analyze.mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  render(<MealForm images={["localphoto:A:source"]} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
  await waitFor(() => expect(fixtures.analyze).toHaveBeenCalledOnce());
  fixtures.currentOwner = false;
  await act(async () => resolve({ meal: { ...emptyMeal(), title: "Old account result" } }));
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue("");
});

it("does not restore a removed memory photo when its local retention completes", async () => {
  let resolve!: (ref: string) => void;
  fixtures.retain.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(sheet());
  fireEvent.change(upload(), { target: { files: [file()] } });
  await waitFor(() => expect(fixtures.retain).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  await act(async () => resolve("localphoto:A:cancelled-cover"));
  expect(screen.queryByRole("img", { name: t("f.photo") })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("f.save") })).toBeEnabled();
});

it("does not let an old memory completion unlock a later photo selection", async () => {
  let finishOld!: (data: string) => void, finishNew!: (data: string) => void;
  fixtures.shrink
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
  render(sheet());
  fireEvent.change(upload(), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  fireEvent.change(upload(), { target: { files: [file()] } });
  await act(async () => finishOld(source));
  expect(upload()).toBeDisabled();
  expect(screen.getByRole("button", { name: t("f.save") })).toBeDisabled();
  expect(fixtures.retain).not.toHaveBeenCalled();
  await act(async () => finishNew(source));
  expect(upload()).toBeEnabled();
  expect(fixtures.retain).toHaveBeenCalledOnce();
  expect(screen.getByRole("img", { name: t("f.photo") })).toHaveAttribute(
    "src",
    "localphoto:A:new-cover",
  );
});

it.each(["close", "reopen", "owner"] as const)(
  "cancels memory compression before retaining after %s",
  async (change) => {
    let resolve!: (data: string) => void;
    fixtures.shrink.mockImplementationOnce(
      () =>
        new Promise<string>((finish) => {
          resolve = finish;
        }),
    );
    const view = render(sheet());
    fireEvent.change(upload(), { target: { files: [file()] } });
    if (change === "owner") fixtures.currentOwner = false;
    else view.rerender(sheet(change === "reopen" ? 1 : 0, change !== "close"));
    await act(async () => resolve(source));
    expect(fixtures.retain).not.toHaveBeenCalled();
    expect(fixtures.journal.saveRecord).not.toHaveBeenCalled();
    if (change === "reopen") {
      expect(screen.getByRole("img", { name: t("f.photo") })).toHaveAttribute("src", memory.photo);
      expect(upload()).toBeEnabled();
    }
  },
);

it("ignores old meal photo errors and keeps a newer attachment pending after removal", async () => {
  let rejectOld!: (error: Error) => void, finishNew!: (data: string) => void;
  fixtures.shrink
    .mockImplementationOnce(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectOld = reject;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishNew = resolve;
        }),
    );
  render(<MealForm images={["localphoto:A:old-source"]} onDone={vi.fn()} />);
  fireEvent.change(upload(), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  expect(upload()).toBeEnabled();
  fireEvent.change(upload(), { target: { files: [file()] } });
  await act(async () => rejectOld(new Error("cancelled fixture")));
  expect(upload()).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => finishNew(source));
  expect(upload()).toBeEnabled();
  expect(fixtures.retain).toHaveBeenCalledOnce();
});

it("does not retain a compressed meal photo after ownership invalidation", async () => {
  let resolve!: (data: string) => void;
  fixtures.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(<MealForm onDone={vi.fn()} />);
  fireEvent.change(upload(), { target: { files: [file()] } });
  fixtures.currentOwner = false;
  await act(async () => resolve(source));
  expect(fixtures.retain).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(fixtures.journal.saveRecord).not.toHaveBeenCalled();
});

it("does not apply a retained meal photo after ownership invalidation", async () => {
  let resolve!: (data: string) => void;
  fixtures.retain.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(<MealForm onDone={vi.fn()} />);
  fireEvent.change(upload(), { target: { files: [file()] } });
  await waitFor(() => expect(fixtures.retain).toHaveBeenCalledOnce());
  fixtures.currentOwner = false;
  await act(async () => resolve("localphoto:A:late-source"));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it.each(["save", "delete"] as const)("does not %s or close a stale memory form", (action) => {
  const done = vi.fn();
  render(
    <QuickAddSheet open kind="memory" editing={memory} setKind={vi.fn()} onOpenChange={done} />,
  );
  fixtures.currentOwner = false;
  fireEvent.click(
    screen.getByRole("button", { name: t(action === "save" ? "f.save" : "f.delete") }),
  );
  expect(fixtures.journal.snapshot).not.toHaveBeenCalled();
  expect(fixtures.journal.saveRecord).not.toHaveBeenCalled();
  expect(fixtures.journal.deleteRecord).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
});

it("preserves meal source evidence when a saved photo is removed and the edit is saved", () => {
  const editing = {
    ...memory,
    type: "meal" as const,
    meal: { ...emptyMeal(), title: "Fictional saved meal", photoRefs: ["localphoto:A:meal-cover"] },
    evidence: { ...evidence, proposed: { meal: "original proposal" } },
  };
  render(<MealForm editing={editing} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("photo.remove") }));
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  expect(fixtures.journal.saveRecord).toHaveBeenCalledWith(
    expect.objectContaining({
      meal: expect.objectContaining({ photoRefs: [] }),
      evidence: expect.objectContaining({
        text: evidence.text,
        quote: evidence.quote,
        photos: evidence.photos,
        proposed: expect.objectContaining({ meal: "original proposal" }),
      }),
    }),
  );
});

it("does not start meal analysis after ownership changes during source compression", async () => {
  let resolve!: (data: string) => void;
  fixtures.photoUrl.mockResolvedValue("https://example.invalid/fictional-source");
  const fetchFixture = vi.fn().mockResolvedValue({
    blob: async () => new Blob(["fictional image"], { type: "image/jpeg" }),
  });
  vi.stubGlobal("fetch", fetchFixture);
  fixtures.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  render(<MealForm images={["storage:A:source"]} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
  await waitFor(() => expect(fixtures.shrink).toHaveBeenCalledOnce());
  fixtures.currentOwner = false;
  await act(async () => resolve(source));
  expect(fixtures.analyze).not.toHaveBeenCalled();
  expect(fetchFixture).toHaveBeenCalledOnce();
});

it.each(["save", "delete"] as const)("does not %s or finish a stale meal edit", (action) => {
  const done = vi.fn();
  const editing = {
    ...memory,
    type: "meal" as const,
    meal: { ...emptyMeal(), title: "Fictional saved meal" },
  };
  render(<MealForm editing={editing} onDone={done} />);
  fixtures.currentOwner = false;
  fireEvent.click(
    screen.getByRole("button", { name: t(action === "save" ? "ux.saveMeal" : "f.delete") }),
  );
  expect(fixtures.journal.snapshot).not.toHaveBeenCalled();
  expect(fixtures.journal.saveRecord).not.toHaveBeenCalled();
  expect(fixtures.journal.deleteRecord).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
});

it("keeps a deleted meal draft cleared if pending photo work settles before exit unmount", async () => {
  let resolve!: (data: string) => void;
  fixtures.shrink.mockImplementationOnce(
    () =>
      new Promise<string>((finish) => {
        resolve = finish;
      }),
  );
  const editing = {
    ...memory,
    type: "meal" as const,
    meal: { ...emptyMeal(), title: "Fictional saved meal" },
  };
  const done = vi.fn();
  render(<MealForm editing={editing} onDone={done} />);
  fireEvent.change(upload(), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: t("f.delete") }));
  expect(done).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem(`mds.meal.draft.A.${editing.id}`)).toBeNull();
  await act(async () => resolve(source));
  expect(fixtures.retain).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(`mds.meal.draft.A.${editing.id}`)).toBeNull();
});

it.each(["response", "blob"] as const)(
  "stops meal source preparation after ownership changes during the %s read",
  async (stage) => {
    let finishResponse!: (value: unknown) => void, finishBlob!: (value: Blob) => void;
    const blob = vi.fn().mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finishBlob = resolve;
        }),
    );
    const fetchFixture = vi.fn().mockImplementation(() =>
      stage === "response"
        ? new Promise((resolve) => {
            finishResponse = resolve;
          })
        : Promise.resolve({ blob }),
    );
    vi.stubGlobal("fetch", fetchFixture);
    fixtures.photoUrl.mockResolvedValue("https://example.invalid/fictional-source");
    render(<MealForm images={["storage:A/source"]} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
    await waitFor(() => expect(stage === "blob" ? blob : fetchFixture).toHaveBeenCalledOnce());
    fixtures.currentOwner = false;
    await act(async () => {
      if (stage === "response") finishResponse({ blob });
      else finishBlob(new Blob(["fictional image"], { type: "image/jpeg" }));
    });
    if (stage === "response") expect(blob).not.toHaveBeenCalled();
    expect(fixtures.shrink).not.toHaveBeenCalled();
    expect(fixtures.analyze).not.toHaveBeenCalled();
  },
);
