import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMomoVoice } from "@/components/app/useMomoVoice";
const speechResult = (text: string, isFinal = false) =>
  Object.assign([{ transcript: text }], { isFinal });
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { results: ReturnType<typeof speechResult>[] }) => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  abort = vi.fn(() => this.onend?.());
  constructor() {
    FakeRecognition.instances.push(this);
  }
}
const previousSpeech = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
const previousWebkit = Object.getOwnPropertyDescriptor(window, "webkitSpeechRecognition");
beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    writable: true,
    value: FakeRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (previousSpeech) Object.defineProperty(window, "SpeechRecognition", previousSpeech);
  else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
  if (previousWebkit) Object.defineProperty(window, "webkitSpeechRecognition", previousWebkit);
  else delete (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"];
});
function harness() {
  return renderHook(
    ({ owner }) => {
      const [text, onText] = useState("Fictional existing note");
      const [usedVoice, onVoice] = useState(false);
      const voice = useMomoVoice({ text, usedVoice, lang: "en-US", owner, onText, onVoice });
      return { text, usedVoice, voice };
    },
    { initialProps: { owner: "A" } },
  );
}
it("replaces interim speech results instead of duplicating them", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("a wal")] }));
  act(() => engine.onresult?.({ results: [speechResult("a walk", true)] }));
  act(() => engine.onresult?.({ results: [speechResult("a walk", true), speechResult("today")] }));
  expect(hook.result.current.text).toBe("Fictional existing note a walk today");
  expect(hook.result.current.usedVoice).toBe(true);
  expect(engine.lang).toBe("en-US");
});
it("keeps typed corrections authoritative over late provisional speech", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("wrong word")] }));
  act(() => hook.result.current.voice.edit("My fictional correction"));
  act(() => engine.onresult?.({ results: [speechResult("another guess", true)] }));
  expect(hook.result.current.text).toBe("My fictional correction");
});
it("cancel restores the pre-dictation note and ignores delayed results and end events", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("spoken addition")] }));
  act(() => hook.result.current.voice.cancel());
  act(() => {
    engine.onresult?.({ results: [speechResult("late addition")] });
    engine.onend?.();
    vi.advanceTimersByTime(60_000);
  });
  expect(hook.result.current.text).toBe("Fictional existing note");
  expect(hook.result.current.usedVoice).toBe(false);
  expect(hook.result.current.voice.active).toBe(false);
  expect(FakeRecognition.instances).toHaveLength(1);
});
it("finish keeps the transcript while releasing the recognition engine", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("a spoken note", true)] }));
  act(() => hook.result.current.voice.finish());
  expect(hook.result.current.text).toBe("Fictional existing note a spoken note");
  expect(hook.result.current.voice.status).toBe("idle");
  expect(hook.result.current.voice.active).toBe(false);
  expect(engine.abort).toHaveBeenCalled();
});
it("bounds automatic restarts and requires an explicit resume after repeated interruptions", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  for (let i = 0; i < 3; i++)
    act(() => {
      FakeRecognition.instances[i]!.onend?.();
      vi.advanceTimersByTime(650);
    });
  expect(FakeRecognition.instances).toHaveLength(3);
  expect(hook.result.current.voice.status).toBe("interrupted");
  act(() => vi.advanceTimersByTime(60_000));
  expect(FakeRecognition.instances).toHaveLength(3);
});
it("does not retry automatically after microphone permission is denied", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onerror?.({ error: "not-allowed" });
    vi.advanceTimersByTime(60_000);
  });
  expect(hook.result.current.voice.issue).toBe("blocked");
  expect(hook.result.current.voice.status).toBe("interrupted");
  expect(FakeRecognition.instances).toHaveLength(1);
  expect(hook.result.current.text).toBe("Fictional existing note");
});
it("clears voice-session state on account change and rejects the old engine's callbacks", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const old = FakeRecognition.instances[0]!;
  hook.rerender({ owner: "B" });
  act(() => old.onresult?.({ results: [speechResult("stale private words")] }));
  expect(hook.result.current.voice.active).toBe(false);
  expect(hook.result.current.voice.status).toBe("idle");
  expect(hook.result.current.text).toBe("Fictional existing note");
});

it("preserves an over-limit transcript and pauses rather than silently truncating it", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const words = "x".repeat(4001);
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [speechResult(words)] }));
  expect(hook.result.current.text).toBe("Fictional existing note " + words);
  expect(hook.result.current.voice.status).toBe("interrupted");
});
it("keeps typing available when dictation is unsupported", () => {
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
  const hook = harness();
  act(() => hook.result.current.voice.start());
  expect(hook.result.current.voice.issue).toBe("unsupported");
  act(() => hook.result.current.voice.edit("A typed fictional note"));
  expect(hook.result.current.text).toBe("A typed fictional note");
  expect(FakeRecognition.instances).toHaveLength(0);
});
it("pauses when the page is hidden and does not reopen the microphone when it becomes visible", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(hook.result.current.voice.status).toBe("interrupted");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60_000);
  });
  expect(FakeRecognition.instances).toHaveLength(1);
});
it("restores a recoverable voice draft without automatically starting recognition", () => {
  const hook = harness();
  act(() =>
    hook.result.current.voice.restore({ before: "Fictional existing note", wasVoice: false }),
  );
  expect(hook.result.current.voice.status).toBe("interrupted");
  expect(hook.result.current.voice.active).toBe(true);
  expect(FakeRecognition.instances).toHaveLength(0);
});
