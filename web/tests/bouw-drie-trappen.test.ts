import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { maakModel, type Invoerverdieping } from "@/lib/bouw/drie/model";
import { kaderOpTerrein, naarGebouw, naarTerrein, standaardPlaatsingen } from "@/lib/bouw/drie/plaatsing";
import { maakTrappen, opTrap, rechthoekRond, schoneTrapstanden, tredelijnen, trappenOpPlan, type Trapinvoer } from "@/lib/bouw/drie/trappen";
import type { Veelhoek } from "@/lib/bouw/drie/vlak";
import { ooghoogte, wandel, type Wandelstand, type Wandelverdieping } from "@/lib/bouw/drie/wandelen";
import { nettoOppervlakte } from "@/lib/bouw/omzetting/geometrie";
import type { Trapvoorstel, Xy } from "@/lib/bouw/omzetting/types";

const rh = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Een vloer van 10 op 8 met een gat erin. */
const vloerMetGat = (gat: Xy[]): Veelhoek[] => [[rh(0, 0, 10, 8), gat]];

/** De trap van 180° van het plan: onderste vlucht naar rechts, bordes, bovenste vlucht terug. */
const keertrap: Trapvoorstel = {
  richting: "pijl",
  delen: [
    { soort: "vlucht", hoeken: [[2, 3.2], [2, 4.2], [3.6, 4.2], [3.6, 3.2]], treden: 8 },
    { soort: "bordes", hoeken: [[3.6, 2], [4.6, 2], [4.6, 4.2], [3.6, 4.2]], treden: 0 },
    { soort: "vlucht", hoeken: [[3.6, 3], [3.6, 2], [2, 2], [2, 3]], treden: 8 },
  ],
};

function invoer(over: { onder?: Partial<Trapinvoer["onder"]>; boven?: Partial<Trapinvoer["boven"]> } = {}): Trapinvoer {
  return {
    onder: { id: 1, z0: 0, ruimtes: [{ soort: "leefruimte", ringen: [rh(0, 0, 10, 8)] }], trappen: [], standen: [], ...over.onder },
    boven: {
      id: 2,
      z0: 2.88,
      ruimtes: [{ ringen: [rh(0, 0, 10, 2)] }, { ringen: [rh(0, 4.4, 10, 8)] }, { ringen: [rh(0, 2, 1.8, 4.4)] }],
      voetafdruk: vloerMetGat(rh(1.8, 2, 4.6, 4.4)),
      muren: [],
      ...over.boven,
    },
  };
}

describe("de trap van het plan", () => {
  it("gaat van het peil van de verdieping tot dat van de verdieping erboven, met het bordes halfweg", () => {
    const { trappen, uitsparingen } = maakTrappen(invoer({ onder: { trappen: [keertrap] } }));
    expect(trappen).toHaveLength(1);
    const [trap] = trappen;
    expect(trap).toMatchObject({ van: 1, naar: 2, bron: "plan", vorm: "keer" });
    const [eerste, bordes, tweede] = trap.delen;
    expect([eerste.z0, eerste.z1]).toEqual([0, 1.44]);
    expect([bordes.z0, bordes.z1]).toEqual([1.44, 1.44]);
    expect(tweede.z0).toBe(1.44);
    expect(tweede.z1).toBeCloseTo(2.88);
    // Het gat bestond al: niets uit te sparen.
    expect(uitsparingen).toEqual([]);
  });

  it("vult de kier tussen de bovenste trede en de vloer erboven", () => {
    // De bovenste vlucht komt aan op x = 2; het gat loopt tot x = 1,8.
    const { trappen } = maakTrappen(invoer({ onder: { trappen: [keertrap] } }));
    const laatste = trappen[0].delen.at(-1)!;
    expect(laatste.soort).toBe("bordes");
    expect(laatste.z0).toBeCloseTo(2.88);
    const xs = laatste.hoeken.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(1.8, 1);
  });

  it("zet een leuning rond het gat, behalve waar de trap aankomt", () => {
    const { leuningen } = maakTrappen(invoer({ onder: { trappen: [keertrap] } }));
    expect(leuningen.length).toBeGreaterThan(0);
    // Op de linkerrand van het gat (x = 1,8) is de aankomst (y 2 tot 3) open; de rest heeft een leuning.
    const links = leuningen.filter(([a, b]) => Math.abs(a[0] - 1.8) < 1e-6 && Math.abs(b[0] - 1.8) < 1e-6);
    expect(links.some(([a, b]) => Math.min(a[1], b[1]) < 2.9 && Math.max(a[1], b[1]) > 2.1)).toBe(false);
    expect(links.some(([a, b]) => Math.max(a[1], b[1]) > 4)).toBe(true);
  });

  it("draait om, of verdwijnt, als dat gekozen werd", () => {
    const omgekeerd = maakTrappen(invoer({ onder: { trappen: [keertrap], standen: [{ x: 3.3, y: 3.1, omgekeerd: true }] } }));
    // De trap begint nu waar hij eerst aankwam.
    expect(omgekeerd.trappen[0].delen[0].hoeken[0]).toEqual([2, 2]);
    expect(omgekeerd.trappen[0].stand.omgekeerd).toBe(true);
    const geen = maakTrappen(invoer({ onder: { trappen: [keertrap], standen: [{ x: 3.3, y: 3.1, geen: true }] } }));
    expect(geen.trappen).toEqual([]);
  });
});

