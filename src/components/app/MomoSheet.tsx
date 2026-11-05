import { isPartOfDay } from "@/lib/time-of-day";
import { TimeOfDayField } from "./TimeOfDayField";
import { retainPhoto, shrinkPhoto } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Scale,
  Droplet,
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
  ArrowRight,
  UtensilsCrossed,
  Package,
  Bell,
  RefreshCw,
  Pause,
  Play,
  ChevronDown,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { extractWithMomo } from "@/lib/momo.functions";
import { useJournal } from "@/lib/journal";
import { todayLocal, fmtMonthDay } from "@/lib/dates";
import { validDate } from "@/lib/snapshot";
import { useQuickAdd } from "./AppShell";
import { formatPurchaseMoney } from "@/lib/purchase-money";
import { recordValue } from "./ui";
import {
  candidateToDraft,
  partOfDayFromHint,
  draftToEntry,
  FIELDS,
  isDuplicate,
  missingFields,
  type Draft,
  type Entry,
} from "@/lib/momo-drafts";
import { celebrateSave } from "./AppFeel";
import {
  unexpectedDuplicateKeys,
  isRecoveredDrafts,
  recoveredCaptureSources,
} from "@/lib/momo-review";
import { t, getLocale, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SourceEvidence } from "./SourceEvidence";
import { SitePicker } from "./SitePicker";
import { MealItemsEditor } from "./MealItemsEditor";
import { draftMealSchema, type MealDetails } from "@/lib/meals";
import { parseMealFractionInput } from "@/lib/meal-fraction";
import { MedicationPicker } from "./MedicationPicker";
import { useMomoVoice, type VoiceRecovery } from "./useMomoVoice";
import {
  claimMomoHandoff,
  dismissMomoHandoff,
  prepareMomoHandoff,
  type GuestCapture,
} from "@/lib/momo-handoff";
import { MomoImage } from "./MomoImage";
import { MomoQuestion } from "./MomoQuestion";

const currentInlineSession = () => true;

const questions = ["mq.day", "mq.feeling", "mq.food", "mq.treatment", "mq.moment"] as const;
const loadingPhrases = ["mb.reading", "mb.details", "mb.suggestions", "mb.review"] as const;
type Question = (typeof questions)[number];
const isQuestion = (value: unknown): value is Question => questions.some((key) => key === value);
function nextQuestion(current?: Question): Question {
  // The cursor contains no journal data. Writing still works without browser storage.
  let previous: string | null | undefined = current;
  try {
    previous ??= sessionStorage.getItem("mds.momo.question");
  } catch {
    /* Optional cursor. */
  }
  const next = questions[(questions.findIndex((key) => key === previous) + 1) % questions.length]!;
  try {
    sessionStorage.setItem("mds.momo.question", next);
  } catch {
    /* In-memory refresh still works. */
  }
  return next;
}

