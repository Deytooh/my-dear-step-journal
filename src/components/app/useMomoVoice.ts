import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Result = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  start(): void;
  stop?(): void;
  abort(): void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onresult: (event: { results: ArrayLike<Result> }) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
};
type Status = "idle" | "starting" | "listening" | "restarting" | "interrupted";
export type VoiceRecovery = { before: string; wasVoice: boolean };

type Continuation = { base: string; interim: string; previous: string; uncertain: boolean };
type Cycle = {
  base: string;
  size: number;
  ignored: Set<number>;
  finals: Map<number, string>;
  finalText: string;
  interimText: string;
  retained: string;
  previous: string;
  uncertain: boolean;
  boundary: boolean;
  progress: boolean;
};
const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
const comparable = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:。！？]+$/u, "")
    .trim();
const newCycle = (base: string, continuation?: Continuation | null): Cycle => ({
  base: continuation?.base ?? base,
  size: 0,
  ignored: new Set(),
  finals: new Map(),
  finalText: "",
  interimText: "",
  retained: continuation?.interim ?? "",
  previous: continuation?.previous ?? "",
  uncertain: continuation?.uncertain ?? false,
  boundary: !!continuation,
  progress: false,
});

// Browser dictation only. This hook never sends audio, text, or requests to Momo.
export function useMomoVoice(options: {
  text: string;
  usedVoice: boolean;
  lang: string;
  owner: string;
  isSessionCurrent?: () => boolean;
  onText(text: string): void;
  onVoice(value: boolean): void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [status, setStatus] = useState<Status>("idle");
  const [provisional, setProvisional] = useState(false);
  const [issue, setIssue] = useState<"unsupported" | "blocked" | null>(null);
  const session = useRef<VoiceRecovery | null>(null);
  const [recovery, setRecovery] = useState<VoiceRecovery | null>(null);
  const engine = useRef<Recognition | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restarts = useRef<number[]>([]);
  const currentText = useRef(options.text);
  const cycle = useRef<Cycle>(newCycle(options.text));
  const continuation = useRef<Continuation | null>(null);
  const seenFinals = useRef(new WeakSet<object>());
  const finishing = useRef(false);

  const release = () => {
    finishing.current = false;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    if (watchdog.current) clearTimeout(watchdog.current);
    timer.current = watchdog.current = null;
    const old = engine.current;
    engine.current = null;
    try {
      old?.abort();
    } catch {
      /* Already disconnected. */
    }
  };
  const interrupt = () => {
    if (!session.current) return;
    release();
    continuation.current = null;
    setStatus("interrupted");
  };
  const isCurrent = () => latest.current.isSessionCurrent?.() !== false;
  const connect = () => {
    if (!isCurrent() || !session.current || document.hidden) {
      interrupt();
      return;
    }
    release();
    const token = generation.current;
    const owner = latest.current.owner;
    const captureIsCurrent = latest.current.isSessionCurrent;
    const W = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setIssue("unsupported");
      setStatus("interrupted");
      return;
    }
    let r: Recognition;
    try {
      r = new Ctor();
    } catch {
      setIssue("unsupported");
      setStatus("interrupted");
      return;
    }
    cycle.current = newCycle(currentText.current, continuation.current);
    continuation.current = null;
    r.lang = latest.current.lang;
    r.continuous = true;
    r.interimResults = true;
    const valid = () =>
      token === generation.current &&
      session.current !== null &&
      owner === latest.current.owner &&
      captureIsCurrent?.() !== false &&
      isCurrent();
    r.onstart = () => {
      if (!valid()) return;
      if (watchdog.current) clearTimeout(watchdog.current);
      setStatus("listening");
    };
    r.onresult = (event) => {
      if (!valid()) return;
      const c = cycle.current;
      c.size = event.results.length;
      // Final slots are immutable. A duplicated object is a replay, whereas
      // distinct slots with the same words can be intentional repetition.
      const seen = new Set<object>();
      const slots = new Map<number, { text: string; final: boolean }>();
      for (const [i, text] of c.finals) slots.set(i, { text, final: true });
      Array.from(event.results).forEach((result, i) => {
        if (c.ignored.has(i)) return;
        if (c.finals.has(i)) {
          seen.add(result);
          return;
        }
        if (seen.has(result) || seenFinals.current.has(result)) return;
        seen.add(result);
        const text = result[0]?.transcript?.trim();
        if (!text) return;
        slots.set(i, { text, final: result.isFinal });
        if (result.isFinal) {
          c.finals.set(i, text);
          seenFinals.current.add(result);
        }
      });
      const ordered = [...slots]
        .sort(([a], [b]) => a - b)
        .map(([, value]) => value)
        .reduce<{ text: string; final: boolean }[]>((phrases, slot) => {
          const previous = phrases.at(-1);
          // Some mobile engines append expanded hypotheses as new slots instead
          // of updating the old slot. Replace only a strictly growing prefix;
          // equal phrases and ordinary repeated words remain intentional text.
          if (previous && comparable(slot.text).startsWith(comparable(previous.text) + " ")) {
            phrases[phrases.length - 1] = slot;
          } else {
            phrases.push(slot);
          }
          return phrases;
        }, []);
      c.finalText = ordered
        .filter((slot) => slot.final)
        .map((slot) => slot.text)
        .join(" ");
      c.interimText = ordered
        .filter((slot) => !slot.final)
        .map((slot) => slot.text)
        .join(" ");
      const incoming = ordered.map((slot) => slot.text).join(" ");
      let suffix = incoming;
      if (c.retained) {
        const previous = comparable(c.retained);
        const next = comparable(incoming);
        if (!next || (previous.startsWith(next) && previous !== next && !!c.interimText)) {
          // Keep the longer provisional phrase visible while the new engine catches up.
          suffix = c.retained;
        } else if (next === previous || next.startsWith(previous)) {
          c.retained = "";
        } else {
          // A genuinely new phrase must not erase words left unfinished before the pause.
          c.base = join(c.base, c.retained);
          c.retained = "";
          c.uncertain = true;
        }
      }
      if (incoming && !c.retained && comparable(incoming) !== comparable(c.previous))
        c.progress = true;
      if (incoming && !c.retained) c.boundary = false;
      const interim = c.uncertain || !!c.retained || !!c.interimText;
      const value = join(c.base, suffix);
      if (value.length > 4000) {
        // Preserve the full transcription; the existing composer limit is shown by the caller.
        currentText.current = value;
        latest.current.onText(value);
        latest.current.onVoice(true);
        setProvisional(interim);
        interrupt();
        return;
      }
      currentText.current = value;
      latest.current.onText(value);
      if (incoming) latest.current.onVoice(true);
      setProvisional(interim);
    };
    r.onerror = ({ error }) => {
      if (!valid()) return;
      // Silence may be transient. All other errors require an explicit retry.
      if (error === "no-speech") return;
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(error))
        setIssue("blocked");
      interrupt();
    };
    r.onend = () => {
      if (!valid()) return;
      if (finishing.current) {
        finish();
        return;
      }
      engine.current = null;
      // Ended engines become stale immediately, including during the restart delay.
      release();
      const restartToken = generation.current;
      const c = cycle.current;
      if (document.hidden) {
        interrupt();
        return;
      }
      const now = Date.now();
      restarts.current = c.progress ? [] : restarts.current.filter((at) => now - at < 60000);
      // No endless permission/error/silence loop, even if the engine immediately ends.
      if (restarts.current.length >= 2) {
        interrupt();
        return;
      }
      restarts.current.push(now);
      continuation.current = {
        base: join(c.base, c.retained ? "" : c.finalText),
        interim: c.retained || c.interimText,
        previous: c.retained || c.interimText || c.finalText || c.previous,
        uncertain: c.uncertain,
      };
      setStatus("restarting");
      timer.current = setTimeout(() => {
        timer.current = null;
        if (restartToken === generation.current && session.current) connect();
      }, 650);
    };
    engine.current = r;
    setStatus("starting");
    watchdog.current = setTimeout(() => {
      if (valid()) interrupt();
    }, 10000);
    try {
      r.start();
    } catch {
      interrupt();
    }
  };
  const start = () => {
    if (!isCurrent()) return;
    if (!session.current) {
      session.current = { before: latest.current.text, wasVoice: latest.current.usedVoice };
      setRecovery(session.current);
    }
    currentText.current = latest.current.text;
    continuation.current = null;
    seenFinals.current = new WeakSet();
    restarts.current = [];
    setIssue(null);
    connect();
  };
  const finish = () => {
    // Invalidate before abort: a delayed end/result must never restart or overwrite edits.
    release();
    session.current = null;
    continuation.current = null;
    setRecovery(null);
    setStatus("idle");
    setIssue(null);
    setProvisional(false);
  };
  const finishListening = () => {
    // User-requested Finish lets the browser flush its final transcript.
    // Cancellation, account changes and navigation still abort immediately.
    const recognizer = engine.current;
    if (!isCurrent() || !recognizer?.stop) {
      finish();
      return;
    }
    if (finishing.current) return;
    finishing.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (watchdog.current) clearTimeout(watchdog.current);
    timer.current = null;
    watchdog.current = setTimeout(() => finish(), 2000);
    try {
      recognizer.stop();
    } catch {
      finish();
    }
  };
  const cancel = () => {
    if (!isCurrent()) return;
    const before = session.current;
    finish();
    if (before) {
      currentText.current = before.before;
      latest.current.onText(before.before);
      latest.current.onVoice(before.wasVoice);
    }
  };
  const edit = (text: string) => {
    if (!isCurrent()) return;
    // Treat user edits as authoritative, including an edited interim hypothesis.
    if (finishing.current || timer.current || cycle.current.boundary) interrupt();
    cycle.current.base = text;
    cycle.current.finals.clear();
    cycle.current.finalText = cycle.current.interimText = cycle.current.retained = "";
    cycle.current.uncertain = false;
    cycle.current.ignored = new Set(Array.from({ length: cycle.current.size }, (_, i) => i));
    currentText.current = text;
    setProvisional(false);
    latest.current.onText(text);
  };
  const restore = (data: VoiceRecovery) => {
    release();
    session.current = data;
    setRecovery(data);
    setStatus("interrupted");
  };
  useLayoutEffect(() => {
    // A closing sheet can stay mounted for its exit animation. Stop listening
    // before paint while preserving accepted words and explicit resume/cancel.
    if (!isCurrent() && (engine.current || timer.current || watchdog.current)) interrupt();
  });
  useEffect(() => {
    finish();
    const hidden = () => {
      if (document.hidden) interrupt();
    };
    const leaving = () => interrupt();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
      session.current = null;
      release();
    };
    // Lifecycle belongs to the account; callbacks read current values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.owner]);
  return {
    status,
    provisional,
    issue,
    recovery,
    active: recovery !== null,
    start,
    finish,
    finishListening,
    cancel,
    edit,
    interrupt,
    restore,
  };
}
