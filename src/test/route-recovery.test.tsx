import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { RouteRecovery } from "@/components/app/RouteRecovery";
import { getLocale, setLocale, tFor } from "@/lib/i18n";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
beforeEach(() => setLocale("en"));
afterEach(cleanup);
it.each([
  ["en", "English"],
  ["fr", "Français"],
  ["ko", "한국어"],
] as const)(
  "offers a clear retry and home action in %s without a journal provider",
  (locale, name) => {
    const retry = vi.fn();
    render(<RouteRecovery kind="error" onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name }));
    expect(
      screen.getByRole("region", { name: tFor(locale, "recovery.errorTitle") }),
    ).toHaveAttribute("lang", locale);
    expect(
      screen.getByRole("heading", { name: tFor(locale, "recovery.errorTitle") }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: tFor(locale, "recovery.home") })).toHaveAttribute(
      "href",
      "/today",
    );
    fireEvent.click(screen.getByRole("button", { name: tFor(locale, "recovery.retry") }));
    expect(retry).toHaveBeenCalledOnce();
    expect(getLocale()).toBe("en");
  },
);
it("gives an unknown URL a home action without suggesting a retry will find the missing page", () => {
  render(<RouteRecovery kind="not-found" />);
  expect(screen.getByRole("heading", { name: tFor("en", "recovery.missingTitle") })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: tFor("en", "recovery.retry") }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: tFor("en", "recovery.home") })).toHaveAttribute(
    "href",
    "/today",
  );
});

it("embeds the missing-page card in the shared shell without nesting main landmarks", () => {
  render(
    <main>
      <RouteRecovery kind="not-found" embedded />
    </main>,
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("region", { name: tFor("en", "recovery.missingTitle") })).toBeVisible();
  expect(screen.queryByText("my dear step")).not.toBeInTheDocument();
});
