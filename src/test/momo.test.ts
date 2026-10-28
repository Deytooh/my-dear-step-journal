import { describe, expect, it } from "vitest";
import { candidateToRecord } from "@/components/app/MomoSheet";

const tz = "Asia/Seoul";
describe("Momo candidate → record", () => {
  it("rejects weights outside 20–400 kg", () => {
    expect(candidateToRecord({ type: "weight", value: 5 }, "a", tz, "2026-10-28")).toBeNull();
  });
  it("keeps a valid weight and defaults the date to today", () => {
    const r = candidateToRecord({ type: "weight", value: 78.2 }, "a", tz, "2026-10-28");
    expect(r).toMatchObject({ type: "weight", value: 78.2, localDate: "2026-10-28", precision: "date_only" });
  });
  it("marks records with a stated time as exact", () => {
    const r = candidateToRecord({ type: "injection", doseValue: 2.5, doseUnit: "mg", date: "2026-10-27", time: "20:00" }, "b", tz, "2026-10-28");
    expect(r).toMatchObject({ precision: "exact", localDate: "2026-10-27" });
  });
  it("drops measurements with no values", () => {
    expect(candidateToRecord({ type: "measure" }, "c", tz, "2026-10-28")).toBeNull();
  });
});
