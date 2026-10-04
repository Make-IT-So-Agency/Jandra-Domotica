import { describe, expect, it } from "vitest";

import { naarLambert, type Georef, type Lambert } from "@/lib/bouw/drie/omgeving";
import {
  brusselseTijd,
  convergentie,
  daglicht,
  geoNaarLambert,
  inBrussel,
  lambertNaarGeo,
  MIDDEN_VLAANDEREN,
  noordenOpTerrein,
  noordenVan,
  schaduwvak,
  uurtekst,
  windrichting,
  zonnestand,
  zonOpEnOnder,
  zonRichting,
} from "@/lib/bouw/drie/zon";

/**
 * De zon op datum en uur. Enkel publieke plaatsen: het rekenvoorbeeld van de
 * EPSG-handleiding voor Belgian Lambert 72, en het centrum van Brussel. Geen
 * coördinaten van een echt huis.
 */

const dms = (graden: number, minuten: number, seconden: number) => graden + minuten / 60 + seconden / 3600;
const BRUSSEL = { breedte: 50.85, lengte: 4.35 };

describe("Lambert 72 en breedte en lengte", () => {
  it("volgt het rekenvoorbeeld van de EPSG-handleiding, op 10 cm", () => {
    const [x, y] = geoNaarLambert({ breedte: dms(50, 40, 46.461), lengte: dms(5, 48, 26.533) });
    expect(x).toBeCloseTo(251763.2, 1);
    expect(Math.abs(y - 153034.13)).toBeLessThan(0.1);
  });

  it("gaat heen en terug op een millimeter", () => {
    for (const punt of [
      [150000, 170000],
      [30000, 200000],
      [250000, 160000],
    ] as Lambert[]) {
      const [x, y] = geoNaarLambert(lambertNaarGeo(punt));
      expect(Math.abs(x - punt[0])).toBeLessThan(0.001);
      expect(Math.abs(y - punt[1])).toBeLessThan(0.001);
    }
  });

  it("legt de oorsprong van Lambert ten zuiden van Brussel, op de meridiaan van het stelsel", () => {
    const geo = lambertNaarGeo([150000.013, 170000]);
    expect(geo.lengte).toBeCloseTo(dms(4, 22, 2.952), 6);
    expect(geo.breedte).toBeGreaterThan(50.5);
    expect(geo.breedte).toBeLessThan(51);
  });

  it("geeft een convergentie van hoogstens anderhalve graad in Vlaanderen", () => {
    expect(convergentie(dms(4, 22, 2.952))).toBeCloseTo(0, 9);
    expect(convergentie(5.9)).toBeGreaterThan(1);
    expect(convergentie(5.9)).toBeLessThan(1.5);
    expect(convergentie(2.55)).toBeLessThan(-1);
    expect(convergentie(2.55)).toBeGreaterThan(-1.5);
  });
});

describe("het ware noorden op het terrein", () => {
  /** Een stap van 100 m op het terrein in de richting van een hoek, in Lambert. */
  function stap(georef: Georef, van: [number, number], hoek: number): { van: Lambert; naar: Lambert } {
    const h = (hoek * Math.PI) / 180;
    return { van: naarLambert(van, georef), naar: naarLambert([van[0] + 100 * Math.sin(h), van[1] - 100 * Math.cos(h)], georef) };
  }

  for (const [naam, georef] of [
    ["ten oosten van de meridiaan, gedraaid", { x: 230000, y: 170000, hoek: 32 }],
    ["ten westen van de meridiaan", { x: 40000, y: 195000, hoek: -75 }],
    ["recht", { x: 150000, y: 170000, hoek: 0 }],
  ] as const) {
    it(`wijst langs de meridiaan naar het noorden: ${naam}`, () => {
      const noorden = noordenOpTerrein(georef, [georef.x, georef.y]);
      const { van, naar } = stap(georef, [20, 30], noorden);
      const a = lambertNaarGeo(van);
      const b = lambertNaarGeo(naar);
      expect(b.lengte - a.lengte).toBeCloseTo(0, 6);
      expect(b.breedte).toBeGreaterThan(a.breedte);
    });
  }

  it("is ten oosten van de meridiaan wat westelijker dan het noorden van Lambert", () => {
    const georef = { x: 230000, y: 170000, hoek: 0 };
    expect(noordenOpTerrein(georef, [georef.x, georef.y])).toBeLessThan(-0.5);
  });

  it("zegt waar het noorden vandaan komt", () => {
    const georef = { x: 150000.013, y: 170000, hoek: 20 };
    const punt: Lambert = [150000.013, 170000];
    expect(noordenVan(null, null)).toEqual({ hoek: 0, geo: MIDDEN_VLAANDEREN, bron: "geen" });
    expect(noordenVan(null, punt).bron).toBe("adres");
    expect(noordenVan(null, punt).geo.breedte).toBeGreaterThan(50.5);
    const bewaard = noordenVan({ georef, punt, soort: "bewaard" }, punt);
    expect(bewaard.bron).toBe("bewaard");
    expect(bewaard.hoek).toBeCloseTo(20, 6);
    expect(noordenVan({ georef, punt, soort: "plan" }, punt).bron).toBe("omgeving");
    expect(noordenVan({ georef, punt, soort: "hand" }, punt).bron).toBe("omgeving");
    expect(noordenVan({ georef, punt, soort: "huis" }, punt).bron).toBe("aangenomen");
  });
});

