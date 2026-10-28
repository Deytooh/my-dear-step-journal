import type { ReactNode } from "react";
import { ChevronRight, Pencil, Scale, Smile, Syringe, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, fmtNumber } from "@/lib/i18n";
import { fmtMonthDay, fmtTime, todayLocal } from "@/lib/dates";
import type { JournalRecord } from "@/lib/journal";
import momo from "@/assets/momo.png";
import { useJournal } from "@/lib/journal";

export function IconBubble({ tone = "sage", children, size = "md" }: { tone?: "sage" | "peach"; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full", tone === "sage" ? "bg-sage" : "bg-peach", size === "md" ? "size-14" : "size-11")}>
      {children}
    </span>
  );
}

export function PageTitle({ title, sub, momoArt = true }: { title: string; sub?: string; momoArt?: boolean }) {
  const { settings } = useJournal();
  return (
    <div className="relative flex items-end justify-between pt-3 pb-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      {momoArt && settings.showMomo && <img src={momo} alt="" aria-hidden width={88} height={88} className="-mb-3 size-[88px] object-contain" />}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[24px] bg-card shadow-soft", className)}>{children}</section>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center justify-between">
      <h2 className="text-[20px] font-bold">{title}</h2>
      {action}
    </div>
  );
}

export function DemoTag({ show }: { show?: boolean | undefined }) {
  if (!show) return null;
  return <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">{t("demo.badge")}</span>;
}

export function recordIcon(r: JournalRecord) {
  switch (r.type) {
    case "weight": return { icon: <Scale className="size-6" />, tone: "sage" as const };
    case "injection": return { icon: <Syringe className="size-6" />, tone: "sage" as const };
    case "condition": return { icon: <Smile className="size-6" />, tone: "peach" as const };
    case "memory": return { icon: <ImageIcon className="size-6" />, tone: "peach" as const };
    case "measure": return { icon: <Ruler className="size-6" />, tone: "sage" as const };
  }
}

export function measureSummary(r: MeasureRec) {
  const parts: [string, number | null][] = [["허리", r.waist], ["엉덩이", r.hip], ["가슴", r.chest], ["허벅지", r.thigh]];
  return parts.filter(([, v]) => v != null).map(([k, v]) => `${k} ${fmtNumber(v!)}`).join(" · ") + " cm";
}

export function recordValue(r: JournalRecord) {
  switch (r.type) {
    case "weight": return `${fmtNumber(r.value)} ${r.unit}`;
    case "injection": {
      const dose = r.doseValue != null ? `${fmtNumber(r.doseValue, 2)} ${r.doseUnit ?? ""}`.trim() : null;
      return [r.medication ?? "약 이름 미입력", dose].filter(Boolean).join(" · ");
    }
    case "condition": return r.label;
    case "memory": return r.note || "사진 기록";
    case "measure": return measureSummary(r);
  }
}

const POD: Record<string, string> = { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" };

export function recordWhen(r: JournalRecord, tz: string) {
  const day = r.localDate === todayLocal(tz) ? t("today") : fmtMonthDay(r.localDate);
  if (r.precision === "exact" && r.at) return `${day} ${fmtTime(r.at, tz)}`;
  if (r.precision === "part_of_day" && r.partOfDay) return `${day} ${POD[r.partOfDay]}`;
  return `${day} · ${t("f.timeUnknown")}`;
}

export function RecordRow({ r, onEdit, trailing = "edit" }: { r: JournalRecord; onEdit: () => void; trailing?: "edit" | "chevron" }) {
  const { tz } = useJournal();
  const ic = recordIcon(r);
  const label = r.type === "memory" ? t("type.memory") : t(`type.${r.type}`);
  return (
    <button onClick={onEdit} className="press flex w-full items-center gap-4 py-4 text-left">
      <IconBubble tone={ic.tone}>{ic.icon}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">{label}<DemoTag show={r.demo} /></div>
        <div className="truncate text-[22px] font-bold leading-snug">{recordValue(r)}</div>
        <div className="text-sm text-muted-foreground">{recordWhen(r, tz)}</div>
      </div>
      {trailing === "edit" ? <Pencil className="size-5 text-muted-foreground" aria-label="수정" /> : <ChevronRight className="size-5 text-muted-foreground" />}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "lg" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: "lg" | "sm" }) {
  return (
    <div role="tablist" className={cn("flex rounded-full p-1", size === "lg" ? "bg-secondary" : "border bg-card")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={cn("press flex-1 rounded-full transition-colors", size === "lg" ? "h-12 text-[17px]" : "h-10 text-[15px]",
              active ? (size === "lg" ? "bg-primary font-semibold text-primary-foreground" : "bg-secondary font-semibold") : "text-muted-foreground")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
