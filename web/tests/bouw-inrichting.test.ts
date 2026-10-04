import { describe, expect, it } from "vitest";

import { assen, obstakels, tegenMuur, voetafdruk } from "@/lib/bouw/drie/inrichten";
import { vereniging, type Veelhoek } from "@/lib/bouw/drie/vlak";
import { wandel, type Wandelstand, type Wandelverdieping } from "@/lib/bouw/drie/wandelen";
import {
  GROEPEN,
  hoekVan,
  LAAG_VAN_GROEP,
  laagVan,
  maattekst,
  MAX_STUKKEN,
  nieuwStuk,
  schoneStukken,
  soortStuk,
  STUKSOORTEN,
  type Stuk,
} from "@/lib/bouw/inrichting";
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

const stuk = (soort: string, x: number, y: number, wijziging: Partial<Stuk> = {}): Stuk => ({
  ...nieuwStuk(soortStuk(soort)!, [x, y], -1, -0.24),
  ...wijziging,
});

describe("de catalogus van meubels en toestellen", () => {
  it("heeft unieke soorten in de vorm die de databank aanvaardt", () => {
    const soorten = STUKSOORTEN.map((s) => s.soort);
    expect(new Set(soorten).size).toBe(soorten.length);
    for (const soort of soorten) expect(soort).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
  });

  it("geeft elk stuk een groep, een laag en een maat", () => {
    for (const s of STUKSOORTEN) {
      expect(GROEPEN).toContain(s.groep);
      expect(s.maat.every((m) => m > 0 && m <= 30)).toBe(true);
    }
    expect(laagVan("bed_2p")).toBe("meubels");
    expect(laagVan("warmtepomp_buiten")).toBe("toestellen");
    expect(laagVan("verdwenen")).toBe("meubels");
    expect(new Set(GROEPEN.map((g) => LAAG_VAN_GROEP[g]))).toEqual(new Set(["meubels", "toestellen"]));
  });

  it("zet een nieuw stuk op de vloer, aan de muur, op de grond of erin", () => {
    expect(stuk("eettafel", 2, 1.5)).toMatchObject({ x: 2, y: 1.5, z: 0, hoek: 0, breedte: 1.8, diepte: 0.9, hoogte: 0.75 });
    expect(stuk("verdeelkast", 2, 1.5).z).toBe(1);
    expect(stuk("warmtepomp_buiten", 6, 1).z).toBe(-0.24);
    // De put zit in de grond, met zijn bovenkant gelijk met de grond.
    const put = stuk("regenwaterput", 6, 4);
    expect(put.z + put.hoogte).toBeCloseTo(-0.24, 9);
  });

  it("schrijft de maat in centimeter", () => {
    expect(maattekst(stuk("bed_2p", 0, 0))).toBe("160 × 200 cm, 50 hoog");
  });
});

describe("stukken nakijken", () => {
  it("houdt een goed stuk, afgerond zoals de databank het bewaart", () => {
    const [schoon] = schoneStukken([
      { id: 12, soort: "kast", x: 1.23456, y: "2,5".replace(",", "."), z: 0, hoek: 270, kanteling: 0, breedte: 1.004, diepte: 0.4, hoogte: 2, label: "  Boeken  " },
    ]);
    expect(schoon).toEqual({ id: 12, soort: "kast", x: 1.235, y: 2.5, z: 0, hoek: -90, kanteling: 0, breedte: 1, diepte: 0.4, hoogte: 2, label: "Boeken" });
  });

  it("laat weg wat niet klopt", () => {
    const goed = { id: -3, soort: "bed_1p", x: 1, y: 1, z: 0, hoek: 0, kanteling: 0, breedte: 0.9, diepte: 2, hoogte: 0.5, label: null };
    expect(schoneStukken([goed])).toHaveLength(1);
    for (const fout of [
      { soort: "ruimteschip" },
      { id: 0 },
      { id: 1.5 },
      { x: Number.NaN },
      { y: 5000 },
      { z: -20 },
      { breedte: 0 },
      { hoogte: 31 },
      { kanteling: 95 },
      { hoek: "noord" },
    ]) {
      expect(schoneStukken([{ ...goed, ...fout }])).toEqual([]);
    }
    expect(schoneStukken({ niet: "een lijst" })).toEqual([]);
    expect(schoneStukken([null, 7, "tekst"])).toEqual([]);
  });

  it("knipt een te lang label af, en houdt hoogstens 300 stukken", () => {
    const [metLabel] = schoneStukken([{ ...stuk("kast", 1, 1), label: "x".repeat(200) }]);
    expect(metLabel.label).toHaveLength(80);
    const veel = Array.from({ length: MAX_STUKKEN + 5 }, (_, i) => stuk("kast", 1, 1, { id: -(i + 1) }));
    expect(schoneStukken(veel)).toHaveLength(MAX_STUKKEN);
  });

  it("brengt een hoek tussen -180 en 180 graden", () => {
    expect(hoekVan(0)).toBe(0);
    expect(hoekVan(-0.01)).toBe(0);
    expect(hoekVan(180)).toBe(180);
    expect(hoekVan(-180)).toBe(180);
    expect(hoekVan(540)).toBe(180);
    expect(hoekVan(-90)).toBe(-90);
    expect(hoekVan(190.04)).toBe(-170);
  });
});

