import { act, fireEvent, render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { MealForm } from "@/components/app/MealForm";
import { MomoSheet } from "@/components/app/MomoSheet";
import { photoUrl } from "@/lib/cloud-sync";
import { emptyMeal } from "@/lib/meals";
import { t } from "@/lib/i18n";
import { sanitizeCandidates } from "@/lib/momo-schema";
import { todayLocal, addDays, fmtMonthDay, instantFromLocal } from "@/lib/dates";
import { toast } from "sonner";
import { inventory, canDeduct } from "@/lib/inventory";
import { purchaseMoneyFacts } from "@/lib/purchase-money";
import { prepareMomoHandoff } from "@/lib/momo-handoff";
import type { MealRec, Purchase, WaterRec } from "@/lib/journal";
const ai = vi.hoisted(() => ({ extract: vi.fn() }));
const photo = vi.hoisted(() => ({ shrink: vi.fn() }));
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  shrinkPhoto: photo.shrink,
}));
const j = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tz: "Asia/Seoul",
  settings: { showMomo: true },
  records: [],
  purchases: [],
  inventory: { lots: [] },
  reminder: null,
  newId: () => "new-id",
  saveRecords: vi.fn(),
  saveRecord: vi.fn(),
  savePurchase: vi.fn(),
  saveMomoBatch: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(() => vi.fn()),
  sync: "synced",
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => j, canDeduct: () => true }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/today" } }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => ai.extract }));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
beforeEach(() => {
  j.user = null;
  sessionStorage.clear();
  vi.clearAllMocks();
  ai.extract.mockReset();
  j.snapshot.mockImplementation(() => ({
    records: j.records,
    purchases: j.purchases,
    settings: j.settings,
    reminder: j.reminder,
    stockAdjust: 0,
  }));
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
  fireEvent.click(screen.getByRole("button", { name: t("mc.manual") }));
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

const guestNote = "Fictional test draft: a walk in the park.";
function offerGuestDraft() {
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({ text: guestNote, images: [], drafts: [], usedVoice: false }),
  );
  prepareMomoHandoff(sessionStorage, true);
}
it("offers a sign-in link without sending the guest capture to AI", () => {
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("link", { name: t("mc.signinAction") })).toHaveAttribute("href", "/auth");
  expect(j.saveRecords).not.toHaveBeenCalled();
  expect(ai.extract).not.toHaveBeenCalled();
});
it("resumes guest input only after the returning account explicitly chooses it", async () => {
  offerGuestDraft();
  j.user = { id: "A" };
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.click(await screen.findByRole("button", { name: t("mc.resumeGuest") }));
  expect(screen.getByRole("textbox")).toHaveValue(guestNote);
  expect(screen.getByRole("checkbox", { name: t("mc.consent") })).not.toBeChecked();
  expect(j.saveRecords).not.toHaveBeenCalled();
});
it("keeps an existing account draft instead of replacing it with guest input", () => {
  offerGuestDraft();
  j.user = { id: "A" };
  sessionStorage.setItem(
    "mds.momo.draft.A",
    JSON.stringify({ text: "Account draft", images: [], drafts: [] }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("Account draft");
  expect(screen.queryByRole("button", { name: t("mc.resumeGuest") })).not.toBeInTheDocument();
});
it("does not offer a previous account's guest handoff after switching accounts", async () => {
  offerGuestDraft();
  j.user = { id: "A" };
  const view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(await screen.findByRole("button", { name: t("mc.resumeGuest") })).toBeVisible();
  j.user = { id: "B" };
  view.rerender(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.queryByRole("button", { name: t("mc.resumeGuest") })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it("opens the first invalid Momo card and names the field instead of saving incomplete entries", () => {
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({
      text: "Fictional weight entry",
      images: [],
      drafts: [
        {
          key: "needs-date",
          type: "weight",
          on: true,
          quote: null,
          timeHint: null,
          f: { value: "78.2", date: "", time: "" },
        },
      ],
    }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const edit = screen.getByRole("button", { name: t("mc.fixField", { field: t("f.date") }) });
  expect(edit).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
  expect(edit).toHaveAttribute("aria-expanded", "true");
  expect(edit).toHaveFocus();
  expect(screen.getByLabelText(new RegExp(t("f.date")))).toBeVisible();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
});

it("cancels previous photo work on account switch without letting its late completion unlock a new upload", async () => {
  let finishOld!: (image: string) => void, finishNew!: (image: string) => void;
  photo.shrink
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
  const view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const upload = () => screen.getByLabelText(t("momo.photos"));
  fireEvent.change(upload(), {
    target: { files: [new File(["fixture"], "old.jpg", { type: "image/jpeg" })] },
  });
  expect(upload()).toBeDisabled();
  j.user = { id: "A" };
  view.rerender(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(upload()).toBeEnabled();
  fireEvent.change(upload(), {
    target: { files: [new File(["fixture"], "new.jpg", { type: "image/jpeg" })] },
  });
  expect(upload()).toBeDisabled();
  await act(async () => finishOld("data:image/jpeg;base64,b2xk"));
  expect(upload()).toBeDisabled();
  await act(async () => finishNew("data:image/jpeg;base64,bmV3"));
  expect(upload()).toBeEnabled();
  expect(screen.getByAltText(t("f.photo") + " 1")).toHaveAttribute(
    "src",
    "data:image/jpeg;base64,bmV3",
  );
  expect(photo.shrink).toHaveBeenCalledTimes(2);
});

it("takes a mocked multi-fact day through consent, review, correction and one confirmed batch with its sources", async () => {
  j.user = { id: "A" };
  const today = todayLocal(j.tz);
  const note =
    "Fictional example. Today I weighed 78.2kg and felt tired. Yesterday evening I had an injection but do not remember the dose.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [
        { type: "weight", value: 78.2, date: today, quote: "78.2kg" },
        { type: "condition", label: "tired", date: today, quote: "felt tired" },
        {
          type: "injection",
          date: addDays(today, -1),
          timeHint: "evening",
          quote: "Yesterday evening I had an injection",
          medication: null,
          doseValue: null,
        },
      ],
      note,
    ),
    reply: "",
    model: "fictional-mocked-model",
  });
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  expect(ai.extract).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  const confirm = await screen.findByRole("button", { name: t("mm.confirm", { n: 3 }) });
  expect(ai.extract).toHaveBeenCalledTimes(1);
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  const weight = screen.getByText("78.2 kg", { selector: "p" }).closest("li")!;
  fireEvent.click(within(weight).getByRole("button", { name: t("evidence.edit") }));
  fireEvent.change(within(weight).getByLabelText(t("f.value") + " · " + t("evidence.suggested")), {
    target: { value: "78.3" },
  });
  fireEvent.click(confirm);
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledTimes(1));
  const [records, purchases, owner] = j.saveMomoBatch.mock.calls[0]!;
  expect(owner).toBe("A");
  expect(purchases).toEqual([]);
  expect(records).toHaveLength(3);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "weight",
        value: 78.3,
        evidence: expect.objectContaining({
          text: note,
          quote: "78.2kg",
          proposed: expect.objectContaining({ value: "78.2" }),
          confirmed: expect.objectContaining({ value: "78.3" }),
        }),
      }),
      expect.objectContaining({
        type: "injection",
        doseValue: null,
        medication: null,
        usedStock: false,
        at: null,
        partOfDay: "evening",
      }),
    ]),
  );
});