describe("de trap op het plan van Ruimtes", () => {
  it("tekent een trap op zijn verdieping met treden, en erboven als trapgat", () => {
    const trappen = trappenOpPlan([{ id: 1 }, { id: 2 }, { id: 3 }], new Map([[1, [keertrap]]]));
    expect(trappen.get(1)).toEqual([{ delen: keertrap.delen, vanOnder: false }]);
    expect(trappen.get(2)).toEqual([{ delen: keertrap.delen, vanOnder: true }]);
    expect(trappen.get(3)).toEqual([]);
    // Wie koos dat er geen trap is, ziet ze nergens.
    const geen = trappenOpPlan([{ id: 1, trapstanden: [{ x: 3.3, y: 3.1, geen: true }] }, { id: 2 }], new Map([[1, [keertrap]]]));
    expect([geen.get(1), geen.get(2)]).toEqual([[], []]);
  });

  it("legt de treden dwars over een vlucht, en geen op een bordes", () => {
    const [eerste, bordes] = keertrap.delen;
    const lijnen = tredelijnen(eerste);
    // Acht treden: zeven lijnen ertussen, van x = 2 naar 3,6.
    expect(lijnen).toHaveLength(7);
    expect(lijnen[0]).toEqual([[2.2, 3.2], [2.2, 4.2]]);
    expect(tredelijnen(bordes)).toEqual([]);
  });
});

describe("een trap zonder plan", () => {
  it("onder een smal trapgat: een rechte trap, die aankomt bij een ruimte boven", () => {
    // Een gat van 1 m op 3,5 m; boven ligt enkel rechts een ruimte die tegen het gat aankomt.
    const { trappen } = maakTrappen(
      invoer({
        boven: {
          ruimtes: [{ ringen: [rh(6.5, 2, 10, 3)] }],
          voetafdruk: vloerMetGat(rh(3, 2, 6.5, 3)),
        },
      }),
    );
    expect(trappen).toHaveLength(1);
    expect(trappen[0]).toMatchObject({ bron: "gat", vorm: "recht" });
    const [vlucht] = trappen[0].delen;
    // De bovenste rand ligt bij x = 6,5, waar boven de ruimte is.
    expect(vlucht.hoeken[2][0]).toBeCloseTo(6.5);
    expect(vlucht.treden).toBe(16);
  });

  it("onder een breed trapgat: een trap van 180° met bordes, en de vorm kan anders", () => {
    const gat = rh(3, 2, 6, 4);
    const breed = maakTrappen(invoer({ boven: { voetafdruk: vloerMetGat(gat) } }));
    expect(breed.trappen[0].vorm).toBe("keer");
    expect(breed.trappen[0].delen.map((d) => d.soort)).toEqual(["vlucht", "bordes", "vlucht"]);
    const recht = maakTrappen(invoer({ boven: { voetafdruk: vloerMetGat(gat) }, onder: { standen: [{ x: 4.5, y: 3, vorm: "recht" }] } }));
    expect(recht.trappen[0].vorm).toBe("recht");
  });

  it("een groot gat is een vide, zonder trap", () => {
    expect(maakTrappen(invoer({ boven: { voetafdruk: vloerMetGat(rh(2, 2, 6, 6)) } })).trappen).toEqual([]);
  });

  it("in een ruimte Trap zonder gat erboven: een trap, en een gat in de vloer erboven", () => {
    const { trappen, uitsparingen } = maakTrappen(
      invoer({
        onder: { ruimtes: [{ soort: "inkom", ringen: [rh(0, 0, 10, 8)] }, { soort: "trap", ringen: [rh(7, 1, 8, 4.5)] }] },
        boven: { voetafdruk: [[rh(0, 0, 10, 8)]] },
      }),
    );
    expect(trappen[0]).toMatchObject({ bron: "ruimte", vorm: "recht" });
    expect(uitsparingen.reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0)).toBeCloseTo(3.5, 1);
  });
});

