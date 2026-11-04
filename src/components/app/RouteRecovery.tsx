import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getLocale, tFor, type Locale } from "@/lib/i18n";

/** Recovery must work without a loaded journal or authenticated session. */
export function RouteRecovery({
  kind,
  onRetry,
  embedded = false,
}: {
  kind: "not-found" | "error";
  onRetry?: () => void;
  embedded?: boolean;
}) {
  const [locale, chooseLocale] = useState<Locale>(getLocale);
  const titleId = useId();
  return (
    <section
      lang={locale}
      aria-labelledby={titleId}
      className={
        embedded
          ? "flex min-h-[60svh] items-center justify-center py-6"
          : "flex min-h-screen items-center justify-center bg-background px-5 py-8"
      }
    >
      <div className="app-surface w-full max-w-sm rounded-[28px] border bg-card p-5">
        {!embedded && <p className="font-brand text-[24px]">my dear step</p>}
        <div
          role="group"
          aria-label={tFor(locale, "recovery.language")}
          className="my-5 flex flex-wrap gap-2"
        >
          {(
            [
              ["en", "English"],
              ["fr", "Français"],
              ["ko", "한국어"],
            ] as const
          ).map(([code, name]) => (
            <Button
              key={code}
              type="button"
              variant={locale === code ? "secondary" : "outline"}
              lang={code}
              aria-pressed={locale === code}
              className="min-h-11 rounded-full px-3"
              onClick={() => chooseLocale(code)}
            >
              {name}
            </Button>
          ))}
        </div>
        {kind === "not-found" && <p className="text-sm text-muted-foreground">404</p>}
        <h1 id={titleId} className="mt-1 text-[24px] font-semibold leading-tight">
          {tFor(locale, kind === "not-found" ? "recovery.missingTitle" : "recovery.errorTitle")}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
          {tFor(locale, kind === "not-found" ? "recovery.missingHelp" : "recovery.errorHelp")}
        </p>
        <div className="mt-6 space-y-3">
          {onRetry && (
            <Button
              type="button"
              onClick={onRetry}
              className="min-h-12 w-full whitespace-normal rounded-full"
            >
              {tFor(locale, "recovery.retry")}
            </Button>
          )}
          <Button
            asChild
            variant={onRetry ? "outline" : "default"}
            className="min-h-12 w-full whitespace-normal rounded-full"
          >
            <Link to="/today">{tFor(locale, "recovery.home")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
