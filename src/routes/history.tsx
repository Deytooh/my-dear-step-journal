import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { fmtMonthDay, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal, type JournalRecord } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, PageTitle, RecordRow } from "@/components/app/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "모든 기록 · my dear step" },
      { name: "description", content: "체중, 주사, 컨디션, 치수, 순간 기록을 날짜별로 모아 보세요." },
      { property: "og:title", content: "모든 기록 · my dear step" },
      { property: "og:description", content: "내가 남긴 모든 기록을 한곳에서." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

type Filter = "all" | JournalRecord["type"];
const FILTERS: Filter[] = ["all", "weight", "injection", "condition", "measure", "memory"];

function History() {
  const j = useJournal();
  const open = useQuickAdd();
  const [filter, setFilter] = useState<Filter>("all");
  const today = todayLocal(j.tz);

  const groups = useMemo(() => {
    const list = j.records.filter((r) => filter === "all" || r.type === filter).sort(sortByTime);
    const map = new Map<string, JournalRecord[]>();
    list.forEach((r) => map.set(r.localDate, [...(map.get(r.localDate) ?? []), r]));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [j.records, filter]);

  return (
    <div>
      <PageTitle title={t("hist.title")} sub={t("hist.sub")} momoArt={false} />
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cn("press min-h-11 shrink-0 rounded-full border px-4 text-[15px]", filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            {f === "all" ? t("hist.all") : t(`type.${f}`)}
          </button>
        ))}
      </div>
      {groups.length === 0 ? <Card className="mt-4 p-8 text-center text-muted-foreground">{t("hist.empty")}</Card> : groups.map(([day, recs]) => (
        <section key={day} className="mt-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{day === today ? t("today") : fmtMonthDay(day)}</h2>
          <div className="divide-y">{recs.map((r) => <RecordRow key={r.id} r={r} onEdit={() => open(r.type, r)} />)}</div>
        </section>
      ))}
    </div>
  );
}
