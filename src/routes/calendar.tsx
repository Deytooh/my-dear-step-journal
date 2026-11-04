import { TimelineRow } from "@/components/app/TimelineRow";
import { journalTimeline, shiftCalendarMonth } from "@/lib/journal-timeline";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n";
import {
  addDays,
  fmtMonthDayWeekday,
  fmtYearMonth,
  localDateOf,
  monthGrid,
  todayLocal,
  weekdayLabels,
} from "@/lib/dates";
import { useJournal } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, PageTitle, EmptyState } from "@/components/app/ui";
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
  const [sel, setSel] = useState(today);
  const calendarId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  useLayoutEffect(() => {
    if (!focusDay.current) return;
    focusDay.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${sel}"]`)?.focus();
  }, [sel]);
  const selectDay = (date: string) => {
    focusDay.current = date !== sel;
    if (date === sel)
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
    setSel(date);
  };
  const navigateDay = (event: KeyboardEvent<HTMLButtonElement>, date: string, weekday: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: string;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(date, -1);
        break;
      case "ArrowRight":
        next = addDays(date, 1);
        break;
      case "ArrowUp":
        next = addDays(date, -7);
        break;
      case "ArrowDown":
        next = addDays(date, 7);
        break;
      case "Home":
        next = addDays(date, -weekday);
        break;
      case "End":
        next = addDays(date, 6 - weekday);
        break;
      case "PageUp":
        next = shiftCalendarMonth(date, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = shiftCalendarMonth(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    selectDay(next);
  };
  const ym = { y: Number(sel.slice(0, 4)), m: Number(sel.slice(5, 7)) };
  const grid = monthGrid(ym.y, ym.m);
  const entries = journalTimeline(j.records, j.purchases);
  const recordDays = new Set(entries.map((entry) => entry.value.localDate));
  const reminderDay = j.reminder ? localDateOf(j.reminder.at, j.tz) : null;
  const shift = (n: number) => setSel((selected) => shiftCalendarMonth(selected, n));
  const dayRecords = entries.filter((entry) => entry.value.localDate === sel);

  return (
    <div>
      <PageTitle title={t("cal.title")} sub={t("cal.sub")} />
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          className="min-h-11 rounded-full"
          onClick={() => selectDay(today)}
          disabled={sel === today}
        >
          {t("today")}
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-primary/5 bg-secondary/70 px-3 pt-3">
          <div className="flex items-center justify-between">
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => shift(-1)}
              className="press flex size-11 items-center justify-center rounded-2xl border border-primary/10 bg-card"
              aria-label={t("cal.prevMonth")}
            >
              <ChevronLeft />
            </Button>
            <h2 id={`${calendarId}-month`} className="text-[20px] font-bold" aria-live="polite">
              {fmtYearMonth(ym.y, ym.m)}
            </h2>
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => shift(1)}
              className="press flex size-11 items-center justify-center rounded-2xl border border-primary/10 bg-card"
              aria-label={t("cal.nextMonth")}
            >
              <ChevronRight />
            </Button>
          </div>
          <div
            aria-hidden="true"
            className="grid grid-cols-7 pt-3 pb-2 text-center text-[13px] font-medium text-muted-foreground"
          >
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
        <p id={`${calendarId}-keys`} className="sr-only">
          {t("cal.keyboardHelp")}
        </p>
        <div
          ref={gridRef}
          key={`${ym.y}-${ym.m}`}
          className="feel-panel grid min-h-[324px] content-start gap-y-1 px-2 py-2 text-center"
          role="grid"
          aria-labelledby={`${calendarId}-month`}
          aria-describedby={`${calendarId}-keys`}
        >
          {Array.from({ length: grid.length / 7 }, (_, week) => (
            <div key={week} role="row" className="grid grid-cols-7">
              {grid.slice(week * 7, week * 7 + 7).map((c) => {
                const isSel = c.date === sel;
                const recorded = recordDays.has(c.date);
                const planned = reminderDay === c.date;
                const description = [recorded && t("cal.recorded"), planned && t("cal.planned")]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={c.date} role="gridcell" aria-selected={isSel}>
                    <Button
                      variant="unstyled"
                      size="unstyled"
                      data-date={c.date}
                      tabIndex={isSel ? 0 : -1}
                      onClick={() => selectDay(c.date)}
                      onKeyDown={(event) => navigateDay(event, c.date, c.weekday)}
                      aria-label={fmtMonthDayWeekday(c.date)}
                      aria-describedby={description ? `${calendarId}-${c.date}-status` : undefined}
                      aria-current={c.date === today ? "date" : undefined}
                      aria-pressed={isSel}
                      className="calendar-day press flex min-h-12 w-full flex-col items-center justify-center rounded-xl"
                    >
                      <span
                        className={cn(
                          "flex size-10 flex-col items-center justify-center rounded-[14px] text-[15px]",
                          !c.inMonth && "text-muted-foreground/50",
                          c.inMonth && c.weekday === 5 && "text-weekend-sat",
                          c.inMonth && c.weekday === 6 && "text-peach-accent",
                          isSel && "bg-primary font-bold !text-primary-foreground",
                          !isSel && c.date === today && "ring-1 ring-primary",
                        )}
                      >
                        {c.day}
                        <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
                          {recorded && (
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                isSel ? "bg-primary-foreground" : "bg-primary",
                              )}
                            />
                          )}
                          {planned && <Bell className="size-3 text-peach-accent" />}
                        </span>
                      </span>
                    </Button>
                    {description && (
                      <span id={`${calendarId}-${c.date}-status`} className="sr-only">
                        {description}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
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
      <div key={sel} className="history-group feel-list divide-y">
        {dayRecords.map((r) => (
          <TimelineRow key={`${r.kind}:${r.value.id}`} entry={r} />
        ))}
        {dayRecords.length === 0 && (
          <EmptyState icon={<Bell className="size-5" />}>{t("cal.empty")}</EmptyState>
        )}
        {reminderDay && (reminderDay === sel || sel === today) && (
          <div className="py-4">
            <NextReminder variant="plain" />
          </div>
        )}
      </div>
    </div>
  );
}
