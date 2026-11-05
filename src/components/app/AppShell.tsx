import { downloadText } from "@/lib/download";
import { todayLocal } from "@/lib/dates";
import { validateSnapshot } from "@/lib/snapshot";
import { planBackupImport } from "@/lib/backup-import";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ChartNoAxesColumn, Home, Plus, Syringe, Settings2 } from "lucide-react";
import { t, type Key } from "@/lib/i18n";
import { useJournal } from "@/lib/journal";
import type { EntryKind } from "./QuickAddSheet";
import { DeferredQuickAddSheet } from "./DeferredQuickAddSheet";
import { preloadQuickAdd } from "./quick-add-loader";
import type { JournalRecord, JournalSnapshot, Purchase } from "@/lib/journal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { AppFeel } from "./AppFeel";
import { Switch } from "@/components/ui/switch";
import { Onboarding, FirstUseHint, InterestChoices } from "./Onboarding";

import { QuickAddCtx, type Opener } from "./quick-add-context";
export { useQuickAdd } from "./quick-add-context";

const tabs: {
  to: "/today" | "/calendar" | "/injections" | "/progress";
  label: Key;
  icon: typeof Home;
}[] = [
  { to: "/today", label: "nav.today", icon: Home },
  { to: "/calendar", label: "nav.calendar", icon: CalendarDays },
  { to: "/injections", label: "nav.injections", icon: Syringe },
  { to: "/progress", label: "nav.progress", icon: ChartNoAxesColumn },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayIntroduction, setReplayIntroduction] = useState<string | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<"storage" | "conflict" | null>(null);
  const recoveryTrigger = useRef<HTMLButtonElement>(null);
  const [entryDate, setEntryDate] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [entrySession, setEntrySession] = useState(0);
  const [entryTrigger, setEntryTrigger] = useState<HTMLElement | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const activatingControl = useRef<HTMLElement | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Route head metadata can settle after the pathname changes and replace the title.
  const routeTitle = useRouterState({
    select: (state) =>
      state.matches
        .flatMap((match) => match.meta ?? [])
        .map((meta) => (meta && "title" in meta ? meta.title : ""))
        .join("|"),
  });
  const [kind, setKind] = useState<EntryKind>("menu");
  const [editing, setEditing] = useState<JournalRecord | Purchase | undefined>();
  const j = useJournal();
  const owner = j.user?.id ?? "guest";
  const [entryOwner, setEntryOwner] = useState(owner);
  const entryOpen = open && entryOwner === owner;
  useEffect(() => {
    setOpen(false);
    setEditing(undefined);
    setEntryDate(undefined);
    setKind("menu");
    setEntryTrigger(null);
    setReplayIntroduction(null);
  }, [owner]);
  const introductionOpen =
    !entryOpen &&
    !settingsOpen &&
    !j.storageBlocked &&
    !j.conflict &&
    pathname !== "/auth" &&
    (replayIntroduction === owner || (j.ready && j.introductionPending && !j.settings.onboarding));
  const previousRows = useRef<{ owner: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!j.ready) return;
    const owner = j.user?.id ?? "guest";
    const previous = previousRows.current;
    const ids = new Set(j.records.map((r) => r.id));
    previousRows.current = { owner, ids };
    if (!previous || previous.owner !== owner) return;
    const fresh = j.records.filter((r) => !previous.ids.has(r.id));
    if (!fresh.length) return;
    const elements = fresh.flatMap((r) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-record-id="${CSS.escape(r.id)}"]`)),
    );
    elements.forEach((element) => (element.dataset["freshRecord"] = "true"));
    const timer = setTimeout(
      () => elements.forEach((element) => element.removeAttribute("data-fresh-record")),
      400,
    );
    return () => {
      clearTimeout(timer);
      elements.forEach((element) => element.removeAttribute("data-fresh-record"));
    };
  }, [j.records, j.ready, j.user?.id]);
  useEffect(() => {
    document.documentElement.lang = j.settings.locale ?? "ko";
    const pageLabels: Record<string, Key> = {
      "/today": "nav.today",
      "/calendar": "nav.calendar",
      "/injections": "nav.injections",
      "/progress": "nav.progress",
      "/auth": "auth.title",
      "/history": "hist.title",
      "/journey": "journey.title",
    };
    const label = pageLabels[pathname];
    document.title = label ? t(label) + " · my dear step" : "my dear step";
  }, [j.settings.locale, pathname, routeTitle]);
  // A fresh session resets form values even when reopened during the close animation.
  const opener: Opener = (k = "menu", e, date) => {
    setEntryTrigger(
      activatingControl.current?.isConnected
        ? activatingControl.current
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    );
    activatingControl.current = null;
    setEntryOwner(owner);
    setEntrySession((n) => n + 1);
    setEntryDate(date);
    setKind(k);
    setEditing(e);
    setOpen(true);
  };

  return (
    <QuickAddCtx.Provider value={opener}>
      <div
        data-page={pathname}
        className="mx-auto min-h-screen max-w-md bg-background pb-[calc(8rem+env(safe-area-inset-bottom))]"
        onClickCapture={(event) => {
          // Pointer clicks do not focus buttons in every browser. Capture the actual
          // activating control before its handler opens the shared record editor.
          const control =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('button, a[href], [role="button"]')
              : null;
          activatingControl.current = control;
          queueMicrotask(() => {
            if (activatingControl.current === control) activatingControl.current = null;
          });
        }}
      >
        <Header
          hero={false}
          onIntroduction={() => {
            setSettingsOpen(false);
            setReplayIntroduction(owner);
          }}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
          recoveryTarget={recoveryTarget}
          onNormalSettings={() => setRecoveryTarget(null)}
          recoveryTrigger={recoveryTrigger}
        />
        <main key={`${pathname}-${j.settings.locale ?? "ko"}`} className="feel-page px-5">
          {(j.sync === "error" || j.storageBlocked || j.conflict) && (
            <div
              role="alert"
              className="my-3 space-y-2 rounded-2xl border border-destructive/30 bg-accent p-3 text-sm"
            >
              <p>
                {t(
                  j.storageBlocked
                    ? j.storageRecovery?.source === "baseline"
                      ? "backup.invalidBaseline"
                      : "backup.invalidLocal"
                    : j.conflict
                      ? "sync.conflict"
                      : "sync.error",
                )}
              </p>
              {j.conflict || j.storageBlocked ? (
                <Button
                  ref={recoveryTrigger}
                  variant="outline"
                  className="min-h-11"
                  aria-haspopup="dialog"
                  aria-expanded={settingsOpen}
                  onClick={() => {
                    setRecoveryTarget(j.storageBlocked ? "storage" : "conflict");
                    setSettingsOpen(true);
                  }}
                >
                  {t(j.storageBlocked ? "backup.recoverData" : "sync.reviewConflict")}
                </Button>
              ) : (
                <Button variant="outline" className="min-h-11" onClick={j.retrySync}>
                  {t("momo.retry")}
                </Button>
              )}
            </div>
          )}
          {j.ready ? children : <PageSkeleton hero={pathname === "/today"} />}
          {j.ready && !introductionOpen && !entryOpen && pathname === "/today" && (
            <div className="mt-4">
              <FirstUseHint kind="manual" />
            </div>
          )}
        </main>
      </div>
      <AppFeel />
      <BottomNav
        expanded={entryOpen}
        onAdd={() => {
          activatingControl.current = addTrigger.current;
          opener("menu");
        }}
        addTrigger={addTrigger}
      />
      {introductionOpen && <Onboarding open onClose={() => setReplayIntroduction(null)} />}
      <DeferredQuickAddSheet
        key={owner}
        session={entrySession}
        initialDate={entryOwner === owner ? entryDate : undefined}
        open={entryOpen}
        onOpenChange={setOpen}
        kind={entryOwner === owner ? kind : "menu"}
        setKind={setKind}
        editing={entryOwner === owner ? editing : undefined}
        returnFocusTo={entryOwner === owner ? entryTrigger : null}
        fallbackFocus={addTrigger}
      />
    </QuickAddCtx.Provider>
  );
}

function PageSkeleton({ hero }: { hero: boolean }) {
  return (
    <div role="status" aria-label={t("ui.loading")} className="pointer-events-none py-4">
      <span className="sr-only">{t("ui.loading")}</span>
      <div aria-hidden className="space-y-4">
        <div className="feel-busy h-8 w-40 rounded-xl bg-secondary" />
        <div className={`feel-busy rounded-[28px] border bg-card ${hero ? "h-96" : "h-40"}`} />
        <div className="feel-busy h-24 rounded-2xl bg-secondary" />
      </div>
    </div>
  );
}

function Header({
  hero = false,
  onIntroduction,
  settingsOpen,
  onSettingsOpenChange,
  recoveryTarget,
  onNormalSettings,
  recoveryTrigger,
}: {
  hero?: boolean;
  onIntroduction: () => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  recoveryTarget: "storage" | "conflict" | null;
  onNormalSettings: () => void;
  recoveryTrigger: RefObject<HTMLButtonElement | null>;
}) {
  const storageSection = useRef<HTMLDivElement>(null);
  const conflictSection = useRef<HTMLDivElement>(null);
  const settingsStatus = useRef<HTMLParagraphElement>(null);
  const j = useJournal();
  const navigate = useNavigate();
  const owner = j.user?.id ?? "guest";
  // A new identity object also invalidates A → B → A reads, not only A → B.
  const restoreOwner = useRef({ owner });
  if (restoreOwner.current.owner !== owner) restoreOwner.current = { owner };
  const conflictChoice = useRef<{
    identity: typeof restoreOwner.current;
    trigger: HTMLButtonElement;
  } | null>(null);
  useEffect(() => {
    const choice = conflictChoice.current;
    if (!choice) return;
    if (!settingsOpen || choice.identity !== restoreOwner.current) {
      conflictChoice.current = null;
      return;
    }
    // Failed persistence leaves the conflict and its focused choice intact.
    if (j.conflict) return;
    conflictChoice.current = null;
    if (document.activeElement === document.body || document.activeElement === choice.trigger)
      settingsStatus.current?.focus({ preventScroll: true });
  }, [j.conflict, settingsOpen, owner]);
  const mounted = useRef(false);
  const signOutAttempt = useRef<object | null>(null);
  const signOutSubscriptions = useRef(new Set<() => void>());
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const subscriptions = signOutSubscriptions.current;
    return () => {
      mounted.current = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
    };
  }, []);
  useEffect(() => {
    setSignOutError(false);
  }, [owner]);
  const signOut = async () => {
    if (signOutAttempt.current || !j.user || !j.isCurrentOwner()) return;
    const attempt = {};
    signOutAttempt.current = attempt;
    setSigningOut(true);
    setSignOutError(false);
    let current = true;
    let signedOut = false;
    // Auth events can change ownership before React renders. Accept the expected
    // sign-out, but never let an old request redirect a newly signed-in account.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") signedOut = true;
      else if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        (signedOut || session?.user.id !== j.user?.id)
      ) {
        current = false;
        if (signOutAttempt.current === attempt) {
          signOutAttempt.current = null;
          if (mounted.current) setSigningOut(false);
        }
      }
    });
    const unsubscribe = () => subscription.subscription.unsubscribe();
    signOutSubscriptions.current.add(unsubscribe);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (!mounted.current || !current || signOutAttempt.current !== attempt) return;
      if (error) throw error;
      navigate({ to: "/auth", replace: true });
    } catch {
      if (!mounted.current || !current || signOutAttempt.current !== attempt) return;
      // The SDK may already have cleared this browser session despite an error.
      // Do not claim that the user is still signed in, or report false success.
      setSignOutError(true);
      toast.error(t("sync.signoutError"));
    } finally {
      if (signOutSubscriptions.current.delete(unsubscribe)) unsubscribe();
      if (signOutAttempt.current === attempt) {
        signOutAttempt.current = null;
        if (mounted.current) setSigningOut(false);
      }
    }
  };
  return (
    <header
      className={`flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 ${hero ? "bg-primary text-primary-foreground" : ""}`}
    >
      <Link to="/today" className="flex items-end gap-1" aria-label="my dear step">
        <span className="font-brand text-[26px] leading-none tracking-tight">my dear step</span>
        <Sprout hero={hero} />
      </Link>
      <Popover open={settingsOpen} onOpenChange={onSettingsOpenChange}>
        <PopoverTrigger
          onClick={onNormalSettings}
          aria-label={t("set.settings")}
          className={`press flex size-11 items-center justify-center rounded-full ${hero ? "bg-primary-foreground/10" : "bg-secondary"}`}
        >
          <Settings2 className="size-5" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label={t("set.settings")}
          onOpenAutoFocus={(event) => {
            const section =
              recoveryTarget === "storage"
                ? storageSection.current
                : recoveryTarget === "conflict"
                  ? conflictSection.current
                  : null;
            if (section) {
              event.preventDefault();
              section.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (recoveryTarget && recoveryTrigger.current) {
              event.preventDefault();
              recoveryTrigger.current.focus();
            }
          }}
          className="max-h-[80dvh] w-72 overflow-y-auto rounded-[20px] p-4"
        >
          <div className="mb-3 rounded-[14px] bg-secondary p-3 text-xs">
            <p
              ref={settingsStatus}
              role="status"
              aria-atomic="true"
              tabIndex={-1}
              className="rounded-lg font-medium focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t(
                j.storageBlocked
                  ? "backup.recoverData"
                  : j.conflict
                    ? "sync.reviewConflict"
                    : `sync.${j.sync}`,
              )}
            </p>
            {j.storageBlocked && (
              <div
                ref={storageSection}
                role="group"
                aria-label={t("backup.recoverData")}
                tabIndex={-1}
                className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <p role="alert">
                  {t(
                    j.storageRecovery?.source === "baseline"
                      ? "backup.invalidBaseline"
                      : "backup.invalidLocal",
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!j.isCurrentOwner()) return;
                    try {
                      const raw = localStorage.getItem(
                        j.storageRecovery?.key ??
                          (j.user ? `mds.journal.v1.user.${j.user.id}` : "mds.journal.v1"),
                      );
                      if (raw === null) throw new Error("recovery_copy_unavailable");
                      downloadText(
                        raw,
                        j.storageRecovery?.source === "baseline"
                          ? "my-dear-step-sync-history-recovery.json"
                          : "my-dear-step-recovery.json",
                        "application/json",
                      );
                      toast.success(t("toast.exported"));
                    } catch {
                      toast.error(t("export.failed"));
                    }
                  }}
                >
                  {t(
                    j.storageRecovery?.source === "baseline"
                      ? "backup.baselineRecovery"
                      : "backup.recovery",
                  )}
                </Button>
              </div>
            )}
            {j.conflict && (
              <div
                ref={conflictSection}
                role="group"
                aria-label={t("sync.reviewConflict")}
                tabIndex={-1}
                className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <p role="alert">
                  {t(j.baselineConflict ? "backup.baselineChoice" : "sync.conflict")}
                </p>
                <Button
                  variant="outline"
                  onClick={(event) => {
                    conflictChoice.current = {
                      identity: restoreOwner.current,
                      trigger: event.currentTarget,
                    };
                    j.resolveConflict("local");
                  }}
                >
                  {t("sync.keepLocal")}
                </Button>
                <Button
                  variant="outline"
                  onClick={(event) => {
                    conflictChoice.current = {
                      identity: restoreOwner.current,
                      trigger: event.currentTarget,
                    };
                    j.resolveConflict("cloud");
                  }}
                >
                  {t("sync.useCloud")}
                </Button>
              </div>
            )}
            {((j.sync === "error" && !j.conflict) || j.storageRecovery?.source === "baseline") && (
              <Button onClick={j.retrySync}>{t("momo.retry")}</Button>
            )}
            {j.user?.email && (
              <p className="mt-0.5 truncate text-muted-foreground">{j.user.email}</p>
            )}
            {j.user ? (
              <Button
                variant="unstyled"
                size="unstyled"
                disabled={signingOut}
                aria-busy={signingOut}
                onClick={signOut}
                className="press mt-2 h-9 w-full rounded-full border bg-card"
              >
                {t(signingOut ? "sync.signingOut" : "sync.signout")}
              </Button>
            ) : (
              <>
                <p className="mt-2 text-muted-foreground">{t("intro.cloud")}</p>
                <Link
                  to="/auth"
                  className="press mt-2 flex h-9 w-full items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  {t("sync.signin")}
                </Link>
              </>
            )}
            {signOutError && (
              <p role="alert" className="mt-2 text-destructive">
                {t("sync.signoutError")}
              </p>
            )}
          </div>
          {j.user ? (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => {
                if (!j.isCurrentOwner() || !window.confirm(t("sync.importConfirm"))) return;
                j.importGuest().catch((error) => {
                  if (!j.isCurrentOwner()) return;
                  toast.error(
                    t(
                      error instanceof Error && error.message === "guest_stock_conflict"
                        ? "sync.importStockConflict"
                        : "sync.importFailed",
                    ),
                  );
                });
              }}
            >
              {t("sync.importGuest")}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => {
                if (!window.confirm(t("demo.confirm"))) return;
                try {
                  j.resetDemo();
                } catch {
                  toast.error(t("sync.error"));
                }
              }}
            >
              {t("demo.reset")}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">{t("backup.media")}</p>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            {t("set.momo")}
            <Switch
              checked={j.settings.showMomo}
              onCheckedChange={(v) => j.setSetting("showMomo", v)}
            />
          </label>

          <label className="mt-2 flex min-h-11 items-center justify-between gap-3 text-sm">
            {t("set.lang")}
            <select
              aria-label={t("set.lang")}
              value={j.settings.locale ?? "ko"}
              onChange={(e) => j.setSetting("locale", e.target.value as "ko" | "en" | "fr")}
              className="h-9 rounded-full border bg-card px-3"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("intro.shortcuts")}</legend>
            <InterestChoices
              value={j.settings.trackingInterests ?? []}
              locale={j.settings.locale ?? "ko"}
              onChange={(value) => j.setSetting("trackingInterests", value)}
            />
          </fieldset>
          <Button
            variant="outline"
            className="mt-3 min-h-11 w-full whitespace-normal"
            onClick={onIntroduction}
          >
            {t("intro.replay")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("set.tz")}: {j.tz}
          </p>
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={() => {
              if (!j.isCurrentOwner()) return;
              try {
                downloadText(
                  JSON.stringify({ app: "my-dear-step", version: 2, data: j.snapshot() }, null, 2),
                  `my-dear-step-${todayLocal(j.tz)}.json`,
                  "application/json",
                );
                toast.success(t("toast.exported"));
              } catch {
                toast.error(t("export.failed"));
              }
            }}
            className="press mt-3 h-11 w-full rounded-full border text-sm"
          >
            {t("set.backup")}
          </Button>
          <label className="press mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-full border text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            {t("set.restore")}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const startedFor = restoreOwner.current;
                const isCurrent = () =>
                  mounted.current && restoreOwner.current === startedFor && j.isCurrentOwner();
                let imported: JournalSnapshot;
                try {
                  const text = await f.text();
                  if (!isCurrent()) return;
                  const parsed = JSON.parse(text);
                  if (parsed?.app !== "my-dear-step" || ![1, 2].includes(parsed?.version))
                    throw new Error("backup");
                  imported = validateSnapshot(parsed.data);
                } catch {
                  if (isCurrent()) toast.error(t("set.badFile"));
                  return;
                }
                if (!isCurrent()) return;
                try {
                  const before = j.snapshot();
                  const plan = planBackupImport(before, imported);
                  if (plan.status === "stock-conflict") {
                    toast.error(t("backup.stockConflict"));
                    return;
                  }
                  if (!plan.added) {
                    toast.info(t("backup.noNew", { skipped: plan.skipped }));
                    return;
                  }
                  if (
                    !window.confirm(t("backup.preview", { n: plan.added, skipped: plan.skipped }))
                  )
                    return;
                  if (!isCurrent()) return;
                  j.restoreSnapshot(plan.snapshot);
                  if (!isCurrent()) return;
                  toast.success(t("backup.imported", { n: plan.added, skipped: plan.skipped }), {
                    action: { label: t("toast.undo"), onClick: j.undoFor(before) },
                  });
                } catch {
                  if (isCurrent()) toast.error(t("backup.saveFailed"));
                }
              }}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">{t("backup.importHelp")}</p>
          {j.hasDemo && (
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => {
                try {
                  const before = j.snapshot();
                  j.clearDemo();
                  toast(t("toast.demoCleared"), {
                    action: { label: t("toast.undo"), onClick: j.undoFor(before) },
                  });
                } catch {
                  toast.error(t("sync.error"));
                }
              }}
              className="mt-3 h-11 w-full rounded-full border text-sm"
            >
              {t("demo.clear")}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </header>
  );
}

function Sprout({ hero = false }: { hero?: boolean }) {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden className="-mb-1">
      <path
        d="M11 27 C11 18 10 12 12 6"
        stroke={hero ? "currentColor" : "var(--color-primary)"}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M12 10 C14 4 19 2 21 3 C20 8 16 11 12 10Z" fill="var(--color-chart-4)" />
      <path d="M11 9 C8 4 4 3 2 4 C3 8 7 10 11 9Z" fill="var(--color-peach-accent)" />
    </svg>
  );
}

function BottomNav({
  onAdd,
  expanded,
  addTrigger,
}: {
  onAdd: () => void;
  expanded: boolean;
  addTrigger: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activePath = pathname === "/journey" || pathname === "/history" ? "/progress" : pathname;
  const item =
    "press flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[12px] text-muted-foreground";
  const render = (tab: (typeof tabs)[number]) => {
    const Icon = tab.icon;
    const active = activePath === tab.to;
    return (
      <Link
        key={tab.to}
        to={tab.to}
        preload="intent"
        className={`${item} ${active ? "text-foreground font-semibold" : ""}`}
        aria-current={active ? "page" : undefined}
        activeProps={{ className: "!text-foreground font-semibold" }}
      >
        <>
          <span className="feel-nav-icon flex h-8 w-12 items-center justify-center rounded-full">
            <Icon
              className="size-6"
              strokeWidth={active ? 2.4 : 1.7}
              fill={active && tab.to === "/today" ? "currentColor" : "none"}
            />
          </span>
          <span className="whitespace-nowrap text-center leading-tight">{t(tab.label)}</span>
        </>
      </Link>
    );
  };
  return (
    <nav className="app-nav fixed inset-x-0 bottom-0 z-40 border-t border-primary/10 bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-end px-2 pt-2 pb-2">
        {tabs.slice(0, 2).map(render)}
        <Button
          ref={addTrigger}
          variant="unstyled"
          size="unstyled"
          onClick={onAdd}
          onPointerDown={() => void preloadQuickAdd()}
          onPointerEnter={() => void preloadQuickAdd()}
          onFocus={() => void preloadQuickAdd()}
          aria-expanded={expanded}
          className="feel-add press -mt-7 flex min-w-0 flex-1 flex-col items-center gap-1 text-[12px] text-muted-foreground"
          aria-label={t("nav.add")}
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
            <Plus className="size-8" strokeWidth={2.2} />
          </span>
          <span className="whitespace-nowrap text-center leading-tight">{t("nav.add")}</span>
        </Button>
        {tabs.slice(2).map(render)}
      </div>
    </nav>
  );
}
