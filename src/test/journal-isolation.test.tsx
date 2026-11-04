import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { JournalProvider, useJournal, type JournalSnapshot, type MemoryRec } from "@/lib/journal";
import { loadCloud, pushDiff } from "@/lib/cloud-sync";
import { sanitizeCandidates } from "@/lib/momo-schema";
import { candidateToDraft, draftToEntry } from "@/lib/momo-drafts";
import { findRecords, findPurchases } from "@/lib/record-search";
import { purchaseMoneyFacts } from "@/lib/purchase-money";
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
const blank = (): JournalSnapshot => ({
  records: [],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});
const memory = (id: string): MemoryRec => ({
  id,
  type: "memory",
  note: id,
  localDate: "2026-10-30",
  precision: "date_only",
  at: null,
  source: "manual_text",
  createdAt: "2026-10-30T00:00:00Z",
});
const sign = (id: string | null) =>
  act(() =>
    auth.listener(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id, email: null } } : null),
  );
beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadCloud).mockReset();
  vi.mocked(pushDiff).mockReset().mockResolvedValue([]);
});
it("never imports guest or demo data into a new account automatically", async () => {
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({ ...blank(), records: [memory("guest"), { ...memory("demo"), demo: true }] }),
  );
  vi.mocked(loadCloud).mockResolvedValue(null);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.records).toHaveLength(2));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.records).toHaveLength(0);
  await act(async () => hook.result.current.importGuest());
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["guest"]);
  sign(null);
  await waitFor(() => expect(hook.result.current.user).toBeNull());
  expect(hook.result.current.records).toHaveLength(2);
  sign("B");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.records).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records).toHaveLength(1);
  hook.unmount();
});
it("ignores a late account load and preserves unsynced work in its original namespace", async () => {
  let finishA!: (s: JournalSnapshot) => void;
  vi.mocked(loadCloud)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        }),
    )
    .mockResolvedValue({ ...blank(), records: [memory("B-only")] });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(loadCloud).toHaveBeenCalledTimes(1));
  act(() => hook.result.current.saveRecord(memory("A-unsynced")));
  sign("B");
  await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("B-only"));
  await act(async () => finishA({ ...blank(), records: [memory("A-late")] }));
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["B-only"]);
  expect(JSON.parse(localStorage.getItem("mds.journal.v1.user.A")!).records[0].id).toBe(
    "A-unsynced",
  );
  hook.unmount();
});
it("serializes uploads so a late snapshot cannot overwrite a newer correction", async () => {
  vi.mocked(loadCloud).mockResolvedValue(blank());
  let finish!: (rows: MemoryRec[]) => void;
  vi.mocked(pushDiff)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([]);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  const original = memory("edit");
  act(() => hook.result.current.saveRecord(original));
  await waitFor(() => expect(pushDiff).toHaveBeenCalledTimes(1), { timeout: 3000 });
  act(() => hook.result.current.saveRecord({ ...original, note: "new correction" }));
  await act(async () => finish([{ ...original, photo: "storage:A/photo" }]));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 4000 });
  expect(hook.result.current.records[0]).toMatchObject({ note: "new correction" });
  expect(vi.mocked(pushDiff).mock.calls.at(-1)![2].records[0]).toMatchObject({
    note: "new correction",
  });
  hook.unmount();
});
it("targeted Undo retains later entries and restores only its prompt marker", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const before = hook.result.current.snapshot();
  act(() => hook.result.current.respondPrompt("memory", "2026-10-30", memory("first")));
  const undo = hook.result.current.undoFor(before);
  act(() => hook.result.current.saveRecord(memory("later")));
  act(undo);
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["later"]);
  expect(hook.result.current.settings.prompts?.answered?.memory).toBeUndefined();
  hook.unmount();
});

