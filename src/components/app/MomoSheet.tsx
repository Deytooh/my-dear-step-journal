import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Check } from "lucide-react";
import { toast } from "sonner";
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { extractWithMomo, type MomoCandidate } from "@/lib/momo.functions";
import { useJournal, type JournalRecord } from "@/lib/journal";
import { fmtMonthDay, fmtTime, instantFromLocal, todayLocal } from "@/lib/dates";
import { t, getLocale } from "@/lib/i18n";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function candidateToRecord(c: MomoCandidate, id: string, tz: string, today: string): JournalRecord | null {
  const date = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : today;
  const time = "time" in c && c.time && /^\d{2}:\d{2}$/.test(c.time) ? c.time : null;
  const base = { id, localDate: date, createdAt: new Date().toISOString(), source: "manual_text" as const,
    precision: time ? ("exact" as const) : ("date_only" as const), at: time ? instantFromLocal(date, time, tz) : null };
  switch (c.type) {
    case "weight": { const v = num(c.value); return v && v >= 20 && v <= 400 ? { ...base, type: "weight", value: v, unit: "kg" } : null; }
    case "injection": return { ...base, type: "injection", medication: c.medication ?? null, doseValue: num(c.doseValue), doseUnit: c.doseUnit ?? null, site: c.site ?? null, usedStock: true };
    case "condition": return c.label ? { ...base, type: "condition", label: c.label, ...(c.note ? { note: c.note } : {}) } : null;
    case "measure": { const m = { waist: num(c.waist), hip: num(c.hip), chest: num(c.chest), thigh: num(c.thigh) };
      return Object.values(m).some((v) => v != null) ? { ...base, type: "measure", unit: "cm", ...m } : null; }
    case "memory": return c.note ? { ...base, type: "memory", note: c.note } : null;
  }
  return null;
}

function describe(r: JournalRecord, tz: string) {
  const when = fmtMonthDay(r.localDate) + (r.at ? " · " + fmtTime(r.at, tz) : "");
  const what = r.type === "weight" ? `${t("type.weight")} ${r.value} kg`
    : r.type === "injection" ? `${t("type.injection")} ${[r.medication, r.doseValue != null ? `${r.doseValue}${r.doseUnit ?? ""}` : null, r.site].filter(Boolean).join(" · ")}`
    : r.type === "condition" ? `${t("type.condition")} ${r.label}${r.note ? ` — ${r.note}` : ""}`
    : r.type === "measure" ? `${t("type.measure")} ${(["waist", "hip", "chest", "thigh"] as const).filter((k) => r[k] != null).map((k) => `${k} ${r[k]}`).join(", ")} cm`
    : `${t("type.memory")} ${r.note}`;
  return { what, when };
}

type SR = { start: () => void; stop: () => void; lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };

export function MomoSheet({ onDone }: { onDone: () => void }) {
  const j = useJournal();
  const extract = useServerFn(extractWithMomo);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [drafts, setDrafts] = useState<{ rec: JournalRecord; on: boolean }[] | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);
  const today = todayLocal(j.tz);

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast(t("momo.noMic")); return; }
    const r = new Ctor();
    r.lang = ({ ko: "ko-KR", en: "en-US", fr: "fr-FR" })[getLocale()];
    r.interimResults = false;
    r.onresult = (e) => setText((p) => (p ? p + " " : "") + Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" "));
    r.onend = () => setListening(false);
    recRef.current = r; r.start(); setListening(true);
  };

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await extract({ data: { text, today } });
      if (res.error) { toast.error(t(res.error === "not_configured" ? "voice.unavailable" : "momo.error")); return; }
      setReply(res.reply);
      setDrafts(res.candidates.map((c) => candidateToRecord(c, j.newId(), j.tz, today)).filter((r): r is JournalRecord => !!r).map((rec) => ({ rec, on: true })));
    } catch { toast.error(t("momo.error")); } finally { setBusy(false); }
  };

  const confirm = () => {
    const chosen = drafts?.filter((d) => d.on) ?? [];
    if (!chosen.length) return;
    const before = j.snapshot();
    chosen.forEach((d) => j.saveRecord(d.rec));
    toast.success(t("momo.saved", { n: chosen.length }), { action: { label: t("toast.undo"), onClick: () => j.restoreSnapshot(before) } });
    onDone();
  };

  return (
    <div className="space-y-4">
      <DrawerTitle className="text-[24px] font-bold">{t("voice.all")}</DrawerTitle>
      <DrawerDescription className="text-sm text-muted-foreground">{t("momo.hint")}</DrawerDescription>
      {drafts === null ? (
        <>
          <div className="relative">
            <textarea aria-label={t("momo.input")} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000}
              placeholder={t("momo.placeholder")} className="w-full rounded-[20px] border bg-card p-4 pr-14 text-[16px] placeholder:text-muted-foreground" />
            <button type="button" onClick={toggleMic} aria-label={listening ? t("momo.stop") : t("momo.speak")} aria-pressed={listening}
              className={`press absolute right-3 bottom-4 flex size-11 items-center justify-center rounded-full ${listening ? "bg-primary text-primary-foreground animate-pulse" : "bg-secondary"}`}>
              {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          </div>
          <button onClick={run} disabled={busy || !text.trim()} className="press h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? t("momo.thinking") : t("momo.extract")}
          </button>
        </>
      ) : (
        <>
          {reply && <p className="rounded-[20px] bg-accent p-4 text-[15px]">{reply}</p>}
          <p className="text-sm font-medium">{t("momo.review")}</p>
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">{t("momo.none")}</p>}
          <ul className="space-y-2">
            {drafts.map((d, i) => { const { what, when } = describe(d.rec, j.tz); return (
              <li key={d.rec.id}>
                <button type="button" aria-pressed={d.on} onClick={() => setDrafts(drafts.map((x, k) => (k === i ? { ...x, on: !x.on } : x)))}
                  className={`press flex w-full items-center gap-3 rounded-[20px] border p-4 text-left ${d.on ? "border-primary bg-secondary" : "opacity-60"}`}>
                  <span className={`flex size-6 items-center justify-center rounded-full border ${d.on ? "bg-primary text-primary-foreground" : ""}`}>{d.on && <Check className="size-4" />}</span>
                  <span className="flex-1"><span className="block font-semibold">{what}</span><span className="block text-xs text-muted-foreground">{when}</span></span>
                </button>
              </li>); })}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => setDrafts(null)} className="press h-12 flex-1 rounded-full border">{t("momo.back")}</button>
            <button onClick={confirm} disabled={!drafts.some((d) => d.on)} className="press h-12 flex-[2] rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50">{t("momo.confirm")}</button>
          </div>
        </>
      )}
    </div>
  );
}