describe("de keuzes voor de trappen", () => {
  it("houdt enkel wat klopt", () => {
    expect(
      schoneTrapstanden([
        { x: 1.23456, y: 2, omgekeerd: true, vorm: "keer", extra: "weg" },
        { x: "geen getal", y: 1 },
        { x: 1e6, y: 0 },
        { x: 0, y: 0, geen: "ja" },
      ]),
    ).toEqual([{ x: 1.235, y: 2, vorm: "keer", omgekeerd: true }, { x: 0, y: 0 }]);
    expect(schoneTrapstanden("geen lijst")).toEqual([]);
  });

  it("vindt de kleinste rechthoek rond een gedraaide vorm", () => {
    const hoek = Math.PI / 6;
    const ring = rh(-2, -0.5, 2, 0.5).map(([x, y]) => [x * Math.cos(hoek) - y * Math.sin(hoek), x * Math.sin(hoek) + y * Math.cos(hoek)] as Xy);
    const vak = rechthoekRond(ring)!;
    expect(vak.lengte).toBeCloseTo(4);
    expect(vak.breedte).toBeCloseTo(1);
    // Langer in y dan in x: de assen blijven haaks op elkaar.
    const staand = rechthoekRond(rh(7, 1, 8, 4.5))!;
    expect(staand).toMatchObject({ lengte: 3.5, breedte: 1, midden: [7.5, 2.75] });
    expect(Math.abs(staand.u[0] * staand.v[0] + staand.u[1] * staand.v[1])).toBeLessThan(1e-9);
  });
});

describe("rondwandelen met een trap", () => {
  // Een rechte trap van (3, 2.5) naar (6.5, 2.5), 1 m breed, van 0 naar 2,88 m.
  const { trappen } = maakTrappen(
    invoer({ boven: { ruimtes: [{ ringen: [rh(6.5, 2, 10, 3)] }], voetafdruk: vloerMetGat(rh(3, 2, 6.5, 3)) } }),
  );
  const wereld: Wandelverdieping[] = [
    { id: 1, gebouwId: 1, z0: 0, muren: [], gaten: [], trappen },
    { id: 2, gebouwId: 1, z0: 2.88, muren: [], gaten: [[rh(3, 2, 6.5, 3)]], trappen: [] },
  ];
  const loop = (stand: Wandelstand, dx: number, dy: number, keer: number) => {
    let s = stand;
    for (let i = 0; i < keer; i++) s = wandel(wereld, s, dx, dy);
    return s;
  };

  it("de trap op aan de voet, en boven verder op de verdieping erboven", () => {
    const begin: Wandelstand = { verdieping: 1, x: 2.5, y: 2.5, trap: null };
    const halfweg = loop(begin, 0.1, 0, 25);
    expect(halfweg.trap).not.toBeNull();
    expect(ooghoogte(wereld, halfweg)).toBeGreaterThan(1.6 + 1);
    const boven = loop(halfweg, 0.1, 0, 30);
    expect(boven).toMatchObject({ verdieping: 2, trap: null });
    expect(ooghoogte(wereld, boven)).toBeCloseTo(2.88 + 1.6);
    // En terug naar beneden.
    const terug = loop(boven, -0.1, 0, 60);
    expect(terug).toMatchObject({ verdieping: 1, trap: null });
    expect(ooghoogte(wereld, terug)).toBeCloseTo(1.6);
  });

  it("langs de zijkant kan je de trap niet op", () => {
    const naast: Wandelstand = { verdieping: 1, x: 5, y: 3.5, trap: null };
    expect(loop(naast, 0, -0.1, 10).trap).toBeNull();
    expect(loop(naast, 0, -0.1, 10).y).toBeGreaterThan(3);
  });

  it("boven loop je niet in het gat", () => {
    const boven: Wandelstand = { verdieping: 2, x: 5, y: 1.5, trap: null };
    const na = loop(boven, 0, 0.1, 10);
    expect(na.y).toBeLessThanOrEqual(2);
    expect(na.verdieping).toBe(2);
  });

  it("op een vlucht ligt de hoogte tussen haar begin en einde", () => {
    const op = opTrap(trappen[0], [4.75, 2.5]);
    expect(op?.z).toBeCloseTo(1.44, 1);
  });
});

