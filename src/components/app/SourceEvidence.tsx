import type { Evidence } from "@/lib/journal";
import { FIELDS } from "@/lib/momo-drafts";
import { t, type Key } from "@/lib/i18n";
import { PhotoImg } from "./PhotoImg";

function displayValue(key: string, value: string | undefined) {
  if (!value) return t("unknown");
  if (key !== "meal") return value;
  try {
    const meal = JSON.parse(value);
    return [
      meal.title,
      ...(meal.items ?? []).map(
        (i: { name: string; portionDescription?: string; kcal?: { low: number; high: number } }) =>
          `${i.name} · ${i.portionDescription ?? ""}${i.kcal ? ` · ${i.kcal.low}–${i.kcal.high} kcal` : ""}`,
      ),
    ].join("; ");
  } catch {
    return t("unknown");
  }
}
export function SourceEvidence({ evidence }: { evidence: Evidence }) {
  return (
    <details className="journal-disclosure text-[15px]">
      <summary className="min-h-11 cursor-pointer">
        {t("momo.source")} · {t(`evidence.${evidence.method}`)}
      </summary>
      {evidence.text && <p className="whitespace-pre-wrap break-words">{evidence.text}</p>}
      {evidence.quote && <blockquote className="my-2 border-l-4 pl-3">{evidence.quote}</blockquote>}
      <p className="text-sm text-muted-foreground">
        {t(evidence.method === "manual" ? "evidence.manual" : "evidence.proposed")}
      </p>
      <ul className="my-2 space-y-1">
        {Object.entries(evidence.confirmed)
          .filter(([key, value]) => value !== evidence.proposed[key])
          .map(([key, value]) => (
            <li key={key}>
              {t(
                (key === "meal"
                  ? "type.meal"
                  : (Object.values(FIELDS)
                      .flat()
                      .find((f) => f.k === key)?.label ?? "f.value")) as Key,
              )}
              : {displayValue(key, evidence.proposed[key])} → {displayValue(key, value)} ·{" "}
              {t("evidence.corrected")}
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {evidence.photos.map((src, i) => (
          <div key={i}>
            <PhotoImg
              src={src}
              alt={`${t("f.photo")} ${i + 1}`}
              className="size-24 rounded-xl object-contain"
            />
          </div>
        ))}
      </div>
    </details>
  );
}