describe("een stuk op zijn plaats", () => {
  it("heeft zijn rug bovenaan op het plan bij hoek 0, en draait met de klok mee", () => {
    expect(voetafdruk({ x: 2, y: 1, hoek: 0, breedte: 1.6, diepte: 2 })).toEqual([
      [1.2, 0],
      [2.8, 0],
      [2.8, 2],
      [1.2, 2],
    ]);
    // Een kwartslag met de klok mee: de rug staat rechts, de voorkant kijkt naar links.
    const [linksachter, rechtsachter] = voetafdruk({ x: 2, y: 1, hoek: 90, breedte: 1.6, diepte: 2 });
    expect(linksachter[0]).toBeCloseTo(3, 9);
    expect(linksachter[1]).toBeCloseTo(0.2, 9);
    expect(rechtsachter[0]).toBeCloseTo(3, 9);
    expect(rechtsachter[1]).toBeCloseTo(1.8, 9);
    const { v } = assen(90);
    expect(v[0]).toBeCloseTo(-1, 9);
  });

  it("zet een bed met het hoofdeinde tegen de dichtste muur", () => {
    const bed = tegenMuur(stuk("bed_2p", 2, 1.4, { hoek: 25 }), MUREN);
    expect(bed).toMatchObject({ x: 2, y: 1.005, hoek: 0 });
  });

  it("draait een kast naar de muur waar ze het dichtst bij staat", () => {
    const kast = tegenMuur(stuk("kast", 0.6, 1.5, { hoek: 30 }), MUREN);
    expect(kast).toMatchObject({ x: 0.205, y: 1.5, hoek: -90 });
    const rechts = tegenMuur(stuk("kast", 3.5, 1.5), MUREN);
    expect(rechts).toMatchObject({ x: 3.795, y: 1.5, hoek: 90 });
  });

  it("schuift in een hoek ook tegen de muur ernaast", () => {
    const kast = tegenMuur(stuk("kast", 0.65, 0.35), MUREN);
    expect(kast).toMatchObject({ x: 0.505, y: 0.205, hoek: 0 });
    // Wat in de muur ernaast stak, komt eruit.
    const erin = tegenMuur(stuk("kast", 0.4, 0.3), MUREN);
    expect(erin).toMatchObject({ x: 0.505, y: 0.205, hoek: 0 });
    // Dichter bij de linkermuur: dan gaat de rug daartegen, en de zijkant tegen de bovenste.
    expect(tegenMuur(stuk("kast", 0.3, 0.35), MUREN)).toMatchObject({ x: 0.205, y: 0.505, hoek: -90 });
  });

  it("blijft staan zonder muur in de buurt", () => {
    expect(tegenMuur(stuk("salontafel", 2, 1.5), MUREN, 0.5)).toBeNull();
    expect(tegenMuur(stuk("salontafel", 2, 1.5), [])).toBeNull();
  });
});

describe("rondwandelen tussen de meubels", () => {
  it("houdt enkel tegen wat hoger is dan 30 cm en niet hoog hangt", () => {
    const stukken = [
      stuk("bed_2p", 2, 1),
      stuk("verdeelkast", 1, 0.2),
      stuk("salontafel", 2, 2, { hoogte: 0.02 }),
      stuk("regenwaterput", 8, 2),
    ];
    expect(obstakels(stukken)).toEqual([[voetafdruk(stukken[0])]]);
  });

  const wereld: Wandelverdieping[] = [
    { id: 1, gebouwId: 1, z0: 0, muren: [], gaten: [], trappen: [], obstakels: [[rh(2, 0, 3, 1)]] },
  ];
  const loop = (stand: Wandelstand, dx: number, keer: number) => {
    let s = stand;
    for (let i = 0; i < keer; i++) s = wandel(wereld, s, dx, 0);
    return s;
  };

  it("loopt niet door een kast", () => {
    const na = loop({ verdieping: 1, x: 1, y: 0.5, trap: null }, 0.1, 20);
    expect(na.x).toBeLessThan(1.81);
    expect(na.x).toBeGreaterThan(1.69);
  });

  it("stapt eruit als je erin begon, maar niet terug", () => {
    const eruit = loop({ verdieping: 1, x: 2.5, y: 0.5, trap: null }, 0.1, 12);
    expect(eruit.x).toBeGreaterThan(3.3);
    const terug = loop(eruit, -0.1, 12);
    expect(terug.x).toBeGreaterThan(3.15);
  });
});
