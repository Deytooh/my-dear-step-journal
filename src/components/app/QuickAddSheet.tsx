import { Button } from "@/components/ui/button";
import { PhotoImg } from "@/components/app/PhotoImg";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Mic, Package, Ruler, Scale, Smile, Syringe, X } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { t, type Key } from "@/lib/i18n";
import { instantFromLocal, localDateOf, timeOf, todayLocal } from "@/lib/dates";
import { canDeduct, useJournal, type JournalRecord, type Purchase, type PartOfDay, type StockUnit } from "@/lib/journal";
import { IconBubble } from "./ui";
import momo from "@/assets/momo.png";
import { MomoSheet } from "./MomoSheet";
import { celebrateSave } from "./AppFeel";
import { cn } from "@/lib/utils";
import { MedicationPicker } from "./MedicationPicker";

export type EntryKind = "menu" | "weight" | "injection" | "condition" | "memory" | "purchase" | "reminder" | "stock" | "voice" | "measure" | "water";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; kind: EntryKind; setKind: (k: EntryKind) => void; editing?: JournalRecord | Purchase | undefined };

export function QuickAddSheet({ open, onOpenChange, kind, setKind, editing }: Props) {
  const { settings } = useJournal();
  // edits are keyed by record id so the form remounts with fresh values
  const close = () => onOpenChange(false);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md rounded-t-[28px] border-0 bg-background">
        <div className="overflow-y-auto px-5 pb-8">
          <div className="flex justify-between pt-2">
            {kind !== "menu" && !editing ? (
              <Button variant="unstyled" size="unstyled" onClick={() => setKind("menu")} className="press -ml-2 flex size-11 items-center justify-center" aria-label="뒤로">
                <ChevronLeft className="size-6" />
              </Button>
            ) : <span />}
            <Button variant="unstyled" size="unstyled" onClick={close} className="press -mr-2 flex size-11 items-center justify-center" aria-label="닫기"><X className="size-6" /></Button>
          </div>
          {kind === "menu" ? (
            <div key="menu" className="feel-panel"><Menu setKind={setKind} showMomo={settings.showMomo} /></div>
          ) : (
            <EntryForm key={`${kind}-${editing && "id" in editing ? editing.id : "new"}`} kind={kind} editing={editing} onDone={close} onManual={() => setKind("menu")} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Menu({ setKind, showMomo }: { setKind: (k: EntryKind) => void; showMomo: boolean }) {
  const items: { k: EntryKind; title: Key; sub: Key; icon: ReactNode; tone: "sage" | "peach" }[] = [
    { k: "weight", title: "type.weight", sub: "qa.weight", icon: <Scale className="size-6" />, tone: "sage" },
    { k: "injection", title: "type.injection", sub: "qa.injection", icon: <Syringe className="size-6" />, tone: "peach" },
    { k: "condition", title: "type.condition", sub: "qa.condition", icon: <Smile className="size-6" />, tone: "sage" },
    { k: "memory", title: "type.memory", sub: "qa.memory", icon: <ImageIcon className="size-6" />, tone: "peach" },
    { k: "measure", title: "type.measure", sub: "qa.measure", icon: <Ruler className="size-6" />, tone: "sage" },
    { k: "purchase", title: "type.purchase", sub: "qa.purchase", icon: <Package className="size-6" />, tone: "sage" },
  ];
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <DrawerTitle className="text-[28px] font-bold">{t("qa.title")}</DrawerTitle>
          <DrawerDescription className="mt-1 text-[15px] text-muted-foreground">{t("qa.sub")}</DrawerDescription>
        </div>
        {showMomo && <img src={momo} alt="" aria-hidden width={80} height={80} className="size-20 object-contain" />}
      </div>
      <ul className="feel-menu mt-4 divide-y">
        {items.map((it) => (
          <li key={it.k}>
            <Button variant="unstyled" size="unstyled" onClick={() => setKind(it.k)} className="press flex w-full items-center gap-4 py-4 text-left">
              <IconBubble tone={it.tone}>{it.icon}</IconBubble>
              <span className="flex-1">
                <span className="block text-[18px] font-bold">{t(it.title)}</span>
                <span className="block text-sm text-muted-foreground">{t(it.sub)}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Button>
          </li>
        ))}
      </ul>
      <VoiceCard title={t("voice.all")} sub={t("voice.allSub")} onClick={() => setKind("voice")} />
    </>
  );
}

export function VoiceCard({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <Button variant="unstyled" size="unstyled" onClick={onClick} className="press mt-4 flex w-full items-center gap-4 rounded-[24px] bg-secondary p-4 text-left">
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--voice-bubble)]"><Mic className="size-6" /></span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Button>
  );
}

