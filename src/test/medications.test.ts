import { describe, expect, it } from "vitest";
import { findMedication, MEDICATIONS } from "@/lib/medications";

describe("official medication selection", () => {
  it("offers established GLP-1 brands and approved dual agonists", () => {
    for (const name of ["Mounjaro", "Wegovy", "Ozempic", "Saxenda", "Zepbound", "Trulicity", "Victoza", "Rybelsus"]) {
      expect(findMedication(name)?.source).toMatch(/^https:\/\//);
    }
  });
  it("does not offer research peptides as official medications", () => {
    expect(findMedication("retatrutide")).toBeUndefined();
    expect(findMedication("CagriSema")).toBeUndefined();
  });
  it("preserves brand and formulation distinctions", () => {
    expect(findMedication("마운자로")?.id).toBe("mounjaro");
    expect(findMedication("Mounjaro")?.id).toBe("mounjaro");
    expect(findMedication("tirzepatide")).toBeUndefined();
    expect(findMedication("Wegovy (tablet)")?.id).toBe("wegovy-tablet");
    expect(findMedication("Wegovy")?.id).toBe("wegovy-injection");
    expect(new Set(MEDICATIONS.map((m) => m.id)).size).toBe(MEDICATIONS.length);
    expect(findMedication("My existing medicine")).toBeUndefined();
  });
});