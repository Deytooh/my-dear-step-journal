import { retainPhoto, shrinkPhoto } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Scale,
  Syringe,
  Smile,
  Ruler,
  Image as ImageIcon,
  Receipt,
  Mic,
  Square,
  X,
  LoaderCircle,
  Check,
  ImagePlus,
  AlertTriangle,
  Undo2,
  MessageSquare,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { extractWithMomo } from "@/lib/momo.functions";
import { useJournal } from "@/lib/journal";
import { todayLocal } from "@/lib/dates";
import { useQuickAdd } from "./AppShell";
import { recordValue } from "./ui";
import {
  candidateToDraft,
  draftToEntry,
  FIELDS,
  isDuplicate,
  missingFields,
  type Draft,
  type Entry,
} from "@/lib/momo-drafts";
import { celebrateSave } from "./AppFeel";
import { t, getLocale, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SourceEvidence } from "./SourceEvidence";
import { SitePicker } from "./SitePicker";
import { MealItemsEditor } from "./MealItemsEditor";
import { draftMealSchema, type MealDetails } from "@/lib/meals";
import { MedicationPicker } from "./MedicationPicker";
import momo from "@/assets/momo-hamster.png.asset.json";

type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
};

type CaptureRecovery = {
  key: string;
  recovered: boolean;
  saved: boolean;
  text: string;
  images: string[];
  drafts: Draft[] | null;
  usedVoice: boolean;
  signature: string | null;
};
function persistCapture(state: CaptureRecovery | null) {
  if (!state?.recovered) return;
  try {
    if (state.saved || (!state.drafts && !state.text.trim() && !state.images.length))
      sessionStorage.removeItem(state.key);
    else
      sessionStorage.setItem(
        state.key,
        JSON.stringify({
          text: state.text,
          images: state.images,
          drafts: state.drafts ?? [],
          usedVoice: state.usedVoice,
          signature: state.signature,
        }),
      );
  } catch {
    /* An unavailable browser store never discards the in-memory capture. */
  }
}

const typeLabel = (ty: Draft["type"]) => t(`type.${ty}` as Key);
const inputCls =
  "h-11 w-full rounded-[12px] border bg-background px-3 text-[15px] outline-none focus:border-primary";

