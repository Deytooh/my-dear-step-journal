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
import type { JournalRecord, MealRec, Purchase, WaterRec } from "@/lib/journal";
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
  records: [] as JournalRecord[],
  purchases: [],
  inventory: { lots: [] },
  reminder: null,
  newId: () => "new-id",
  saveRecords: vi.fn(),
  saveRecord: vi.fn(),
  savePurchase: vi.fn(),
  setReminder: vi.fn(),
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
vi.mock("@/components/app/AppFeel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/app/AppFeel")>()),
  celebrateSave: vi.fn(),
}));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
beforeEach(() => {
  j.user = null;
  j.records = [];
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

it("offers one optional Momo question with manual refresh and no duplicate introduction", () => {
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText(t("mq.day"))).toBeVisible();
  expect(screen.queryByRole("group", { name: t("mg.choices") })).not.toBeInTheDocument();
  expect(screen.queryByText(t("mq.hint"))).not.toBeInTheDocument();
  expect(screen.queryByText(t("me.subtitle"))).not.toBeInTheDocument();
  expect(screen.queryByText(t("mc.reviewHint"))).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
  expect(screen.getByText(t("mq.feeling"))).toBeVisible();
  view.rerender(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText(t("mq.feeling"))).toBeVisible();
  view.unmount();
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText(t("mq.food"))).toBeVisible();
  expect(ai.extract).not.toHaveBeenCalled();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
});
it("keeps the question fixed while typing and restores it with an unfinished draft", async () => {
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional meal and a walk" } });
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
  expect(screen.getByText(t("mq.feeling"))).toBeVisible();
  await waitFor(() =>
    expect(JSON.parse(sessionStorage.getItem("mds.momo.draft.guest")!).question).toBe("mq.feeling"),
  );
  view.unmount();
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("Fictional meal and a walk");
  expect(screen.getByText(t("mq.feeling"))).toBeVisible();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeEnabled();
  expect(screen.getByText(t("mq.feeling"))).toBeVisible();
});
it("keeps the question fixed throughout a voice session before any speech arrives", () => {
  const previous = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  class FakeSpeech {
    onstart: (() => void) | null = null;
    start() {
      this.onstart?.();
    }
    abort() {}
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeech });
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: t("me.voice") }));
    expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
    expect(screen.getByText(t("mq.day"))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("mv.finish") }));
    expect(screen.getByRole("button", { name: t("mq.another") })).toBeEnabled();
    expect(screen.getByText(t("mq.day"))).toBeVisible();
  } finally {
    cleanup();
    hidden.mockRestore();
    if (previous) Object.defineProperty(window, "SpeechRecognition", previous);
    else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
  }
});
it("does not rotate a question during photo preparation or after attaching a photo", async () => {
  let finish!: (value: string) => void;
  photo.shrink.mockReturnValue(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
  );
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t("momo.photos")), {
    target: { files: [new File(["fixture"], "fictional.jpg", { type: "image/jpeg" })] },
  });
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
  await act(async () => finish("data:image/jpeg;base64,ZmFrZQ=="));
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
  expect(screen.getByText(t("mq.day"))).toBeVisible();
  expect(ai.extract).not.toHaveBeenCalled();
});
it("can refresh the guide in memory even if session storage is unavailable", () => {
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
    expect(screen.getByText(t("mq.feeling"))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
    expect(screen.getByText(t("mq.food"))).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue("");
  } finally {
    storage.mockRestore();
  }
});
it("treats the rotating question as a writing guide rather than part of the user's AI input", async () => {
  j.user = { id: "A" };
  ai.extract.mockResolvedValue({ candidates: [], reply: "" });
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
  const words = "Fictional lunch and a quiet walk";
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
  await waitFor(() => expect(ai.extract).toHaveBeenCalledOnce());
  expect(ai.extract.mock.calls[0]![0].data.text).toBe(words);
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
});