it.each(["unmount", "edit", "revoke consent", "keep editing"])(
  "does not start meal inference after %s while photos are being prepared",
  async (action) => {
    j.user = { id: "A" };
    let finish!: (url: string) => void;
    vi.mocked(photoUrl).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<MealForm images={["data:image/jpeg;base64,YWJj"]} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("meal.analyze") }));
    if (action === "unmount") view.unmount();
    else if (action === "edit")
      fireEvent.change(screen.getByLabelText(t("meal.title")), {
        target: { value: "My corrected fictional meal" },
      });
    else if (action === "revoke consent")
      fireEvent.click(screen.getByRole("checkbox", { name: t("meal.consent") }));
    else fireEvent.click(screen.getByRole("button", { name: t("ai.keepEditing") }));
    await act(async () => finish("data:image/jpeg;base64,YWJj"));
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveRecords).not.toHaveBeenCalled();
    if (action === "edit")
      expect(screen.getByLabelText(t("meal.title"))).toHaveValue("My corrected fictional meal");
  },
);
it("ignores a late Momo result after consent is revoked and keeps the user's input", async () => {
  j.user = { id: "A" };
  let finish!: (result: {
    candidates: ReturnType<typeof sanitizeCandidates>;
    reply: string;
  }) => void;
  ai.extract.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional 78.2kg" } });
  fireEvent.click(screen.getByText(t("mc.privacy"), { selector: "summary" }));
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  expect(ai.extract).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  await act(async () =>
    finish({
      candidates: sanitizeCandidates(
        [{ type: "weight", date: todayLocal(j.tz), value: 78.2 }],
        "Fictional 78.2kg",
      ),
      reply: "",
    }),
  );
  expect(screen.getByRole("textbox")).toHaveValue("Fictional 78.2kg");
  expect(screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) })).not.toBeInTheDocument();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
});

it("keeps the composer open if sign-in recovery cannot be stored and offers an explicit way to continue without it", () => {
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Fictional draft to preserve" },
  });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  try {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: t("mc.signinAction") }), event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(t("mc.draftStorage"));
    expect(screen.getByRole("textbox")).toHaveValue("Fictional draft to preserve");
    expect(screen.getByRole("link", { name: t("mc.signinWithoutDraft") })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(ai.extract).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});

