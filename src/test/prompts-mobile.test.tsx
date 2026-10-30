import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal } from "@/lib/journal";
import { PromptCarousel } from "@/components/app/PromptCarousel";
import { todayLocal } from "@/lib/dates";
import { pickPrompts } from "@/lib/prompts";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  clearPhotoCache: vi.fn(),
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
}));
let journal: ReturnType<typeof useJournal>;
function Capture() {
  journal = useJournal();
  return null;
}
beforeEach(() => {
  toast.success.mockClear();
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({
      records: [],
      purchases: [],
      reminder: null,
      stockAdjust: 0,
      settings: { showMomo: true, timezone: "Asia/Seoul" },
    }),
  );
});
it("saves immediately, keeps the slot, and Undo restores record and question state", async () => {
  render(
    <JournalProvider>
      <Capture />
      <PromptCarousel />
    </JournalProvider>,
  );
  await screen.findByText("오늘 물을 마셨나요?");
  fireEvent.click(screen.getByRole("button", { name: "네, 마셨어요" }));
  expect(journal.records).toHaveLength(1);
  expect(journal.records[0]).toMatchObject({ type: "water", answer: "yes" });
  expect(journal.settings.prompts?.answered?.water).toBe(todayLocal(journal.tz));
  expect(screen.getByRole("status").textContent).toContain("기록했어요");
  act(() => toast.success.mock.calls.at(-1)![1].action.onClick());
  expect(journal.records).toHaveLength(0);
  expect(journal.settings.prompts?.answered?.water).toBeUndefined();
  expect(screen.getByRole("button", { name: "네, 마셨어요" })).toBeVisible();
});
it("keeps skipped and permanently hidden state separate", async () => {
  render(
    <JournalProvider>
      <Capture />
      <PromptCarousel />
    </JournalProvider>,
  );
  await screen.findByText("오늘 물을 마셨나요?");
  fireEvent.click(screen.getAllByRole("button", { name: "나중에" })[0]!);
  expect(journal.settings.prompts?.skipped?.feel).toBe(todayLocal(journal.tz));
  expect(journal.settings.prompts?.answered?.feel).toBeUndefined();
  fireEvent.keyDown(screen.getAllByRole("button", { name: "질문 옵션" })[0]!, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "이 질문 그만 보기" }));
  expect(journal.settings.prompts?.off).toContain("feel");
  expect(journal.records).toHaveLength(0);
});
it("suppresses questions answered through any manual flow", async () => {
  render(
    <JournalProvider>
      <Capture />
      <PromptCarousel />
    </JournalProvider>,
  );
  await waitFor(() => expect(journal.ready).toBe(true));
  act(() =>
    journal.respondPrompt("water", todayLocal(journal.tz), {
      id: "manual",
      type: "condition",
      label: "괜찮아요",
      localDate: todayLocal(journal.tz),
      at: null,
      precision: "date_only",
      createdAt: "",
      source: "manual_text",
    }),
  );
  expect(pickPrompts(journal.records, {}, todayLocal(journal.tz))).not.toContain("feel");
});

it("undoes the record and contextual answer together without erasing later entries", async () => {
  render(
    <JournalProvider>
      <Capture />
    </JournalProvider>,
  );
  await waitFor(() => expect(journal.ready).toBe(true));
  const before = journal.snapshot(),
    day = todayLocal(journal.tz);
  act(() =>
    journal.respondPrompt(
      "water",
      day,
      {
        id: "context-water",
        type: "water",
        answer: "yes",
        localDate: day,
        at: null,
        precision: "date_only",
        createdAt: "",
        source: "manual_text",
      },
      `daily:water:${day}`,
    ),
  );
  const undo = journal.undoFor(before);
  expect(journal.settings.prompts?.context).toEqual({
    day,
    id: `daily:water:${day}`,
    status: "answered",
  });
  act(() =>
    journal.saveRecord({
      id: "later",
      type: "weight",
      value: 80,
      unit: "kg",
      localDate: day,
      at: null,
      precision: "date_only",
      createdAt: "",
      source: "manual_text",
    }),
  );
  act(undo);
  expect(journal.records.map((r) => r.id)).toEqual(["later"]);
  expect(journal.settings.prompts?.context).toBeUndefined();
  expect(journal.settings.prompts?.answered?.water).toBeUndefined();
});

it("keeps explanation and guest consent inside the sheet and can restore hidden questions there", async () => {
  render(
    <JournalProvider>
      <Capture />
      <PromptCarousel />
    </JournalProvider>,
  );
  await screen.findByText("오늘 물을 마셨나요?");
  expect(screen.queryByText(/하루 한 번, 기록 종류/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "질문 숨기기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "모모의 질문" }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByText(/하루 한 번, 기록 종류/)).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /이 최소 정보를 Meta/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "짧은 질문 표시" }));
  expect(journal.settings.prompts?.hidden).toBe(true);
  expect(screen.getByRole("dialog")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "짧은 질문 표시" }));
  expect(journal.settings.prompts?.hidden).toBe(false);
  expect(journal.records).toHaveLength(0);
  fireEvent.click(screen.getAllByRole("button", { name: "닫기" }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "모모의 질문" })).toHaveFocus();
});
