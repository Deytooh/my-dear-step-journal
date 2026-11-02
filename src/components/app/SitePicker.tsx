import { Button } from "@/components/ui/button";
import { t, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Six supported injection sites. Left/right are the user's own body sides (shown as if looking down at yourself). */
export const SITE_ZONES = [
  { id: "팔 왼쪽", key: "arm", side: "left", x: 46, y: 96 },
  { id: "팔 오른쪽", key: "arm", side: "right", x: 154, y: 96 },
  { id: "복부 왼쪽", key: "belly", side: "left", x: 77, y: 128 },
  { id: "복부 오른쪽", key: "belly", side: "right", x: 123, y: 128 },
  { id: "허벅지 왼쪽", key: "thigh", side: "left", x: 77, y: 190 },
  { id: "허벅지 오른쪽", key: "thigh", side: "right", x: 123, y: 190 },
] as const;

const siteLabel = (id: string) => {
  const zone = SITE_ZONES.find((z) => z.id === id);
  return zone ? t(`site.${zone.key}.${zone.side}` as Key) : id;
};

const chipCls = (on: boolean) =>
  cn(
    "feel-chip press min-h-11 rounded-full border px-4 text-[15px]",
    on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
  );

/** Selecting a zone only updates the form; nothing is saved until the form's save button. */
export function SitePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const toggle = (id: string) => onChange(value === id ? null : id);
  return (
    <div>
      <div className="flex flex-col items-center rounded-[20px] border border-primary/5 bg-secondary p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t("site.hint")}</p>
        <div
          className="mb-1 flex w-full max-w-[200px] justify-between text-sm font-semibold text-muted-foreground"
          aria-label={t("site.hint")}
        >
          <span>← {t("site.left")}</span>
          <span>{t("site.right")} →</span>
        </div>
        <svg
          viewBox="0 0 200 240"
          className="w-full max-w-[200px]"
          role="group"
          aria-label={`${t("f.site")} · ${t("site.hint")}`}
        >
          <g
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
            className="text-primary/45"
          >
            <circle cx="100" cy="28" r="17" />
            <line x1="100" y1="52" x2="100" y2="150" />
            <line x1="100" y1="68" x2="42" y2="128" />
            <line x1="100" y1="68" x2="158" y2="128" />
            <line x1="100" y1="150" x2="72" y2="228" />
            <line x1="100" y1="150" x2="128" y2="228" />
          </g>
          {SITE_ZONES.map((z) => {
            const on = value === z.id;
            return (
              <g
                key={z.id}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={siteLabel(z.id)}
                onClick={() => toggle(z.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(z.id);
                  }
                }}
                className="feel-press cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-ring"
              >
                <circle
                  cx={z.x}
                  cy={z.y}
                  r="22"
                  strokeWidth="3"
                  className={cn(
                    "site-zone",
                    on ? "fill-sage stroke-primary" : "fill-card stroke-primary/50",
                  )}
                />
                {on ? (
                  <path
                    d={`M${z.x - 8} ${z.y} l6 6 l11 -12`}
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="site-check text-primary"
                  />
                ) : (
                  <circle cx={z.x} cy={z.y} r="4" className="fill-primary/65" />
                )}
              </g>
            );
          })}
        </svg>
        <p
          className="mt-1 flex min-h-8 items-center rounded-full bg-card/80 px-4 text-[15px] font-semibold"
          aria-live="polite"
        >
          <span key={value ?? "unknown"} className="site-label">{value ? `✓ ${siteLabel(value)}` : t("site.unknown")}</span>
        </p>
      </div>
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm">{t("ui.siteList")}</summary>
        <div className="flex flex-wrap gap-2">
          {SITE_ZONES.map((z) => (
            <Button
              variant="unstyled"
              size="unstyled"
              type="button"
              key={z.id}
              aria-pressed={value === z.id}
              className={chipCls(value === z.id)}
              onClick={() => toggle(z.id)}
            >
              {siteLabel(z.id)}
            </Button>
          ))}
        </div>
      </details>
      <Button
        variant="unstyled"
        size="unstyled"
        type="button"
        className={chipCls(value === null)}
        onClick={() => onChange(null)}
      >
        {t("site.unknown")}
      </Button>
    </div>
  );
}