it("applies an explicit Today choice only to selected undated suggestions and retains the original proposals", async () => {
  const today = todayLocal(j.tz),
    past = addDays(today, -2);
  const make = (key: string, value: string, date: string, on = true) => ({
    key,
    type: "weight",
    on,
    quote: null,
    timeHint: null,
    f: { value, date, time: "" },
    evidence: {
      method: "text",
      text: "Fictional date review fixture.",
      quote: null,
      photos: [],
      proposed: { value, date, time: "" },
      confirmed: {},
    },
  });
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({
      text: "Fictional date review fixture.",
      images: [],
      drafts: [
        make("one", "78.2", ""),
        make("two", "78.3", ""),
        make("past", "78.4", past),
        make("excluded", "78.5", "", false),
      ],
    }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText(t("mc.undated", { n: 2 }))).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: t("mc.useToday", { date: fmtMonthDay(today) }) }),
  );
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 3 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  const [records] = j.saveMomoBatch.mock.calls[0]!;
  expect(records).toHaveLength(3);
  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "one",
        localDate: today,
        evidence: expect.objectContaining({
          proposed: expect.objectContaining({ date: "" }),
          confirmed: expect.objectContaining({ date: today }),
        }),
      }),
      expect.objectContaining({ id: "two", localDate: today }),
      expect.objectContaining({ id: "past", localDate: past }),
    ]),
  );
  expect(records.some((record: { id: string }) => record.id === "excluded")).toBe(false);
});

it("finishes a recovered voice session before persisting the guest sign-in handoff", () => {
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({
      text: "Fictional dictated words",
      images: [],
      drafts: [],
      usedVoice: true,
      voiceSession: { before: "", wasVoice: false },
    }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const link = screen.getByRole("link", { name: t("mc.signinAction") });
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link);
  const kept = JSON.parse(sessionStorage.getItem("mds.momo.draft.guest")!);
  expect(kept.text).toBe("Fictional dictated words");
  expect(kept.usedVoice).toBe(true);
  expect(kept.voiceSession).toBeNull();
  expect(ai.extract).not.toHaveBeenCalled();
});

it("shows the key facts of collapsed suggestions before any save", () => {
  const date = todayLocal(j.tz);
  const drafts = [
    { key: "weight-preview", type: "weight", f: { value: "78.2", date, time: "08:15" } },
    {
      key: "injection-preview",
      type: "injection",
      f: {
        medication: "Fictional medication",
        doseValue: "0.5",
        doseUnit: "mg",
        site: "Fictional site",
        date,
      },
    },
    {
      key: "unknown-preview",
      type: "injection",
      f: { medication: "Unknown-dose fixture", doseValue: "", doseUnit: "", site: "", date },
    },
    {
      key: "measure-preview",
      type: "measure",
      f: { waist: "84", hip: "96", chest: "", thigh: "", date },
    },
    {
      key: "expense-preview",
      type: "expense",
      f: {
        product: "Fictional receipt",
        amount: "12.5",
        currency: "EUR",
        merchant: "Fictional shop",
        quantity: "2",
        date,
      },
    },
    {
      key: "purchase-preview",
      type: "purchase",
      f: {
        medication: "Fictional purchase",
        quantity: "3",
        amount: "24",
        currency: "USD",
        merchant: "Fictional pharmacy",
        date,
      },
    },
    {
      key: "condition-preview",
      type: "condition",
      f: { label: "Fictional feeling", note: "Fictional extra context", date },
    },
  ].map((d) => ({ ...d, on: true, quote: null, timeHint: null }));
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({ text: "Fictional review fixtures", images: [], drafts }),
  );
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const card = (key: string) =>
    within(document.querySelector('[data-draft-key="' + key + '"]') as HTMLElement);
  expect(card("weight-preview").getByText("78.2 kg")).toBeVisible();
  expect(card("weight-preview").getByText(/08:15/)).toBeVisible();
  expect(card("injection-preview").getByText(t("f.dose") + ": 0.5 mg")).toBeVisible();
  expect(card("injection-preview").getByText(t("f.site") + ": Fictional site")).toBeVisible();
  expect(card("unknown-preview").getByText(t("f.dose") + ": " + t("unknown"))).toBeVisible();
  expect(card("measure-preview").getByText(t("f.waist") + ": 84")).toBeVisible();
  expect(card("measure-preview").getByText(t("f.hip") + ": 96")).toBeVisible();
  expect(card("expense-preview").getByText("Fictional receipt")).toBeVisible();
  expect(card("expense-preview").getByText(t("f.amount") + ": 12.5 EUR")).toBeVisible();
  expect(card("expense-preview").getByText(t("f.merchant") + ": Fictional shop")).toBeVisible();
  expect(card("purchase-preview").getByText(t("f.quantity") + ": 3")).toBeVisible();
  expect(card("purchase-preview").getByText(t("f.amount") + ": 24 USD")).toBeVisible();
  expect(card("condition-preview").getByText("Fictional extra context")).toBeVisible();
  expect(
    screen
      .getAllByRole("button", { name: t("evidence.edit") })
      .every((button) => button.getAttribute("aria-expanded") === "false"),
  ).toBe(true);
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  expect(ai.extract).not.toHaveBeenCalled();
});

