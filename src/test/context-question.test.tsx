import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PromptCarousel } from "@/components/app/PromptCarousel";
import { ContextQuestion } from "@/components/app/ContextQuestion";
import { QuestionSettings } from "@/components/app/QuestionSettings";
import { t } from "@/lib/i18n";
import { opportunities, questionOptions, cacheKey } from "@/lib/context-prompts";
import * as dates from "@/lib/dates";
import { emptyMeal } from "@/lib/meals";
import type { JournalSnapshot, MealRec } from "@/lib/journal";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  open: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.request }));
vi.mock("@/lib/context-prompts.functions", () => ({ chooseContextQuestion: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => mocks.open }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
const day = "2026-10-30";
const meal: MealRec = {
  id: "meal",
  type: "meal",
  localDate: day,
  at: null,
  precision: "date_only",
  createdAt: "",
  source: "manual_text",
  meal: { ...emptyMeal(), title: "테스트 식사" },
};
let j: JournalSnapshot & {
  ready: boolean;
  user: { id: string };
  tz: string;
  setSetting: ReturnType<typeof vi.fn>;
  snapshot: () => JournalSnapshot;
  respondPrompt: ReturnType<typeof vi.fn>;
  newId: () => string;
  undoFor: ReturnType<typeof vi.fn>;
};
const card = () => <ContextQuestion key={j.user.id} day={day} fallback={<p>기본 질문</p>} />;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({ proposal: null });
  j = {
    records: [meal],
    purchases: [],
    stockAdjust: 0,
    reminder: null,
    settings: { showMomo: true, timezone: "Asia/Seoul", prompts: { aiConsent: true } },
    tz: "Asia/Seoul",
    ready: true,
    user: { id: "a" },
    setSetting: vi.fn(),
    snapshot: () => j,
    respondPrompt: vi.fn(),
    newId: () => "new",
    undoFor: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("opens the exact meal editor and never changes journal data on display", async () => {
  render(card());
  await screen.findByRole("button", { name: "먹은 양 기록하기" });
  expect(j.setSetting).not.toHaveBeenCalled();
  expect(j.respondPrompt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "먹은 양 기록하기" }));
  expect(mocks.open).toHaveBeenCalledWith("meal", meal);
  expect(j.records).toEqual([meal]);
});
it("caches once through strict effects and reopenings, even when the provider fails", async () => {
  mocks.request.mockRejectedValue(new Error("offline"));
  const view = render(<StrictMode>{card()}</StrictMode>);
  await screen.findByRole("button", { name: "먹은 양 기록하기" });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  view.unmount();
  render(card());
  expect(screen.getByRole("button", { name: "먹은 양 기록하기" })).toBeVisible();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("ignores a late reply after changing accounts", async () => {
  let resolve!: (x: unknown) => void;
  mocks.request.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const view = render(card());
  await screen.findByRole("button", { name: "먹은 양 기록하기" });
  const o = opportunities(j.records, j.settings.prompts, day)[0]!;
  j = { ...j, user: { id: "b" }, records: [] };
  view.rerender(card());
  await act(async () =>
    resolve({
      proposal: { opportunityId: o.id, version: o.version, question: questionOptions(o, "ko")[1] },
    }),
  );
  expect(screen.queryByText(questionOptions(o, "ko")[1]!)).not.toBeInTheDocument();
  expect(localStorage.getItem(cacheKey("b", "ko", day))).not.toContain("meal:meal");
});
it("removes actions after a source edit/deletion without another model call", async () => {
  const view = render(card());
  await screen.findByRole("button", { name: "먹은 양 기록하기" });
  j = { ...j, records: [] };
  view.rerender(card());
  expect(screen.queryByRole("button", { name: "먹은 양 기록하기" })).not.toBeInTheDocument();
  expect(screen.getByText("기록이 바뀌어 이 질문은 닫았어요.")).toBeVisible();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("passes without a record, and keeps the day and opportunity in separate state", async () => {
  render(card());
  await screen.findByRole("button", { name: "나중에" });
  fireEvent.click(screen.getByRole("button", { name: "나중에" }));
  expect(j.setSetting).toHaveBeenCalledWith(
    "prompts",
    expect.objectContaining({ context: { day, id: "meal:meal", status: "skipped" } }),
  );
  expect(j.respondPrompt).not.toHaveBeenCalled();
});
it("answers a simple water question via the existing atomic journal mechanism", async () => {
  j = {
    ...j,
    records: [],
    settings: { ...j.settings, prompts: { aiConsent: true, off: ["feel", "memory", "weight"] } },
  };
  render(card());
  await screen.findByRole("button", { name: "네, 마셨어요" });
  fireEvent.click(screen.getByRole("button", { name: "네, 마셨어요" }));
  expect(j.respondPrompt).toHaveBeenCalledWith(
    "water",
    day,
    expect.objectContaining({ type: "water", answer: "yes", precision: "exact" }),
    `daily:water:${day}`,
  );
});
it("never replaces a stale source with a late model proposal", async () => {
  let resolve!: (x: unknown) => void;
  mocks.request.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const view = render(card());
  const o = opportunities(j.records, j.settings.prompts, day)[0]!;
  j = { ...j, records: [] };
  view.rerender(card());
  await act(async () =>
    resolve({
      proposal: { opportunityId: o.id, version: o.version, question: questionOptions(o, "ko")[1] },
    }),
  );
  expect(screen.queryByRole("button", { name: "먹은 양 기록하기" })).not.toBeInTheDocument();
});

it("requires opt-in and removes contextual UI on consent withdrawal, including late replies", async () => {
  vi.spyOn(dates, "todayLocal").mockReturnValue(day);
  j.settings.prompts = { aiConsent: false };
  const view = render(<PromptCarousel />);
  expect(mocks.request).not.toHaveBeenCalled();
  let resolve!: (x: unknown) => void;
  mocks.request.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  j.settings.prompts = { aiConsent: true };
  view.rerender(<PromptCarousel />);
  await screen.findByRole("button", { name: "먹은 양 기록하기" });
  const o = opportunities(j.records, j.settings.prompts, day)[0]!;
  j.settings.prompts = { aiConsent: false };
  view.rerender(<PromptCarousel />);
  await act(async () =>
    resolve({
      proposal: { opportunityId: o.id, version: o.version, question: questionOptions(o, "ko")[1] },
    }),
  );
  expect(screen.queryByRole("button", { name: "먹은 양 기록하기" })).not.toBeInTheDocument();
  expect(j.respondPrompt).not.toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it("does not swap in another valid proposal after the displayed question was resolved", async () => {
  let resolve!: (x: unknown) => void;
  mocks.request.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const view = render(card());
  const other = opportunities(j.records, j.settings.prompts, day).find((o) => o.kind === "water")!;
  j = { ...j, records: [{ ...meal, meal: { ...meal.meal, consumedFraction: 0.5 } }] };
  view.rerender(card());
  await act(async () =>
    resolve({
      proposal: {
        opportunityId: other.id,
        version: other.version,
        question: questionOptions(other, "ko")[0],
      },
    }),
  );
  expect(screen.queryByRole("button", { name: "네, 마셨어요" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("기록했어요");
  expect(JSON.parse(localStorage.getItem(cacheKey("a", "ko", day))!).proposal.opportunityId).toBe(
    "meal:meal",
  );
});

it("does not request a second proposal on a fresh device after today's question was passed", async () => {
  j.settings.prompts = { aiConsent: true, context: { day, id: "meal:meal", status: "skipped" } };
  render(card());
  expect(await screen.findByRole("status")).toHaveTextContent("오늘은 건너뛰었어요");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "먹은 양 기록하기" })).not.toBeInTheDocument();
});

it("does not send anything when settings open, and requires an explicit consent action", async () => {
  vi.spyOn(dates, "todayLocal").mockReturnValue(day);
  j.settings.prompts = { aiConsent: false };
  j.setSetting.mockImplementation((_key, prompts) => {
    j.settings = { ...j.settings, prompts };
  });
  const view = render(<PromptCarousel />);
  expect(screen.queryByText(/하루 한 번, 기록 종류/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("pr.preferences") }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(j.setSetting).not.toHaveBeenCalled();
  const consent = screen.getByRole("checkbox", { name: /이 최소 정보를 Meta/ });
  expect(consent).not.toBeChecked();
  fireEvent.click(consent);
  view.rerender(<PromptCarousel />);
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  expect(mocks.request.mock.calls[0]![0].data.consent).toBe(true);
  expect(j.respondPrompt).not.toHaveBeenCalled();
});
it("places contextual opt-out inside its menu and preserves journal records", async () => {
  render(card());
  await screen.findByRole("button", { name: "나중에" });
  expect(screen.queryByRole("button", { name: "질문 숨기기" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("button", { name: "질문 옵션" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "질문 숨기기" }));
  expect(j.setSetting).toHaveBeenCalledWith("prompts", expect.objectContaining({ hidden: true }));
  expect(j.records).toEqual([meal]);
  expect(j.respondPrompt).not.toHaveBeenCalled();
});

it("changes basic question categories independently while preserving AI consent and the shot schedule", async () => {
  j.settings.prompts = { hidden: true, aiConsent: true, off: ["memory"], answered: { water: day } };
  j.reminder = { id: "chosen-schedule", at: "2026-11-04T11:00:00Z" };
  const reminder = j.reminder;
  const originalRecords = [...j.records];
  j.setSetting.mockImplementation((_key, prompts) => {
    j.settings = { ...j.settings, prompts };
  });
  const view = render(<QuestionSettings />);
  fireEvent.click(screen.getByRole("button", { name: t("pr.preferences") }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: t("pr.setting") })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: t("type.memory") })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: t("type.water") }));
  view.rerender(<QuestionSettings />);
  expect(j.settings.prompts).toMatchObject({
    hidden: true,
    aiConsent: true,
    off: ["memory", "water"],
    answered: { water: day },
  });
  expect(screen.getByRole("checkbox", { name: t("type.water") })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: t("type.condition") }));
  view.rerender(<QuestionSettings />);
  fireEvent.click(screen.getByRole("checkbox", { name: t("type.water") }));
  view.rerender(<QuestionSettings />);
  expect(j.settings.prompts?.off).toEqual(["memory", "feel"]);
  expect(screen.getByRole("checkbox", { name: t("type.water") })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: t("type.condition") })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: t("type.weight") })).toBeChecked();
  expect(j.reminder).toBe(reminder);
  expect(j.records).toEqual(originalRecords);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(j.respondPrompt).not.toHaveBeenCalled();
});

it("refreshes basic questions for the next account without inheriting the previous account's completed slots", () => {
  vi.spyOn(dates, "todayLocal").mockReturnValue(day);
  j.settings.prompts = {
    aiConsent: false,
    answered: { feel: day, water: day, memory: day, weight: day },
  };
  const view = render(<PromptCarousel />);
  expect(screen.queryByText(t("pr.feelQ"))).not.toBeInTheDocument();
  j = {
    ...j,
    user: { id: "B" },
    records: [],
    settings: { ...j.settings, prompts: { aiConsent: false } },
  };
  view.rerender(<PromptCarousel />);
  expect(screen.getByText(t("pr.feelQ"))).toBeVisible();
  expect(screen.getByText(t("pr.waterQ"))).toBeVisible();
  expect(j.records).toEqual([]);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(j.respondPrompt).not.toHaveBeenCalled();
});
