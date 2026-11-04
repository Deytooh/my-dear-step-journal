import { useId } from "react";
import { t } from "@/lib/i18n";
import { TIMES_OF_DAY } from "@/lib/time-of-day";
import type { PartOfDay } from "@/lib/journal";

export function TimeOfDayField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: PartOfDay | "") => void;
  disabled?: boolean;
}) {
  const hint = useId();
  return (
    <label className="col-span-2 block">
      <span className="mb-1 block text-sm font-medium">{t("time.period")}</span>
      <select
        aria-label={t("time.period")}
        aria-describedby={hint}
        className="min-h-12 w-full rounded-xl border bg-card px-3 py-2 text-[16px] disabled:opacity-50"
        value={disabled ? "" : value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as PartOfDay | "")}
      >
        <option value="">{t("unknown")}</option>
        {TIMES_OF_DAY.map((period) => (
          <option key={period} value={period}>
            {t(`pod.${period}`)}
          </option>
        ))}
      </select>
      <span id={hint} className="mt-1 block text-sm text-muted-foreground">
        {t("time.periodHelp")}
      </span>
    </label>
  );
}
