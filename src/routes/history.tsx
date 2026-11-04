import { Button } from "@/components/ui/button";
import { TimelineRow } from "@/components/app/TimelineRow";
import { journalTimeline, type TimelineEntry } from "@/lib/journal-timeline";
import { RecordFinder } from "@/components/app/RecordFinder";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { fmtMonthDay, todayLocal } from "@/lib/dates";
import { useJournal, type JournalRecord } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, PageTitle, EmptyState } from "@/components/app/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "모든 기록 · my dear step" },
      {
        name: "description",
        content: "체중, 주사, 컨디션, 치수, 순간 기록을 날짜별로 모아 보세요.",
      },
      { property: "og:title", content: "모든 기록 · my dear step" },
      { property: "og:description", content: "내가 남긴 모든 기록을 한곳에서." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

type Filter = "all" | "purchase" | "expense" | JournalRecord["type"];
const FILTERS: Filter[] = [
  "all",
  "weight",
  "injection",
  "condition",
  "measure",
  "memory",
  "water",
  "meal",
  "purchase",
  "expense",
];

function History() {
  const j = useJournal();
  const open = useQuickAdd();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const today = todayLocal(j.tz);

  const hasEntries = j.records.length + j.purchases.length > 0;
  const invalidRange = !!from && !!until && from > until;
  const clearFilters = () => {
    setFrom("");
    setUntil("");
    setFilter("all");
  };
  const groups = useMemo(() => {
    const list = journalTimeline(j.records, j.purchases).filter(
      ({ kind, value }) =>
        (filter === "all" ||
          (kind === "record"
            ? value.type === filter
            : (value.addsStock === false ? "expense" : "purchase") === filter)) &&
        (!from || value.localDate >= from) &&
        (!until || value.localDate <= until),
    );
    const map = new Map<string, TimelineEntry[]>();
    list.forEach((entry) => {
      const day = entry.value.localDate;
      map.set(day, [...(map.get(day) ?? []), entry]);
    });
    return [...map.entries()];
  }, [j.records, j.purchases, filter, from, until]);

  return (
    <div>
      <PageTitle title={t("hist.title")} sub={t("hist.sub")} momoArt={false} />
      <RecordFinder />
      <details className="journal-disclosure my-3">
        <summary className="min-h-11 cursor-pointer py-3">{t("hist.range")}</summary>
        <div className="journal-clock-fields grid grid-cols-2 gap-3">
          <label>
            {t("hist.from")}
            <input
              className="min-h-12 w-full rounded-xl border bg-card px-2"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("hist.until")}
            <input
              className="min-h-12 w-full rounded-xl border bg-card px-2"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
        </div>
      </details>
      <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "feel-chip press min-h-11 shrink-0 rounded-full border px-4 text-[15px]",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {f === "all" ? t("hist.all") : t(`type.${f}`)}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <Card className="mt-4">
          <EmptyState>
            <span role={invalidRange ? "alert" : undefined}>
              {t(invalidRange ? "hist.invalidRange" : hasEntries ? "hist.noMatches" : "hist.empty")}
            </span>
          </EmptyState>
          <div className="px-4 pb-4">
            <Button
              className="min-h-12 w-full rounded-full"
              onClick={hasEntries || invalidRange ? clearFilters : () => open("menu")}
            >
              {t(hasEntries || invalidRange ? "hist.clearFilters" : "nav.add")}
            </Button>
          </div>
        </Card>
      ) : (
        groups.map(([day, recs]) => (
          <section key={day} className="mt-5">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {day === today ? t("today") : fmtMonthDay(day)}
            </h2>
            <div className="history-group mt-2 divide-y">
              {recs.map((r) => (
                <TimelineRow key={`${r.kind}:${r.value.id}`} entry={r} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
