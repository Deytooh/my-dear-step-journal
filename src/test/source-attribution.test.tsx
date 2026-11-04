import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidateToDraft, draftToEntry } from "@/lib/momo-drafts";
import { type MomoCandidate } from "@/lib/momo-schema";
import { isRecoveredDrafts } from "@/lib/momo-review";
import { validateSnapshot } from "@/lib/snapshot";
import { SourceEvidence } from "@/components/app/SourceEvidence";
import { emptyMeal } from "@/lib/meals";
import { fmtTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { Evidence } from "@/lib/journal";
vi.mock("@/lib/journal", () => ({ useJournal: () => ({ user: null, tz: "Asia/Seoul" }) }));
vi.mock("@/lib/cloud-sync", () => ({ photoUrl: vi.fn().mockResolvedValue(null) }));
afterEach(cleanup);
const today = "2026-11-04";
const photos = ["data:image/png;base64,YQ==", "data:image/png;base64,Yg=="];
const input = { method: "mixed" as const, text: "Lunch was rice.", photos };
const make = (indices?: number[], quote: string | null = null, type = "meal") => {
  const candidate = {
    type,
    date: today,
    quote,
    photoIndices: indices,
    note: "Memory",
    meal: { ...emptyMeal(), title: "Lunch" },
  } as MomoCandidate;
  return candidateToDraft(candidate, "test", today, input);
};
const entry = (draft: ReturnType<typeof make>) => {
  const result = draftToEntry(draft, draft.key, "Asia/Seoul", today);
  if (!("record" in result)) throw new Error("invalid record");
  return result.record;
};
const snapshot = (record: ReturnType<typeof entry>) => ({
  records: [record],
  purchases: [],
  reminder: null,
  stockAdjust: 0,
  settings: { showMomo: true, timezone: "Asia/Seoul" },
});

describe("Momo explicit source attribution", () => {
  it.each([undefined, [], [3], [-1], [0.5]].map((indices) => [indices]))(
    "keeps unlinked originals as context for %j",
    (indices) => {
      const draft = make(indices);
      expect(draft.on).toBe(true);
      expect(draft.evidence).toMatchObject({
        photos,
        text: input.text,
        attribution: { status: "unclear", linkedPhotoIndices: [] },
      });
      const saved = entry(draft);
      expect(saved.type === "meal" && saved.meal.photoRefs).toEqual([]);
      expect(saved.evidence?.photos).toEqual(photos);
      expect(isRecoveredDrafts(JSON.parse(JSON.stringify([draft])))).toBe(true);
      expect(
        validateSnapshot(JSON.parse(JSON.stringify(snapshot(saved)))).records[0]?.evidence,
      ).toEqual(saved.evidence);
    },
  );
  it("links only valid unique indices while retaining the other original photo", () => {
    const draft = make([1, 1, 4, -1]);
    expect(draft.evidence?.attribution).toEqual({ status: "linked", linkedPhotoIndices: [1] });
    const saved = entry(draft);
    expect(saved.type === "meal" && saved.meal.photoRefs).toEqual([photos[1]]);
    expect(saved.evidence?.photos).toEqual(photos);
  });
  it.each(["Invented quote", " ", ""])("does not present invalid quote %j as support", (quote) => {
    const draft = make(undefined, quote);
    expect(draft.quote).toBeNull();
    expect(draft.evidence?.quote).toBeNull();
    expect(draft.evidence?.attribution?.status).toBe("unclear");
  });
  it("accepts an exact excerpt without implying the photos support it", () => {
    const draft = make(undefined, "rice");
    expect(draft.evidence?.attribution?.status).toBe("linked");
    expect(draft.evidence?.quote).toBe("rice");
    const saved = entry(draft);
    expect(saved.type === "meal" && saved.meal.photoRefs).toEqual([]);
  });
  it("uses only linked photos for a memory cover and keeps legacy behavior", () => {
    expect(entry(make(undefined, null, "memory"))).toMatchObject({ photo: null });
    expect(entry(make([1], null, "memory"))).toMatchObject({ photo: photos[1] });
    const legacy = make(undefined, null, "memory");
    delete legacy.evidence!.attribution;
    expect(entry(legacy)).toMatchObject({ photo: photos[0] });
  });
  it("rejects invalid persisted attribution without dropping valid context sources", () => {
    const draft = make([0]);
    draft.evidence!.attribution!.linkedPhotoIndices = [2];
    expect(isRecoveredDrafts([draft])).toBe(false);
    expect(() => validateSnapshot(snapshot(entry(draft)))).toThrow();
  });
});

const analysis = {
  model: "unknown-future-model",
  promptVersion: "journal-future",
  schemaVersion: 99,
  analyzedAt: "2026-11-04T00:00:00.000Z",
};
const open = () =>
  fireEvent.click(screen.getByText(t("momo.source") + " · " + t("evidence.mixed")));
it("renders linked/context labels and requested model metadata after save/reload", () => {
  const draft = make([1]);
  draft.evidence!.analysis = analysis;
  const saved = validateSnapshot(JSON.parse(JSON.stringify(snapshot(entry(draft))))).records[0]!;
  render(<SourceEvidence evidence={saved.evidence!} />);
  open();
  expect(screen.getByText(t("evidence.linkedPhotos"))).toBeVisible();
  expect(screen.getByText(t("evidence.contextPhotos"))).toBeVisible();
  expect(screen.getByText(t("evidence.requestedModel") + ":")).toBeVisible();
  expect(screen.getByText(analysis.model)).toBeVisible();
  expect(screen.getByText(analysis.promptVersion)).toBeVisible();
  expect(
    screen.getByText("2026-11-04 · " + fmtTime(analysis.analyzedAt, "Asia/Seoul")),
  ).toBeVisible();
});
it("shows uncertainty and context with the original note", () => {
  render(<SourceEvidence evidence={make().evidence!} />);
  open();
  expect(screen.getByText(t("evidence.sourceUnclearHint"))).toBeVisible();
  expect(screen.getByText(t("evidence.contextPhotos"))).toBeVisible();
  expect(screen.queryByText(t("evidence.linkedPhotos"))).toBeNull();
  expect(screen.getByText(input.text)).toBeVisible();
});
it.each([null, "legacy", 42, { model: {}, promptVersion: [], analyzedAt: "nonsense" }])(
  "safely handles legacy metadata %j",
  (metadata) => {
    const evidence = { ...make().evidence!, analysis: metadata } as unknown as Evidence;
    render(<SourceEvidence evidence={evidence} />);
    open();
    expect(screen.queryByText(t("evidence.requestedModel") + ":")).toBeNull();
  },
);
it("omits analysis details for manual entries and preserves their original sources", () => {
  const evidence: Evidence = { ...make().evidence!, method: "manual", analysis };
  delete evidence.attribution;
  render(<SourceEvidence evidence={evidence} />);
  fireEvent.click(screen.getByText(t("momo.source") + " · " + t("evidence.manual")));
  expect(screen.queryByText(analysis.model)).toBeNull();
  expect(screen.getAllByRole("button", { name: /1|2/ })).toHaveLength(2);
});
