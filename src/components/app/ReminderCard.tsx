import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Package, Pencil, Syringe } from "lucide-react";
import { t, getLocale } from "@/lib/i18n";
import {
  dayDiff,
  fmtMonthDay,
  fmtMonthDayWeekday,
  fmtTime,
  localDateOf,
  todayLocal,
} from "@/lib/dates";
import { useJournal } from "@/lib/journal";
import { useQuickAdd } from "./AppShell";
import { AnimatedValue } from "./AppFeel";
import { DemoTag, IconBubble } from "./ui";

export function reminderText(at: string, tz: string, weekday = false) {
  const d = localDateOf(at, tz);
  return `${weekday ? fmtMonthDayWeekday(d) : fmtMonthDay(d)} · ${fmtTime(at, tz)
    .replace(":00", "시")
    .replace(/(\d+)시$/, "$1시")}`;
}

export function NextReminder({ variant = "today" }: { variant?: "today" | "plain" }) {
  const j = useJournal();
  const open = useQuickAdd();
  const r = j.reminder;
  const d = r ? dayDiff(todayLocal(j.tz), localDateOf(r.at, j.tz)) : null;
  return (
    <div className="flex items-center gap-4">
      <IconBubble tone="peach">
        {variant === "today" ? <Syringe className="size-6" /> : <Bell className="size-6" />}
      </IconBubble>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">
          {variant === "today" ? t("reminder.next") : t("reminder.nextShort")}
          <DemoTag show={r?.demo} />
        </div>
        {r ? (
          <>
            <div className="text-[20px] font-bold leading-snug tracking-tight">
              {reminderText(r.at, j.tz, variant !== "today")}
            </div>
            <div className="text-sm text-muted-foreground">
              {d != null && d >= 0 && variant === "today"
                ? `${d === 0 ? "D-Day" : t("dDay", { n: d })} · `
                : ""}
              {t("reminder.userSet")}
            </div>
          </>
        ) : (
          <div className="text-[17px] font-semibold">{t("reminder.none")}</div>
        )}
      </div>
      <Button
        variant="unstyled"
        size="unstyled"
        onClick={() => open("reminder")}
        className="press flex size-11 items-center justify-center"
        aria-label={t("reminder.set")}
      >
        <Pencil className="size-5 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function StockLine() {
  const j = useJournal();
  return (
    <div className="flex items-center gap-3">
      <Package className="size-5 text-muted-foreground" />
      <span className="text-[15px] text-muted-foreground">{t("inv.left")}</span>
      <span className="text-[18px] font-bold">
        {j.hasStock ? (
          <>
            <AnimatedValue value={j.stock} digits={0} />
            {getLocale() === "ko" ? "" : " "}
            {t(`unit.${j.stockUnit}`)}
          </>
        ) : (
          t(
            j.stockNeedsReview
              ? "stock.review"
              : j.inventory.lots.length > 1
                ? "stock.multiple"
                : "home.stockUnknown",
          )
        )}
      </span>
      <Link to="/injections" className="press ml-auto flex min-h-11 items-center gap-1 text-[15px]">
        {t("inj.manage")} <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