function repeatFixture(): MealRec {
  return {
    id: "previous-meal",
    type: "meal",
    source: "manual_text",
    localDate: "2026-10-30",
    precision: "exact",
    at: "2026-10-30T03:00:00Z",
    createdAt: "2026-10-30T03:00:00Z",
    meal: {
      ...emptyMeal(),
      title: "Fictional lentil lunch",
      mealType: "lunch",
      consumedFraction: 0.5,
      photoRefs: ["data:image/jpeg;base64,ZmFrZQ=="],
      note: "Old note",
      consumptionNote: "Old amount",
      estimateAssumptions: ["Old photo estimate"],
      analysis: {
        model: "fictional-test-model",
        promptVersion: "meal-v1",
        schemaVersion: 1,
        analyzedAt: "2026-10-30T03:00:00Z",
      },
      items: [
        {
          id: "old-lentils",
          name: "Lentils",
          portionDescription: "One bowl",
          included: true,
          kcal: { low: 300, high: 450, basis: "photo_estimate" },
          ingredients: [{ name: "Possible oil", basis: "possible" }],
        },
        {
          id: "old-sauce",
          name: "Sauce",
          portionDescription: null,
          included: false,
          kcal: null,
          ingredients: [],
        },
      ],
    },
    evidence: {
      method: "photos",
      text: "Old source",
      quote: null,
      photos: ["data:image/jpeg;base64,ZmFrZQ=="],
      proposed: {},
      confirmed: {},
    },
  };
}
it("starts an editable meal from saved names and portions without copying past intake or AI evidence", () => {
  const previous = repeatFixture();
  const before = JSON.stringify(previous);
  j.records = [previous];
  render(<MealForm initialDate="2026-11-02" onDone={vi.fn()} />);
  fireEvent.click(screen.getByText(t("meal.recent")));
  fireEvent.click(screen.getByRole("button", { name: /Fictional lentil lunch/ }));
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue(previous.meal.title);
  expect(screen.getByLabelText(t("f.date"))).toHaveValue("2026-11-02");
  expect(screen.getByLabelText(t("f.time"))).toHaveValue("");
  expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("");
  expect(screen.getByLabelText(t("meal.kind"))).toHaveValue("lunch");
  expect(screen.getAllByLabelText(t("meal.food"))).toHaveLength(1);
  expect(screen.getByLabelText(t("meal.food"))).toHaveValue("Lentils");
  expect(screen.getByText(t("meal.repeatReady"))).toBeVisible();
  expect(j.saveRecord).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(t("meal.portion")), {
    target: { value: "A smaller bowl" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
  expect(j.saveRecord).toHaveBeenCalledOnce();
  const saved = j.saveRecord.mock.calls[0]![0] as MealRec;
  expect(saved).toMatchObject({
    id: "new-id",
    localDate: "2026-11-02",
    at: null,
    precision: "date_only",
    meal: {
      consumedFraction: null,
      photoRefs: [],
      estimateAssumptions: [],
      items: [
        {
          id: "new-id",
          name: "Lentils",
          portionDescription: "A smaller bowl",
          included: true,
          ingredients: [],
          kcal: null,
        },
      ],
    },
    evidence: { method: "manual", text: "", photos: [] },
  });
  expect(saved.meal).not.toHaveProperty("analysis");
  expect(saved.meal).not.toHaveProperty("note");
  expect(saved.meal).not.toHaveProperty("consumptionNote");
  expect(saved.evidence).not.toHaveProperty("analysis");
  expect(JSON.stringify(previous)).toBe(before);
  expect(ai.extract).not.toHaveBeenCalled();
});
it("recovers an unfinished reused meal and can reset it without changing saved history", async () => {
  const previous = repeatFixture();
  j.records = [previous];
  const view = render(<MealForm onDone={vi.fn()} />);
  fireEvent.click(screen.getByText(t("meal.recent")));
  fireEvent.click(screen.getByRole("button", { name: /Fictional lentil lunch/ }));
  await waitFor(() =>
    expect(JSON.parse(sessionStorage.getItem("mds.meal.draft.guest.new")!).repeated).toBe(true),
  );
  view.unmount();
  render(<MealForm onDone={vi.fn()} />);
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue(previous.meal.title);
  expect(screen.getByText(t("meal.repeatReady"))).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("ux.resetDraft") }));
  expect(screen.getByLabelText(t("meal.title"))).toHaveValue("");
  expect(screen.getByText(t("meal.recent"))).toBeVisible();
  expect(screen.queryByText(t("meal.repeatReady"))).not.toBeInTheDocument();
  expect(j.saveRecord).not.toHaveBeenCalled();
  expect(previous.meal.consumedFraction).toBe(0.5);
});
it.each(["editing", "recovered", "photo", "note", "demo"])(
  "does not offer recent meal reuse over %s",
  (kind) => {
    const previous = repeatFixture();
    if (kind === "demo") previous.demo = true;
    j.records = [previous];
    if (kind === "recovered")
      sessionStorage.setItem(
        "mds.meal.draft.guest.new",
        JSON.stringify({
          meal: { ...emptyMeal(), title: "Unsaved meal" },
          date: todayLocal(j.tz),
          id: "unsaved-new",
          fraction: "",
        }),
      );
    render(
      <MealForm
        onDone={vi.fn()}
        {...(kind === "editing" ? { editing: previous } : {})}
        {...(kind === "photo" ? { images: ["data:image/jpeg;base64,ZmFrZQ=="] } : {})}
        {...(kind === "note" ? { note: "Unsaved note" } : {})}
      />,
    );
    expect(screen.queryByText(t("meal.recent"))).not.toBeInTheDocument();
    expect(j.saveRecord).not.toHaveBeenCalled();
  },
);

