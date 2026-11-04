import { describe, expect, it } from "vitest";
import { instantFromLocal, localDateOf, monthGrid, timeOf, exactLocalInstant } from "@/lib/dates";

describe("dates", () => {
  it("8 PM Seoul is 11:00 UTC", () => {
    expect(instantFromLocal("2026-10-30", "20:00", "Asia/Seoul")).toBe("2026-10-30T11:00:00.000Z");
  });
  it("late-night UTC instant lands on next Seoul day", () => {
    expect(localDateOf("2026-10-27T16:30:00Z", "Asia/Seoul")).toBe("2026-10-28");
  });
  it("October 2026 grid starts Monday Sep 28", () => {
    const g = monthGrid(2026, 10);
    expect(g[0]?.date).toBe("2026-09-28");
    expect(g.length).toBe(35);
  });
});

describe("local clocks across offset changes", () => {
  it.each([
    ["2026-03-08", "03:30", "America/New_York", "2026-03-08T07:30:00.000Z"],
    ["2026-11-01", "02:30", "America/New_York", "2026-11-01T07:30:00.000Z"],
    ["2026-03-29", "01:30", "Europe/Paris", "2026-03-29T00:30:00.000Z"],
    ["2026-10-25", "03:30", "Europe/Paris", "2026-10-25T02:30:00.000Z"],
    ["2026-10-04", "01:45", "Australia/Lord_Howe", "2026-10-03T15:15:00.000Z"],
    ["2026-10-04", "02:45", "Australia/Lord_Howe", "2026-10-03T15:45:00.000Z"],
    ["2026-11-04", "00:15", "Pacific/Kiritimati", "2026-11-03T10:15:00.000Z"],
  ])("preserves %s %s in %s", (day, time, tz, expected) => {
    const instant = instantFromLocal(day, time, tz);
    expect(instant).toBe(expected);
    expect(localDateOf(instant, tz)).toBe(day);
    expect(timeOf(instant, tz)).toBe(time);
  });

  it.each([
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-10-25", "02:30", "Europe/Paris", "2026-10-25T00:30:00.000Z"],
  ])("selects the earlier occurrence of %s %s in %s", (day, time, tz, expected) => {
    expect(instantFromLocal(day, time, tz)).toBe(expected);
  });

  it.each([
    ["2026-03-08", "02:30", "America/New_York"],
    ["2026-03-29", "02:30", "Europe/Paris"],
    ["2026-10-04", "02:15", "Australia/Lord_Howe"],
    ["2011-12-30", "12:00", "Pacific/Apia"],
  ])("rejects nonexistent %s %s in %s", (day, time, tz) => {
    expect(() => instantFromLocal(day, time, tz)).toThrow("nonexistent_local_time");
    expect(exactLocalInstant(day, time, tz)).toBeNull();
  });
});
