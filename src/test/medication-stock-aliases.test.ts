import { describe, expect, it } from "vitest";
import { sameCatalogMedication } from "@/lib/medications";

describe("stock choice medication aliases", () => {
  it.each([
    ["Mounjaro", "마운자로"],
    ["  MOUNJARO ", "마운자로"],
    ["Wegovy", "위고비"],
    ["Wegovy (injection)", "위고비"],
    ["Wegovy (tablet)", "위고비 (정제)"],
  ])("matches existing catalog aliases %s and %s", (a, b) => {
    expect(sameCatalogMedication(a, b)).toBe(true);
    expect(sameCatalogMedication(b, a)).toBe(true);
  });

  it.each([
    ["Mounjaro", "Zepbound"],
    ["마운자로", "젭바운드"],
    ["Wegovy", "Ozempic"],
    ["Saxenda", "Victoza"],
    ["Wegovy", "Wegovy (tablet)"],
    ["위고비", "위고비 (정제)"],
    ["Mounjaro", "tirzepatide"],
    ["Bydureon", "Bydureon BCise"],
  ])("keeps brands, formulations and ingredients distinct: %s / %s", (a, b) => {
    expect(sameCatalogMedication(a, b)).toBe(false);
    expect(sameCatalogMedication(b, a)).toBe(false);
  });

  it("requires trimmed exact equality for custom medication strings", () => {
    expect(sameCatalogMedication("Custom medicine", "  Custom medicine ")).toBe(true);
    expect(sameCatalogMedication("Custom medicine", "custom medicine")).toBe(false);
    expect(sameCatalogMedication("Custom medicine", "Custom  medicine")).toBe(false);
    expect(sameCatalogMedication("Custom medicine", "Another medicine")).toBe(false);
    expect(sameCatalogMedication("Custom medicine", "Mounjaro")).toBe(false);
  });
});
