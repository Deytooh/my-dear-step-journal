import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { metaJSON, validateImages } from "@/lib/meta-provider.server";
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