it("allows the next account to confirm its own drafts after the previous account saved", async () => {
  const date = todayLocal(j.tz);
  for (const owner of ["A", "B"])
    sessionStorage.setItem(
      "mds.momo.draft." + owner,
      JSON.stringify({
        text: "Fictional " + owner,
        images: [],
        drafts: [
          {
            key: "entry-" + owner,
            type: "memory",
            on: true,
            quote: null,
            timeHint: null,
            f: { note: "Fictional " + owner, date },
          },
        ],
      }),
    );
  j.user = { id: "A" };
  const view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledTimes(1));
  expect(j.saveMomoBatch.mock.calls[0]?.[2]).toBe("A");
  j.user = { id: "B" };
  view.rerender(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(
    within(document.querySelector('[data-draft-key="entry-B"]') as HTMLElement).getByText(
      "Fictional B",
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledTimes(2));
  expect(j.saveMomoBatch.mock.calls[1]?.[2]).toBe("B");
  expect(j.saveMomoBatch.mock.calls[1]?.[0]).toEqual([
    expect.objectContaining({ id: "entry-B", note: "Fictional B" }),
  ]);
});

it("keeps a new capture open when Undo belongs to an earlier saved batch", async () => {
  const notification = vi.spyOn(toast, "success");
  try {
    j.user = { id: "A" };
    sessionStorage.setItem(
      "mds.momo.draft.A",
      JSON.stringify({
        text: "Fictional saved fixture",
        images: [],
        drafts: [
          {
            key: "old-entry",
            type: "memory",
            on: true,
            quote: null,
            timeHint: null,
            f: { note: "Fictional saved fixture", date: todayLocal(j.tz) },
          },
        ],
      }),
    );
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
    const undo = notification.mock.calls.at(-1)?.[1]?.action;
    if (
      !undo ||
      typeof undo !== "object" ||
      !("onClick" in undo) ||
      typeof undo.onClick !== "function"
    )
      throw new Error("Missing Undo action");
    act(() => undo.onClick({} as never));
    expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: t("mm.new") }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional new capture" } });
    act(() => undo.onClick({} as never));
    expect(screen.getByRole("textbox")).toHaveValue("Fictional new capture");
    expect(
      screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) }),
    ).not.toBeInTheDocument();
    expect(j.saveMomoBatch).toHaveBeenCalledTimes(2);
  } finally {
    notification.mockRestore();
  }
});

it("asks the user to choose an unknown water answer before confirming it with its source", async () => {
  j.user = { id: "A" };
  const words = "Fictional example: water came to mind today.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [{ type: "water", answer: null, date: todayLocal(j.tz), quote: words }],
      words,
    ),
    reply: "",
    model: "fictional-mocked-model",
  });
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  fireEvent.click(await screen.findByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: t("type.water") }), {
    target: { value: "not_yet" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  expect(j.saveMomoBatch.mock.calls[0]?.[0]).toEqual([
    expect.objectContaining({
      type: "water",
      answer: "not_yet",
      evidence: expect.objectContaining({
        text: words,
        quote: words,
        proposed: expect.objectContaining({ answer: "" }),
        confirmed: expect.objectContaining({ answer: "not_yet" }),
      }),
    }),
  ]);
});