it("locks question refresh while an IME composition has not committed any text", () => {
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  const input = screen.getByRole("textbox");
  fireEvent.compositionStart(input);
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
  expect(screen.getByText(t("mq.day"))).toBeVisible();
  fireEvent.compositionEnd(input);
  expect(screen.getByRole("button", { name: t("mq.another") })).toBeEnabled();
  expect(screen.getByText(t("mq.day"))).toBeVisible();
});

it("labels a user-chosen in-app schedule and saves the exact local date/time independently", () => {
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="reminder" setKind={vi.fn()} />);
  expect(screen.getByText(t("reminder.inApp"))).toBeVisible();
  const date = screen.getByLabelText(t("f.date"), { exact: true });
  const time = screen.getByLabelText(t("f.time"), { exact: true });
  expect(date).toHaveAccessibleDescription(t("reminder.inApp"));
  expect(time).toHaveAccessibleDescription(t("reminder.inApp"));
  fireEvent.change(date, { target: { value: "2026-11-06" } });
  fireEvent.change(time, { target: { value: "18:45" } });
  fireEvent.click(screen.getByRole("button", { name: t("f.save") }));
  expect(j.setReminder).toHaveBeenCalledExactlyOnceWith(
    instantFromLocal("2026-11-06", "18:45", j.tz),
  );
  expect(j.saveRecord).not.toHaveBeenCalled();
  expect(ai.extract).not.toHaveBeenCalled();
});

