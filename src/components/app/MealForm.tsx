import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useJournal, type MealRec } from "@/lib/journal";
import {
  emptyMeal,
  draftMealSchema,
  mealSchema,
  mealTotals,
  type MealDetails,
  type MealItem,
} from "@/lib/meals";
import { analyzeMeal } from "@/lib/momo-tasks.functions";
import { instantFromLocal, timeOf, todayLocal } from "@/lib/dates";
import { validDate } from "@/lib/snapshot";
import { retainPhoto, shrinkPhoto } from "@/lib/media";
import { photoUrl } from "@/lib/cloud-sync";
import { t, getLocale } from "@/lib/i18n";
import { PhotoImg } from "./PhotoImg";
import { SourceEvidence } from "./SourceEvidence";
import { toast } from "sonner";

const input = "min-h-12 w-full min-w-0 rounded-xl border bg-card px-3 py-2 text-[16px]";
export function MealForm({
  editing,
  images = [],
  note = "",
  initialDate,
  onDone,
}: {
  editing?: MealRec | undefined;
  images?: string[];
  note?: string;
  initialDate?: string | undefined;
  onDone: () => void;
}) {
  const j = useJournal();
  const analyze = useServerFn(analyzeMeal);
  const [meal, setMeal] = useState<MealDetails>(
    () => editing?.meal ?? { ...emptyMeal(), photoRefs: images, note },
  );
  const [date, setDate] = useState(editing?.localDate ?? initialDate ?? todayLocal(j.tz));
  const [time, setTime] = useState(editing?.at ? timeOf(editing.at, j.tz) : "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (error) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  const [attaching, setAttaching] = useState(false);
  const photoPending = useRef(false);
  const photoGeneration = useRef(0);
  const [consent, setConsent] = useState(false);
  const [fraction, setFraction] = useState(
    meal.consumedFraction === null ? "" : String(meal.consumedFraction),
  );
  const [analysisInput, setAnalysisInput] = useState<{ text: string; photos: string[] } | null>(
    null,
  );
  const [proposal, setProposal] = useState(editing?.evidence?.proposed["meal"] ?? "");
  const id = useRef(editing?.id ?? j.newId());
  const guard = useRef(false),
    generation = useRef(0);
  const owner = j.user?.id ?? "guest";
  const recoveryKey = `mds.meal.draft.${owner}.${editing?.id ?? "new"}`;
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [recovered, setRecovered] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const stored = JSON.parse(raw);
        // Untitled drafts are allowed in recovery, never in saved records.
        const parsed = draftMealSchema.safeParse(stored.meal);
        if (parsed.success && typeof stored.date === "string") {
          setRestoredNotice(
            !editing ||
              JSON.stringify(parsed.data) !== JSON.stringify(draftMealSchema.parse(editing.meal)) ||
              stored.date !== editing.localDate ||
              (stored.time || "") !== (editing.at ? timeOf(editing.at, j.tz) : "") ||
              (stored.fraction ?? "") !==
                (editing.meal.consumedFraction === null
                  ? ""
                  : String(editing.meal.consumedFraction)),
          );
          setMeal({ ...parsed.data, title: parsed.data.title });
          setDate(stored.date);
          setTime(stored.time || "");
          setProposal(stored.proposal || "");
          if (
            stored.analysisInput &&
            typeof stored.analysisInput.text === "string" &&
            Array.isArray(stored.analysisInput.photos)
          )
            setAnalysisInput(stored.analysisInput);
          if (typeof stored.id === "string") id.current = stored.id;
          setFraction(stored.fraction ?? "");
        }
      }
    } catch {
      /* retain a fresh manual form */
    }
    setRecovered(true);
    return () => {
      generation.current += 1;
      photoGeneration.current += 1;
    };
  }, [recoveryKey, editing, j.tz]);
  useEffect(() => {
    if (!recovered) return;
    try {
      if (saved) sessionStorage.removeItem(recoveryKey);
      else
        sessionStorage.setItem(
          recoveryKey,
          JSON.stringify({ meal, date, time, proposal, id: id.current, fraction, analysisInput }),
        );
    } catch {
      /* in-memory draft remains usable */
    }
  }, [meal, date, time, proposal, saved, recovered, recoveryKey, fraction, analysisInput]);
  const resetDraft = () => {
    generation.current++;
    photoGeneration.current++;
    guard.current = false;
    setBusy(false);
    setError("");
    const original = editing?.meal ?? emptyMeal();
    setMeal(original);
    setDate(editing?.localDate ?? initialDate ?? todayLocal(j.tz));
    setTime(editing?.at ? timeOf(editing.at, j.tz) : "");
    setFraction(original.consumedFraction === null ? "" : String(original.consumedFraction));
    setProposal(editing?.evidence?.proposed["meal"] ?? "");
    setAnalysisInput(null);
    setRestoredNotice(false);
    if (!editing) id.current = j.newId();
  };
  const patch = (p: Partial<MealDetails>) => {
    generation.current++;
    guard.current = false;
    setBusy(false);
    setMeal((m) => ({ ...m, ...p }));
  };
  const itemPatch = (id: string, p: Partial<MealItem>) => {
    generation.current++;
    guard.current = false;
    setBusy(false);
    setMeal((m) => ({ ...m, items: m.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  };
  const totals = mealTotals({
    ...meal,
    consumedFraction: fraction === "" ? null : Number(fraction),
  });
  const energy = totals.consumed ?? totals.pictured;
  const attach = async (files: FileList | null) => {
    if (!files || photoPending.current) return;
    photoPending.current = true;
    setAttaching(true);
    const token = photoGeneration.current;
    try {
      const refs = await Promise.all(
        Array.from(files)
          .slice(0, 3 - meal.photoRefs.length)
          .map(async (f) => retainPhoto(await shrinkPhoto(f), owner)),
      );
      if (token === photoGeneration.current)
        setMeal((m) => ({ ...m, photoRefs: [...m.photoRefs, ...refs].slice(0, 3) }));
    } catch {
      setError(t("meal.photoError"));
    } finally {
      photoPending.current = false;
      setAttaching(false);
    }
  };
  const run = async () => {
    if (guard.current || attaching || !j.user || !consent) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const token = generation.current;
    try {
      const urls = await Promise.all(meal.photoRefs.map(photoUrl));
      // Owned storage URLs are not fetched by the provider adapter: resolve to bounded data locally.
      const images = await Promise.all(
        urls.map(async (url) => {
          if (!url) throw new Error("media");
          if (url.startsWith("data:")) return url;
          const blob = await (await fetch(url)).blob();
          return shrinkPhoto(new File([blob], "source.jpg", { type: blob.type }));
        }),
      );
      const result = await analyze({
        data: { text: meal.note ?? "", images, locale: getLocale() },
      });
      if (token !== generation.current) return;
      if (result.error) {
        setError(t(`ai.${result.error}`));
        return;
      }
      if (!result.meal) {
        setError(t("meal.noFood"));
        return;
      }
      setAnalysisInput({ text: meal.note ?? "", photos: [...meal.photoRefs] });
      setProposal(JSON.stringify(result.meal));
      setMeal((m) => ({
        ...result.meal!,
        photoRefs: m.photoRefs,
        note: m.note ?? "",
        consumedFraction: m.consumedFraction,
      }));
    } catch {
      if (token === generation.current) setError(t("ai.service"));
    } finally {
      if (token === generation.current) {
        guard.current = false;
        setBusy(false);
      }
    }
  };
  const save = () => {
    if (guard.current || attaching || saved) return;
    const finalMeal = { ...meal, consumedFraction: fraction === "" ? null : Number(fraction) };
    const parsed = mealSchema.safeParse(finalMeal);
    if (!parsed.success || !validDate(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      setError(t("meal.invalid"));
      return;
    }
    guard.current = true;
    setSaving(true);
    try {
      const before = j.snapshot();
      const record: MealRec = {
        ...(editing ?? {}),
        id: id.current,
        type: "meal",
        localDate: date,
        at: time ? instantFromLocal(date, time, j.tz) : null,
        precision: time
          ? "exact"
          : editing && editing.precision !== "exact"
            ? editing.precision
            : "date_only",
        partOfDay: !time ? (editing?.partOfDay ?? null) : null,
        source: "manual_text",
        createdAt: editing?.createdAt ?? new Date().toISOString(),
        meal: parsed.data,
        evidence: editing?.evidence
          ? {
              ...editing.evidence,
              confirmed: { ...editing.evidence.confirmed, meal: JSON.stringify(parsed.data) },
            }
          : {
              method: meal.analysis ? (meal.photoRefs.length ? "photos" : "text") : "manual",
              text: analysisInput?.text ?? meal.note ?? "",
              photos: analysisInput?.photos ?? [...meal.photoRefs],
              quote: null,
              proposed: { meal: proposal || JSON.stringify(parsed.data) },
              confirmed: { meal: JSON.stringify(parsed.data) },
              ...(meal.analysis ? { analysis: meal.analysis } : {}),
            },
      };
      j.saveRecord(record);
      setSaved(true);
      toast.success(t("evidence.localSaved"), {
        action: { label: t("toast.undo"), onClick: j.undoFor(before) },
      });
    } catch {
      setError(t("evidence.saveFailed"));
    } finally {
      guard.current = false;
      setSaving(false);
    }
  };
  if (saved)
    return (
      <div className="space-y-3">
        <DrawerTitle>{t("type.meal")}</DrawerTitle>
        <DrawerDescription>{t("evidence.localSaved")}</DrawerDescription>
        <p role="status">{t(`sync.${j.sync}`)}</p>
        {j.sync === "error" && <Button onClick={j.retrySync}>{t("momo.retry")}</Button>}
        <Button onClick={onDone}>{t("evidence.close")}</Button>
      </div>
    );
  return (
    <form
      noValidate
      onChange={() => {
        if (error) setError("");
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!("isComposing" in e.nativeEvent && e.nativeEvent.isComposing)) save();
      }}
      className="journal-form space-y-4"
    >
      <DrawerTitle className="text-2xl font-bold">{t("type.meal")}</DrawerTitle>
      <DrawerDescription>{t("meal.hint")}</DrawerDescription>
      {restoredNotice && (
        <div role="status" className="rounded-2xl bg-secondary p-3 text-sm">
          <p>{t("ux.restored")}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11 whitespace-normal"
            onClick={resetDraft}
            disabled={saving}
          >
            {t(editing ? "ux.resetSaved" : "ux.resetDraft")}
          </Button>
        </div>
      )}
      {editing?.evidence && <SourceEvidence evidence={editing.evidence} />}
      <label
        className={`meal-capture flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-primary/30 bg-secondary px-4 py-5 text-center focus-within:ring-2 focus-within:ring-ring ${meal.photoRefs.length ? "min-h-24" : "min-h-36"} ${busy || attaching || meal.photoRefs.length >= 3 ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-card">
          <Camera className="size-6" aria-hidden />
        </span>
        <span className="text-[17px] font-semibold">
          {t(
            attaching ? "photo.processing" : meal.photoRefs.length ? "momo.photos" : "meal.capture",
          )}
        </span>
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || attaching || meal.photoRefs.length >= 3}
          onChange={(e) => {
            attach(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {meal.photoRefs.length > 0 && (
        <div className={meal.photoRefs.length === 1 ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
          {meal.photoRefs.map((ref, index) => (
            <div key={ref} className="relative min-w-0 space-y-2">
              <PhotoImg src={ref} alt={`${t("type.meal")} ${index + 1}`} className="meal-photo" />
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full rounded-xl"
                onClick={() => {
                  generation.current++;
                  photoGeneration.current++;
                  guard.current = false;
                  setBusy(false);
                  patch({ photoRefs: meal.photoRefs.filter((r) => r !== ref) });
                }}
              >
                {t("photo.remove")}
              </Button>
            </div>
          ))}
        </div>
      )}
      <details open={meal.photoRefs.length > 0}>
        <summary>{t("meal.analyze")}</summary>
        <div className="space-y-3">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t("ai.consent")}
          </label>
          {!j.user && <p className="text-sm">{t("ai.signin")}</p>}
          <Button
            type="button"
            disabled={!j.user || !consent || busy || attaching || !meal.photoRefs.length}
            onClick={run}
            className="min-h-12 w-full whitespace-normal"
          >
            {t(busy ? "momo.thinking" : "meal.analyze")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("meal.replace")}</p>
        </div>
      </details>

      <label className="block">
        {t("meal.title")}
        <input
          className={input}
          value={meal.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>

      <div>
        <label className="block">
          {t("f.date")}
          <input
            className={input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm">{t("meal.dateDefault")}</p>
      <ul className="space-y-3">
        {meal.items.map((item) => (
          <li key={item.id} className="meal-food space-y-3 rounded-[20px] border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.included}
                  onChange={(e) => itemPatch(item.id, { included: e.target.checked })}
                />
                {t("momo.include")}
              </label>
              <Button
                type="button"
                variant="ghost"
                className="size-11 shrink-0 rounded-full text-muted-foreground"
                aria-label={t("ux.removeFood", { name: item.name || t("meal.food") })}
                onClick={() => patch({ items: meal.items.filter((i) => i.id !== item.id) })}
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
            <label className="block">
              {t("meal.food")}
              <input
                className={input}
                value={item.name}
                onChange={(e) => itemPatch(item.id, { name: e.target.value })}
              />
            </label>
            <label className="block">
              {t("meal.portion")}
              <input
                className={input}
                value={item.portionDescription ?? ""}
                onChange={(e) => itemPatch(item.id, { portionDescription: e.target.value || null })}
              />
            </label>
            <details>
              <summary>
                <span>{t("meal.energyKnown")}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.kcal && Number.isFinite(item.kcal.low) && Number.isFinite(item.kcal.high)
                    ? `${item.kcal.low}–${item.kcal.high} kcal`
                    : t("unknown")}
                </span>
              </summary>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.kcal !== null}
                  onChange={(e) =>
                    itemPatch(item.id, {
                      kcal: e.target.checked
                        ? { low: NaN, high: NaN, basis: "user_entered" }
                        : null,
                    })
                  }
                />
                {t("meal.energyKnown")}
              </label>
              {item.kcal && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["low", "high"] as const).map((side) => (
                      <label key={side}>
                        {t(`meal.${side}`)} kcal
                        <input
                          className={input}
                          type="number"
                          step="any"
                          min="0"
                          max="10000"
                          value={Number.isFinite(item.kcal![side]) ? item.kcal![side] : ""}
                          onChange={(e) =>
                            itemPatch(item.id, {
                              kcal: {
                                ...item.kcal!,
                                [side]: e.target.value === "" ? NaN : Number(e.target.value),
                                basis: "user_entered",
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-sm">{t(`meal.${item.kcal.basis}`)}</p>
                </>
              )}
            </details>
            <details>
              <summary className="min-h-11 cursor-pointer py-2">{t("meal.ingredients")}</summary>
              <p className="text-sm">
                {item.ingredients.map((i) => `${i.name} (${t(`meal.${i.basis}`)})`).join(", ")}
              </p>
              <textarea
                aria-label={t("meal.ingredients")}
                className={input}
                value={item.ingredients.map((i) => i.name).join("\n")}
                onChange={(e) =>
                  itemPatch(item.id, {
                    ingredients: e.target.value
                      .split("\n")
                      .filter(Boolean)
                      .map((name) => ({ name, basis: "user_provided" })),
                  })
                }
              />
            </details>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        onClick={() =>
          patch({
            items: [
              ...meal.items,
              {
                id: j.newId(),
                name: "",
                portionDescription: null,
                ingredients: [],
                kcal: null,
                included: true,
              },
            ],
          })
        }
      >
        <Plus />
        {t("meal.addFood")}
      </Button>
      <label className="block">
        {t("meal.eaten")}
        <select
          className={input}
          value={fraction === "" || ["1", "0.5"].includes(fraction) ? fraction : "other"}
          onChange={(e) => setFraction(e.target.value === "other" ? "0.75" : e.target.value)}
        >
          <option value="">{t("unknown")}</option>
          <option value="1">{t("meal.all")}</option>
          <option value="0.5">{t("meal.half")}</option>
          <option value="other">{t("meal.other")}</option>
        </select>
      </label>
      {fraction !== "" && !["1", "0.5"].includes(fraction) && (
        <label className="block">
          {t("meal.fraction")}
          <input
            className={input}
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={fraction}
            onChange={(e) => setFraction(e.target.value)}
          />
        </label>
      )}
      <div className="app-surface rounded-[20px] bg-peach p-4" aria-live="polite">
        <p className="text-sm">
          {t(totals.consumed ? "meal.consumedEstimate" : "meal.picturedEstimate")}
        </p>
        <p className="mt-1 text-[23px] font-semibold tracking-tight tabular-nums">
          {energy ? `${Math.round(energy.low)}–${Math.round(energy.high)} kcal` : t("unknown")}
        </p>
        {totals.partial && <p>{t("meal.partial")}</p>}
      </div>
      <details>
        <summary>{t("meal.optional")}</summary>
        <div className="space-y-3">
          <label className="block">
            {t("meal.kind")}
            <select
              className={input}
              value={meal.mealType}
              onChange={(e) => patch({ mealType: e.target.value as MealDetails["mealType"] })}
            >
              {(["unknown", "breakfast", "lunch", "dinner", "snack", "other"] as const).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {t(`meal.${kind}`)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            {t("f.time")}
            <input
              className={input}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="block">
            {t("f.note")}
            <textarea
              className={input}
              value={meal.note ?? ""}
              onChange={(e) => patch({ note: e.target.value })}
            />
          </label>
        </div>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer py-2">{t("meal.assumptions")}</summary>
        <p className="text-sm">{t("meal.hint")}</p>
        <ul>
          {meal.estimateAssumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl text-destructive">
          {error}
        </p>
      )}
      <div className="sheet-actions flex gap-2">
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                const before = j.snapshot();
                j.deleteRecord(editing.id);
                toast(t("toast.deleted"), {
                  action: { label: t("toast.undo"), onClick: j.undoFor(before) },
                });
                try {
                  sessionStorage.removeItem(recoveryKey);
                } catch {
                  /* optional recovery cleanup */
                }
                onDone();
              } catch {
                setError(t("evidence.saveFailed"));
              }
            }}
          >
            {t("f.delete")}
          </Button>
        )}
        <Button
          type="submit"
          disabled={busy || attaching || saving}
          className="min-h-12 flex-1 rounded-full"
        >
          {t(saving ? "momo.saving" : "ux.saveMeal")}
        </Button>
      </div>
    </form>
  );
}
