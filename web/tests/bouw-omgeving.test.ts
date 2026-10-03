import { describe, expect, it } from "vitest";

import {
  buurhuis,
  BUURHOOGTE,
  georefVanPlaatsing,
  leesAdrespunt,
  leesGrb,
  lokaal,
  maakOmgeving,
  naarLambert,
  perceelOpPlan,
  plaatsingVanGeoref,
  schoneGeoref,
  vanLambert,
  type Georef,
  type Lambert,
  type Omgeving,
} from "@/lib/bouw/drie/omgeving";
import { genormaliseerd, naarTerrein, type Plaatsing } from "@/lib/bouw/drie/plaatsing";
import { METER_PER_PUNT } from "@/lib/bouw/omzetting/schaal";
import type { Blad, Pad, Xy } from "@/lib/bouw/omzetting/types";

/**
 * De omgeving uit Vlaanderen, met verzonnen percelen en gebouwen: geen echt
 * adres, geen echte coördinaten van ons huis, geen perceelnummers.
 */

const PUNT: Lambert = [150000, 180000];

const dichtbij = (a: readonly number[], b: readonly number[], marge = 1e-6) => a.every((w, i) => Math.abs(w - b[i]) < marge);

describe("Lambert en het terrein", () => {
  it("rekent heen en terug, en zonder draaiing is rechts het oosten en omlaag het zuiden", () => {
    const g: Georef = { x: 150000, y: 180000, hoek: 0 };
    expect(naarLambert([10, 0], g)).toEqual([150010, 180000]);
    expect(naarLambert([0, 10], g)).toEqual([150000, 179990]);
    for (const hoek of [0, 23.5, -71, 179, 270]) {
      const georef = { x: 149876.5, y: 180123.25, hoek };
      for (const t of [[0, 0], [12.5, -3], [-40, 77.25]] as Xy[]) expect(dichtbij(vanLambert(naarLambert(t, georef), georef), t)).toBe(true);
    }
  });

  it("legt de omgeving met een plaatsing op het terrein, net als een gebouw", () => {
    const plaats: Plaatsing = { x: 42.5, y: 31.25, hoek: 23.5 };
    const g = georefVanPlaatsing(plaats, PUNT);
    expect(dichtbij(Object.values(plaatsingVanGeoref(g, PUNT)), Object.values(plaats))).toBe(true);
    // Elk punt in Lambert valt op dezelfde plek, rechtstreeks of via het assenstelsel rond het adrespunt.
    for (const q of [[150012, 179993], [149950, 180044.5]] as Lambert[]) {
      expect(dichtbij(vanLambert(q, g), naarTerrein(lokaal(q, PUNT), [0, 0], plaats))).toBe(true);
    }
  });
});

describe("de antwoorden van Digitaal Vlaanderen", () => {
  it("leest het adrespunt in Lambert 72", () => {
    expect(leesAdrespunt({ LocationResult: [{ Location: { X_Lambert72: 150000.5, Y_Lambert72: 180000.25, Lat_WGS84: 51 } }] })).toEqual([150000.5, 180000.25]);
    expect(leesAdrespunt({ LocationResult: [] })).toBeNull();
    expect(leesAdrespunt({ LocationResult: [{ Location: { X_Lambert72: "150000", Y_Lambert72: 180000 } }] })).toBeNull();
    expect(leesAdrespunt({ LocationResult: [{ Location: { X_Lambert72: 0, Y_Lambert72: 0 } }] })).toBeNull();
    expect(leesAdrespunt(null)).toBeNull();
  });

  it("leest polygonen en multipolygonen uit de WFS, zonder perceelnummers", () => {
    const ring = [[150000, 180000], [150010, 180000], [150010, 180010], [150000, 180010], [150000, 180000]];
    const vormen = leesGrb({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [ring, [[150002, 180002], [150003, 180002], [150003, 180003]]] }, properties: { CAPAKEY: "00000A0000/00A000", LBLTYPE: "hoofdgebouw" } },
        { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[ring], [[[1, 1], [2, 1], [2, 2]]]] }, properties: {} },
        { type: "Feature", geometry: { type: "Point", coordinates: [150000, 180000] }, properties: {} },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[150000, 180000], ["x", 1]]] } },
        null,
      ],
    });
    expect(vormen).toHaveLength(3);
    expect(vormen[0]).toEqual({ ring: ring.slice(0, 4), soort: "hoofdgebouw" });
    expect(JSON.stringify(vormen)).not.toContain("CAPAKEY");
    expect(JSON.stringify(vormen)).not.toContain("0000A");
    expect(leesGrb({ features: "x" })).toEqual([]);
    expect(leesGrb(undefined)).toEqual([]);
  });

  it("kiest ons perceel: dat met het adrespunt, anders het dichtste binnen 30 m", () => {
    const vierkant = (x: number, y: number, z: number): Lambert[] => [[x, y], [x + z, y], [x + z, y + z], [x, y + z]];
    const percelen = [{ ring: vierkant(149900, 179900, 50) }, { ring: vierkant(149990, 179990, 20) }];
    expect(maakOmgeving(PUNT, percelen, []).percelen.map((p) => p.eigen)).toEqual([false, true]);
    // Het adrespunt op de straat, 12 m voor het perceel.
    expect(maakOmgeving([150022, 180000], percelen, []).percelen.map((p) => p.eigen)).toEqual([false, true]);
    expect(maakOmgeving([150200, 180200], percelen, []).percelen.every((p) => !p.eigen)).toBe(true);
    expect(maakOmgeving(PUNT, percelen, []).luchtfoto).toEqual({ x0: 149900, y0: 179900, x1: 150100, y1: 180100 });
  });
});