type CaptureRecovery = {
  key: string;
  recovered: boolean;
  saved: boolean;
  text: string;
  images: string[];
  drafts: Draft[] | null;
  step: "input" | "review";
  usedVoice: boolean;
  signature: string | null;
  sourceMatches: boolean;
  voiceSession: VoiceRecovery | null;
  question: Question;
  dismissedQuestions: string[];
};
function persistCapture(state: CaptureRecovery | null) {
  if (!state?.recovered) return false;
  try {
    if (state.saved || (!state.drafts && !state.text.trim() && !state.images.length))
      sessionStorage.removeItem(state.key);
    else {
      // The input already contains the photos. Persist only the analysis context
      // when it still matches, rather than embedding those photos a second time.
      let analysisContext: { today: string; timezone: string } | null = null;
      if (state.signature) {
        try {
          const signature: unknown = JSON.parse(state.signature);
          if (
            Array.isArray(signature) &&
            signature[0] === state.text &&
            Array.isArray(signature[1]) &&
            signature[1].length === state.images.length &&
            signature[1].every((photo: unknown, i: number) => photo === state.images[i]) &&
            typeof signature[2] === "string" &&
            typeof signature[3] === "string"
          )
            analysisContext = { today: signature[2], timezone: signature[3] };
        } catch {
          /* An obsolete cache is optional; raw input is still retained. */
        }
      }
      sessionStorage.setItem(
        state.key,
        JSON.stringify({
          text: state.text,
          images: state.images,
          drafts: state.drafts ?? [],
          step: state.step,
          usedVoice: state.usedVoice,
          analysisContext,
          sourceMatches: state.sourceMatches,
          voiceSession: state.voiceSession,
          question: state.question,
          dismissedQuestions: state.dismissedQuestions,
        }),
      );
    }
    return true;
  } catch {
    /* An unavailable browser store never discards the in-memory capture. */
    return false;
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
  isSessionCurrent = currentInlineSession,
}: {
  inline?: boolean;
  isSessionCurrent?: () => boolean;
  onMeal?: ((images: string[], note: string) => void) | undefined;
  onDone: () => void;
  onManual: () => void;
}) {
  const j = useJournal();
  const active = useRef(true);
  const ownsCapture = () => active.current && isSessionCurrent() && j.isCurrentOwner();
  const openEntry = useQuickAdd();
  const extract = useServerFn(extractWithMomo);
  const [usedVoice, setUsedVoice] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveGuard = useRef(false);
  const captureVersion = useRef(0);
  const [text, setText] = useState("");
  const [composing, setComposing] = useState(false);
  const inputLimitId = useId();
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [handoffBlocked, setHandoffBlocked] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [step, setStep] = useState<"input" | "review">("input");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const requestedFocus = useRef<"heading" | "composer" | null>(null);
  const showStage = (next: "input" | "review") => {
    if (!ownsCapture()) return;
    setFailure(null);
    requestedFocus.current = next === "input" ? "composer" : "heading";
    setStep(next);
  };
  useEffect(() => {
    const target = requestedFocus.current;
    if (!target) return;
    requestedFocus.current = null;
    const element =
      target === "composer"
        ? textareaRef.current
        : workspaceRef.current?.querySelector<HTMLElement>("[data-momo-stage-heading]");
    element?.focus();
  }, [step, saved]);
  const photoVersion = useRef(0);
  const photoGuard = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [dismissedQuestions, setDismissedQuestions] = useState<string[]>([]);
  const inflight = useRef(false);
  const requestVersion = useRef(0);
  const [invitation, setInvitation] = useState<"day" | "meal" | "injection" | null>(null);
  const [starter, setStarter] = useState<Key | null>(null);
  const [guideQuestion, setGuideQuestion] = useState<Question>(questions[0]);
  const [suggestionsPaused, setSuggestionsPaused] = useState(false);
  const [presentationVisible, setPresentationVisible] = useState(true);
  const [loadingPhrase, setLoadingPhrase] = useState(0);
  const interruptAnalysis = () => {
    requestVersion.current++;
    inflight.current = false;
    setBusy(false);
  };
  const updateText = (value: string) => {
    if (!ownsCapture()) return;
    interruptAnalysis();
    setText(value);
  };
  const voice = useMomoVoice({
    text,
    usedVoice,
    lang: { ko: "ko-KR", en: "en-US", fr: "fr-FR" }[getLocale()],
    owner: j.user?.id ?? "guest",
    isSessionCurrent: ownsCapture,
    onText: updateText,
    onVoice: setUsedVoice,
  });
  useLayoutEffect(() => {
    active.current = isSessionCurrent();
    // Radix retains a closed sheet during exit. Release pending controls without
    // clearing the user's accepted words, photos, or reviewed recovery draft.
    inflight.current = false;
    photoGuard.current = false;
    setBusy(false);
    setPhotoBusy(false);
    return () => {
      active.current = false;
      requestVersion.current += 1;
      photoVersion.current += 1;
      captureVersion.current += 1;
    };
  }, [isSessionCurrent]);
  const [consent, setConsent] = useState(false);
  const cache = useRef<{ sig: string; drafts: Draft[] } | null>(null);
  const reviewSource = useRef<{ text: string; images: string[] } | null>(null);
  const today = todayLocal(j.tz);
  const recoveryKey = `mds.momo.draft.${j.user?.id ?? "guest"}`;
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const recovery = useRef<CaptureRecovery | null>(null);
  useEffect(() => {
    // Keep the outgoing owner's latest edits before resetting the composer.
    // Its debounced write may not have run before the account changed.
    if (recovery.current?.key !== recoveryKey) persistCapture(recovery.current);
    requestedFocus.current = null;
    requestVersion.current++;
    photoVersion.current++;
    photoGuard.current = false;
    setPhotoBusy(false);
    inflight.current = false;
    voice.finish();
    setBusy(false);
    setConsent(false);
    setFailure(null);
    setHandoffBlocked(false);
    setText("");
    setComposing(false);
    setDraftStorageFailed(false);
    setImages([]);
    setDrafts(null);
    setStep("input");
    setSaved(false);
    saveGuard.current = false;
    captureVersion.current++;
    setSaving(false);
    setUsedVoice(false);
    cache.current = null;
    reviewSource.current = null;
    setInvitation(null);
    setStarter(null);
    setDismissedQuestions([]);
    let restoredQuestion = false;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const data = JSON.parse(raw);
        const source = recoveredCaptureSources(data);
        // Salvage valid raw words/photos independently, even if another cached field is malformed.
        setText(source.text);
        setImages(source.images);
        setUsedVoice(data?.usedVoice === true);
        if (!source.complete || !isRecoveredDrafts(data?.drafts)) {
          setFailure(t("mr.recoveryReset"));
        }
        if (source.complete && isRecoveredDrafts(data.drafts)) {
          const context = data.analysisContext;
          const validContext =
            context &&
            typeof context.today === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(context.today) &&
            typeof context.timezone === "string" &&
            context.timezone.length > 0 &&
            context.timezone.length <= 100;
          let signature = typeof data.signature === "string" ? data.signature : null;
          if (!signature && validContext)
            signature = JSON.stringify([data.text, data.images, context.today, context.timezone]);
          if (signature) cache.current = { sig: signature, drafts: data.drafts };
          if (isQuestion(data.question)) {
            setGuideQuestion(data.question);
            restoredQuestion = true;
          }
          setText(data.text);
          setImages(data.images);
          setDrafts(data.drafts.length ? data.drafts : null);
          if (Array.isArray(data.dismissedQuestions))
            setDismissedQuestions(
              data.drafts
                .filter(
                  (draft: Draft) =>
                    draft.type === "meal" && data.dismissedQuestions.includes(draft.key),
                )
                .map((draft: Draft) => draft.key),
            );
          setUsedVoice(!!data.usedVoice);
          if (
            data.voiceSession &&
            typeof data.voiceSession.before === "string" &&
            typeof data.voiceSession.wasVoice === "boolean"
          )
            voice.restore(data.voiceSession);
          // Back-to-input is deliberate. Older suggestions must not look like
          // an analysis of words/photos that were changed before leaving.
          let sourceMatches =
            data.sourceMatches !== false &&
            data.drafts.every(
              (draft: Draft) =>
                typeof draft.evidence?.text !== "string" || draft.evidence.text === data.text,
            );
          if (context != null && !validContext) sourceMatches = false;
          if (signature) {
            try {
              const original: unknown = JSON.parse(signature);
              sourceMatches =
                sourceMatches &&
                Array.isArray(original) &&
                original[0] === data.text &&
                Array.isArray(original[1]) &&
                original[1].length === data.images.length &&
                original[1].every((photo: unknown, i: number) => photo === data.images[i]);
            } catch {
              sourceMatches = false;
            }
          }
          if (!sourceMatches) cache.current = null;
          else reviewSource.current = { text: source.text, images: [...source.images] };
          setStep(
            data.step === "input" || !sourceMatches
              ? "input"
              : data.drafts.length
                ? "review"
                : "input",
          );
        }
      }
    } catch {
      /* Recovery is best effort; never block manual recording. */
    }
    if (!restoredQuestion) setGuideQuestion(nextQuestion());
    setRecoveredKey(recoveryKey);
    // Voice lifecycle follows the same account boundary as capture recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryKey]);
  const ownerId = j.user?.id;
  const [guestCapture, setGuestCapture] = useState<(GuestCapture & { owner: string }) | null>(null);
  useEffect(() => {
    try {
      const input = ownerId ? claimMomoHandoff(sessionStorage, ownerId) : null;
      setGuestCapture(input && ownerId ? { ...input, owner: ownerId } : null);
    } catch {
      setGuestCapture(null);
    }
  }, [ownerId]);
  const reviewSourceMatches =
    !!reviewSource.current &&
    reviewSource.current.text === text &&
    reviewSource.current.images.length === images.length &&
    reviewSource.current.images.every((photo, index) => photo === images[index]);
  // During an owner transition the rendered fields still belong to the old
  // owner. Retain that capture until the recovery effect has loaded the new one.
  if (recoveredKey === recoveryKey)
    recovery.current = {
      key: recoveryKey,
      recovered: recoveredKey === recoveryKey,
      saved,
      text,
      images,
      drafts,
      step,
      usedVoice,
      signature: cache.current?.sig ?? null,
      sourceMatches: reviewSourceMatches,
      voiceSession: voice.recovery,
      question: guideQuestion,
      dismissedQuestions,
    };
  useEffect(() => {
    // Avoid serializing every attached image on every keystroke. Records still commit synchronously.
    const keep = () => {
      const current = recovery.current;
      const kept = persistCapture(current);
      if (current?.recovered)
        setDraftStorageFailed(
          !kept &&
            !current.saved &&
            (!!current.text.trim() || !!current.images.length || !!current.drafts?.length),
        );
    };
    if (saved) {
      keep();
      return;
    }
    const timer = setTimeout(keep, 180);
    return () => clearTimeout(timer);
  }, [
    drafts,
    step,
    text,
    images,
    usedVoice,
    saved,
    recoveryKey,
    recoveredKey,
    voice.recovery,
    guideQuestion,
    dismissedQuestions,
  ]);
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

  const manual = () => {
    if (!ownsCapture()) return;
    requestVersion.current++;
    voice.interrupt();
    inflight.current = false;
    setBusy(false);
    onManual();
  };

  const addPhotos = async (files: FileList | null) => {
    if (!ownsCapture() || !files?.length || photoGuard.current) return;
    interruptAnalysis();
    photoGuard.current = true;
    setPhotoBusy(true);
    const token = photoVersion.current;
    const isCurrent = () => ownsCapture() && token === photoVersion.current;
    try {
      const next = await Promise.all(
        Array.from(files)
          .slice(0, 3 - images.length)
          .map(shrinkPhoto),
      );
      if (!isCurrent()) return;
      requestVersion.current++;
      inflight.current = false;
      setBusy(false);
      setImages((previous) => [...previous, ...next].slice(0, 3));
    } catch {
      if (isCurrent()) setFailure(t("meal.photoError"));
    } finally {
      if (isCurrent()) {
        photoGuard.current = false;
        setPhotoBusy(false);
      }
    }
  };

  const run = async () => {
    if (
      !ownsCapture() ||
      !j.user ||
      !consent ||
      photoBusy ||
      voice.active ||
      text.length > 4000 ||
      inflight.current ||
      (!text.trim() && !images.length)
    )
      return;
    const sig = JSON.stringify([text, images, today, j.tz]);
    // Repeating the same request reuses the previous result instead of asking again.
    if (cache.current?.sig === sig) {
      reviewSource.current = { text, images: [...images] };
      setDrafts(cache.current.drafts);
      showStage("review");
      return;
    }
    const version = ++requestVersion.current;
    const isCurrent = () => ownsCapture() && version === requestVersion.current;
    const owner = j.user.id;
    inflight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const res = await extract({
        data: { text: text.trim(), today, timezone: j.tz, images, locale: getLocale() },
      });
      if (!isCurrent()) return;
      if (res.error) {
        setFailure(t(`ai.${res.error}`));
        return;
      }
      const retained = await Promise.all(images.map((p) => retainPhoto(p, owner)));
      if (!isCurrent()) return;
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
            promptVersion: "journal-v5",
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
      setDismissedQuestions([]);
      cache.current = { sig, drafts: ds };
      reviewSource.current = { text, images: [...images] };
      setDrafts(ds);
      showStage("review");
    } catch {
      if (isCurrent()) setFailure(t("momo.error"));
    } finally {
      if (isCurrent()) {
        inflight.current = false;
        setBusy(false);
      }
    }
  };

  const changeDrafts = (change: (previous: Draft[]) => Draft[]) => {
    if (!ownsCapture()) return;
    setDrafts((previous) => {
      const next = change(previous ?? []);
      if (cache.current) cache.current = { ...cache.current, drafts: next };
      return next;
    });
  };
  const update = (key: string, patch: Partial<Draft>) => {
    setFailure(null);
    changeDrafts((ds) =>
      ds.map((d) => (d.key === key ? { ...d, ...patch, ...(patch.f ? { dup: false } : {}) } : d)),
    );
  };

  const entries = (drafts ?? [])
    .filter((d) => d.on)
    .map((d) => ({ d, e: draftToEntry(d, d.key, j.tz, today) as Entry }));
  const invalid = entries.filter((x) => "error" in x.e);
  const undated = entries.filter(({ d }) => !d.f["date"]?.trim());

  const confirm = async () => {
    if (!ownsCapture() || saveGuard.current || saved || !entries.length) return;
    if (!reviewSourceMatches) {
      showStage("input");
      setFailure(t("mr.sourceChanged"));
      return;
    }
    if (invalid.length) {
      // The affected row already explains its error. Focus the correction instead
      // of adding a second, medication-specific warning to unrelated entry types.
      setFailure(null);
      const card = Array.from(
        workspaceRef.current?.querySelectorAll<HTMLElement>("[data-draft-key]") ?? [],
      ).find((element) => element.dataset["draftKey"] === invalid[0]?.d.key);
      const editButton = card?.querySelector<HTMLButtonElement>("[data-draft-edit]");
      if (editButton?.getAttribute("aria-expanded") !== "true") editButton?.click();
      editButton?.focus();
      requestAnimationFrame(() => {
        const field = Array.from(
          card?.querySelectorAll<HTMLElement>("[data-draft-field]") ?? [],
        ).find(
          (element) =>
            element.dataset["draftField"] === ("error" in invalid[0]!.e ? invalid[0]!.e.error : ""),
        );
        const invalidControl = field?.querySelector<HTMLElement>(
          'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]',
        );
        (
          invalidControl ?? field?.querySelector<HTMLElement>("input, select, textarea, button")
        )?.focus();
      });
      return;
    }
    const unexpected = unexpectedDuplicateKeys(entries, j.snapshot());
    if (unexpected.length) {
      changeDrafts((ds) =>
        ds.map((d) => (unexpected.includes(d.key) ? { ...d, dup: true, on: false } : d)),
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
      const confirmedVersion = captureVersion.current;
      toast.success(t("evidence.localSaved"), {
        action: {
          label: t("toast.undo"),
          onClick: () => {
            try {
              undo();
            } catch {
              toast.error(t("evidence.saveFailed"));
              return;
            }
            if (!ownsCapture() || captureVersion.current !== confirmedVersion) return;
            const current = j.snapshot();
            const stillSaved = new Set([
              ...current.records.map((record) => record.id),
              ...current.purchases.map((purchase) => purchase.id),
            ]);
            const retained = new Set(
              entries.filter(({ d }) => stillSaved.has(d.key)).map(({ d }) => d.key),
            );
            if (retained.size) {
              toast.info(t("mr.undoKept", { n: retained.size }));
              if (retained.size === entries.length) return;
              changeDrafts((previous) => previous.filter((draft) => !retained.has(draft.key)));
            }
            saveGuard.current = false;
            setSaved(false);
            showStage("review");
          },
        },
      });
      celebrateSave();
      successful = true;
      requestedFocus.current = "heading";
      setSaved(true);
    } catch (error) {
      setFailure(
        t(
          error instanceof Error && error.message === "momo_existing_entry_changed"
            ? "mr.savedConflict"
            : "evidence.saveFailed",
        ),
      );
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
          !dismissedQuestions.includes(d.key) &&
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
    if (!ownsCapture()) return;
    requestedFocus.current = "composer";
    reviewSource.current = null;
    captureVersion.current++;
    voice.finish();
    setInvitation(null);
    setStarter(null);
    setGuideQuestion(nextQuestion(guideQuestion));
    setDismissedQuestions([]);
    requestVersion.current++;
    photoVersion.current++;
    cache.current = null;
    saveGuard.current = false;
    setSaved(false);
    setDrafts(null);
    setText("");
    setComposing(false);
    setDraftStorageFailed(false);
    setImages([]);
    setFailure(null);
    setStep("input");
    setUsedVoice(false);
    setConsent(false);
  };
  const editorial = inline && step === "input" && !saved;
  const hasSources = !!text.trim() || images.length > 0;
  const canChangeQuestion =
    !text.length && !composing && !images.length && !voice.active && !busy && !photoBusy && !saving;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const visibility = () => setPresentationVisible(!document.hidden);
    const motion = () => {
      if (media?.matches) setSuggestionsPaused(true);
    };
    visibility();
    motion();
    document.addEventListener("visibilitychange", visibility);
    media?.addEventListener?.("change", motion);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media?.removeEventListener?.("change", motion);
    };
  }, []);
  useEffect(() => {
    if (
      !editorial ||
      !canChangeQuestion ||
      suggestionsPaused ||
      !presentationVisible ||
      recoveredKey !== recoveryKey
    )
      return;
    const timer = setTimeout(() => setGuideQuestion((current) => nextQuestion(current)), 5000);
    return () => clearTimeout(timer);
  }, [
    editorial,
    canChangeQuestion,
    suggestionsPaused,
    presentationVisible,
    recoveredKey,
    recoveryKey,
    guideQuestion,
  ]);
  useEffect(() => {
    setLoadingPhrase(0);
    if (!busy || !presentationVisible) return;
    const timer = setInterval(
      () => setLoadingPhrase((current) => (current + 1) % loadingPhrases.length),
      3500,
    );
    return () => clearInterval(timer);
  }, [busy, presentationVisible]);
  const savedIds = new Set((drafts ?? []).filter((d) => d.on).map((d) => d.key));
  return (
    <div
      ref={workspaceRef}
      id={inline ? "momo-workspace" : undefined}
      tabIndex={inline ? -1 : undefined}
      data-stage={step}
      className={cn(
        "journal-form feel-form space-y-4",
        inline && "momo-workspace",
        editorial && "momo-editorial",
      )}
      aria-busy={busy}
      onFocusCapture={(event) => {
        const target = event.target;
        if (!inline || step !== "review" || !target.closest(".momo-review-editor")) return;
        // Browser focus scrolling does not account for our sticky confirmation bar.
        // Only adjust a correction field that the bar would otherwise obscure.
        requestAnimationFrame(() => {
          if (!target.isConnected || document.activeElement !== target) return;
          const actions = workspaceRef.current?.querySelector<HTMLElement>(".momo-review-actions");
          if (!actions) return;
          const field = target.getBoundingClientRect();
          const footer = actions.getBoundingClientRect();
          const navigation = document
            .querySelector<HTMLElement>(".app-nav")
            ?.getBoundingClientRect();
          const viewportBottom = window.visualViewport
            ? window.visualViewport.offsetTop + window.visualViewport.height
            : window.innerHeight;
          const visibleBottom = Math.min(
            viewportBottom,
            footer.bottom > 0 ? footer.top : viewportBottom,
            navigation && navigation.bottom > 0 ? navigation.top : viewportBottom,
          );
          if (field.bottom > visibleBottom - 12) {
            target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          }
        });
      }}
    >
      {inline ? (
        editorial ? (
          <header className="momo-editorial-hero">
            {j.settings.showMomo && (
              <div className="momo-hero-art" aria-hidden>
                <MomoImage alt="" width={72} height={88} />
              </div>
            )}
            <div className="momo-topic-guide">
              <Button
                type="button"
                variant="ghost"
                className="momo-question-control"
                aria-label={t(suggestionsPaused ? "mq.play" : "mq.pause")}
                title={t(suggestionsPaused ? "mq.play" : "mq.pause")}
                aria-pressed={suggestionsPaused}
                disabled={!canChangeQuestion}
                onClick={() => setSuggestionsPaused((value) => !value)}
              >
                {suggestionsPaused ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )}
              </Button>
              <MomoQuestion
                question={t(guideQuestion)}
                questions={questions.map((question) => t(question))}
              />
              <Button
                type="button"
                variant="ghost"
                className="momo-question-control"
                aria-label={t("mq.another")}
                title={t("mq.another")}
                disabled={!canChangeQuestion}
                onClick={() => {
                  if (canChangeQuestion) setGuideQuestion(nextQuestion(guideQuestion));
                }}
              >
                <RefreshCw className="size-5" aria-hidden />
              </Button>
            </div>
            <span className="sr-only">{t("mg.local")}</span>
          </header>
        ) : (
          <header className="flex items-center gap-3">
            <h1
              data-momo-stage-heading
              tabIndex={-1}
              className="text-[26px] font-bold tracking-tight leading-snug"
            >
              {t(saved ? "mm.saved" : "mr.title")}
            </h1>
            {!saved && j.settings.showMomo && (
              <MomoImage alt="" width={36} height={44} className="h-11 w-9 object-contain" />
            )}
          </header>
        )
      ) : (
        <>
          <DrawerTitle data-momo-stage-heading tabIndex={-1} className="text-[24px] font-bold">
            {t(saved ? "mm.saved" : step === "review" ? "mr.title" : "voice.all")}
          </DrawerTitle>
          <DrawerDescription className={step === "review" ? "sr-only" : undefined}>
            {t("momo.hint")}
          </DrawerDescription>
        </>
      )}

      {!saved && draftStorageFailed && recoveredKey === recoveryKey && (
        <p role="status" className="rounded-2xl border bg-secondary p-3 text-sm leading-relaxed">
          {t("mc.draftRecoveryUnavailable")}
        </p>
      )}
      {j.user &&
        guestCapture?.owner === j.user.id &&
        !hasSources &&
        !drafts &&
        !saved &&
        step === "input" && (
          <aside className="rounded-2xl border bg-secondary p-4 space-y-3">
            <p className="text-sm leading-relaxed">{t("mc.resumeGuestHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11 whitespace-normal"
                onClick={() => {
                  updateText(guestCapture.text);
                  setImages(guestCapture.images);
                  setUsedVoice(guestCapture.usedVoice);
                  setConsent(false);
                  dismissMomoHandoff(sessionStorage);
                  setGuestCapture(null);
                }}
              >
                {t("mc.resumeGuest")}
              </Button>
              <Button
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  dismissMomoHandoff(sessionStorage);
                  setGuestCapture(null);
                }}
              >
                {t("mc.startFresh")}
              </Button>
            </div>
          </aside>
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
                    {p.localDate} ·{" "}
                    {p.product ??
                      p.medication ??
                      t(p.addsStock === false ? "type.expense" : "type.purchase")}{" "}
                    · {formatPurchaseMoney(p)}
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
          <div className="momo-capture-input space-y-2">
            {editorial ? null : !text.trim() && !voice.active ? (
              <div className="space-y-2">
                {invitation && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`mg.${invitation}Hint`)}
                  </p>
                )}
                <span className="sr-only">{t("mg.local")}</span>
                <div className="flex flex-wrap gap-1" role="group" aria-label={t("mg.choices")}>
                  {!invitation ? (
                    (["day", "meal", "injection"] as const).map((choice) => (
                      <Button
                        key={choice}
                        type="button"
                        variant="outline"
                        className="min-h-11 h-auto gap-1.5 rounded-full px-3 py-2 text-sm whitespace-normal text-left"
                        onClick={() => {
                          setInvitation(choice);
                          setStarter(null);
                        }}
                      >
                        {t(`mc.${choice}`)}
                      </Button>
                    ))
                  ) : (
                    <>
                      {(invitation === "day"
                        ? (["mg.feeling", "mg.moment"] as const)
                        : invitation === "meal"
                          ? (["mg.describe"] as const)
                          : (["mg.when"] as const)
                      ).map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          className="min-h-11 h-auto rounded-full px-3 py-2 text-sm whitespace-normal text-left"
                          onClick={() => {
                            setStarter(
                              key === "mg.feeling"
                                ? "mg.feelingStart"
                                : key === "mg.moment"
                                  ? "mg.momentStart"
                                  : key === "mg.describe"
                                    ? "mg.mealStart"
                                    : "mg.injectionStart",
                            );
                            textareaRef.current?.focus();
                          }}
                        >
                          {t(key)}
                        </Button>
                      ))}
                      {invitation === "meal" && (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11 rounded-full text-sm"
                          onClick={() =>
                            textareaRef.current
                              ?.closest(".journal-form")
                              ?.querySelector<HTMLInputElement>('input[type="file"]')
                              ?.click()
                          }
                        >
                          {t("mg.photo")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11 rounded-full text-sm"
                        onClick={() => {
                          setInvitation(null);
                          setStarter(null);
                        }}
                      >
                        {t("mg.back")}
                      </Button>
                    </>
                  )}
                </div>
                {starter && <span className="sr-only">{t("mg.placeholderOnly")}</span>}
              </div>
            ) : (
              !voice.active && (
                <details className="momo-writing-help text-sm">
                  <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">
                    {t("mg.choices")}
                  </summary>
                  <div className="flex flex-wrap gap-1">
                    {(["day", "meal", "injection"] as const).map((choice) => (
                      <Button
                        key={choice}
                        type="button"
                        variant="outline"
                        className="min-h-11 h-auto rounded-full px-3 py-2 text-sm whitespace-normal"
                        onClick={() => {
                          setInvitation(choice);
                          setStarter(null);
                        }}
                      >
                        {t(`mg.${choice}`)}
                      </Button>
                    ))}
                  </div>
                  {invitation && <p className="py-2 text-sm">{t(`mg.${invitation}Hint`)}</p>}
                </details>
              )
            )}
            <div
              className={cn(
                "momo-input-surface overflow-hidden rounded-[20px] border bg-background/60 focus-within:ring-2 focus-within:ring-ring/30",
                editorial && "momo-editorial-input",
              )}
            >
              <textarea
                ref={textareaRef}
                aria-label={t("momo.input")}
                value={text}
                onChange={(e) => voice.edit(e.target.value)}
                onCompositionStart={() => {
                  setComposing(true);
                  interruptAnalysis();
                  voice.interrupt();
                }}
                onCompositionEnd={() => setComposing(false)}
                rows={3}
                maxLength={100_000}
                aria-invalid={text.length > 4000 ? true : undefined}
                placeholder={t(editorial ? "me.placeholder" : (starter ?? "mc.placeholder"))}
                aria-describedby={
                  [
                    editorial ? "momo-topic-question" : "",
                    voice.active ? "momo-voice-status" : "",
                    text.length >= 3600 ? inputLimitId : "",
                    text.length > 4000 ? inputLimitId + "-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="momo-composer block w-full resize-y border-0 bg-transparent px-3.5 pt-3.5 pb-2 text-[16px] leading-relaxed shadow-none outline-none placeholder:text-muted-foreground"
              />
              {text.length >= 3600 && (
                <p id={inputLimitId} className="px-3.5 text-sm text-muted-foreground">
                  {t("mc.characters", { n: text.length })}
                </p>
              )}
              {text.length > 4000 && (
                <p id={inputLimitId + "-error"} role="alert" className="text-sm text-destructive">
                  {t("mv.limit")}
                </p>
              )}
              {voice.active ? (
                <div className="m-2 space-y-2 rounded-[16px] bg-secondary p-3">
                  <p
                    id="momo-voice-status"
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    {voice.status === "listening" && (
                      <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    )}
                    {t(
                      voice.status === "listening"
                        ? "mv.listening"
                        : voice.status === "interrupted"
                          ? "mv.interrupted"
                          : "mv.connecting",
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      voice.issue
                        ? `mv.${voice.issue}`
                        : voice.status === "interrupted"
                          ? "mv.interruptedHint"
                          : "mv.pauses",
                      { finish: t("mv.finish") },
                    )}
                  </p>
                  {voice.provisional && (
                    <p className="text-xs text-muted-foreground">{t("mv.provisional")}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        voice.finish();
                        textareaRef.current?.focus();
                      }}
                      className="min-h-11 flex-1 gap-1 rounded-full"
                    >
                      <Square className="size-4" />
                      {t("mv.finish")}
                    </Button>
                    {voice.status === "interrupted" && !voice.issue && text.length <= 4000 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={voice.start}
                        className="min-h-11 flex-1 rounded-full"
                      >
                        {t("mv.resume")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={voice.cancel}
                      className="min-h-11 rounded-full"
                    >
                      {t("mv.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="momo-input-tools flex items-center gap-1 px-2 pb-2">
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    type="button"
                    disabled={text.length > 4000}
                    onClick={() => {
                      setStarter(null);
                      interruptAnalysis();
                      voice.start();
                    }}
                    className="press flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Mic className="size-5 shrink-0" />
                    <span className="min-w-0">{t(editorial ? "me.voice" : "mm.voice")}</span>
                  </Button>
                  <label
                    className={cn(
                      "press flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium hover:bg-secondary focus-within:ring-2 focus-within:ring-ring",
                      (images.length >= 3 || photoBusy) && "pointer-events-none opacity-50",
                    )}
                  >
                    <ImagePlus className="size-5 shrink-0" />
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span>{t("f.photo")}</span>
                      {images.length > 0 && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {images.length}/3
                        </span>
                      )}
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
                </div>
              )}
            </div>
            {usedVoice && text && !voice.active && (
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
                        photoGuard.current = false;
                        setPhotoBusy(false);
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
              {handoffBlocked && !j.user && (
                <a
                  href="/auth"
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  onClick={() => {
                    try {
                      dismissMomoHandoff(sessionStorage);
                    } catch {
                      /* Explicitly continue without recovery. */
                    }
                  }}
                >
                  {t("mc.signinWithoutDraft")}
                </a>
              )}
              <div className="mt-3 flex gap-2">
                {j.user && !handoffBlocked && (
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    onClick={run}
                    className="press h-11 flex-1 rounded-full border"
                  >
                    {t("momo.retry")}
                  </Button>
                )}
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
          {onMeal && (
            <Button
              variant="outline"
              className="min-h-12 w-full"
              onClick={async () => {
                if (!ownsCapture()) return;
                const version = requestVersion.current;
                const isCurrent = () => ownsCapture() && version === requestVersion.current;
                const owner = j.user?.id ?? "guest";
                try {
                  const refs = await Promise.all(images.map((p) => retainPhoto(p, owner)));
                  if (isCurrent()) onMeal(refs, text);
                } catch {
                  if (isCurrent()) setFailure(t("meal.photoError"));
                }
              }}
            >
              {t("meal.open")}
            </Button>
          )}
          {drafts && reviewSourceMatches && (
            <Button
              variant="outline"
              className="min-h-11 w-full whitespace-normal"
              onClick={() => showStage("review")}
            >
              {t("mm.resume")}
            </Button>
          )}
          {drafts && !reviewSourceMatches && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("mr.sourceChanged")}
            </p>
          )}
          {!editorial && (
            <p className="text-sm leading-relaxed text-muted-foreground">{t("mc.reviewHint")}</p>
          )}
          <div className="momo-capture-actions space-y-1">
            {!j.user ? (
              <a
                href="/auth"
                aria-disabled={photoBusy}
                onClick={(event) => {
                  if (photoBusy) {
                    event.preventDefault();
                    return;
                  }
                  voice.finish();
                  recovery.current = recovery.current
                    ? { ...recovery.current, voiceSession: null }
                    : null;
                  let kept = persistCapture(recovery.current);
                  try {
                    kept = prepareMomoHandoff(sessionStorage, hasSources) && kept;
                  } catch {
                    kept = false;
                  }
                  if (hasSources && !kept) {
                    event.preventDefault();
                    setHandoffBlocked(true);
                    setFailure(t("mc.draftStorage"));
                  }
                }}
                className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {t("mc.signinAction")}
                <ArrowRight className="size-5" aria-hidden />
              </a>
            ) : (
              (editorial || hasSources || busy) && (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  onClick={() => {
                    if (!hasSources) {
                      textareaRef.current?.focus();
                      return;
                    }
                    if (!consent) {
                      const details = textareaRef.current
                        ?.closest(".journal-form")
                        ?.querySelector<HTMLDetailsElement>("details[data-momo-consent]");
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
                    (!j.user && hasSources) ||
                    busy ||
                    photoBusy ||
                    voice.active ||
                    text.length > 4000 ||
                    (!editorial && !hasSources)
                  }
                  className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold whitespace-normal text-primary-foreground disabled:opacity-50"
                  aria-busy={busy}
                >
                  {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                  {busy
                    ? t("momo.thinking")
                    : t(
                        !j.user && hasSources
                          ? "mc.signin"
                          : editorial
                            ? "me.organize"
                            : "mc.organize",
                      )}
                  {!busy && <ArrowRight className="size-5" aria-hidden />}
                </Button>
              )
            )}
          </div>
          <div className="momo-capture-footer grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2">
            <details data-momo-consent className="momo-privacy" open={consent || undefined}>
              <summary>{t("mc.privacy")}</summary>
              <p className="text-sm text-muted-foreground">{t("mm.voiceHint")}</p>
              {editorial && (
                <p className="mt-2 text-sm text-muted-foreground">{t("mc.reviewHint")}</p>
              )}
              {!j.user && <p className="mt-2 text-sm text-muted-foreground">{t("ai.signin")}</p>}
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (!e.target.checked) {
                      requestVersion.current++;
                      inflight.current = false;
                      setBusy(false);
                    }
                  }}
                />
                {t("mc.consent")}
              </label>
            </details>
            {(!editorial || !j.user) && (
              <Button
                variant="ghost"
                className="min-h-11 px-2 text-sm whitespace-normal"
                onClick={manual}
              >
                {t("mc.manual")}
              </Button>
            )}
          </div>
          {busy && (
            <div
              role="status"
              className="feel-panel flex min-h-12 items-center gap-3 text-sm text-muted-foreground"
            >
              {j.settings.showMomo && (
                <MomoImage alt="" className="momo-pending size-10 object-contain" />
              )}
              <span className="flex-1">
                <span aria-hidden>{t(loadingPhrases[loadingPhrase]!)}</span>
                <span className="sr-only">{t("momo.thinking")}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 whitespace-normal"
                onClick={() => {
                  interruptAnalysis();
                  textareaRef.current?.focus();
                }}
              >
                {t("ai.keepEditing")}
              </Button>
            </div>
          )}
        </>
      )}

      {step === "review" && !saved && drafts && (
        <div className="momo-review space-y-4">
          <p role="status" className="text-sm text-muted-foreground">
            {t(drafts.length ? "mr.proposed" : "momo.none", { n: drafts.length })}
          </p>
          {hasSources && (
            <details className="momo-review-source journal-disclosure">
              <summary>
                {images[0] ? (
                  <img
                    src={images[0]}
                    alt=""
                    className="momo-review-thumbnail shrink-0 object-cover"
                  />
                ) : (
                  <FileText className="size-5 shrink-0 text-primary" aria-hidden />
                )}
                <span>
                  {t(
                    images.length === 1
                      ? "mr.onePhotoSource"
                      : images.length
                        ? "mr.photoSource"
                        : "mr.textSource",
                    { n: images.length },
                  )}
                </span>
              </summary>
              {text && <p className="whitespace-pre-wrap break-words py-2 text-sm">{text}</p>}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 py-2">
                  {images.map((src, i) => (
                    <img
                      key={src}
                      src={src}
                      alt={`${t("f.photo")} ${i + 1}`}
                      className="size-24 rounded-xl object-contain"
                    />
                  ))}
                </div>
              )}
            </details>
          )}
          {drafts.length === 0 ? (
            <Button className="min-h-12 w-full rounded-full" onClick={manual}>
              {t("momo.manual")}
            </Button>
          ) : (
            <ul className="momo-drafts momo-review-list" aria-label={t("momo.review")}>
              {drafts.map((d) => (
                <DraftCard
                  key={d.key}
                  d={d}
                  onChange={(patch) => update(d.key, patch)}
                  onRemove={() => update(d.key, { on: false })}
                  portionQuestion={mealQuestion?.key === d.key}
                  onDismissPortion={() =>
                    setDismissedQuestions((previous) => [...new Set([...previous, d.key])])
                  }
                  error={
                    entries.find((x) => x.d.key === d.key && "error" in x.e)
                      ? t("evidence.clarify")
                      : null
                  }
                />
              ))}
            </ul>
          )}
          {undated.length > 1 && (
            <div className="momo-batch-date">
              <p className="text-sm text-muted-foreground">
                {t("mc.undated", { n: undated.length })}
              </p>
              <Button
                variant="outline"
                className="mt-2 min-h-11 rounded-full whitespace-normal"
                disabled={saving}
                onClick={() =>
                  changeDrafts((current) =>
                    current.map((draft) =>
                      draft.on && !draft.f["date"]?.trim()
                        ? { ...draft, dup: false, f: { ...draft.f, date: today } }
                        : draft,
                    ),
                  )
                }
              >
                {t("mc.useToday", { date: fmtMonthDay(today) })}
              </Button>
            </div>
          )}
          {failure && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{failure}</p>
              {failure === t("mr.savedConflict") && (
                <a
                  href="/history"
                  className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                >
                  {t("mr.openSaved")}
                </a>
              )}
            </div>
          )}
          <div className="sheet-actions momo-review-actions space-y-2">
            <p className="text-center text-sm text-muted-foreground" aria-live="polite">
              {t(entries.length ? "mr.readyCount" : "mr.selectEntries", { n: entries.length })}
            </p>
            <Button
              className="min-h-12 w-full whitespace-normal"
              onClick={confirm}
              disabled={saving || !entries.length}
            >
              {saving
                ? t("momo.saving")
                : invalid.length
                  ? t("mc.checkSelected", { n: invalid.length })
                  : t("mm.confirm", { n: entries.length })}
              {!saving && <ArrowRight className="size-4 shrink-0" aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full"
              disabled={saving}
              onClick={() => showStage("input")}
            >
              <Undo2 className="size-4" aria-hidden />
              {t("momo.original")}
            </Button>
          </div>
          <details className="journal-disclosure momo-review-shortcuts">
            <summary>{t("mr.addMissing")}</summary>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["purchase", Package],
                  ["injection", Syringe],
                  ["stock", Package],
                  ["weight", Scale],
                  ["condition", Smile],
                  ["meal", UtensilsCrossed],
                  ["reminder", Bell],
                ] as const
              ).map(([kind, Icon]) => (
                <Button
                  key={kind}
                  variant="outline"
                  className="min-h-11 rounded-full"
                  onClick={() => {
                    voice.interrupt();
                    openEntry(kind);
                  }}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(`momo.go.${kind}` as Key)}
                </Button>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function draftPreview(d: Draft) {
  const value = (key: string) => d.f[key]?.trim() || t("unknown");
  const fact = (key: string, label: Key) => t(label) + ": " + value(key);
  switch (d.type) {
    case "water":
      return {
        title:
          d.f["answer"] === "yes"
            ? t("water.yes")
            : d.f["answer"] === "not_yet"
              ? t("water.notYet")
              : t("unknown"),
        details: [],
      };
    case "weight":
      return { title: d.f["value"]?.trim() ? value("value") + " kg" : t("unknown"), details: [] };
    case "injection":
      return {
        title: value("medication"),
        details: [
          t("f.dose") +
            ": " +
            (d.f["doseValue"]?.trim()
              ? value("doseValue") + " " + value("doseUnit")
              : t("unknown")),
          fact("site", "f.site"),
        ],
      };
    case "measure":
      return {
        title: t("type.measure"),
        details: FIELDS.measure
          .filter((field) => field.kind === "num" && d.f[field.k]?.trim())
          .map((field) => fact(field.k, field.label as Key)),
      };
    case "purchase":
    case "expense":
      return {
        title: d.type === "purchase" ? value("medication") : value("product"),
        details: [
          t("f.amount") +
            ": " +
            (d.f["amount"]?.trim() ? value("amount") + " " + value("currency") : t("unknown")),
          ...(d.f["quantity"]?.trim() ? [fact("quantity", "f.quantity")] : []),
          ...(d.type === "purchase"
            ? [
                t("f.unit") +
                  ": " +
                  (d.f["stockUnit"] === "pen" ||
                  d.f["stockUnit"] === "single" ||
                  d.f["stockUnit"] === "dose"
                    ? t(`unit.${d.f["stockUnit"]}`)
                    : t("unknown")),
              ]
            : []),
          ...(d.f["merchant"]?.trim() ? [fact("merchant", "f.merchant")] : []),
        ],
      };
    case "condition":
      return { title: value("label"), details: d.f["note"]?.trim() ? [d.f["note"]!.trim()] : [] };
    case "memory":
      return { title: value("note"), details: [] };
    case "meal":
      try {
        return { title: JSON.parse(d.f["meal"] ?? "").title || t("unknown"), details: [] };
      } catch {
        return { title: t("unknown"), details: [] };
      }
  }
}

function DraftCard({
  d,
  onChange,
  onRemove,
  error,
  portionQuestion,
  onDismissPortion,
}: {
  d: Draft;
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
  error: string | null;
  portionQuestion: boolean;
  onDismissPortion: () => void;
}) {
  const j = useJournal();
  const open = useQuickAdd();
  const miss = missingFields(d);
  const preview = draftPreview(d);
  const overviewDetails =
    d.type === "condition"
      ? []
      : d.type === "expense"
        ? preview.details.slice(0, 2)
        : d.type === "purchase"
          ? preview.details.slice(0, 3)
          : preview.details;
  const entry = draftToEntry(d, d.key, j.tz, todayLocal(j.tz));
  const [expanded, setExpanded] = useState(false);
  const editorId = useId();
  const portionQuestionId = useId();
  const errorId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const name = `${typeLabel(d.type)}: ${preview.title}`;
  const period = d.f["partOfDay"] ?? partOfDayFromHint(d.timeHint);
  const periodLabel = isPartOfDay(period) ? t(`pod.${period}`) : "";
  const errorField = d.on && "error" in entry ? entry.error : null;
  const fieldLabel = errorField
    ? t((FIELDS[d.type].find((field) => field.k === errorField)?.label ?? "f.date") as Key)
    : "";
  const Icon = {
    water: Droplet,
    weight: Scale,
    injection: Syringe,
    condition: Smile,
    measure: Ruler,
    memory: ImageIcon,
    expense: Receipt,
    purchase: Package,
    meal: UtensilsCrossed,
  }[d.type];
  return (
    <li data-draft-key={d.key} data-included={d.on} className="momo-review-row">
      <div className="momo-review-row-main">
        <label className="momo-review-check">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-primary)]"
            checked={d.on}
            aria-label={t("mr.includeEntry", { entry: name })}
            onChange={(event) => onChange({ on: event.target.checked })}
          />
        </label>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {typeLabel(d.type)}
            {!d.on && <span className="text-muted-foreground">· {t("evidence.excluded")}</span>}
          </p>
          <p className="momo-review-entry-title">{preview.title}</p>
          {d.f["date"]?.trim() && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {validDate(d.f["date"]) ? fmtMonthDay(d.f["date"]) : d.f["date"]}
              {d.f["time"] ? " · " + d.f["time"] : periodLabel ? " · " + periodLabel : ""}
            </p>
          )}
          {overviewDetails.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 break-words text-sm text-muted-foreground">
              {overviewDetails.map((detail, index) => (
                <span key={index}>{detail}</span>
              ))}
            </div>
          )}
          {d.type === "meal" && <span className="momo-review-estimate">{t("mm.estimate")}</span>}
          {errorField && (
            <p className="momo-review-issue">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t("mr.needsField", { field: fieldLabel })}
            </p>
          )}
          {d.evidence?.attribution?.status === "unclear" && (
            <p className="momo-review-issue">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t("evidence.sourceUnclear")}
            </p>
          )}
          {d.type === "purchase" && (!d.f["medication"]?.trim() || !d.f["stockUnit"]?.trim()) && (
            <p className="mt-1 text-sm text-muted-foreground">{t("mr.stockReview")}</p>
          )}
          {d.dup && <p className="mt-1 text-sm text-muted-foreground">{t("momo.dup")}</p>}
        </div>
        <Button
          ref={editButtonRef}
          variant="unstyled"
          size="unstyled"
          className="momo-review-edit"
          data-draft-edit
          aria-label={t(expanded ? "mr.closeEntry" : errorField ? "mr.fixEntry" : "mr.editEntry", {
            entry: name,
            field: fieldLabel,
          })}
          aria-expanded={expanded}
          aria-controls={editorId}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? "mr.doneEditing" : errorField ? "mr.fix" : "mr.edit")}
          <ChevronDown className={cn("size-3.5 shrink-0", expanded && "rotate-180")} aria-hidden />
        </Button>
      </div>
      {expanded && (
        <div id={editorId} className="momo-review-editor">
          {d.dup && (
            <div className="mt-2 rounded-xl bg-accent p-3">
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
                    {p.localDate} · {p.product ?? t("type.purchase")} · {formatPurchaseMoney(p)}
                  </Button>
                ))}
            </div>
          )}
          {preview.details.length > 1 && (
            <ul className="mb-3 space-y-1 text-sm text-muted-foreground">
              {preview.details.slice(1).map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
          {portionQuestion && (
            <div
              role="group"
              aria-labelledby={portionQuestionId}
              className="rounded-2xl bg-secondary p-3 space-y-2"
            >
              <p id={portionQuestionId}>{t("mm.portionQuestion", { meal: preview.title })}</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["1", "meal.all"],
                    ["0.5", "meal.half"],
                    ["", "unknown"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={label}
                    variant="outline"
                    onClick={() => {
                      const meal = JSON.parse(d.f["meal"]!);
                      onChange({
                        mealFractionInput: value,
                        f: {
                          ...d.f,
                          meal: JSON.stringify({
                            ...meal,
                            consumedFraction: parseMealFractionInput(value),
                          }),
                        },
                      });
                      onDismissPortion();
                      editButtonRef.current?.focus();
                    }}
                  >
                    {t(label as Key)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="feel-panel mt-3 grid grid-cols-2 gap-3">
            {d.type === "meal" && (
              <div className="col-span-2" data-draft-field="meal">
                <MealDraftEditor
                  d={d}
                  onChange={onChange}
                  errorId={errorField === "meal" ? errorId : undefined}
                />
              </div>
            )}
            {FIELDS[d.type]
              .filter((f) => f.k !== "meal")
              .map((f) =>
                f.k === "stockUnit" ? (
                  <label key={f.k} className="col-span-2" data-draft-field={f.k}>
                    <span className="mb-1 block text-sm font-medium">{t("f.unit")}</span>
                    <select
                      className={inputCls}
                      aria-invalid={errorField === f.k || undefined}
                      aria-describedby={errorField === f.k ? errorId : undefined}
                      value={d.f["stockUnit"] ?? ""}
                      onChange={(event) =>
                        onChange({ f: { ...d.f, stockUnit: event.target.value } })
                      }
                    >
                      <option value="">{t("unknown")}</option>
                      {(["single", "pen", "dose"] as const).map((unit) => (
                        <option key={unit} value={unit}>
                          {t(`unit.${unit}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : f.k === "partOfDay" ? (
                  <div key={f.k} className="col-span-2" data-draft-field={f.k}>
                    <TimeOfDayField
                      value={period ?? ""}
                      invalid={errorField === f.k}
                      errorDescription={errorId}
                      disabled={!!d.f["time"]?.trim()}
                      onChange={(value) => onChange({ f: { ...d.f, partOfDay: value } })}
                    />
                  </div>
                ) : f.k === "answer" ? (
                  <label key={f.k} className="col-span-2" data-draft-field={f.k}>
                    <span className="mb-1 block text-sm font-medium">{t("type.water")}</span>
                    <select
                      aria-label={t("type.water")}
                      aria-invalid={errorField === f.k || undefined}
                      aria-describedby={
                        "water-hint-" + d.key + (errorField === f.k ? " " + errorId : "")
                      }
                      className={inputCls}
                      value={d.f["answer"] ?? ""}
                      onChange={(event) => onChange({ f: { ...d.f, answer: event.target.value } })}
                    >
                      <option value="">{t("unknown")}</option>
                      <option value="yes">{t("water.yes")}</option>
                      <option value="not_yet">{t("water.notYet")}</option>
                    </select>
                    <p id={"water-hint-" + d.key} className="mt-1 text-sm text-muted-foreground">
                      {t("water.note")}
                    </p>
                  </label>
                ) : f.k === "medication" ? (
                  <div key={f.k} className="col-span-2" data-draft-field={f.k}>
                    <span className="mb-1 block text-sm font-medium">{t(f.label as Key)}</span>
                    <MedicationPicker
                      value={d.f[f.k] ?? ""}
                      onChange={(value) => onChange({ f: { ...d.f, [f.k]: value } })}
                    />
                  </div>
                ) : f.k === "site" ? (
                  <div key={f.k} className="col-span-2" data-draft-field={f.k}>
                    <p className="mb-1 text-sm">{t("f.site")}</p>
                    <SitePicker
                      value={d.f["site"] || null}
                      onChange={(value) => onChange({ f: { ...d.f, site: value ?? "" } })}
                    />
                  </div>
                ) : (
                  <label
                    key={f.k}
                    data-draft-field={f.k}
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
                      aria-label={f.k === "amount" ? t("f.amount") : undefined}
                      aria-invalid={errorField === f.k || undefined}
                      aria-describedby={
                        [
                          f.k === "amount" ? "momo-amount-hint-" + d.key : "",
                          errorField === f.k ? errorId : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      value={d.f[f.k] ?? ""}
                      placeholder={f.kind === "time" ? t("unknown") : t("missing")}
                      onChange={(e) => onChange({ f: { ...d.f, [f.k]: e.target.value } })}
                    />
                    {f.k === "amount" && (
                      <span
                        id={"momo-amount-hint-" + d.key}
                        className="mt-1 block text-sm text-muted-foreground"
                      >
                        {t("money.hint")}
                      </span>
                    )}
                  </label>
                ),
              )}
          </div>
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
          {d.type === "purchase" && (!d.f["medication"]?.trim() || !d.f["stockUnit"]?.trim()) && (
            <p className="mt-2 text-sm text-muted-foreground">{t("momo.stockReview")}</p>
          )}
          {d.type === "injection" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("stock.move")}: {t("evidence.stockLater")}
            </p>
          )}

          {error && (
            <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
              {errorField ? t("mc.checkField", { field: fieldLabel }) : error}
            </p>
          )}
          {d.evidence && (
            <div className="mt-3 border-t pt-2">
              <SourceEvidence
                evidence={
                  ("record" in entry && entry.record.evidence) || { ...d.evidence, confirmed: d.f }
                }
              />
            </div>
          )}
          <Button variant="ghost" className="mt-2 min-h-11 text-sm" onClick={onRemove}>
            {t("momo.remove")}
          </Button>
        </div>
      )}
    </li>
  );
}

function MealDraftEditor({
  d,
  onChange,
  errorId,
}: {
  d: Draft;
  onChange: (patch: Partial<Draft>) => void;
  errorId: string | undefined;
}) {
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
    <div
      role="group"
      aria-label={t("type.meal")}
      aria-invalid={!!errorId || undefined}
      aria-describedby={errorId}
      className="space-y-3"
    >
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
        fraction={
          d.mealFractionInput ??
          (meal.consumedFraction === null ? "" : String(meal.consumedFraction))
        }
        setFraction={(value) => {
          const fraction = parseMealFractionInput(value);
          onChange({
            mealFractionInput: value,
            f: {
              ...d.f,
              meal: JSON.stringify({
                ...meal,
                // JSON cannot keep NaN. The separate input above preserves invalid
                // intent for recovery and commit validation without claiming intake.
                consumedFraction: Number.isFinite(fraction) ? fraction : null,
              }),
            },
          });
        }}
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
