import { describe, expect, it } from "vitest";

import {
  controleerLeiding,
  hoogteVan,
  kleefLeiding,
  LEIDINGSOORTEN,
  lengteVan,
  metertekst,
  oppervlakteVan,
  totalen,
} from "@/lib/bouw/leidingen";

/** Verzonnen leidingen, in meter. */
const lijn = { soort: "water_koud", punten: [[1, 1], [4, 1], [4, 1.0001], [4, 5]], ligging: "vloer" };

describe("de soorten leidingen", () => {
  it("hebben unieke soorten in de vorm die de databank aanvaardt", () => {
    const soorten = LEIDINGSOORTEN.map((s) => s.soort);
    expect(new Set(soorten).size).toBe(soorten.length);
    for (const soort of soorten) expect(soort).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    expect(LEIDINGSOORTEN.find((s) => s.soort === "vloerverwarming")?.ligging).toBe("zone");
  });
});

describe("een leiding nakijken", () => {
  it("houdt een goede lijn, zonder dubbele punten, met de gewone doorsnede", () => {
    const uit = controleerLeiding(lijn);
    expect(uit).toEqual({
      ok: true,
      data: { soort: "water_koud", punten: [[1, 1], [4, 1], [4, 5]], ligging: "vloer", hoogte: null, diameter: 16, totVerdiepingId: null, label: null },
    });
  });

  it("geeft een leiding in de muur een hoogte, en enkel daar", () => {
    const muur = controleerLeiding({ ...lijn, soort: "elektriciteit", ligging: "muur" });
    expect(muur.ok && muur.data.hoogte).toBe(0.3);
    const hoog = controleerLeiding({ ...lijn, ligging: "muur", hoogte: "1.1" });
    expect(hoog.ok && hoog.data.hoogte).toBe(1.1);
    const vloer = controleerLeiding({ ...lijn, hoogte: 1.1 });
    expect(vloer.ok && vloer.data.hoogte).toBeNull();
  });

  it("wil een stijgleiding met één punt en een verdieping, en een zone met drie punten", () => {
    expect(controleerLeiding({ soort: "afvoer", punten: [[2, 2]], ligging: "stijg", totVerdiepingId: 8 })).toMatchObject({
      ok: true,
      data: { punten: [[2, 2]], totVerdiepingId: 8, diameter: 110 },
    });
    expect(controleerLeiding({ soort: "afvoer", punten: [[2, 2]], ligging: "stijg" }).ok).toBe(false);
    expect(controleerLeiding({ soort: "afvoer", punten: [[2, 2], [3, 3]], ligging: "stijg", totVerdiepingId: 8 }).ok).toBe(false);
    expect(controleerLeiding({ soort: "vloerverwarming", punten: [[0, 0], [4, 0]], ligging: "zone" }).ok).toBe(false);
    expect(controleerLeiding({ soort: "vloerverwarming", punten: [[0, 0], [4, 0], [4, 3]], ligging: "zone" }).ok).toBe(true);
  });

  it("weigert wat niet klopt", () => {
    for (const fout of [
      { soort: "gas" },
      { ligging: "lucht" },
      { punten: [[1, 1]] },
      { punten: [[1, 1], [Number.NaN, 2]] },
      { punten: [[1, 1], [5000, 2]] },
      { punten: Array.from({ length: 201 }, (_, i) => [i, 0]) },
      { ligging: "muur", hoogte: 12 },
      { diameter: 3 },
      { diameter: 12.5 },
      { label: "x".repeat(81) },
    ]) {
      expect(controleerLeiding({ ...lijn, ...fout }).ok).toBe(false);
    }
    expect(controleerLeiding(null).ok).toBe(false);
  });
});

describe("rekenen met leidingen", () => {
  it("meet de lengte, en de oppervlakte van een zone", () => {
    expect(lengteVan({ punten: [[0, 0], [3, 0], [3, 4]], ligging: "vloer" })).toBeCloseTo(7, 9);
    const zone = { punten: [[0, 0], [4, 0], [4, 3], [0, 3]] as [number, number][], ligging: "zone" as const };
    expect(lengteVan(zone)).toBeCloseTo(14, 9);
    expect(oppervlakteVan(zone)).toBeCloseTo(12, 9);
    expect(oppervlakteVan({ ...zone, ligging: "vloer" })).toBe(0);
  });

  it("legt de as op de juiste hoogte", () => {
    const met = (ligging: "vloer" | "muur" | "plafond" | "grond" | "stijg" | "zone", extra = {}) =>
      hoogteVan({ ligging, hoogte: null, diameter: 160, ...extra }, 2.6, -0.24);
    expect(met("vloer")).toBeCloseTo(-0.05, 9);
    expect(met("muur")).toBeCloseTo(0.3, 9);
    expect(met("muur", { hoogte: 1.1 })).toBeCloseTo(1.1, 9);
    expect(met("plafond")).toBeCloseTo(2.6 - 0.08 - 0.03, 9);
    expect(met("grond")).toBeCloseTo(-0.84, 9);
    expect(met("stijg")).toBe(0);
    expect(met("zone")).toBeCloseTo(-0.03, 9);
  });

  it("telt per soort, in de volgorde van de catalogus", () => {
    const som = totalen([
      { soort: "afvoer", punten: [[0, 0], [2, 0]], ligging: "vloer" },
      { soort: "water_koud", punten: [[0, 0], [0, 3]], ligging: "vloer" },
      { soort: "afvoer", punten: [[5, 5]], ligging: "stijg" },
      { soort: "vloerverwarming", punten: [[0, 0], [2, 0], [2, 2], [0, 2]], ligging: "zone" },
    ]);
    expect(som.map((t) => [t.soort, t.aantal, Math.round(t.lengte * 10) / 10, t.oppervlakte])).toEqual([
      ["water_koud", 1, 3, 0],
      ["afvoer", 2, 2, 0],
      ["vloerverwarming", 1, 0, 4],
    ]);
    expect(metertekst(12.44)).toBe("12,4 m");
  });
});

describe("kleven bij het tekenen", () => {
  const kandidaten: [number, number][] = [
    [10, 10],
    [10.5, 10],
  ];

  it("kleeft aan het dichtste punt in de buurt", () => {
    expect(kleefLeiding([10.4, 10.1], { vorige: null, kandidaten, straal: 1 })).toEqual({ punt: [10.5, 10], soort: "punt" });
    expect(kleefLeiding([20, 20], { vorige: null, kandidaten, straal: 1 })).toEqual({ punt: [20, 20], soort: null });
  });

  it("legt een lijn recht, of schuin op 45°, als ze er bijna ligt", () => {
    const recht = kleefLeiding([10, 0.5], { vorige: [0, 0], kandidaten: [], straal: 0.1 });
    expect(recht.soort).toBe("recht");
    // Loodrecht op de rechte lijn gezet.
    expect(recht.punt[0]).toBeCloseTo(10, 9);
    expect(recht.punt[1]).toBeCloseTo(0, 9);
    const schuin = kleefLeiding([10, 9.5], { vorige: [0, 0], kandidaten: [], straal: 0.1 });
    expect(schuin.soort).toBe("recht");
    expect(schuin.punt[0]).toBeCloseTo(schuin.punt[1], 9);
    expect(kleefLeiding([10, 2], { vorige: [0, 0], kandidaten: [], straal: 0.1 }).soort).toBeNull();
  });
});