describe("de tijd in België", () => {
  it("rekent de zomertijd en de wintertijd", () => {
    expect(brusselseTijd("2026-06-21", 13 * 60 + 44)).toBe(Date.UTC(2026, 5, 21, 11, 44));
    expect(brusselseTijd("2026-12-21", 12 * 60 + 41)).toBe(Date.UTC(2026, 11, 21, 11, 41));
  });

  it("springt mee op 29 maart en 25 oktober 2026", () => {
    expect(brusselseTijd("2026-03-29", 60 + 59)).toBe(Date.UTC(2026, 2, 29, 0, 59));
    expect(brusselseTijd("2026-03-29", 3 * 60)).toBe(Date.UTC(2026, 2, 29, 1, 0));
    expect(brusselseTijd("2026-10-25", 60 + 59)).toBe(Date.UTC(2026, 9, 24, 23, 59));
    expect(brusselseTijd("2026-10-25", 3 * 60)).toBe(Date.UTC(2026, 9, 25, 2, 0));
  });

  it("geeft een ogenblik terug als datum en uur in Brussel", () => {
    expect(inBrussel(Date.UTC(2026, 5, 21, 22, 30))).toEqual({ datum: "2026-06-22", minuten: 30 });
    expect(inBrussel(brusselseTijd("2026-01-05", 8 * 60 + 15))).toEqual({ datum: "2026-01-05", minuten: 8 * 60 + 15 });
    expect(uurtekst(5 * 60 + 9)).toBe("05:09");
    expect(uurtekst(1440 + 61)).toBe("01:01");
  });
});

describe("de stand van de zon in Brussel", () => {
  /** De hoogste stand op een dag, per minuut. */
  function middag(datum: string) {
    let beste = { hoogte: -90, azimut: 0, minuten: 0 };
    for (let minuten = 0; minuten < 1440; minuten++) {
      const stand = zonnestand(brusselseTijd(datum, minuten), BRUSSEL);
      if (stand.hoogte > beste.hoogte) beste = { ...stand, minuten };
    }
    return beste;
  }

  it("staat op 21 juni om 13:44 op 62,6° in het zuiden", () => {
    const stand = middag("2026-06-21");
    expect(stand.hoogte).toBeCloseTo(62.6, 1);
    expect(Math.abs(stand.azimut - 180)).toBeLessThan(1);
    expect(uurtekst(stand.minuten)).toBe("13:44");
  });

  it("staat op 21 december om 12:41 op 15,8° in het zuiden", () => {
    const stand = middag("2026-12-21");
    expect(Math.abs(stand.hoogte - 15.77)).toBeLessThan(0.1);
    expect(Math.abs(stand.azimut - 180)).toBeLessThan(1);
    expect(uurtekst(stand.minuten)).toBe("12:41");
  });

  it("komt 's ochtends op in het oosten en gaat 's avonds onder in het westen", () => {
    const ochtend = zonnestand(brusselseTijd("2026-03-21", 8 * 60), BRUSSEL);
    const avond = zonnestand(brusselseTijd("2026-03-21", 18 * 60), BRUSSEL);
    expect(ochtend.azimut).toBeGreaterThan(90);
    expect(ochtend.azimut).toBeLessThan(135);
    expect(avond.azimut).toBeGreaterThan(225);
    expect(avond.azimut).toBeLessThan(270);
    expect(zonnestand(brusselseTijd("2026-03-21", 0), BRUSSEL).hoogte).toBeLessThan(-30);
  });

  it("komt op en gaat onder zoals de tabellen zeggen, op twee minuten", () => {
    const binnen = (minuten: number, uur: number, minuut: number) => expect(Math.abs(minuten - (uur * 60 + minuut))).toBeLessThanOrEqual(2);
    const juni = zonOpEnOnder("2026-06-21", BRUSSEL)!;
    binnen(juni.op, 5, 29);
    binnen(juni.onder, 21, 59);
    const december = zonOpEnOnder("2026-12-21", BRUSSEL)!;
    binnen(december.op, 8, 44);
    binnen(december.onder, 16, 39);
  });

  it("noemt de windrichting", () => {
    expect(windrichting(0)).toBe("het noorden");
    expect(windrichting(100)).toBe("het oosten");
    expect(windrichting(225)).toBe("het zuidwesten");
    expect(windrichting(350)).toBe("het noorden");
  });
});

describe("de zon in de scène", () => {
  it("komt uit het zuiden als het noorden boven op het plan ligt", () => {
    const [x, y, z] = zonRichting({ azimut: 180, hoogte: 0 }, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  it("draait mee met het noorden op het terrein", () => {
    // Het noorden rechts op het plan: het zuiden is dan links.
    const [x, , z] = zonRichting({ azimut: 180, hoogte: 30 }, 90);
    expect(x).toBeCloseTo(-Math.cos(Math.PI / 6), 9);
    expect(z).toBeCloseTo(0, 9);
    const [, y] = zonRichting({ azimut: 180, hoogte: 90 }, 37);
    expect(y).toBeCloseTo(1, 9);
  });

  it("dooft onder de horizon, met schemer", () => {
    expect(daglicht(-10).zon).toBe(0);
    expect(daglicht(-10).hemel).toBeCloseTo(0.35, 9);
    expect(daglicht(40)).toEqual({ zon: 1, hemel: 1, laag: 0 });
    expect(daglicht(3).laag).toBeGreaterThan(0.8);
  });

  it("maakt het schaduwvak groter met de omgeving, tot 60 m", () => {
    const huis = { x0: 0, y0: 0, x1: 12, y1: 9, z1: 7 };
    expect(schaduwvak(huis, false)).toEqual({ midden: [6, 4.5], straal: 12 });
    expect(schaduwvak(huis, true).straal).toBe(36);
    expect(schaduwvak({ x0: 0, y0: 0, x1: 200, y1: 10, z1: 7 }, true).straal).toBe(200);
  });
});
