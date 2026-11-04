import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import { Route } from "@/routes/auth";
import { t } from "@/lib/i18n";
const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  social: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: auth.signIn, signUp: auth.signUp } },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: auth.social } },
}));
vi.mock("@/lib/journal", () => ({ useJournal: () => ({ user: null }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => auth.navigate,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
const AuthPage = Route.options.component as ComponentType;
beforeEach(() => {
  vi.clearAllMocks();
  auth.signIn.mockReset().mockResolvedValue({ error: null });
  auth.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  auth.social.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);
function fillCredentials() {
  fireEvent.change(screen.getByLabelText(t("auth.email")), {
    target: { value: "fictional@example.com" },
  });
  fireEvent.change(screen.getByLabelText(t("auth.password")), {
    target: { value: "fictional-password" },
  });
}
it("recovers from a rejected email sign-in request without discarding typed credentials", async () => {
  auth.signIn.mockRejectedValueOnce(new Error("fictional network failure"));
  render(<AuthPage />);
  fillCredentials();
  fireEvent.click(screen.getByRole("button", { name: t("auth.signin") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.unavailable"));
  expect(screen.getByLabelText(t("auth.email"))).toHaveValue("fictional@example.com");
  expect(screen.getByLabelText(t("auth.password"))).toHaveValue("fictional-password");
  fireEvent.click(screen.getByRole("button", { name: t("auth.signin") }));
  await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
it("recovers from a rejected account-creation request and keeps the selected mode", async () => {
  auth.signUp.mockRejectedValueOnce(new Error("fictional network failure"));
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: t("auth.toSignup") }));
  fillCredentials();
  fireEvent.click(screen.getByRole("button", { name: t("auth.signup") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.unavailable"));
  const submit = screen.getByRole("button", { name: t("auth.signup") });
  expect(submit).toBeEnabled();
  expect(screen.getByLabelText(t("auth.password"))).toHaveAttribute("autocomplete", "new-password");
  fireEvent.click(submit);
  expect(await screen.findByText(t("auth.check"))).toHaveAttribute("role", "status");
  expect(auth.signUp).toHaveBeenCalledTimes(2);
});
it("allows only one authentication request while a social provider is pending", async () => {
  let finish!: (result: { error: null }) => void;
  auth.social.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<AuthPage />);
  fillCredentials();
  const google = screen.getByRole("button", { name: t("auth.google") });
  fireEvent.click(google);
  expect(screen.getByRole("status")).toHaveTextContent(t("auth.connecting"));
  expect(google).toBeDisabled();
  expect(screen.getByRole("button", { name: t("auth.lovable") })).toBeDisabled();
  expect(screen.getByRole("button", { name: t("auth.toSignup") })).toBeDisabled();
  expect(screen.getByLabelText(t("auth.email"))).toBeDisabled();
  fireEvent.click(google);
  fireEvent.submit(screen.getByLabelText(t("auth.email")).closest("form")!);
  expect(auth.social).toHaveBeenCalledOnce();
  expect(auth.signIn).not.toHaveBeenCalled();
  await act(async () => finish({ error: null }));
  expect(google).toBeEnabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("restores social sign-in actions after a thrown failure", async () => {
  auth.social.mockRejectedValueOnce(new Error("fictional provider failure"));
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: t("auth.google") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.unavailable"));
  expect(screen.getByRole("button", { name: t("auth.google") })).toBeEnabled();
  expect(screen.getByRole("button", { name: t("auth.lovable") })).toBeEnabled();
});
it("keeps known sign-in rejection copy distinct from connection failures", async () => {
  auth.signIn.mockResolvedValue({ error: { message: "backend detail" } });
  render(<AuthPage />);
  fillCredentials();
  fireEvent.click(screen.getByRole("button", { name: t("auth.signin") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("auth.fail"));
  expect(screen.getByRole("button", { name: t("auth.signin") })).toBeEnabled();
});
