import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ChevronRight, Bell } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { fmtMonthDay, fmtMonthDayWeekday, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, DemoTag, RecordRow, SectionHeader } from "@/components/app/ui";
import { reminderText } from "@/components/app/ReminderCard";
import { formatPurchaseMoney } from "@/lib/purchase-money";
import { MomoSheet } from "@/components/app/MomoSheet";
const RecordFinder = lazy(() =>
  import("@/components/app/RecordFinder").then((module) => ({ default: module.RecordFinder })),
);
const PromptCarousel = lazy(() =>
  import("@/components/app/PromptCarousel").then((module) => ({ default: module.PromptCarousel })),
);

export const Route = createFileRoute("/today")({
  head: () => ({
    meta: [
      { title: "오늘 · my dear step" },
      { name: "description", content: "오늘의 체중, 컨디션, 다음 주사 알림과 남은 재고를 한눈에." },
      { property: "og:title", content: "오늘 · my dear step" },
      {
        property: "og:description",
        content: "오늘의 기록과 다음 주사 알림을 한눈에 보는 GLP-1 저널.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Today,
});

function Today() {
  const j = useJournal();
  const open = useQuickAdd();
  const [finding, setFinding] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const today = todayLocal(j.tz);
  const recent = useMemo(
    () =>
      [
        ...j.records.map((record) => ({
          id: record.id,
          date: record.localDate,
          record,
          purchase: undefined,
        })),
        ...j.purchases.map((purchase) => ({
          id: purchase.id,
          date: purchase.localDate,
          record: undefined,
          purchase,
        })),
      ]
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            (a.record && b.record ? sortByTime(a.record, b.record) : 0),
        )
        .slice(0, 5),
    [j.records, j.purchases],
  );
  const reminder = j.reminder && j.reminder.at >= new Date().toISOString() ? j.reminder : null;
  return (
    <div className="pb-4">
      <p className="momo-home-date flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
        {fmtMonthDayWeekday(today)}
        <DemoTag show={j.hasDemo} />
      </p>
      {!j.user && j.settings.demoMode && (
        <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("demo.notice")}
        </p>
      )}
      <MomoSheet
        key={`capture:${j.user?.id ?? "guest"}`}
        inline
        onDone={() => {}}
        onManual={() => open("menu")}
      />
      <Button
        variant="ghost"
        className="mt-2 min-h-12 w-full justify-center gap-2 whitespace-normal"
        aria-expanded={finding}
        onClick={() => setFinding((value) => !value)}
      >
        <Search className="size-5" />
        {t("mm.find")}
      </Button>
      {finding && (
        <Suspense
          fallback={
            <p role="status" className="py-4 text-sm">
              {t("ui.loading")}
            </p>
          }
        >
          <RecordFinder key={`finder:${j.user?.id ?? "guest"}`} />
        </Suspense>
      )}
      {reminder && (
        <Button
          variant="outline"
          className="mt-4 min-h-16 w-full justify-start whitespace-normal rounded-2xl text-left"
          onClick={() => open("reminder")}
        >
          <Bell className="size-5 shrink-0" />
          <span>
            <span className="block text-xs text-muted-foreground">
              {t("home.nextShot")} · {t("reminder.userSet")}
              <DemoTag show={reminder.demo} />
            </span>
            <span className="block font-semibold">{reminderText(reminder.at, j.tz)}</span>
          </span>
        </Button>
      )}
      <SectionHeader
        title={t("mm.recent")}
        action={
          <Link
            to="/history"
            className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
          >
            {t("today.seeAll")}
            <ChevronRight className="size-4" />
          </Link>
        }
      />
      <Card className="px-4">
        {!recent.length && (
          <p className="py-4 text-sm leading-relaxed text-muted-foreground">{t("mm.empty")}</p>
        )}
        <div className="divide-y">
          {recent.map((item) =>
            item.record ? (
              <RecordRow
                key={item.id}
                r={item.record}
                onEdit={() => open(item.record!.type, item.record)}
              />
            ) : item.purchase ? (
              <Button
                key={item.id}
                variant="unstyled"
                size="unstyled"
                className="record-row flex min-h-20 w-full items-center justify-between gap-2 py-3 text-left"
                onClick={() => open("purchase", item.purchase)}
              >
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">
                    {t(item.purchase.addsStock === false ? "type.expense" : "type.purchase")} ·{" "}
                    {fmtMonthDay(item.date)}
                    <DemoTag show={item.purchase.demo} />
                  </span>
                  <span className="block text-[16px] font-semibold">
                    {item.purchase.product ?? item.purchase.medication ?? t("type.expense")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold">
                  {formatPurchaseMoney(item.purchase)}
                </span>
              </Button>
            ) : null,
          )}
        </div>
      </Card>
      <details
        className="journal-disclosure mt-5"
        onToggle={(event) => setDailyOpen(event.currentTarget.open)}
      >
        <summary>{t("ctx.settings")}</summary>
        {dailyOpen && (
          <Suspense
            fallback={
              <p role="status" className="py-4 text-sm">
                {t("ui.loading")}
              </p>
            }
          >
            <PromptCarousel />
          </Suspense>
        )}
      </details>
    </div>
  );
}