it("keeps changed meal dates and times in confirmed evidence without changing the source proposal", async () => {
  j.user = { id: "A" };
  const originalDate = addDays(todayLocal(j.tz), -1);
  const nextDate = todayLocal(j.tz);
  const meal = { ...emptyMeal(), title: "Fictional meal" };
  const source = {
    method: "text" as const,
    text: "Fictional remembered meal source",
    quote: null,
    photos: [],
    proposed: { meal: JSON.stringify(meal), date: originalDate, time: "08:00" },
    confirmed: { meal: JSON.stringify(meal), date: originalDate, time: "08:00" },
  };
  const editing: MealRec = {
    id: "dated-meal",
    type: "meal",
    meal,
    localDate: originalDate,
    at: instantFromLocal(originalDate, "08:00", j.tz),
    precision: "exact",
    createdAt: "2026-11-01T00:00:00Z",
    source: "manual_text",
    evidence: source,
  };
  const before = JSON.stringify(source);
  render(<MealForm editing={editing} onDone={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("f.date")), { target: { value: nextDate } });
  fireEvent.click(screen.getByText(t("meal.optional"), { selector: "summary" }));
  fireEvent.change(screen.getByLabelText(t("f.time")), { target: { value: "09:30" } });
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  await waitFor(() => expect(j.saveRecord).toHaveBeenCalledOnce());
  expect(j.saveRecord.mock.calls[0]?.[0]).toMatchObject({
    localDate: nextDate,
    at: instantFromLocal(nextDate, "09:30", j.tz),
    evidence: {
      proposed: source.proposed,
      confirmed: { date: nextDate, time: "09:30" },
      text: source.text,
    },
  });
  expect(JSON.stringify(source)).toBe(before);
});
it("keeps a new manual meal's chosen day in both manual evidence maps", async () => {
  render(<MealForm onDone={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("meal.title")), {
    target: { value: "Fictional manual meal" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  await waitFor(() => expect(j.saveRecord).toHaveBeenCalledOnce());
  expect(j.saveRecord.mock.calls[0]?.[0].evidence).toMatchObject({
    method: "manual",
    proposed: { date: todayLocal(j.tz), time: "" },
    confirmed: { date: todayLocal(j.tz), time: "" },
  });
});

const receiptFixture = (): Purchase => ({
  id: "fictional-receipt",
  localDate: "2026-11-04",
  amount: 12.5,
  currency: "EUR",
  quantity: 1,
  doses: 0,
  addsStock: false,
  stockUnit: null,
  medication: null,
  product: "Fictional receipt",
  merchant: "Fictional shop",
  evidence: {
    method: "photos",
    text: "Fictional receipt fixture",
    quote: null,
    photos: [],
    proposed: { amount: "12.5", currency: "EUR" },
    confirmed: { amount: "12.5", currency: "EUR" },
  },
});
it("keeps a decimal receipt amount and its currency unchanged when it is opened and saved", async () => {
  const receipt = receiptFixture();
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={receipt}
    />,
  );
  expect(screen.getByLabelText(t("f.amount"))).toHaveValue("12.5");
  expect(screen.getByRole("heading")).toHaveTextContent(t("type.expense"));
  expect(
    screen.getByText(t("money.stockDetails"), { selector: "summary" }).closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getByText(t("f.date") + " · " + receipt.localDate, { selector: "summary" }),
  ).toBeVisible();
  expect(screen.getByRole("combobox", { name: t("evidence.currency") })).toHaveValue("EUR");
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(j.savePurchase.mock.calls[0]?.[0]).toMatchObject({
    amount: 12.5,
    currency: "EUR",
    addsStock: false,
    doses: 0,
  });
});
it("saves an explicit decimal-comma and currency correction while retaining the receipt proposal", async () => {
  const receipt = receiptFixture();
  const before = JSON.stringify(receipt);
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={receipt}
    />,
  );
  fireEvent.change(screen.getByLabelText(t("f.amount")), { target: { value: "12,75" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("evidence.currency") }), {
    target: { value: "USD" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(j.savePurchase.mock.calls[0]?.[0]).toMatchObject({
    amount: 12.75,
    currency: "USD",
    addsStock: false,
    doses: 0,
    evidence: {
      proposed: { amount: "12.5", currency: "EUR" },
      confirmed: { amount: "12.75", currency: "USD" },
    },
  });
  expect(JSON.stringify(receipt)).toBe(before);
});
it("asks for unambiguous amount formatting before saving a receipt", () => {
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={receiptFixture()}
    />,
  );
  fireEvent.change(screen.getByLabelText(t("f.amount")), { target: { value: "12,000" } });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(screen.getByRole("alert")).toHaveTextContent(t("money.invalid"));
  expect(j.savePurchase).not.toHaveBeenCalled();
});
it("preserves an explicitly entered zero amount", async () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="purchase" setKind={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("f.amount")), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(j.savePurchase.mock.calls[0]?.[0]).toMatchObject({
    amount: 0,
    currency: "KRW",
    addsStock: false,
    doses: 0,
  });
});
it("retains a corrected water answer in the shared manual editor's evidence", async () => {
  const date = todayLocal(j.tz);
  const editing: WaterRec = {
    id: "water-evidence",
    type: "water",
    answer: "yes",
    localDate: date,
    at: null,
    precision: "date_only",
    createdAt: "2026-11-04T00:00:00Z",
    source: "manual_text",
    evidence: {
      method: "text",
      text: "Fictional water source",
      quote: null,
      photos: [],
      proposed: { answer: "yes", date, time: "" },
      confirmed: { answer: "yes", date, time: "" },
    },
  };
  render(
    <QuickAddSheet open onOpenChange={vi.fn()} kind="water" setKind={vi.fn()} editing={editing} />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("pr.water.notYet") }));
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.saveRecord).toHaveBeenCalledOnce());
  expect(j.saveRecord.mock.calls[0]?.[0]).toMatchObject({
    answer: "not_yet",
    evidence: { proposed: { answer: "yes" }, confirmed: { answer: "not_yet" } },
  });
});

