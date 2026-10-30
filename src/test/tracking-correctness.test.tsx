import { supabase } from "@/integrations/supabase/client";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JournalProvider,
  latestRecord,
  sortByTime,
  useJournal,
  type InjectionRec,
  type JournalRecord,
  type Purchase,
} from "@/lib/journal";
import { inventory } from "@/lib/inventory";
import { instantFromLocal } from "@/lib/dates";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  clearPhotoCache: vi.fn(),
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
}));

const base = {
  localDate: "2026-10-29",
  precision: "date_only" as const,
  at: null,
  createdAt: "2026-10-29T12:00:00Z",
  source: "manual_text" as const,
};
const purchase = (
  id: string,
  medication = "M",
  stockUnit: Purchase["stockUnit"] = "single",
): Purchase => ({
  id,
  localDate: base.localDate,
  amount: 100,
  currency: "KRW",
  doses: 4,
  medication,
  stockUnit,
});
const injection = (id = "i", stockPurchaseId: string | null = "a"): InjectionRec => ({
  ...base,
  id,
  type: "injection",
  medication: "M",
  doseValue: null,
  doseUnit: null,
  site: null,
  usedStock: true,
  stockIdentity: JSON.stringify(["M", "single", null]),
  stockPurchaseId,
});

describe("record ordering", () => {
  it("selects latest weights, conditions and photos independently of input order", () => {
    const records: JournalRecord[] = [
      { ...base, id: "w0", type: "weight", unit: "kg", value: 80, localDate: "2026-10-28" },
      { ...base, id: "w1", type: "weight", unit: "kg", value: 78 },
      ...["08:00", "20:00"].map((time, i) => ({
        ...base,
        id: `c${i}`,
        type: "condition" as const,
        label: time,
        precision: "exact" as const,
        at: instantFromLocal(base.localDate, time),
      })),
      { ...base, id: "p0", type: "memory", note: "", photo: "old", localDate: "2026-10-28" },
      { ...base, id: "p1", type: "memory", note: "", photo: "new" },
    ];
    for (const rs of [records, [...records].reverse()]) {
      expect(latestRecord(rs, "weight")?.id).toBe("w1");
      expect(latestRecord(rs, "condition")?.id).toBe("c1");
      expect(
        latestRecord(
          rs.filter((r) => r.type === "memory" && !!r.photo),
          "memory",
        )?.id,
      ).toBe("p1");
    }
  });
  it("uses the recorded local day across UTC midnight, without inventing date-only times", () => {
    const older = {
      ...injection("old"),
      localDate: "2026-10-28",
      precision: "exact" as const,
      at: instantFromLocal("2026-10-28", "23:59"),
    };
    const midnight = {
      ...injection("midnight"),
      precision: "exact" as const,
      at: instantFromLocal(base.localDate, "00:01"),
    };
    const unknown = injection("unknown");
    expect([older, unknown, midnight].sort(sortByTime).map((r) => r.id)).toEqual([
      "midnight",
      "unknown",
      "old",
    ]);
    expect(unknown.at).toBeNull();
    const la = {
      ...midnight,
      at: instantFromLocal(base.localDate, "00:01", "America/Los_Angeles"),
    };
    expect([midnight, la].sort(sortByTime)[0]).toBe(la);
  });
  it("breaks same-day approximate ties deterministically and keeps the comparator transitive", () => {
    const a = injection("a");
    const b = { ...injection("b"), createdAt: "2026-10-29T13:00:00Z" };
    const c = {
      ...injection("c"),
      precision: "exact" as const,
      at: instantFromLocal(base.localDate, "09:00"),
    };
    expect([a, b, c].sort(sortByTime).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("isolated stock lots", () => {
  it("never pools products, presentations, units, or even separate purchases", () => {
    const ps = [
      purchase("a"),
      purchase("b", "Other"),
      purchase("c", "M", "dose"),
      { ...purchase("d"), product: "Different presentation" },
      purchase("e", "M", "pen"),
    ];
    expect(inventory(ps, [injection()]).lots.map((l) => l.balance)).toEqual([3, 4, 4, 4, 4]);
    expect(inventory(ps, [injection("i", "e")]).unresolved).toHaveLength(1);
  });
  it("preserves ambiguous legacy movements and missing units for confirmation", () => {
    const legacy = injection("i", null);
    const ps = [purchase("a"), purchase("b", "M", null)];
    const result = inventory(ps, [legacy]);
    expect(result.unresolved).toEqual([legacy]);
    expect(result.unresolvedPurchases).toEqual([ps[1]]);
    expect(result.lots[0]?.balance).toBe(4);
    expect(legacy.stockPurchaseId).toBeNull();
  });
  it("flags removed or changed purchase identities and ignores expense-only purchases", () => {
    for (const ps of [
      [],
      [purchase("a", "Other")],
      [purchase("a", "M", "dose")],
      [{ ...purchase("a"), product: "changed" }],
      [{ ...purchase("a"), addsStock: false }],
    ]) {
      expect(inventory(ps, [injection()]).unresolved).toHaveLength(1);
    }
  });
  it("keeps adjustments separate and negative balances visible", () => {
    expect(
      inventory([purchase("a"), purchase("b")], [injection()], {
        a: { identity: JSON.stringify(["M", "single", null]), delta: -6 },
      }).lots.map((l) => l.balance),
    ).toEqual([-3, 4]);
  });
});

describe("stock identity safety", () => {
  it("does not apply an old adjustment to a changed product or unit", () => {
    const result = inventory([purchase("a", "M", "pen")], [], {
      a: { identity: JSON.stringify(["M", "single", null]), delta: 8 },
    });
    expect(result.lots[0]?.balance).toBe(4);
    expect(result.unresolvedAdjustments).toEqual(["a"]);
  });
  it("counts a duplicated injection ID once", () => {
    expect(inventory([purchase("a")], [injection(), injection()]).lots[0]?.balance).toBe(3);
  });
});

describe("journal injection lifecycle", () => {
  beforeEach(() => localStorage.clear());
  it("creates, replaces, transfers, deletes, and restores exactly one movement per ID", async () => {
    const { result, unmount } = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.restoreSnapshot({
        records: [],
        purchases: [purchase("a"), purchase("b")],
        reminder: null,
        stockAdjust: 9,
        settings: { showMomo: true, timezone: "Asia/Seoul" },
      }),
    );
    const balances = () => result.current.inventory.lots.map((l) => l.balance);
    expect(result.current.stockNeedsReview).toBe(true);
    expect(balances()).toEqual([4, 4]); // legacy global adjustment is never assigned automatically
    act(() => result.current.saveRecord(injection()));
    expect(balances()).toEqual([3, 4]);
    act(() => result.current.saveRecord({ ...injection(), site: "복부 왼쪽" }));
    expect(balances()).toEqual([3, 4]);
    act(() => result.current.saveRecord(injection("i", "b")));
    expect(balances()).toEqual([4, 3]);
    act(() => result.current.deleteRecord("i"));
    expect(balances()).toEqual([4, 4]);
    act(() => result.current.restoreRecord(injection("i", "b")));
    expect(balances()).toEqual([4, 3]);
    act(() => result.current.saveRecord({ ...injection("i", "b"), usedStock: false }));
    expect(balances()).toEqual([4, 4]);
    act(() => result.current.setStock(2, "a"));
    expect(balances()).toEqual([2, 4]);
    expect(result.current.stockAdjust).toBe(9);
    act(() => result.current.confirmLegacyAdjustment());
    expect(result.current.stockNeedsReview).toBe(false);
    expect(result.current.stockAdjust).toBe(9);
    const persisted = JSON.parse(localStorage.getItem("mds.journal.v1")!);
    expect(persisted.settings.stockAdjustments).toEqual({
      a: { identity: JSON.stringify(["M", "single", null]), delta: -2 },
    });
    unmount();
    const reloaded = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(reloaded.result.current.ready).toBe(true));
    expect(reloaded.result.current.inventory.lots.map((l) => l.balance)).toEqual([2, 4]);
    expect(reloaded.result.current.records[0]).toMatchObject({
      stockPurchaseId: "b",
      usedStock: false,
    });
    reloaded.unmount();
  });
});

describe("Momo durable batch", () => {
  beforeEach(() => localStorage.clear());
  it("retains state on storage failure and retries with the same IDs exactly once", async () => {
    const { result, unmount } = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const r = {
      ...injection("momo-batch"),
      usedStock: false,
      evidence: {
        method: "text" as const,
        text: "주사",
        quote: "주사",
        photos: [],
        proposed: {},
        confirmed: {},
      },
    };
    const before = result.current.records.length;
    const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => act(() => result.current.saveMomoBatch([r], []))).toThrow("quota");
    expect(result.current.records).toHaveLength(before);
    fail.mockRestore();
    act(() => {
      result.current.saveMomoBatch([r], []);
      result.current.saveMomoBatch([r], []);
    });
    expect(result.current.records.filter((x) => x.id === r.id)).toHaveLength(1);
    unmount();
    const reload = renderHook(() => useJournal(), { wrapper: JournalProvider });
    await waitFor(() => expect(reload.result.current.ready).toBe(true));
    expect(reload.result.current.records.find((x) => x.id === r.id)?.evidence).toEqual(r.evidence);
    reload.unmount();
  });
});

it("keeps locally saved entries after cloud failure and retries the same IDs", async () => {
  localStorage.clear();
  const cloud = {
    records: [],
    purchases: [],
    reminder: null,
    stockAdjust: 0,
    settings: { showMomo: true, timezone: "Asia/Seoul" },
  };
  const auth = vi
    .spyOn(supabase.auth, "getUser")
    .mockResolvedValue({ data: { user: { id: "test-user", email: null } }, error: null } as never);
  vi.mocked(loadCloud).mockResolvedValue(cloud);
  vi.mocked(pushDiff).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  try {
    await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
    act(() =>
      hook.result.current.saveMomoBatch([{ ...injection("cloud-retry"), usedStock: false }], []),
    );
    await waitFor(() => expect(hook.result.current.sync).toBe("error"), { timeout: 3000 });
    expect(hook.result.current.records.filter((r) => r.id === "cloud-retry")).toHaveLength(1);
    act(() => hook.result.current.retrySync());
    await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
    expect(hook.result.current.records.filter((r) => r.id === "cloud-retry")).toHaveLength(1);
    expect(vi.mocked(pushDiff)).toHaveBeenCalledTimes(2);
  } finally {
    hook.unmount();
    auth.mockRestore();
    log.mockRestore();
    vi.mocked(pushDiff).mockReset();
    vi.mocked(loadCloud).mockReset();
  }
});