export function MomoSheet({
  onDone,
  onManual,
  onMeal,
  inline = false,
}: {
  inline?: boolean;
  onMeal?: ((images: string[], note: string) => void) | undefined;
  onDone: () => void;
  onManual: () => void;
}) {
  const j = useJournal();
  const openEntry = useQuickAdd();
  const extract = useServerFn(extractWithMomo);
  const [usedVoice, setUsedVoice] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveGuard = useRef(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [step, setStep] = useState<"input" | "review">("input");
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const recRef = useRef<SR | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoVersion = useRef(0);
  const photoGuard = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [dismissedQuestion, setDismissedQuestion] = useState<string | null>(null);
  const beforeRec = useRef("");
  const inflight = useRef(false);
  const requestVersion = useRef(0);
  useEffect(
    () => () => {
      requestVersion.current++;
      photoVersion.current++;
      recRef.current?.abort();
    },
    [],
  );
  const [consent, setConsent] = useState(false);
  const cache = useRef<{ sig: string; drafts: Draft[] } | null>(null);
  const today = todayLocal(j.tz);
  const recoveryKey = `mds.momo.draft.${j.user?.id ?? "guest"}`;
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  useEffect(() => {
    requestVersion.current++;
    photoVersion.current++;
    inflight.current = false;
    recRef.current?.abort();
    setBusy(false);
    setListening(false);
    setConsent(false);
    setFailure(null);
    setText("");
    setImages([]);
    setDrafts(null);
    setStep("input");
    setSaved(false);
    setUsedVoice(false);
    cache.current = null;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (
          typeof data.text === "string" &&
          Array.isArray(data.images) &&
          data.images.every((x: unknown) => typeof x === "string") &&
          Array.isArray(data.drafts) &&
          data.drafts.every(
            (d: Draft) =>
              d &&
              Object.prototype.hasOwnProperty.call(FIELDS, d.type) &&
              typeof d.key === "string" &&
              d.f &&
              Object.values(d.f).every((v) => typeof v === "string"),
          )
        ) {
          if (typeof data.signature === "string")
            cache.current = { sig: data.signature, drafts: data.drafts };
          setText(data.text);
          setImages(data.images);
          setDrafts(data.drafts.length ? data.drafts : null);
          setUsedVoice(!!data.usedVoice);
          setStep(data.drafts.length ? "review" : "input");
        }
      }
    } catch {
      /* Recovery is best effort; never block manual recording. */
    }
    setRecoveredKey(recoveryKey);
  }, [recoveryKey]);
  const recovery = useRef<CaptureRecovery | null>(null);
  recovery.current = {
    key: recoveryKey,
    recovered: recoveredKey === recoveryKey,
    saved,
    text,
    images,
    drafts,
    usedVoice,
    signature: cache.current?.sig ?? null,
  };
  useEffect(() => {
    // Avoid serializing every attached image on every keystroke. Records still commit synchronously.
    if (saved) {
      persistCapture(recovery.current);
      return;
    }
    const timer = setTimeout(() => persistCapture(recovery.current), 180);
    return () => clearTimeout(timer);
  }, [drafts, text, images, usedVoice, saved, recoveryKey, recoveredKey]);
  useEffect(() => {
    const flush = () => persistCapture(recovery.current);
    const hidden = () => {
      if (document.hidden) flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, []);

  const startMic = () => {
    const W = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      toast(t("momo.noMic"));
      return;
    }
    let r: SR;
    try {
      r = new Ctor();
    } catch {
      toast(t("momo.noMic"));
      textareaRef.current?.focus();
      return;
    }
    r.lang = { ko: "ko-KR", en: "en-US", fr: "fr-FR" }[getLocale()];
    r.interimResults = false;
    r.continuous = true;
    beforeRec.current = text;
    const version = ++requestVersion.current;
    inflight.current = false;
    setBusy(false);
    r.onresult = (e) => {
      if (version !== requestVersion.current) return;
      setUsedVoice(true);
      setText(
        (beforeRec.current ? beforeRec.current + " " : "") +
          Array.from(e.results)
            .map((x) => x[0]?.transcript ?? "")
            .join(" "),
      );
    };
    r.onend = () => {
      if (version === requestVersion.current) setListening(false);
    };
    r.onerror = () => {
      if (version !== requestVersion.current) return;
      setListening(false);
      toast(t("momo.noMic"));
    };
    recRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
      toast(t("momo.noMic"));
      textareaRef.current?.focus();
    }
  };
  const manual = () => {
    requestVersion.current++;
    recRef.current?.abort();
    inflight.current = false;
    setBusy(false);
    setListening(false);
    onManual();
  };
  const stopMic = () => {
    try {
      recRef.current?.stop();
    } catch {
      setListening(false);
    }
  };
  const cancelMic = () => {
    requestVersion.current++;
    recRef.current?.abort();
    setText(beforeRec.current);
    setListening(false);
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || photoGuard.current) return;
    photoGuard.current = true;
    setPhotoBusy(true);
    const token = photoVersion.current;
    try {
      const next = await Promise.all(
        Array.from(files)
          .slice(0, 3 - images.length)
          .map(shrinkPhoto),
      );
      if (token !== photoVersion.current) return;
      requestVersion.current++;
      inflight.current = false;
      setBusy(false);
      setImages((previous) => [...previous, ...next].slice(0, 3));
    } catch {
      if (token === photoVersion.current) setFailure(t("meal.photoError"));
    } finally {
      photoGuard.current = false;
      if (token === photoVersion.current) setPhotoBusy(false);
    }
  };

  const run = async () => {
    if (!j.user || !consent || photoBusy || inflight.current || (!text.trim() && !images.length))
      return;
    const sig = JSON.stringify([text, images, today, j.tz]);
    // Repeating the same request reuses the previous result instead of asking again.
    if (cache.current?.sig === sig) {
      setDrafts(cache.current.drafts);
      setStep("review");
      return;
    }
    const version = ++requestVersion.current;
    inflight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const res = await extract({
        data: { text: text.trim(), today, timezone: j.tz, images, locale: getLocale() },
      });
      if (version !== requestVersion.current) return;
      if (res.error) {
        setFailure(t(`ai.${res.error}`));
        return;
      }
      const retained = await Promise.all(images.map((p) => retainPhoto(p, j.user?.id ?? "guest")));
      if (version !== requestVersion.current) return;
      let ds = res.candidates.map((c, i) =>
        candidateToDraft(c, `${j.newId()}-${i}`, today, {
          method:
            images.length && text
              ? "mixed"
              : images.length
                ? "photos"
                : usedVoice
                  ? "voice"
                  : "text",
          text,
          photos: retained,
        }),
      );
      for (const d of ds)
        if (d.evidence && res.model)
          d.evidence.analysis = {
            model: res.model,
            promptVersion: "journal-v3",
            schemaVersion: 1,
            analyzedAt: new Date().toISOString(),
          };
      const seenRecords = [...j.snapshot().records],
        seenPurchases = [...j.snapshot().purchases];
      ds = ds.map((d) => {
        const entry = draftToEntry(d, d.key, j.tz, today);
        const dup = isDuplicate(entry, seenRecords, seenPurchases);
        if ("record" in entry) seenRecords.push(entry.record);
        if ("purchase" in entry) seenPurchases.push(entry.purchase);
        return { ...d, dup, on: !dup };
      });
      cache.current = { sig, drafts: ds };
      setDrafts(ds);
      setStep("review");
    } catch {
      if (version === requestVersion.current) setFailure(t("momo.error"));
    } finally {
      if (version === requestVersion.current) {
        inflight.current = false;
        setBusy(false);
      }
    }
  };

  const changeDrafts = (change: (previous: Draft[]) => Draft[]) =>
    setDrafts((previous) => {
      const next = change(previous ?? []);
      if (cache.current) cache.current = { ...cache.current, drafts: next };
      return next;
    });
  const update = (key: string, patch: Partial<Draft>) =>
    changeDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const entries = (drafts ?? [])
    .filter((d) => d.on)
    .map((d) => ({ d, e: draftToEntry(d, d.key, j.tz, today) as Entry }));
  const invalid = entries.filter((x) => "error" in x.e);

  const confirm = async () => {
    if (saveGuard.current || saved || !entries.length) return;
    if (invalid.length) {
      setFailure(t("evidence.clarify"));
      return;
    }
    const snapshot = j.snapshot();
    const unexpected = entries.filter(
      ({ d, e }) =>
        !d.dup &&
        isDuplicate(
          e,
          snapshot.records.filter((r) => r.id !== d.key),
          snapshot.purchases.filter((p) => p.id !== d.key),
        ),
    );
    if (unexpected.length) {
      changeDrafts((ds) =>
        ds.map((d) =>
          unexpected.some((x) => x.d.key === d.key) ? { ...d, dup: true, on: false } : d,
        ),
      );
      setFailure(t("momo.dup"));
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    setFailure(null);
    let successful = false;
    try {
      // Evidence already contains retained, source-linked references from extraction.
      const records = entries.flatMap(({ e }) => ("record" in e ? [e.record] : []));
      const purchases = entries.flatMap(({ e }) => ("purchase" in e ? [e.purchase] : []));
      const before = j.snapshot();
      j.saveMomoBatch(records, purchases, j.user?.id ?? null);
      const undo = j.undoFor(before);
      toast.success(t("evidence.localSaved"), {
        action: {
          label: t("toast.undo"),
          onClick: () => {
            undo();
            saveGuard.current = false;
            setSaved(false);
            setStep("review");
          },
        },
      });
      celebrateSave();
      successful = true;
      setSaved(true);
    } catch {
      setFailure(t("evidence.saveFailed"));
    } finally {
      if (!successful) saveGuard.current = false;
      setSaving(false);
    }
  };

  const question = invalid[0];
  const mealQuestion = !question
    ? (drafts ?? []).find(
        (d) =>
          d.on &&
          d.type === "meal" &&
          d.key !== dismissedQuestion &&
          (() => {
            try {
              return JSON.parse(d.f["meal"] ?? "").consumedFraction === null;
            } catch {
              return false;
            }
          })(),
      )
    : undefined;
  const resetCapture = () => {
    requestVersion.current++;
    photoVersion.current++;
    cache.current = null;
    saveGuard.current = false;
    setSaved(false);
    setDrafts(null);
    setText("");
    setImages([]);
    setFailure(null);
    setStep("input");
    setUsedVoice(false);
    setConsent(false);
  };
  const savedIds = new Set((drafts ?? []).filter((d) => d.on).map((d) => d.key));
  return (
    <div
      id={inline ? "momo-workspace" : undefined}
      tabIndex={inline ? -1 : undefined}
      data-stage={step}
      className={cn(
        "journal-form feel-form space-y-4",
        inline && "momo-workspace app-surface rounded-[28px] bg-card p-4",
      )}
      aria-busy={busy}
    >
      {inline ? (
        <div>
          <h1 className="text-[25px] font-bold tracking-tight leading-snug">
            {t(saved ? "mm.saved" : step === "review" ? "mm.review" : "mm.title")}
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{t("mm.subtitle")}</p>
        </div>
      ) : (
        <>
          <DrawerTitle className="text-[24px] font-bold">
            {t(step === "review" ? "mm.review" : "voice.all")}
          </DrawerTitle>
          <DrawerDescription>{t("momo.hint")}</DrawerDescription>
        </>
      )}

      {saved && (
        <div role="status" className="feel-panel rounded-[20px] bg-secondary p-4 space-y-3">
          <p className="flex items-center gap-2">
            <Check className="size-5 text-primary" />
            {t("evidence.localSaved")}
          </p>
          <p>{t(`sync.${j.sync}`)}</p>
          {j.sync === "error" && <Button onClick={j.retrySync}>{t("momo.retry")}</Button>}
          <ul className="divide-y">
            {j.records
              .filter((r) => savedIds.has(r.id))
              .map((r) => (
                <li key={r.id}>
                  <Button
                    variant="ghost"
                    className="min-h-12 w-full justify-start whitespace-normal text-left"
                    onClick={() => openEntry(r.type, r)}
                  >
                    {r.localDate} · {recordValue(r)}
                  </Button>
                </li>
              ))}
            {j.purchases
              .filter((p) => savedIds.has(p.id))
              .map((p) => (
                <li key={p.id}>
                  <Button
                    variant="ghost"
                    className="min-h-12 w-full justify-start whitespace-normal text-left"
                    onClick={() => openEntry("purchase", p)}
                  >
                    {p.localDate} · {p.product ?? t("type.purchase")} · {p.amount} {p.currency}
                  </Button>
                </li>
              ))}
          </ul>
          <Button onClick={inline ? resetCapture : onDone}>
            {t(inline ? "mm.new" : "evidence.close")}
          </Button>
        </div>
      )}
      {step === "input" && !saved && (
        <>
          <div>
            <textarea
              ref={textareaRef}
              aria-label={t("momo.input")}
              value={text}
              onChange={(e) => {
                requestVersion.current++;
                inflight.current = false;
                setBusy(false);
                setText(e.target.value);
              }}
              rows={3}
              maxLength={4000}
              placeholder={t("mm.placeholder")}
              className="momo-composer w-full border bg-card p-4 text-[16px] placeholder:text-muted-foreground"
            />
            {listening ? (
              <div className="flex items-center gap-2 rounded-[16px] bg-peach p-3" role="status">
                <span className="feel-busy size-3 rounded-full bg-destructive" aria-hidden />
                <span className="flex-1 text-[15px]">{t("momo.listening")}</span>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={stopMic}
                  className="press flex h-11 items-center gap-1 rounded-full bg-primary px-4 text-primary-foreground"
                >
                  <Square className="size-4" />
                  {t("momo.stop")}
                </Button>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={cancelMic}
                  aria-label={t("momo.cancelRec")}
                  className="press flex size-11 items-center justify-center rounded-full border bg-card"
                >
                  <X className="size-5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="unstyled"
                  size="unstyled"
                  type="button"
                  onClick={startMic}
                  className="press flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[18px] bg-secondary px-2 py-1 text-[14px] font-medium leading-snug"
                >
                  <Mic className="size-5 shrink-0" />
                  <span className="min-w-0">{t("mm.voice")}</span>
                </Button>
                <label
                  className={cn(
                    "press flex min-h-14 min-w-0 flex-1 flex-col cursor-pointer items-center justify-center gap-1 rounded-[18px] bg-secondary px-2 py-1 text-[14px] font-medium leading-snug focus-within:ring-2 focus-within:ring-ring",
                    (images.length >= 3 || photoBusy) && "pointer-events-none opacity-50",
                  )}
                >
                  <ImagePlus className="size-5 shrink-0" />
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>{t("f.photo")}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {images.length}/3
                    </span>
                  </span>
                  <input
                    aria-label={t("momo.photos")}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    disabled={images.length >= 3 || photoBusy}
                    onChange={(e) => {
                      addPhotos(e.target.files).catch(() => setFailure(t("momo.error")));
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-14 min-w-0 flex-1 flex-col gap-1 rounded-[18px] px-2 text-[14px]"
                  onClick={() => textareaRef.current?.focus()}
                >
                  <MessageSquare className="size-5" />
                  <span>{t("mm.message")}</span>
                </Button>
              </div>
            )}
            {usedVoice && text && !listening && beforeRec.current !== text && (
              <p className="mt-1 text-sm text-muted-foreground">{t("momo.check")}</p>
            )}
          </div>
          {images.length > 0 && (
            <div>
              <ul className="flex gap-3 overflow-x-auto py-2 [scrollbar-width:none]">
                {images.map((src, i) => (
                  <li key={src} className="feel-pop relative shrink-0">
                    <img
                      src={src}
                      alt={`${t("f.photo")} ${i + 1}`}
                      className="h-24 w-28 rounded-[16px] object-cover"
                    />
                    <Button
                      variant="unstyled"
                      size="unstyled"
                      disabled={photoBusy}
                      onClick={() => {
                        requestVersion.current++;
                        photoVersion.current++;
                        inflight.current = false;
                        setBusy(false);
                        setImages(images.filter((_, k) => k !== i));
                      }}
                      aria-label={`${t("photo.remove")} ${i + 1}`}
                      className="press absolute top-1 right-1 flex size-11 items-center justify-center rounded-full border bg-card/95 shadow-soft"
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-muted-foreground">{t("momo.photoHint")}</p>
            </div>
          )}
          {failure && (
            <div
              role="alert"
              className="rounded-[16px] border border-destructive/40 bg-card p-4 text-[15px]"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                {failure}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={run}
                  className="press h-11 flex-1 rounded-full border"
                >
                  {t("momo.retry")}
                </Button>
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={manual}
                  className="press h-11 flex-1 rounded-full border"
                >
                  {t("momo.manual")}
                </Button>
              </div>
            </div>
          )}
          {photoBusy && (
            <p role="status" className="text-sm">
              {t("photo.processing")}
            </p>
          )}
          <details className="journal-disclosure" open={consent || undefined}>
            <summary>{t("mm.privacy")}</summary>
            <p className="text-xs text-muted-foreground">{t("mm.voiceHint")}</p>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {t("ai.consent")}
            </label>
          </details>
          {!j.user && <p className="text-sm text-muted-foreground">{t("ai.signin")}</p>}
          {onMeal && (
            <Button
              variant="outline"
              className="min-h-12 w-full"
              onClick={async () => {
                const version = requestVersion.current;
                try {
                  const refs = await Promise.all(
                    images.map((p) => retainPhoto(p, j.user?.id ?? "guest")),
                  );
                  if (version === requestVersion.current) onMeal(refs, text);
                } catch {
                  setFailure(t("meal.photoError"));
                }
              }}
            >
              {t("meal.open")}
            </Button>
          )}
          {drafts && (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => setStep("review")}
            >
              {t("mm.resume")}
            </Button>
          )}
          <div className="sheet-actions space-y-2">
            <Button
              variant="unstyled"
              size="unstyled"
              onClick={() => {
                if (!consent) {
                  const details = textareaRef.current
                    ?.closest(".journal-form")
                    ?.querySelector<HTMLDetailsElement>("details");
                  if (details) {
                    details.open = true;
                    details.scrollIntoView({ block: "nearest" });
                    details.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
                  }
                } else {
                  void run();
                }
              }}
              disabled={
                !j.user || busy || photoBusy || listening || (!text.trim() && !images.length)
              }
              className="press h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              aria-busy={busy}
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {busy && <LoaderCircle className="animate-spin size-5" />}
              </span>
              {busy ? t("momo.thinking") : t("momo.extract")}
            </Button>
            <Button variant="ghost" className="min-h-11 w-full whitespace-normal" onClick={manual}>
              {t("momo.manual")}
            </Button>
          </div>
          {busy && (
            <div
              role="status"
              className="feel-panel flex min-h-12 items-center gap-3 text-sm text-muted-foreground"
            >
              {j.settings.showMomo && (
                <img src={momo.url} alt="" className="momo-pending size-10 object-contain" />
              )}
              <span>{t("momo.thinking")}</span>
            </div>
          )}
        </>
      )}

      {step === "review" && !saved && drafts && (
        <>
          <p role="status" className="rounded-[20px] bg-accent p-3 text-[15px]">
            {t(drafts.length ? "mm.received" : "momo.none")}
          </p>
          <details className="journal-disclosure">
            <summary>{t("momo.source")}</summary>
            <p className="whitespace-pre-wrap text-sm">{text}</p>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={`${t("f.photo")} ${i + 1}`}
                  className="size-24 rounded-xl object-contain"
                />
              ))}
            </div>
          </details>
          {question && (
            <div
              role="status"
              className="rounded-2xl border border-primary/30 bg-secondary p-3 space-y-2"
            >
              <p className="font-medium">
                {t("mm.clarify", {
                  field: t(
                    (FIELDS[question.d.type].find(
                      (f) => f.k === ("error" in question.e ? question.e.error : "date"),
                    )?.label ?? "f.date") as Key,
                  ),
                })}
              </p>
              {"error" in question.e && question.e.error === "date" && (
                <Button
                  variant="outline"
                  onClick={() => update(question.d.key, { f: { ...question.d.f, date: today } })}
                >
                  {t("today")}
                </Button>
              )}
            </div>
          )}
          {mealQuestion && (
            <div className="rounded-2xl bg-secondary p-3 space-y-2">
              <p>{t("mm.portionQuestion")}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["1", "meal.all"],
                  ["0.5", "meal.half"],
                  ["", "unknown"],
                ].map(([value, label]) => (
                  <Button
                    key={label}
                    variant="outline"
                    onClick={() => {
                      if (value) {
                        const meal = JSON.parse(mealQuestion.f["meal"]!);
                        update(mealQuestion.key, {
                          f: {
                            ...mealQuestion.f,
                            meal: JSON.stringify({ ...meal, consumedFraction: Number(value) }),
                          },
                        });
                      }
                      setDismissedQuestion(mealQuestion.key);
                    }}
                  >
                    {t(label as Key)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[15px] font-semibold">{t("momo.review")}</p>
          {drafts.length === 0 && (
            <Button variant="outline" onClick={manual}>
              {t("momo.manual")}
            </Button>
          )}
          <ul className="momo-drafts space-y-3">
            {drafts.map((d) => (
              <DraftCard
                key={d.key}
                d={d}
                onChange={(p) => update(d.key, p)}
                onRemove={() => update(d.key, { on: false })}
                error={
                  entries.find((x) => x.d.key === d.key && "error" in x.e)
                    ? t("evidence.clarify")
                    : null
                }
              />
            ))}
          </ul>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <div className="sheet-actions space-y-2">
            <p className="text-sm font-semibold" aria-live="polite">
              {t("mm.selected", { n: entries.length })}
            </p>
            <Button
              className="min-h-12 w-full whitespace-normal"
              onClick={confirm}
              disabled={saving || !entries.length}
            >
              {saving ? t("momo.saving") : t("mm.confirm", { n: entries.length })}
            </Button>
            <Button variant="ghost" className="min-h-11 w-full" onClick={() => setStep("input")}>
              <Undo2 className="size-4" />
              {t("momo.original")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DraftCard({
  d,
  onChange,
  onRemove,
  error,
}: {
  d: Draft;
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
  error: string | null;
}) {
  const j = useJournal();
  const open = useQuickAdd();
  const miss = missingFields(d);
  const entry = draftToEntry(d, d.key, j.tz, todayLocal(j.tz));
  const [expanded, setExpanded] = useState(false);
  const Icon = {
    weight: Scale,
    injection: Syringe,
    condition: Smile,
    measure: Ruler,
    memory: ImageIcon,
    expense: Receipt,
    meal: UtensilsCrossed,
  }[d.type];
  return (
    <li
      className={cn(
        "app-surface rounded-[22px] border bg-card p-4",
        d.on ? "border-primary" : "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-semibold">
          <Icon className="size-5" />
          {typeLabel(d.type)}
        </span>
        <div className="flex items-center gap-1">
          <label className="flex min-h-11 items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-primary)]"
              checked={d.on}
              onChange={(e) => onChange({ on: e.target.checked })}
            />
            {t("momo.include")}
          </label>
          <Button
            variant="unstyled"
            size="unstyled"
            onClick={onRemove}
            className="press min-h-11 rounded-full px-3 text-sm text-muted-foreground"
          >
            {t("momo.remove")}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[18px] font-bold">
        {d.type === "meal"
          ? (() => {
              try {
                return JSON.parse(d.f["meal"] ?? "").title;
              } catch {
                return t("unknown");
              }
            })()
          : d.f["value"] ||
            d.f["medication"] ||
            d.f["label"] ||
            d.f["amount"] ||
            d.f["note"] ||
            t("unknown")}
      </p>
      <p className="text-sm">{d.f["date"] || t("evidence.clarify")}</p>
      {d.type === "meal" && (
        <p className="mt-1 text-sm font-medium text-primary">{t("mm.estimate")}</p>
      )}
      <Button
        variant="unstyled"
        size="unstyled"
        className="mt-2 min-h-11 rounded-full border px-3 text-sm font-medium"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {t("evidence.edit")}
      </Button>
      {d.evidence && (
        <div className="mt-2">
          <SourceEvidence evidence={{ ...d.evidence, confirmed: d.f }} />
        </div>
      )}
      {d.dup && (
        <div className="mt-2 rounded-xl bg-accent p-3">
          <p className="text-sm font-medium">{t("momo.dup")}</p>
          <p className="text-sm">{t("mm.duplicateHint")}</p>
          {j.records
            .filter((r) => r.id !== d.key && isDuplicate(entry, [r], []))
            .slice(0, 2)
            .map((r) => (
              <Button
                key={r.id}
                variant="outline"
                className="mt-2 w-full whitespace-normal text-left"
                onClick={() => open(r.type, r)}
              >
                {r.localDate} · {recordValue(r)}
              </Button>
            ))}
          {j.purchases
            .filter((p) => p.id !== d.key && isDuplicate(entry, [], [p]))
            .slice(0, 2)
            .map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="mt-2 w-full whitespace-normal"
                onClick={() => open("purchase", p)}
              >
                {p.localDate} · {p.product ?? t("type.purchase")} · {p.amount} {p.currency}
              </Button>
            ))}
        </div>
      )}
      {d.on && expanded && (
        <div className="feel-panel mt-3 grid grid-cols-2 gap-2">
          {d.type === "meal" && (
            <div className="col-span-2">
              <MealDraftEditor d={d} onChange={onChange} />
            </div>
          )}
          {FIELDS[d.type]
            .filter((f) => f.k !== "meal")
            .map((f) =>
              f.k === "medication" ? (
                <div key={f.k} className="col-span-2">
                  <span className="mb-1 block text-sm font-medium">{t(f.label as Key)}</span>
                  <MedicationPicker
                    value={d.f[f.k] ?? ""}
                    onChange={(value) => onChange({ f: { ...d.f, [f.k]: value } })}
                  />
                </div>
              ) : f.k === "site" ? (
                <div key={f.k} className="col-span-2">
                  <p className="mb-1 text-sm">{t("f.site")}</p>
                  <SitePicker
                    value={d.f["site"] || null}
                    onChange={(value) => onChange({ f: { ...d.f, site: value ?? "" } })}
                  />
                </div>
              ) : (
                <label
                  key={f.k}
                  className={cn("block", f.kind === "text" && f.k === "note" && "col-span-2")}
                >
                  <span className="mb-1 block text-sm font-medium">
                    {t(f.label as Key)} ·{" "}
                    {t(
                      d.evidence && d.f[f.k] !== d.evidence.proposed[f.k]
                        ? "evidence.corrected"
                        : "evidence.suggested",
                    )}
                  </span>
                  <input
                    className={inputCls}
                    type={f.kind === "date" ? "date" : f.kind === "time" ? "time" : "text"}
                    inputMode={f.kind === "num" ? "decimal" : undefined}
                    value={d.f[f.k] ?? ""}
                    placeholder={f.kind === "time" ? t("unknown") : t("missing")}
                    onChange={(e) => onChange({ f: { ...d.f, [f.k]: e.target.value } })}
                  />
                </label>
              ),
            )}
        </div>
      )}
      {d.timeHint && (
        <p className="mt-2 text-sm">
          <span className="font-medium">{t("momo.timeHint")}:</span> “{d.timeHint}”
        </p>
      )}
      {miss.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium">{t("momo.missingL")}:</span>{" "}
          {miss.map((k) => t(FIELDS[d.type].find((f) => f.k === k)!.label as Key)).join(", ")}
        </p>
      )}
      {d.type === "injection" && (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("stock.move")}: {t("evidence.stockLater")}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function MealDraftEditor({ d, onChange }: { d: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const j = useJournal();
  let meal: MealDetails;
  try {
    meal = draftMealSchema.parse(JSON.parse(d.f["meal"] ?? ""));
  } catch {
    return <p>{t("meal.invalid")}</p>;
  }
  const patch = (change: Partial<MealDetails>) =>
    onChange({ f: { ...d.f, meal: JSON.stringify({ ...meal, ...change }) } });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("meal.hint")}</p>
      <label className="block">
        {t("meal.title")}
        <input
          className={inputCls}
          value={meal.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      <MealItemsEditor
        meal={meal}
        patch={patch}
        fraction={meal.consumedFraction === null ? "" : String(meal.consumedFraction)}
        setFraction={(value) => patch({ consumedFraction: value === "" ? null : Number(value) })}
        newId={j.newId}
      />
      <details>
        <summary>{t("meal.assumptions")}</summary>
        {meal.estimateAssumptions.map((a, i) => (
          <p key={i} className="text-sm">
            {a}
          </p>
        ))}
      </details>
    </div>
  );
}
