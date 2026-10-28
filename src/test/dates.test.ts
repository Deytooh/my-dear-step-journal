import { describe, expect, it } from "vitest";
import { instantFromLocal, localDateOf, monthGrid } from "@/lib/dates";

describe("dates", () => {
  it("8 PM Seoul is 11:00 UTC", () => {
    expect(instantFromLocal("2026-10-30", "20:00", "Asia/Seoul")).toBe("2026-10-30T11:00:00.000Z");
  });
  it("late-night UTC instant lands on next Seoul day", () => {
    expect(localDateOf("2026-10-27T16:30:00Z", "Asia/Seoul")).toBe("2026-10-28");
  });
  it("October 2026 grid starts Monday Sep 28", () => {
    const g = monthGrid(2026, 10);
    expect(g[0].date).toBe("2026-09-28");
    expect(g.length).toBe(35);
  });
});