it.each(["keep editing", "voice", "photo", "composition"])(
  "ignores a pending Momo result after the user starts %s",
  async (action) => {
    j.user = { id: "A" };
    const previous = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    class FakeSpeech {
      onstart: (() => void) | null = null;
      start = vi.fn(() => this.onstart?.());
      abort = vi.fn();
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeech });
    try {
      let finish!: (result: {
        candidates: ReturnType<typeof sanitizeCandidates>;
        reply: string;
      }) => void;
      ai.extract.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Fictional 78.2kg" } });
      fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
      fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
      expect(ai.extract).toHaveBeenCalledOnce();
      if (action === "keep editing")
        fireEvent.click(screen.getByRole("button", { name: t("ai.keepEditing") }));
      else if (action === "voice")
        fireEvent.click(screen.getByRole("button", { name: t("mm.voice") }));
      else if (action === "composition") fireEvent.compositionStart(input);
      else {
        photo.shrink.mockReturnValue(new Promise(() => {}));
        fireEvent.change(screen.getByLabelText(t("momo.photos")), {
          target: { files: [new File(["fixture"], "fictional.jpg", { type: "image/jpeg" })] },
        });
      }
      await act(async () =>
        finish({
          candidates: sanitizeCandidates(
            [{ type: "weight", value: 78.2, date: todayLocal(j.tz), quote: "78.2kg" }],
            "Fictional 78.2kg",
          ),
          reply: "",
        }),
      );
      expect(screen.getByRole("textbox")).toHaveValue("Fictional 78.2kg");
      expect(
        screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) }),
      ).not.toBeInTheDocument();
      expect(j.saveMomoBatch).not.toHaveBeenCalled();
      if (action === "voice")
        expect(screen.getByRole("button", { name: t("mv.finish") })).toBeVisible();
      if (action === "keep editing") expect(input).toHaveFocus();
    } finally {
      hidden.mockRestore();
      photo.shrink.mockReset();
      if (previous) Object.defineProperty(window, "SpeechRecognition", previous);
      else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
    }
  },
);

it("keeps an explicitly unknown purchase price and currency unknown when the editor is saved unchanged", async () => {
  const receipt = receiptFixture();
  receipt.amount = 0;
  receipt.currency = "KRW";
  receipt.evidence!.proposed = { amount: "", currency: "" };
  receipt.evidence!.confirmed = { amount: "", currency: "" };
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={receipt}
    />,
  );
  expect(screen.getByLabelText(t("f.amount"))).toHaveValue("");
  expect(screen.getByRole("combobox", { name: t("evidence.currency") })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(purchaseMoneyFacts(j.savePurchase.mock.calls[0]?.[0])).toEqual({
    amount: null,
    currency: null,
  });
});
it("allows a user to explicitly resolve an unknown price as zero in a chosen currency", async () => {
  const receipt = receiptFixture();
  receipt.amount = 0;
  receipt.currency = "KRW";
  receipt.evidence!.proposed = { amount: "", currency: "" };
  receipt.evidence!.confirmed = { amount: "", currency: "" };
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={receipt}
    />,
  );
  fireEvent.change(screen.getByLabelText(t("f.amount")), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("combobox", { name: t("evidence.currency") }), {
    target: { value: "USD" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(purchaseMoneyFacts(j.savePurchase.mock.calls[0]?.[0])).toEqual({
    amount: 0,
    currency: "USD",
  });
  expect(j.savePurchase.mock.calls[0]?.[0].evidence.proposed).toEqual({ amount: "", currency: "" });
});
it("keeps two different quoted purchases selected when both prices are unknown", async () => {
  j.user = { id: "A" };
  const words = "Fictional example: bought 2 pens of Alpha and bought 3 pens of Beta.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [
        {
          type: "purchase",
          medication: "Alpha",
          quantity: 2,
          date: todayLocal(j.tz),
          quote: "bought 2 pens of Alpha",
        },
        {
          type: "purchase",
          medication: "Beta",
          quantity: 3,
          date: todayLocal(j.tz),
          quote: "bought 3 pens of Beta",
        },
      ],
      words,
    ),
    reply: "",
  });
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  const confirm = await screen.findByRole("button", { name: t("mm.confirm", { n: 2 }) });
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  const purchases = j.saveMomoBatch.mock.calls[0]?.[1];
  expect(purchases).toHaveLength(2);
  expect(purchases.map((row: Purchase) => purchaseMoneyFacts(row))).toEqual([
    { amount: null, currency: null },
    { amount: null, currency: null },
  ]);
  expect(purchases.map((row: Purchase) => row.quantity)).toEqual([2, 3]);
});

