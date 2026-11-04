import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  JournalProvider,
  useJournal,
  type JournalSnapshot,
  type MemoryRec,
  type Purchase,
} from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";
import { validateSnapshot } from "@/lib/snapshot";
import { copyGuestMedia } from "@/lib/media";
vi.mock("@/lib/media", () => ({
  copyGuestMedia: vi.fn(async (value) => value),
  setMediaOwner: vi.fn(),
}));

const auth = vi.hoisted(() => ({ listener: (_event: string, _session: unknown) => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: (cb: typeof auth.listener) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
vi.mock("@/lib/cloud-sync", () => ({
  loadCloud: vi.fn(),
  pushDiff: vi.fn(),
  clearPhotoCache: vi.fn(),
}));
const key = "mds.journal.v1";
const accountKey = `${key}.user.fictional-account`;
const blank = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: false, timezone: "UTC" },
});
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  note: id,
  localDate: "2026-11-04",
  precision: "date_only",
  at: null,
  source: "manual_text",
  createdAt: "2026-11-04T00:00:00Z",
});
const lot = (id: string): Purchase => ({
  id,
  localDate: "2026-11-04",
  amount: 0,
  currency: "USD",
  doses: 4,
  medication: "Fictional medication",
  stockUnit: "single",
  addsStock: true,
});
const correction = (delta: number) => ({
  identity: JSON.stringify(["Fictional medication", "single", null]),
  delta,
});
const sign = (id: string | null) =>
  act(() => auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null));
async function start(guest: JournalSnapshot, account: JournalSnapshot) {
  validateSnapshot(guest);
  validateSnapshot(account);
  localStorage.setItem(key, JSON.stringify(guest));
  localStorage.setItem(accountKey, JSON.stringify(account));
  vi.mocked(loadCloud).mockResolvedValue(account);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("fictional-account");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  return hook;
}
async function expectRefusal(hook: { result: { current: ReturnType<typeof useJournal> } }) {
  const before = hook.result.current.snapshot();
  const durable = localStorage.getItem(accountKey);
  const guest = localStorage.getItem(key);
  await act(async () => {
    await expect(hook.result.current.importGuest()).rejects.toThrow("guest_stock_conflict");
  });
  expect(hook.result.current.snapshot()).toEqual(before);
  expect(localStorage.getItem(accountKey)).toBe(durable);
  expect(localStorage.getItem(key)).toBe(guest);
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(copyGuestMedia)
    .mockReset()
    .mockImplementation(async (value) => value);
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["guest-record", "guest-purchase"])(
  "keeps globally unique IDs when a %s collides with the other account collection",
  async (direction) => {
    const guest = blank(),
      account = blank();
    if (direction === "guest-record") {
      guest.records = [memory("collision")];
      account.purchases = [lot("collision")];
    } else {
      guest.purchases = [lot("collision")];
      account.records = [memory("collision")];
    }
    const hook = await start(guest, account);
    await act(async () => hook.result.current.importGuest());
    expect(() => validateSnapshot(JSON.parse(localStorage.getItem(accountKey)!))).not.toThrow();
  },
);

it("does not activate a guest correction on an existing account purchase whose import was skipped", async () => {
  const guest = {
    ...blank(),
    purchases: [lot("shared-lot")],
    settings: { ...blank().settings, stockAdjustments: { "shared-lot": correction(-3) } },
  };
  const hook = await start(guest, { ...blank(), purchases: [lot("shared-lot")] });
  expect(hook.result.current.stock).toBe(4);
  await expectRefusal(hook);
  expect(hook.result.current.stock).toBe(4);
});

it("filters demo purchase corrections along with their demo purchases", async () => {
  const guest = {
    ...blank(),
    records: [memory("real-memory")],
    purchases: [{ ...lot("demo-lot"), demo: true }],
    settings: { ...blank().settings, stockAdjustments: { "demo-lot": correction(-3) } },
  };
  const hook = await start(guest, blank());
  await act(async () => hook.result.current.importGuest());
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["real-memory"]);
  expect(hook.result.current.purchases).toEqual([]);
  expect(hook.result.current.inventory.unresolvedAdjustments).toEqual([]);
  expect(hook.result.current.stockNeedsReview).toBe(false);
});

