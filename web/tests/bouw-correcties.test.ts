import { describe, expect, it } from "vitest";

import {
  eindeOpMuur,
  muurLangs,
  opMuur,
  pasCorrectiesToe,
  rechtGezet,
  schoneCorrecties,
  stukVanMuur,
  type Correctie,
} from "@/lib/bouw/drie/correcties";
import { hartVan, vindGaten, type Gat } from "@/lib/bouw/drie/gaten";
import { maakModel, type Invoerverdieping } from "@/lib/bouw/drie/model";
import { binnenVeelhoeken, vereniging, type Veelhoek } from "@/lib/bouw/drie/vlak";
import { nettoOppervlakte } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";

/**
 * Muren, ramen en deuren verbeteren na het omzetten. Hetzelfde verzonnen huis
 * als in bouw-drie.test.ts: twee ruimtes, buitenmuren van 40 cm met een raam
 * links en een voordeur onderaan, en een binnenmuur van 14 cm met een deur.
 */

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const LINKS = { id: 1, naam: "leefruimte", soort: "leefruimte" as const, ringen: [rechthoek(0.4, 0.4, 5, 7.6)], plafondhoogte: null };
const RECHTS = { id: 2, naam: "keuken", soort: "keuken" as const, ringen: [rechthoek(5.14, 0.4, 9.6, 7.6)], plafondhoogte: null };
const RINGEN: Xy[][] = [
  rechthoek(0, 0, 10, 0.4),
  rechthoek(9.6, 0.4, 10, 7.6),
  rechthoek(0, 7.6, 7, 8),
  rechthoek(8, 7.6, 10, 8),
  rechthoek(0, 0.4, 0.4, 2),
  rechthoek(0, 4, 0.4, 7.6),
  rechthoek(5, 0.4, 5.14, 3),
  rechthoek(5, 3.9, 5.14, 7.6),
];
const MUREN: Veelhoek[] = vereniging(RINGEN.map((ring) => [ring]));
const RUIMTES = [LINKS, RECHTS];
const OPENINGEN = [
  { soort: "deur" as const, x: 5.14, y: 3.9, breedte: 0.9, hoogte: null },
  { soort: "deur" as const, x: 8, y: 7.6, breedte: 1, hoogte: null },
  { soort: "raam" as const, x: -0.4, y: 3, breedte: 2, hoogte: 1.25 },
];
const PLAFOND = 2.8;

const oppervlakteVan = (veelhoeken: readonly Veelhoek[]) => veelhoeken.reduce((som, v) => som + nettoOppervlakte(v), 0);
const toepassen = (correcties: Correctie[]) => pasCorrectiesToe(MUREN, RUIMTES, OPENINGEN, PLAFOND, correcties);
const breedte = (gat: Gat) => Math.hypot(gat.b[0] - gat.a[0], gat.b[1] - gat.a[1]);
const bij = (gaten: Gat[], p: Xy, max = 0.4) => gaten.find((gat) => Math.hypot(hartVan(gat)[0] - p[0], hartVan(gat)[1] - p[1]) <= max);