// ---------------------------------------------------------------------------
// Ons perceel op het inplantingsplan
// ---------------------------------------------------------------------------

const BREEDTE = 2384;
const HOOGTE = 1684;
const MPP = 200 * METER_PER_PUNT;

function blad(paden: Pad[]): Blad {
  return { breedte: BREEDTE, hoogte: HOOGTE, paden, teksten: [{ tekst: "1/200", x: 2000, y: 1600, breedte: 30, hoogte: 8, grootte: 8, hoek: 0 }], beeldvlak: 0 };
}

const lijn = (punten: Xy[], gesloten: boolean): Pad => ({ vul: null, lijn: "#000000", dikte: 0.25, delen: [{ punten, gesloten }], bogen: [] });

/** Een ring in Lambert zoals hij op het plan staat, als de omgeving zo geplaatst is. */
const opPlan = (ring: Lambert[], plaats: Plaatsing): Xy[] =>
  ring.map((q) => {
    const [x, y] = naarTerrein(lokaal(q, PUNT), [0, 0], plaats);
    return [x / MPP, y / MPP];
  });

function omgeving(eigen: Lambert[], buren: Lambert[][] = [], gebouwen: Lambert[][] = []): Omgeving {
  return {
    punt: PUNT,
    luchtfoto: { x0: PUNT[0] - 100, y0: PUNT[1] - 100, x1: PUNT[0] + 100, y1: PUNT[1] + 100 },
    percelen: [{ ring: eigen, eigen: true }, ...buren.map((ring) => ({ ring, eigen: false }))],
    gebouwen: gebouwen.map((ring) => ({ ring, soort: "hoofdgebouw" })),
  };
}

function verwacht(gevonden: { georef: Georef; overeenkomst: number } | null, waar: Plaatsing) {
  expect(gevonden).not.toBeNull();
  const plaats = plaatsingVanGeoref(gevonden!.georef, PUNT);
  expect(Math.abs(genormaliseerd(plaats.hoek - waar.hoek))).toBeLessThan(0.2);
  expect(Math.hypot(plaats.x - waar.x, plaats.y - waar.y)).toBeLessThan(0.1);
  expect(gevonden!.overeenkomst).toBeGreaterThan(0.95);
}

