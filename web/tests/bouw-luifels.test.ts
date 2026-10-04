import { describe, expect, it } from "vitest";

import { langsDeRing, dichtstePlek, vindLuifels } from "@/lib/bouw/omzetting/luifels";
import type { Blad, Pad, Ruimtevoorstel, Tekst, Xy } from "@/lib/bouw/omzetting/types";

/** Een proefblad op schaal 1 punt = 2 cm; alles hieronder in meter. */
const M = 0.02;
const pt = ([x, y]: Xy): Xy => [x / M, y / M];
const terug = ([x, y]: Xy): Xy => [Math.round(x * M * 100) / 100 || 0, Math.round(y * M * 100) / 100 || 0];

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [pt([x0, y0]), pt([x1, y0]), pt([x1, y1]), pt([x0, y1])];

/** Een verzonnen huis: één ruimte van 10 × 8 m, met buitenmuren van 30 cm. */
const RUIMTES: Ruimtevoorstel[] = [
  {
    sleutel: "r1",
    naam: "leefruimte",
    soort: "leefruimte",
    ringen: [rechthoek(1, 1, 11, 9)],
    oppervlakte: 80,
    oppervlaktePlan: 80,
    plafondhoogte: null,
    vloerpeil: null,
    status: "goed",
    redenen: [],
    mee: true,
    ruimteId: null,
  },
];
const MUREN: Xy[][] = [rechthoek(0.7, 0.7, 11.3, 1), rechthoek(0.7, 9, 11.3, 9.3), rechthoek(0.7, 1, 1, 9), rechthoek(11, 1, 11.3, 9)];

function lijn(punten: Xy[], streep = true): Pad {
  return { vul: null, lijn: "#000000", dikte: 0.36, delen: [{ punten: punten.map(pt), gesloten: false }], bogen: [], ...(streep ? { streep: true } : {}) };
}

/** Dezelfde lijn, maar elk stuk een eigen pad, zoals veel tekenpakketten het schrijven. */
const losseStukken = (punten: Xy[]): Pad[] => punten.slice(1).map((p, i) => lijn([punten[i], p]));

function tekst(inhoud: string, op: Xy): Tekst {
  const [x, y] = pt(op);
  return { tekst: inhoud, x, y, breedte: 40, hoogte: 6, grootte: 6, hoek: 0 };
}

const blad = (paden: Pad[], teksten: Tekst[] = []): Blad => ({ breedte: 2000, hoogte: 2000, paden, teksten, beeldvlak: 0 });

/** Achteraan: een luifel van 1 m diep langs het grootste deel van de gevel. */
const ACHTER: Xy[] = [
  [2, 0.7],
  [2, -0.3],
  [9, -0.3],
  [9, 0.7],
];

describe("een luifel op het plan", () => {
  it("vindt een streepjeslijn tegen de gevel, met de tekst erin", () => {
    const luifels = vindLuifels(blad([lijn(ACHTER)], [tekst("oversteek 100 cm", [5, 0.2])]), RUIMTES, MUREN, M);
    expect(luifels).toHaveLength(1);
    expect(luifels[0].lijn.map(terug)).toEqual(ACHTER);
    expect(luifels[0]).toMatchObject({ diepte: 1, tekst: "oversteek 100 cm" });
  });

  it("legt losse stukken achter elkaar, en neemt de diepte op als er geen maat in de tekst staat", () => {
    const luifels = vindLuifels(blad(losseStukken(ACHTER), [tekst("luifel", [5, 0.2])]), RUIMTES, MUREN, M);
    expect(luifels).toHaveLength(1);
    expect(luifels[0].diepte).toBe(1);
  });

  it("trekt een poot die net voor de gevel stopt door tot ertegen", () => {
    const kort: Xy[] = [
      [2, 0.2],
      [2, -0.3],
      [9, -0.3],
      [9, 0.7],
    ];
    const luifels = vindLuifels(blad([lijn(kort)], [tekst("oversteek 100 cm", [5, 0.2])]), RUIMTES, MUREN, M);
    expect(luifels).toHaveLength(1);
    expect(terug(luifels[0].lijn[0])).toEqual([2, 0.7]);
  });

  it("vindt een luifel rond een hoek", () => {
    const hoek: Xy[] = [
      [3, 9.3],
      [3, 10.2],
      [12.2, 10.2],
      [12.2, 6],
      [11.3, 6],
    ];
    const luifels = vindLuifels(blad([lijn(hoek)], [tekst("oversteek 90 cm", [8, 9.8])]), RUIMTES, MUREN, M);
    expect(luifels).toHaveLength(1);
    expect(luifels[0].diepte).toBe(0.9);
    expect(luifels[0].lijn.map(terug)).toEqual(hoek);
  });

  it("vindt niets zonder tekst, in volle lijn, binnen, of als één rechte langs de gevel", () => {
    const met = [tekst("oversteek 100 cm", [5, 0.2])];
    // Zonder tekst: de rand van een verdieping die uitkraagt staat er ook zo.
    expect(vindLuifels(blad([lijn(ACHTER)]), RUIMTES, MUREN, M)).toEqual([]);
    // In volle lijn: een luifel die je van boven ziet.
    expect(vindLuifels(blad([lijn(ACHTER, false)], met), RUIMTES, MUREN, M)).toEqual([]);
    // Streepjes binnen, zoals een trap boven de snede.
    const binnen: Xy[] = [
      [3, 1],
      [3, 3],
      [6, 3],
      [6, 1],
    ];
    expect(vindLuifels(blad([lijn(binnen)], [tekst("oversteek 100 cm", [4, 2])]), RUIMTES, MUREN, M)).toEqual([]);
    // Eén rechte langs de gevel sluit geen vlak in.
    expect(vindLuifels(blad([lijn([[0.7, 0.4], [11.3, 0.4]])], met), RUIMTES, MUREN, M)).toEqual([]);
    // Te ver van de gevel: geen luifel.
    const los: Xy[] = [
      [2, -2],
      [2, -3],
      [9, -3],
      [9, -2],
    ];
    expect(vindLuifels(blad([lijn(los)], [tekst("oversteek 100 cm", [5, -2.5])]), RUIMTES, MUREN, M)).toEqual([]);
  });
});

describe("langs de gevel", () => {
  const ring: Xy[] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ];

  it("neemt de kortste kant, met de hoeken ertussen", () => {
    const a = dichtstePlek([10.2, 6], [ring])!;
    const b = dichtstePlek([3, 8.3], [ring])!;
    expect(langsDeRing(a, b)).toEqual([[10, 8]]);
    expect(langsDeRing(b, a)).toEqual([[10, 8]]);
    // Op dezelfde rand: geen hoeken.
    const c = dichtstePlek([2, -0.1], [ring])!;
    const d = dichtstePlek([8, -0.1], [ring])!;
    expect(langsDeRing(c, d)).toEqual([]);
    expect(langsDeRing(d, c)).toEqual([]);
  });
});
