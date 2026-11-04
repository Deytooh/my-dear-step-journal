import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EntrySheet } from "@/components/app/EntrySheet";
import { DialogTitle } from "@/components/ui/dialog";
import { SourceEvidence } from "@/components/app/SourceEvidence";
import { photoUrl } from "@/lib/cloud-sync";
import { t } from "@/lib/i18n";
import { emptyMeal } from "@/lib/meals";
import type { Evidence } from "@/lib/journal";
const account = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null }));
vi.mock("@/lib/journal", () => ({ useJournal: () => account }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn(), clearPhotoCache: vi.fn() }));
const evidence: Evidence = {
  method: "mixed",
  text: "Fictional original: 78.2kg with a receipt.",
  quote: "78.2kg",
  photos: ["localphoto:A:fictional-photo"],
  proposed: { value: "78.2" },
  confirmed: { value: "78.3" },
};
beforeEach(() => {
  account.user = { id: "A" };
  vi.mocked(photoUrl).mockReset();
  vi.mocked(photoUrl).mockResolvedValue("data:image/png;base64,ZmFrZQ==");
});
afterEach(cleanup);
const openSources = () =>
  fireEvent.click(screen.getByText(t("momo.source") + " · " + t("evidence.mixed")));
it("opens a labeled enlarged source photo and restores focus when closed", async () => {
  const before = JSON.stringify(evidence);
  render(<SourceEvidence evidence={evidence} />);
  openSources();
  expect(screen.getByText(evidence.text)).toBeVisible();
  expect(screen.getByText(evidence.quote!)).toBeVisible();
  const trigger = screen.getByRole("button", { name: t("photo.viewSource", { n: 1 }) });
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: t("photo.viewSource", { n: 1 }) })).toBeVisible();
  expect(await screen.findByRole("img", { name: t("photo.viewSource", { n: 1 }) })).toHaveAttribute(
    "src",
    "data:image/png;base64,ZmFrZQ==",
  );
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(JSON.stringify(evidence)).toBe(before);
});
it("closes an open source photo when the account changes and ignores an old resolution", async () => {
  let finish!: (url: string) => void;
  vi.mocked(photoUrl).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<SourceEvidence evidence={evidence} />);
  openSources();
  fireEvent.click(screen.getByRole("button", { name: t("photo.viewSource", { n: 1 }) }));
  expect(screen.getByRole("dialog")).toBeVisible();
  account.user = { id: "B" };
  vi.mocked(photoUrl).mockResolvedValue(null);
  view.rerender(<SourceEvidence evidence={evidence} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => finish("data:image/png;base64,cHJpb3ItYWNjb3VudA=="));
  expect(
    document.querySelector('img[src="data:image/png;base64,cHJpb3ItYWNjb3VudA=="]'),
  ).toBeNull();
});
it("keeps the viewer closable if a private source is unavailable", async () => {
  vi.mocked(photoUrl).mockRejectedValue(new Error("unavailable"));
  render(<SourceEvidence evidence={evidence} />);
  openSources();
  fireEvent.click(screen.getByRole("button", { name: t("photo.viewSource", { n: 1 }) }));
  await waitFor(() =>
    expect(screen.getAllByRole("img", { name: t("photo.unavailable") }).length).toBeGreaterThan(0),
  );
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("dismisses only the enlarged photo with Escape when nested inside the entry editor", async () => {
  const close = vi.fn();
  render(
    <EntrySheet open onOpenChange={close} header={<DialogTitle>Fictional editor</DialogTitle>}>
      <SourceEvidence evidence={evidence} />
    </EntrySheet>,
  );
  openSources();
  const trigger = screen.getByRole("button", { name: t("photo.viewSource", { n: 1 }) });
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: t("photo.viewSource", { n: 1 }) })).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: t("photo.viewSource", { n: 1 }) }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("dialog", { name: "Fictional editor" })).toBeVisible();
  expect(close).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});

it.each([0, 0.5])(
  "shows a corrected eaten fraction of %s and excluded foods in meal source history",
  (fraction) => {
    const proposed = {
      ...emptyMeal(),
      title: "Fictional meal",
      items: [
        {
          id: "rice",
          name: "Fictional rice",
          portionDescription: "One fictional bowl",
          included: true,
          kcal: { low: 400, high: 500, basis: "photo_estimate" },
          ingredients: [{ name: "Fictional rice ingredient", basis: "visible_estimate" }],
        },
        {
          id: "sauce",
          name: "Fictional sauce",
          portionDescription: null,
          included: true,
          kcal: null,
          ingredients: [],
        },
      ],
    };
    const confirmed = {
      ...proposed,
      consumedFraction: fraction,
      note: "Fictional corrected note",
      items: proposed.items.map((item) =>
        item.id === "sauce" ? { ...item, included: false } : item,
      ),
    };
    const mealSource: Evidence = {
      method: "text",
      text: "Fictional meal source",
      quote: null,
      photos: [],
      proposed: { meal: JSON.stringify(proposed) },
      confirmed: { meal: JSON.stringify(confirmed) },
    };
    const before = JSON.stringify(mealSource);
    render(<SourceEvidence evidence={mealSource} />);
    fireEvent.click(screen.getByText(t("momo.source") + " · " + t("evidence.text")));
    const change = screen.getByRole("listitem");
    expect(change).toHaveTextContent(t("evidence.eaten") + ": " + t("unknown"));
    expect(change).toHaveTextContent(t("evidence.eaten") + ": " + fraction * 100 + "%");
    expect(change).toHaveTextContent("Fictional sauce · (" + t("evidence.excluded") + ")");
    expect(change).toHaveTextContent(
      "Fictional rice ingredient (" + t("meal.visible_estimate") + ")",
    );
    expect(change).toHaveTextContent("Fictional corrected note");
    expect(JSON.stringify(mealSource)).toBe(before);
  },
);
