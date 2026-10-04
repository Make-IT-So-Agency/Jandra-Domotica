import { describe, expect, it } from "vitest";

import { bevestigingVan } from "@/lib/bouw/drie/bevestiging";
import { vereniging, type Veelhoek } from "@/lib/bouw/drie/vlak";
import type { Xy } from "@/lib/bouw/omzetting/types";

/** Een verzonnen ruimte van 4 × 3 m met muren van 20 cm. */
const rh = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const MUREN: Veelhoek[] = vereniging([
  [rh(-0.2, -0.2, 4.2, 0)],
  [rh(-0.2, 3, 4.2, 3.2)],
  [rh(-0.2, 0, 0, 3)],
  [rh(4, 0, 4.2, 3)],
]);

describe("waar een punt hangt", () => {
  it("hangt aan het plafond zonder hoogte, en ligt in de vloer op nul", () => {
    expect(bevestigingVan([2, 1.5], null, MUREN)).toEqual({ soort: "plafond" });
    expect(bevestigingVan([2, 1.5], 0, MUREN)).toEqual({ soort: "vloer" });
  });

  it("hangt tegen de dichtste muurkant, en kijkt de ruimte in", () => {
    const b = bevestigingVan([0.25, 1.5], 0.3, MUREN);
    expect(b.soort).toBe("muur");
    if (b.soort !== "muur") return;
    expect(b.punt[0]).toBeCloseTo(0, 9);
    expect(b.punt[1]).toBeCloseTo(1.5, 9);
    expect(b.n[0]).toBeCloseTo(1, 9);
    expect(b.n[1]).toBeCloseTo(0, 9);
  });

  it("kiest een kant als het punt in de muur zelf ligt", () => {
    const b = bevestigingVan([4.15, 2], 1.1, MUREN);
    expect(b.soort).toBe("muur");
    if (b.soort !== "muur") return;
    // De buitenkant van de rechtermuur is het dichtst: het plaatje kijkt naar buiten.
    expect(b.punt[0]).toBeCloseTo(4.2, 9);
    expect(b.n[0]).toBeCloseTo(1, 9);
  });

  it("staat vrij als er geen muur in de buurt is", () => {
    expect(bevestigingVan([2, 1.5], 1, MUREN)).toEqual({ soort: "vrij" });
    expect(bevestigingVan([8, 1.5], 0.6, MUREN)).toEqual({ soort: "vrij" });
  });
});
