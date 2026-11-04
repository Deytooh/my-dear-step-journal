import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuickAddSheet } from "@/components/app/QuickAddSheet";
import { setLocale, t, type Locale } from "@/lib/i18n";

const journal = vi.hoisted(() => ({
  isCurrentOwner: () => true,
  user: null as { id: string } | null,
  settings: { showMomo: false, demoMode: true },
  tz: "Asia/Seoul",
  records: [],
  purchases: [],
  reminder: null,
  inventory: { lots: [] },
  newId: () => "fictional-id",
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => journal, canDeduct: () => true }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/calendar" } }),
}));
vi.mock("@/components/app/MealForm", () => ({ MealForm: () => null }));
vi.mock("@/components/app/MomoSheet", () => ({ MomoSheet: () => null }));
vi.mock("@/components/app/AppFeel", () => ({ celebrateSave: vi.fn() }));
beforeEach(() => {
  journal.user = null;
  journal.settings.demoMode = true;
  setLocale("en");
});
afterEach(cleanup);

it.each(["menu", "memory", "reminder"] as const)(
  "shows practice context before saving in the %s sheet",
  (kind) => {
    render(<QuickAddSheet open onOpenChange={vi.fn()} kind={kind} setKind={vi.fn()} />);
    expect(screen.getByRole("note")).toHaveTextContent(t("demo.notice"));
    expect(screen.queryByRole("button", { name: t("demo.clear") })).not.toBeInTheDocument();
  },
);

it.each(["ko", "en", "fr"] as Locale[])("localizes the guest practice notice in %s", (locale) => {
  setLocale(locale);
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="menu" setKind={vi.fn()} />);
  expect(screen.getByRole("note")).toHaveTextContent(t("demo.notice"));
  expect(screen.getByRole("note")).not.toHaveTextContent("demo.notice");
});

it("does not show practice mode for a non-demo guest", () => {
  journal.settings.demoMode = false;
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="menu" setKind={vi.fn()} />);
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

it("does not show practice mode for an authenticated user even with an old demoMode preference", () => {
  journal.user = { id: "fictional-account" };
  render(<QuickAddSheet open onOpenChange={vi.fn()} kind="menu" setKind={vi.fn()} />);
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});
