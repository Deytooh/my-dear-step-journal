import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppShell, useQuickAdd } from "@/components/app/AppShell";
import { JournalProvider, useJournal, type JournalContextValue } from "@/lib/journal";
import { t, tFor } from "@/lib/i18n";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), listener: (_e: string, _s: unknown) => {} }));
const effects = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  sessions: [] as number[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: auth.getUser,
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn().mockResolvedValue(null),
  pushDiff: vi.fn().mockResolvedValue([]),
  clearPhotoCache: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    activeProps: _a,
    ...props
  }: {
    to: string;
    children: ReactNode;
    activeProps: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/today" }, matches: [] }),
}));
vi.mock("@/components/app/AppFeel", () => ({ AppFeel: () => null }));
vi.mock("@/components/app/EntrySheet", () => ({
  EntrySheet: ({
    open,
    header,
    children,
  }: {
    open: boolean;
    header: ReactNode;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label="Introduction fixture">
        {header}
        {children}
      </div>
    ) : null,
}));
vi.mock("@radix-ui/react-dialog", () => ({
  Title: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Description: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("@/components/ui/drawer", () => ({
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("sonner", () => ({ toast: effects.toast }));
vi.mock("@/components/app/QuickAddSheet", async () => {
  const { useState } = await import("react");
  const { useJournal } = await import("@/lib/journal");
  function Editor({ close }: { close: () => void }) {
    const journal = useJournal();
    const [note, setNote] = useState("");
    const [error, setError] = useState(false);
    return (
      <div role="dialog" aria-label="Manual editor fixture">
        <label>
          Fictional note
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button onClick={close}>Cancel manual fixture</button>
        <button
          onClick={() => {
            try {
              journal.saveRecord({
                id: "first-manual",
                type: "memory",
                note,
                localDate: "2026-11-04",
                at: null,
                precision: "date_only",
                createdAt: "2026-11-04T00:00:00Z",
                source: "manual_text",
              });
              close();
            } catch {
              setError(true);
            }
          }}
        >
          Save manual fixture
        </button>
        {error && <p role="alert">Fixture save failed</p>}
      </div>
    );
  }
  return {
    QuickAddSheet: ({
      open,
      session,
      onOpenChange,
    }: {
      open: boolean;
      session: number;
      onOpenChange: (open: boolean) => void;
    }) => {
      effects.sessions.push(session);
      return open ? <Editor key={session} close={() => onOpenChange(false)} /> : null;
    },
  };
});
let journal: JournalContextValue;
function Controls() {
  journal = useJournal();
  const open = useQuickAdd();
  return <button onClick={() => open("memory")}>Start manual fixture</button>;
}
function showShell() {
  return render(
    <JournalProvider>
      <AppShell>
        <Controls />
      </AppShell>
    </JournalProvider>,
  );
}
function delayedAuth() {
  let finish!: (v: { data: { user: { id: string } | null } }) => void;
  auth.getUser.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  return finish;
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  effects.sessions.length = 0;
  auth.getUser.mockReset();
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("defers delayed first-run onboarding until an unsaved manual editor is dismissed, without starting another editor session", async () => {
  const finish = delayedAuth();
  showShell();
  fireEvent.click(await screen.findByRole("button", { name: "Start manual fixture" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Fictional note" }), {
    target: { value: "Fictional unsaved note" },
  });
  const session = effects.sessions.at(-1);
  await act(async () => finish({ data: { user: null } }));
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Fictional note" })).toHaveValue(
    "Fictional unsaved note",
  );
  expect(effects.sessions.at(-1)).toBe(session);
  fireEvent.click(screen.getByRole("button", { name: "Cancel manual fixture" }));
  expect(screen.getByRole("heading", { name: tFor("en", "intro.welcome") })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Manual editor fixture" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.start") }));
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.next") }));
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.add") }));
  expect(screen.getByRole("textbox", { name: "Fictional note" })).toHaveValue("");
  expect(effects.sessions.at(-1)).toBe(session! + 1);
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
});

it.each(["before-auth", "after-auth"])(
  "does not interrupt a successful first save with onboarding: %s",
  async (when) => {
    const finish = delayedAuth();
    showShell();
    fireEvent.click(await screen.findByRole("button", { name: "Start manual fixture" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Fictional note" }), {
      target: { value: "Fictional saved note" },
    });
    if (when === "after-auth") await act(async () => finish({ data: { user: null } }));
    fireEvent.click(screen.getByRole("button", { name: "Save manual fixture" }));
    if (when === "before-auth") await act(async () => finish({ data: { user: null } }));
    expect(journal.records[0]).toMatchObject({ note: "Fictional saved note" });
    expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Manual editor fixture" })).not.toBeInTheDocument();
  },
);

it("keeps a failed save editable, and a retry completes without automatic onboarding", async () => {
  const finish = delayedAuth();
  showShell();
  fireEvent.click(await screen.findByRole("button", { name: "Start manual fixture" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Fictional note" }), {
    target: { value: "Fictional retry note" },
  });
  await act(async () => finish({ data: { user: null } }));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("fictional quota failure");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save manual fixture" }));
  expect(screen.getByText("Fixture save failed")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Fictional note" })).toHaveValue(
    "Fictional retry note",
  );
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
  write.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Save manual fixture" }));
  expect(journal.records[0]).toMatchObject({ note: "Fictional retry note" });
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
});

it("waits behind settings, and replay explicitly closes settings before opening the introduction", async () => {
  const finish = delayedAuth();
  showShell();
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  await act(async () => finish({ data: { user: null } }));
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  expect(screen.getByRole("dialog", { name: "Introduction fixture" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Français" }));
  fireEvent.click(screen.getByRole("button", { name: tFor("fr", "intro.explore") }));
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("intro.replay") }));
  expect(screen.getByRole("heading", { name: tFor("fr", "intro.welcome") })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: t("set.settings") })).not.toBeInTheDocument();
});

it("closes guest editor on a genuine account transition without opening a guest introduction", async () => {
  const finish = delayedAuth();
  showShell();
  fireEvent.click(await screen.findByRole("button", { name: "Start manual fixture" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Fictional note" }), {
    target: { value: "Fictional guest-only draft" },
  });
  await act(async () => finish({ data: { user: { id: "fictional-account" } } }));
  await waitFor(() => expect(journal.user?.id).toBe("fictional-account"));
  expect(screen.queryByRole("dialog", { name: "Manual editor fixture" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
  expect(journal.records).toEqual([]);
});

it("dismisses an introduction replay on account change instead of carrying the previous owner's choices", async () => {
  const finish = delayedAuth();
  showShell();
  await act(async () => finish({ data: { user: null } }));
  fireEvent.click(screen.getByRole("button", { name: tFor("en", "intro.explore") }));
  fireEvent.click(screen.getByRole("button", { name: t("set.settings") }));
  fireEvent.click(screen.getByRole("button", { name: t("intro.replay") }));
  fireEvent.click(screen.getByRole("button", { name: "Français" }));
  expect(screen.getByRole("heading", { name: tFor("fr", "intro.welcome") })).toBeVisible();
  await act(async () => auth.listener("SIGNED_IN", { user: { id: "fictional-other-owner" } }));
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
  expect(journal.settings.locale).not.toBe("fr");
});

it("keeps a deferred introduction behind a recovery conflict", async () => {
  const finish = delayedAuth();
  showShell();
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "mds.journal.v1",
        newValue: JSON.stringify({
          records: [],
          purchases: [],
          reminder: null,
          stockAdjust: 0,
          settings: { showMomo: false, timezone: "Asia/Seoul" },
        }),
      }),
    ),
  );
  await act(async () => finish({ data: { user: null } }));
  expect(journal.conflict).toBe(true);
  expect(screen.getByRole("button", { name: t("sync.reviewConflict") })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Introduction fixture" })).not.toBeInTheDocument();
});
