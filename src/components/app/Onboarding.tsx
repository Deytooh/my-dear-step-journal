import { useState } from "react";
import { ChevronLeft, ChevronRight, Image, Scale, Smile, Syringe, UtensilsCrossed, X } from "lucide-react";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useJournal, type TrackingInterest } from "@/lib/journal";
import { t, tFor, type Locale } from "@/lib/i18n";
import { EntrySheet } from "./EntrySheet";
import { useQuickAdd } from "./quick-add-context";
import momo from "@/assets/momo-hamster.png.asset.json";
import { toast } from "sonner";

const interests = [
  { kind: "injection", icon: Syringe },
  { kind: "weight", icon: Scale },
  { kind: "condition", icon: Smile },
  { kind: "meal", icon: UtensilsCrossed },
  { kind: "memory", icon: Image },
] as const;

export function InterestChoices({ value, onChange, locale }: {
  value: TrackingInterest[];
  onChange: (value: TrackingInterest[]) => void;
  locale: Locale;
}) {
  return <div className="flex flex-wrap gap-2">
    {interests.map(({ kind, icon: Icon }) => <Button
      key={kind} variant={value.includes(kind) ? "default" : "outline"}
      className="min-h-11 gap-2 whitespace-normal"
      aria-pressed={value.includes(kind)}
      onClick={() => onChange(value.includes(kind) ? value.filter((v) => v !== kind) : [...value, kind])}
    ><Icon className="size-4 shrink-0" />{tFor(locale, `type.${kind}`)}</Button>)}
  </div>;
}

export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const j = useJournal();
  const add = useQuickAdd();
  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState<Locale>(j.settings.locale ?? "ko");
  const [chosen, setChosen] = useState<TrackingInterest[]>(j.settings.trackingInterests ?? []);
  const copy = (key: Parameters<typeof tFor>[1]) => tFor(locale, key);
  const finish = (status: "completed" | "skipped", kind?: TrackingInterest | "reminder") => {
    try {
      // One existing journal commit: no records, demo data, schedule or AI consent changes.
      const current = j.snapshot();
      j.restoreSnapshot({ ...current, settings: { ...current.settings,
        ...(status === "completed" ? { locale, trackingInterests: chosen } : {}),
        onboarding: { ...current.settings.onboarding, status },
      } });
      onClose();
      toast.success(copy("intro.finish"));
      if (kind) add(kind);
    } catch { toast.error(t("sync.error")); }
  };
  const Title = step === 0 ? "intro.welcome" : step === 1 ? "intro.yours" : "intro.first";
  return <EntrySheet open={open} onOpenChange={(v) => { if (!v) finish("skipped"); }} header={
    <div className="flex shrink-0 items-center justify-between px-4 py-1">
      <Button variant="ghost" size="icon" className="size-11" aria-label={copy("ui.back")}
        onClick={() => step ? setStep(step - 1) : finish("skipped")}><ChevronLeft className="size-5" /></Button>
      <span className="text-xs text-muted-foreground">{tFor(locale, "intro.step", { n: step + 1 })}</span>
      <Button variant="ghost" className="min-h-11" onClick={() => finish("skipped")}>{copy("pr.skip")}</Button>
    </div>
  }>
    <div className="sheet-scroll min-h-0 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div key={step} className="feel-panel">
        <div className="flex items-center gap-3 py-4">
          {j.settings.showMomo && <img src={momo.url} alt="" className="size-20 shrink-0 object-contain" />}
          <DrawerTitle className="text-2xl leading-snug">{copy(Title)}</DrawerTitle>
        </div>
        <DrawerDescription className="mb-5 text-base leading-relaxed text-muted-foreground">
          {copy(step === 0 ? "intro.about" : step === 1 ? "intro.optional" : "intro.firstSub")}
        </DrawerDescription>
        {step === 0 && <div className="grid gap-3">
          <Button className="min-h-12 whitespace-normal" onClick={() => setStep(1)}>{copy("intro.start")}<ChevronRight className="size-4" /></Button>
          <Button variant="outline" className="min-h-12" onClick={() => finish("skipped")}>{copy("intro.explore")}</Button>
        </div>}
        {step === 1 && <div className="space-y-5">
          <label className="grid gap-2 text-sm font-medium">{copy("set.lang")}
            <select className="min-h-12 rounded-lg border bg-card px-3 text-base" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              <option value="ko">한국어</option><option value="en">English</option><option value="fr">Français</option>
            </select>
          </label>
          <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">{copy("intro.interests")}</legend>
            <InterestChoices value={chosen} onChange={setChosen} locale={locale} />
          </fieldset>
          <Button className="min-h-12 w-full" onClick={() => setStep(2)}>{copy("intro.next")}<ChevronRight className="size-4" /></Button>
        </div>}
        {step === 2 && <div className="grid gap-3">
          <Button className="min-h-12 justify-between whitespace-normal text-left" onClick={() => finish("completed", chosen[0] ?? "weight")}>
            <span>{chosen[0] ? copy(`type.${chosen[0]}`) : copy("intro.add")}</span><ChevronRight className="size-5 shrink-0" />
          </Button>
          {(chosen.length === 0 || chosen.includes("injection")) && <Button variant="outline" className="min-h-12 whitespace-normal" onClick={() => finish("completed", "reminder")}>
            <Syringe className="size-4 shrink-0" />{copy("intro.remind")}
          </Button>}
          <Button variant="ghost" className="min-h-12" onClick={() => finish("completed")}>{copy("intro.journal")}</Button>
        </div>}
      </div>
    </div>
  </EntrySheet>;
}

export function FirstUseHint({ kind }: { kind: "manual" | "momo" }) {
  const j = useJournal();
  const state = j.settings.onboarding;
  if (!state || state.dismissedHints?.includes(kind)) return null;
  return <aside className="feel-panel flex items-center gap-2 rounded-lg border border-primary/20 bg-secondary px-3 py-2 text-sm" aria-label={t(kind === "manual" ? "nav.add" : "momo.talk")}>
    <p className="min-w-0 flex-1">{t(kind === "manual" ? "intro.manualHint" : "intro.momoHint")}</p>
    <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("intro.dismiss")} onClick={() => {
      try { j.setSetting("onboarding", { ...state, dismissedHints: [...(state.dismissedHints ?? []), kind] }); }
      catch { toast.error(t("sync.error")); }
    }}><X className="size-4" /></Button>
  </aside>;
}