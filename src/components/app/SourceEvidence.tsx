import { useJournal, type Evidence } from "@/lib/journal";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FIELDS } from "@/lib/momo-drafts";
import { draftMealSchema } from "@/lib/meals";
import { t, fmtNumber, type Key } from "@/lib/i18n";
import { PhotoImg } from "./PhotoImg";
import { isPartOfDay } from "@/lib/time-of-day";

function displayValue(key: string, value: string | undefined) {
  if (!value) return t("unknown");
  if (key === "answer" && (value === "yes" || value === "not_yet"))
    return t(value === "yes" ? "water.yes" : "water.notYet");
  if (key === "stockUnit" && (value === "pen" || value === "single" || value === "dose"))
    return t(`unit.${value}`);
  if (key === "partOfDay" && isPartOfDay(value)) return t(`pod.${value}`);
  if (key !== "meal") return value;
  try {
    const parsed = draftMealSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return t("unknown");
    const meal = parsed.data;
    return [
      meal.title || t("unknown"),
      t("evidence.eaten") +
        ": " +
        (meal.consumedFraction === null
          ? t("unknown")
          : fmtNumber(meal.consumedFraction * 100) + "%"),
      ...meal.items.map((item) =>
        [
          item.name || t("meal.food"),
          !item.included ? "(" + t("evidence.excluded") + ")" : "",
          item.portionDescription,
          item.kcal && Number.isFinite(item.kcal.low) && Number.isFinite(item.kcal.high)
            ? fmtNumber(item.kcal.low) +
              "-" +
              fmtNumber(item.kcal.high) +
              " kcal (" +
              t(`meal.${item.kcal.basis}`) +
              ")"
            : t("unknown") + " kcal",
          item.ingredients
            .map((ingredient) => ingredient.name + " (" + t(`meal.${ingredient.basis}`) + ")")
            .join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
      ),
      meal.consumptionNote,
      meal.note,
    ]
      .filter(Boolean)
      .join("; ");
  } catch {
    return t("unknown");
  }
}
export function SourceEvidence({ evidence }: { evidence: Evidence }) {
  const { user } = useJournal();
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
          .filter(([key, value]) => value !== (evidence.proposed[key] ?? ""))
          .map(([key, value]) => (
            <li key={key} className="break-words">
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
          <Dialog key={[user?.id ?? "guest", src, i].join(":")}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="press min-h-11 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("photo.viewSource", { n: i + 1 })}
              >
                <PhotoImg src={src} alt="" className="size-24 rounded-xl object-contain" />
                <span className="block max-w-24 py-2 text-xs font-medium">
                  {t("photo.viewSource", { n: i + 1 })}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent
              closeLabel={t("evidence.close")}
              aria-describedby={undefined}
              className="w-[calc(100%-2rem)] max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl p-4 [&>button]:right-1 [&>button]:top-1 [&>button]:grid [&>button]:size-11 [&>button]:place-items-center"
            >
              <DialogTitle className="pr-8">{t("photo.viewSource", { n: i + 1 })}</DialogTitle>
              <PhotoImg
                src={src}
                alt={t("photo.viewSource", { n: i + 1 })}
                className="h-[65dvh] w-full rounded-xl object-contain"
              />
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </details>
  );
}
