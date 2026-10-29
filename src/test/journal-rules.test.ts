import { describe, expect, it } from "vitest";
import { canDeduct, computeStock, type InjectionRec, type Purchase } from "@/lib/journal";
import { pickPrompts } from "@/lib/prompts";

const today = "2026-10-28";
const inj = (id: string, usedStock: boolean): InjectionRec => ({ id, type: "injection", medication: "M", doseValue: null, doseUnit: null, site: null, usedStock, stockPurchaseId: "p4", stockIdentity: JSON.stringify(["M", "single", null]),
  localDate: today, precision: "date_only", at: null, createdAt: "", source: "manual_text" });
const buy = (doses: number, addsStock?: boolean): Purchase => ({ id: "p" + doses, localDate: today, amount: 1000, currency: "KRW", doses, medication: "M", stockUnit: "single", ...(addsStock === undefined ? {} : { addsStock }) });

describe("stock", () => {
  it("an expense-only purchase leaves stock unchanged", () => {
    expect(computeStock([buy(4), buy(0, false)], [])).toBe(4);
  });
  it("editing an old injection does not deduct a second time", () => {
    const r = inj("a", true);
    const edited = { ...r, site: "복부 왼쪽" };
    expect(computeStock([buy(4)], [edited])).toBe(3);
  });
  it("pens are never deducted per injection", () => {
    expect(canDeduct("pen")).toBe(false);
    expect(canDeduct("single")).toBe(true);
  });
});

describe("daily questions", () => {
  it("shows at most three cards", () => {
    expect(pickPrompts([], {}, today)).toEqual(["feel", "water", "memory"]);
  });
  it("a skipped question stays hidden for the day", () => {
    expect(pickPrompts([], { done: { water: today } }, today)).not.toContain("water");
    expect(pickPrompts([], { done: { water: "2026-10-27" } }, today)).toContain("water");
  });
  it("hides the weight question once a weight is recorded today", () => {
    const w = { id: "w", type: "weight" as const, value: 70, unit: "kg" as const, localDate: today, precision: "date_only" as const, at: null, createdAt: "", source: "manual_text" as const };
    expect(pickPrompts([w], { done: { feel: today } }, today)).not.toContain("weight");
  });
  it("hiding the section shows nothing", () => {
    expect(pickPrompts([], { hidden: true }, today)).toEqual([]);
  });
});
