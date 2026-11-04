import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { metaJSON, ProviderError, validateImages } from "@/lib/meta-provider.server";
const parse = (raw: unknown) => {
  if (!raw || typeof raw !== "object" || !("ok" in raw)) throw new Error("schema");
  return raw;
};
const response = (content: string, finish_reason = "stop") =>
  new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }), {
    status: 200,
  });
beforeEach(() => {
  vi.stubEnv("BASETEN_API_KEY", "fictional-unit-test-key");
  vi.stubEnv("MUSE_MODEL", "meta-models/muse-spark-open");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses a server-side Meta model and one reserved request", async () => {
  const fetch = vi.fn().mockResolvedValue(response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  const reserve = vi.fn().mockResolvedValue(true);
  expect(await metaJSON("task", { text: "fictional" }, [], parse, reserve)).toMatchObject({
    value: { ok: true },
    model: "meta-models/muse-spark-open",
  });
  expect(reserve).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.model).toBe("meta-models/muse-spark-open");
  expect(body.messages[0].content).toContain("untrusted data");
});
it("rejects truncated responses rather than saving a parseable fragment", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response('{"ok":true}', "length")));
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({
    code: "parse",
  });
});
it("permits at most one bounded JSON repair", async () => {
  const fetch = vi.fn().mockImplementation(async () => response("not JSON"));
  vi.stubGlobal("fetch", fetch);
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({
    code: "parse",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not make paid requests without quota or a configured key", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(metaJSON("task", {}, [], parse, async () => false)).rejects.toMatchObject({
    code: "quota",
  });
  vi.stubEnv("BASETEN_API_KEY", "");
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({
    code: "not_configured",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  [401, "credentials"],
  [404, "model"],
  [429, "quota"],
  [500, "service"],
])("returns useful recovery for HTTP %s", async (status, code) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("private provider body", { status: status as number })),
  );
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({ code });
});
it("rejects arbitrary URLs and MIME-spoofed images before calling Meta", () => {
  expect(() => validateImages(["https://untrusted.invalid/photo"])).toThrow();
  expect(() => validateImages(["data:image/jpeg;base64,dGV4dA=="])).toThrow();
  expect(() => validateImages(["data:image/png;base64,dGV4dA=="])).toThrow();
});

it.each(['  \n```json\n{"ok":true}\n``` \n', '```JSON\n{"ok":true}\n```', '  {"ok":true} \n'])(
  "accepts a complete JSON result with harmless surrounding whitespace: %s",
  async (content) => {
    const fetch = vi.fn().mockResolvedValue(response(content));
    vi.stubGlobal("fetch", fetch);
    expect(await metaJSON("task", {}, [], parse, async () => true)).toMatchObject({
      value: { ok: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("does not accept a JSON-looking fragment surrounded by unvalidated prose", async () => {
  const fetch = vi.fn().mockImplementation(async () => response('Here is advice: {"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({
    code: "parse",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  "not JSON",
  JSON.stringify({ choices: [{ message: { content: null } }] }),
  JSON.stringify({ choices: [{ message: { content: [] } }] }),
  "null",
])("classifies malformed provider envelopes as validation failures", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  await expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject({
    code: "parse",
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

it("checks the configured model before consuming quota", async () => {
  vi.stubEnv("MUSE_MODEL", "unsupported-model");
  const reserve = vi.fn().mockResolvedValue(true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(metaJSON("task", {}, [], parse, reserve)).rejects.toMatchObject({ code: "model" });
  expect(reserve).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"] as const)(
  "bounds a hanging reservation and ignores its late %s without calling Meta",
  async (settlement) => {
    vi.useFakeTimers();
    const reservation = deferred<boolean>();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = metaJSON("task", {}, [], parse, () => reservation.promise);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(44999);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    if (settlement === "resolve") reservation.resolve(true);
    else reservation.reject(new Error("late quota error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["fetch", "body"] as const)(
  "bounds a hanging %s even when it ignores abort",
  async (stage) => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const body = deferred<string>();
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        stage === "fetch"
          ? pending.promise
          : Promise.resolve({ ok: true, text: () => body.promise }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = metaJSON("task", {}, [], parse, async () => true);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(45000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // Late failures remain observed and cannot cause an unhandled rejection.
    if (stage === "fetch") pending.reject(new Error("late fetch failure"));
    else body.reject(new Error("late body failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("shares one deadline across reservation, initial response, and JSON repair", async () => {
  vi.useFakeTimers();
  const reservation = deferred<boolean>();
  const firstBody = deferred<string>();
  const repair = deferred<Response>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, text: () => firstBody.promise })
    .mockReturnValueOnce(repair.promise);
  vi.stubGlobal("fetch", fetch);
  const reserve = vi.fn(() => reservation.promise);
  const result = metaJSON("task", {}, [], parse, reserve);
  const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(20000);
  reservation.resolve(true);
  await vi.advanceTimersByTimeAsync(20000);
  firstBody.resolve(JSON.stringify({ choices: [{ message: { content: "invalid" } }] }));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![1].signal).toBe(fetch.mock.calls[1]![1].signal);
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
  repair.resolve(response('{"ok":true}'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("never starts a repair after a timed-out body later resolves", async () => {
  vi.useFakeTimers();
  const body = deferred<string>();
  const fetch = vi.fn().mockResolvedValue({ ok: true, text: () => body.promise });
  vi.stubGlobal("fetch", fetch);
  const assertion = expect(metaJSON("task", {}, [], parse, async () => true)).rejects.toMatchObject(
    { code: "timeout" },
  );
  await vi.advanceTimersByTimeAsync(45000);
  await assertion;
  body.resolve(JSON.stringify({ choices: [{ message: { content: "invalid" } }] }));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("allows a successful repair within the deadline and clears its timer", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response("invalid"))
    .mockResolvedValueOnce(response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  const reserve = vi.fn().mockResolvedValue(true);
  await expect(metaJSON("task", {}, [], parse, reserve)).resolves.toMatchObject({
    value: { ok: true },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch.mock.calls[0]![1].signal.aborted).toBe(false);
});

it("gives a fresh call a fresh deadline after an earlier timeout", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  const reserve = vi.fn().mockResolvedValue(true);
  const assertion = expect(metaJSON("task", {}, [], parse, reserve)).rejects.toMatchObject({
    code: "timeout",
  });
  await vi.advanceTimersByTimeAsync(45000);
  await assertion;
  await expect(metaJSON("task", {}, [], parse, reserve)).resolves.toMatchObject({
    value: { ok: true },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(reserve).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]![1].signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves typed quota errors and clears the operation deadline", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const error = new ProviderError("not_configured");
  await expect(
    metaJSON("task", {}, [], parse, async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("checks elapsed time before starting Meta even if the timer has not fired yet", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const reserve = vi.fn(async () => {
    vi.setSystemTime(Date.now() + 45000);
    return true;
  });
  await expect(metaJSON("task", {}, [], parse, reserve)).rejects.toMatchObject({ code: "timeout" });
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("never starts repair when validation uses up the remaining deadline", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  const slowParse = () => {
    vi.setSystemTime(Date.now() + 45000);
    throw new Error("invalid schema");
  };
  await expect(metaJSON("task", {}, [], slowParse, async () => true)).rejects.toMatchObject({
    code: "timeout",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