const twoMealWords = "Fictional example. Today breakfast was oats. Today lunch was lentils.";
function twoMealSuggestions() {
  return sanitizeCandidates(
    [
      {
        type: "meal",
        date: todayLocal(j.tz),
        quote: "breakfast was oats",
        meal: {
          ...emptyMeal(),
          title: "Oats breakfast",
          items: [
            {
              id: "oats",
              name: "Oats",
              included: true,
              portionDescription: null,
              kcal: null,
              ingredients: [],
            },
          ],
        },
      },
      {
        type: "meal",
        date: todayLocal(j.tz),
        quote: "lunch was lentils",
        meal: {
          ...emptyMeal(),
          title: "Lentil lunch",
          items: [
            {
              id: "lentils",
              name: "Lentils",
              included: true,
              portionDescription: null,
              kcal: null,
              ingredients: [],
            },
          ],
        },
      },
    ],
    twoMealWords,
  );
}
it.each(["unknown", "half"])(
  "names each meal and remembers %s without cycling questions after recovery",
  async (firstAnswer) => {
    j.user = { id: "A" };
    ai.extract.mockResolvedValue({ candidates: twoMealSuggestions(), reply: "" });
    const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: twoMealWords } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
    const first = await screen.findByRole("group", {
      name: t("mm.portionQuestion", { meal: "Oats breakfast" }),
    });
    fireEvent.click(
      within(first).getByRole("button", {
        name: t(firstAnswer === "half" ? "meal.half" : "unknown"),
      }),
    );
    const second = screen.getByRole("group", {
      name: t("mm.portionQuestion", { meal: "Lentil lunch" }),
    });
    fireEvent.click(within(second).getByRole("button", { name: t("unknown") }));
    expect(
      screen.queryByRole("group", { name: t("mm.portionQuestion", { meal: "Oats breakfast" }) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: t("mm.portionQuestion", { meal: "Lentil lunch" }) }),
    ).not.toBeInTheDocument();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        JSON.parse(sessionStorage.getItem("mds.momo.draft.A")!).dismissedQuestions,
      ).toHaveLength(2),
    );
    view.unmount();
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    expect(
      screen.queryByRole("group", { name: t("mm.portionQuestion", { meal: "Oats breakfast" }) }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: t("mm.portionQuestion", { meal: "Lentil lunch" }) }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 2 }) }));
    await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
    const meals = j.saveMomoBatch.mock.calls[0]![0] as MealRec[];
    expect(meals.map((record) => [record.meal.title, record.meal.consumedFraction])).toEqual([
      ["Oats breakfast", firstAnswer === "half" ? 0.5 : null],
      ["Lentil lunch", null],
    ]);
  },
);
it("asks about newly analyzed meals after a prior unknown answer", async () => {
  j.user = { id: "A" };
  ai.extract.mockResolvedValue({ candidates: twoMealSuggestions(), reply: "" });
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: twoMealWords } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
  const first = await screen.findByRole("group", {
    name: t("mm.portionQuestion", { meal: "Oats breakfast" }),
  });
  fireEvent.click(within(first).getByRole("button", { name: t("unknown") }));
  fireEvent.click(screen.getByRole("button", { name: t("momo.original") }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: twoMealWords + " Extra fictional context." },
  });
  fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
  expect(
    await screen.findByRole("group", { name: t("mm.portionQuestion", { meal: "Oats breakfast" }) }),
  ).toBeVisible();
  expect(ai.extract).toHaveBeenCalledTimes(2);
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
});

it.each([false, true])(
  "restores the input step after returning from review, with edited text %s",
  async (edited) => {
    j.user = { id: "A" };
    const original = "Fictional example. Today I weighed 78.2kg.";
    ai.extract.mockResolvedValue({
      candidates: sanitizeCandidates(
        [{ type: "weight", value: 78.2, date: todayLocal(j.tz), quote: "78.2kg" }],
        original,
      ),
      reply: "",
    });
    const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: original } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
    await screen.findByRole("button", { name: t("mm.confirm", { n: 1 }) });
    fireEvent.click(screen.getByRole("button", { name: t("momo.original") }));
    const current = edited ? "Fictional correction. Today I weighed 79.0kg." : original;
    if (edited) fireEvent.change(screen.getByRole("textbox"), { target: { value: current } });
    view.unmount();
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue(current);
    expect(
      screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) }),
    ).not.toBeInTheDocument();
    expect(ai.extract).toHaveBeenCalledOnce();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  },
);
it.each(["text", "photo"])(
  "does not reopen a legacy review whose %s no longer matches its analysis signature",
  (changed) => {
    j.user = { id: "A" };
    const original = "Fictional original 78.2kg";
    const text = changed === "text" ? "Fictional updated 79.0kg" : original;
    const images = changed === "photo" ? ["data:image/jpeg;base64,ZmFrZQ=="] : [];
    const date = todayLocal(j.tz);
    sessionStorage.setItem(
      "mds.momo.draft.A",
      JSON.stringify({
        text,
        images,
        signature: JSON.stringify([original, [], date, j.tz]),
        drafts: [
          {
            key: "legacy-suggestion",
            type: "weight",
            on: true,
            quote: "78.2kg",
            timeHint: null,
            f: { value: "78.2", date, time: "" },
            evidence: {
              method: "text",
              text: original,
              quote: "78.2kg",
              photos: [],
              proposed: { value: "78.2" },
              confirmed: {},
            },
          },
        ],
      }),
    );
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue(text);
    expect(
      screen.queryByRole("button", { name: t("mm.confirm", { n: 1 }) }),
    ).not.toBeInTheDocument();
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  },
);

