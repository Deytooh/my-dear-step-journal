import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ChevronRight, Image as ImageIcon, Mic, Package, Plus, Scale, Smile, Syringe } from "lucide-react";
import type { ReactNode } from "react";
import { t, getLocale } from "@/lib/i18n";
import { dayDiff, fmtMonthDay, fmtMonthDayWeekday, localDateOf, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal, type JournalRecord } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, DemoTag, RecordRow, SectionHeader } from "@/components/app/ui";
import { reminderText } from "@/components/app/ReminderCard";
import { PromptCarousel } from "@/components/app/PromptCarousel";
import { AnimatedValue } from "@/components/app/AppFeel";
import { PhotoImg } from "@/components/app/PhotoImg";
import { fmtNumber } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import momo from "@/assets/momo.png";

export const Route = createFileRoute("/today")({
  head: () => ({
    meta: [
      { title: "오늘 · my dear step" },
      { name: "description", content: "오늘의 체중, 컨디션, 다음 주사 알림과 남은 재고를 한눈에." },
      { property: "og:title", content: "오늘 · my dear step" },
      { property: "og:description", content: "오늘의 기록과 다음 주사 알림을 한눈에 보는 GLP-1 저널." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Today,
});

const latest = <T extends JournalRecord["type"]>(rs: JournalRecord[], type: T) =>
  rs.filter((r) => r.type === type).sort(sortByTime).at(-1) as Extract<JournalRecord, { type: T }> | undefined;

function Today() {
  const j = useJournal();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const records = j.records.filter((r) => r.localDate === today).sort(sortByTime).reverse();

  return (
    <div>
      <HomeHero />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <WeightTile />
        <ConditionTile />
        <StockTile />
        <MomentTile />
      </div>

      <PromptCarousel />

      <div className="mt-4 flex items-center rounded-full border bg-card shadow-soft">
        <Button variant="unstyled" size="unstyled" onClick={() => open("voice")} className="press flex min-h-14 flex-1 items-center gap-3 rounded-l-full pl-5 text-left text-[16px] text-muted-foreground">
          <Mic className="size-6 shrink-0 text-foreground" />{t("momo.talk")}
        </Button>
        <span className="h-8 w-px bg-border" aria-hidden />
        <Button variant="unstyled" size="unstyled" onClick={() => open("voice")} aria-label={t("momo.photo")} className="press flex size-14 items-center justify-center rounded-r-full">
          <Camera className="size-6" />
        </Button>
      </div>

      <SectionHeader title={t("today.records")} action={
        <Link to="/calendar" className="flex min-h-11 items-center gap-1 text-[15px] text-muted-foreground">{t("today.seeAll")} <ChevronRight className="size-4" /></Link>
      } />
      <Card className="px-5 pb-5">
        {records.length === 0 && <p className="py-6 text-center text-muted-foreground">{t("today.empty")}</p>}
        <div className="divide-y">{records.map((r) => <RecordRow key={r.id} r={r} onEdit={() => open(r.type, r)} />)}</div>
        <Button variant="unstyled" size="unstyled" onClick={() => open("menu")} className="press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/40 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="size-4" /></span>
          {t("today.addOther")}
        </Button>
      </Card>
    </div>
  );
}

function HomeHero() {
  const j = useJournal();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const r = j.reminder;
  let left: string | null = null;
  if (r) {
    const d = dayDiff(today, localDateOf(r.at, j.tz));
    const ms = new Date(r.at).getTime() - Date.now();
    left = ms < 0 ? t("home.past") : d > 0 ? t("home.inDays", { n: d }) : ms >= 3600_000 ? t("home.inHours", { n: Math.floor(ms / 3600_000) }) : t("home.soon");
  }
  return (
    <section className="-mx-5 rounded-b-[32px] bg-primary px-5 pb-5 text-primary-foreground">
      <div className="relative flex items-end justify-between gap-2">
        <div className="min-w-0 pt-1 pb-3">
          <h1 className="text-[40px] font-bold leading-tight">{t("today.title")}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[17px] opacity-90">
            {fmtMonthDayWeekday(today)}
            {j.hasDemo && <span className="rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-sm">{t("home.example")}</span>}
          </p>
        </div>
        {j.settings.showMomo && <img src={momo} alt="" aria-hidden width={112} height={112} className="-mb-2 size-28 shrink-0 object-contain" />}
      </div>
      <Button variant="unstyled" size="unstyled" onClick={() => open("reminder")}
        className="press flex w-full items-center gap-3 rounded-[22px] border border-primary-foreground/15 bg-primary-foreground/10 p-3 text-left">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card text-foreground"><Syringe className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] opacity-90">{t("home.nextShot")}</span>
          <span className="block text-[19px] font-bold leading-snug">{r ? reminderText(r.at, j.tz) : t("reminder.set")}</span>
        </span>
        {left && <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[15px] font-semibold text-accent-foreground">{left}</span>}
        {!r && <ChevronRight className="size-5 shrink-0" />}
      </Button>
    </section>
  );
}

function Tile({ title, icon, tone = "card", onClick, to, children, demo }: { title: string; icon: ReactNode; tone?: "card" | "sage" | "peach"; onClick?: () => void; to?: "/injections" | "/journey"; children: ReactNode; demo?: boolean | undefined }) {
  const cls = cn("feel-panel press flex min-h-[176px] flex-col rounded-[24px] p-4 text-left shadow-soft", tone === "sage" ? "bg-secondary" : tone === "peach" ? "bg-accent" : "bg-card");
  const head = (
    <span className="flex items-center gap-2">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", tone === "card" ? "bg-secondary" : "bg-card/70")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{title}</span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </span>
  );
  const body = <>{head}{demo && <span className="mt-1"><DemoTag show /></span>}{children}</>;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return <Button variant="unstyled" size="unstyled" onClick={onClick} className={cn(cls, "items-stretch justify-start whitespace-normal")}>{body}</Button>;
}

function WeightTile() {
  const j = useJournal();
  const open = useQuickAdd();
  const w = latest(j.records, "weight");
  const today = todayLocal(j.tz);
  return (
    <Tile title={t("home.weight")} icon={<Scale className="size-5" />} onClick={() => open("weight", w)} demo={w?.demo}>
      {w ? (
        <>
          <span className="mt-auto flex items-baseline gap-1 pt-3">
            <span className="text-[38px] font-bold leading-none tracking-tight"><AnimatedValue value={w.value} digits={1} /></span>
            <span className="text-[17px] text-muted-foreground">{w.unit}</span>
          </span>
          <span className="mt-3 border-t pt-2 text-[15px] text-muted-foreground">{w.localDate === today ? t("today") : fmtMonthDay(w.localDate)}</span>
        </>
      ) : <span className="mt-auto pt-3 text-[17px] font-semibold">{t("home.weightAdd")}</span>}
    </Tile>
  );
}

function Face({ label }: { label: string }) {
  const tone = /편안|괜찮|calm|ok|bien|Ça va/i.test(label) ? "smile" : /그저|meh|Bof/i.test(label) ? "flat" : "down";
  const mouth = tone === "smile" ? "M20 34 q8 7 16 0" : tone === "flat" ? "M20 35 h16" : "M20 37 q8 -6 16 0";
  return (
    <svg viewBox="0 0 56 56" className="size-16" aria-hidden>
      <circle cx="28" cy="28" r="27" className="fill-card" />
      <path d="M16 24 q4 4 8 0 M32 24 q4 4 8 0" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d={mouth} stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ConditionTile() {
  const j = useJournal();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const c = latest(j.records.filter((r) => r.localDate === today), "condition");
  return (
    <Tile title={t("home.cond")} icon={<Smile className="size-5" />} tone="peach" onClick={() => open("condition", c)} demo={c?.demo}>
      {c ? (
        <span className="mt-auto flex flex-col items-center gap-1 pt-2">
          <Face label={c.label} />
          <span className="text-center text-[17px] font-bold leading-snug">{c.label}</span>
        </span>
      ) : <span className="mt-auto pt-3 text-[17px] font-semibold">{t("home.condAsk")}</span>}
    </Tile>
  );
}

function StockTile() {
  const j = useJournal();
  const known = j.hasStock || j.stock > 0;
  return (
    <Tile title={t("home.stock")} icon={<Package className="size-5" />} tone="sage" to="/injections">
      {known ? (
        <>
          <span className="mt-auto flex items-baseline gap-1 pt-3">
            <span className="text-[38px] font-bold leading-none"><AnimatedValue value={j.stock} digits={0} /></span>
            <span className="text-[17px] text-muted-foreground">{getLocale() === "ko" ? "" : " "}{t(`unit.${j.stockUnit}`)}</span>
          </span>
          {j.stockMedication && <span className="mt-2 truncate text-[15px] text-muted-foreground">{j.stockMedication}</span>}
        </>
      ) : (
        <span className="mt-auto pt-3">
          <span className="block text-[17px] font-semibold">{t("home.stockUnknown")}</span>
          <span className="block text-[15px] text-muted-foreground">{t("home.stockAdd")}</span>
        </span>
      )}
    </Tile>
  );
}

function MomentTile() {
  const j = useJournal();
  const open = useQuickAdd();
  const withPhoto = j.records.filter((r): r is Extract<JournalRecord, { type: "memory" }> => r.type === "memory" && !!r.photo).sort(sortByTime).at(-1);
  return (
    <div className="feel-panel flex min-h-[176px] flex-col rounded-[24px] bg-card p-4 shadow-soft">
      <Link to="/journey" className="press flex min-h-11 items-center gap-2">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary"><ImageIcon className="size-5" /></span>
        <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{t("home.moment")}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>
      <div className="my-2 flex flex-1 items-center justify-center">
        {withPhoto?.photo ? <PhotoImg src={withPhoto.photo} className="h-16 w-24 rounded-[12px] object-cover" />
          : <span className="flex h-16 w-24 items-center justify-center rounded-[12px] bg-secondary text-primary/50"><ImageIcon className="size-8" /></span>}
      </div>
      <Button variant="unstyled" size="unstyled" onClick={() => open("memory")} className="press flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-secondary px-2 text-[15px] font-semibold">
        <Camera className="size-5 shrink-0" />{t("home.photo")}
      </Button>
    </div>
  );
}

void fmtNumber;