const FEELINGS = ["feel.calm", "feel.meh", "feel.uncomf", "feel.ok", "feel.tired", "feel.nausea", "feel.low"] as const;
import { SitePicker } from "./SitePicker";

function Field({ label, children, optional }: { label: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}{optional && <span className="ml-1 text-muted-foreground">({t("f.optional")})</span>}</span>
      {children}
    </label>
  );
}
const inputCls = "h-12 w-full rounded-[12px] border bg-card px-4 text-[16px] outline-none focus:border-primary";
const chipCls = (on: boolean) => cn("feel-chip press min-h-11 rounded-full border px-4 text-[15px]", on ? "border-primary bg-primary text-primary-foreground" : "bg-card");

function EntryForm({ kind, editing, onDone, onManual }: { kind: EntryKind; editing?: JournalRecord | Purchase | undefined; onDone: () => void; onManual: () => void }) {
  const j = useJournal();
  const tz = j.tz;
  const rec = editing && "type" in editing ? editing : undefined;
  const pur = editing && !("type" in editing) ? editing : undefined;

  const [date, setDate] = useState(rec?.localDate ?? pur?.localDate ?? todayLocal(tz));
  const [timeKnown, setTimeKnown] = useState(rec ? rec.precision === "exact" : true);
  const [time, setTime] = useState(rec?.at ? timeOf(rec.at, tz) : timeOf(new Date().toISOString(), tz));
  const [weight, setWeight] = useState(rec?.type === "weight" ? String(rec.value) : "");
  const [med, setMed] = useState(rec?.type === "injection" ? rec.medication ?? "" : pur?.medication ?? "");
  const [dose, setDose] = useState(rec?.type === "injection" && rec.doseValue != null ? String(rec.doseValue) : "");
  const [doseUnit, setDoseUnit] = useState(rec?.type === "injection" ? rec.doseUnit ?? "mg" : "mg");
  const [site, setSite] = useState<string | null>(rec?.type === "injection" ? rec.site : null);
  const [useStock, setUseStock] = useState(rec?.type === "injection" ? rec.usedStock : false);
  const [water, setWater] = useState<"yes" | "not_yet">(rec?.type === "water" ? rec.answer : "yes");
  const [unit, setUnit] = useState<StockUnit>(pur?.stockUnit ?? (pur ? "dose" : "single"));
  const [addsStock, setAddsStock] = useState(pur ? pur.addsStock !== false : true);
  const [merchant, setMerchant] = useState(pur?.merchant ?? "");
  const [feel, setFeel] = useState(rec?.type === "condition" ? rec.label : t("feel.calm"));
  const [note, setNote] = useState(rec?.type === "condition" ? rec.note ?? "" : rec?.type === "memory" ? rec.note : "");
  const [photo, setPhoto] = useState<string | null>(rec?.type === "memory" ? rec.photo ?? null : null);
  const [amount, setAmount] = useState(pur ? String(pur.amount) : "");
  const [doses, setDoses] = useState(pur && pur.addsStock !== false ? String(pur.doses) : "");
  const [remDate, setRemDate] = useState(j.reminder ? localDateOf(j.reminder.at, tz) : todayLocal(tz));
  const [remTime, setRemTime] = useState(j.reminder ? timeOf(j.reminder.at, tz) : "20:00");
  const [stock, setStock] = useState(String(j.stock));
  const [meas, setMeas] = useState(() => {
    const m = rec?.type === "measure" ? rec : null;
    const f = (v: number | null | undefined) => (v != null ? String(v) : "");
    return { waist: f(m?.waist), hip: f(m?.hip), chest: f(m?.chest), thigh: f(m?.thigh) };
  });
  const [err, setErr] = useState<string | null>(null);
  const stockOk = kind === "injection" && j.hasStock && canDeduct(j.stockUnit) && !!med.trim() && (!j.stockMedication || j.stockMedication.trim().toLowerCase() === med.trim().toLowerCase());

  useEffect(() => setErr(null), [weight, amount, doses]);

  const titles: Record<EntryKind, string> = {
    menu: "", weight: t("type.weight"), injection: t("type.injection"), condition: t("type.condition"), memory: t("type.memory"),
    purchase: t("type.purchase"), water: t("type.water"), reminder: t("reminder.set"), stock: t("inv.edit"), voice: t("voice.all"), measure: t("type.measure"),
  };

  const base = () => ({
    id: rec?.id ?? j.newId(), localDate: date, createdAt: rec?.createdAt ?? new Date().toISOString(), source: "manual_text" as const,
    precision: timeKnown ? ("exact" as const) : ("date_only" as const),
    at: timeKnown ? instantFromLocal(date, time, tz) : null, partOfDay: null as PartOfDay | null,
  });

  const save = () => {
    const before = j.snapshot();
    if (kind === "weight") {
      const v = Number(weight.replace(",", "."));
      if (!weight || !Number.isFinite(v) || v < 20 || v > 400) return setErr("20–400 kg 사이 숫자를 입력해 주세요.");
      j.saveRecord({ ...base(), type: "weight", value: Math.round(v * 10) / 10, unit: "kg" });
    } else if (kind === "injection") {
      const dv = dose ? Number(dose.replace(",", ".")) : null;
      if (dose && !Number.isFinite(dv)) return setErr("용량은 숫자로 입력해 주세요.");
      j.saveRecord({ ...base(), type: "injection", medication: med.trim() || null, doseValue: dv, doseUnit: dv != null ? doseUnit : null, site, usedStock: stockOk ? useStock : (rec?.type === "injection" ? rec.usedStock && useStock : false) });
    } else if (kind === "water") {
      j.saveRecord({ ...base(), type: "water", answer: water });
    } else if (kind === "condition") {
      j.saveRecord({ ...base(), type: "condition", label: feel, ...(note.trim() ? { note: note.trim() } : {}) });
    } else if (kind === "memory") {
      if (!note.trim() && !photo) return setErr("메모나 사진 중 하나는 남겨 주세요.");
      j.saveRecord({ ...base(), type: "memory", note: note.trim(), photo });
    } else if (kind === "measure") {
      const vals: Record<string, number | null> = {};
      for (const [k, raw] of Object.entries(meas)) {
        if (!raw.trim()) { vals[k] = null; continue; }
        const v = Number(raw.replace(",", "."));
        if (!Number.isFinite(v) || v < 10 || v > 300) return setErr("10–300 cm 사이 숫자를 입력해 주세요.");
        vals[k] = Math.round(v * 10) / 10;
      }
      if (Object.values(vals).every((v) => v == null)) return setErr("최소 한 가지 치수를 입력해 주세요.");
      j.saveRecord({ ...base(), type: "measure", unit: "cm", waist: vals["waist"] ?? null, hip: vals["hip"] ?? null, chest: vals["chest"] ?? null, thigh: vals["thigh"] ?? null });
    } else if (kind === "purchase") {
      const a = Number(amount.replace(/[^\d]/g, "")); const hasQty = doses.trim() !== ""; const n = hasQty ? Number(doses) : 0;
      if (!a) return setErr("금액을 확인해 주세요.");
      if (hasQty && (!Number.isInteger(n) || n <= 0)) return setErr("수량은 1 이상의 정수로 입력하거나 비워 두세요.");
      const stockOn = hasQty && addsStock;
      j.savePurchase({ id: pur?.id ?? j.newId(), localDate: date, amount: a, currency: "KRW", doses: stockOn ? n : 0, medication: med.trim() || null,
        stockUnit: hasQty ? unit : null, addsStock: stockOn, merchant: merchant.trim() || null, ...(pur?.demo ? { demo: true } : {}) });
    } else if (kind === "reminder") {
      j.setReminder(instantFromLocal(remDate, remTime, tz));
    } else if (kind === "stock") {
      const n = Number(stock);
      if (!Number.isInteger(n) || n < 0) return setErr("0 이상의 정수를 입력해 주세요.");
      j.setStock(n);
    }
    celebrateSave();
    toast.success(t("toast.saved"), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } });
    onDone();
  };

  const remove = () => {
    const before = j.snapshot();
    if (rec) j.deleteRecord(rec.id);
    else if (pur) j.deletePurchase(pur.id);
    else if (kind === "reminder") j.setReminder(null);
    toast(t("toast.deleted"), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } });
    onDone();
  };

  if (kind === "voice") return <MomoSheet onDone={onDone} onManual={onManual} />;

  const showDate = ["weight", "injection", "condition", "memory", "purchase", "measure", "water"].includes(kind);
  const showTime = ["weight", "injection", "condition", "memory", "measure", "water"].includes(kind);

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="feel-form space-y-5">
      <DrawerTitle className="text-[24px] font-bold">{titles[kind]}{editing && " 수정"}</DrawerTitle>
      <DrawerDescription className="sr-only">{titles[kind]}</DrawerDescription>

      {kind === "weight" && (
        <Field label={t("f.value")}>
          <input autoFocus inputMode="decimal" className={cn(inputCls, "h-16 text-[28px] font-bold")} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="78.4" />
        </Field>
      )}

      {(kind === "injection" || kind === "purchase") && (
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t("f.medication")} <span className="text-muted-foreground">({t("f.optional")})</span></span>
          <MedicationPicker value={med} onChange={setMed} />
        </div>
      )}

      {kind === "injection" && (
        <>
          <Field label={t("f.dose")} optional>
            <div className="flex gap-2">
              <input inputMode="decimal" className={inputCls} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="모르면 비워 두세요" />
              <select className={cn(inputCls, "w-24")} value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)}>
                <option>mg</option><option>mcg</option><option>mL</option>
              </select>
            </div>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium">{t("f.site")} <span className="text-muted-foreground">({t("f.optional")})</span></span>
            <SitePicker value={site} onChange={setSite} />
          </div>
          <StockMove med={med} on={useStock} setOn={setUseStock} ok={stockOk} wasUsed={rec?.type === "injection" && rec.usedStock} />
        </>
      )}

      {kind === "condition" && (
        <>
          <div className="flex flex-wrap gap-2">
            {FEELINGS.map((k) => <Button variant="unstyled" size="unstyled" type="button" key={k} aria-pressed={feel === t(k)} className={chipCls(feel === t(k))} onClick={() => setFeel(t(k))}>{t(k)}</Button>)}
          </div>
          <Field label={t("f.note")} optional>
            <textarea className={cn(inputCls, "h-24 py-3")} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}

      {kind === "memory" && (
        <>
          <div>
            <span className="mb-1.5 block text-sm font-medium">{t("f.photo")} <span className="text-muted-foreground">({t("f.optional")})</span></span>
            {photo && <PhotoImg src={photo} alt={t("f.photo")} className="mb-2 max-h-56 w-full rounded-[16px] object-cover" />}
            <div className="flex gap-2">
              <label className="press flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-primary/40 bg-card px-4 text-[15px] font-semibold focus-within:ring-2 focus-within:ring-ring">
                <ImageIcon className="size-5" />{photo ? t("photo.change") : t("photo.pick")}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return setErr("사진은 5MB 이하로 올려 주세요.");
                  const rd = new FileReader(); rd.onload = () => setPhoto(String(rd.result)); rd.readAsDataURL(f);
                }} />
              </label>
              {photo && <Button variant="unstyled" size="unstyled" type="button" onClick={() => setPhoto(null)} className="press min-h-14 rounded-[16px] border px-4 text-[15px]">{t("photo.remove")}</Button>}
            </div>
            {!photo && <p className="mt-1 text-sm text-muted-foreground">{t("photo.hint")}</p>}
          </div>
          <Field label={t("f.note")}>
            <textarea className={cn(inputCls, "h-24 py-3")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="오늘 기억하고 싶은 순간" />
          </Field>
        </>
      )}

      {kind === "measure" && (
        <div className="grid grid-cols-2 gap-3">
          {(["waist", "hip", "chest", "thigh"] as const).map((k) => (
            <Field key={k} label={t(`f.${k}`)} optional>
              <input inputMode="decimal" className={inputCls} value={meas[k]} onChange={(e) => setMeas({ ...meas, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      )}

      {kind === "purchase" && (
        <>
          <Field label={t("f.merchant")} optional><input className={inputCls} value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
          <Field label={t("f.amount")}><input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="320000" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("f.qty")} optional><input inputMode="numeric" className={inputCls} value={doses} onChange={(e) => setDoses(e.target.value)} placeholder={t("f.qtyHint")} /></Field>
            <Field label={t("f.unit")}>
              <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)}>
                <option value="single">{t("unit.single")}</option><option value="pen">{t("unit.pen")}</option><option value="dose">{t("unit.dose")}</option>
              </select>
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="size-5 accent-[var(--color-primary)]" disabled={!doses.trim()} checked={!!doses.trim() && addsStock} onChange={(e) => setAddsStock(e.target.checked)} />
            {t("f.addsStock")}
          </label>
          {!doses.trim() && <p className="-mt-3 text-sm text-muted-foreground">{t("f.expenseOnly")}</p>}
        </>
      )}

      {kind === "water" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {(["yes", "not_yet"] as const).map((a) => <Button variant="unstyled" size="unstyled" type="button" key={a} aria-pressed={water === a} className={chipCls(water === a)} onClick={() => setWater(a)}>{t(a === "yes" ? "pr.water.yes" : "pr.water.notYet")}</Button>)}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("water.note")}</p>
        </div>
      )}

      {kind === "reminder" && (
        <Field label={t("f.reminderAt")}>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" className={inputCls} value={remDate} onChange={(e) => setRemDate(e.target.value)} />
            <input type="time" className={inputCls} value={remTime} onChange={(e) => setRemTime(e.target.value)} />
          </div>
        </Field>
      )}

      {kind === "stock" && (
        <Field label={t("f.stockCount")}><input inputMode="numeric" className={inputCls} value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
      )}

      {showDate && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("f.date")}><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          {showTime && (
            <Field label={t("f.time")}>
              <input type="time" disabled={!timeKnown} className={cn(inputCls, !timeKnown && "opacity-40")} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {showTime && (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={!timeKnown} onChange={(e) => setTimeKnown(!e.target.checked)} />
          {t("f.timeUnknown")}
        </label>
      )}

      {err && <p role="alert" className="feel-error text-sm text-destructive">{err}</p>}

      <div className="flex gap-3 pt-2">
        {(editing || (kind === "reminder" && j.reminder)) && (
          <Button variant="unstyled" size="unstyled" type="button" onClick={remove} className="press h-12 rounded-full border border-destructive/40 px-5 text-destructive">{t("f.delete")}</Button>
        )}
        <Button variant="unstyled" size="unstyled" type="submit" className="press h-12 flex-1 rounded-full bg-primary font-semibold text-primary-foreground">{t("f.save")}</Button>
      </div>
    </form>
  );
}

function StockMove({ med, on, setOn, ok, wasUsed }: { med: string; on: boolean; setOn: (v: boolean) => void; ok: boolean; wasUsed: boolean }) {
  const j = useJournal();
  const u = t(`unit.${j.stockUnit}`);
  // j.stock already includes this injection if it was saved with a deduction, so show the difference only.
  const before = j.stock + (wasUsed ? 1 : 0);
  const after = before - (on && ok ? 1 : 0);
  return (
    <div className="rounded-[16px] border bg-card p-4 text-[15px]">
      <p className="font-semibold">{t("stock.move")}</p>
      {!j.hasStock ? <p className="mt-1 text-muted-foreground">{t("stock.none")}</p>
        : !canDeduct(j.stockUnit) ? <p className="mt-1 text-muted-foreground">{t("stock.pen")}</p>
        : (
          <>
            <p className="mt-1 text-muted-foreground">{t("stock.of")}: {j.stockMedication ?? t("stock.unknownMed")}</p>
            {!ok ? <p className="mt-1 text-muted-foreground">{med.trim() ? t("stock.needMed") : t("stock.needMed")}</p> : (
              <>
                <label className="mt-2 flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={on} onChange={(e) => setOn(e.target.checked)} />
                  {t("stock.deduct", { u })}
                </label>
                <p className="text-muted-foreground">{t("stock.before")} {before}{u} → {t("stock.after")} <span className="font-semibold text-foreground">{after}{u}</span></p>
              </>
            )}
          </>
        )}
    </div>
  );
}
