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
  stop = vi.fn(() => this.onend?.());
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
it.each([false, true])(
  "replaces growing mobile transcript snapshots rather than appending them (final=%s)",
  (isFinal) => {
    const hook = harness();
    act(() => hook.result.current.voice.start());
    const engine = FakeRecognition.instances[0];
    if (!engine) throw new Error("Missing recognizer");
    const phrases = ["hey", "hey so", "hey so this morning", "hey so this morning I took a walk"];
    for (let index = 0; index < phrases.length; index++) {
      act(() =>
        engine.onresult?.({
          results: phrases.slice(0, index + 1).map((phrase) => speechResult(phrase, isFinal)),
        }),
      );
    }
    expect(hook.result.current.text).toBe(
      "Fictional existing note hey so this morning I took a walk",
    );
  },
);
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
it("accepts the last spoken words delivered only when Finish stops recognition", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0];
  if (!engine) throw new Error("Missing recognizer");
  engine.stop.mockImplementation(() => {
    engine.onresult?.({ results: [speechResult("I walked today", true)] });
    engine.onend?.();
  });
  act(() => hook.result.current.voice.finishListening());
  expect(hook.result.current.text).toBe("Fictional existing note I walked today");
  expect(hook.result.current.voice.active).toBe(false);
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

it("replaces replayed provisional words across an automatic pause/restart", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const first = FakeRecognition.instances[0]!;
  act(() => first.onresult?.({ results: [speechResult("I feel tired")] }));
  act(() => {
    first.onend?.();
    vi.advanceTimersByTime(650);
  });
  const next = FakeRecognition.instances[1]!;
  act(() => next.onresult?.({ results: [speechResult("I feel tired")] }));
  expect(hook.result.current.text).toBe("Fictional existing note I feel tired");
  act(() => next.onresult?.({ results: [speechResult("I feel tired today", true)] }));
  expect(hook.result.current.text).toBe("Fictional existing note I feel tired today");
});

it("keeps finalized speech while replacing an expanded provisional tail after a pause", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const first = FakeRecognition.instances[0]!;
  act(() =>
    first.onresult?.({ results: [speechResult("had breakfast", true), speechResult("and a co")] }),
  );
  act(() => {
    first.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("and a coffee", true)] }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note had breakfast and a coffee");
});

it("keeps the previous provisional phrase when the next recognizer starts a different phrase", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("felt tired")] }));
  act(() => {
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("drank water", true)] }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note felt tired drank water");
});

it("ignores callbacks from an ended engine during the restart gap", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const first = FakeRecognition.instances[0]!;
  act(() => first.onresult?.({ results: [speechResult("kept words")] }));
  act(() => first.onend?.());
  act(() => {
    first.onresult?.({ results: [speechResult("late overwrite", true)] });
    first.onend?.();
  });
  expect(hook.result.current.text).toBe("Fictional existing note kept words");
  act(() => vi.advanceTimersByTime(650));
  expect(FakeRecognition.instances).toHaveLength(2);
});

it("ignores aliased duplicate result slots while preserving distinct repeated final words", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const same = speechResult("a walk", true);
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [same, same] }));
  expect(hook.result.current.text).toBe("Fictional existing note a walk");
  act(() => hook.result.current.voice.finish());
  act(() => hook.result.current.voice.start());
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({
      results: [
        speechResult("very", true),
        speechResult("very", true),
        speechResult("tired", true),
      ],
    }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note a walk very very tired");
});

it("keeps an already-final slot immutable across later result events", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const engine = FakeRecognition.instances[0]!;
  act(() => engine.onresult?.({ results: [speechResult("correct final", true)] }));
  act(() =>
    engine.onresult?.({
      results: [speechResult("changed old final", true), speechResult("new words")],
    }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note correct final new words");
});

it("continues normal pauses with new words beyond the empty-restart budget", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  for (let i = 0; i < 5; i++)
    act(() => {
      const engine = FakeRecognition.instances[i]!;
      engine.onresult?.({ results: [speechResult("phrase " + i, true)] });
      engine.onend?.();
      vi.advanceTimersByTime(650);
    });
  expect(FakeRecognition.instances).toHaveLength(6);
  expect(hook.result.current.voice.status).toBe("listening");
  expect(hook.result.current.text).toBe(
    "Fictional existing note phrase 0 phrase 1 phrase 2 phrase 3 phrase 4",
  );
});

it("preserves intentional repeated words in a restarted provisional phrase", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("very")] }));
  act(() => {
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("very very tired", true)] }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note very very tired");
});

it("does not drop a retained phrase for a shorter new interim prefix", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("I feel tired")] }));
  act(() => {
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() => FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("I feel")] }));
  expect(hook.result.current.text).toBe("Fictional existing note I feel tired");
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("I feel tired now", true)] }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note I feel tired now");
});

