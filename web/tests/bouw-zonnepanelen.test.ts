import { describe, expect, it } from "vitest";

import { maakModel, type Invoerverdieping } from "@/lib/bouw/drie/model";
import { BOVEN_HET_DAK, dakplekOnder, legOpDak, veldmaat, veldVan, vermogen } from "@/lib/bouw/drie/zonnepanelen";
import type { Xy } from "@/lib/bouw/omzetting/types";

const rh = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Een verzonnen huis van 10 × 8 m met muren van 30 cm en één ruimte. */
const GELIJKVLOERS: Invoerverdieping = {
  id: 10,
  naam: "Gelijkvloers",
  gebouwId: 1,
  volgorde: 0,
  vloerpeil: 0,
  plafondhoogte: 2.6,
  verdiepingshoogte: 3,
  ruimtes: [{ id: 1, naam: "leefruimte", soort: "leefruimte", ringen: [rh(0.3, 0.3, 9.7, 7.7)], plafondhoogte: null }],
  muren: [rh(0, 0, 10, 0.3), rh(0, 7.7, 10, 8), rh(0, 0.3, 0.3, 7.7), rh(9.7, 0.3, 10, 7.7)],
  openingen: [],
};
const zadeldak = maakModel([{ id: 1, dak: { type: "zadel", helling: 30, nok: "x", overstek: 0.3 } }], [GELIJKVLOERS]);
const platdak = maakModel([{ id: 1, dak: { type: "plat", helling: 30, nok: "x", overstek: 0.3 } }], [GELIJKVLOERS]);

describe("een veld zonnepanelen", () => {
  it("weet zijn maat uit rijen en kolommen, en omgekeerd", () => {
    expect(veldmaat({ rijen: 2, kolommen: 4, staand: true })).toEqual({ breedte: 4.58, diepte: 3.46 });
    expect(veldmaat({ rijen: 1, kolommen: 1, staand: false })).toEqual({ breedte: 1.72, diepte: 1.13 });
    for (const staand of [true, false]) {
      for (let rijen = 1; rijen <= 4; rijen++) {
        for (let kolommen = 1; kolommen <= 6; kolommen++) {
          const veld = { rijen, kolommen, staand };
          const { breedte, diepte } = veldmaat(veld);
          expect(veldVan(breedte, diepte)).toEqual(veld);
        }
      }
    }
  });

  it("telt de panelen en het vermogen", () => {
    expect(vermogen({ rijen: 2, kolommen: 4, staand: true })).toEqual({ panelen: 8, kwp: 3.44 });
  });
});

describe("het dak onder een punt", () => {
  it("vindt het schuine vlak, met zijn helling en de richting naar beneden", () => {
    const boven = dakplekOnder(zadeldak, 1, [5, 2]);
    const onder = dakplekOnder(zadeldak, 1, [5, 6]);
    expect(boven).not.toBeNull();
    expect(onder).not.toBeNull();
    if (!boven || !onder) return;
    expect(boven.verdiepingId).toBe(10);
    expect(boven.helling).toBeCloseTo(30, 6);
    // De nok loopt langs x in het midden: bovenaan op het plan helt het naar boven af, onderaan naar onder.
    expect(boven.hoek).toBeCloseTo(180, 6);
    expect(onder.hoek).toBeCloseTo(0, 6);
    // Dichter bij de nok ligt het dak hoger.
    expect(dakplekOnder(zadeldak, 1, [5, 3.5])!.z).toBeGreaterThan(boven.z);
    expect(dakplekOnder(zadeldak, 1, [5, 20])).toBeNull();
    expect(dakplekOnder(zadeldak, 2, [5, 2])).toBeNull();
  });

  it("vindt een plat dak", () => {
    const plek = dakplekOnder(platdak, 1, [5, 4]);
    const verdieping = platdak.verdiepingen[0];
    expect(plek).toMatchObject({ verdiepingId: 10, helling: 0, hoek: 0, z: verdieping.dakplaat!.z1 });
  });

  it("legt een veld op het dak, op zijn haken, met de helling mee", () => {
    const veld = { x: 5, y: 2, z: 0, hoek: 45, kanteling: 0, verdiepingId: 10 };
    const gelegd = legOpDak(veld, zadeldak)!;
    const plek = dakplekOnder(zadeldak, 1, [5, 2])!;
    expect(gelegd.z).toBeCloseTo(plek.z - 0 + BOVEN_HET_DAK, 2);
    expect(gelegd.kanteling).toBe(30);
    expect(gelegd.hoek).toBe(180);
    // Op een plat dak blijft de hoek zoals hij was.
    expect(legOpDak(veld, platdak)).toMatchObject({ kanteling: 0, hoek: 45 });
    // Naast het dak gaat het niet.
    expect(legOpDak({ ...veld, y: 30 }, zadeldak)).toBeNull();
  });
});
