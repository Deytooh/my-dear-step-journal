import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { fmtMonthDayWeekday, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, RecordRow, SectionHeader } from "@/components/app/ui";
import { NextReminder, StockLine } from "@/components/app/ReminderCard";
import { VoiceCard } from "@/components/app/QuickAddSheet";
import { PromptCarousel } from "@/components/app/PromptCarousel";
import banner from "@/assets/momo-banner.jpg";

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

function Today() {
  const j = useJournal();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const records = j.records.filter((r) => r.localDate === today).sort(sortByTime).reverse();

  return (
    <div>
      <h1 className="pt-3 text-[30px] font-bold leading-tight">{t("today.title")}</h1>
      <p className="mt-1 text-[16px] text-muted-foreground">{fmtMonthDayWeekday(today)}</p>

      {j.settings.showMomo && (
        <Link to="/progress" className="press relative mt-5 block h-28 overflow-hidden rounded-[24px]" aria-label={t("journey")}>
          <img src={banner} alt="" width={1536} height={640} className="size-full object-cover object-[18%_22%]" />
          <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-[10px] bg-card/90 px-3 py-1.5 text-sm font-semibold">
            {t("journey")} <ChevronRight className="size-4" />
          </span>
        </Link>
      )}

      {j.hasDemo && <p className="mt-4 rounded-[12px] bg-accent px-4 py-2 text-sm text-muted-foreground">{t("demo.banner")}</p>}

      <Card className="mt-4 bg-peach p-5 shadow-none">
        <NextReminder />
        <div className="my-4 h-px bg-border" />
        <StockLine />
      </Card>

      <PromptCarousel />

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

      <VoiceCard title={t("voice.title")} sub={t("voice.sub")} onClick={() => open("voice")} />
    </div>
  );
}
