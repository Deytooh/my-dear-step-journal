import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t, type Key } from "@/lib/i18n";
import { todayLocal } from "@/lib/dates";
import { useJournal, type PromptId } from "@/lib/journal";
import { pickPrompts } from "@/lib/prompts";
import { useQuickAdd } from "./AppShell";
import { celebrateSave } from "./AppFeel";
import momoImg from "@/assets/momo.png";

export function PromptCarousel() {
  const j = useJournal();
  if (!j.ready) return null;
  return <Questions key={todayLocal(j.tz)} />;
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
        onClick: () => {
          lock.current = false;
          j.restoreSnapshot(before);
        },
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
  const hide = (id?: PromptId) => {
    const before = j.snapshot();
    j.setSetting("prompts", id ? { ...ps, off: [...(ps.off ?? []), id] } : { ...ps, hidden: true });
    undoToast(before, t(id ? "pr.never" : "pr.hide"));
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
                className={`grid min-h-[224px] w-[88%] shrink-0 snap-start grid-rows-[1fr_auto_auto] gap-2 rounded-[24px] p-4 ${index % 2 ? "bg-accent" : "bg-secondary"}`}
              >
                <div className="flex items-center gap-3">
                  <img src={momoImg} alt="" className="size-14 shrink-0 object-contain" />
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
                  <div className="grid auto-cols-fr grid-flow-col gap-2">
                    {options.map((o) => (
                      <Button
                        key={o.value}
                        variant="unstyled"
                        size="unstyled"
                        className="press min-h-14 min-w-0 whitespace-normal [overflow-wrap:anywhere] rounded-full border bg-card px-2 py-2 text-[15px] font-semibold leading-snug"
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
                <div className="flex flex-wrap justify-center gap-x-3 text-sm">
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
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    className="min-h-11 px-2 text-muted-foreground"
                    onClick={() => hide(id)}
                  >
                    {t("pr.never")}
                  </Button>
                </div>
              </div>
            );
          })}
        {!slots.length && <p className="min-h-20 py-4 text-muted-foreground">{t("pr.allDone")}</p>}
      </div>
      <Button
        variant="unstyled"
        size="unstyled"
        className="min-h-11 px-2 text-sm text-muted-foreground"
        onClick={() => hide()}
      >
        {t("pr.hide")}
      </Button>
    </section>
  );
}
