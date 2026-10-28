import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Download, Plus, Ruler, Scale, Image as ImageIcon } from "lucide-react";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { t, fmtNumber } from "@/lib/i18n";
import { addDays, fmtMonthDay, fmtTime, todayLocal } from "@/lib/dates";
import { sortByTime, useJournal, type InjectionRec, type MeasureRec, type MemoryRec, type WeightRec } from "@/lib/journal";
import { useQuickAdd } from "@/components/app/AppShell";
import { Card, DemoTag, IconBubble, measureSummary, PageTitle, recordValue, SectionHeader, Segmented } from "@/components/app/ui";

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
    const byDay = new Map<string, number>();
    [...weights].reverse().forEach((w) => byDay.set(w.localDate, w.value)); // latest per day wins
    return [...byDay.entries()].filter(([d]) => d >= from).sort().map(([d, v]) => ({ d, v }));
  }, [weights, from]);
  const injDays = j.records.filter((r): r is InjectionRec => r.type === "injection" && r.localDate >= from);
  const dataDays = new Set(data.map((p) => p.d));

  const exportCsv = () => {
    const rows = [["type", "local_date", "precision", "instant", "value", "demo"]];
    j.records.forEach((r) => rows.push([r.type, r.localDate, r.precision, r.at ?? "", recordValue(r), r.demo ? "yes" : "no"]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `my-dear-step-${today}.csv` });
    a.click(); URL.revokeObjectURL(url);
    toast.success(t("toast.exported"));
  };

  return (
    <div>
      <PageTitle title={t("prog.title")} sub={t("prog.sub")} />

      <Card className="flex items-center gap-4 p-5">
        <IconBubble><Scale className="size-7" /></IconBubble>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground">{t("prog.latest")}<DemoTag show={latest?.demo} /></div>
          <div className="text-[32px] font-bold leading-tight">{latest ? <>{fmtNumber(latest.value)} <span className="text-[20px]">kg</span></> : "—"}</div>
          {latest && <div className="text-sm text-muted-foreground">{fmtMonthDay(latest.localDate)}{latest.at ? ` ${fmtTime(latest.at, j.tz)}` : ""} · {t("prog.mine")}</div>}
        </div>
        <button onClick={() => open("weight")} className="press flex h-11 items-center gap-1 rounded-full border border-primary px-4 font-semibold"><Plus className="size-4" />{t("type.weight")}</button>
      </Card>

      <Link to="/journey" className="press mt-4 flex w-full items-center gap-4 rounded-[24px] bg-card p-4 text-left shadow-soft">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-[16px] bg-peach">
          {memories[0]?.photo ? <img src={memories[0].photo} alt="" className="size-full object-cover" /> : <ImageIcon className="size-6" />}
        </span>
        <span className="flex-1"><span className="block font-bold">{t("prog.journey")}</span><span className="block text-sm text-muted-foreground">{t("prog.journeySub")}</span></span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <div className="mt-5"><Segmented value={metric} onChange={setMetric} options={[{ value: "weight", label: t("prog.tWeight") }, { value: "measure", label: t("prog.tMeasure") }, { value: "photo", label: t("prog.tPhoto") }]} /></div>

      {metric === "weight" && (
        <>
          <div className="mt-3"><Segmented size="sm" value={range} onChange={setRange} options={[{ value: "1m", label: t("prog.1m") }, { value: "3m", label: t("prog.3m") }, { value: "all", label: t("prog.all") }]} /></div>
          <Card className="mt-3 p-4">
            {data.length < 2 ? <p className="py-10 text-center text-muted-foreground">{t("prog.noData")}</p> : (
              <div className="h-48" role="img" aria-label={`체중 그래프, ${data.length}개 기록`}>
                <ResponsiveContainer>
                  <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <defs><linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-chart-4)" stopOpacity={0.25} /><stop offset="1" stopColor="var(--color-chart-4)" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="d" tickFormatter={(d) => fmtMonthDay(d)} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis hide domain={["dataMin - 0.5", "dataMax + 0.5"]} />
                    <Tooltip formatter={(v: number) => [`${fmtNumber(v)} kg`, t("type.weight")]} labelFormatter={(d) => fmtMonthDay(String(d))} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                    <Area type="monotone" dataKey="v" stroke="var(--color-primary)" strokeWidth={2} fill="url(#wf)" dot={{ r: 3.5, fill: "var(--color-primary)" }} isAnimationActive={false} />
                    {injDays.filter((i) => dataDays.has(i.localDate)).map((i) => (
                      <ReferenceDot key={i.id} x={i.localDate} y={data.find((p) => p.d === i.localDate)!.v} r={6} fill="var(--color-peach-accent)" stroke="var(--color-card)" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex justify-center gap-6 rounded-full border py-2 text-sm">
              <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-primary" />{t("prog.legendW")}</span>
              <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-peach-accent" />{t("prog.legendI")}</span>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">주사 표시는 같은 날 체중 기록이 있을 때만 그래프에 나타나요.</p>
          </Card>

          <SectionHeader title={t("prog.recent")} action={<Link to="/history" className="text-sm font-medium text-primary">{t("hist.open")}</Link>} />
          <div className="divide-y">
            {weights.slice(0, 5).map((w) => (
              <button key={w.id} onClick={() => open("weight", w)} className="press flex w-full items-center gap-4 py-3 text-left">
                <IconBubble size="sm"><Scale className="size-5" /></IconBubble>
                <span className="w-20 text-muted-foreground">{fmtMonthDay(w.localDate)}</span>
                <span className="flex-1 text-[20px] font-bold">{fmtNumber(w.value)} kg<DemoTag show={w.demo} /></span>
                <span className="text-sm text-muted-foreground">{t("prog.manual")}</span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </>
      )}

      {metric === "measure" && (
        <div className="mt-4">
          <button onClick={() => open("measure")} className="press flex h-11 w-full items-center justify-center gap-1 rounded-full border border-primary font-semibold"><Plus className="size-4" />{t("meas.add")}</button>
          {measures.length === 0 ? <Card className="mt-3 p-8 text-center text-muted-foreground">{t("meas.empty")}</Card> : (
            <div className="mt-2 divide-y">
              {measures.map((m, i) => {
                const prev = measures[i + 1];
                const dw = m.waist != null && prev?.waist != null ? m.waist - prev.waist : null;
                return (
                  <button key={m.id} onClick={() => open("measure", m)} className="press flex w-full items-center gap-4 py-3 text-left">
                    <IconBubble size="sm"><Ruler className="size-5" /></IconBubble>
                    <span className="w-16 text-muted-foreground">{fmtMonthDay(m.localDate)}</span>
                    <span className="flex-1 font-semibold">{measureSummary(m)}<DemoTag show={m.demo} />
                      {dw != null && dw !== 0 && <span className="block text-xs font-normal text-muted-foreground">허리 {dw > 0 ? "+" : ""}{fmtNumber(dw)} cm</span>}
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {metric === "photo" && (
        <div className="mt-4">
          {memories.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">아직 남긴 순간이 없어요.</p>
              <button onClick={() => open("memory")} className="press mt-4 h-11 rounded-full bg-primary px-5 text-primary-foreground">{t("type.memory")} 남기기</button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {memories.map((m) => (
                <button key={m.id} onClick={() => open("memory", m)} className="press overflow-hidden rounded-[20px] bg-card text-left shadow-soft">
                  {m.photo && <img src={m.photo} alt="" className="aspect-square w-full object-cover" />}
                  <div className="p-3"><div className="text-xs text-muted-foreground">{fmtMonthDay(m.localDate)}</div><div className="line-clamp-2 text-sm">{m.note}</div></div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={exportCsv} className="press mt-4 flex w-full items-center gap-4 border-t py-4 text-left">
        <IconBubble tone="peach" size="sm"><Download className="size-5" /></IconBubble>
        <span className="flex-1 text-[17px]">{t("prog.export")}</span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </button>
    </div>
  );
}
