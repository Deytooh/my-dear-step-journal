import { TimeOfDayField } from "./TimeOfDayField";
import { useRouterState } from "@tanstack/react-router";
import { validDate } from "@/lib/snapshot";
import { purchaseMoneyFacts } from "@/lib/purchase-money";
import { parseAmountInput } from "@/lib/amount-input";
import { FIELDS } from "@/lib/momo-drafts";
import { MealForm } from "./MealForm";
import { retainPhoto, shrinkPhoto } from "@/lib/media";
import { SourceEvidence } from "./SourceEvidence";
import { lotIdentity, matchesLot } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { PhotoImg } from "@/components/app/PhotoImg";
import {
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Mic,
  Droplet,
  UtensilsCrossed,
  Package,
  Ruler,
  Scale,
  Smile,
  Syringe,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { t, type Key } from "@/lib/i18n";
import { exactLocalInstant, localDateOf, timeOf, todayLocal } from "@/lib/dates";
import {
  canDeduct,
  useJournal,
  type JournalRecord,
  type Purchase,
  type PartOfDay,
  type StockUnit,
} from "@/lib/journal";
import { IconBubble } from "./ui";
import { MomoImage } from "./MomoImage";
import { MomoSheet } from "./MomoSheet";
import { celebrateSave } from "./AppFeel";
import { cn } from "@/lib/utils";
import { EntrySheet } from "./EntrySheet";
import { MedicationPicker } from "./MedicationPicker";
import { sameCatalogMedication } from "@/lib/medications";

export type EntryKind =
  | "meal"
  | "menu"
  | "weight"
  | "injection"
  | "condition"
  | "memory"
  | "purchase"
  | "reminder"
  | "stock"
  | "voice"
  | "measure"
  | "water";

export type QuickAddSheetProps = {
  session?: number;
  initialDate?: string | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: EntryKind;
  setKind: (k: EntryKind) => void;
  editing?: JournalRecord | Purchase | undefined;
  returnFocusTo?: HTMLElement | null;
  fallbackFocus?: RefObject<HTMLElement | null>;
};

export function QuickAddSheet({
  session = 0,
  open,
  onOpenChange,
  kind,
  setKind,
  editing,
  initialDate,
  returnFocusTo,
  fallbackFocus,
}: QuickAddSheetProps) {
  const { settings, user } = useJournal();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const homeVoice = kind === "voice" && pathname === "/today";
  const sheetKey = `${session}-${kind}-${editing?.id ?? "new"}-${user?.id ?? "guest"}`;
  // Closing invalidates work immediately, before Radix finishes its exit animation.
  // Each opening gets a distinct token so an old task cannot revive on rapid reopen.
  const sheetSession = useMemo(
    () => ({ active: open && !homeVoice, key: sheetKey }),
    [open, homeVoice, sheetKey],
  );
  const isSessionCurrent = useCallback(() => sheetSession.active, [sheetSession]);
  useLayoutEffect(() => {
    sheetSession.active = open && !homeVoice;
    return () => {
      sheetSession.active = false;
    };
  }, [sheetSession, open, homeVoice]);
  const changeOpen = (next: boolean) => {
    if (!next) sheetSession.active = false;
    onOpenChange(next);
  };
  useEffect(() => {
    if (!open || !homeVoice) return;
    onOpenChange(false);
    const surface = document.getElementById("momo-workspace");
    surface?.scrollIntoView({ block: "start" });
    surface?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [open, homeVoice, onOpenChange]);
  const scrollPane = useRef<HTMLDivElement>(null);
  // A new sheet view begins below its fixed header; expanding fields never resets it.
  useLayoutEffect(() => {
    if (open && scrollPane.current) scrollPane.current.scrollTop = 0;
  }, [open, session, kind, editing?.id]);
  const [mealSeed, setMealSeed] = useState<{ images: string[]; note: string }>({
    images: [],
    note: "",
  });
  // edits are keyed by record id so the form remounts with fresh values
  const close = () => changeOpen(false);
  useEffect(() => {
    if (!open) setMealSeed({ images: [], note: "" });
  }, [open]);
  return (
    <EntrySheet
      open={open && !homeVoice}
      onOpenChange={changeOpen}
      returnFocusTo={returnFocusTo}
      fallbackFocus={fallbackFocus}
      onCloseAutoFocus={(event) => {
        if (!homeVoice) return;
        // The Home workspace is the deliberate next destination, not the opener.
        event.preventDefault();
        document
          .getElementById("momo-workspace")
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus({ preventScroll: true });
      }}
      header={
        <div className="relative z-30 flex shrink-0 justify-between border-b border-primary/5 bg-background px-5 py-1">
          {kind !== "menu" && !editing ? (
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => setKind("menu")}
              className="press -ml-2 flex size-11 items-center justify-center"
              aria-label={t("ui.back")}
            >
              <ChevronLeft className="size-6" />
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={close}
            className="press -mr-2 flex size-11 items-center justify-center"
            aria-label={t("evidence.close")}
          >
            <X className="size-6" />
          </Button>
        </div>
      }
    >
      <div
        ref={scrollPane}
        className="sheet-scroll relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {!user && settings.demoMode && (
          <p role="note" className="mb-3 rounded-xl border bg-secondary px-3 py-2 text-sm">
            {t("demo.notice")}
          </p>
        )}
        {kind === "menu" ? (
          <div key="menu" className="feel-panel">
            <Menu setKind={setKind} showMomo={settings.showMomo} />
          </div>
        ) : homeVoice ? null : (
          <EntryForm
            key={sheetSession.key}
            initialDate={initialDate}
            mealSeed={mealSeed}
            onMeal={(images, note) => {
              setMealSeed({ images, note });
              setKind("meal");
            }}
            kind={kind}
            editing={editing}
            onDone={close}
            isSessionCurrent={isSessionCurrent}
            onManual={() => setKind("menu")}
          />
        )}
      </div>
    </EntrySheet>
  );
}

function Menu({ setKind, showMomo }: { setKind: (k: EntryKind) => void; showMomo: boolean }) {
  const { settings } = useJournal();
  const items: { k: EntryKind; title: Key; sub: Key; icon: ReactNode; tone: "sage" | "peach" }[] = [
    {
      k: "meal",
      title: "type.meal",
      sub: "meal.quick",
      icon: <UtensilsCrossed className="size-6" />,
      tone: "peach",
    },
    {
      k: "weight",
      title: "type.weight",
      sub: "qa.weight",
      icon: <Scale className="size-6" />,
      tone: "sage",
    },
    {
      k: "injection",
      title: "type.injection",
      sub: "qa.injection",
      icon: <Syringe className="size-6" />,
      tone: "peach",
    },
    {
      k: "condition",
      title: "type.condition",
      sub: "qa.condition",
      icon: <Smile className="size-6" />,
      tone: "sage",
    },
    {
      k: "memory",
      title: "type.memory",
      sub: "qa.memory",
      icon: <ImageIcon className="size-6" />,
      tone: "peach",
    },
    {
      k: "measure",
      title: "qa.measureTitle",
      sub: "qa.measure",
      icon: <Ruler className="size-6" />,
      tone: "sage",
    },
    {
      k: "purchase",
      title: "type.purchase",
      sub: "qa.purchase",
      icon: <Package className="size-6" />,
      tone: "sage",
    },
    {
      k: "water",
      title: "type.water",
      sub: "qa.water",
      icon: <Droplet className="size-6" />,
      tone: "sage",
    },
  ];
  const order: EntryKind[] = [
    "weight",
    "injection",
    "condition",
    "memory",
    "meal",
    "water",
    "purchase",
    "measure",
  ];
  const preferred = settings.trackingInterests ?? [];
  items.sort((a, b) => {
    const aRank = preferred.indexOf(a.k as (typeof preferred)[number]);
    const bRank = preferred.indexOf(b.k as (typeof preferred)[number]);
    return (
      (aRank < 0 ? preferred.length + order.indexOf(a.k) : aRank) -
      (bRank < 0 ? preferred.length + order.indexOf(b.k) : bRank)
    );
  });
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <DrawerTitle className="text-[24px] font-bold">{t("qa.title")}</DrawerTitle>
          <DrawerDescription className="mt-1 text-[15px] text-muted-foreground">
            {t("qa.sub")}
          </DrawerDescription>
        </div>
        {showMomo && (
          <MomoImage
            alt=""
            aria-hidden
            width={80}
            height={80}
            className="size-16 shrink-0 object-contain"
          />
        )}
      </div>
      <ul className="feel-menu mt-4 grid grid-cols-2 gap-2">
        {items.map((it) => (
          <li key={it.k}>
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => setKind(it.k)}
              className="press flex h-full min-h-24 w-full min-w-0 items-center gap-2 rounded-2xl border bg-card p-3 text-left"
            >
              <IconBubble tone={it.tone} size="sm">
                {it.icon}
              </IconBubble>
              <span className="min-w-0 flex-1 break-words">
                <span className="block text-[16px] font-bold">{t(it.title)}</span>
                <span className="block text-sm text-muted-foreground">{t(it.sub)}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <VoiceCard title={t("voice.all")} sub={t("voice.allSub")} onClick={() => setKind("voice")} />
    </>
  );
}

export function VoiceCard({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="unstyled"
      size="unstyled"
      onClick={onClick}
      className="press mt-4 flex w-full items-center gap-4 rounded-[24px] bg-secondary p-4 text-left"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-[var(--voice-bubble)]">
        <Mic className="size-6" />
      </span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Button>
  );
}

const FEELINGS = [
  "feel.calm",
  "feel.meh",
  "feel.uncomf",
  "feel.ok",
  "feel.tired",
  "feel.nausea",
  "feel.low",
] as const;
import { SitePicker } from "./SitePicker";

function Field({
  label,
  children,
  optional,
}: {
  label: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {optional && <span className="ml-1 text-muted-foreground">({t("f.optional")})</span>}
      </span>
      {children}
    </label>
  );
}
const inputCls =
  "h-12 w-full rounded-[12px] border bg-card px-4 text-[16px] outline-none focus:border-primary";
const chipCls = (on: boolean) =>
  cn(
    "feel-chip press min-h-11 rounded-full border px-4 text-[15px]",
    on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
  );

function EntryForm({
  kind,
  editing,
  onDone,
  onManual,
  initialDate,
  mealSeed,
  onMeal,
  isSessionCurrent,
}: {
  initialDate?: string | undefined;
  mealSeed: { images: string[]; note: string };
  onMeal: (images: string[], note: string) => void;
  kind: EntryKind;
  editing?: JournalRecord | Purchase | undefined;
  onDone: () => void;
  onManual: () => void;
  isSessionCurrent: () => boolean;
}) {
  const j = useJournal();
  const tz = j.tz;
  const reminderHelpId = useId();
  const rec = editing && "type" in editing ? editing : undefined;
  const pur = editing && !("type" in editing) ? editing : undefined;
  const savedMoney = pur ? purchaseMoneyFacts(pur) : null;

  const [date, setDate] = useState(
    () => rec?.localDate ?? pur?.localDate ?? initialDate ?? todayLocal(tz),
  );
  const [timeKnown, setTimeKnown] = useState(() =>
    rec ? rec.precision === "exact" : !initialDate || initialDate === todayLocal(tz),
  );
  const [period, setPeriod] = useState<PartOfDay | "">(rec?.partOfDay ?? "");
  const [time, setTime] = useState(() =>
    rec?.at ? timeOf(rec.at, tz) : timeOf(new Date().toISOString(), tz),
  );
  const [weight, setWeight] = useState(rec?.type === "weight" ? String(rec.value) : "");
  const [med, setMed] = useState(
    rec?.type === "injection" ? (rec.medication ?? "") : (pur?.medication ?? ""),
  );
  const [dose, setDose] = useState(
    rec?.type === "injection" && rec.doseValue != null ? String(rec.doseValue) : "",
  );
  const [doseUnit, setDoseUnit] = useState(
    rec?.type === "injection" ? (rec.doseUnit ?? "mg") : "mg",
  );
  const [site, setSite] = useState<string | null>(rec?.type === "injection" ? rec.site : null);
  const [useStock, setUseStock] = useState(rec?.type === "injection" ? rec.usedStock : false);
  const [lotId, setLotId] = useState(rec?.type === "injection" ? (rec.stockPurchaseId ?? "") : "");
  const selectedLot = j.inventory.lots.find((l) => l.id === lotId);
  const [water, setWater] = useState<"yes" | "not_yet">(rec?.type === "water" ? rec.answer : "yes");
  const [unit, setUnit] = useState<StockUnit | "">(pur?.stockUnit ?? (pur ? "" : "single"));
  const [addsStock, setAddsStock] = useState(pur ? pur.addsStock !== false : true);
  const [product, setProduct] = useState(pur?.product ?? "");
  const [merchant, setMerchant] = useState(pur?.merchant ?? "");
  const [feel, setFeel] = useState(rec?.type === "condition" ? rec.label : t("feel.calm"));
  const [note, setNote] = useState(
    rec?.type === "condition" ? (rec.note ?? "") : rec?.type === "memory" ? rec.note : "",
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoPending = useRef(false);
  const photoGeneration = useRef(0);
  const active = useRef(true);
  // Auth can invalidate this render before React closes or replaces the form.
  const ownsForm = () => active.current && isSessionCurrent() && j.isCurrentOwner();
  useLayoutEffect(() => {
    active.current = true;
    photoPending.current = false;
    setPhotoBusy(false);
    const photos = photoGeneration;
    return () => {
      active.current = false;
      photos.current++;
    };
  }, [isSessionCurrent]);
  const [photo, setPhoto] = useState<string | null>(
    rec?.type === "memory" ? (rec.photo ?? null) : null,
  );
  const [amount, setAmount] = useState(
    pur && savedMoney?.amount !== null ? String(pur.amount) : "",
  );
  const [currency, setCurrency] = useState(pur ? (savedMoney?.currency ?? "") : "KRW");
  const [doses, setDoses] = useState(
    pur?.quantity != null
      ? String(pur.quantity)
      : pur && pur.addsStock !== false
        ? String(pur.doses)
        : "",
  );
  const [remDate, setRemDate] = useState(() =>
    j.reminder ? localDateOf(j.reminder.at, tz) : todayLocal(tz),
  );
  const [remTime, setRemTime] = useState(j.reminder ? timeOf(j.reminder.at, tz) : "20:00");
  const [stock, setStock] = useState("");
  const [meas, setMeas] = useState(() => {
    const m = rec?.type === "measure" ? rec : null;
    const f = (v: number | null | undefined) => (v != null ? String(v) : "");
    return { waist: f(m?.waist), hip: f(m?.hip), chest: f(m?.chest), thigh: f(m?.thigh) };
  });
  const composing = useRef(false);
  const submitted = useRef(false);
  const [saving, setSaving] = useState(false);
  const [entryId] = useState(() => rec?.id ?? pur?.id ?? j.newId());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const stockOk =
    kind === "injection" &&
    !!selectedLot &&
    canDeduct(selectedLot.unit) &&
    med.trim() === selectedLot.medication;

  useLayoutEffect(() => {
    if (err) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [err]);

  const titles: Record<EntryKind, string> = {
    meal: t("type.meal"),
    menu: "",
    weight: t("type.weight"),
    injection: t("type.injection"),
    condition: t("type.condition"),
    memory: t("type.memory"),
    purchase: t(pur?.addsStock === false ? "type.expense" : "type.purchase"),
    water: t("type.water"),
    reminder: t("reminder.set"),
    stock: t("inv.edit"),
    voice: t("voice.all"),
    measure: t("type.measure"),
  };

  const editedEvidence = () => {
    if (!rec?.evidence) return undefined;
    const values: Record<string, string> = {
      date,
      time: timeKnown ? time : "",
      partOfDay: timeKnown ? "" : period,
      value: weight,
      answer: water,
      medication: med,
      doseValue: dose,
      doseUnit,
      site: site ?? "",
      label: feel,
      note,
      ...meas,
    };
    const confirmed = { ...rec.evidence.confirmed };
    for (const field of FIELDS[kind as keyof typeof FIELDS] ?? [])
      confirmed[field.k] = values[field.k] ?? confirmed[field.k] ?? "";
    return {
      ...rec.evidence,
      proposed: {
        ...rec.evidence.proposed,
        partOfDay: rec.evidence.proposed["partOfDay"] ?? rec.partOfDay ?? "",
      },
      confirmed,
    };
  };
  const base = (at: string | null) => ({
    ...(rec ?? {}),
    ...(rec?.evidence ? { evidence: editedEvidence()! } : {}),
    ...(rec?.demo ? { demo: true } : {}),
    id: entryId,
    localDate: date,
    createdAt: rec?.createdAt ?? new Date().toISOString(),
    source: "manual_text" as const,
    precision: timeKnown
      ? ("exact" as const)
      : period
        ? ("part_of_day" as const)
        : ("date_only" as const),
    at,
    partOfDay: timeKnown ? null : period || null,
  });

  const save = () => {
    if (!ownsForm() || submitted.current || photoPending.current) return;
    submitted.current = true;
    setSaving(true);
    let completed = false;
    try {
      if (
        ["weight", "injection", "condition", "memory", "purchase", "measure", "water"].includes(
          kind,
        ) &&
        !validDate(date)
      )
        return setErr(t("validation.date"));
      const at = timeKnown
        ? exactLocalInstant(date, time, tz, rec?.precision === "exact" ? rec.at : null)
        : null;
      if (
        timeKnown &&
        ["weight", "injection", "condition", "memory", "measure", "water"].includes(kind) &&
        !at
      )
        return setErr(t("validation.date"));
      const before = j.snapshot();
      if (kind === "weight") {
        const v = Number(weight.replace(",", "."));
        if (!weight || !Number.isFinite(v) || v < 20 || v > 400)
          return setErr(t("validation.manual0"));
        j.saveRecord({ ...base(at), type: "weight", value: Math.round(v * 10) / 10, unit: "kg" });
      } else if (kind === "injection") {
        const dv = dose ? Number(dose.replace(",", ".")) : null;
        if (dose && (!Number.isFinite(dv) || (dv !== null && dv < 0)))
          return setErr(t("validation.manual1"));
        if (useStock && !stockOk) return setErr(t("stock.choose"));
        j.saveRecord({
          ...base(at),
          type: "injection",
          medication: med.trim() || null,
          doseValue: dv,
          doseUnit: dv != null ? doseUnit : null,
          site,
          usedStock: useStock,
          stockPurchaseId: useStock ? lotId : null,
          stockIdentity: useStock && selectedLot ? lotIdentity(selectedLot) : null,
        });
      } else if (kind === "water") {
        j.saveRecord({ ...base(at), type: "water", answer: water });
      } else if (kind === "condition") {
        j.saveRecord({
          ...base(at),
          type: "condition",
          label: feel,
          note: note.trim(),
        });
      } else if (kind === "memory") {
        if (!note.trim() && !photo) return setErr(t("validation.manual2"));
        j.saveRecord({ ...base(at), type: "memory", note: note.trim(), photo });
      } else if (kind === "measure") {
        const vals: Record<string, number | null> = {};
        for (const [k, raw] of Object.entries(meas)) {
          if (!raw.trim()) {
            vals[k] = null;
            continue;
          }
          const v = Number(raw.replace(",", "."));
          if (!Number.isFinite(v) || v < 10 || v > 300) return setErr(t("validation.manual3"));
          vals[k] = Math.round(v * 10) / 10;
        }
        if (Object.values(vals).every((v) => v == null)) return setErr(t("validation.manual4"));
        j.saveRecord({
          ...base(at),
          type: "measure",
          unit: "cm",
          waist: vals["waist"] ?? null,
          hip: vals["hip"] ?? null,
          chest: vals["chest"] ?? null,
          thigh: vals["thigh"] ?? null,
        });
      } else if (kind === "purchase") {
        const a = parseAmountInput(amount);
        const hasQty = doses.trim() !== "";
        const n = hasQty ? Number(doses) : 0;
        if (
          (a === null && savedMoney?.amount !== null) ||
          (a !== null && (!Number.isFinite(a) || a < 0))
        )
          return setErr(t("money.invalid"));
        if (hasQty && (!Number.isInteger(n) || n <= 0)) return setErr(t("validation.manual6"));
        const stockOn = hasQty && addsStock;
        j.savePurchase({
          ...(pur?.evidence
            ? {
                evidence: {
                  ...pur.evidence,
                  confirmed: {
                    ...pur.evidence.confirmed,
                    date,
                    amount: a === null ? "" : String(a),
                    quantity: hasQty ? String(n) : "",
                    stockUnit: hasQty ? unit : "",
                    product,
                    merchant,
                    currency,
                    medication: med.trim(),
                  },
                },
              }
            : {}),
          id: entryId,
          localDate: date,
          amount: a ?? pur?.amount ?? 0,
          currency: currency || pur?.currency || "KRW",
          quantity: hasQty ? n : null,
          doses: stockOn ? n : 0,
          medication: med.trim() || null,
          product: product.trim() || null,
          stockUnit: hasQty ? unit || null : null,
          addsStock: stockOn,
          merchant: merchant.trim() || null,
          ...(pur?.demo ? { demo: true } : {}),
        });
      } else if (kind === "reminder") {
        const reminderAt = exactLocalInstant(remDate, remTime, tz, j.reminder?.at);
        if (!validDate(remDate) || !reminderAt) return setErr(t("validation.date"));
        j.setReminder(reminderAt);
      } else if (kind === "stock") {
        const n = Number(stock);
        if (!stock.trim() || !Number.isInteger(n) || n < 0) return setErr(t("validation.manual7"));
        if (!selectedLot) return setErr(t("stock.choose"));
        j.setStock(n, selectedLot.id);
      }
      completed = true;
      celebrateSave();
      toast.success(t("toast.saved"), {
        action: { label: t("toast.undo"), onClick: j.undoFor(before) },
      });
      onDone();
    } catch {
      setErr(t("evidence.saveFailed"));
    } finally {
      if (!completed) {
        submitted.current = false;
        setSaving(false);
      }
    }
  };

  const remove = () => {
    if (!ownsForm()) return;
    try {
      const before = j.snapshot();
      if (rec) j.deleteRecord(rec.id);
      else if (pur) j.deletePurchase(pur.id);
      else if (kind === "reminder") j.setReminder(null);
      active.current = false;
      photoGeneration.current++;
      toast(t("toast.deleted"), { action: { label: t("toast.undo"), onClick: j.undoFor(before) } });
      onDone();
    } catch {
      setErr(t("evidence.saveFailed"));
    }
  };

  if (kind === "voice")
    return (
      <MomoSheet
        onMeal={onMeal}
        onDone={onDone}
        onManual={onManual}
        isSessionCurrent={isSessionCurrent}
      />
    );

  if (kind === "meal")
    return (
      <MealForm
        editing={rec?.type === "meal" ? rec : undefined}
        images={mealSeed.images}
        note={mealSeed.note}
        initialDate={initialDate}
        onDone={onDone}
        isSessionCurrent={isSessionCurrent}
      />
    );

  const showDate = [
    "weight",
    "injection",
    "condition",
    "memory",
    "purchase",
    "measure",
    "water",
  ].includes(kind);
  const showTime = ["weight", "injection", "condition", "memory", "measure", "water"].includes(
    kind,
  );

  return (
    <form
      noValidate
      onChange={() => {
        if (err) setErr(null);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!composing.current) save();
      }}
      data-entry-kind={kind}
      className="journal-form feel-form space-y-5"
    >
      <DrawerTitle className="text-[24px] font-bold">
        {titles[kind]}
        {editing && ` · ${t("ui.edit")}`}
      </DrawerTitle>
      {(rec?.evidence ?? pur?.evidence) && (
        <SourceEvidence evidence={(rec?.evidence ?? pur?.evidence)!} />
      )}
      <DrawerDescription className="sr-only">{titles[kind]}</DrawerDescription>

      {kind === "weight" && (
        <Field label={t("f.value")}>
          <input
            inputMode="decimal"
            aria-invalid={err === t("validation.manual0") || undefined}
            aria-describedby={err === t("validation.manual0") ? "entry-error" : undefined}
            className={cn(inputCls, "h-16 text-[28px] font-bold")}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="78.4"
          />
        </Field>
      )}

      {(kind === "injection" ||
        (kind === "purchase" && (pur?.addsStock !== false || !!pur.medication))) && (
        <div>
          <span className="mb-1.5 block text-sm font-medium">
            {t("f.medication")} <span className="text-muted-foreground">({t("f.optional")})</span>
          </span>
          <MedicationPicker value={med} onChange={setMed} />
        </div>
      )}

      {kind === "injection" && (
        <details open={!!editing} className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            {t("ui.injectionDetails")}
          </summary>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <Field label={t("f.dose")} optional>
              <input
                inputMode="decimal"
                className={inputCls}
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder={t("unknown")}
              />
            </Field>
            <Field label={t("ux.doseUnit")}>
              <select
                aria-label={t("ux.doseUnit")}
                className={inputCls}
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value)}
              >
                <option>mg</option>
                <option>mcg</option>
                <option>mL</option>
              </select>
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">
              {t("f.site")} <span className="text-muted-foreground">({t("f.optional")})</span>
            </span>
            <SitePicker value={site} onChange={setSite} />
          </div>
          {j.inventory.lots.length > 0 ? (
            <Field label={t("stock.lot")}>
              <select
                className={inputCls}
                value={lotId}
                onChange={(e) => {
                  const id = e.target.value;
                  setLotId(id);
                  const lot = j.inventory.lots.find((l) => l.id === id);
                  // Explicit lot choice adopts its spelling; stock matching stays exact.
                  if (lot) setMed(lot.medication);
                }}
              >
                <option value="">{t("stock.choose")}</option>
                {j.inventory.lots
                  .filter((l) => sameCatalogMedication(l.medication, med) && canDeduct(l.unit))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.medication} · {l.product} · {l.localDate} · {l.balance}{" "}
                      {t(`unit.${l.unit}`)} · {l.id.slice(-6)}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">{t("stock.none")}</p>
          )}
          {rec?.type === "injection" && rec.usedStock && !rec.stockPurchaseId && (
            <p className="text-sm">{t("stock.review")}</p>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={useStock}
              disabled={!stockOk && !useStock}
              onChange={(e) => setUseStock(e.target.checked)}
            />
            {selectedLot
              ? t("stock.deduct", { u: t(`unit.${selectedLot.unit}`) })
              : t("ux.stockUse")}
          </label>
          {stockOk && selectedLot && (
            <p>
              {t("stock.before")}{" "}
              {selectedLot.balance +
                (rec?.type === "injection" && rec.usedStock && matchesLot(rec, selectedLot)
                  ? 1
                  : 0)}{" "}
              → {t("stock.after")}{" "}
              {selectedLot.balance +
                (rec?.type === "injection" && rec.usedStock && matchesLot(rec, selectedLot)
                  ? 1
                  : 0) -
                (useStock ? 1 : 0)}
            </p>
          )}
        </details>
      )}

      {kind === "condition" && (
        <>
          <div className="flex flex-wrap gap-2">
            {FEELINGS.map((k) => (
              <Button
                variant="unstyled"
                size="unstyled"
                type="button"
                key={k}
                aria-pressed={feel === t(k)}
                className={chipCls(feel === t(k))}
                onClick={() => setFeel(t(k))}
              >
                {t(k)}
              </Button>
            ))}
          </div>
          <Field label={t("f.note")} optional>
            <textarea
              className={cn(inputCls, "h-24 py-3")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </>
      )}

      {kind === "memory" && (
        <>
          <div>
            <span className="mb-1.5 block text-sm font-medium">
              {t("f.photo")} <span className="text-muted-foreground">({t("f.optional")})</span>
            </span>
            {photo && (
              <PhotoImg
                src={photo}
                alt={t("f.photo")}
                className="mb-2 max-h-56 w-full rounded-[16px] object-cover"
              />
            )}
            <div className="flex gap-2">
              <label className="press flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-primary/40 bg-card px-4 text-[15px] font-semibold focus-within:ring-2 focus-within:ring-ring">
                <ImageIcon className="size-5" />
                {t(photoBusy ? "photo.processing" : photo ? "photo.change" : "photo.pick")}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={photoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f || photoPending.current || !ownsForm()) return;
                    photoPending.current = true;
                    setPhotoBusy(true);
                    const token = ++photoGeneration.current;
                    const owner = j.user?.id ?? "guest";
                    const isCurrent = () => ownsForm() && token === photoGeneration.current;
                    shrinkPhoto(f)
                      .then(async (data) => {
                        if (!isCurrent()) return;
                        const ref = await retainPhoto(data, owner);
                        if (isCurrent()) setPhoto(ref);
                      })
                      .catch(() => {
                        if (isCurrent()) setErr(t("validation.manual8"));
                      })
                      .finally(() => {
                        if (!isCurrent()) return;
                        photoPending.current = false;
                        setPhotoBusy(false);
                      });
                  }}
                />
              </label>
              {photo && (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  type="button"
                  onClick={() => {
                    if (!ownsForm()) return;
                    photoGeneration.current++;
                    photoPending.current = false;
                    setPhotoBusy(false);
                    setPhoto(null);
                  }}
                  className="press min-h-14 rounded-[16px] border px-4 text-[15px]"
                >
                  {t("photo.remove")}
                </Button>
              )}
            </div>
            {!photo && <p className="mt-1 text-sm text-muted-foreground">{t("photo.hint")}</p>}
          </div>
          <Field label={t("f.note")}>
            <textarea
              className={cn(inputCls, "h-24 py-3")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("pr.memoryQ")}
            />
          </Field>
        </>
      )}

      {kind === "measure" && (
        <div className="grid grid-cols-2 gap-3">
          {(["waist", "hip", "chest", "thigh"] as const).map((k) => (
            <Field key={k} label={t(`f.${k}`)} optional>
              <input
                inputMode="decimal"
                className={inputCls}
                value={meas[k]}
                onChange={(e) => setMeas({ ...meas, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      )}

      {kind === "purchase" && (
        <>
          <Field label={t(pur?.addsStock === false ? "f.product" : "stock.product")} optional>
            <input
              className={inputCls}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
          </Field>
          <Field label={t("f.merchant")} optional>
            <input
              className={inputCls}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field label={t("f.amount")}>
              <input
                inputMode="decimal"
                className={inputCls}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="12000"
                aria-describedby="purchase-amount-hint"
              />
            </Field>
            <Field label={t("evidence.currency")}>
              <select
                className={inputCls}
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {savedMoney?.currency === null && <option value="">{t("unknown")}</option>}
                {[
                  ...new Set([
                    "KRW",
                    "EUR",
                    "USD",
                    "JPY",
                    "GBP",
                    "CAD",
                    "AUD",
                    "CHF",
                    "CNY",
                    ...(currency ? [currency] : []),
                  ]),
                ].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p id="purchase-amount-hint" className="-mt-2 text-sm text-muted-foreground">
            {t("money.hint")}
          </p>
          <details open={pur?.addsStock !== false} className="space-y-3">
            <summary>{t("money.stockDetails")}</summary>
            {pur?.addsStock === false && !pur.medication && (
              <div>
                <span className="mb-1.5 block text-sm font-medium">
                  {t("f.medication")} ({t("f.optional")})
                </span>
                <MedicationPicker value={med} onChange={setMed} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("f.qty")} optional>
                <input
                  inputMode="numeric"
                  className={inputCls}
                  value={doses}
                  onChange={(e) => setDoses(e.target.value)}
                  placeholder={t("f.qtyHint")}
                />
              </Field>
              <Field label={t("f.unit")}>
                <select
                  className={inputCls}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as StockUnit | "")}
                >
                  <option value="">{t("stock.review")}</option>
                  <option value="single">{t("unit.single")}</option>
                  <option value="pen">{t("unit.pen")}</option>
                  <option value="dose">{t("unit.dose")}</option>
                </select>
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-primary)]"
                disabled={!doses.trim()}
                checked={!!doses.trim() && addsStock}
                onChange={(e) => setAddsStock(e.target.checked)}
              />
              {t("f.addsStock")}
            </label>
            {!doses.trim() && (
              <p className="-mt-3 text-sm text-muted-foreground">{t("f.expenseOnly")}</p>
            )}
          </details>
        </>
      )}

      {kind === "water" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {(["yes", "not_yet"] as const).map((a) => (
              <Button
                variant="unstyled"
                size="unstyled"
                type="button"
                key={a}
                aria-pressed={water === a}
                className={chipCls(water === a)}
                onClick={() => setWater(a)}
              >
                {t(a === "yes" ? "pr.water.yes" : "pr.water.notYet")}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("water.note")}</p>
        </div>
      )}

      {kind === "reminder" && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t("f.reminderAt")}</legend>
          <p id={reminderHelpId} className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {t("reminder.inApp")}
          </p>
          <div className="journal-clock-fields grid grid-cols-2 gap-3">
            <label className="block text-sm">
              {t("f.date")}
              <input
                type="date"
                className={inputCls}
                value={remDate}
                aria-describedby={reminderHelpId}
                onChange={(e) => setRemDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              {t("f.time")}
              <input
                type="time"
                className={inputCls}
                value={remTime}
                aria-describedby={reminderHelpId}
                onChange={(e) => setRemTime(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
      )}

      {kind === "stock" && (
        <>
          <Field label={t("stock.lot")}>
            <select
              className={inputCls}
              value={lotId}
              onChange={(e) => {
                setLotId(e.target.value);
                setStock(
                  String(j.inventory.lots.find((l) => l.id === e.target.value)?.balance ?? ""),
                );
              }}
            >
              <option value="">{t("stock.choose")}</option>
              {j.inventory.lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.medication} · {l.product} · {l.localDate} · {t(`unit.${l.unit}`)} ·{" "}
                  {l.id.slice(-6)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={
              selectedLot
                ? `${t("f.stockCount")} · ${t(`unit.${selectedLot.unit}`)}`
                : t("f.stockCount")
            }
          >
            <input
              inputMode="numeric"
              className={inputCls}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
        </>
      )}

      {(showDate || showTime) && (
        <details open={!!editing} className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            {t(showTime ? "ui.when" : "f.date")} · {date}
            {showTime &&
              (timeKnown && time
                ? ` · ${time}`
                : ` · ${period ? t(`pod.${period}`) : t("unknown")}`)}
          </summary>
          {showDate && (
            <div
              className={cn(
                "journal-clock-fields grid gap-3",
                showTime ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              <Field label={t("f.date")}>
                <input
                  type="date"
                  className={inputCls}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              {showTime && (
                <Field label={t("f.time")}>
                  <input
                    type="time"
                    disabled={!timeKnown}
                    className={cn(inputCls, !timeKnown && "opacity-40")}
                    value={timeKnown ? time : ""}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
          {showTime && (
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-primary)]"
                checked={!timeKnown}
                onChange={(e) => setTimeKnown(!e.target.checked)}
              />
              {t("f.timeUnknown")}
            </label>
          )}
          {showTime && !timeKnown && <TimeOfDayField value={period} onChange={setPeriod} />}
        </details>
      )}
      {err && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          id="entry-error"
          className="feel-error rounded-xl text-sm text-destructive"
        >
          {err}
        </p>
      )}

      <div className="sheet-actions flex gap-3">
        {(editing || (kind === "reminder" && j.reminder)) && (
          <Button
            variant="unstyled"
            size="unstyled"
            type="button"
            onClick={remove}
            className="press h-12 rounded-full border border-destructive/40 px-5 text-destructive"
          >
            {t("f.delete")}
          </Button>
        )}
        <Button
          variant="unstyled"
          size="unstyled"
          type="submit"
          disabled={saving || photoBusy}
          className="press h-12 flex-1 rounded-full bg-primary font-semibold text-primary-foreground"
        >
          {t(saving ? "momo.saving" : "f.save")}
        </Button>
      </div>
    </form>
  );
}
