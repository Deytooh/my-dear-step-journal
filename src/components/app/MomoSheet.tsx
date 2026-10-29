import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Scale, Syringe, Smile, Ruler, Image as ImageIcon, Receipt, Mic, Square, X, LoaderCircle, ImagePlus, AlertTriangle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { extractWithMomo } from "@/lib/momo.functions";
import { useJournal } from "@/lib/journal";
import { todayLocal } from "@/lib/dates";
import { candidateToDraft, draftToEntry, FIELDS, isDuplicate, missingFields, type Draft, type Entry } from "@/lib/momo-drafts";
import { celebrateSave } from "./AppFeel";
import { t, getLocale, type Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MedicationPicker } from "./MedicationPicker";

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void };

const typeLabel = (ty: Draft["type"]) => t(`type.${ty}` as Key);
const inputCls = "h-11 w-full rounded-[12px] border bg-background px-3 text-[15px] outline-none focus:border-primary";

/** Downscale a photo to JPEG ≤1280px so the request stays small. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function MomoSheet({ onDone, onManual }: { onDone: () => void; onManual: () => void }) {
  const j = useJournal();
  const extract = useServerFn(extractWithMomo);
  const [usedVoice, setUsedVoice] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveGuard = useRef(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [step, setStep] = useState<"input" | "review" | "final">("input");
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const recRef = useRef<SR | null>(null);
  const beforeRec = useRef("");
  const inflight = useRef(false);
  const cache = useRef<{ sig: string; drafts: Draft[]; reply: string } | null>(null);
  const today = todayLocal(j.tz);
  const recoveryKey = `mds.momo.draft.${j.user?.id ?? "guest"}`;
  const [recoveredKey, setRecoveredKey] = useState<string | null>(null);
  useEffect(() => {
    setText(""); setImages([]); setDrafts(null); setStep("input"); setSaved(false); setUsedVoice(false); cache.current = null;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.text === "string" && Array.isArray(data.images) && data.images.every((x: unknown) => typeof x === "string") && Array.isArray(data.drafts) && data.drafts.every((d: Draft) => d && d.type in FIELDS && typeof d.key === "string" && d.f && Object.values(d.f).every((v) => typeof v === "string"))) {
          setText(data.text); setImages(data.images); setDrafts(data.drafts); setUsedVoice(!!data.usedVoice); setStep("review");
        }
      }
    } catch { /* Recovery is best effort; never block manual recording. */ }
    setRecoveredKey(recoveryKey);
  }, [recoveryKey]);
  useEffect(() => {
    if (recoveredKey !== recoveryKey) return;
    try {
      if (saved) sessionStorage.removeItem(recoveryKey);
      else if (drafts) sessionStorage.setItem(recoveryKey, JSON.stringify({ text, images, drafts, usedVoice }));
    } catch { /* Keep the editable draft in memory if browser storage is full. */ }
  }, [drafts, text, images, usedVoice, saved, recoveryKey, recoveredKey]);


  const startMic = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast(t("momo.noMic")); return; }
    setUsedVoice(true);
    const r = new Ctor();
    r.lang = ({ ko: "ko-KR", en: "en-US", fr: "fr-FR" })[getLocale()];
    r.interimResults = false; r.continuous = true;
    beforeRec.current = text;
    r.onresult = (e) => setText((beforeRec.current ? beforeRec.current + " " : "") + Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast(t("momo.noMic")); };
    recRef.current = r; r.start(); setListening(true);
  };
  const stopMic = () => recRef.current?.stop();
  const cancelMic = () => { recRef.current?.abort(); setText(beforeRec.current); setListening(false); };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 3 - images.length;
    const next = await Promise.all(Array.from(files).slice(0, room).filter((f) => f.type.startsWith("image/")).map(shrink));
    setImages((p) => [...p, ...next].slice(0, 3));
  };

  const run = async () => {
    if (inflight.current || (!text.trim() && !images.length)) return;
    const sig = JSON.stringify([text, images]);
    // Repeating the same request reuses the previous result instead of asking again.
    if (cache.current?.sig === sig) { setDrafts(cache.current.drafts); setReply(cache.current.reply); setStep("review"); return; }
    inflight.current = true; setBusy(true); setFailure(null);
    try {
      const res = await extract({ data: { text: text.trim(), today, images } });
      if (res.error) { setFailure(res.error === "not_configured" ? t("voice.unavailable") : res.error === "parse" ? t("momo.parse") : t("momo.error")); return; }
      const ds = res.candidates.map((c, i) => candidateToDraft(c, `${j.newId()}-${i}`, today, { method: images.length && text ? "mixed" : images.length ? "photos" : usedVoice ? "voice" : "text", text, photos: [...images] }));
      cache.current = { sig, drafts: ds, reply: res.reply };
      setReply(res.reply); setDrafts(ds); setStep("review");
    } catch { setFailure(t("momo.error")); } finally { inflight.current = false; setBusy(false); }
  };

  const update = (key: string, patch: Partial<Draft> | { f: Record<string, string> }) =>
    setDrafts((ds) => ds?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);

  const entries = (drafts ?? []).filter((d) => d.on).map((d) => ({ d, e: draftToEntry(d, d.key, j.tz, today) as Entry }));
  const invalid = entries.filter((x) => "error" in x.e);

  const goFinal = () => {
    if (invalid.length) { toast.error(t("momo.invalid")); return; }
    // Include earlier cards in the comparison as well as saved entries.
    const seenRecords = [...j.records]; const seenPurchases = [...j.purchases];
    setDrafts((ds) => ds?.map((d) => {
      const e = draftToEntry(d, d.key, j.tz, today);
      const dup = d.on && isDuplicate(e, seenRecords, seenPurchases);
      if (d.on && "record" in e) seenRecords.push(e.record);
      if (d.on && "purchase" in e) seenPurchases.push(e.purchase);
      return dup ? { ...d, on: false, dup: true } : d;
    }) ?? null);
    setStep("final");
  };

  const confirm = () => {
    if (saveGuard.current || saved || !entries.length || invalid.length) return;
    saveGuard.current = true;
    setSaving(true); setFailure(null);
    try {
      const records = entries.flatMap(({ e }) => "record" in e ? [e.record] : []);
      const purchases = entries.flatMap(({ e }) => "purchase" in e ? [e.purchase] : []);
      j.saveMomoBatch(records, purchases);
      celebrateSave();
      setSaved(true);
    } catch { setFailure(t("evidence.saveFailed")); }
    finally { saveGuard.current = false; setSaving(false); }
  };

  return (
    <div className="feel-form space-y-4" aria-busy={busy}>
      <DrawerTitle className="text-[24px] font-bold">{step === "final" ? t("momo.final") : t("voice.all")}</DrawerTitle>
      <DrawerDescription className="text-[15px] text-muted-foreground">{step === "final" ? t("momo.finalSub") : t("momo.hint")}</DrawerDescription>

      {saved && <div role="status" className="rounded-[20px] bg-secondary p-4 space-y-3">
        <p>{t("evidence.localSaved")}</p><p>{t(`sync.${j.sync}`)}</p>
        {j.sync === "error" && <Button onClick={j.retrySync}>{t("momo.retry")}</Button>}
        <Button onClick={onDone}>{t("evidence.close")}</Button>
      </div>}
      {step === "input" && !saved && (
        <>
          <div>
            <textarea aria-label={t("momo.input")} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000}
              placeholder={t("momo.placeholder")} className="w-full rounded-[20px] border bg-card p-4 text-[16px] placeholder:text-muted-foreground" />
            {listening ? (
              <div className="flex items-center gap-2 rounded-[16px] bg-peach p-3" role="status">
                <span className="feel-busy size-3 rounded-full bg-destructive" aria-hidden />
                <span className="flex-1 text-[15px]">{t("momo.listening")}</span>
                <Button variant="unstyled" size="unstyled" onClick={stopMic} className="press flex h-11 items-center gap-1 rounded-full bg-primary px-4 text-primary-foreground"><Square className="size-4" />{t("momo.stop")}</Button>
                <Button variant="unstyled" size="unstyled" onClick={cancelMic} aria-label={t("momo.cancelRec")} className="press flex size-11 items-center justify-center rounded-full border bg-card"><X className="size-5" /></Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="unstyled" size="unstyled" type="button" onClick={startMic} className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-secondary text-[15px] font-medium"><Mic className="size-5" />{t("momo.speak")}</Button>
                <label className={cn("press flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-secondary text-[15px] font-medium focus-within:ring-2 focus-within:ring-ring", images.length >= 3 && "pointer-events-none opacity-50")}>
                  <ImagePlus className="size-5" />{t("momo.photos")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={images.length >= 3} onChange={(e) => { addPhotos(e.target.files).catch(() => setFailure(t("momo.error"))); e.target.value = ""; }} />
                </label>
              </div>
            )}
            {text && !listening && beforeRec.current !== text && <p className="mt-1 text-sm text-muted-foreground">{t("momo.check")}</p>}
          </div>
          {images.length > 0 && (
            <div>
              <ul className="flex gap-2">
                {images.map((src, i) => (
                  <li key={i} className="relative">
                    <img src={src} alt={`${t("f.photo")} ${i + 1}`} className="size-20 rounded-[12px] object-cover" />
                    <Button variant="unstyled" size="unstyled" onClick={() => setImages(images.filter((_, k) => k !== i))} aria-label={`${t("photo.remove")} ${i + 1}`}
                      className="press absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full border bg-card"><X className="size-4" /></Button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-muted-foreground">{t("momo.photoHint")}</p>
            </div>
          )}
          {failure && (
            <div role="alert" className="rounded-[16px] border border-destructive/40 bg-card p-4 text-[15px]">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />{failure}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="unstyled" size="unstyled" onClick={run} className="press h-11 flex-1 rounded-full border">{t("momo.retry")}</Button>
                <Button variant="unstyled" size="unstyled" onClick={onManual} className="press h-11 flex-1 rounded-full border">{t("momo.manual")}</Button>
              </div>
            </div>
          )}
          <Button variant="unstyled" size="unstyled" onClick={run} disabled={busy || listening || (!text.trim() && !images.length)} className="press h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">
            {busy && <LoaderCircle className="feel-busy mr-2 size-5" />}
            {busy ? t("momo.thinking") : t("momo.extract")}
          </Button>
          {busy && <div role="progressbar" aria-label={t("momo.thinking")} className="feel-progress h-1.5"><div className="feel-indeterminate h-full w-1/3 rounded-full bg-primary" /></div>}
        </>
      )}

      {step === "review" && !saved && drafts && (
        <>
          {reply && <p className="rounded-[20px] bg-accent p-4 text-[15px]">{reply}</p>}
          <p className="text-[15px] font-semibold">{t("momo.review")}</p>
          {drafts.length === 0 && <p className="text-[15px] text-muted-foreground">{t("momo.none")}</p>}
          <ul className="feel-list space-y-3">
            {drafts.map((d) => <DraftCard key={d.key} d={d} onChange={(p) => update(d.key, p)} onRemove={() => setDrafts(drafts.filter((x) => x.key !== d.key))}
              error={entries.find((x) => x.d.key === d.key && "error" in x.e) ? t("evidence.clarify") : null} />)}
          </ul>
          <div className="flex gap-2">
            <Button variant="unstyled" size="unstyled" onClick={() => setStep("input")} className="press flex h-12 flex-1 items-center justify-center gap-1 rounded-full border"><Undo2 className="size-4" />{t("momo.original")}</Button>
            <Button variant="unstyled" size="unstyled" onClick={goFinal} disabled={!entries.length} className="press h-12 flex-[1.4] rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">{t("momo.next")}</Button>
          </div>
        </>
      )}

      {step === "final" && !saved && drafts && (
        <>
          <ul className="space-y-2">
            {drafts.map((d) => {
              const dup = d.dup;
              if (!d.on && !dup) return null;
              return (
                <li key={d.key} className={cn("rounded-[16px] border bg-card p-3", !d.on && "opacity-70")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{typeLabel(d.type)}</span>
                    {dup && (
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={d.on} onChange={(e) => update(d.key, { on: e.target.checked })} />
                        {t("momo.include")}
                      </label>
                    )}
                  </div>
                  {dup && <p className="text-sm text-destructive">{t("momo.dup")}</p>}
                  <p className="text-[15px] text-muted-foreground">{FIELDS[d.type].map((f) => `${t(f.label as Key)}: ${d.f[f.k] || (f.kind === "time" ? t("unknown") : t("missing"))}`).join(" · ")}</p>
                  {d.type === "injection" && <p className="mt-1 text-sm text-muted-foreground">{t("stock.move")}: {t("evidence.stockLater")}</p>}
                  {d.type === "expense" && <p className="mt-1 text-sm text-muted-foreground">{t("stock.move")}: {t("evidence.receiptLater")}</p>}
                </li>
              );
            })}
          </ul>
          {failure && <p role="alert">{failure}</p>}
          <div className="flex gap-2">
            <Button variant="unstyled" size="unstyled" onClick={() => setStep("review")} className="press h-12 flex-1 rounded-full border">{t("momo.back")}</Button>
            <Button variant="unstyled" size="unstyled" onClick={confirm} disabled={saving || !entries.length} className="press h-12 flex-[1.4] rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? t("momo.saving") : `${t("momo.confirm")} (${entries.length})`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DraftCard({ d, onChange, onRemove, error }: { d: Draft; onChange: (p: Partial<Draft>) => void; onRemove: () => void; error: string | null }) {
  const miss = missingFields(d);
  const [expanded, setExpanded] = useState(false);
  const Icon = { weight: Scale, injection: Syringe, condition: Smile, measure: Ruler, memory: ImageIcon, expense: Receipt }[d.type];
  return (
    <li className={cn("rounded-[20px] border bg-card p-4", d.on ? "border-primary" : "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-semibold"><Icon className="size-5" />{typeLabel(d.type)}</span>
        <div className="flex items-center gap-1">
          <label className="flex min-h-11 items-center gap-2 px-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={d.on} onChange={(e) => onChange({ on: e.target.checked })} />
            {t("momo.include")}
          </label>
          <Button variant="unstyled" size="unstyled" onClick={onRemove} className="press min-h-11 rounded-full px-3 text-sm text-muted-foreground">{t("momo.remove")}</Button>
        </div>
      </div>
      <p className="mt-2 text-[18px] font-bold">{d.f["value"] || d.f["medication"] || d.f["label"] || d.f["amount"] || d.f["note"] || t("unknown")}</p>
      <p className="text-sm">{d.f["date"] || t("evidence.clarify")}</p>
      <Button variant="unstyled" size="unstyled" className="min-h-11 underline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t("evidence.edit")}</Button>
      <p className="text-sm text-muted-foreground">{t("evidence.proposed")}</p>
      {d.on && expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FIELDS[d.type].map((f) => (
            f.k === "medication" ? <div key={f.k} className="col-span-2">
              <span className="mb-1 block text-sm font-medium">{t(f.label as Key)}</span>
              <MedicationPicker value={d.f[f.k] ?? ""} onChange={(value) => onChange({ f: { ...d.f, [f.k]: value } })} />
            </div> : <label key={f.k} className={cn("block", (f.kind === "text" && f.k === "note") && "col-span-2")}>
              <span className="mb-1 block text-sm font-medium">{t(f.label as Key)} · {t(d.evidence && d.f[f.k] !== d.evidence.proposed[f.k] ? "evidence.corrected" : "evidence.suggested")}</span>
              <input className={inputCls} type={f.kind === "date" ? "date" : f.kind === "time" ? "time" : "text"} inputMode={f.kind === "num" ? "decimal" : undefined}
                value={d.f[f.k] ?? ""} placeholder={f.kind === "time" ? t("unknown") : t("missing")} onChange={(e) => onChange({ f: { ...d.f, [f.k]: e.target.value } })} />
            </label>
          ))}
        </div>
      )}
      {d.timeHint && <p className="mt-2 text-sm"><span className="font-medium">{t("momo.timeHint")}:</span> “{d.timeHint}”</p>}
      {miss.length > 0 && <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium">{t("momo.missingL")}:</span> {miss.map((k) => t(FIELDS[d.type].find((f) => f.k === k)!.label as Key)).join(", ")}</p>}
      {d.type === "injection" && <p className="mt-1 text-sm text-muted-foreground">{t("stock.move")}: {t("evidence.stockLater")}</p>}
      {d.quote && <blockquote className="mt-2 border-l-4 border-primary/40 pl-3 text-sm text-muted-foreground"><span className="font-medium">{t("momo.source")}:</span> “{d.quote}”</blockquote>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </li>
  );
}