describe("de plaats van een gebouw", () => {
  const midden: Xy = [5, 4];

  it("rekent heen en terug", () => {
    const plaats = { x: 20, y: -3, hoek: 37 };
    const p: Xy = [7.5, 1.25];
    const [x, y] = naarGebouw(naarTerrein(p, midden, plaats), midden, plaats);
    expect(x).toBeCloseTo(p[0]);
    expect(y).toBeCloseTo(p[1]);
  });

  it("draait zoals de groep in three.js", () => {
    const plaats = { x: 20, y: -3, hoek: 30 };
    const buiten = new THREE.Group();
    buiten.position.set(plaats.x, 0, plaats.y);
    buiten.rotation.set(0, (-plaats.hoek * Math.PI) / 180, 0);
    const binnen = new THREE.Group();
    binnen.position.set(-midden[0], 0, -midden[1]);
    buiten.add(binnen);
    buiten.updateMatrixWorld(true);
    const p: Xy = [8, 6];
    const wereld = binnen.localToWorld(new THREE.Vector3(p[0], 0, p[1]));
    const [x, y] = naarTerrein(p, midden, plaats);
    expect(wereld.x).toBeCloseTo(x);
    expect(wereld.z).toBeCloseTo(y);
  });

  it("zet gebouwen zonder plaats naast elkaar, en houdt wat bewaard is", () => {
    const gebouwen = [
      { id: 1, kader: { x0: 0, y0: 0, x1: 10, y1: 8 }, z1: 6 },
      { id: 2, kader: { x0: 0, y0: 0, x1: 4, y1: 6 }, z1: 3 },
    ];
    const naast = standaardPlaatsingen(gebouwen);
    expect(naast.get(1)).toEqual({ x: 5, y: 4, hoek: 0 });
    expect(naast.get(2)).toEqual({ x: 17, y: 3, hoek: 0 });
    expect(kaderOpTerrein(gebouwen, naast)).toEqual({ x0: 0, y0: 0, x1: 19, y1: 8, z1: 6 });
    const bewaard = standaardPlaatsingen(gebouwen, new Map([[2, { x: -10, y: 0, hoek: 90 }]]));
    expect(bewaard.get(2)).toEqual({ x: -10, y: 0, hoek: 90 });
    // Het eerste komt nu rechts van het bewaarde.
    expect(bewaard.get(1)!.x).toBeGreaterThan(-10);
  });
});

