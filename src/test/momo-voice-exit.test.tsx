import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMomoVoice } from "@/components/app/useMomoVoice";

const speechResult = (text: string) => Object.assign([{ transcript: text }], { isFinal: true });
class Recognition {
  static instances: Recognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onstart?: () => void;
  onend?: () => void;
  onresult?: (event: { results: ReturnType<typeof speechResult>[] }) => void;
  start = vi.fn(() => this.onstart?.());
  abort = vi.fn(() => this.onend?.());
  constructor() {
    Recognition.instances.push(this);
  }
}
const previous = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");
beforeEach(() => {
  vi.useFakeTimers();
  Recognition.instances = [];
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (previous) Object.defineProperty(window, "SpeechRecognition", previous);
  else delete (window as unknown as Record<string, unknown>)["SpeechRecognition"];
});
function harness(isSessionCurrent: () => boolean) {
  return renderHook(
    ({ current }) => {
      const [text, onText] = useState("Fictional typed words");
      const [usedVoice, onVoice] = useState(false);
      const voice = useMomoVoice({
        text,
        usedVoice,
        lang: "en-US",
        owner: "A",
        onText,
        onVoice,
        isSessionCurrent: current,
      });
      return { text, voice };
    },
    { initialProps: { current: isSessionCurrent } },
  );
}
it("aborts promptly on Close while mounted and preserves the last accepted words", () => {
  let current = true;
  const predicate = () => current;
  const view = harness(predicate);
  act(() => view.result.current.voice.start());
  const engine = Recognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("accepted words")] }));
  current = false;
  view.rerender({ current: () => false });
  expect(engine.abort).toHaveBeenCalledOnce();
  expect(view.result.current.voice.status).toBe("interrupted");
  act(() => {
    engine.onresult?.({ results: [speechResult("late private words")] });
    engine.onend?.();
    vi.advanceTimersByTime(60_000);
  });
  expect(view.result.current.text).toBe("Fictional typed words accepted words");
  expect(view.result.current.voice.recovery).toEqual({
    before: "Fictional typed words",
    wasVoice: false,
  });
  expect(Recognition.instances).toHaveLength(1);
});
it("blocks late speech and automatic restart synchronously before a close rerender", () => {
  let current = true;
  const view = harness(() => current);
  act(() => view.result.current.voice.start());
  const engine = Recognition.instances[0]!;
  current = false;
  act(() => {
    engine.onresult?.({ results: [speechResult("late private words")] });
    engine.onend?.();
    vi.advanceTimersByTime(650);
  });
  expect(view.result.current.text).toBe("Fictional typed words");
  expect(Recognition.instances).toHaveLength(1);
});
it("cannot start speech in an invalidated capture session", () => {
  const view = harness(() => false);
  act(() => view.result.current.voice.start());
  expect(Recognition.instances).toHaveLength(0);
  expect(view.result.current.voice.recovery).toBeNull();
});
