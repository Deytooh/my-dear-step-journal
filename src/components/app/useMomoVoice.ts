import { useEffect, useRef, useState } from "react";

type Result = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  start(): void;
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

// Browser dictation only. This hook never sends audio, text, or requests to Momo.
export function useMomoVoice(options: {
  text: string;
  usedVoice: boolean;
  lang: string;
  owner: string;
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
  const cycle = useRef({ base: options.text, size: 0, ignored: new Set<number>() });

  const release = () => {
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
    setStatus("interrupted");
  };
  const connect = () => {
    if (!session.current || document.hidden) {
      interrupt();
      return;
    }
    release();
    const token = generation.current;
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
    cycle.current = { base: currentText.current, size: 0, ignored: new Set() };
    r.lang = latest.current.lang;
    r.continuous = true;
    r.interimResults = true;
    const valid = () => token === generation.current && session.current !== null;
    r.onstart = () => {
      if (!valid()) return;
      if (watchdog.current) clearTimeout(watchdog.current);
      setStatus("listening");
    };
    r.onresult = (event) => {
      if (!valid()) return;
      const c = cycle.current;
      c.size = event.results.length;
      // Finals are immutable; interim hypotheses replace their previous slot.
      // Rebuild this engine's suffix rather than appending repeated result events.
      for (const i of c.ignored) if (i >= c.size) c.ignored.delete(i);
      const parts: string[] = [];
      let interim = false;
      Array.from(event.results).forEach((result, i) => {
        if (c.ignored.has(i)) return;
        const transcript = result[0]?.transcript?.trim();
        if (transcript) {
          parts.push(transcript);
          if (!result.isFinal) interim = true;
        }
      });
      const value = [c.base, ...parts].filter(Boolean).join(" ");
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
      if (parts.length) latest.current.onVoice(true);
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
      engine.current = null;
      if (watchdog.current) clearTimeout(watchdog.current);
      if (document.hidden) {
        interrupt();
        return;
      }
      const now = Date.now();
      restarts.current = restarts.current.filter((at) => now - at < 60000);
      // No endless permission/error/silence loop, even if the engine immediately ends.
      if (restarts.current.length >= 2) {
        interrupt();
        return;
      }
      restarts.current.push(now);
      setStatus("restarting");
      timer.current = setTimeout(() => {
        if (valid()) connect();
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
    if (!session.current) {
      session.current = { before: latest.current.text, wasVoice: latest.current.usedVoice };
      setRecovery(session.current);
    }
    currentText.current = latest.current.text;
    restarts.current = [];
    setIssue(null);
    connect();
  };
  const finish = () => {
    // Invalidate before abort: a delayed end/result must never restart or overwrite edits.
    release();
    session.current = null;
    setRecovery(null);
    setStatus("idle");
    setIssue(null);
    setProvisional(false);
  };
  const cancel = () => {
    const before = session.current;
    finish();
    if (before) {
      currentText.current = before.before;
      latest.current.onText(before.before);
      latest.current.onVoice(before.wasVoice);
    }
  };
  const edit = (text: string) => {
    // Treat user edits as authoritative, including an edited interim hypothesis.
    cycle.current.base = text;
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
  useEffect(() => {
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
    cancel,
    edit,
    interrupt,
    restore,
  };
}
