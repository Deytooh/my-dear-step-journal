import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeferredQuickAddSheet } from "@/components/app/DeferredQuickAddSheet";
import type { QuickAddSheetProps } from "@/components/app/QuickAddSheet";
import { setLocale, t } from "@/lib/i18n";

const loader = vi.hoisted(() => ({ preload: vi.fn() }));
vi.mock("@/components/app/quick-add-loader", () => ({
  getQuickAdd: () => undefined,
  preloadQuickAdd: loader.preload,
}));
function fixture(props: QuickAddSheetProps) {
  return props.open ? (
    <div role="dialog">
      Ready {props.kind} {props.initialDate}
    </div>
  ) : null;
}
beforeEach(() => {
  loader.preload.mockReset();
  setLocale("en");
});
afterEach(cleanup);

it("does not load unopened forms, allows cancellation, and never reopens a late result", async () => {
  let finish!: (value: typeof fixture) => void;
  loader.preload.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const close = vi.fn();
  const props = { open: false, onOpenChange: close, kind: "menu" as const, setKind: vi.fn() };
  const opener = createRef<HTMLButtonElement>();
  const content = (open: boolean) => (
    <>
      <button ref={opener}>Fixture opener</button>
      <DeferredQuickAddSheet {...props} open={open} fallbackFocus={opener} />
    </>
  );
  const view = render(content(false));
  expect(loader.preload).not.toHaveBeenCalled();
  opener.current!.focus();
  view.rerender(content(true));
  expect(screen.getByRole("status")).toHaveTextContent(t("ui.loading"));
  fireEvent.click(screen.getByRole("button", { name: t("evidence.close") }));
  expect(close).toHaveBeenCalledWith(false);
  view.rerender(content(false));
  await waitFor(() => expect(opener.current).toHaveFocus());
  await act(async () => finish(fixture));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(<DeferredQuickAddSheet {...props} open kind="meal" initialDate="2026-11-01" />);
  expect(await screen.findByText("Ready meal 2026-11-01")).toBeVisible();
});

it("keeps a failed download recoverable without losing the current opening props", async () => {
  loader.preload.mockResolvedValueOnce(undefined).mockResolvedValueOnce(fixture);
  render(<DeferredQuickAddSheet open onOpenChange={vi.fn()} kind="weight" setKind={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(t("recovery.errorTitle"));
  fireEvent.click(screen.getByRole("button", { name: t("recovery.retry") }));
  await waitFor(() => expect(screen.getByText("Ready weight")).toBeVisible());
  expect(loader.preload).toHaveBeenCalledTimes(2);
});