it("lets the user confirm a missing stock unit without changing its original proposal", async () => {
  j.user = { id: "A" };
  const words = "Fictional Medicine: bought 2 items today.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [
        {
          type: "purchase",
          medication: "Fictional Medicine",
          quantity: 2,
          date: todayLocal(j.tz),
          quote: words,
        },
      ],
      words,
    ),
    reply: "",
  });
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  await screen.findByRole("button", { name: t("mm.confirm", { n: 1 }) });
  expect(screen.getByText(t("momo.stockReview"))).toBeVisible();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("evidence.edit") }));
  fireEvent.change(screen.getByRole("combobox", { name: t("f.unit") }), {
    target: { value: "pen" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  const purchase = j.saveMomoBatch.mock.calls[0]?.[1][0];
  expect(purchase).toMatchObject({
    stockUnit: "pen",
    quantity: 2,
    evidence: { proposed: { stockUnit: "" }, confirmed: { stockUnit: "pen" } },
  });
  expect(inventory([purchase], []).lots[0]).toMatchObject({ unit: "pen", balance: 2 });
  expect(canDeduct("pen")).toBe(false);
});

it("retains a later stock-unit correction made in the shared purchase editor", async () => {
  const purchase = receiptFixture();
  purchase.addsStock = true;
  purchase.quantity = 2;
  purchase.doses = 2;
  purchase.stockUnit = null;
  purchase.medication = "Fictional Medicine";
  purchase.evidence!.proposed["stockUnit"] = "";
  purchase.evidence!.confirmed["stockUnit"] = "";
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={purchase}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: t("f.unit") }), {
    target: { value: "pen" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(j.savePurchase.mock.calls[0]?.[0]).toMatchObject({
    stockUnit: "pen",
    quantity: 2,
    evidence: { proposed: { stockUnit: "" }, confirmed: { stockUnit: "pen" } },
  });
});

it("keeps distinct equal-price receipts selected through one confirmed batch", async () => {
  j.user = { id: "A" };
  const words = "Fictional example: Coffee cost 4 EUR and lunch cost 4 EUR today.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [
        {
          type: "expense",
          product: "Coffee",
          amount: 4,
          currency: "EUR",
          quantity: 1,
          date: todayLocal(j.tz),
          quote: "Coffee cost 4 EUR",
        },
        {
          type: "expense",
          product: "Lunch",
          amount: 4,
          currency: "EUR",
          quantity: 1,
          date: todayLocal(j.tz),
          quote: "lunch cost 4 EUR",
        },
      ],
      words,
    ),
    reply: "",
  });
  render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  const confirm = await screen.findByRole("button", { name: t("mm.confirm", { n: 2 }) });
  expect(screen.queryByText(t("momo.dup"))).not.toBeInTheDocument();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  const purchases = j.saveMomoBatch.mock.calls[0]?.[1];
  expect(purchases).toHaveLength(2);
  expect(purchases.map((p: Purchase) => p.product)).toEqual(["Coffee", "Lunch"]);
  expect(purchases.map((p: Purchase) => p.evidence?.quote)).toEqual([
    "Coffee cost 4 EUR",
    "lunch cost 4 EUR",
  ]);
});

it("keeps reviewed corrections after a failed save and retries the same entry ID without a false success", async () => {
  const notification = vi.spyOn(toast, "success");
  try {
    j.user = { id: "A" };
    const words = "Fictional test: weighed 78.2kg today.";
    ai.extract.mockResolvedValue({
      candidates: sanitizeCandidates(
        [{ type: "weight", value: 78.2, date: todayLocal(j.tz), quote: "78.2kg" }],
        words,
      ),
      reply: "",
    });
    j.saveMomoBatch.mockImplementationOnce(() => {
      throw new Error("storage quota");
    });
    render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
    await screen.findByRole("button", { name: t("mm.confirm", { n: 1 }) });
    fireEvent.click(screen.getByRole("button", { name: t("evidence.edit") }));
    fireEvent.change(screen.getByLabelText(t("f.value") + " · " + t("evidence.suggested")), {
      target: { value: "78.3" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t("evidence.saveFailed"));
    expect(notification).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t("f.value") + " · " + t("evidence.corrected"))).toHaveValue(
      "78.3",
    );
    expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledTimes(2));
    expect(j.saveMomoBatch.mock.calls[0]?.[0][0].id).toBe(j.saveMomoBatch.mock.calls[1]?.[0][0].id);
    expect(j.saveMomoBatch.mock.calls[1]?.[0][0]).toMatchObject({
      value: 78.3,
      evidence: {
        text: words,
        quote: "78.2kg",
        proposed: { value: "78.2" },
        confirmed: { value: "78.3" },
      },
    });
    expect(notification).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    notification.mockRestore();
  }
});

it.each(["morning", ""])(
  "lets Momo review change an approximate time to %s before saving",
  async (period) => {
    j.user = { id: "A" };
    const words = "Fictional evening walk";
    ai.extract.mockResolvedValue({
      candidates: sanitizeCandidates(
        [
          {
            type: "memory",
            note: "Walk",
            date: todayLocal(j.tz),
            timeHint: "evening",
            quote: words,
          },
        ],
        words,
      ),
      reply: "",
    });
    render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
    await screen.findByRole("button", { name: t("mm.confirm", { n: 1 }) });
    fireEvent.click(screen.getByRole("button", { name: t("evidence.edit") }));
    expect(screen.getByRole("combobox", { name: t("time.period") })).toHaveValue("evening");
    fireEvent.change(screen.getByRole("combobox", { name: t("time.period") }), {
      target: { value: period },
    });
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
    expect(j.saveMomoBatch.mock.calls[0]?.[0][0]).toMatchObject({
      precision: period ? "part_of_day" : "date_only",
      partOfDay: period || null,
      at: null,
      evidence: {
        text: words,
        quote: words,
        proposed: { partOfDay: "evening" },
        confirmed: { partOfDay: period },
      },
    });
  },
);