describe("correcties inlezen", () => {
  it("houdt wat klopt, op een millimeter", () => {
    const ruw = [
      { soort: "muur", a: [1.00049, 2], b: [4, 2], dikte: 0.14 },
      { soort: "weg", a: [5.07, 0.4], b: [5.07, 3] },
      { soort: "opening", a: [9.8, 2], b: [9.8, 3.2], gat: "raam", onder: 0.9, boven: 2.15 },
      { soort: "gat", x: 0.2, y: 3, gat: "raam", onder: 0.5, boven: 2.3 },
      { soort: "gat", x: 7.5, y: 7.8, gat: "buitendeur", onder: 0, boven: 2.15, breedte: 1.6 },
      { soort: "dicht", x: 5.07, y: 3.45 },
    ];
    const schoon = schoneCorrecties(ruw);
    expect(schoon).toHaveLength(6);
    expect(schoon[0]).toEqual({ soort: "muur", a: [1, 2], b: [4, 2], dikte: 0.14 });
    expect(schoon[4]).toEqual({ soort: "gat", x: 7.5, y: 7.8, gat: "buitendeur", onder: 0, boven: 2.15, breedte: 1.6 });
  });

  it("houdt hoe een deur draait, enkel wat aan staat", () => {
    const schoon = schoneCorrecties([
      { soort: "gat", x: 5.07, y: 3.45, gat: "deur", onder: 0, boven: 2.15, draai: { scharnier: true, kant: false } },
      { soort: "opening", a: [9.8, 2], b: [9.8, 3], gat: "buitendeur", onder: 0, boven: 2.15, draai: { kant: true, extra: 1 } },
      { soort: "gat", x: 1, y: 1, gat: "deur", onder: 0, boven: 2.15, draai: { scharnier: "ja" } },
    ]);
    expect(schoon.map((c) => ("draai" in c ? c.draai : undefined))).toEqual([{ scharnier: true }, { kant: true }, undefined]);
  });

  it("laat weg wat niet klopt", () => {
    expect(
      schoneCorrecties([
        { soort: "toren", a: [0, 0], b: [1, 1] },
        { soort: "muur", a: [0, 0], b: [0, 0.01], dikte: 0.14 },
        { soort: "muur", a: [0, 0], b: [3, 0], dikte: 2 },
        { soort: "muur", a: ["x", 0], b: [3, 0], dikte: 0.14 },
        { soort: "opening", a: [0, 0], b: [0.2, 0], gat: "raam", onder: 0.9, boven: 2.1 },
        { soort: "opening", a: [0, 0], b: [1, 0], gat: "poort", onder: 0, boven: 2.1 },
        { soort: "gat", x: 1, y: 1, gat: "raam", onder: 2, boven: 2.05 },
        { soort: "gat", x: 1, y: 1, gat: "deur", onder: 0, boven: 2.1, breedte: 40 },
        { soort: "dicht", x: 1e6, y: 1 },
        null,
        "muur",
      ]),
    ).toEqual([]);
    expect(schoneCorrecties("geen lijst")).toEqual([]);
    expect(schoneCorrecties(Array.from({ length: 250 }, () => ({ soort: "dicht", x: 1, y: 1 })))).toHaveLength(200);
  });
});

describe("rekenen langs een muur", () => {
  it("vindt de as en de dikte van een muur, ook als je er net naast tikt", () => {
    const erin = opMuur(MUREN, [5.1, 1.5])!;
    expect(erin.dikte).toBeCloseTo(0.14, 3);
    expect(erin.punt[0]).toBeCloseTo(5.07, 3);
    expect(erin.punt[1]).toBeCloseTo(1.5, 3);
    expect(Math.abs(erin.richting[1])).toBeCloseTo(1, 6);
    const ernaast = opMuur(MUREN, [5.3, 1.5])!;
    expect(ernaast.punt[0]).toBeCloseTo(5.07, 3);
    expect(opMuur(MUREN, [3, 3])).toBeNull();
    expect(opMuur(MUREN, [0.2, 5])!.dikte).toBeCloseTo(0.4, 3);
  });

  it("neemt het stuk tot waar een andere muur aansluit, of de muur ophoudt", () => {
    const stuk = stukVanMuur(MUREN, opMuur(MUREN, [5.07, 1.5])!);
    const [y0, y1] = [Math.min(stuk.a[1], stuk.b[1]), Math.max(stuk.a[1], stuk.b[1])];
    expect(y0).toBeGreaterThan(0.35);
    expect(y0).toBeLessThan(0.5);
    expect(y1).toBeGreaterThan(2.95);
    expect(y1).toBeLessThanOrEqual(3);
    expect(stuk.dikte).toBeCloseTo(0.14, 3);
  });

  it("zet een nieuwe muur recht, en laat ze doorlopen tot de as van een muur", () => {
    const recht = rechtGezet([1, 1], [5, 1.2], MUREN);
    expect(recht[1]).toBeCloseTo(1, 3);
    expect(recht[0]).toBeCloseTo(1 + Math.hypot(4, 0.2), 3);
    expect(rechtGezet([1, 1], [5, 2], MUREN)).toEqual([5, 2]);
    const einde = eindeOpMuur([6, 2], [9.5, 2], MUREN);
    expect(einde[0]).toBeCloseTo(9.8, 3);
    expect(einde[1]).toBeCloseTo(2, 3);
    expect(eindeOpMuur([6, 2], [8, 2], MUREN)).toEqual([8, 2]);
  });
});

