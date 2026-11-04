import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MomoSheet } from "@/components/app/MomoSheet";
import { draftMealSchema, emptyMeal, mealSchema, mealTotals, type MealDetails } from "@/lib/meals";
import type { Draft } from "@/lib/momo-drafts";
import { t } from "@/lib/i18n";

const ai = vi.hoisted(() => ({ extract: vi.fn() }));
const journal = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: null,
  tz: "UTC",
  settings: { showMomo: true },
  records: [],
  purchases: [],
  inventory: { lots: [] },
  newId: vi.fn(),
  saveMomoBatch: vi.fn(),
  snapshot: vi.fn(),
  undoFor: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => journal }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => ai.extract }));
vi.mock("@/lib/momo.functions", () => ({ extractWithMomo: vi.fn() }));
vi.mock("@/components/app/AppShell", () => ({ useQuickAdd: () => vi.fn() }));
vi.mock("@/components/app/PhotoImg", () => ({
  PhotoImg: ({ src, alt = "" }: { src: string; alt?: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/app/AppFeel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/app/AppFeel")>()),
  celebrateSave: vi.fn(),
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const photo = "data:image/jpeg;base64,ZmljdGlvbmFs";
const source = "Fictional meal example, rice and vegetables.";
const meal = (): MealDetails => ({
  ...emptyMeal(),
  title: "Fictional lunch",
  photoRefs: [photo],
  items: [
    {
      id: "food-1",
      name: "Rice",
      portionDescription: null,
      ingredients: [{ name: "Vegetables", basis: "possible" }],
      kcal: { low: 300, high: 450, basis: "photo_estimate" },
      included: true,
    },
  ],
});
function draft(details = meal()): Draft {
  const fields = { meal: JSON.stringify(details), date: "2026-11-03", time: "" };
  return {
    key: "fictional-meal",
    type: "meal",
    on: true,
    quote: "rice and vegetables",
    timeHint: null,
    f: fields,
    evidence: {
      method: "mixed",
      text: source,
      quote: "rice and vegetables",
      photos: [photo],
      attribution: { status: "linked", linkedPhotoIndices: [0] },
      proposed: { ...fields },
      confirmed: {},
    },
  };
}
function openEditor(details = meal()) {
  const original = draft(details);
  sessionStorage.setItem(
    "mds.momo.draft.guest",
    JSON.stringify({ text: source, images: [photo], drafts: [original], usedVoice: false }),
  );
  const view = render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
  const card = screen.getByText(details.title, { selector: "p" }).closest("li")!;
  fireEvent.click(card.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
  return { view, original, card };
}
function storedDraft(): Draft {
  fireEvent(window, new Event("pagehide"));
  return JSON.parse(sessionStorage.getItem("mds.momo.draft.guest")!).drafts[0];
}
function storedMeal(): MealDetails {
  return draftMealSchema.parse(JSON.parse(storedDraft().f["meal"]!));
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  let nextId = 1;
  journal.newId.mockImplementation(() => `added-food-${nextId++}`);
  journal.snapshot.mockReturnValue({ records: [], purchases: [], settings: journal.settings });
});
afterEach(cleanup);

describe("Momo meal edits stay repairable until explicit save", () => {
  it("already supports blank titles, new food names and unfinished energy without saving", () => {
    openEditor();
    fireEvent.change(screen.getByLabelText(t("meal.title")), { target: { value: "" } });
    expect(screen.getByLabelText(t("meal.title"))).toHaveValue("");
    fireEvent.change(screen.getByLabelText(t("meal.title")), {
      target: { value: "Corrected lunch" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("meal.addFood") }));
    const foods = screen.getAllByLabelText(t("meal.food"));
    expect(foods).toHaveLength(2);
    expect(foods[1]).toHaveValue("");
    fireEvent.change(foods[1]!, { target: { value: "Soup" } });
    const secondFood = foods[1]!.closest("li")!;
    fireEvent.click(
      within(secondFood).getByText(t("meal.energyKnown"), { selector: "span" }).closest("summary")!,
    );
    fireEvent.click(within(secondFood).getByRole("checkbox", { name: t("meal.energyKnown") }));
    expect(within(secondFood).getByLabelText(`${t("meal.low")} kcal`)).toHaveValue(null);
    expect(within(secondFood).getByLabelText(`${t("meal.high")} kcal`)).toHaveValue(null);
    expect(Number.isNaN(storedMeal().items[1]!.kcal!.low)).toBe(true);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it.each([
    ["title", "meal.title"],
    ["food", "meal.food"],
    ["portion", "meal.portion"],
  ] as const)("keeps an over-limit %s editable and preserves it across reopen", (_name, key) => {
    const { view } = openEditor();
    const value = "x".repeat(301);
    fireEvent.change(screen.getByLabelText(t(key)), { target: { value } });
    expect(screen.getByLabelText(t(key))).toHaveValue(value);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    view.unmount();
    render(<MomoSheet onDone={vi.fn()} onManual={vi.fn()} />);
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-draft-edit]")!);
    expect(screen.getByLabelText(t(key))).toHaveValue(value);
    fireEvent.change(screen.getByLabelText(t(key)), { target: { value: "Repaired" } });
    expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
  });

  it.each([" ", Array.from({ length: 31 }, (_, i) => `Ingredient ${i}`).join("\n")])(
    "keeps unfinished or over-limit ingredient edits available for repair",
    (value) => {
      openEditor();
      fireEvent.click(screen.getByText(t("meal.ingredients"), { selector: "summary" }));
      fireEvent.change(screen.getByRole("textbox", { name: t("meal.ingredients") }), {
        target: { value },
      });
      expect(screen.getByRole("textbox", { name: t("meal.ingredients") })).toHaveValue(value);
      expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
      fireEvent.change(screen.getByRole("textbox", { name: t("meal.ingredients") }), {
        target: { value: "Rice" },
      });
      expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
    },
  );

  it("lets a user remove a food added beyond the save limit", () => {
    const details = meal();
    details.items = Array.from({ length: 30 }, (_, i) => ({
      ...details.items[0]!,
      id: `food-${i}`,
      name: `Food ${i}`,
    }));
    openEditor(details);
    fireEvent.click(screen.getByRole("button", { name: t("meal.addFood") }));
    expect(screen.getAllByLabelText(t("meal.food"))).toHaveLength(31);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    const last = screen.getAllByLabelText(t("meal.food"))[30]!.closest("li")!;
    fireEvent.click(within(last).getByRole("button"));
    expect(screen.getAllByLabelText(t("meal.food"))).toHaveLength(30);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
  });

  it("preserves an ingredient newline while typing, then lets the user finish or clear it", () => {
    openEditor();
    fireEvent.click(screen.getByText(t("meal.ingredients"), { selector: "summary" }));
    const ingredients = screen.getByRole("textbox", { name: t("meal.ingredients") });
    fireEvent.change(ingredients, { target: { value: "Rice\n" } });
    expect(ingredients).toHaveValue("Rice\n");
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    fireEvent.change(ingredients, { target: { value: "Rice\nVegetables" } });
    expect(ingredients).toHaveValue("Rice\nVegetables");
    expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
    fireEvent.change(ingredients, { target: { value: "" } });
    expect(storedMeal().items[0]!.ingredients).toEqual([]);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
  });

  it("drops only blank edited ingredient rows on blur before an explicit save click", async () => {
    const { original } = openEditor();
    fireEvent.click(screen.getByText(t("meal.ingredients"), { selector: "summary" }));
    const ingredients = screen.getByRole("textbox", { name: t("meal.ingredients") });
    fireEvent.focus(ingredients);
    fireEvent.change(ingredients, { target: { value: "Rice\n \nVegetables\n" } });
    expect(ingredients).toHaveValue("Rice\n \nVegetables\n");
    const save = screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) });
    // A real pointer click moves focus before click; fireEvent.click alone does not.
    fireEvent.mouseDown(save);
    fireEvent.blur(ingredients, { relatedTarget: save });
    fireEvent.focus(save, { relatedTarget: ingredients });
    expect(ingredients).toHaveValue("Rice\nVegetables");
    expect(save).toHaveAccessibleName(t("mm.confirm", { n: 1 }));
    expect(storedMeal().items[0]!.ingredients).toEqual([
      { name: "Rice", basis: "user_provided" },
      { name: "Vegetables", basis: "user_provided" },
    ]);
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    fireEvent.mouseUp(save);
    fireEvent.click(save);
    await waitFor(() => expect(journal.saveMomoBatch).toHaveBeenCalledOnce());
    const [records] = journal.saveMomoBatch.mock.calls[0]!;
    expect(records[0].meal.items[0].ingredients).toEqual([
      { name: "Rice", basis: "user_provided" },
      { name: "Vegetables", basis: "user_provided" },
    ]);
    expect(records[0].evidence.proposed).toEqual(original.evidence!.proposed);
    expect(records[0].evidence.photos).toEqual(original.evidence!.photos);
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it("does not alter untouched ingredient names or provenance on blur", () => {
    const details = meal();
    details.items[0]!.ingredients = [
      { name: " Rice ", basis: "label" },
      { name: "Vegetables", basis: "possible" },
    ];
    openEditor(details);
    fireEvent.click(screen.getByText(t("meal.ingredients"), { selector: "summary" }));
    const ingredients = screen.getByRole("textbox", { name: t("meal.ingredients") });
    fireEvent.focus(ingredients);
    fireEvent.blur(ingredients);
    expect(ingredients).toHaveValue(" Rice \nVegetables");
    expect(storedMeal().items[0]!.ingredients).toEqual(details.items[0]!.ingredients);
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
  });

  it("keeps a large multiline paste repairable without trimming substantive invalid input", () => {
    openEditor();
    fireEvent.click(screen.getByText(t("meal.ingredients"), { selector: "summary" }));
    const ingredients = screen.getByRole("textbox", { name: t("meal.ingredients") });
    const largePaste = Array.from({ length: 2000 }, (_, i) => `Pasted ingredient ${i}`).join("\n");
    fireEvent.change(ingredients, { target: { value: largePaste } });
    fireEvent.blur(ingredients);
    expect(ingredients).toHaveValue(largePaste);
    expect(storedMeal().items[0]!.ingredients).toHaveLength(2000);
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    fireEvent.change(ingredients, { target: { value: "x".repeat(301) + "\n" } });
    fireEvent.blur(ingredients);
    expect(ingredients).toHaveValue("x".repeat(301));
    expect(mealSchema.safeParse(storedMeal()).success).toBe(false);
    fireEvent.change(ingredients, { target: { value: "Rice\n" } });
    fireEvent.blur(ingredients);
    expect(ingredients).toHaveValue("Rice");
    expect(mealSchema.safeParse(storedMeal()).success).toBe(true);
  });

  it("repairs an invalid fraction without claiming consumption, then saves once with the original evidence", async () => {
    const { original } = openEditor();
    fireEvent.change(screen.getByLabelText(t("meal.eaten")), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText(t("meal.fraction")), { target: { value: "2" } });
    expect(screen.getByLabelText(t("meal.fraction"))).toHaveValue(2);
    expect(mealTotals(storedMeal()).consumed).toBeNull();
    const editor = screen.getByRole("group", { name: t("type.meal") });
    expect(editor).toHaveAttribute("aria-invalid", "true");
    const errorId = editor.getAttribute("aria-describedby")!;
    expect(document.getElementById(errorId)).toHaveTextContent(
      t("mc.checkField", { field: t("type.meal") }),
    );
    fireEvent.click(screen.getByRole("button", { name: t("mc.checkSelected", { n: 1 }) }));
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(t("meal.eaten")), { target: { value: "" } });
    expect(storedMeal().consumedFraction).toBeNull();
    expect(editor).not.toHaveAttribute("aria-invalid");
    expect(storedDraft().evidence).toEqual(original.evidence);
    const confirmed = storedDraft().f;
    expect(journal.saveMomoBatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("mm.confirm", { n: 1 }) }));
    await waitFor(() => expect(journal.saveMomoBatch).toHaveBeenCalledOnce());
    const [records, purchases, owner] = journal.saveMomoBatch.mock.calls[0]!;
    expect(purchases).toEqual([]);
    expect(owner).toBeNull();
    expect(records[0].meal).toMatchObject({ consumedFraction: null, photoRefs: [photo] });
    expect(records[0].evidence).toMatchObject({
      ...original.evidence,
      confirmed,
    });
    expect(ai.extract).not.toHaveBeenCalled();
  });
});

describe("draft totals never claim invalid estimates", () => {
  it.each([-0.1, 2, NaN, Infinity])("keeps invalid eaten fraction %s unknown", (fraction) => {
    expect(mealTotals({ ...meal(), consumedFraction: fraction })).toEqual({
      pictured: { low: 300, high: 450 },
      partial: false,
      consumed: null,
    });
  });
  it("does not display an out-of-range food estimate as a valid total", () => {
    const details = meal();
    details.items[0]!.kcal = { low: 300, high: 10001, basis: "user_entered" };
    expect(mealTotals(details)).toEqual({ pictured: null, partial: true, consumed: null });
  });
});

it("retains strict source and structural checks while recovering unfinished meal edits", () => {
  for (const details of [
    { ...meal(), photoRefs: ["https://untrusted.invalid/photo.jpg"] },
    { ...meal(), analysis: { model: "", promptVersion: "invalid" } },
    { ...meal(), items: "not an array" },
    { ...meal(), items: [{ ...meal().items[0], included: "yes" }] },
    {
      ...meal(),
      items: [{ ...meal().items[0], ingredients: [{ name: "Rice", basis: "invented" }] }],
    },
  ])
    expect(draftMealSchema.safeParse(details).success).toBe(false);
});