describe("het model met een trap", () => {
  const muur = (x0: number, y0: number, x1: number, y1: number) => rh(x0, y0, x1, y1);
  const gelijkvloers: Invoerverdieping = {
    id: 1,
    naam: "Gelijkvloers",
    gebouwId: 1,
    volgorde: 0,
    vloerpeil: 0,
    plafondhoogte: 2.6,
    verdiepingshoogte: 2.88,
    ruimtes: [{ id: 1, naam: "Leefruimte", soort: "leefruimte", ringen: [rh(0, 0, 10, 8)], plafondhoogte: null }],
    muren: [muur(-0.3, -0.3, 10.3, 0), muur(-0.3, 8, 10.3, 8.3), muur(-0.3, 0, 0, 8), muur(10, 0, 10.3, 8)],
    openingen: [],
    trappen: [keertrap],
  };
  const verdieping: Invoerverdieping = {
    ...gelijkvloers,
    id: 2,
    naam: "Verdieping",
    volgorde: 1,
    vloerpeil: 2.88,
    verdiepingshoogte: null,
    ruimtes: [
      { id: 2, naam: "Kamer", soort: "slaapkamer", ringen: [rh(0, 0, 10, 2)], plafondhoogte: null },
      { id: 3, naam: "Overloop", soort: "nachthal", ringen: [rh(0, 2, 1.8, 4.4)], plafondhoogte: null },
      { id: 4, naam: "Badkamer", soort: "badkamer", ringen: [rh(4.6, 2, 10, 4.4)], plafondhoogte: null },
      { id: 5, naam: "Kamer 2", soort: "slaapkamer", ringen: [rh(0, 4.4, 10, 8)], plafondhoogte: null },
    ],
    trappen: [],
  };

  it("legt de trap op het gelijkvloers, met een leuning boven en zonder plat dak boven het trapgat", () => {
    const model = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [gelijkvloers, verdieping]);
    const [onder, boven] = model.verdiepingen;
    expect(onder.trappen).toHaveLength(1);
    expect(boven.leuningen.length).toBeGreaterThan(0);
    // Het trapgat is open: de plaat erboven heeft een gat, en het gelijkvloers krijgt daar geen dak.
    expect(boven.plaat.veelhoeken[0].length).toBe(2);
    expect(onder.dakplaat).toBeNull();
    expect(model.gebouwen).toEqual([{ id: 1, kader: { x0: -0.3, y0: -0.3, x1: 10.3, y1: 8.3 }, z1: expect.any(Number) }]);
  });
});

// ---------------------------------------------------------------------------
// De keuzes bewaren, met de nagebootste databank
// ---------------------------------------------------------------------------

describe("de trapkeuzes in de databank", () => {
  it("leest ze bij de verdieping, bewaart ze nagekeken, en weigert een verdieping van een ander huis", async () => {
    const { vi } = await import("vitest");
    const { metHuis, nepSupabase, TESTHUIS } = await import("./stubs/nep-supabase");
    const db = nepSupabase({
      bouw_huizen: [{ ...TESTHUIS }, { ...TESTHUIS, id: 2, naam: "Ander huis" }],
      bouw_gebouwen: [...metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]), ...metHuis([{ id: 2, naam: "Woning", volgorde: 0 }], 2)],
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0, trappen: [{ x: 3, y: 2, omgekeerd: true }] },
        { id: 2, gebouw_id: 2, naam: "Gelijkvloers", volgorde: 0, trappen: [] },
      ],
    });
    vi.doMock("@/lib/supabase", () => ({ db: () => db.client }));
    vi.resetModules();
    const { bewaarTrapstanden, lijstVerdiepingen } = await import("@/lib/bouw/opslag");

    const [gelijkvloers] = await lijstVerdiepingen(1);
    expect(gelijkvloers.trapstanden).toEqual([{ x: 3, y: 2, omgekeerd: true }]);

    await bewaarTrapstanden(1, 1, [{ x: 3, y: 2, geen: true }]);
    expect(db.tabellen.bouw_verdiepingen.find((v) => v.id === 1)?.trappen).toEqual([{ x: 3, y: 2, geen: true }]);

    await expect(bewaarTrapstanden(1, 2, [])).rejects.toThrow("bestaat niet meer");
    expect(db.tabellen.bouw_verdiepingen.find((v) => v.id === 2)?.trappen).toEqual([]);
    vi.doUnmock("@/lib/supabase");
  });
});
