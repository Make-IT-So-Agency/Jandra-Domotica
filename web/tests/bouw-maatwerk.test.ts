import { describe, expect, it } from "vitest";

import { kastdelen, keukendelen, kolomdelen, plankdelen, schoneIndeling, toestellenVan, type Blok, type Rol } from "@/lib/bouw/drie/maatwerk";
import { nieuwStuk, schoneStukken, soortStuk } from "@/lib/bouw/inrichting";

const van = (delen: readonly Blok[], rol: Rol) => delen.filter((d) => d.rol === rol);
const breedte = (b: Blok) => b.x1 - b.x0;

describe("een indeling nakijken", () => {
  it("houdt wat klopt, rondt af, en zet de sleutels in vaste volgorde", () => {
    const ind = schoneIndeling({
      wangen: true,
      fronten: 3,
      nis: { van: 1, tot: 2, onder: 0.9004, boven: 1.5, legger: true },
      open: { kant: "rechts", breedte: 0.4012, planken: 4 },
      blad: 0.0123,
      bladmateriaal: { naam: "Keramiek", kleur: "#D9CDB8", patroon: null, voegkleur: null, optieId: null },
      kookplaat: "midden",
      onbekend: 7,
    });
    expect(ind).toEqual({
      fronten: 3,
      open: { kant: "rechts", breedte: 0.4, planken: 4 },
      nis: { van: 1, tot: 2, onder: 0.9, boven: 1.5, legger: true },
      kookplaat: "midden",
      blad: 0.012,
      wangen: true,
      bladmateriaal: { naam: "Keramiek", kleur: "#d9cdb8", patroon: null, voegkleur: null, optieId: null },
    });
    expect(Object.keys(ind!)).toEqual(["fronten", "open", "nis", "kookplaat", "blad", "wangen", "bladmateriaal"]);
  });

  it("laat weg wat niet klopt, en geeft null zonder iets", () => {
    expect(
      schoneIndeling({
        fronten: 0,
        open: { kant: "boven", breedte: 0.4, planken: 2 },
        nis: { van: 3, tot: 2, onder: 1, boven: 1.5, legger: false },
        toestel: "magnetron",
        kookplaat: "achter",
        spatwand: 9,
        blad: 0.5,
        overstek: { kant: "rechts", lengte: 3 },
        vaatwasser: "ja",
      }),
    ).toBeNull();
    expect(schoneIndeling(null)).toBeNull();
    expect(schoneIndeling([1, 2])).toBeNull();
    // Een nis van minder dan 15 cm hoog is geen nis.
    expect(schoneIndeling({ nis: { van: 1, tot: 1, onder: 1, boven: 1.1, legger: false } })).toBeNull();
    expect(schoneIndeling({ toestel: "twee", toestelhoogte: 0.95 })).toEqual({ toestel: "twee", toestelhoogte: 0.95 });
  });

  it("gaat mee met een stuk, en een kastenwand begint met een open vak", () => {
    const maatkast = soortStuk("maatkast")!;
    const stuk = nieuwStuk(maatkast, [2, 1], -1, -0.2);
    expect(stuk.indeling).toEqual({ fronten: 3, open: { kant: "rechts", breedte: 0.4, planken: 4 }, plint: 0.08 });
    const [schoon] = schoneStukken([{ ...stuk, indeling: { ...stuk.indeling, kookplaat: "links", fronten: 99 } }]);
    expect(schoon.indeling).toEqual({ open: { kant: "rechts", breedte: 0.4, planken: 4 }, plint: 0.08, kookplaat: "links" });
    expect(soortStuk("keuken_hoog")?.vorm).toBe("kolom");
    expect(soortStuk("legger")).toMatchObject({ vorm: "plank", z: 1.45 });
  });
});

