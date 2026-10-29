import { useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MEDICATIONS, findMedication, medicationLabel, type Medication } from "@/lib/medications";
import { getLocale, t } from "@/lib/i18n";

/** Inline list stays inside the shared drawer's focus boundary. Names remain plain strings in saved records. */
export function MedicationPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(() => !!value && !findMedication(value));
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = findMedication(value);
  const locale = getLocale();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (med: Medication) => {
    // Keep legacy spellings when reselecting the same product; do not rewrite old records.
    onChange(selected?.id === med.id ? value : med.ko);
    setCustom(false); close();
  };

  return (
    <div className="space-y-2">
      <Button ref={trigger} type="button" variant="unstyled" size="unstyled" aria-label={t("med.select")} aria-expanded={open} aria-controls={id}
        className="press flex min-h-12 w-full items-center justify-between gap-2 rounded-[12px] border bg-card px-4 py-3 text-left text-[16px]"
        onClick={() => setOpen((p) => !p)}>
        <span className="min-w-0 break-words">{selected ? medicationLabel(selected, locale) : value || t("med.select")}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
      {open && (
        <Command id={id} className="rounded-lg border" onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }}>
          <CommandInput autoFocus aria-label={t("med.search")} placeholder={t("med.search")} className="h-12 text-[16px]" />
          <CommandList className="max-h-56 overscroll-contain">
            <CommandEmpty>{t("med.noResults")}</CommandEmpty>
            {(["injectable", "oral", "combination"] as const).map((group) => (
              <CommandGroup key={group} heading={t(`med.${group}`)}>
                {MEDICATIONS.filter((m) => m.form === group).map((med) => (
                  <CommandItem key={med.id} value={med.id} keywords={[med.en, med.ko, med.ingredient, med.ingredientKo, ...med.aliases]}
                    onSelect={() => choose(med)} className="press min-h-12 cursor-pointer px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-medium">{medicationLabel(med, locale)}</span>
                      <span className="block break-words text-xs text-muted-foreground">{locale === "ko" ? med.ingredientKo : med.ingredient}</span>
                    </span>
                    {selected?.id === med.id && <Check className="size-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="grid grid-cols-2 border-t">
            <Button type="button" variant="unstyled" size="unstyled" className="press min-h-12 px-2 text-sm" onClick={() => { onChange(""); setCustom(false); close(); }}>{t("med.none")}</Button>
            <Button type="button" variant="unstyled" size="unstyled" className="press min-h-12 border-l px-2 text-sm" onClick={() => { setCustom(true); close(); }}>{t("med.other")}</Button>
          </div>
        </Command>
      )}
      {custom && <Input aria-label={t("med.custom")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("med.custom")} className="h-12 rounded-[12px] bg-card text-[16px]" />}
      <p className="text-xs text-muted-foreground">{t("med.regional")}</p>
    </div>
  );
}