it("deletes an entry remotely even when deletion happened during its first upload", async () => {
  vi.mocked(loadCloud).mockResolvedValue(blank());
  let finish!: (rows: MemoryRec[]) => void;
  vi.mocked(pushDiff)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([]);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  act(() => hook.result.current.saveRecord(memory("delete-during-upload")));
  await waitFor(() => expect(pushDiff).toHaveBeenCalledTimes(1), { timeout: 3000 });
  act(() => hook.result.current.deleteRecord("delete-during-upload"));
  await act(async () => finish([]));
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 4000 });
  const last = vi.mocked(pushDiff).mock.calls.at(-1)!;
  expect(last[1].records.map((r) => r.id)).toContain("delete-during-upload");
  expect(last[2].records).toHaveLength(0);
  hook.unmount();
});

it("never treats a failed local cache write during cloud load as an instruction to delete remote data", async () => {
  vi.mocked(loadCloud).mockResolvedValue({ ...blank(), records: [memory("remote-safe")] });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("error"));
  storage.mockRestore();
  act(() => hook.result.current.retrySync());
  await waitFor(() => expect(hook.result.current.records[0]?.id).toBe("remote-safe"));
  expect(pushDiff).not.toHaveBeenCalled();
  hook.unmount();
});
it("keeps an invalid local snapshot untouched instead of overwriting it with an empty journal", async () => {
  localStorage.setItem("mds.journal.v1", "{damaged");
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.storageBlocked).toBe(true));
  expect(() => act(() => hook.result.current.saveRecord(memory("new")))).toThrow();
  expect(localStorage.getItem("mds.journal.v1")).toBe("{damaged");
  hook.unmount();
});

it("keeps an explicitly chosen guest language for a new account without importing journal data or AI consent", async () => {
  const guest = {
    ...blank(),
    records: [memory("private-guest")],
    stockAdjust: 7,
    settings: {
      ...blank().settings,
      locale: "en",
      trackingInterests: ["weight"],
      prompts: { aiConsent: true },
    },
  };
  localStorage.setItem("mds.journal.v1", JSON.stringify(guest));
  vi.mocked(loadCloud).mockResolvedValue(null);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("new-account");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.settings.locale).toBe("en");
  expect(hook.result.current.records).toEqual([]);
  expect(hook.result.current.purchases).toEqual([]);
  expect(hook.result.current.stockAdjust).toBe(0);
  expect(hook.result.current.settings.prompts?.aiConsent).toBeUndefined();
  expect(hook.result.current.settings.trackingInterests).toBeUndefined();
  expect(JSON.parse(localStorage.getItem("mds.journal.v1")!)).toEqual(guest);
  hook.unmount();
});
it("uses an existing cloud language instead of replacing it with the guest choice", async () => {
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({ ...blank(), settings: { ...blank().settings, locale: "en" } }),
  );
  vi.mocked(loadCloud).mockResolvedValue({
    ...blank(),
    records: [memory("cloud-kept")],
    settings: { ...blank().settings, locale: "fr" },
  });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("existing-cloud");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"));
  expect(hook.result.current.settings.locale).toBe("fr");
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["cloud-kept"]);
  expect(pushDiff).not.toHaveBeenCalled();
  hook.unmount();
});
it("adopts only the interface language when cloud records have no explicit language preference", async () => {
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({
      ...blank(),
      settings: { ...blank().settings, locale: "en", prompts: { aiConsent: true } },
    }),
  );
  vi.mocked(loadCloud).mockResolvedValue({ ...blank(), records: [memory("cloud-kept")] });
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("cloud-no-language");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.settings.locale).toBe("en");
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["cloud-kept"]);
  expect(hook.result.current.settings.prompts?.aiConsent).toBeUndefined();
  const last = vi.mocked(pushDiff).mock.calls.at(-1)!;
  expect(last[1].records).toEqual(last[2].records);
  hook.unmount();
});
it("does not replace an existing local account language", async () => {
  localStorage.setItem(
    "mds.journal.v1",
    JSON.stringify({ ...blank(), settings: { ...blank().settings, locale: "fr" } }),
  );
  localStorage.setItem(
    "mds.journal.v1.user.existing",
    JSON.stringify({
      ...blank(),
      records: [memory("local-kept")],
      settings: { ...blank().settings, locale: "ko" },
    }),
  );
  vi.mocked(loadCloud).mockResolvedValue(null);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("existing");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.settings.locale).toBe("ko");
  expect(hook.result.current.records.map((r) => r.id)).toEqual(["local-kept"]);
  hook.unmount();
});
it("does not copy language directly from one account to another", async () => {
  vi.mocked(loadCloud).mockResolvedValue(null);
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  sign("A");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  act(() => hook.result.current.setSetting("locale", "en"));
  sign("B");
  await waitFor(() => expect(hook.result.current.sync).toBe("synced"), { timeout: 3000 });
  expect(hook.result.current.settings.locale).toBeUndefined();
  hook.unmount();
});