it("keeps three large-photo drafts recoverable without storing their image data twice in the analysis signature", async () => {
  j.user = { id: "A" };
  const key = "mds.momo.draft.A";
  const images = ["A", "B", "C"].map((letter) => "data:image/jpeg;base64," + letter.repeat(950000));
  const date = todayLocal(j.tz);
  const text = "Fictional photo recovery fixture";
  const legacy = JSON.stringify({
    text,
    images,
    drafts: [],
    signature: JSON.stringify([text, images, date, j.tz]),
  });
  const get = Storage.prototype.getItem;
  let offered = false;
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    name: string,
  ) {
    if (name === key && !offered) {
      offered = true;
      return legacy;
    }
    return get.call(this, name);
  });
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    await waitFor(() => expect(get.call(sessionStorage, key)).not.toBeNull(), { timeout: 2000 });
    const raw = get.call(sessionStorage, key)!;
    expect(raw.length).toBeLessThan(3100000);
    const kept = JSON.parse(raw);
    expect(kept.analysisContext).toEqual({ today: date, timezone: j.tz });
    expect(kept.images.map((image: string) => image.length)).toEqual(
      images.map((image) => image.length),
    );
    expect(kept.text).toBe(text);
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  } finally {
    cleanup();
    read.mockRestore();
  }
});

it("shows a real draft-storage failure and clears the notice after a later successful write", async () => {
  j.user = { id: "A" };
  const set = Storage.prototype.setItem;
  let blocked = true;
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name: string,
    value: string,
  ) {
    if (blocked) throw new Error("store unavailable");
    return set.call(this, name, value);
  });
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Fictional draft kept on screen" },
    });
    expect(await screen.findByText(t("mc.draftRecoveryUnavailable"))).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue("Fictional draft kept on screen");
    blocked = false;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictional draft updated" } });
    await waitFor(() =>
      expect(screen.queryByText(t("mc.draftRecoveryUnavailable"))).not.toBeInTheDocument(),
    );
    expect(JSON.parse(sessionStorage.getItem("mds.momo.draft.A")!).text).toBe(
      "Fictional draft updated",
    );
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  } finally {
    cleanup();
    write.mockRestore();
  }
});
it("reuses a recovered matching analysis while preserving corrections after returning to the input step", async () => {
  j.user = { id: "A" };
  const words = "Fictional example. Today I weighed 78.2kg.";
  ai.extract.mockResolvedValue({
    candidates: sanitizeCandidates(
      [{ type: "weight", value: 78.2, date: todayLocal(j.tz), quote: "78.2kg" }],
      words,
    ),
    reply: "",
  });
  const view = render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: words } });
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
  await screen.findByRole("button", { name: t("mm.confirm", { n: 1 }) });
  fireEvent.click(screen.getByRole("button", { name: t("evidence.edit") }));
  fireEvent.change(
    screen.getByLabelText((label) => label.startsWith(t("f.value"))),
    { target: { value: "78.3" } },
  );
  fireEvent.click(screen.getByRole("button", { name: t("momo.original") }));
  view.unmount();
  render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue(words);
  fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
  fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
  expect(await screen.findByText("78.3 kg", { selector: "p" })).toBeVisible();
  expect(ai.extract).toHaveBeenCalledOnce();
  expect(j.saveMomoBatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
  await waitFor(() => expect(j.saveMomoBatch).toHaveBeenCalledOnce());
  expect(j.saveMomoBatch.mock.calls[0]![0][0]).toMatchObject({
    value: 78.3,
    evidence: {
      text: words,
      quote: "78.2kg",
      proposed: { value: "78.2" },
      confirmed: { value: "78.3" },
    },
  });
});