describe("correcties toepassen", () => {
  it("verandert niets zonder correcties", () => {
    const uit = toepassen([]);
    expect(uit.gaten).toEqual(vindGaten(RUIMTES, MUREN, OPENINGEN, PLAFOND));
    expect(uit.open).toEqual([]);
  });

  it("zet een muur erbij", () => {
    const uit = toepassen([{ soort: "muur", a: [0.2, 5], b: [5.07, 5], dikte: 0.14 }]);
    expect(oppervlakteVan(uit.muren) - oppervlakteVan(MUREN)).toBeCloseTo((5 - 0.4) * 0.14, 2);
    expect(binnenVeelhoeken([2.5, 5], uit.muren)).toBe(true);
    expect(uit.verslag).toEqual([true]);
  });

  it("haalt een stuk muur weg: een doorgang tot het plafond, met vloer", () => {
    const uit = toepassen([{ soort: "weg", a: [5.07, 0.4], b: [5.07, 3] }]);
    expect(binnenVeelhoeken([5.07, 1.5], uit.muren)).toBe(false);
    expect(oppervlakteVan(uit.open)).toBeCloseTo(2.6 * 0.14, 2);
    const doorgang = bij(uit.gaten, [5.07, 2.15], 0.6)!;
    expect(doorgang.soort).toBe("doorgang");
    expect(doorgang.onder).toBe(0);
    expect(doorgang.boven).toBe(PLAFOND);
    expect(breedte(doorgang)).toBeCloseTo(3.5, 1);
  });

  it("haalt ook een stuk weg dat over een deur loopt", () => {
    // Van de bovenmuur tot onderaan: het midden ligt in de deur.
    const uit = toepassen([{ soort: "weg", a: [5.07, 0.4], b: [5.07, 6.5] }]);
    expect(uit.verslag).toEqual([true]);
    expect(binnenVeelhoeken([5.07, 1.5], uit.muren)).toBe(false);
    expect(binnenVeelhoeken([5.07, 5], uit.muren)).toBe(false);
    expect(binnenVeelhoeken([5.07, 7], uit.muren)).toBe(true);
  });

  it("snijdt een raam uit een buitenmuur, met de gekozen hoogtes", () => {
    const uit = toepassen([{ soort: "opening", a: [9.8, 2], b: [9.8, 3.2], gat: "raam", onder: 0.6, boven: 2.3 }]);
    const raam = bij(uit.gaten, [9.8, 2.6])!;
    expect(raam).toMatchObject({ soort: "raam", onder: 0.6, boven: 2.3 });
    expect(breedte(raam)).toBeCloseTo(1.2, 1);
    expect(oppervlakteVan(MUREN) - oppervlakteVan(uit.muren)).toBeCloseTo(1.2 * 0.4, 2);
  });

  it("maakt een deur in een nieuwe muur midden in een ruimte", () => {
    const uit = toepassen([
      { soort: "muur", a: [6, 2], b: [9, 2], dikte: 0.14 },
      { soort: "opening", a: [7, 2], b: [7.9, 2], gat: "deur", onder: 0, boven: 2.15 },
    ]);
    const deur = bij(uit.gaten, [7.45, 2])!;
    expect(deur.soort).toBe("deur");
    expect(deur.dikte).toBeCloseTo(0.14, 3);
    expect(breedte(deur)).toBeCloseTo(0.9, 2);
    expect(binnenVeelhoeken([7.45, 2], uit.muren)).toBe(false);
    expect(uit.verslag).toEqual([true, true]);
  });

  it("maakt een opening dicht", () => {
    const voor = bij(toepassen([]).gaten, [5.07, 3.45])!;
    expect(voor.soort).toBe("deur");
    const uit = toepassen([{ soort: "dicht", x: 5.07, y: 3.45 }]);
    expect(bij(uit.gaten, [5.07, 3.45])).toBeUndefined();
    expect(binnenVeelhoeken([5.07, 3.45], uit.muren)).toBe(true);
  });

  it("geeft een gevonden opening andere hoogtes, of een andere breedte", () => {
    const raam = bij(toepassen([{ soort: "gat", x: 0.2, y: 3, gat: "raam", onder: 0.5, boven: 2.3 }]).gaten, [0.2, 3])!;
    expect(raam).toMatchObject({ soort: "raam", onder: 0.5, boven: 2.3 });
    const breder = bij(toepassen([{ soort: "gat", x: 7.5, y: 7.8, gat: "buitendeur", onder: 0, boven: 2.4, breedte: 1.6 }]).gaten, [7.5, 7.8])!;
    expect(breder).toMatchObject({ soort: "buitendeur", onder: 0, boven: 2.4 });
    expect(breedte(breder)).toBeCloseTo(1.6, 1);
  });

  it("zegt welke correctie niets meer raakt", () => {
    const uit = toepassen([
      { soort: "weg", a: [3, 3], b: [4, 3] },
      { soort: "dicht", x: 3, y: 3 },
      { soort: "gat", x: 3, y: 3, gat: "deur", onder: 0, boven: 2.1 },
      { soort: "opening", a: [2, 3], b: [3, 3], gat: "deur", onder: 0, boven: 2.1 },
      { soort: "muur", a: [1, 6], b: [3, 6], dikte: 0.09 },
    ]);
    expect(uit.verslag).toEqual([false, false, false, false, true]);
  });
});

