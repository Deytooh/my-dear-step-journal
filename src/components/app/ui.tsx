import { PhotoImg } from "./PhotoImg";
import { mealTotals } from "@/lib/meals";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  ChevronRight,
  Droplet,
  Pencil,
  Ruler,
  Scale,
  Smile,
  Syringe,
  UtensilsCrossed,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { t, fmtNumber } from "@/lib/i18n";
import { fmtMonthDay, fmtTime, todayLocal } from "@/lib/dates";
import type { JournalRecord, MeasureRec } from "@/lib/journal";
import momo from "@/assets/momo-hamster.png.asset.json";
import { useJournal } from "@/lib/journal";

export function IconBubble({
  tone = "sage",
  children,
  size = "md",
}: {
  tone?: "sage" | "peach";
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "feel-icon flex shrink-0 items-center justify-center rounded-[16px] border border-primary/5",
        tone === "sage" ? "bg-sage" : "bg-peach",
        size === "md" ? "size-14" : "size-11",
      )}
    >
      {children}
    </span>
  );
}

export function PageTitle({
  title,
  sub,
  momoArt = true,
}: {
  title: string;
  sub?: string;
  momoArt?: boolean;
}) {
  const { settings } = useJournal();
  return (
    <div className="page-heading relative flex items-center justify-between">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      {momoArt && settings.showMomo && (
        <img
          src={momo.url}
          alt=""
          aria-hidden
          width={88}
          height={88}
          className="-mb-3 size-[88px] object-contain"
        />
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("app-surface rounded-[24px] bg-card shadow-soft", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-heading mt-7 mb-3 flex items-center justify-between">
      <h2 className="text-[20px] font-bold">{title}</h2>
      {action}
    </div>
  );
}

export function DemoTag({ show }: { show?: boolean | undefined }) {
  if (!show) return null;
  return (
    <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-accent px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
      {t("demo.badge")}
    </span>
  );
}

export function recordIcon(r: JournalRecord) {
  switch (r.type) {
    case "meal":
      return { icon: <UtensilsCrossed className="size-6" />, tone: "peach" as const };
    case "weight":
      return { icon: <Scale className="size-6" />, tone: "sage" as const };
    case "injection":
      return { icon: <Syringe className="size-6" />, tone: "sage" as const };
    case "condition":
      return { icon: <Smile className="size-6" />, tone: "peach" as const };
    case "memory":
      return { icon: <ImageIcon className="size-6" />, tone: "peach" as const };
    case "measure":
      return { icon: <Ruler className="size-6" />, tone: "sage" as const };
    case "water":
      return { icon: <Droplet className="size-6" />, tone: "sage" as const };
  }
}

export function measureSummary(r: MeasureRec) {
  const parts: [string, number | null][] = [
    [t("f.waist"), r.waist],
    [t("f.hip"), r.hip],
    [t("f.chest"), r.chest],
    [t("f.thigh"), r.thigh],
  ];
  return (
    parts
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k} ${v != null ? fmtNumber(v) : ""}`)
      .join(" · ") + " cm"
  );
}

export function recordValue(r: JournalRecord) {
  switch (r.type) {
    case "meal":
      return r.meal.title;
    case "weight":
      return `${fmtNumber(r.value)} ${r.unit}`;
    case "injection": {
      const dose =
        r.doseValue != null ? `${fmtNumber(r.doseValue, 2)} ${r.doseUnit ?? ""}`.trim() : null;
      return [r.medication ?? `${t("f.medication")} ${t("missing")}`, dose]
        .filter(Boolean)
        .join(" · ");
    }
    case "condition":
      return r.label;
    case "memory":
      return r.note || t("type.memory");
    case "measure":
      return measureSummary(r);
    case "water":
      return t(r.answer === "yes" ? "water.yes" : "water.notYet");
  }
}

const POD: Record<string, string> = {
  morning: "아침",
  afternoon: "오후",
  evening: "저녁",
  night: "밤",
};

export function recordWhen(r: JournalRecord, tz: string) {
  const day = r.localDate === todayLocal(tz) ? t("today") : fmtMonthDay(r.localDate);
  if (r.precision === "exact" && r.at) return `${day} ${fmtTime(r.at, tz)}`;
  if (r.precision === "part_of_day" && r.partOfDay) return `${day} ${t(`pod.${r.partOfDay}`)}`;
  return `${day} · ${t("f.timeUnknown")}`;
}

export function RecordRow({
  r,
  onEdit,
  trailing = "edit",
}: {
  r: JournalRecord;
  onEdit: () => void;
  trailing?: "edit" | "chevron";
}) {
  const { tz } = useJournal();
  const ic = recordIcon(r);
  const photo = r.type === "memory" ? r.photo : r.type === "meal" ? r.meal.photoRefs[0] : null;
  const totals = r.type === "meal" ? mealTotals(r.meal) : null;
  const energy = totals?.consumed ?? totals?.pictured;
  const label = r.type === "memory" ? t("type.memory") : t(`type.${r.type}`);
  return (
    <Button
      variant="unstyled"
      size="unstyled"
      onClick={onEdit}
      data-record={r.type}
      data-record-id={r.id}
      className="record-row press flex w-full items-center py-4 text-left"
    >
      {photo ? (
        <PhotoImg
          src={photo}
          alt=""
          className="size-14 shrink-0 rounded-[16px] border object-cover"
        />
      ) : (
        <IconBubble tone={ic.tone}>{ic.icon}</IconBubble>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">
          {label}
          <DemoTag show={r.demo} />
        </div>
        <div className="record-value line-clamp-2 font-semibold leading-snug">{recordValue(r)}</div>
        <div className="text-sm text-muted-foreground">{recordWhen(r, tz)}</div>
        {energy && (
          <div className="mt-1 text-xs text-muted-foreground">
            {t(totals?.consumed ? "meal.consumedEstimate" : "meal.picturedEstimate")} ·{" "}
            {Math.round(energy.low)}–{Math.round(energy.high)} kcal
            {totals?.partial && <> · {t("meal.partial")}</>}
          </div>
        )}
      </div>
      {trailing === "edit" ? (
        <Pencil className="size-5 text-muted-foreground" aria-label={t("ui.edit")} />
      ) : (
        <ChevronRight className="size-5 text-muted-foreground" />
      )}
    </Button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "lg",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "lg" | "sm";
}) {
  return (
    <div
      role="tablist"
      data-tone={size}
      style={
        {
          "--segment-count": options.length,
          "--segment-index": Math.max(
            0,
            options.findIndex((o) => o.value === value),
          ),
        } as React.CSSProperties
      }
      className={cn(
        "segmented flex rounded-[18px]",
        size === "lg" ? "bg-secondary" : "border bg-card",
      )}
    >
      <span className="segment-indicator" aria-hidden="true" />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Button
            variant="unstyled"
            size="unstyled"
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "press flex-1 rounded-full transition-colors",
              size === "lg" ? "h-12 text-[17px]" : "h-10 text-[15px]",
              active
                ? size === "lg"
                  ? "font-semibold text-primary-foreground"
                  : "font-semibold"
                : "text-muted-foreground",
            )}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-[16px] border border-primary/5 bg-secondary text-primary/65">
          {icon}
        </span>
      )}
      <p className="max-w-64 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
