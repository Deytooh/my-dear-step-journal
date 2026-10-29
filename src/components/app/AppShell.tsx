import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createContext, useContext, useState, type ReactNode } from "react";
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

type Opener = (kind?: EntryKind, editing?: JournalRecord | Purchase) => void;
const QuickAddCtx = createContext<Opener>(() => {});
export const useQuickAdd = () => useContext(QuickAddCtx);

const tabs: { to: "/today" | "/calendar" | "/injections" | "/progress"; label: Key; icon: typeof Home }[] = [
  { to: "/today", label: "nav.today", icon: Home },
  { to: "/calendar", label: "nav.calendar", icon: CalendarDays },
  { to: "/injections", label: "nav.injections", icon: Syringe },
  { to: "/progress", label: "nav.progress", icon: ChartNoAxesColumn },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [kind, setKind] = useState<EntryKind>("menu");
  const [editing, setEditing] = useState<JournalRecord | Purchase | undefined>();
  const j = useJournal();
  const opener: Opener = (k = "menu", e) => { setKind(k); setEditing(e); setOpen(true); };

  return (
    <QuickAddCtx.Provider value={opener}>
      <div className="mx-auto min-h-screen max-w-md bg-background pb-28">
        <Header />
        <main key={`${pathname}-${j.settings.locale ?? "ko"}`} className="feel-page px-5">{children}</main>
      </div>
      <AppFeel />
      <BottomNav expanded={open} onAdd={() => opener("menu")} />
      <QuickAddSheet open={open} onOpenChange={setOpen} kind={kind} setKind={setKind} editing={editing} />
    </QuickAddCtx.Provider>
  );
}

function Header() {
  const j = useJournal();
  const navigate = useNavigate();
  return (
    <header className="flex items-center justify-between px-5 pt-6 pb-2">
      <Link to="/today" className="flex items-end gap-1" aria-label="my dear step">
        <span className="font-brand text-[26px] leading-none tracking-tight">my dear step</span>
        <Sprout />
      </Link>
      <Popover>
        <PopoverTrigger aria-label={t("set.settings")} className="press flex size-11 items-center justify-center rounded-full bg-secondary">
          <Settings2 className="size-5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 rounded-[20px] p-4">
          <div className="mb-3 rounded-[14px] bg-secondary p-3 text-xs">
            <p className="font-medium">{t(`sync.${j.sync}`)}</p>
            {j.user?.email && <p className="mt-0.5 truncate text-muted-foreground">{j.user.email}</p>}
            {j.user ? (
              <Button variant="unstyled" size="unstyled" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }} className="press mt-2 h-9 w-full rounded-full border bg-card">{t("sync.signout")}</Button>
            ) : (
              <Link to="/auth" className="press mt-2 flex h-9 w-full items-center justify-center rounded-full bg-primary text-primary-foreground">{t("sync.signin")}</Link>
            )}
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            {t("set.momo")}
            <Switch checked={j.settings.showMomo} onCheckedChange={(v) => j.setSetting("showMomo", v)} />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            {t("pr.setting")}
            <Switch checked={!j.settings.prompts?.hidden} onCheckedChange={(v) => j.setSetting("prompts", { ...(j.settings.prompts ?? {}), hidden: !v, ...(v ? { off: [] } : {}) })} />
          </label>
          <label className="mt-2 flex min-h-11 items-center justify-between gap-3 text-sm">
            {t("set.lang")}
            <select aria-label={t("set.lang")} value={j.settings.locale ?? "ko"} onChange={(e) => j.setSetting("locale", e.target.value as "ko" | "en" | "fr")} className="h-9 rounded-full border bg-card px-3">
              <option value="ko">한국어</option><option value="en">English</option><option value="fr">Français</option>
            </select>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">{t("set.tz")}: {j.tz}</p>
          <Button variant="unstyled" size="unstyled" onClick={() => {
            const blob = new Blob([JSON.stringify({ app: "my-dear-step", version: 1, data: j.snapshot() }, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `my-dear-step-${new Date().toISOString().slice(0, 10)}.json`; a.click();
            toast.success(t("toast.exported"));
          }} className="press mt-3 h-11 w-full rounded-full border text-sm">{t("set.backup")}</Button>
          <label className="press mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-full border text-sm">
            {t("set.restore")}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
              try {
                const parsed = JSON.parse(await f.text());
                const d = parsed?.data;
                if (parsed?.app !== "my-dear-step" || !Array.isArray(d?.records) || !Array.isArray(d?.purchases) || !d?.settings) throw new Error("bad");
                const before = j.snapshot(); j.restoreSnapshot(d);
                toast.success(t("set.restored"), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } });
              } catch { toast.error(t("set.badFile")); }
            }} />
          </label>
          {j.hasDemo && (
            <Button variant="unstyled" size="unstyled" onClick={() => { const before = j.snapshot(); j.clearDemo(); toast(t("toast.demoCleared"), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } }); }} className="mt-3 h-11 w-full rounded-full border text-sm">
              {t("demo.clear")}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </header>
  );
}

function Sprout() {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden className="-mb-1">
      <path d="M11 27 C11 18 10 12 12 6" stroke="var(--color-primary)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M12 10 C14 4 19 2 21 3 C20 8 16 11 12 10Z" fill="var(--color-chart-4)" />
      <path d="M11 9 C8 4 4 3 2 4 C3 8 7 10 11 9Z" fill="var(--color-peach-accent)" />
    </svg>
  );
}

function BottomNav({ onAdd, expanded }: { onAdd: () => void; expanded: boolean }) {
  const item = "press flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[13px] text-muted-foreground";
  const render = (tab: (typeof tabs)[number]) => {
    const Icon = tab.icon;
    return (
      <Link key={tab.to} to={tab.to} className={item} activeProps={{ className: "!text-foreground font-semibold" }}>
        {({ isActive }) => (
          <>
            <span className="feel-nav-icon flex h-8 w-12 items-center justify-center rounded-full"><Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.7} fill={isActive && tab.to === "/today" ? "currentColor" : "none"} /></span>
            {t(tab.label)}
          </>
        )}
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-md items-end px-2 pt-1 pb-1">
        {tabs.slice(0, 2).map(render)}
        <Button variant="unstyled" size="unstyled" onClick={onAdd} aria-expanded={expanded} className="feel-add press -mt-7 flex flex-1 flex-col items-center gap-1 text-[13px] text-muted-foreground" aria-label={t("nav.add")}>
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
            <Plus className="size-8" strokeWidth={2.2} />
          </span>
          {t("nav.add")}
        </Button>
        {tabs.slice(2).map(render)}
      </div>
    </nav>
  );
}
