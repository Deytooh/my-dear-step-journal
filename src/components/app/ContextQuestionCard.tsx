import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Key } from "@/lib/i18n";
import type { Opportunity, DailyState } from "@/lib/context-prompts";
import { QuestionMenu } from "./QuestionMenu";
import momo from "@/assets/momo.png";

/** Presentation stays independently verifiable without signing in or sending journal data. */
export function ContextQuestionCard({
  state,
  origin,
  question,
  kind,
  answer,
  skip,
  onOpen,
  hide,
}: {
  state: DailyState;
  origin: "meta" | "deterministic";
  question: string;
  kind: Opportunity["kind"] | undefined;
  answer: (value: string) => void;
  skip: () => void;
  onOpen: () => void;
  hide: () => void;
}) {
  const options =
    kind === "feel"
      ? ["feel.calm", "feel.meh", "feel.uncomf"].map((k) => ({
          label: t(k as Key),
          value: t(k as Key),
        }))
      : kind === "water"
        ? [
            { label: t("pr.water.yes"), value: "yes" },
            { label: t("pr.water.notYet"), value: "not_yet" },
          ]
        : [];
  return (
    <section aria-label={t("pr.title")} className="mt-5">
      <div className="grid min-h-[224px] grid-rows-[1fr_auto_auto] gap-2 rounded-[24px] bg-secondary p-4">
        <div className="flex items-center gap-3">
          <img src={momo} alt="" className="size-12 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t(origin === "meta" ? "ctx.meta" : "ctx.local")}
            </p>
            <p className="text-[18px] font-bold leading-snug">
              {state === "obsolete" ? t("ctx.obsolete") : question}
            </p>
          </div>
        </div>
        {state !== "proposed" ? (
          <p
            role="status"
            className="flex min-h-14 items-center justify-center gap-2 font-semibold"
          >
            <Check className="size-5" />
            {t(
              state === "answered" ? "pr.saved" : state === "skipped" ? "pr.skipped" : "ctx.closed",
            )}
          </p>
        ) : options.length ? (
          <div
            className={`grid gap-2 ${options.length === 3 ? "grid-cols-[1fr_.9fr_1.5fr]" : "grid-cols-2"}`}
          >
            {options.map((o) => (
              <Button
                key={o.value}
                variant="unstyled"
                size="unstyled"
                className="min-h-14 min-w-0 whitespace-normal rounded-full border bg-card px-2 py-2 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]"
                onClick={() => answer(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        ) : (
          <Button className="min-h-14 whitespace-normal rounded-full" onClick={onOpen}>
            {t(
              kind === "meal_amount"
                ? "ctx.editMeal"
                : kind === "memory"
                  ? "pr.memoryA"
                  : "pr.weightA",
            )}
          </Button>
        )}
        <div className="relative flex min-h-11 items-center justify-center px-11">
          {state === "proposed" && (
            <Button
              variant="unstyled"
              size="unstyled"
              className="min-h-11 px-3 text-sm text-muted-foreground"
              onClick={skip}
            >
              {t("pr.later")}
            </Button>
          )}
          <QuestionMenu onDisable={hide} label={t("pr.hide")} />
        </div>
      </div>
    </section>
  );
}