it("does not silently acknowledge a newly imported legacy correction using the account's older confirmation", async () => {
  const guest = { ...blank(), records: [memory("real-memory")], stockAdjust: -2 };
  const hook = await start(guest, {
    ...blank(),
    purchases: [lot("account-lot")],
    settings: { ...blank().settings, legacyAdjustmentConfirmed: true },
  });
  await expectRefusal(hook);
  expect(
    hook.result.current.snapshot().stockAdjust === 0 || hook.result.current.stockNeedsReview,
  ).toBe(true);
});

it("refuses mismatched corrections without changing existing account records or corrections", async () => {
  const guest = {
    ...blank(),
    records: [memory("new-memory")],
    purchases: [lot("shared-lot")],
    settings: { ...blank().settings, stockAdjustments: { "shared-lot": correction(-3) } },
  };
  const account = {
    ...blank(),
    purchases: [lot("shared-lot")],
    settings: { ...blank().settings, stockAdjustments: { "shared-lot": correction(-1) } },
  };
  const hook = await start(guest, account);
  await expectRefusal(hook);
  expect(hook.result.current.stock).toBe(3);
  expect(hook.result.current.records).toHaveLength(0);
});

it("does not activate an orphan account correction merely by importing a matching new lot", async () => {
  const guest = { ...blank(), purchases: [lot("orphan-lot")] };
  const account = {
    ...blank(),
    settings: { ...blank().settings, stockAdjustments: { "orphan-lot": correction(-3) } },
  };
  const hook = await start(guest, account);
  expect(hook.result.current.inventory.unresolvedAdjustments).toEqual(["orphan-lot"]);
  await expectRefusal(hook);
  expect(hook.result.current.purchases).toEqual([]);
  expect(hook.result.current.inventory.unresolvedAdjustments).toEqual(["orphan-lot"]);
});

it("imports a new lot with its correction durably and repeats without duplication", async () => {
  const guest = {
    ...blank(),
    records: [memory("new-memory")],
    purchases: [lot("new-lot")],
    settings: { ...blank().settings, stockAdjustments: { "new-lot": correction(-3) } },
  };
  const account = { ...blank(), records: [memory("account-memory")] };
  const hook = await start(guest, account);
  const source = localStorage.getItem(key);
  await act(async () => hook.result.current.importGuest());
  expect(hook.result.current.stock).toBe(1);
  expect(hook.result.current.stockNeedsReview).toBe(false);
  const once = hook.result.current.snapshot();
  await act(async () => hook.result.current.importGuest());
  expect(hook.result.current.snapshot()).toEqual(once);
  expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(once);
  expect(localStorage.getItem(key)).toBe(source);
  expect(hook.result.current.records).toHaveLength(2);
});

it("refuses genuinely unresolved guest corrections instead of discarding them with demos", async () => {
  const guest = {
    ...blank(),
    records: [memory("real-memory")],
    settings: { ...blank().settings, stockAdjustments: { "missing-lot": correction(-3) } },
  };
  const hook = await start(guest, blank());
  await expectRefusal(hook);
  expect(copyGuestMedia).not.toHaveBeenCalled();
});

it("does not import anything after account ownership changes during media copying", async () => {
  const hook = await start({ ...blank(), records: [memory("guest-memory")] }, blank());
  let finish!: () => void;
  vi.mocked(copyGuestMedia).mockImplementationOnce(
    (value) =>
      new Promise((resolve) => {
        finish = () => resolve(value);
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.importGuest();
  });
  sign(null);
  const source = localStorage.getItem(key);
  await act(async () => {
    finish();
    await pending;
  });
  expect(hook.result.current.user).toBeNull();
  expect(localStorage.getItem(key)).toBe(source);
  expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(blank());
});

it("rechecks account corrections added while guest media is being copied", async () => {
  const hook = await start({ ...blank(), purchases: [lot("new-lot")] }, blank());
  let finish!: () => void;
  vi.mocked(copyGuestMedia).mockImplementationOnce(
    (value) =>
      new Promise((resolve) => {
        finish = () => resolve(value);
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.importGuest();
  });
  act(() => hook.result.current.setSetting("stockAdjustments", { "new-lot": correction(-3) }));
  const before = hook.result.current.snapshot();
  await act(async () => {
    finish();
    await expect(pending).rejects.toThrow("guest_stock_conflict");
  });
  expect(hook.result.current.snapshot()).toEqual(before);
  expect(JSON.parse(localStorage.getItem(accountKey)!)).toEqual(before);
});
