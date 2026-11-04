import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, Download, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useJournal } from "@/lib/journal";
import { t, getLocale } from "@/lib/i18n";
import { addDays, todayLocal } from "@/lib/dates";
import { journalSummary } from "@/lib/journal-summary";
import { downloadText } from "@/lib/download";

export function JournalSummary() {
  const j = useJournal();
  const [range, setRange] = useState<"7" | "30" | "all">("7");
  const [includeDemo, setIncludeDemo] = useState(false);
  const locale = getLocale();
  const today = todayLocal(j.tz);
  const options = useMemo(
    () => ({
      locale,
      tz: j.tz,
      from: range === "all" ? null : addDays(today, 1 - Number(range)),
      to: range === "all" ? null : today,
      includeDemo,
    }),
    [locale, j.tz, range, today, includeDemo],
  );
  const summary = useMemo(
    () => journalSummary({ records: j.records, purchases: j.purchases }, options),
    [j.records, j.purchases, options],
  );
  return (
    <details className="app-surface group mt-4 rounded-[20px] border bg-card px-4 pb-3">
      <summary className="flex min-h-14 cursor-pointer items-center gap-3 font-semibold text-[17px]">
        <FileText className="size-5 shrink-0" aria-hidden />
        {t("sum.title")}
        <ChevronDown className="ml-auto size-4 shrink-0 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("sum.help")}</p>
        <label className="block text-sm">
          {t("sum.range")}
          <select
            className="mt-1 min-h-12 w-full rounded-xl border bg-background px-3 text-base"
            value={range}
            onChange={(event) => setRange(event.target.value as typeof range)}
          >
            <option value="7">{t("sum.week")}</option>
            <option value="30">{t("sum.month")}</option>
            <option value="all">{t("sum.all")}</option>
          </select>
        </label>
        {j.hasDemo && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={includeDemo}
              onChange={(event) => setIncludeDemo(event.target.checked)}
            />
            {t("sum.demo")}
          </label>
        )}
        <p role="status" className="text-sm">
          {t(summary.count ? "sum.count" : "sum.empty", { n: summary.count })}
        </p>
        {summary.hasDemo && (
          <p className="rounded-xl bg-secondary p-3 text-sm">{t("sum.demoWarning")}</p>
        )}
        {summary.count > 0 && (
          <details className="journal-disclosure rounded-xl border p-3">
            <summary className="min-h-11 cursor-pointer font-medium">{t("sum.preview")}</summary>
            <div
              role="region"
              aria-label={t("sum.preview")}
              tabIndex={0}
              className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed"
            >
              {summary.text}
            </div>
          </details>
        )}
        <Button
          type="button"
          className="min-h-12 h-auto w-full gap-2 rounded-full whitespace-normal"
          disabled={!summary.count}
          onClick={() => {
            try {
              const current = journalSummary(j.snapshot(), options);
              if (current.text !== summary.text) {
                toast.info(t("sum.changed"));
                return;
              }
              if (!current.count) return;
              downloadText(current.text, `my-dear-step-summary-${todayLocal(j.tz)}.txt`);
              toast.success(t("toast.exported"));
            } catch {
              toast.error(t("export.failed"));
            }
          }}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          {t("sum.download")}
        </Button>
        <Link
          to="/history"
          className="flex min-h-11 items-center justify-center text-sm underline underline-offset-4"
        >
          {t("sum.edit")}
        </Link>
      </div>
    </details>
  );
}