it("retains an edit made in the restart gap and leaves resuming explicit", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("wrong words")] }));
  act(() => FakeRecognition.instances[0]!.onend?.());
  act(() => hook.result.current.voice.edit("My correction"));
  act(() => vi.advanceTimersByTime(650));
  expect(hook.result.current.text).toBe("My correction");
  expect(hook.result.current.voice.status).toBe("interrupted");
  expect(FakeRecognition.instances).toHaveLength(1);
});

it("bounds repeated provisional replays without growing the transcript", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  for (let i = 0; i < 3; i++) {
    act(() => {
      const engine = FakeRecognition.instances[i]!;
      engine.onresult?.({ results: [speechResult("same unfinished phrase")] });
      engine.onend?.();
      vi.advanceTimersByTime(650);
    });
  }
  expect(hook.result.current.text).toBe("Fictional existing note same unfinished phrase");
  expect(hook.result.current.voice.status).toBe("interrupted");
  expect(FakeRecognition.instances).toHaveLength(3);
});
it("does not treat a shorter replay as fresh progress for the restart budget", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({
      results: [speechResult("a longer unfinished phrase")],
    });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  for (let i = 1; i < 3; i++) {
    act(() => {
      FakeRecognition.instances[i]!.onresult?.({ results: [speechResult("a longer")] });
      FakeRecognition.instances[i]!.onend?.();
      vi.advanceTimersByTime(650);
    });
  }
  expect(hook.result.current.text).toBe("Fictional existing note a longer unfinished phrase");
  expect(hook.result.current.voice.status).toBe("interrupted");
});
it("does not duplicate the same finalized result object replayed after restart", () => {
  const hook = harness();
  const final = speechResult("finished phrase", true);
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({ results: [final] });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({
      results: [final, speechResult("new phrase", true)],
    }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note finished phrase new phrase");
});
it("preserves a distinct repeated final phrase spoken after a pause", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("thank you", true)] });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("thank you", true)] }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note thank you thank you");
});
it("keeps corrections authoritative before the restarted engine has caught up", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("old provisional")] });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  const restarted = FakeRecognition.instances[1]!;
  act(() => hook.result.current.voice.edit("My correction"));
  act(() => restarted.onresult?.({ results: [speechResult("old provisional", true)] }));
  expect(hook.result.current.text).toBe("My correction");
  expect(hook.result.current.voice.status).toBe("interrupted");
});
it.each(["finish", "cancel"] as const)("cancels a pending automatic restart on %s", (action) => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  const old = FakeRecognition.instances[0]!;
  act(() => {
    old.onresult?.({ results: [speechResult("new provisional")] });
    old.onend?.();
  });
  act(() => hook.result.current.voice[action]());
  act(() => {
    old.onresult?.({ results: [speechResult("late result", true)] });
    old.onend?.();
    vi.advanceTimersByTime(650);
  });
  expect(FakeRecognition.instances).toHaveLength(1);
  expect(hook.result.current.voice.status).toBe("idle");
  expect(hook.result.current.text).toBe(
    action === "cancel" ? "Fictional existing note" : "Fictional existing note new provisional",
  );
});
it.each(["커피를 마셨", "j’ai bu un ca"])(
  "replaces an expanded provisional phrase without language-specific word splitting: %s",
  (phrase) => {
    const hook = harness();
    act(() => hook.result.current.voice.start());
    act(() => {
      FakeRecognition.instances[0]!.onresult?.({ results: [speechResult(phrase)] });
      FakeRecognition.instances[0]!.onend?.();
      vi.advanceTimersByTime(650);
    });
    act(() =>
      FakeRecognition.instances[1]!.onresult?.({ results: [speechResult(phrase + " more", true)] }),
    );
    expect(hook.result.current.text).toBe("Fictional existing note " + phrase + " more");
  },
);

it("reconciles case, whitespace, punctuation and French Unicode normalization across a pause", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("J’ai mangé.")] });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  const words = "j’ai  mange\u0301 aujourd’hui";
  act(() => FakeRecognition.instances[1]!.onresult?.({ results: [speechResult(words, true)] }));
  expect(hook.result.current.text).toBe("Fictional existing note " + words);
});
it("retains the full provisional phrase until a case-changed shorter replay catches up", () => {
  const hook = harness();
  act(() => hook.result.current.voice.start());
  act(() => {
    FakeRecognition.instances[0]!.onresult?.({ results: [speechResult("I FEEL TIRED!")] });
    FakeRecognition.instances[0]!.onend?.();
    vi.advanceTimersByTime(650);
  });
  act(() => FakeRecognition.instances[1]!.onresult?.({ results: [speechResult("i feel")] }));
  expect(hook.result.current.text).toBe("Fictional existing note I FEEL TIRED!");
  act(() =>
    FakeRecognition.instances[1]!.onresult?.({
      results: [speechResult("I feel tired now.", true)],
    }),
  );
  expect(hook.result.current.text).toBe("Fictional existing note I feel tired now.");
});