it("keeps an edited restart-boundary transcript and gives explicit Resume or Finish instructions", () => {
  j.user = { id: "A" };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const previous = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const phrase = (text: string) => Object.assign([{ transcript: text }], { isFinal: false });
  class FakeSpeech {
    static all: FakeSpeech[] = [];
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onresult: ((event: { results: ReturnType<typeof phrase>[] }) => void) | null = null;
    constructor() {
      FakeSpeech.all.push(this);
    }
    start() {
      this.onstart?.();
    }
    abort() {
      this.onend?.();
    }
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeech });
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Fictional typed base." } });
    fireEvent.click(screen.getByRole("button", { name: t("me.voice") }));
    const engine = FakeSpeech.all[0]!;
    act(() => engine.onresult?.({ results: [phrase("Fictional soup")] }));
    act(() => engine.onend?.());
    fireEvent.change(input, { target: { value: "Fictional correction after pause." } });
    expect(screen.getByText(t("mv.interruptedHint"))).toBeVisible();
    expect(screen.queryByText(t("mv.pauses"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("mv.resume") })).toBeEnabled();
    expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
    act(() => {
      engine.onresult?.({ results: [phrase("STALE WORDS")] });
      vi.advanceTimersByTime(1000);
    });
    expect(FakeSpeech.all).toHaveLength(1);
    expect(input).toHaveValue("Fictional correction after pause.");
    fireEvent.click(screen.getByRole("button", { name: t("mv.finish") }));
    expect(input).toHaveValue("Fictional correction after pause.");
    expect(screen.queryByRole("button", { name: t("mv.resume") })).not.toBeInTheDocument();
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  } finally {
    cleanup();
    vi.useRealTimers();
    hidden.mockRestore();
    if (previous) Object.defineProperty(window, "SpeechRecognition", previous);
    else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
  }
});

it.each(["unsupported", "blocked"] as const)(
  "offers a clear path back to writing after %s dictation",
  (issue) => {
    j.user = { id: "A" };
    const speech = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
    const webkit = Object.getOwnPropertyDescriptor(window, "webkitSpeechRecognition");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    class FakeSpeech {
      static current: FakeSpeech;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor() {
        FakeSpeech.current = this;
      }
      start() {
        this.onstart?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: issue === "unsupported" ? undefined : FakeSpeech,
    });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: undefined,
    });
    try {
      render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Fictional note retained after a voice error." },
      });
      fireEvent.click(screen.getByRole("button", { name: t("me.voice") }));
      if (issue === "blocked") act(() => FakeSpeech.current.onerror?.({ error: "not-allowed" }));
      expect(
        screen.getByText(
          t(issue === "unsupported" ? "mv.unsupported" : "mv.blocked", { finish: t("mv.finish") }),
        ),
      ).toBeVisible();
      expect(screen.queryByRole("button", { name: t("mv.resume") })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: t("mv.finish") }));
      expect(screen.getByRole("textbox")).toHaveValue(
        "Fictional note retained after a voice error.",
      );
      expect(screen.getByRole("button", { name: t("me.organize") })).toBeEnabled();
      expect(screen.getByLabelText(t("momo.photos"))).toBeEnabled();
      expect(ai.extract).not.toHaveBeenCalled();
      expect(j.saveMomoBatch).not.toHaveBeenCalled();
    } finally {
      cleanup();
      hidden.mockRestore();
      if (speech) Object.defineProperty(window, "SpeechRecognition", speech);
      else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
      if (webkit) Object.defineProperty(window, "webkitSpeechRecognition", webkit);
      else delete (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"];
    }
  },
);

