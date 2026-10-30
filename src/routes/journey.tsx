import { PhotoImg } from "@/components/app/PhotoImg";
import { createFileRoute } from "@tanstack/react-router";
import { Flag, Image as ImageIcon, Scale } from "lucide-react";
import { t, fmtNumber } from "@/lib/i18n";
import { fmtMonthDay } from "@/lib/dates";
import { sortByTime, useJournal, type MemoryRec, type WeightRec } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, DemoTag, IconBubble, PageTitle, EmptyState } from "@/components/app/ui";
import { RecordFinder } from "@/components/app/RecordFinder";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "내 사진과 작은 여정 · my dear step" },
      { name: "description", content: "내가 남긴 사진과 순간, 체중 변화를 시간순으로 돌아보세요." },
      { property: "og:title", content: "내 사진과 작은 여정 · my dear step" },
      { property: "og:description", content: "순간과 변화를 함께 담은 나의 여정." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Journey,
});

function Journey() {
  const j = useJournal();
  const open = useQuickAdd();
  const weights = j.records.filter((r): r is WeightRec => r.type === "weight").sort(sortByTime);
  const first = weights[weights.length - 1];
  const memories = j.records.filter((r): r is MemoryRec => r.type === "memory").sort(sortByTime);
  // nearest weight on or before each memory's day, to show change since the start
  const weightOn = (day: string) => weights.find((w) => w.localDate <= day);

  return (
    <div>
      <PageTitle title={t("journey.title")} sub={t("journey.sub")} />
      <RecordFinder />
      <button
        onClick={() => open("memory")}
        className="press mt-4 flex h-12 w-full items-center justify-center gap-1 rounded-full border border-primary font-semibold"
      >
        <Plus className="size-4" />
        {t("pr.memoryA")}
      </button>
      {memories.length === 0 && (
        <Card className="mt-4">
          <EmptyState icon={<ImageIcon className="size-5" />}>{t("journey.empty")}</EmptyState>
        </Card>
      )}
      <ol className="relative mt-5 border-l border-primary/15 pl-5">
        {memories.map((m) => {
          const w = weightOn(m.localDate);
          const diff = w && first ? w.value - first.value : null;
          return (
            <li key={m.id} className="mb-6">
              <span
                className="absolute -left-[5px] mt-2 size-2 rounded-full bg-peach-accent ring-4 ring-background"
                aria-hidden
              />
              <button
                onClick={() => open("memory", m)}
                className="app-surface press w-full overflow-hidden rounded-[22px] bg-card text-left shadow-soft"
              >
                {m.photo ? (
                  <PhotoImg src={m.photo} className="memory-photo" />
                ) : (
                  <div className="flex h-20 items-center justify-center bg-peach">
                    <ImageIcon className="size-6" />
                  </div>
                )}
                <div className="p-4">
                  <div className="text-sm text-muted-foreground">
                    {fmtMonthDay(m.localDate)}
                    <DemoTag show={m.demo} />
                  </div>
                  {m.note && (
                    <p className="mt-2 whitespace-pre-wrap text-[16px] leading-relaxed">{m.note}</p>
                  )}
                  {w && (
                    <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                      <Scale className="size-4" />
                      {fmtNumber(w.value)} kg
                      {diff != null &&
                        diff !== 0 &&
                        ` · ${t("journey.change", { v: `${diff > 0 ? "+" : ""}${fmtNumber(diff)}` })}`}
                    </p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
        {first && (
          <li className="flex items-center gap-3">
            <span
              className="absolute -left-[5px] size-2 rounded-full bg-primary ring-4 ring-background"
              aria-hidden
            />
            <IconBubble size="sm">
              <Flag className="size-5" />
            </IconBubble>
            <span>
              <span className="block font-bold">
                {t("journey.start")} · {fmtNumber(first.value)} kg
              </span>
              <span className="text-sm text-muted-foreground">{fmtMonthDay(first.localDate)}</span>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