describe("een kast in delen", () => {
  const maat = { breedte: 2.2, diepte: 0.6, hoogte: 2.8 };

  it("zonder indeling: een front per halve meter, met een greep", () => {
    const delen = kastdelen(maat, null);
    expect(van(delen, "front")).toHaveLength(4);
    expect(van(delen, "greep")).toHaveLength(4);
    expect(van(delen, "plank")).toHaveLength(0);
    // Alles binnen het stuk.
    for (const d of delen) {
      expect(d.x0).toBeGreaterThanOrEqual(-1.1 - 1e-9);
      expect(d.x1).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(d.z1).toBeLessThanOrEqual(0.3 + 0.0031);
    }
  });

  it("een vestiaire: drie fronten en rechts een open vak met vier legplanken, op een plint", () => {
    const delen = kastdelen(maat, { fronten: 3, open: { kant: "rechts", breedte: 0.4, planken: 4 }, plint: 0.08 });
    const fronten = van(delen, "front");
    expect(fronten).toHaveLength(3);
    // Samen de breedte zonder het open vak, met een spleet van 6 mm.
    for (const f of fronten) expect(breedte(f)).toBeCloseTo(0.6 - 0.006);
    expect(fronten[2].x1).toBeCloseTo(0.7 - 0.003);
    expect(Math.min(...fronten.map((f) => f.y0))).toBeCloseTo(0.083);
    // Het open vak: twee zijkanten, een bodem, een bovenkant en vier legplanken.
    const planken = van(delen, "plank");
    expect(planken).toHaveLength(8);
    expect(planken.every((p) => p.x0 >= 0.7 - 1e-9)).toBe(true);
    expect(van(delen, "plint")).toHaveLength(1);
  });

  it("een koffiehoek: een nis over de eerste twee fronten, met een legger, het blad achteraan en licht", () => {
    const delen = kastdelen({ breedte: 3, diepte: 0.6, hoogte: 2.7 }, { fronten: 5, nis: { van: 1, tot: 2, onder: 0.9, boven: 1.6, legger: true } });
    const fronten = van(delen, "front");
    // De twee fronten van de nis zijn in twee: onder en boven de nis.
    expect(fronten).toHaveLength(7);
    const links = fronten.filter((f) => f.x0 < -1.5 + 1.2);
    expect(links.map((f) => [f.y0, f.y1].map((y) => Math.round(y * 1000) / 1000))).toEqual([
      [0.003, 0.897],
      [1.603, 2.697],
      [0.003, 0.897],
      [1.603, 2.697],
    ]);
    const rug = van(delen, "nisrug");
    expect(rug).toHaveLength(1);
    expect(rug[0]).toMatchObject({ y0: 0.9, y1: 1.6 });
    expect(rug[0].x0).toBeCloseTo(-1.5);
    expect(rug[0].x1).toBeCloseTo(-0.3);
    expect(van(delen, "blad")).toHaveLength(1);
    expect(van(delen, "led")).toHaveLength(1);
    expect(van(delen, "plank")).toHaveLength(1);
    // Niets donkers voor de nis: de strook achter de fronten loopt eromheen.
    const voorNis = van(delen, "naad").filter((n) => n.x0 < -0.3 - 1e-9 && n.x1 > -1.5 + 1e-9 && n.y0 < 1.6 && n.y1 > 0.9);
    expect(voorNis).toEqual([]);
  });

  it("negeert een nis die niet past", () => {
    const delen = kastdelen(maat, { fronten: 2, nis: { van: 3, tot: 4, onder: 0.9, boven: 1.6, legger: false } });
    expect(van(delen, "nisrug")).toHaveLength(0);
    expect(van(delen, "front")).toHaveLength(2);
  });
});

