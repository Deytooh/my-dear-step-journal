import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MomoSheet } from "@/components/app/MomoSheet";
import { JournalProvider, useJournal, type MemoryRec } from "@/lib/journal";
import { t } from "@/lib/i18n";
import type { Draft } from "@/lib/momo-drafts";

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
  photoUrl: vi.fn(async () => null),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));

let journal: ReturnType<typeof useJournal>;
function Probe() {
  journal = useJournal();
  return null;
}
const local = `localphoto:guest:${"a".repeat(64)}`;
const stored = `storage:guest/source-${"a".repeat(64)}`;
function draft(key: string): Draft {
  return {
    key,
    type: "memory",
    on: true,
    quote: null,
    timeHint: null,
    f: { note: "Synthetic " + key, date: "2026-11-04", time: "" },
    evidence: {
      method: "photos",
      text: "Synthetic capture",
      photos: [local],
      quote: null,
      proposed: { note: "Synthetic " + key, date: "2026-11-04", time: "" },
      confirmed: {},
    },
  };
}
async function showDrafts(keys = ["one"]) {
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({
      text: "Synthetic capture",
      images: [],
      drafts: keys.map(draft),
      step: "review",
    }),
  );
  render(
    <JournalProvider>
      <Probe />
      <MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />
    </JournalProvider>,
  );
  await screen.findByRole("button", { name: t("mm.confirm", { n: keys.length }) });
}
function latestUndo(notification: { mock: { calls: Parameters<typeof toast.success>[] } }) {
  const action = notification.mock.calls.at(-1)?.[1]?.action;
  if (
    !action ||
    typeof action !== "object" ||
    !("onClick" in action) ||
    typeof action.onClick !== "function"
  )
    throw new Error("Missing Undo action");
  return () => action.onClick({} as never);
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({
      records: [],
      purchases: [],
      reminder: null,
      stockAdjust: 0,
      settings: { showMomo: false, timezone: "UTC", locale: "en" },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("returns photo-backed drafts to review after Undo even when their photos have uploaded", async () => {
  const notification = vi.spyOn(toast, "success");
  await showDrafts();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  const undo = latestUndo(notification);
  const saved = journal.records[0] as MemoryRec;
  act(() => journal.saveRecord({ ...saved, evidence: { ...saved.evidence!, photos: [stored] } }));
  act(undo);
  expect(journal.records).toEqual([]);
  expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  expect(journal.records.map((entry) => entry.id)).toEqual(["one"]);
  expect(notification).toHaveBeenCalledTimes(2);
});

it("stays in Saved when Undo retains every entry because of later corrections", async () => {
  const notification = vi.spyOn(toast, "success");
  const information = vi.spyOn(toast, "info");
  await showDrafts();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  const undo = latestUndo(notification);
  act(() => journal.saveRecord({ ...(journal.records[0] as MemoryRec), note: "Later correction" }));
  act(undo);
  expect(journal.records[0]).toMatchObject({ id: "one", note: "Later correction" });
  expect(information).toHaveBeenCalledExactlyOnceWith(t("mr.undoKept", { n: 1 }));
  expect(screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("mm.new") })).toBeVisible();
});

it("reopens only removed drafts after partial Undo and keeps the later correction on reconfirm", async () => {
  const notification = vi.spyOn(toast, "success");
  const information = vi.spyOn(toast, "info");
  await showDrafts(["one", "two"]);
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 2 }) }));
  const undo = latestUndo(notification);
  act(() => journal.saveRecord({ ...(journal.records[0] as MemoryRec), note: "Later correction" }));
  act(undo);
  expect(journal.records).toHaveLength(1);
  expect(document.querySelector('[data-draft-key="one"]')).not.toBeInTheDocument();
  expect(document.querySelector('[data-draft-key="two"]')).toBeInTheDocument();
  expect(information).toHaveBeenCalledExactlyOnceWith(t("mr.undoKept", { n: 1 }));
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  expect(journal.records).toHaveLength(2);
  expect(journal.records.find((entry) => entry.id === "one")).toMatchObject({
    note: "Later correction",
  });
  expect(journal.records.find((entry) => entry.id === "two")).toMatchObject({
    note: "Synthetic two",
  });
});

it("reports failed Undo persistence and keeps the Saved view truthful", async () => {
  const notification = vi.spyOn(toast, "success");
  const failure = vi.spyOn(toast, "error");
  await showDrafts();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  const undo = latestUndo(notification);
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  act(undo);
  storage.mockRestore();
  expect(failure).toHaveBeenCalledExactlyOnceWith(t("evidence.saveFailed"));
  expect(journal.records).toHaveLength(1);
  expect(screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("mm.new") })).toBeVisible();
});

it("keeps a recovered correction editable without false success if its stable ID already has other content", async () => {
  const notification = vi.spyOn(toast, "success");
  await showDrafts();
  const existing: MemoryRec = {
    id: "one",
    type: "memory",
    note: "Already saved differently",
    localDate: "2026-11-04",
    precision: "date_only",
    at: null,
    createdAt: "2026-11-04T10:00:00Z",
    source: "manual_text",
  };
  act(() => journal.saveRecord(existing));
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t("mr.savedConflict")));
  expect(notification).not.toHaveBeenCalled();
  expect(journal.records).toEqual([existing]);
  expect(screen.getByRole("link", { name: t("mr.openSaved") })).toHaveAttribute("href", "/history");
  expect(screen.queryByText(t("mm.saved"))).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeEnabled();
});
