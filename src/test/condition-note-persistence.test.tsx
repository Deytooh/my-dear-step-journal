import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import {
  JournalProvider,
  useJournal,
  type ConditionRec,
  type JournalSnapshot,
} from "@/lib/journal";
import { t } from "@/lib/i18n";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
  clearPhotoCache: vi.fn(),
  photoUrl: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/today" } }),
}));
vi.mock("@/components/app/MealForm", () => ({ MealForm: () => null }));
vi.mock("@/components/app/MomoSheet", () => ({ MomoSheet: () => null }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));

const key = "mds.journal.v1";
const condition = (): ConditionRec => ({
  id: "fictional-condition",
  type: "condition",
  label: "Fictional calm",
  note: "Fictional original note",
  localDate: "2026-11-03",
  precision: "part_of_day",
  at: null,
  partOfDay: "evening",
  createdAt: "2026-11-03T10:00:00Z",
  source: "manual_text",
  evidence: {
    method: "text",
    text: "Fictional original note",
    quote: "Fictional original note",
    photos: [],
    proposed: { note: "Fictional original note", label: "Fictional calm" },
    confirmed: { note: "Fictional original note", label: "Fictional calm" },
  },
});
const stored = (): JournalSnapshot => JSON.parse(localStorage.getItem(key)!);
function Editor() {
  const j = useJournal();
  if (!j.ready || !j.records[0]) return null;
  return (
    <QuickAddSheet
      open
      kind="condition"
      setKind={vi.fn()}
      onOpenChange={vi.fn()}
      editing={j.records[0]}
    />
  );
}
const renderEditor = () =>
  render(
    <JournalProvider>
      <Editor />
    </JournalProvider>,
  );
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    key,
    JSON.stringify({
      records: [condition()],
      purchases: [],
      reminder: null,
      stockAdjust: 0,
      settings: { showMomo: true, timezone: "Asia/Seoul" },
    } satisfies JournalSnapshot),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["", "   \n "])(
  "persists an intentionally cleared condition note (%j) through reload",
  async (note) => {
    const view = renderEditor();
    const field = await screen.findByRole("textbox", { name: new RegExp(t("f.note")) });
    expect(field).toHaveValue("Fictional original note");
    fireEvent.change(field, { target: { value: note } });
    fireEvent.submit(document.querySelector("form")!);
    expect(stored().records[0]).toMatchObject({
      ...condition(),
      note: "",
      evidence: {
        ...condition().evidence,
        confirmed: expect.objectContaining({ note }),
      },
    });
    view.unmount();
    renderEditor();
    expect(await screen.findByRole("textbox", { name: new RegExp(t("f.note")) })).toHaveValue("");
  },
);

it("keeps a replacement condition note trimmed without changing its original evidence", async () => {
  renderEditor();
  const field = await screen.findByRole("textbox", { name: new RegExp(t("f.note")) });
  fireEvent.change(field, { target: { value: "  Fictional correction  " } });
  fireEvent.submit(document.querySelector("form")!);
  expect(stored().records[0]).toMatchObject({
    note: "Fictional correction",
    evidence: {
      text: condition().evidence!.text,
      quote: condition().evidence!.quote,
      proposed: condition().evidence!.proposed,
    },
  });
});

it("keeps the cleared draft available when its save fails, then retries without restoring the old note", async () => {
  renderEditor();
  const field = await screen.findByRole("textbox", { name: new RegExp(t("f.note")) });
  fireEvent.change(field, { target: { value: "" } });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  fireEvent.submit(document.querySelector("form")!);
  expect(await screen.findByText(t("evidence.saveFailed"))).toBeVisible();
  expect(stored().records[0]).toMatchObject({ note: condition().note });
  expect(field).toHaveValue("");
  write.mockRestore();
  fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(stored().records[0]).toMatchObject({ note: "" }));
});