describe("ons perceel op het inplantingsplan", () => {
  // Een scheef perceel van ±1000 m² rond het adrespunt.
  const EIGEN: Lambert[] = [[149985, 179975], [150018, 179979], [150016, 180012], [149988, 180018]];

  it("legt de omgeving zo dat ons perceel op het getekende perceel valt", () => {
    const waar: Plaatsing = { x: 60, y: 45, hoek: 31 };
    verwacht(perceelOpPlan(omgeving(EIGEN), blad([lijn(opPlan(EIGEN, waar), true)]), 200), waar);
  });

  it("kiest bij een rechthoekig perceel de kant waar de buren op het plan staan", () => {
    const rechthoek: Lambert[] = [[149985, 179980], [150015, 179980], [150015, 180020], [149985, 180020]];
    const buur: Lambert[] = [[150015, 179980], [150040, 179980], [150040, 180020], [150015, 180020]];
    const huisVanBuur: Lambert[] = [[150020, 179995], [150032, 179995], [150032, 180008], [150020, 180008]];
    const waar: Plaatsing = { x: 70, y: 50, hoek: -160 };
    const plan = blad([lijn(opPlan(rechthoek, waar), true), lijn(opPlan(buur, waar), true), lijn(opPlan(huisVanBuur, waar), true)]);
    verwacht(perceelOpPlan(omgeving(rechthoek, [buur], [huisVanBuur]), plan, 200), waar);
  });

  it("vindt het perceel ook als het in losse zijden getekend is, zoals een streep-punt-lijn uit een tekenpakket", () => {
    const waar: Plaatsing = { x: 70, y: 55, hoek: -12 };
    const hoeken = opPlan(EIGEN, waar);
    const zijden = hoeken.flatMap((a, i): Pad[] => {
      const b = hoeken[(i + 1) % hoeken.length];
      const zijde = (p: Xy, q: Xy): Pad => ({ vul: null, lijn: "#000000", dikte: 2, delen: [{ punten: [p, q], gesloten: false }], bogen: [] });
      // De eerste zijde in twee stukken, en een hoekje van een halve punt.
      if (i === 0) {
        const m: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return [zijde(a, m), zijde(m, b), zijde(b, [b[0] + 0.5, b[1]])];
      }
      return [zijde(a, b)];
    });
    verwacht(perceelOpPlan(omgeving(EIGEN), blad(zijden), 200), waar);
  });

  it("geeft niets als het perceel niet op het plan staat, of als we geen perceel hebben", () => {
    expect(perceelOpPlan(omgeving(EIGEN), blad([]), 200)).toBeNull();
    const zonder: Omgeving = { ...omgeving(EIGEN), percelen: [] };
    expect(perceelOpPlan(zonder, blad([lijn(opPlan(EIGEN, { x: 60, y: 45, hoek: 0 }), true)]), 200)).toBeNull();
  });
});

describe("de huizen van de buren", () => {
  it("krijgen een zadeldak met de nok langs de lange kant, ook schuin", () => {
    const hoek = (25 * Math.PI) / 180;
    // 12 × 7 m, 25° gedraaid rond (5, 5).
    const ring: Xy[] = ([[-6, -3.5], [6, -3.5], [6, 3.5], [-6, 3.5]] as Xy[]).map(([x, y]) => [5 + Math.cos(hoek) * x - Math.sin(hoek) * y, 5 + Math.sin(hoek) * x + Math.cos(hoek) * y]);
    const { dak } = buurhuis(ring);
    expect(dak).not.toBeNull();
    const punten = dak!.vlakken.flat();
    const nok = Math.max(...punten.map(([, , z]) => z));
    // Een nok van 3,5 m breed onder 35°: 2,45 m boven de dakrand.
    expect(nok).toBeCloseTo(BUURHOOGTE + 3.5 * Math.tan((35 * Math.PI) / 180), 1);
    // De hoogste punten liggen op de lange as, die 25° gedraaid is.
    const hoogste = punten.filter(([, , z]) => z > nok - 0.01);
    const [a, b] = [hoogste[0], hoogste.find((p) => Math.hypot(p[0] - hoogste[0][0], p[1] - hoogste[0][1]) > 5)!];
    expect(Math.abs(genormaliseerd((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI - 25) % 180)).toBeLessThan(0.5);
  });
});

describe("de georeferentie bewaren", () => {
  it("houdt enkel nette getallen in België over", () => {
    expect(schoneGeoref({ x: 150000.12345, y: 180000, hoek: 370 })).toEqual({ x: 150000.123, y: 180000, hoek: 10 });
    for (const fout of [null, "x", { x: 1, y: 2 }, { x: -1, y: 2, hoek: 0 }, { x: 500000, y: 2, hoek: 0 }, { x: 1, y: 2, hoek: Number.NaN }, { x: "1", y: 2, hoek: 0 }]) {
      expect(schoneGeoref(fout)).toBeNull();
    }
  });
});
