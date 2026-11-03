import { validateSnapshot } from "@/lib/snapshot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ChartNoAxesColumn, Home, Plus, Syringe, Settings2 } from "lucide-react";
import { t, type Key } from "@/lib/i18n";
import { useJournal } from "@/lib/journal";
import { QuickAddSheet, type EntryKind } from "./QuickAddSheet";
import type { JournalRecord, Purchase } from "@/lib/journal";
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
  const [entryDate, setEntryDate] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [entrySession, setEntrySession] = useState(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [kind, setKind] = useState<EntryKind>("menu");
  const [editing, setEditing] = useState<JournalRecord | Purchase | undefined>();
  const j = useJournal();
  const [replayIntroduction, setReplayIntroduction] = useState(false);
  const introductionOpen =
    replayIntroduction ||
    (j.ready && j.introductionPending && !j.settings.onboarding && pathname !== "/auth");
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
  }, [j.settings.locale]);
  // A fresh session resets form values even when reopened during the close animation.
  const opener: Opener = (k = "menu", e, date) => {
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
      >
        <Header hero={false} onIntroduction={() => setReplayIntroduction(true)} />
        <main key={`${pathname}-${j.settings.locale ?? "ko"}`} className="feel-page px-5">
          {(j.sync === "error" || j.storageBlocked) && (
            <div
              role="alert"
              className="my-3 space-y-2 rounded-2xl border border-destructive/30 bg-accent p-3 text-sm"
            >
              <p>
                {t(
                  j.storageBlocked
                    ? "backup.invalidLocal"
                    : j.conflict
                      ? "sync.conflict"
                      : "sync.error",
                )}
              </p>
              {!j.conflict && !j.storageBlocked && (
                <Button variant="outline" className="min-h-11" onClick={j.retrySync}>
                  {t("momo.retry")}
                </Button>
              )}
            </div>
          )}
          {j.ready ? children : <PageSkeleton hero={pathname === "/today"} />}
        </main>
      </div>
      <AppFeel />
      <BottomNav
        expanded={open}
        onAdd={() => opener("menu")}
        showHint={!introductionOpen && !open && pathname === "/today"}
      />
      {introductionOpen && <Onboarding open onClose={() => setReplayIntroduction(false)} />}
      <QuickAddSheet
        session={entrySession}
        initialDate={entryDate}
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        setKind={setKind}
        editing={editing}
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

function Header({ hero = false, onIntroduction }: { hero?: boolean; onIntroduction: () => void }) {
  const j = useJournal();
  const navigate = useNavigate();
  return (
    <header
      className={`flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 ${hero ? "bg-primary text-primary-foreground" : ""}`}
    >
      <Link to="/today" className="flex items-end gap-1" aria-label="my dear step">
        <span className="font-brand text-[26px] leading-none tracking-tight">my dear step</span>
        <Sprout hero={hero} />
      </Link>
      <Popover>
        <PopoverTrigger
          aria-label={t("set.settings")}
          className={`press flex size-11 items-center justify-center rounded-full ${hero ? "bg-primary-foreground/10" : "bg-secondary"}`}
        >
          <Settings2 className="size-5" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[80dvh] w-72 overflow-y-auto rounded-[20px] p-4"
        >
          <div className="mb-3 rounded-[14px] bg-secondary p-3 text-xs">
            <p className="font-medium">{t(`sync.${j.sync}`)}</p>
            {j.storageBlocked && (
              <>
                <p role="alert">{t("backup.invalidLocal")}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const raw = localStorage.getItem(
                      j.user ? `mds.journal.v1.user.${j.user.id}` : "mds.journal.v1",
                    );
                    const a = document.createElement("a");
                    const url = URL.createObjectURL(
                      new Blob([raw ?? ""], { type: "application/json" }),
                    );
                    a.href = url;
                    a.download = "my-dear-step-recovery.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {t("backup.recovery")}
                </Button>
              </>
            )}
            {j.conflict && (
              <>
                <p role="alert">{t("sync.conflict")}</p>
                <Button variant="outline" onClick={() => j.resolveConflict("local")}>
                  {t("sync.keepLocal")}
                </Button>
                <Button variant="outline" onClick={() => j.resolveConflict("cloud")}>
                  {t("sync.useCloud")}
                </Button>
              </>
            )}
            {j.sync === "error" && !j.conflict && (
              <Button onClick={j.retrySync}>{t("momo.retry")}</Button>
            )}
            {j.user?.email && (
              <p className="mt-0.5 truncate text-muted-foreground">{j.user.email}</p>
            )}
            {j.user ? (
              <Button
                variant="unstyled"
                size="unstyled"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth", replace: true });
                }}
                className="press mt-2 h-9 w-full rounded-full border bg-card"
              >
                {t("sync.signout")}
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
          </div>
          {j.user ? (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => {
                if (window.confirm(t("sync.importConfirm")))
                  j.importGuest().catch(() => toast.error(t("sync.error")));
              }}
            >
              {t("sync.importGuest")}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => {
                if (window.confirm(t("demo.confirm"))) j.resetDemo();
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
              const blob = new Blob(
                [JSON.stringify({ app: "my-dear-step", version: 2, data: j.snapshot() }, null, 2)],
                { type: "application/json" },
              );
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `my-dear-step-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              toast.success(t("toast.exported"));
            }}
            className="press mt-3 h-11 w-full rounded-full border text-sm"
          >
            {t("set.backup")}
          </Button>
          <label className="press mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-full border text-sm">
            {t("set.restore")}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const parsed = JSON.parse(await f.text());
                  if (parsed?.app !== "my-dear-step" || ![1, 2].includes(parsed?.version))
                    throw new Error("backup");
                  const d = validateSnapshot(parsed.data);
                  if (
                    !window.confirm(
                      t("backup.preview", { n: d.records.length + d.purchases.length }),
                    )
                  )
                    return;
                  const before = j.snapshot();
                  j.restoreSnapshot({
                    ...before,
                    records: [
                      ...before.records,
                      ...d.records.filter((r) => !before.records.some((x) => x.id === r.id)),
                    ],
                    purchases: [
                      ...before.purchases,
                      ...d.purchases.filter((p) => !before.purchases.some((x) => x.id === p.id)),
                    ],
                  });
                  toast.success(t("set.restored"), {
                    action: { label: t("toast.undo"), onClick: j.undoFor(before) },
                  });
                } catch {
                  toast.error(t("set.badFile"));
                }
              }}
            />
          </label>
          {j.hasDemo && (
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => {
                const before = j.snapshot();
                j.clearDemo();
                toast(t("toast.demoCleared"), {
                  action: { label: t("toast.undo"), onClick: j.undoFor(before) },
                });
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
  showHint,
}: {
  onAdd: () => void;
  expanded: boolean;
  showHint: boolean;
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
      {showHint && (
        <div className="absolute inset-x-4 bottom-[calc(100%+1.5rem)] mx-auto max-w-sm">
          <FirstUseHint kind="manual" />
        </div>
      )}
      <div className="mx-auto flex max-w-md items-end px-2 pt-2 pb-2">
        {tabs.slice(0, 2).map(render)}
        <Button
          variant="unstyled"
          size="unstyled"
          onClick={onAdd}
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
