import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
import { MomoSheet } from "@/components/app/MomoSheet";
import { emptyMeal } from "@/lib/meals";
import type { MealRec } from "@/lib/journal";
const j = vi.hoisted(() => ({
  user: null,
  tz: "Asia/Seoul",
  settings: { showMomo: true },
  records: [],
  purchases: [],
  inventory: { lots: [] },
  reminder: null,
  newId: () => "new-id",
  saveRecords: vi.fn(),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j, canDeduct: () => true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn() }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
it("makes all eight manual types reachable, including water", () => {
  const setKind = vi.fn();
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="menu" setKind={setKind} />);
  fireEvent.click(screen.getByRole("button", { name: /물 마셨는지/ }));
  expect(setKind).toHaveBeenCalledWith("water");
  for (const label of ["체중", "주사", "컨디션", "사진 · 순간", "식사", "구매 · 재고", "치수"])
    expect(
      screen.getByRole("button", { name: new RegExp(label.replaceAll("·", ".*")) }),
    ).toBeVisible();
});
it("names dose units and prevents stock use without a selected lot", () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="injection" setKind={vi.fn()} />);
  fireEvent.click(screen.getByText("용량 · 부위 · 재고 (선택)"));
  expect(screen.getByRole("combobox", { name: "용량 단위" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "제품을 선택하면 재고를 차감할 수 있어요" }),
  ).toBeDisabled();
});
it("explains recovered meal edits and resets to the saved value without writing", async () => {
  const editing: MealRec = {
    id: "meal-1",
    type: "meal",
    at: null,
    localDate: "2026-10-30",
    precision: "date_only",
    createdAt: "2026-10-30T00:00:00Z",
    source: "manual_text",
    meal: { ...emptyMeal(), title: "테스트 식사", consumedFraction: 0.5 },
  };
  sessionStorage.setItem(
    "mds.meal.draft.guest.meal-1",
    JSON.stringify({
      meal: editing.meal,
      date: editing.localDate,
      time: "",
      fraction: "1",
      id: editing.id,
    }),
  );
  render(<MealForm editing={editing} onDone={vi.fn()} />);
  expect(await screen.findByRole("status")).toHaveTextContent("저장하지 않은 식사 초안");
  fireEvent.click(screen.getByRole("button", { name: "저장된 내용으로 되돌리기" }));
  await waitFor(() =>
    expect(JSON.parse(sessionStorage.getItem("mds.meal.draft.guest.meal-1")!).fraction).toBe("0.5"),
  );
  expect(j.saveRecords).not.toHaveBeenCalled();
  expect(editing.meal.consumedFraction).toBe(0.5);
});
it("retains Momo composition before extraction and restores the input step", async () => {
  const manual = vi.fn();
  const view = render(<MomoSheet onDone={vi.fn()} onManual={manual} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "가상 테스트 메모" } });
  await waitFor(() =>
    expect(sessionStorage.getItem("mds.momo.draft.guest")).toContain("가상 테스트 메모"),
  );
  view.unmount();
  render(<MomoSheet onDone={vi.fn()} onManual={manual} />);
  expect(screen.getByRole("textbox")).toHaveValue("가상 테스트 메모");
  fireEvent.click(screen.getByRole("button", { name: "직접 입력하기" }));
  expect(manual).toHaveBeenCalledOnce();
});

it("does not describe an unchanged saved meal as an unsaved edit", () => {
  const editing: MealRec = {
    id: "meal-unchanged",
    type: "meal",
    at: null,
    localDate: "2026-10-30",
    precision: "date_only",
    createdAt: "2026-10-30T00:00:00Z",
    source: "manual_text",
    meal: { ...emptyMeal(), title: "식사", consumedFraction: 0.5 },
  };
  sessionStorage.setItem(
    "mds.meal.draft.guest.meal-unchanged",
    JSON.stringify({
      meal: editing.meal,
      date: editing.localDate,
      time: "",
      fraction: "0.5",
      id: editing.id,
    }),
  );
  render(<MealForm editing={editing} onDone={vi.fn()} />);
  expect(screen.queryByText("저장하지 않은 식사 초안을 복원했어요.")).not.toBeInTheDocument();
});