describe("correcties in het model", () => {
  const verdieping = (over: Partial<Invoerverdieping> = {}): Invoerverdieping => ({
    id: 10,
    naam: "Gelijkvloers",
    gebouwId: 1,
    volgorde: 0,
    vloerpeil: 0,
    plafondhoogte: PLAFOND,
    verdiepingshoogte: 3.2,
    ruimtes: RUIMTES,
    muren: RINGEN,
    openingen: OPENINGEN,
    ...over,
  });
  const DAK = { type: "plat" as const, helling: 35, nok: "x" as const, overstek: 0.3 };

  it("bouwt de verbeterde muren en openingen, met vloer waar een muur weg is", () => {
    const model = maakModel([{ id: 1, dak: DAK }], [verdieping({ correcties: [{ soort: "weg", a: [5.07, 0.4], b: [5.07, 3] }] })]);
    const [v] = model.verdiepingen;
    expect(bij(v.gaten, [5.07, 2.15], 0.6)?.soort).toBe("doorgang");
    expect(binnenVeelhoeken([5.07, 1.5], v.plaat.veelhoeken)).toBe(true);
    expect(v.muren.some((muur) => binnenVeelhoeken([5.07, 1.5], [muur.veelhoek]))).toBe(false);
  });

  it("verschuift het gebouw niet als een correctie buiten de muren komt", () => {
    const zonder = maakModel([{ id: 1, dak: DAK }], [verdieping()]);
    const met = maakModel([{ id: 1, dak: DAK }], [verdieping({ correcties: [{ soort: "muur", a: [10, 3], b: [16, 3], dikte: 0.3 }] })]);
    expect(met.gebouwen[0].kader).toEqual(zonder.gebouwen[0].kader);
    expect(binnenVeelhoeken([14, 3], met.verdiepingen[0].muren.map((muur) => muur.veelhoek))).toBe(true);
  });
});

