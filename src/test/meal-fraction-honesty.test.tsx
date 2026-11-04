import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MealForm } from "@/components/app/MealForm";
import { MomoSheet } from "@/components/app/MomoSheet";
import { RecordRow } from "@/components/app/ui";
import { emptyMeal, type MealDetails } from "@/lib/meals";
import { CUSTOM_MEAL_FRACTION, parseMealFractionInput } from "@/lib/meal-fraction";
import { draftToEntry, type Draft } from "@/lib/momo-drafts";
import { isRecoveredDrafts } from "@/lib/momo-review";
import type { MealRec } from "@/lib/journal";
import { t, setLocale } from "@/lib/i18n";
import { todayLocal } from "@/lib/dates";

const ai = vi.hoisted(() => ({ extract: vi.fn() }));
const journal = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: null as { id: string } | null,
  tz: "UTC",
  settings: { showMomo: true },
  records: [],
  purchases: [],
  inventory: { lots: [] },
  newId: vi.fn(() => "meal-id"),
  saveRecord: vi.fn(),
  saveMomoBatch: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => journal }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => ai.extract }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/lib/momo-tasks.functions", () => ({ analyzeMeal: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/PhotoImg", () => ({ PhotoImg: () => null }));
vi.mock("@/components/app/AppFeel", async (original) => ({
  ...(await original<typeof import("@/components/app/AppFeel")>()),
  celebrateSave: vi.fn(),
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const meal = (): MealDetails => ({
  ...emptyMeal(),
  title: "Fictional lunch",
  items: [
    {
      id: "rice",
      name: "Rice",
      included: true,
      portionDescription: null,
      ingredients: [],
      kcal: { low: 300, high: 400, basis: "photo_estimate" },
    },
  ],
});
const record = (details = meal()): MealRec => ({
  id: "meal-id",
  type: "meal",
  localDate: "2026-11-03",
  at: null,
  precision: "date_only",
  source: "manual_text",
  createdAt: "2026-11-03T12:00:00Z",
  meal: details,
});
const draft = (details = meal()): Draft => ({
  key: "meal-id",
  type: "meal",
  on: true,
  quote: "Rice",
  timeHint: null,
  f: { meal: JSON.stringify(details), date: "2026-11-03", time: "" },
});
const selectPortion = (value: string) =>
  fireEvent.change(screen.getByLabelText(t("meal.eaten")), { target: { value } });
const enterFraction = (value: string) =>
  fireEvent.change(screen.getByLabelText(t("meal.fraction")), { target: { value } });
function openMomo(initial = draft()) {
  sessionStorage.setItem(
    `mds.momo.draft.${journal.user?.id ?? "guest"}`,
    JSON.stringify({
      text: "Fictional rice lunch",
      images: [],
      drafts: [initial],
      usedVoice: false,
      analysisContext: { today: todayLocal(journal.tz), timezone: journal.tz },
    }),
  );
  const view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
  return view;
}
function storedMomo(): Draft {
  fireEvent(window, new Event("pagehide"));
  return JSON.parse(sessionStorage.getItem(`mds.momo.draft.${journal.user?.id ?? "guest"}`)!)
    .drafts[0];
}
const saveMomo = () =>
  fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
const saveManual = () => fireEvent.click(screen.getByRole("button", { name: t("ux.saveMeal") }));
beforeEach(() => {
  journal.user = null;
  setLocale("ko");
  sessionStorage.clear();
  vi.clearAllMocks();
  journal.snapshot.mockReturnValue({ records: [], purchases: [], settings: journal.settings });
});
afterEach(() => {
  cleanup();
  setLocale("ko");
});

describe("custom amount guidance", () => {
  it.each(["ko", "en", "fr"] as const)(
    "describes incomplete custom input in %s and clears guidance when repaired",
    (locale) => {
      setLocale(locale);
      render(<MealForm editing={record()} onDone={vi.fn()} />);
      expect(screen.queryByText(t("meal.fractionInvalid"))).not.toBeInTheDocument();
      selectPortion("other");
      const fraction = screen.getByLabelText(t("meal.fraction"));
      expect(fraction).toHaveAttribute("aria-invalid", "true");
      expect(fraction).toHaveAccessibleDescription(t("meal.fractionInvalid"));
      const errorId = fraction.getAttribute("aria-describedby")!;
      expect(document.getElementById(errorId)).toHaveTextContent(t("meal.fractionInvalid"));
      enterFraction("1.1");
      expect(fraction).toHaveAccessibleDescription(t("meal.fractionInvalid"));
      expect(fraction).toHaveAttribute("aria-describedby", errorId);
      enterFraction("0.25");
      expect(fraction).not.toHaveAttribute("aria-invalid");
      expect(fraction).not.toHaveAttribute("aria-describedby");
      expect(screen.queryByText(t("meal.fractionInvalid"))).not.toBeInTheDocument();
      enterFraction("");
      expect(fraction).toHaveAccessibleDescription(t("meal.fractionInvalid"));
      selectPortion("");
      expect(screen.queryByLabelText(t("meal.fraction"))).not.toBeInTheDocument();
      expect(screen.queryByText(t("meal.fractionInvalid"))).not.toBeInTheDocument();
    },
  );

  it("gives Momo the same localized invalid-input target and clears it for a preset", async () => {
    openMomo();
    selectPortion("other");
    const fraction = screen.getByLabelText(t("meal.fraction"));
    expect(fraction).toHaveAttribute("aria-invalid", "true");
    expect(fraction).toHaveAccessibleDescription(t("meal.fractionInvalid"));
    expect(
      screen
        .getByRole("group", { name: t("type.meal") })
        .querySelector('input[aria-invalid="true"]'),
    ).toBe(fraction);
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    await waitFor(() => expect(fraction).toHaveFocus());
    expect(screen.queryByText(t("evidence.clarify"))).not.toBeInTheDocument();
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    selectPortion("0.5");
    expect(screen.queryByText(t("meal.fractionInvalid"))).not.toBeInTheDocument();
    expect(screen.queryByLabelText(t("meal.fraction"))).not.toBeInTheDocument();
  });
});

describe("manual consumed amount", () => {
  it("starts Other blank, rejects save, and accepts only an entered value", () => {
    render(<MealForm editing={record()} onDone={vi.fn()} />);
    selectPortion("other");
    expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("other");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(null);
    expect(screen.getByText(t("meal.picturedEstimate"))).toBeVisible();
    expect(screen.queryByText(t("meal.consumedEstimate"))).not.toBeInTheDocument();
    saveManual();
    expect(journal.saveRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(t("meal.invalid"));
    enterFraction("0.25");
    saveManual();
    expect(journal.saveRecord).toHaveBeenCalledOnce();
    expect(journal.saveRecord.mock.calls[0]![0].meal.consumedFraction).toBe(0.25);
  });

  it("keeps a cleared custom amount pending across reopen until Unknown is deliberate", () => {
    const editing = record({ ...meal(), consumedFraction: 0.75 });
    const view = render(<MealForm editing={editing} onDone={vi.fn()} />);
    enterFraction("");
    expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("other");
    view.unmount();
    render(<MealForm editing={editing} onDone={vi.fn()} />);
    expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("other");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(null);
    saveManual();
    expect(journal.saveRecord).not.toHaveBeenCalled();
    selectPortion("");
    expect(screen.queryByLabelText(t("meal.fraction"))).not.toBeInTheDocument();
    saveManual();
    expect(journal.saveRecord.mock.calls[0]![0].meal.consumedFraction).toBeNull();
    expect(editing.meal.consumedFraction).toBe(0.75);
  });

  it("accepts a valid custom fraction beyond hundredths without browser step rejection", () => {
    render(<MealForm editing={record()} onDone={vi.fn()} />);
    selectPortion("other");
    enterFraction("0.125");
    expect(screen.getByLabelText(t("meal.fraction"))).toBeValid();
    saveManual();
    expect(journal.saveRecord.mock.calls[0]![0].meal.consumedFraction).toBe(0.125);
  });

  it.each(["0", "1", "0.5"])("accepts the explicit boundary/preset amount %s", (value) => {
    render(<MealForm editing={record()} onDone={vi.fn()} />);
    selectPortion("other");
    enterFraction(value);
    saveManual();
    expect(journal.saveRecord.mock.calls[0]![0].meal.consumedFraction).toBe(Number(value));
  });
});

describe("Momo consumed amount", () => {
  it("keeps Other blank without converting it to Unknown or a numeric amount", async () => {
    openMomo();
    selectPortion("other");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(null);
    expect(storedMomo().mealFractionInput).toBe(CUSTOM_MEAL_FRACTION);
    expect(JSON.parse(storedMomo().f["meal"]!).consumedFraction).toBeNull();
    expect(draftToEntry(storedMomo(), "meal-id", "UTC", "2026-11-03")).toEqual({ error: "meal" });
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    enterFraction("0.25");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(0.25);
    saveMomo();
    await waitFor(() => expect(journal.saveMomoBatch).toHaveBeenCalledOnce());
    expect(journal.saveMomoBatch.mock.calls[0]![0][0].meal.consumedFraction).toBe(0.25);
    expect(journal.saveMomoBatch.mock.calls[0]![0][0]).not.toHaveProperty("mealFractionInput");
  });

  it("recovers a cleared custom input, allows other edits, and saves Unknown only after selection", async () => {
    const view = openMomo(draft({ ...meal(), consumedFraction: 0.75 }));
    enterFraction("");
    fireEvent.change(screen.getByLabelText(t("meal.title")), { target: { value: "Edited lunch" } });
    const persisted = storedMomo();
    expect(isRecoveredDrafts([persisted])).toBe(true);
    expect(persisted.mealFractionInput).toBe(CUSTOM_MEAL_FRACTION);
    view.unmount();
    render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
    expect(screen.getByLabelText(t("meal.title"))).toHaveValue("Edited lunch");
    expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("other");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    selectPortion("");
    expect(storedMomo().mealFractionInput).toBe("");
    saveMomo();
    await waitFor(() => expect(journal.saveMomoBatch).toHaveBeenCalledOnce());
    expect(journal.saveMomoBatch.mock.calls[0]![0][0].meal.consumedFraction).toBeNull();
  });

  it.each(["-0.1", "1.1"])("keeps invalid custom %s editable after recovery", (value) => {
    const view = openMomo();
    selectPortion("other");
    enterFraction(value);
    expect(storedMomo().mealFractionInput).toBe(value);
    view.unmount();
    render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(Number(value));
    expect(draftToEntry(storedMomo(), "meal-id", "UTC", "2026-11-03")).toEqual({ error: "meal" });
    enterFraction("0.3");
    expect(draftToEntry(storedMomo(), "meal-id", "UTC", "2026-11-03")).toHaveProperty(
      "record.meal.consumedFraction",
      0.3,
    );
  });

  it.each([
    ["1", "meal.all"],
    ["0.5", "meal.half"],
    ["", "unknown"],
  ] as const)(
    "keeps the optional %s answer synchronized with custom input",
    async (value, label) => {
      openMomo();
      selectPortion("other");
      selectPortion("");
      const question = screen.getByRole("group", {
        name: t("mm.portionQuestion", { meal: "Fictional lunch" }),
      });
      fireEvent.click(within(question).getByRole("button", { name: t(label) }));
      expect(storedMomo().mealFractionInput).toBe(value);
      expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue(value);
      saveMomo();
      await waitFor(() => expect(journal.saveMomoBatch).toHaveBeenCalledOnce());
      expect(journal.saveMomoBatch.mock.calls[0]![0][0].meal.consumedFraction).toBe(
        value === "" ? null : Number(value),
      );
    },
  );

  it("retains a pending custom input when reusing the cached analysis after returning to capture", () => {
    journal.user = { id: "A" };
    openMomo();
    selectPortion("other");
    fireEvent.click(screen.getByRole("button", { name: t("momo.original") }));
    fireEvent.click(screen.getByRole("checkbox", { name: t("mc.consent") }));
    fireEvent.click(screen.getByRole("button", { name: t("mc.organize") }));
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
    expect(screen.getByLabelText(t("meal.eaten"))).toHaveValue("other");
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(null);
    expect(storedMomo().mealFractionInput).toBe(CUSTOM_MEAL_FRACTION);
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it("recovers legacy drafts but rejects malformed new input metadata", () => {
    expect(isRecoveredDrafts([draft()])).toBe(true);
    expect(isRecoveredDrafts([{ ...draft(), mealFractionInput: 0.5 }])).toBe(false);
    expect(
      draftToEntry(draft({ ...meal(), consumedFraction: 0.5 }), "meal-id", "UTC", "2026-11-03"),
    ).toHaveProperty("record.meal.consumedFraction", 0.5);
  });
});

describe("saved meal range labels", () => {
  it.each([null, 0.5])("labels the partial %s range beside the calories", (fraction) => {
    const details = meal();
    details.consumedFraction = fraction;
    details.items.push({ ...details.items[0]!, id: "soup", name: "Soup", kcal: null });
    render(<RecordRow r={record(details)} onEdit={vi.fn()} />);
    const range = screen.getByText(new RegExp(fraction === null ? "300–400 kcal" : "150–200 kcal"));
    expect(range).toHaveTextContent(t("meal.partial"));
    expect(range).toHaveTextContent(
      t(fraction === null ? "meal.picturedEstimate" : "meal.consumedEstimate"),
    );
  });

  it.each(["all-known", "excluded-unknown"])("does not label %s totals as partial", (kind) => {
    const details = meal();
    if (kind === "excluded-unknown")
      details.items.push({
        ...details.items[0]!,
        id: "soup",
        name: "Soup",
        kcal: null,
        included: false,
      });
    render(<RecordRow r={record(details)} onEdit={vi.fn()} />);
    expect(screen.getByText(/300–400 kcal/)).not.toHaveTextContent(t("meal.partial"));
  });
});

describe("fraction parsing", () => {
  it.each(["other", " ", "NaN", "Infinity", "-0.1", "1.1"])(
    "rejects %s without inventing zero",
    (value) => {
      expect(Number.isNaN(parseMealFractionInput(value))).toBe(true);
    },
  );
  it("distinguishes Unknown from an explicit zero", () => {
    expect(parseMealFractionInput("")).toBeNull();
    expect(parseMealFractionInput("0")).toBe(0);
  });
});
