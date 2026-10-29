import type { Evidence } from "@/lib/journal";
import { FIELDS } from "@/lib/momo-drafts";
import { t, type Key } from "@/lib/i18n";
import { PhotoImg } from "./PhotoImg";

export function SourceEvidence({ evidence }: { evidence: Evidence }) {
  return (
    <details className="rounded-[16px] border bg-card p-3 text-[15px]">
      <summary className="min-h-11 cursor-pointer">
        {t("momo.source")} · {t(`evidence.${evidence.method}`)}
      </summary>
      {evidence.text && <p className="whitespace-pre-wrap break-words">{evidence.text}</p>}
      {evidence.quote && <blockquote className="my-2 border-l-4 pl-3">{evidence.quote}</blockquote>}
      <p className="text-sm text-muted-foreground">{t("evidence.proposed")}</p>
      <ul className="my-2 space-y-1">
        {Object.entries(evidence.confirmed)
          .filter(([key, value]) => value !== evidence.proposed[key])
          .map(([key, value]) => (
            <li key={key}>
              {t(
                (Object.values(FIELDS)
                  .flat()
                  .find((f) => f.k === key)?.label ?? "f.value") as Key,
              )}
              : {evidence.proposed[key] || t("unknown")} → {value || t("unknown")} ·{" "}
              {t("evidence.corrected")}
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {evidence.photos.map((src, i) => (
          <a
            key={i}
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label={`${t("f.photo")} ${i + 1}`}
          >
            <PhotoImg src={src} className="size-24 rounded-xl object-contain" />
          </a>
        ))}
      </div>
    </details>
  );
}