it("clears a saved approximate time through the shared manual editor without losing the original proposal", async () => {
  const rec = {
    id: "period-memory",
    type: "memory" as const,
    note: "Fictional walk",
    localDate: todayLocal(j.tz),
    precision: "part_of_day" as const,
    partOfDay: "evening" as const,
    at: null,
    createdAt: "2026-11-04T00:00:00Z",
    source: "manual_text" as const,
    evidence: {
      method: "text" as const,
      text: "Fictional evening walk",
      quote: "evening walk",
      photos: [],
      proposed: { note: "Fictional walk" },
      confirmed: { note: "Fictional walk" },
    },
  };
  render(
    <QuickAddSheet open onOpenChange={vi.fn()} kind="memory" setKind={vi.fn()} editing={rec} />,
  );
  expect(screen.getByRole("combobox", { name: t("time.period") })).toHaveValue("evening");
  fireEvent.change(screen.getByRole("combobox", { name: t("time.period") }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.saveRecord).toHaveBeenCalledOnce());
  expect(j.saveRecord.mock.calls[0]?.[0]).toMatchObject({
    precision: "date_only",
    partOfDay: null,
    evidence: { proposed: { partOfDay: "evening" }, confirmed: { partOfDay: "" } },
  });
});

it("recovers an explicitly cleared meal time of day and keeps the original period after save", async () => {
  const meal = { ...emptyMeal(), title: "Fictional evening meal" };
  const rec: MealRec = {
    id: "period-meal",
    type: "meal",
    localDate: todayLocal(j.tz),
    at: null,
    precision: "part_of_day",
    partOfDay: "evening",
    createdAt: "2026-11-04T00:00:00Z",
    source: "manual_text",
    meal,
    evidence: {
      method: "text",
      text: "Fictional evening meal",
      quote: "evening meal",
      photos: [],
      proposed: { meal: JSON.stringify(meal), partOfDay: "evening" },
      confirmed: { meal: JSON.stringify(meal), partOfDay: "evening" },
    },
  };
  let view = render(<MealForm editing={rec} onDone={vi.fn()} />);
  fireEvent.click(screen.getByText(t("meal.optional"), { selector: "summary" }));
  fireEvent.change(screen.getByRole("combobox", { name: t("time.period") }), {
    target: { value: "" },
  });
  await waitFor(() =>
    expect(JSON.parse(sessionStorage.getItem("mds.meal.draft.guest.period-meal")!).partOfDay).toBe(
      "",
    ),
  );
  view.unmount();
  view = render(<MealForm editing={rec} onDone={vi.fn()} />);
  expect(await screen.findByRole("status")).toHaveTextContent(t("ux.restored"));
  fireEvent.click(screen.getByText(t("meal.optional"), { selector: "summary" }));
  expect(screen.getByRole("combobox", { name: t("time.period") })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  await waitFor(() => expect(j.saveRecord).toHaveBeenCalledOnce());
  expect(j.saveRecord.mock.calls[0]?.[0]).toMatchObject({
    precision: "date_only",
    partOfDay: null,
    evidence: { proposed: { partOfDay: "evening" }, confirmed: { partOfDay: "" } },
  });
});

it("keeps an over-limit typed note recoverable and sends only after the user shortens it", async () => {
  j.user = { id: "A" };
  const long = "Fictional note " + "x".repeat(4100) + " FINISH";
  let view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveAttribute("maxlength", "100000");
  fireEvent.change(input, { target: { value: long } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  expect(input).toHaveValue(long);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText(t("mc.characters", { n: long.length }))).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(t("mv.limit"));
  expect(screen.getByRole("button", { name: t("mc.organize") })).toBeDisabled();
  expect(ai.extract).not.toHaveBeenCalled();
  view.unmount();
  view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue(long);
  expect(screen.getByRole("button", { name: t("mc.organize") })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional shorter note" } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  ai.extract.mockResolvedValue({ candidates: [], reply: "" });
  fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
  await waitFor(() => expect(ai.extract).toHaveBeenCalledOnce());
  expect(ai.extract.mock.calls[0]?.[0].data.text).toBe("Fictional shorter note");
});

it("keeps an existing medication visible and unchanged on an expense-only receipt", async () => {
  const expense = receiptFixture();
  expense.medication = "Fictional medicine";
  expense.product = null;
  render(
    <QuickAddSheet
      open
      onOpenChange={vi.fn()}
      kind="purchase"
      setKind={vi.fn()}
      editing={expense}
    />,
  );
  expect(screen.getByRole("button", { name: t("med.select") })).toBeVisible();
  expect(screen.getByRole("button", { name: t("med.select") })).toHaveTextContent(
    "Fictional medicine",
  );
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  await waitFor(() => expect(j.savePurchase).toHaveBeenCalledOnce());
  expect(j.savePurchase.mock.calls[0]?.[0]).toMatchObject({
    medication: "Fictional medicine",
    addsStock: false,
    doses: 0,
  });
});