it("rotates empty suggestions every five seconds with pause, resume and manual refresh", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.day"));
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.feeling"));
    fireEvent.click(screen.getByRole("button", { name: t("mq.pause") }));
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.feeling"));
    fireEvent.click(screen.getByRole("button", { name: t("mq.another") }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.food"));
    fireEvent.click(screen.getByRole("button", { name: t("mq.play") }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.treatment"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(ai.extract).not.toHaveBeenCalled();
    expect(j.saveMomoBatch).not.toHaveBeenCalled();
  } finally {
    cleanup();
    hidden.mockRestore();
    vi.useRealTimers();
  }
});

it.each(["typing", "composition", "photo", "voice"] as const)(
  "keeps the timed question fixed during %s",
  (interaction) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const previous = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
    class FakeSpeech {
      onstart: (() => void) | null = null;
      start() {
        this.onstart?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeech });
    try {
      render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
      if (interaction === "typing")
        fireEvent.change(screen.getByRole("textbox"), { target: { value: " " } });
      if (interaction === "composition") fireEvent.compositionStart(screen.getByRole("textbox"));
      if (interaction === "photo") {
        photo.shrink.mockReturnValue(new Promise(() => {}));
        fireEvent.change(screen.getByLabelText(t("momo.photos")), {
          target: { files: [new File(["fixture"], "fictional.jpg", { type: "image/jpeg" })] },
        });
      }
      if (interaction === "voice")
        fireEvent.click(screen.getByRole("button", { name: t("me.voice") }));
      act(() => vi.advanceTimersByTime(15000));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.day"));
      expect(screen.getByRole("button", { name: t("mq.another") })).toBeDisabled();
      expect(ai.extract).not.toHaveBeenCalled();
    } finally {
      cleanup();
      hidden.mockRestore();
      vi.useRealTimers();
      if (previous) Object.defineProperty(window, "SpeechRecognition", previous);
      else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
    }
  },
);

it("pauses timed questions in a hidden tab and waits five fresh seconds on return", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  let isHidden = false;
  const hidden = vi.spyOn(document, "hidden", "get").mockImplementation(() => isHidden);
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    act(() => vi.advanceTimersByTime(4000));
    act(() => {
      isHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.day"));
    act(() => {
      isHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.day"));
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.feeling"));
  } finally {
    cleanup();
    hidden.mockRestore();
    vi.useRealTimers();
  }
});

it("starts suggestions paused for reduced motion while retaining explicit playback", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const original = window.matchMedia;
  const motion = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...original(query),
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
  try {
    render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
    expect(screen.getByRole("button", { name: t("mq.play") })).toBeVisible();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.day"));
    fireEvent.click(screen.getByRole("button", { name: t("mq.play") }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t("mq.feeling"));
  } finally {
    cleanup();
    hidden.mockRestore();
    motion.mockRestore();
    vi.useRealTimers();
  }
});

it.each(["success", "error", "cancel"] as const)(
  "rotates truthful loading copy only while a request is pending, then stops on %s",
  async (outcome) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    j.user = { id: "A" };
    let finish!: (value: unknown) => void;
    ai.extract.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const text = "Fictional example. Today I weighed 78.2kg.";
    try {
      render(<MomoSheet inline onDone={vi.fn()} onManual={vi.fn()} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
      fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
      fireEvent.click(screen.getByRole("button", { name: t("me.organize") }));
      expect(screen.getByText(t("mb.reading"))).toBeVisible();
      act(() => vi.advanceTimersByTime(3500));
      expect(screen.getByText(t("mb.details"))).toBeVisible();
      expect(ai.extract).toHaveBeenCalledOnce();
      expect(ai.extract.mock.calls[0]![0].data.text).toBe(text);
      expect(j.saveMomoBatch).not.toHaveBeenCalled();
      if (outcome === "cancel")
        fireEvent.click(screen.getByRole("button", { name: t("ai.keepEditing") }));
      await act(async () =>
        finish(
          outcome === "error"
            ? { error: "service", candidates: [], reply: "" }
            : {
                candidates: sanitizeCandidates(
                  [{ type: "weight", value: 78.2, date: todayLocal(j.tz), quote: "78.2kg" }],
                  text,
                ),
                reply: "",
              },
        ),
      );
      act(() => vi.advanceTimersByTime(15000));
      expect(screen.queryByText(t("mb.reading"))).not.toBeInTheDocument();
      expect(screen.queryByText(t("mb.details"))).not.toBeInTheDocument();
      if (outcome === "success")
        expect(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) })).toBeVisible();
      else expect(screen.getByRole("textbox")).toHaveValue(text);
      expect(j.saveMomoBatch).not.toHaveBeenCalled();
    } finally {
      cleanup();
      hidden.mockRestore();
      vi.useRealTimers();
    }
  },
);