describe("de keuken in delen", () => {
  it("zonder indeling: een kookplaat links, zoals vroeger", () => {
    const delen = keukendelen({ breedte: 2.4, diepte: 0.62, hoogte: 0.9 }, null, false);
    expect(van(delen, "kookplaat")).toHaveLength(1);
    expect(van(delen, "kookplaat")[0].x1).toBeLessThan(0);
    expect(van(delen, "front")).toHaveLength(4);
    expect(van(delen, "spoelbak")).toHaveLength(0);
  });

  it("een keukenwand: spoelbak in het midden, lades, een spatwand in het blad", () => {
    const delen = keukendelen({ breedte: 1.8, diepte: 0.62, hoogte: 0.92 }, { fronten: 3, lades: 2, spoelbak: "midden", spatwand: 1.2, blad: 0.012 }, false);
    expect(van(delen, "front")).toHaveLength(6);
    const bak = van(delen, "spoelbak")[0];
    expect((bak.x0 + bak.x1) / 2).toBeCloseTo(0);
    expect(van(delen, "kraan")).toHaveLength(2);
    // Het werkblad en de spatwand, tegen de rug, tot 1,20 m boven het blad.
    const blad = van(delen, "blad");
    expect(blad).toHaveLength(2);
    expect(blad[0]).toMatchObject({ y0: 0.92 - 0.012, y1: 0.92 });
    expect(blad[1].y1).toBeCloseTo(0.92 + 1.2);
    expect(blad[1].z0).toBeCloseTo(-0.31);
  });

  it("een eiland: de kookplaat, een overstek rechts zonder kasten, en wangen tot op de vloer", () => {
    const delen = keukendelen({ breedte: 3.2, diepte: 1, hoogte: 0.92 }, { kookplaat: "midden", overstek: { kant: "rechts", lengte: 0.9 }, wangen: true, blad: 0.035 }, true);
    const kasten = van(delen, "corpus")[0];
    expect(kasten.x1).toBeCloseTo(1.6 - 0.9);
    const blad = van(delen, "blad");
    // Twee wangen en het werkblad; geen spatwand bij een eiland.
    expect(blad).toHaveLength(3);
    expect(blad.filter((b) => b.y0 === 0)).toHaveLength(2);
    const plaat = van(delen, "kookplaat")[0];
    expect((plaat.x0 + plaat.x1) / 2).toBeCloseTo((-1.6 + 0.035 + 0.7) / 2);
    expect(plaat.x1 - plaat.x0).toBeCloseTo(0.8);
  });

  it("een eiland met een overstek achteraan: de kasten staan vooraan", () => {
    const delen = keukendelen({ breedte: 2.4, diepte: 1.2, hoogte: 0.9 }, { overstek: { kant: "achter", lengte: 0.35 } }, true);
    expect(van(delen, "corpus")[0].z0).toBeCloseTo(-0.6 + 0.35);
  });
});

describe("een kolomkast", () => {
  const maat = { breedte: 0.6, diepte: 0.6, hoogte: 2.77 };

  it("met twee compacte ovens, en fronten erboven en eronder", () => {
    const delen = kolomdelen(maat, { toestel: "twee", toestelhoogte: 0.95 });
    const ovens = van(delen, "toestel");
    expect(ovens).toHaveLength(2);
    expect(ovens[0].y0).toBeCloseTo(0.954);
    expect(ovens[1].y1).toBeCloseTo(0.95 + 0.9 - 0.004);
    expect(van(delen, "front")).toHaveLength(2);
    expect(van(delen, "scherm")).toHaveLength(2);
  });

  it("met een oven die niet onder de vloer of boven de kast komt", () => {
    const ovens = van(kolomdelen(maat, { toestel: "oven", toestelhoogte: 2.5 }), "toestel");
    expect(ovens[0].y1).toBeLessThanOrEqual(2.77);
    const laag = van(kolomdelen(maat, { toestel: "compact", toestelhoogte: 0 }), "toestel");
    expect(laag[0].y0).toBeGreaterThanOrEqual(0.1);
  });

  it("met de koelkast: een deur van 178 cm en een kast erboven", () => {
    const fronten = van(kolomdelen(maat, { toestel: "koelkast" }), "front");
    expect(fronten).toHaveLength(2);
    expect(fronten[0].y1).toBeCloseTo(1.9 - 0.003);
  });

  it("een legger is één plank", () => {
    expect(plankdelen({ breedte: 1.8, diepte: 0.25, hoogte: 0.04 })).toEqual([{ rol: "front", x0: -0.9, x1: 0.9, y0: 0, y1: 0.04, z0: -0.125, z1: 0.125 }]);
  });
});

describe("de toestellen voor Technieken", () => {
  it("telt de ovens, de koelkast, de kookplaat en de vaatwasser", () => {
    expect(toestellenVan("kolom", { toestel: "twee" })).toEqual(["oven", "oven"]);
    expect(toestellenVan("kolom", { toestel: "compact" })).toEqual(["oven"]);
    expect(toestellenVan("kolom", { toestel: "koelkast" })).toEqual(["koelkast"]);
    expect(toestellenVan("keuken", { kookplaat: "links", vaatwasser: true, spoelbak: "rechts" })).toEqual(["kookplaat", "vaatwasser"]);
    expect(toestellenVan("keuken", null)).toEqual([]);
    expect(toestellenVan("kast", { fronten: 3 })).toEqual([]);
  });
});
