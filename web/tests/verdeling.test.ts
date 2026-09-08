import { describe, expect, it } from "vitest";

import { verdeelPerLaadpaal } from "@/app/verdeling-laadpalen";
import type { Laadsessie } from "@/lib/types";

function sessie(overschrijf: Partial<Laadsessie>): Laadsessie {
  return {
    id: Math.random().toString(36).slice(2),
    external_id: "evcc:1",
    loadpoint_name: "Laadpaal links",
    vehicle: null,
    started_at: "2026-09-01T10:00:00Z",
    finished_at: "2026-09-01T12:00:00Z",
    energy_kwh: 10,
    meter_start_kwh: null,
    meter_stop_kwh: null,
    duration_seconds: null,
    solar_percentage: null,
    odometer_km: null,
    evcc_price_eur: null,
    evcc_price_per_kwh: null,
    is_complete: true,
    ...overschrijf,
  };
}

describe("verdeelPerLaadpaal", () => {
  it("telt per laadpaal op en geeft de aandelen", () => {
    const delen = verdeelPerLaadpaal([
      sessie({ loadpoint_name: "Laadpaal links", energy_kwh: 30 }),
      sessie({ loadpoint_name: "Laadpaal links", energy_kwh: 10 }),
      sessie({ loadpoint_name: "Laadpaal rechts", energy_kwh: 60 }),
    ]);

    expect(delen.map((deel) => [deel.laadpaal, deel.kwh])).toEqual([
      ["Laadpaal links", 40],
      ["Laadpaal rechts", 60],
    ]);
    expect(delen.map((deel) => deel.aandeel)).toEqual([0.4, 0.6]);
  });

  it("laat de aandelen samen één zijn", () => {
    const delen = verdeelPerLaadpaal([
      sessie({ loadpoint_name: "A", energy_kwh: 13.1 }),
      sessie({ loadpoint_name: "B", energy_kwh: 51 }),
      sessie({ loadpoint_name: "C", energy_kwh: 0.8 }),
    ]);

    const som = delen.reduce((totaal, deel) => totaal + deel.aandeel, 0);
    expect(som).toBeCloseTo(1, 10);
  });

  it("houdt de volgorde en dus de kleur aan de naam, niet aan de grootte", () => {
    // De kleinste eerst aanbieden mag de kleuren niet omgooien: een laadpaal
    // die volgende maand groter is, hoort dezelfde kleur te houden.
    const eerst = verdeelPerLaadpaal([
      sessie({ loadpoint_name: "Laadpaal rechts", energy_kwh: 90 }),
      sessie({ loadpoint_name: "Laadpaal links", energy_kwh: 10 }),
    ]);
    const later = verdeelPerLaadpaal([
      sessie({ loadpoint_name: "Laadpaal links", energy_kwh: 90 }),
      sessie({ loadpoint_name: "Laadpaal rechts", energy_kwh: 10 }),
    ]);

    const kleurVan = (delen: ReturnType<typeof verdeelPerLaadpaal>, naam: string) =>
      delen.find((deel) => deel.laadpaal === naam)?.kleur;

    expect(kleurVan(eerst, "Laadpaal links")).toBe(kleurVan(later, "Laadpaal links"));
    expect(kleurVan(eerst, "Laadpaal rechts")).toBe(kleurVan(later, "Laadpaal rechts"));
    expect(kleurVan(eerst, "Laadpaal links")).not.toBe(kleurVan(eerst, "Laadpaal rechts"));
  });

  it("slaat sessies over die nog lopen of niets geladen hebben", () => {
    const delen = verdeelPerLaadpaal([
      sessie({ loadpoint_name: "A", energy_kwh: 20 }),
      sessie({ loadpoint_name: "B", energy_kwh: 15, is_complete: false }),
      sessie({ loadpoint_name: "C", energy_kwh: 0 }),
      sessie({ loadpoint_name: "D", energy_kwh: null }),
    ]);

    expect(delen).toHaveLength(1);
    expect(delen[0].laadpaal).toBe("A");
  });

  it("geeft niets terug als er niets te verdelen is", () => {
    expect(verdeelPerLaadpaal([])).toEqual([]);
    expect(verdeelPerLaadpaal([sessie({ energy_kwh: 0 })])).toEqual([]);
  });

  it("bundelt meer laadpalen dan er kleuren zijn", () => {
    const sessies = ["A", "B", "C", "D", "E", "F", "G"].map((naam) =>
      sessie({ loadpoint_name: naam, energy_kwh: 10 }),
    );

    const delen = verdeelPerLaadpaal(sessies);

    // Vijf met een eigen kleur, de rest samen in één grijze groep.
    expect(delen).toHaveLength(6);
    expect(delen.at(-1)?.laadpaal).toBe("2 overige");
    expect(delen.at(-1)?.kwh).toBe(20);
    expect(new Set(delen.map((deel) => deel.kleur)).size).toBe(6);
  });

  it("valt terug op onbekend bij een laadpaal zonder naam", () => {
    const delen = verdeelPerLaadpaal([sessie({ loadpoint_name: null, energy_kwh: 5 })]);

    expect(delen[0].laadpaal).toBe("onbekend");
  });
});
