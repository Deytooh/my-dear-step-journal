import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Droplet, Image as ImageIcon, Scale, Smile, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t, type Key } from "@/lib/i18n";
import { instantFromLocal, timeOf, todayLocal } from "@/lib/dates";
import { useJournal, type PromptId, type PromptSettings } from "@/lib/journal";
import { pickPrompts } from "@/lib/prompts";
import { useQuickAdd } from "./AppShell";
import { celebrateSave } from "./AppFeel";
import { cn } from "@/lib/utils";

const FEELS: Key[] = ["feel.calm", "feel.meh", "feel.uncomf"];
const chip = (on: boolean) => cn("feel-chip press min-h-11 rounded-full border px-4 text-[15px]", on ? "border-primary bg-primary text-primary-foreground" : "bg-card");

export function PromptCarousel() {
  const j = useJournal();
  const open = useQuickAdd();
  const today = todayLocal(j.tz);
  const ps: PromptSettings = j.settings.prompts ?? {};
  const ids = pickPrompts(j.records, ps, today);
  const [justDone, setJustDone] = useState<PromptId | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  if (ps.hidden) return null;
  const patch = (p: Partial<PromptSettings>) => j.setSetting("prompts", { ...ps, ...p });
  const markDone = (id: PromptId) => patch({ done: { ...(ps.done ?? {}), [id]: today } });
  // Show a brief check, then let the next card slide in.
  const finish = (id: PromptId) => { setJustDone(id); setTimeout(() => { markDone(id); setJustDone(null); }, 450); };
  const scroll = (dir: 1 | -1) => { const el = scroller.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" }); };

  return (
    <section aria-labelledby="pr-title" className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h2 id="pr-title" className="text-[20px] font-bold">{t("pr.title")}</h2>
          <p className="text-[15px] text-muted-foreground">{t("pr.sub")}</p>
        </div>
        {ids.length > 1 && (
          <div className="flex gap-1">
            <Button variant="unstyled" size="unstyled" aria-label={t("pr.prev")} onClick={() => scroll(-1)} className="press flex size-11 items-center justify-center rounded-full border bg-card"><ChevronLeft className="size-5" /></Button>
            <Button variant="unstyled" size="unstyled" aria-label={t("pr.next")} onClick={() => scroll(1)} className="press flex size-11 items-center justify-center rounded-full border bg-card"><ChevronRight className="size-5" /></Button>
          </div>
        )}
      </div>
      {ids.length === 0 ? (
        <p className="rounded-[16px] bg-secondary px-4 py-3 text-[15px] text-muted-foreground">{t("pr.allDone")}</p>
      ) : (
        <div ref={scroller} role="list" className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none]">
          {ids.map((id, i) => (
            <div role="listitem" key={id} className={cn("feel-panel min-h-[150px] w-[85%] shrink-0 snap-start rounded-[24px] p-4 shadow-soft",
              i % 3 === 0 ? "bg-sage" : i % 3 === 1 ? "bg-peach" : "bg-card")}>
              {justDone === id ? (
                <div className="flex h-full min-h-[130px] flex-col items-center justify-center gap-2" role="status">
                  <span className="feel-pop flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-6" /></span>
                  <span className="font-semibold">{t("pr.saved")}</span>
                </div>
              ) : (
                <PromptBody id={id} onSaved={() => finish(id)} onSkip={() => markDone(id)} onNever={() => patch({ off: [...(ps.off ?? []), id] })}
                  onOpen={() => open(id === "memory" ? "memory" : "weight")} />
              )}
            </div>
          ))}
        </div>
      )}
      <Button variant="unstyled" size="unstyled" onClick={() => patch({ hidden: true })} className="press mt-1 flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
        <EyeOff className="size-4" />{t("pr.hide")}
      </Button>
    </section>
  );
}

function PromptBody({ id, onSaved, onSkip, onNever, onOpen }: { id: PromptId; onSaved: () => void; onSkip: () => void; onNever: () => void; onOpen: () => void }) {
  const j = useJournal();
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [time, setTime] = useState(() => timeOf(new Date().toISOString(), j.tz));
  const busy = useRef(false);
  const today = todayLocal(j.tz);
  const icon = { feel: <Smile className="size-5" />, water: <Droplet className="size-5" />, memory: <ImageIcon className="size-5" />, weight: <Scale className="size-5" /> }[id];
  const q = { feel: t("pr.feelQ"), water: t("pr.waterQ"), memory: t("pr.memoryQ"), weight: t("pr.weightQ") }[id];

  const save = () => {
    if (busy.current || !pick) return;
    busy.current = true;
    const before = j.snapshot();
    const at = instantFromLocal(today, time, j.tz);
    const base = { id: j.newId(), localDate: today, precision: "exact" as const, at, createdAt: new Date().toISOString(), source: "manual_text" as const };
    if (id === "feel") j.saveRecord({ ...base, type: "condition", label: pick, ...(note.trim() ? { note: note.trim() } : {}) });
    else j.saveRecord({ ...base, type: "water", answer: pick === "yes" ? "yes" : "not_yet" });
    celebrateSave();
    toast.success(t("toast.saved"), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } });
    onSaved();
  };

  const options = id === "feel" ? FEELS.map((k) => ({ v: t(k), l: t(k) }))
    : id === "water" ? [{ v: "yes", l: t("pr.water.yes") }, { v: "not_yet", l: t("pr.water.notYet") }] : [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card/80">{icon}</span>
        <p className="flex-1 pt-1 text-[17px] font-bold leading-snug">{q}</p>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={q}>
          {options.map((o) => <Button variant="unstyled" size="unstyled" key={o.v} aria-pressed={pick === o.v} onClick={() => setPick(pick === o.v ? null : o.v)} className={chip(pick === o.v)}>{o.l}</Button>)}
          {id === "water" && <Button variant="unstyled" size="unstyled" onClick={onSkip} className="press min-h-11 rounded-full px-3 text-[15px] text-muted-foreground underline-offset-4 hover:underline">{t("pr.skip")}</Button>}
        </div>
      )}
      {pick && (
        <div className="feel-panel space-y-2 rounded-[16px] bg-card p-3">
          {id === "feel" && (
            <textarea aria-label={`${t("f.note")} (${t("f.optional")})`} placeholder={`${t("f.note")} (${t("f.optional")})`} value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-[12px] border bg-background p-3 text-[15px] outline-none focus:border-primary" />
          )}
          {id === "water" && <p className="text-sm text-muted-foreground">{t("water.note")}</p>}
          <label className="flex min-h-11 items-center justify-between gap-2 text-[15px]">
            <span>{t("pr.at")} · {t("today")}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("f.time")} className="h-11 rounded-[12px] border bg-background px-3" />
          </label>
          <Button variant="unstyled" size="unstyled" onClick={save} className="press h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground">{t("pr.save")}</Button>
        </div>
      )}
      {(id === "memory" || id === "weight") && (
        <Button variant="unstyled" size="unstyled" onClick={onOpen} className="press h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground">
          {id === "memory" ? t("pr.memoryA") : t("pr.weightA")}
        </Button>
      )}
      {!pick && (
        <div className="mt-auto flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          {id !== "water" && <Button variant="unstyled" size="unstyled" onClick={onSkip} className="press min-h-11 underline-offset-4 hover:underline">{t("pr.skip")}</Button>}
          <Button variant="unstyled" size="unstyled" onClick={onNever} className="press min-h-11 underline-offset-4 hover:underline">{t("pr.never")}</Button>
        </div>
      )}
    </div>
  );
}

