import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { retrieveMemory } from "@/lib/momo-tasks.functions";
const mocks = vi.hoisted(() => ({
  metaJSON: vi.fn(),
  quota: vi.fn(() => vi.fn()),
  validators: [] as unknown[],
}));
vi.mock("@/lib/meta-provider.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta-provider.server")>()),
  metaJSON: mocks.metaJSON,
  quota: mocks.quota,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator(schema: unknown) {
      mocks.validators.push(schema);
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
const schema = () => mocks.validators[1] as z.ZodType;
const handler = retrieveMemory as unknown as (args: {
  data: unknown;
  context: unknown;
}) => Promise<{ ids: string[]; error: string | null }>;
const filters: unknown[] = [];
let records: unknown[], purchases: unknown[];
const client = {
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        filters.push([table, ...args]);
        return chain;
      },
      in: (...args: unknown[]) => {
        filters.push([table, ...args]);
        return chain;
      },
      limit: (count: number) => {
        filters.push([table, "limit", count]);
        return Promise.resolve({
          data: table === "journal_records" ? records : purchases,
          error: null,
        });
      },
    };
    return chain;
  },
};
const query = {
  query: "yesterday",
  keys: ["record:owned", "record:meal", "purchase:receipt"],
  locale: "en",
};
const invoke = (timezone?: string) =>
  handler({
    data: schema().parse({ ...query, ...(timezone ? { timezone } : {}) }),
    context: { userId: "owner", supabase: client },
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T00:30:00Z"));
  vi.clearAllMocks();
  filters.length = 0;
  records = [
    {
      id: "owned",
      local_date: "2026-11-02",
      data: {
        type: "memory",
        note: "Fictional walk",
        photo: "storage:owner/photo",
        evidence: { text: "PRIVATE SOURCE", photos: ["storage:owner/source"] },
      },
    },
    {
      id: "meal",
      local_date: "2026-11-02",
      data: {
        type: "meal",
        meal: { title: "Fictional meal", photoRefs: ["localphoto:owner:abc"] },
      },
    },
  ];
  purchases = [
    {
      id: "receipt",
      local_date: "2026-11-02",
      data: { amount: 10, currency: "EUR", evidence: { text: "PRIVATE SOURCE" } },
    },
  ];
  mocks.metaJSON.mockResolvedValue({ value: ["record:owned"], model: "fictional-mocked-model" });
});
afterEach(() => {
  vi.useRealTimers();
});
it("grounds relative-date search in the user's server-derived local date and timezone", async () => {
  expect(await invoke("America/Los_Angeles")).toEqual({ ids: ["record:owned"], error: null });
  const [task, payload, images, parse] = mocks.metaJSON.mock.calls[0]!;
  expect(task).toContain("Resolve relative dates");
  expect(payload).toMatchObject({
    today: "2026-11-03",
    timezone: "America/Los_Angeles",
    query: "yesterday",
  });
  expect(images).toEqual([]);
  expect(JSON.stringify(payload)).not.toContain("PRIVATE SOURCE");
  expect(JSON.stringify(payload)).not.toContain("storage:");
  expect(JSON.stringify(payload)).not.toContain("localphoto:");
  expect(() => parse({ ids: ["record:foreign"] })).toThrow();
  expect(filters).toContainEqual(["journal_records", "user_id", "owner"]);
  expect(filters).toContainEqual(["purchases", "user_id", "owner"]);
  expect(filters).toContainEqual(["journal_records", "id", ["owned", "meal"]]);
});
it("keeps older callers compatible with the existing default timezone", async () => {
  await invoke();
  expect(mocks.metaJSON.mock.calls[0]![1]).toMatchObject({
    today: "2026-11-04",
    timezone: "Asia/Seoul",
  });
});
it("rejects invalid timezones and over-limit searches before the handler runs", () => {
  expect(schema().safeParse({ ...query, timezone: "not/a-timezone" }).success).toBe(false);
  expect(schema().safeParse({ ...query, query: "a".repeat(301) }).success).toBe(false);
  expect(mocks.metaJSON).not.toHaveBeenCalled();
});
it("does not send an empty account's query to the provider", async () => {
  records = [];
  purchases = [];
  expect(await invoke()).toEqual({ ids: [], error: null });
  expect(mocks.metaJSON).not.toHaveBeenCalled();
  expect(mocks.quota).not.toHaveBeenCalled();
});

it("sends explicitly unknown purchase money as null without exposing source evidence or changing stored facts", async () => {
  purchases = [
    {
      id: "receipt",
      local_date: "2026-11-02",
      data: {
        amount: 0,
        currency: "KRW",
        evidence: { text: "PRIVATE SOURCE", confirmed: { amount: "", currency: "" } },
      },
    },
  ];
  const before = JSON.stringify(purchases);
  await invoke();
  const payload = mocks.metaJSON.mock.calls[0]![1];
  const candidate = payload.candidates.find(
    (item: { key: string }) => item.key === "purchase:receipt",
  );
  expect(JSON.parse(candidate.facts)).toMatchObject({ amount: null, currency: null });
  expect(JSON.stringify(payload)).not.toContain("PRIVATE SOURCE");
  expect(JSON.stringify(purchases)).toBe(before);
});
