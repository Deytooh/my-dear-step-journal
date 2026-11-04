import { describe, expect, it } from "vitest";
import { exactLocalInstant } from "@/lib/dates";

describe("resolving edited exact clocks", () => {
  it.each([
    ["2026-10-25", "02:30", "Europe/Paris", "2026-10-25T00:30:12.345Z"],
    ["2026-10-25", "02:30", "Europe/Paris", "2026-10-25T01:30:56.789Z"],
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:12.345Z"],
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T06:30:56.789Z"],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T14:45:12.345Z"],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T15:15:56.789Z"],
    ["2026-11-04", "10:15", "Asia/Seoul", "2026-11-04T01:15:43.210Z"],
    ["2026-11-04", "10:15", "Asia/Seoul", "2026-11-04T01:15:43.210123Z"],
  ])("retains the original instant for %s %s in %s", (day, time, tz, original) => {
    expect(exactLocalInstant(day, time, tz, original)).toBe(original);
  });

  it.each([
    ["2026-10-25", "02:31", "Europe/Paris", "2026-10-25T01:30:56.789Z", "2026-10-25T00:31:00.000Z"],
    ["2026-10-26", "02:30", "Europe/Paris", "2026-10-25T01:30:56.789Z", "2026-10-26T01:30:00.000Z"],
    [
      "2026-11-01",
      "01:31",
      "America/New_York",
      "2026-11-01T06:30:56.789Z",
      "2026-11-01T05:31:00.000Z",
    ],
    [
      "2026-04-05",
      "01:46",
      "Australia/Lord_Howe",
      "2026-04-04T15:15:56.789Z",
      "2026-04-04T14:46:00.000Z",
    ],
    ["2026-11-04", "10:16", "Asia/Seoul", "2026-11-04T01:15:43.210Z", "2026-11-04T01:16:00.000Z"],
  ])("resolves a changed date or minute for %s %s in %s", (day, time, tz, original, expected) => {
    expect(exactLocalInstant(day, time, tz, original)).toBe(expected);
  });

  it.each([
    ["2026-10-25", "02:30", "Europe/Paris", "2026-10-25T00:30:00.000Z"],
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"],
  ])(
    "still resolves new ambiguous clocks to the earlier occurrence in %s %s %s",
    (day, time, tz, expected) => {
      expect(exactLocalInstant(day, time, tz)).toBe(expected);
      expect(exactLocalInstant(day, time, tz, null)).toBe(expected);
    },
  );

  it("compares the original instant's actual date in the selected timezone", () => {
    const original = "2026-10-25T01:30:56.789Z";
    // A Paris record dated October 25 now displays 21:30 in New York, on October 24.
    // Keeping its stored October 25 date is a different wall clock, not an unchanged instant.
    expect(exactLocalInstant("2026-10-25", "21:30", "America/New_York", original)).toBe(
      "2026-10-26T01:30:00.000Z",
    );
    expect(exactLocalInstant("2026-10-24", "21:30", "America/New_York", original)).toBe(original);
    expect(exactLocalInstant("2026-10-25", "02:30", "UTC", original)).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });

  it.each([
    ["2026-03-08", "02:30", "America/New_York", "2026-03-07T07:30:56.789Z"],
    ["2026-03-29", "02:30", "Europe/Paris", "2026-03-28T01:30:56.789Z"],
    ["2026-10-04", "02:15", "Australia/Lord_Howe", "2026-10-02T15:45:56.789Z"],
    ["2011-12-30", "12:00", "Pacific/Apia", "2011-12-29T22:00:56.789Z"],
  ])("still rejects a changed date in a clock gap: %s %s %s", (day, time, tz, original) => {
    expect(exactLocalInstant(day, time, tz, original)).toBeNull();
  });

  it.each([
    ["2026-02-30", "10:15", "Asia/Seoul"],
    ["2026-11-04", "24:00", "Asia/Seoul"],
    ["2026-11-04", "10:15:43", "Asia/Seoul"],
    ["2026-11-04", "10:15", "invalid/zone"],
    ["", "10:15", "Asia/Seoul"],
  ])("does not bypass validation for %s %s %s", (day, time, tz) => {
    expect(exactLocalInstant(day, time, tz, "2026-11-04T01:15:43.210Z")).toBeNull();
  });

  it("does not preserve an invalid stored instant", () => {
    expect(exactLocalInstant("2026-11-04", "10:15", "Asia/Seoul", "invalid")).toBe(
      "2026-11-04T01:15:00.000Z",
    );
  });
});
