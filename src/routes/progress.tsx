import { journalCSV } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { PhotoImg } from "@/components/app/PhotoImg";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  Plus,
  Ruler,
  Scale,
  Syringe,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Area, AreaChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { t, fmtNumber } from "@/lib/i18n";
import { addDays, fmtMonthDay, fmtTime, todayLocal } from "@/lib/dates";
import {
  sortByTime,
  useJournal,
  type InjectionRec,
  type MeasureRec,
  type MemoryRec,
  type WeightRec,
} from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { AnimatedValue } from "@/components/app/AppFeel";
import {
  Card,
  EmptyState,
  DemoTag,
  IconBubble,
  measureSummary,
  PageTitle,
  recordValue,
  SectionHeader,
  Segmented,
} from "@/components/app/ui";

const ts = (d: string) => Date.parse(d + "T12:00:00Z");
const CHART_L = 40,
  CHART_R = 12;

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "나의 변화 · my dear step" },
      { name: "description", content: "체중 변화와 주사 기록, 내가 남긴 순간을 함께 돌아보세요." },
      { property: "og:title", content: "나의 변화 · my dear step" },
      { property: "og:description", content: "숫자와 순간을 함께 돌아보는 나의 여정." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Progress,
});

function Progress() {
  const j = useJournal();
  const open = useQuickAdd();
  const [metric, setMetric] = useState<"weight" | "measure" | "photo">("weight");
  const [range, setRange] = useState<"1m" | "3m" | "all">("1m");
  const today = todayLocal(j.tz);
  const weights = j.records.filter((r): r is WeightRec => r.type === "weight").sort(sortByTime);
  const memories = j.records.filter((r): r is MemoryRec => r.type === "memory").sort(sortByTime);
  const measures = j.records.filter((r): r is MeasureRec => r.type === "measure").sort(sortByTime);
  const latest = weights[0];
  const from = range === "1m" ? addDays(today, -30) : range === "3m" ? addDays(today, -91) : "0000";

  const data = useMemo(() => {
    const byDay = new Map<string, WeightRec>();
    [...weights].reverse().forEach((w) => byDay.set(w.localDate, w)); // latest per day wins
    return [...byDay.entries()]
      .filter(([d]) => d >= from)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, w]) => ({ d, ts: ts(d), v: w.value, demo: !!w.demo }));
  }, [weights, from]);
  const injDays = j.records.filter(
    (r): r is InjectionRec => r.type === "injection" && r.localDate >= from && r.localDate <= today,
  );
  const allDays = [...data.map((p) => p.d), ...injDays.map((i) => i.localDate)].sort();
  const x0 = ts(range === "all" ? (allDays[0] ?? today) : from);
  const x1 = ts(today);
  const hasDemoPoints = data.some((p) => p.demo) || injDays.some((i) => i.demo);

  const exportCsv = () => {
    const csv = journalCSV(j.snapshot());
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `my-dear-step-${today}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toast.exported"));
  };

  return (
    <div>
      <PageTitle title={t("prog.title")} sub={t("prog.sub")} />

      <Card className="flex items-center gap-4 p-5">
        <IconBubble>
          <Scale className="size-7" />
        </IconBubble>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground">
            {t("prog.latest")}
            <DemoTag show={latest?.demo} />
          </div>
          <div className="text-[32px] font-bold leading-tight">
            {latest ? (
              <>
                <AnimatedValue value={latest.value} /> <span className="text-[20px]">kg</span>
              </>
            ) : (
              "—"
            )}
          </div>
          {latest && (
            <div className="text-sm text-muted-foreground">
              {fmtMonthDay(latest.localDate)}
              {latest.at ? ` ${fmtTime(latest.at, j.tz)}` : ""} · {t("prog.mine")}
            </div>
          )}
        </div>
        <Button
          variant="unstyled"
          size="unstyled"
          onClick={() => open("weight")}
          className="press flex h-11 items-center gap-1 rounded-full border border-primary px-4 font-semibold"
        >
          <Plus className="size-4" />
          {t("type.weight")}
        </Button>
      </Card>

      <Link
        to="/journey"
        className="press mt-4 flex w-full items-center gap-4 rounded-[24px] bg-card p-4 text-left shadow-soft"
      >
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-[16px] bg-peach">
          {memories[0]?.photo ? (
            <PhotoImg src={memories[0].photo} className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6" />
          )}
        </span>
        <span className="flex-1">
          <span className="block font-bold">{t("prog.journey")}</span>
          <span className="block text-sm text-muted-foreground">{t("prog.journeySub")}</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <div className="mt-5">
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: "weight", label: t("prog.tWeight") },
            { value: "measure", label: t("prog.tMeasure") },
            { value: "photo", label: t("prog.tPhoto") },
          ]}
        />
      </div>

      {metric === "weight" && (
        <div key={metric} className="feel-panel">
          <div className="mt-3">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: "1m", label: t("prog.1m") },
                { value: "3m", label: t("prog.3m") },
                { value: "all", label: t("prog.all") },
              ]}
            />
          </div>
          <Card className="mt-3 p-4">
            {data.length === 0 && injDays.length === 0 ? (
              <EmptyState icon={<Scale className="size-5" />}>{t("prog.noData")}</EmptyState>
            ) : (
              <>
                <p className="mb-1 text-sm font-medium text-muted-foreground">
                  {t("chart.unit")}
                  {hasDemoPoints && <DemoTag show />}
                </p>
                <div className="h-56" aria-hidden>
                  <ResponsiveContainer>
                    <AreaChart data={data} margin={{ top: 18, right: CHART_R, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="var(--color-chart-4)" stopOpacity={0.25} />
                          <stop offset="1" stopColor="var(--color-chart-4)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={[x0, x1]}
                        tickFormatter={(v: number) =>
                          fmtMonthDay(new Date(v).toISOString().slice(0, 10))
                        }
                        tick={{ fontSize: 13, fill: "var(--color-muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        width={CHART_L}
                        domain={["dataMin - 0.5", "dataMax + 0.5"]}
                        tickFormatter={(v: number) => fmtNumber(v)}
                        tick={{ fontSize: 13, fill: "var(--color-muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        tickCount={4}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${fmtNumber(v)} kg`, t("type.weight")]}
                        labelFormatter={(v) =>
                          fmtMonthDay(new Date(Number(v)).toISOString().slice(0, 10))
                        }
                        contentStyle={{
                          borderRadius: 16,
                          border: "1px solid var(--color-border)",
                          background: "var(--card)",
                          boxShadow: "var(--shadow-soft)",
                          padding: "10px 14px",
                          fontSize: 14,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        fill="url(#wf)"
                        dot={{ r: 3.5, fill: "var(--color-primary)" }}
                        isAnimationActive={false}
                      >
                        {data.length <= 8 && (
                          <LabelList
                            dataKey="v"
                            position="top"
                            formatter={(v: number) => fmtNumber(v)}
                            style={{ fontSize: 12, fill: "var(--color-foreground)" }}
                          />
                        )}
                      </Area>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {/* Injection band: same time axis as the chart, independent of weigh-ins. */}
                <div
                  className="relative mt-1 h-11 rounded-full bg-peach/60"
                  style={{ marginLeft: CHART_L, marginRight: CHART_R }}
                  role="group"
                  aria-label={t("chart.injBand")}
                >
                  {injDays.map((i) => {
                    const pct = x1 === x0 ? 50 : ((ts(i.localDate) - x0) / (x1 - x0)) * 100;
                    return (
                      <Button
                        variant="unstyled"
                        size="unstyled"
                        key={i.id}
                        onClick={() => open("injection", i)}
                        style={{ left: `${pct}%` }}
                        aria-label={`${t("chart.openInj")}: ${fmtMonthDay(i.localDate)} · ${recordValue(i)}${i.demo ? ` (${t("demo.badge")})` : ""}`}
                        className="press absolute top-0 flex size-11 -translate-x-1/2 items-center justify-center rounded-full"
                      >
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full border-2 border-card bg-peach-accent",
                            i.demo && "opacity-70",
                          )}
                        >
                          <Syringe className="size-3.5" />
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="mt-3 flex justify-center gap-6 rounded-full border py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-primary" />
                {t("prog.legendW")}
              </span>
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-peach-accent" />
                {t("prog.legendI")}
              </span>
            </div>
            {data.length > 0 && (
              <details className="journal-disclosure mt-3 text-[15px]">
                <summary className="press flex min-h-11 cursor-pointer items-center font-medium">
                  {t("chart.table")}
                </summary>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-sm text-muted-foreground">
                      <th scope="col" className="py-1 font-medium">
                        {t("f.date")}
                      </th>
                      <th scope="col" className="py-1 font-medium">
                        {t("chart.unit")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data].reverse().map((p) => (
                      <tr key={p.d} className="border-t">
                        <td className="py-1.5">
                          {fmtMonthDay(p.d)}
                          {p.demo && <DemoTag show />}
                        </td>
                        <td className="py-1.5 font-semibold">{fmtNumber(p.v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </Card>

          <SectionHeader
            title={t("prog.recent")}
            action={
              <Link to="/history" className="text-sm font-medium text-primary">
                {t("hist.open")}
              </Link>
            }
          />
          <div className="history-group divide-y">
            {weights.slice(0, 5).map((w) => (
              <Button
                variant="unstyled"
                size="unstyled"
                key={w.id}
                onClick={() => open("weight", w)}
                className="record-row press flex w-full items-center gap-3 py-4 text-left"
              >
                <IconBubble size="sm">
                  <Scale className="size-5" />
                </IconBubble>
                <span className="min-w-0 flex-1">
                  <span className="block text-[22px] font-semibold tabular-nums">
                    {fmtNumber(w.value)} kg
                    <DemoTag show={w.demo} />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {fmtMonthDay(w.localDate)} · {t("prog.manual")}
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {metric === "measure" && (
        <div key={metric} className="feel-panel mt-4">
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={() => open("measure")}
            className="press flex h-11 w-full items-center justify-center gap-1 rounded-full border border-primary font-semibold"
          >
            <Plus className="size-4" />
            {t("meas.add")}
          </Button>
          {measures.length === 0 ? (
            <Card className="mt-3">
              <EmptyState icon={<Ruler className="size-5" />}>{t("meas.empty")}</EmptyState>
            </Card>
          ) : (
            <div className="history-group mt-3 divide-y">
              {measures.map((m, i) => {
                const prev = measures[i + 1];
                const dw = m.waist != null && prev?.waist != null ? m.waist - prev.waist : null;
                return (
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    key={m.id}
                    onClick={() => open("measure", m)}
                    className="record-row press flex w-full items-center gap-3 py-4 text-left"
                  >
                    <IconBubble size="sm">
                      <Ruler className="size-5" />
                    </IconBubble>
                    <span className="w-16 text-muted-foreground">{fmtMonthDay(m.localDate)}</span>
                    <span className="flex-1 font-semibold">
                      {measureSummary(m)}
                      <DemoTag show={m.demo} />
                      {dw != null && dw !== 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("f.waist")} {dw > 0 ? "+" : ""}
                          {fmtNumber(dw)} cm
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {metric === "photo" && (
        <div key={metric} className="feel-panel mt-4">
          {memories.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">{t("journey.empty")}</p>
              <Button
                variant="unstyled"
                size="unstyled"
                onClick={() => open("memory")}
                className="press mt-4 h-11 rounded-full bg-primary px-5 text-primary-foreground"
              >
                {t("pr.memoryA")}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {memories.map((m) => (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  key={m.id}
                  onClick={() => open("memory", m)}
                  className="press overflow-hidden rounded-[20px] bg-card text-left shadow-soft"
                >
                  {m.photo && <PhotoImg src={m.photo} className="memory-photo" />}
                  <div className="p-3">
                    <div className="text-xs text-muted-foreground">{fmtMonthDay(m.localDate)}</div>
                    <div className="line-clamp-2 text-sm">{m.note}</div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        variant="unstyled"
        size="unstyled"
        onClick={exportCsv}
        className="press mt-4 flex w-full items-center gap-4 border-t py-4 text-left"
      >
        <IconBubble tone="peach" size="sm">
          <Download className="size-5" />
        </IconBubble>
        <span className="flex-1 text-[17px]">{t("prog.export")}</span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Button>
    </div>
  );
}
