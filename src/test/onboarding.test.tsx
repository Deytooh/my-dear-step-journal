import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Onboarding } from "@/components/app/Onboarding";
import type { JournalSnapshot } from "@/lib/journal";
import { tFor } from "@/lib/i18n";
const mocks = vi.hoisted(() => ({ add: vi.fn(), restore: vi.fn() }));
let snapshot: JournalSnapshot;
const j = {
  get settings() {
    return snapshot.settings;
  },
  introductionPending: true,
  snapshot: () => snapshot,
  restoreSnapshot: mocks.restore,
};
vi.mock("@/lib/journal", () => ({ useJournal: () => j }));
vi.mock("@/components/app/quick-add-context", () => ({ useQuickAdd: () => mocks.add }));
vi.mock("@/components/app/EntrySheet", () => ({
  EntrySheet: ({ header, children }: { header: ReactNode; children: ReactNode }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  j.introductionPending = true;
  snapshot = {
    records: [],
    purchases: [],
    reminder: null,
    stockAdjust: 0,
    settings: { showMomo: true, timezone: "Asia/Seoul", prompts: { aiConsent: false } },
  };
});
afterEach(cleanup);
it("puts all language choices on the first screen and starts new guests in English", () => {
  render(<Onboarding open onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: tFor("en", "intro.welcome") })).toBeVisible();
  for (const name of ["English", "Français", "한국어"])
    expect(screen.getByRole("button", { name })).toBeVisible();
  expect(mocks.restore).not.toHaveBeenCalled();
});
it("keeps the chosen language when skipping without changing records, interests or AI consent", () => {
  snapshot.settings.trackingInterests = ["weight"];
  render(<Onboarding open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Français" }));
  fireEvent.click(screen.getByRole("button", { name: tFor("fr", "intro.explore") }));
  expect(mocks.restore).toHaveBeenCalledWith({
    ...snapshot,
    settings: { ...snapshot.settings, locale: "fr", onboarding: { status: "skipped" } },
  });
  expect(mocks.add).not.toHaveBeenCalled();
});
it("respects an existing saved language when replaying the introduction", () => {
  snapshot.settings.locale = "fr";
  j.introductionPending = false;
  render(<Onboarding open onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: tFor("fr", "intro.welcome") })).toBeVisible();
});
it("opens the shared Momo composer after onboarding without microphone permission or AI consent", () => {
  render(<Onboarding open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.start") }));
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.next") }));
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.tryMomo") }));
  expect(mocks.add).toHaveBeenCalledWith("voice");
  const saved = mocks.restore.mock.calls[0]![0] as JournalSnapshot;
  expect(saved.records).toEqual([]);
  expect(saved.purchases).toEqual([]);
  expect(saved.settings.prompts?.aiConsent).toBe(false);
});
