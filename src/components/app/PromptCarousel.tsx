import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t, getLocale, type Key } from "@/lib/i18n";
import { todayLocal } from "@/lib/dates";
import { useJournal, type PromptId } from "@/lib/journal";
import { pickPrompts } from "@/lib/prompts";
import { useQuickAdd } from "./AppShell";
import { celebrateSave } from "./AppFeel";
import momoImg from "@/assets/momo.png";

import { ContextQuestion } from "./ContextQuestion";
import { QuestionSettings } from "./QuestionSettings";
import { QuestionMenu } from "./QuestionMenu";

export function PromptCarousel() {
  const j = useJournal();
  const [day, setDay] = useState(() => todayLocal(j.tz));
  useEffect(() => {
    const refresh = () => setDay(todayLocal(j.tz));
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [j.tz]);
  if (!j.ready) return null;
  const locale = j.settings.locale ?? "ko";
  const fallback = <Questions key={day} />;
  return (
    <>
      {!j.settings.prompts?.hidden &&
        (j.user && j.settings.prompts?.aiConsent ? (
          <ContextQuestion
            key={`${j.user.id}:${locale}:${day}:${j.tz}`}
            day={day}
            fallback={fallback}
          />
        ) : (
          fallback
        ))}
      <QuestionSettings />
    </>
  );
}

function Questions() {
  const j = useJournal();
  const open = useQuickAdd();
  const day = todayLocal(j.tz);
  const ps = j.settings.prompts ?? {};
  // Keep slots mounted after answers so the page and keyboard focus do not jump.
  const [slots] = useState(() => pickPrompts(j.records, ps, day));
  const lock = useRef(false);
  if (ps.hidden) return null;
  const undoToast = (before: ReturnType<typeof j.snapshot>, label: string) =>
    toast.success(label, {
      action: {
        label: t("toast.undo"),
        onClick: j.undoFor(before),
      },
    });
  const answer = (id: PromptId, value?: string) => {
    if (lock.current) return;
    lock.current = true;
    const before = j.snapshot();
    try {
      const now = new Date().toISOString();
      const base = {
        id: j.newId(),
        localDate: day,
        precision: "exact" as const,
        at: now,
        createdAt: now,
        source: "manual_text" as const,
      };
      const record = value
        ? id === "feel"
          ? { ...base, type: "condition" as const, label: value }
          : {
              ...base,
              type: "water" as const,
              answer: value === "yes" ? ("yes" as const) : ("not_yet" as const),
            }
        : undefined;
      j.respondPrompt(id, day, record);
      if (record) celebrateSave();
      undoToast(before, t(record ? "pr.saved" : "pr.skip"));
    } catch {
      toast.error(t("sync.error"));
    } finally {
      lock.current = false;
    }
  };
  const hide = (id: PromptId) => {
    const before = j.snapshot();
    try {
      j.setSetting("prompts", { ...ps, off: [...new Set([...(ps.off ?? []), id])] });
      undoToast(before, t("pr.never"));
    } catch {
      toast.error(t("sync.error"));
    }
  };
  return (
    <section aria-label={t("pr.title")} className="mt-5">
      <div
        role="list"
        tabIndex={0}
        aria-label={t("pr.title")}
        className="-mx-5 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 pb-2 [scrollbar-width:none]"
      >
        {slots
          .filter((id) => !ps.off?.includes(id))
          .map((id, index) => {
            const skipped = ps.skipped?.[id] === day;
            const done = !pickPrompts(j.records, ps, day).includes(id);
            const question = {
              feel: "pr.feelQ",
              water: "pr.waterQ",
              memory: "pr.memoryQ",
              weight: "pr.weightQ",
            }[id] as Key;
            const options =
              id === "feel"
                ? ["feel.calm", "feel.meh", "feel.uncomf"].map((k) => ({
                    value: t(k as Key),
                    label: t(k as Key),
                  }))
                : id === "water"
                  ? [
                      { value: "yes", label: t("pr.water.yes") },
                      { value: "not_yet", label: t("pr.water.notYet") },
                    ]
                  : [];
            return (
              <div
                role="listitem"
                key={id}
                className={`question-card grid min-h-[224px] w-[90%] shrink-0 snap-start grid-rows-[1fr_auto_auto] gap-2 rounded-[24px] p-4 ${index % 2 ? "bg-accent" : "bg-secondary"}`}
              >
                <div className="flex items-center gap-3">
                  <img src={momoImg} alt="" className="size-12 shrink-0 object-contain" />
                  <p className="min-w-0 text-[18px] font-bold leading-snug">{t(question)}</p>
                </div>
                {done ? (
                  <p
                    role="status"
                    className="flex min-h-14 items-center justify-center gap-2 font-semibold"
                  >
                    <Check className="size-5" />
                    {t(skipped ? "pr.skipped" : "pr.saved")}
                  </p>
                ) : options.length ? (
                  <div
                    className={`grid gap-2 ${options.length === 3 && getLocale() !== "ko" ? "grid-cols-[1fr_.95fr_1.8fr]" : "auto-cols-fr grid-flow-col"}`}
                  >
                    {options.map((o) => (
                      <Button
                        key={o.value}
                        variant="unstyled"
                        size="unstyled"
                        className="press min-h-14 min-w-0 whitespace-normal [overflow-wrap:anywhere] rounded-full border bg-card px-0.5 py-2 text-[15px] font-semibold leading-snug"
                        onClick={() => answer(id, o.value)}
                      >
                        {o.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Button
                    className="min-h-12 whitespace-normal rounded-full"
                    onClick={() => open(id === "memory" ? "memory" : "weight")}
                  >
                    {t(id === "memory" ? "pr.memoryA" : "pr.weightA")}
                  </Button>
                )}
                <div className="relative flex min-h-11 items-center justify-center px-11 text-sm">
                  {!done && (
                    <Button
                      variant="unstyled"
                      size="unstyled"
                      className="min-h-11 px-2"
                      onClick={() => answer(id)}
                    >
                      {t("pr.later")}
                    </Button>
                  )}
                  <QuestionMenu onDisable={() => hide(id)} label={t("pr.never")} />
                </div>
              </div>
            );
          })}
        {!slots.length && <p className="min-h-20 py-4 text-muted-foreground">{t("pr.allDone")}</p>}
      </div>
    </section>
  );
}