describe("hoe een deur draait", () => {
  // De binnendeur tussen y = 3 en 3,9, met het scharnier onderaan aan de kant van de keuken.
  const MET_BOOG = [{ soort: "deur" as const, x: 5.14, y: 3.9, breedte: 0.9, hoogte: null, boog: [[6.04, 3.9], [5.14, 3]] as [Xy, Xy] }];
  const deur = (correcties: Correctie[]) =>
    pasCorrectiesToe(MUREN, RUIMTES, MET_BOOG, PLAFOND, correcties).gaten.find((g) => g.soort === "deur")!;

  it("legt het scharnier aan de andere kant, of laat de deur naar de andere kant opendraaien", () => {
    const gewoon = deur([]);
    expect(gewoon.bladen).toEqual([{ scharnier: [5.14, 3.9], dicht: [5.14, 3], open: [6.04, 3.9] }]);
    const hart = hartVan(gewoon);
    const gat = (draai: { scharnier?: boolean; kant?: boolean }): Correctie => ({ soort: "gat", x: hart[0], y: hart[1], gat: "deur", onder: 0, boven: 2.15, draai });
    const [om] = deur([gat({ scharnier: true })]).bladen!;
    expect(om.scharnier[1]).toBeCloseTo(3);
    expect(om.dicht[1]).toBeCloseTo(3.9);
    expect(om.open[0]).toBeCloseTo(6.04);
    const [kant] = deur([gat({ kant: true })]).bladen!;
    // De muur loopt van x = 5 tot 5,14: het scharnier komt aan de kant van de leefruimte, en de deur draait daarheen.
    expect(kant.scharnier[0]).toBeCloseTo(5);
    expect(kant.open[0]).toBeCloseTo(4.1);
  });

  it("geeft een deur zonder boog een blad als iemand ze laat draaien, en een nieuwe deur altijd", () => {
    const zonder = pasCorrectiesToe(MUREN, RUIMTES, OPENINGEN, PLAFOND, []).gaten.find((g) => g.soort === "deur")!;
    expect(zonder.bladen).toBeUndefined();
    const hart = hartVan(zonder);
    const gedraaid = pasCorrectiesToe(MUREN, RUIMTES, OPENINGEN, PLAFOND, [
      { soort: "gat", x: hart[0], y: hart[1], gat: "deur", onder: 0, boven: 2.15, draai: { kant: true } },
    ]).gaten.find((g) => g.soort === "deur")!;
    expect(gedraaid.bladen).toHaveLength(1);
    const nieuw = toepassen([{ soort: "opening", a: [5.07, 5], b: [5.07, 5.9], gat: "deur", onder: 0, boven: 2.15 }]);
    expect(bij(nieuw.gaten, [5.07, 5.45])?.bladen).toHaveLength(1);
  });
});


