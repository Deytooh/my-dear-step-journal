import { Area, AreaChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMonthDay } from "@/lib/dates";
import { fmtNumber, t } from "@/lib/i18n";

const CHART_L = 40;
const CHART_R = 12;

export default function WeightChart({
  data,
  x0,
  x1,
}: {
  data: { d: string; ts: number; v: number; demo: boolean }[];
  x0: number;
  x1: number;
}) {
  return (
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
          tickFormatter={(v: number) => fmtMonthDay(new Date(v).toISOString().slice(0, 10))}
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
          labelFormatter={(v) => fmtMonthDay(new Date(Number(v)).toISOString().slice(0, 10))}
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
  );
}
