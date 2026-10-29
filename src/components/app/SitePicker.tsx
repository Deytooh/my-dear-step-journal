import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Six supported injection sites. Left/right are the user's own body sides (shown as if looking down at yourself). */
export const SITE_ZONES = [
  { id: "팔 왼쪽", key: "arm", side: "left", x: 46, y: 96 },
  { id: "팔 오른쪽", key: "arm", side: "right", x: 154, y: 96 },
  { id: "복부 왼쪽", key: "belly", side: "left", x: 79, y: 122 },
  { id: "복부 오른쪽", key: "belly", side: "right", x: 121, y: 122 },
  { id: "허벅지 왼쪽", key: "thigh", side: "left", x: 77, y: 196 },
  { id: "허벅지 오른쪽", key: "thigh", side: "right", x: 123, y: 196 },
] as const;

const chipCls = (on: boolean) => cn("feel-chip press min-h-11 rounded-full border px-4 text-[15px]", on ? "border-primary bg-primary text-primary-foreground" : "bg-card");

/** Selecting a zone only updates the form; nothing is saved until the form's save button. */
export function SitePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const toggle = (id: string) => onChange(value === id ? null : id);
  return (
    <div>
      <div className="flex flex-col items-center rounded-[20px] bg-secondary p-3">
        <div className="mb-1 flex w-[240px] justify-between text-sm font-semibold text-muted-foreground" aria-hidden>
          <span>← {t("site.left")}</span><span>{t("site.right")} →</span>
        </div>
        <svg viewBox="0 0 200 260" className="w-[240px]" role="group" aria-label={`${t("f.site")} · ${t("site.hint")}`}>
          <g stroke="currentColor" strokeWidth="9" strokeLinecap="round" fill="none" className="text-primary/35">
            <circle cx="100" cy="28" r="17" />
            <line x1="100" y1="52" x2="100" y2="150" />
            <line x1="100" y1="68" x2="42" y2="128" />
            <line x1="100" y1="68" x2="158" y2="128" />
            <line x1="100" y1="150" x2="72" y2="248" />
            <line x1="100" y1="150" x2="128" y2="248" />
          </g>
          {SITE_ZONES.map((z) => {
            const on = value === z.id;
            return (
              <g key={z.id} role="button" tabIndex={0} aria-pressed={on} aria-label={z.id}
                onClick={() => toggle(z.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(z.id); } }}
                className="feel-press cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-foreground">
                <circle cx={z.x} cy={z.y} r="19" strokeWidth="3" className={cn("transition-colors", on ? "fill-primary stroke-primary" : "fill-card stroke-primary/50")} />
                {on ? <path d={`M${z.x - 8} ${z.y} l6 6 l11 -12`} stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
                  : <circle cx={z.x} cy={z.y} r="4" className="fill-primary/50" />}
              </g>
            );
          })}
        </svg>
        <p className="mt-1 text-sm text-muted-foreground">{t("site.hint")}</p>
        <p className="mt-1 min-h-6 text-[16px] font-semibold" aria-live="polite">{value ? `✓ ${value}` : t("site.unknown")}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {SITE_ZONES.map((z) => <Button variant="unstyled" size="unstyled" type="button" key={z.id} aria-pressed={value === z.id} className={chipCls(value === z.id)} onClick={() => toggle(z.id)}>{z.id}</Button>)}
        <Button variant="unstyled" size="unstyled" type="button" aria-pressed={value === null} className={chipCls(value === null)} onClick={() => onChange(null)}>{t("site.unknown")}</Button>
      </div>
    </div>
  );
}