describe("luifels", () => {
  // Achteraan (boven op het plan) een luifel van 1 m diep, van x = 2 tot 8.
  const ACHTER = { lijn: [[2, 0], [2, -1], [8, -1], [8, 0]] as Xy[], diepte: 1 };
  // Links, voor het raam tussen y = 2 en 4.
  const LINKS_RAAM = { lijn: [[0, 1.5], [-1, 1.5], [-1, 4.5], [0, 4.5]] as Xy[], diepte: 1 };
  // Rond de hoek rechtsboven: achteraan van x = 8, en rechts tot y = 2.
  const HOEK = { lijn: [[8, 0], [8, -1], [11, -1], [11, 2], [10, 2]] as Xy[], diepte: 1 };
  const metLuifels = (luifels: { lijn: Xy[]; diepte: number }[], correcties: Correctie[] = []) =>
    pasCorrectiesToe(MUREN, RUIMTES, OPENINGEN, PLAFOND, correcties, luifels);

  it("sluit de lijn van het plan langs de gevel, ook rond een hoek", () => {
    const [achter, hoek] = metLuifels([ACHTER, HOEK]).luifels;
    expect(oppervlakteVan(achter.veelhoeken)).toBeCloseTo(6, 3);
    expect(oppervlakteVan(hoek.veelhoeken)).toBeCloseTo(5, 3);
    expect(binnenVeelhoeken([10.5, 1], hoek.veelhoeken)).toBe(true);
    expect(achter).toMatchObject({ dikte: 0.3, diepte: 1, vanzelf: true, bron: "plan" });
  });

  it("legt de onderkant tegen de bovenkant van de ramen eronder, anders op het plafond", () => {
    const [achter, raam] = metLuifels([ACHTER, LINKS_RAAM]).luifels;
    // Achteraan geen raam: het plafond.
    expect(achter.onder).toBe(PLAFOND);
    // Links het raam tot 2,15 m.
    expect(raam.onder).toBeCloseTo(2.15);
    // Voor de voordeur ook.
    const voordeur = metLuifels([{ lijn: [[6.5, 8], [6.5, 9], [8.5, 9], [8.5, 8]], diepte: 1 }]).luifels[0];
    expect(voordeur.onder).toBeCloseTo(2.15);
  });

  it("geeft een luifel van het plan andere maten, of haalt ze weg", () => {
    const maat = metLuifels([ACHTER], [{ soort: "luifelmaat", x: 5, y: -0.5, onder: 2.5, dikte: 0.2 }]);
    expect(maat.luifels[0]).toMatchObject({ onder: 2.5, dikte: 0.2, vanzelf: false });
    expect(maat.verslag).toEqual([true]);
    // Enkel de dikte: de onderkant blijft die van de app.
    expect(metLuifels([ACHTER], [{ soort: "luifelmaat", x: 5, y: -0.5, dikte: 0.4 }]).luifels[0]).toMatchObject({ onder: PLAFOND, dikte: 0.4, vanzelf: true });
    const weg = metLuifels([ACHTER, LINKS_RAAM], [{ soort: "luifelweg", x: 5, y: -0.5 }]);
    expect(weg.luifels).toHaveLength(1);
    expect(weg.luifels[0].onder).toBeCloseTo(2.15);
    // Waar geen luifel ligt, raakt de correctie niets.
    expect(metLuifels([ACHTER], [{ soort: "luifelweg", x: 5, y: 3 }]).verslag).toEqual([false]);
  });

  it("zet een eigen luifel tegen de gevel, vanaf de buitenkant van de muur", () => {
    // Langs de as van de rechtermuur (x = 9,6 tot 10), 1,5 m diep.
    const { luifels, verslag } = metLuifels([], [{ soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1.5, dikte: 0.3 }]);
    expect(verslag).toEqual([true]);
    expect(luifels).toHaveLength(1);
    expect(luifels[0]).toMatchObject({ bron: "zelf", correctie: 0, onder: PLAFOND, dikte: 0.3, diepte: 1.5, vanzelf: true });
    expect(oppervlakteVan(luifels[0].veelhoeken)).toBeCloseTo(6, 3);
    expect(binnenVeelhoeken([11, 3], luifels[0].veelhoeken)).toBe(true);
    expect(binnenVeelhoeken([9.9, 3], luifels[0].veelhoeken)).toBe(false);
    // Met een onderkant die iemand koos.
    const gekozen = metLuifels([], [{ soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1, onder: 2.4, dikte: 0.25 }]).luifels[0];
    expect(gekozen).toMatchObject({ onder: 2.4, dikte: 0.25, vanzelf: false });
  });

  it("neemt de muur tussen twee tikken, ook als de eerste in een hoek valt", () => {
    // In de hoek linksboven lopen de achtermuur en de linkermuur samen.
    const plek = muurLangs(MUREN, [0.2, 0.2], [9.8, 0.2])!;
    expect(Math.abs(plek.richting[0])).toBeCloseTo(1);
    expect(plek.dikte).toBeCloseTo(0.4);
  });

  it("zet geen luifel tegen een binnenmuur", () => {
    const { luifels, verslag } = metLuifels([], [{ soort: "luifel", a: [5.07, 0.5], b: [5.07, 2.5], diepte: 1, dikte: 0.3 }]);
    expect(luifels).toEqual([]);
    expect(verslag).toEqual([false]);
  });

  it("leest luifelcorrecties in, en laat weg wat niet klopt", () => {
    const schoon = schoneCorrecties([
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5.0004], diepte: 1.5, dikte: 0.3 },
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1, onder: 2.4, dikte: 0.25 },
      { soort: "luifelmaat", x: 5, y: -0.5, dikte: 0.2 },
      { soort: "luifelmaat", x: 5, y: -0.5, onder: null, dikte: 0.2 },
      { soort: "luifelweg", x: 5, y: -0.5 },
      // Te diep, te dik, te kort, een onderkant onder de vloer, geen dikte, en geen plek.
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 10, dikte: 0.3 },
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1, dikte: 2 },
      { soort: "luifel", a: [9.8, 1], b: [9.8, 1.1], diepte: 1, dikte: 0.3 },
      { soort: "luifelmaat", x: 5, y: -0.5, onder: -1, dikte: 0.2 },
      { soort: "luifelmaat", x: 5, y: -0.5 },
      { soort: "luifelweg", x: "hier", y: -0.5 },
    ]);
    expect(schoon).toEqual([
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1.5, dikte: 0.3 },
      { soort: "luifel", a: [9.8, 1], b: [9.8, 5], diepte: 1, onder: 2.4, dikte: 0.25 },
      { soort: "luifelmaat", x: 5, y: -0.5, dikte: 0.2 },
      { soort: "luifelmaat", x: 5, y: -0.5, dikte: 0.2 },
      { soort: "luifelweg", x: 5, y: -0.5 },
    ]);
  });

  describe("in het model", () => {
    const DAK = { type: "plat" as const, helling: 35, nok: "x" as const, overstek: 0.3 };
    const gelijkvloers = (over: Partial<Invoerverdieping> = {}): Invoerverdieping => ({
      id: 10,
      naam: "Gelijkvloers",
      gebouwId: 1,
      volgorde: 0,
      vloerpeil: 0,
      plafondhoogte: PLAFOND,
      verdiepingshoogte: 3.2,
      ruimtes: RUIMTES,
      muren: RINGEN,
      openingen: OPENINGEN,
      luifels: [ACHTER],
      ...over,
    });
    // Een verdieping die achteraan 1 m uitkraagt, over x = 0 tot 4.
    const verdieping: Invoerverdieping = {
      id: 11,
      naam: "Verdieping",
      gebouwId: 1,
      volgorde: 1,
      vloerpeil: 3.2,
      plafondhoogte: 2.6,
      verdiepingshoogte: null,
      ruimtes: [{ id: 3, naam: "slaapkamer", soort: "slaapkamer", ringen: [rechthoek(0, -1, 4, 8)], plafondhoogte: null }],
      muren: [],
      openingen: [],
    };

    it("bouwt de luifel buiten de voetafdruk, op haar hoogte, zonder het gebouw te verschuiven", () => {
      const model = maakModel([{ id: 1, dak: DAK }], [gelijkvloers()]);
      const [v] = model.verdiepingen;
      expect(v.luifels).toHaveLength(1);
      expect(v.luifels[0]).toMatchObject({ z0: PLAFOND, z1: 3.1 });
      expect(oppervlakteVan(v.luifels[0].veelhoeken)).toBeCloseTo(6, 3);
      expect(binnenVeelhoeken([5, -0.5], v.plaat.veelhoeken)).toBe(false);
      expect(model.gebouwen[0].kader).toEqual(maakModel([{ id: 1, dak: DAK }], [gelijkvloers({ luifels: [] })]).gebouwen[0].kader);
    });

    it("laat weg wat onder de verdieping erboven ligt, of al een ruimte is", () => {
      const model = maakModel([{ id: 1, dak: DAK }], [gelijkvloers(), verdieping]);
      const onder = model.verdiepingen.find((v) => v.id === 10)!;
      expect(oppervlakteVan(onder.luifels[0].veelhoeken)).toBeCloseTo(4, 3);
      expect(binnenVeelhoeken([3, -0.5], onder.luifels[0].veelhoeken)).toBe(false);
      // Een overdekt terras dat als ruimte getekend is: dat is al voetafdruk.
      const terras = { id: 4, naam: "terras", soort: "terras" as const, ringen: [rechthoek(2, -1, 8, 0)], plafondhoogte: null };
      const metTerras = maakModel([{ id: 1, dak: DAK }], [gelijkvloers({ ruimtes: [...RUIMTES, terras] })]);
      expect(metTerras.verdiepingen[0].luifels).toEqual([]);
    });
  });
});
