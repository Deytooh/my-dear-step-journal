import { beforeEach, expect, it } from "vitest";
import { claimMomoHandoff, dismissMomoHandoff, prepareMomoHandoff } from "@/lib/momo-handoff";
const now = 1_000_000;
const input = {
  text: "Fictional input",
  images: ["data:image/jpeg;base64,YWJj"],
  usedVoice: true,
  drafts: [{ type: "weight" }],
  consent: true,
  voiceSession: { active: true },
};
beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("mds.momo.draft.guest", JSON.stringify(input));
});
it("never offers guest input without an intentional sign-in handoff", () => {
  expect(claimMomoHandoff(sessionStorage, "A", now)).toBeNull();
});
it("binds to one returning account and copies raw input only", () => {
  prepareMomoHandoff(sessionStorage, true, now);
  expect(claimMomoHandoff(sessionStorage, "A", now)).toEqual({
    text: input.text,
    images: input.images,
    usedVoice: true,
  });
  expect(claimMomoHandoff(sessionStorage, "B", now)).toBeNull();
  expect(claimMomoHandoff(sessionStorage, "guest", now)).toBeNull();
});
it("expires after 30 minutes and dismisses without deleting the original guest draft", () => {
  prepareMomoHandoff(sessionStorage, true, now);
  expect(claimMomoHandoff(sessionStorage, "A", now + 30 * 60_000)).toBeNull();
  prepareMomoHandoff(sessionStorage, true, now);
  dismissMomoHandoff(sessionStorage);
  expect(claimMomoHandoff(sessionStorage, "A", now)).toBeNull();
  expect(JSON.parse(sessionStorage.getItem("mds.momo.draft.guest")!)).toEqual(input);
});
it("does not pass through external URLs, private photo references or malformed data", () => {
  for (const images of [
    ["https://example.com/photo.jpg"],
    ["localphoto:another-owner:abc"],
    [12],
  ]) {
    sessionStorage.setItem("mds.momo.draft.guest", JSON.stringify({ ...input, images }));
    prepareMomoHandoff(sessionStorage, true, now);
    expect(claimMomoHandoff(sessionStorage, "A", now)).toBeNull();
  }
  sessionStorage.setItem("mds.momo.draft.guest", "invalid JSON");
  expect(claimMomoHandoff(sessionStorage, "A", now)).toBeNull();
});
it("fails safely when browser storage is unavailable", () => {
  const unavailable = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  };
  expect(() => prepareMomoHandoff(unavailable, true, now)).not.toThrow();
  expect(claimMomoHandoff(unavailable, "A", now)).toBeNull();
  expect(() => dismissMomoHandoff(unavailable)).not.toThrow();
});

it("offers a bounded long draft with three photos after intentional sign-in without copying AI state", () => {
  const capture = {
    ...input,
    text: "\n".repeat(100_000),
    images: Array.from({ length: 3 }, () => "data:image/png;base64," + "a".repeat(999_960)),
  };
  const raw = JSON.stringify(capture);
  expect(raw.length).toBeGreaterThan(3_100_000);
  sessionStorage.setItem("mds.momo.draft.guest", raw);
  prepareMomoHandoff(sessionStorage, true, now);
  const recovered = claimMomoHandoff(sessionStorage, "A", now);
  expect(recovered?.text === capture.text).toBe(true);
  expect(recovered?.images.map((image) => image.length)).toEqual(
    capture.images.map((image) => image.length),
  );
  expect(Object.keys(recovered ?? {})).toEqual(["text", "images", "usedVoice"]);
  expect(claimMomoHandoff(sessionStorage, "B", now)).toBeNull();
});

it("retains strict text, image and photo-count limits within the larger JSON envelope", () => {
  for (const invalid of [
    { ...input, text: "x".repeat(100_001) },
    { ...input, images: ["data:image/png;base64," + "a".repeat(1_000_000)] },
    { ...input, images: Array.from({ length: 4 }, () => input.images[0]) },
  ]) {
    sessionStorage.setItem("mds.momo.draft.guest", JSON.stringify(invalid));
    prepareMomoHandoff(sessionStorage, true, now);
    expect(claimMomoHandoff(sessionStorage, "A", now)).toBeNull();
  }
});