it("persists a corrected confirmed multi-entry batch with source history through provider remount and search", async () => {
  const words = "Fictional day: 78.2kg, cafe walk, bought 2 items of Fictional medicine.";
  const day = "2026-11-04";
  const candidates = sanitizeCandidates(
    [
      { type: "weight", date: day, value: 78.2, quote: "78.2kg" },
      { type: "memory", date: day, note: "Cafe walk", quote: "cafe walk" },
      {
        type: "purchase",
        date: day,
        medication: "Fictional medicine",
        quantity: 2,
        quote: "bought 2 items of Fictional medicine",
      },
    ],
    words,
  );
  const entries = candidates.map((candidate, index) => {
    const draft = candidateToDraft(candidate, "fictional-batch-" + index, day, {
      method: "text",
      text: words,
      photos: [],
    });
    if (draft.type === "weight") draft.f["value"] = "78.3";
    return draftToEntry(draft, draft.key, "Asia/Seoul", day);
  });
  const records = entries.flatMap((entry) => ("record" in entry ? [entry.record] : []));
  const purchases = entries.flatMap((entry) => ("purchase" in entry ? [entry.purchase] : []));
  expect(entries.some((entry) => "error" in entry)).toBe(false);
  let hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.saveMomoBatch(records, purchases, null));
  act(() => hook.result.current.saveMomoBatch(records, purchases, null));
  expect(hook.result.current.records).toHaveLength(2);
  expect(hook.result.current.purchases).toHaveLength(1);
  hook.unmount();
  hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.storageBlocked).toBe(false);
  const weight = findRecords(hook.result.current.records, "78.3kg")[0];
  expect(weight).toMatchObject({
    type: "weight",
    value: 78.3,
    evidence: {
      text: words,
      quote: "78.2kg",
      proposed: { value: "78.2" },
      confirmed: { value: "78.3" },
    },
  });
  expect(findRecords(hook.result.current.records, "cafe walk")).toHaveLength(1);
  const saved = findPurchases(hook.result.current.purchases, "Fictional medicine")[0]!;
  expect(saved.stockUnit).toBeNull();
  expect(purchaseMoneyFacts(saved)).toEqual({ amount: null, currency: null });
  expect(hook.result.current.inventory.lots).toHaveLength(0);
  expect(hook.result.current.inventory.unresolvedPurchases).toHaveLength(1);
  expect(pushDiff).not.toHaveBeenCalled();
  hook.unmount();
});

it("does not report a batch as committed when local persistence fails and permits the same stable-ID retry", async () => {
  const hook = renderHook(() => useJournal(), { wrapper: JournalProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  const before = localStorage.getItem("mds.journal.v1");
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  try {
    expect(() =>
      act(() => hook.result.current.saveMomoBatch([memory("retry-batch")], [], null)),
    ).toThrow();
    expect(hook.result.current.records).toHaveLength(0);
    expect(localStorage.getItem("mds.journal.v1")).toBe(before);
  } finally {
    storage.mockRestore();
  }
  act(() => hook.result.current.saveMomoBatch([memory("retry-batch")], [], null));
  expect(hook.result.current.records.map((record) => record.id)).toEqual(["retry-batch"]);
  hook.unmount();
});
