import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n";
import {
  fmtMonthDayWeekday,
  fmtYearMonth,
  localDateOf,
  monthGrid,
  todayLocal,
  weekdayLabels,
} from "@/lib/dates";
import { sortByTime, useJournal } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, PageTitle, RecordRow } from "@/components/app/ui";
import { NextReminder } from "@/components/app/ReminderCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "캘린더 · my dear step" },
      { name: "description", content: "남긴 기록과 예정된 주사 알림을 달력으로 확인하세요." },
      { property: "og:title", content: "캘린더 · my dear step" },
      { property: "og:description", content: "기록과 알림을 한눈에 보는 달력." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const j = useJournal();
  const WD = weekdayLabels();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [sel, setSel] = useState(today);
  const grid = monthGrid(ym.y, ym.m);
  const recordDays = new Set(j.records.map((r) => r.localDate));
  const reminderDay = j.reminder ? localDateOf(j.reminder.at, j.tz) : null;
  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const mm = m + n;
      return { y: y + Math.floor((mm - 1) / 12), m: ((mm - 1 + 12) % 12) + 1 };
    });
  const dayRecords = j.records.filter((r) => r.localDate === sel).sort(sortByTime);

  return (
    <div>
      <PageTitle title={t("cal.title")} sub={t("cal.sub")} />
      <Card className="overflow-hidden">
        <div className="bg-peach/60 px-4 pt-4">
          <div className="flex items-center justify-between">
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => shift(-1)}
              className="press flex size-11 items-center justify-center"
              aria-label={t("cal.prevMonth")}
            >
              <ChevronLeft />
            </Button>
            <h2 className="text-[20px] font-bold" aria-live="polite">
              {fmtYearMonth(ym.y, ym.m)}
            </h2>
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => shift(1)}
              className="press flex size-11 items-center justify-center"
              aria-label={t("cal.nextMonth")}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 py-2 text-center text-[15px]">
            {WD.map((w, i) => (
              <span
                key={w}
                className={cn(i === 5 && "text-weekend-sat", i === 6 && "text-peach-accent")}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
        <div
          key={`${ym.y}-${ym.m}`}
          className="feel-panel grid grid-cols-7 gap-y-1 px-2 py-2 text-center"
          role="grid"
        >
          {grid.map((c) => {
            const isSel = c.date === sel;
            return (
              <Button
                variant="unstyled"
                size="unstyled"
                key={c.date}
                onClick={() => setSel(c.date)}
                aria-label={fmtMonthDayWeekday(c.date)}
                aria-pressed={isSel}
                className="press flex h-14 flex-col items-center justify-center"
              >
                <span
                  className={cn(
                    "flex size-11 flex-col items-center justify-center rounded-full text-[16px]",
                    !c.inMonth && "text-muted-foreground/50",
                    c.inMonth && c.weekday === 5 && "text-weekend-sat",
                    c.inMonth && c.weekday === 6 && "text-peach-accent",
                    isSel && "bg-primary font-bold !text-primary-foreground",
                    !isSel && c.date === today && "ring-1 ring-primary",
                  )}
                >
                  {c.day}
                  <span className="flex h-2 items-center gap-0.5">
                    {recordDays.has(c.date) && (
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          isSel ? "bg-primary-foreground" : "bg-primary",
                        )}
                      />
                    )}
                    {reminderDay === c.date && <Bell className="size-3 text-peach-accent" />}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
        <div className="mx-4 flex items-center justify-center gap-6 border-t py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-primary" />
            {t("cal.recorded")}
          </span>
          <span className="flex items-center gap-2">
            <Bell className="size-4 text-peach-accent" />
            {t("cal.planned")}
          </span>
        </div>
      </Card>

      <Button
        className="mt-4 min-h-12 w-full rounded-full"
        onClick={() => open("menu", undefined, sel)}
      >
        {t("nav.add")} · {fmtMonthDayWeekday(sel)}
      </Button>
      <h2 className="mt-7 mb-1 text-[22px] font-bold">{fmtMonthDayWeekday(sel)}</h2>
      <div key={sel} className="feel-list divide-y">
        {dayRecords.map((r) => (
          <RecordRow key={r.id} r={r} trailing="chevron" onEdit={() => open(r.type, r)} />
        ))}
        {dayRecords.length === 0 && <p className="py-5 text-muted-foreground">{t("cal.empty")}</p>}
        {reminderDay && (reminderDay === sel || sel === today) && (
          <div className="py-4">
            <NextReminder variant="plain" />
          </div>
        )}
      </div>
    </div>
  );
}
