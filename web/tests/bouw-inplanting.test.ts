import { describe, expect, it } from "vitest";

import { DREMPEL, plaatsAutomatisch, schaalVanBlad, vormenVan, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import {
  genormaliseerd,
  herschaald,
  kaderOpTerrein,
  middenVan,
  naarTerrein,
  rondMidden,
  schoneInplanting,
  type Plaatsing,
} from "@/lib/bouw/drie/plaatsing";
import { METER_PER_PUNT } from "@/lib/bouw/omzetting/schaal";
import type { Blad, Pad, Xy } from "@/lib/bouw/omzetting/types";

/**
 * De gebouwen automatisch op het inplantingsplan: een verzonnen plan met een
 * woning in L-vorm, een bijgebouw uit losse muren, een buur, bomen en een
 * perceel. Alles verzonnen: er komt nooit een echt plan in de repository.
 */

// A1 liggend, zoals een inplantingsplan vaak is.
const BREEDTE = 2384;
const HOOGTE = 1684;

/** De woning in haar eigen assenstelsel (meter, y naar beneden): een L van 100 m². */
const WONING: Xy[] = [
  [0, 0],
  [12, 0],
  [12, 6],
  [7, 6],
  [7, 10],
  [0, 10],
];
/** Een bijgebouw van 6 × 4 m. */
const BERGING: Xy[] = [
  [0, 0],
  [6, 0],
  [6, 4],
  [0, 4],
];

const randen = (ring: Xy[]): [Xy, Xy][] => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]);

function zoekgebouw(id: number, ring: Xy[], binnenmuren: [Xy, Xy][] = []): Zoekgebouw {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return {
    id,
    voetafdruk: [[ring]],
    muren: [...randen(ring), ...binnenmuren],
    midden: middenVan({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }),
  };
}

const woning = zoekgebouw(1, WONING, [
  [
    [4, 0],
    [4, 10],
  ],
]);
const berging = zoekgebouw(2, BERGING);

/** Van het terrein (meter) naar het blad (punten), op schaal 1/noemer. */
const naarBlad = (p: Xy, noemer: number): Xy => [p[0] / (noemer * METER_PER_PUNT), p[1] / (noemer * METER_PER_PUNT)];

/** Een ring van een gebouw zoals het op het terrein staat, in punten op het blad. */
function geplaatst(gebouw: Zoekgebouw, ring: Xy[], plaatsing: Plaatsing, noemer = 200): Xy[] {
  return ring.map((p) => naarBlad(naarTerrein(p, gebouw.midden, plaatsing), noemer));
}

const vlak = (ringen: Xy[][], vul = "#c8c8c8"): Pad => ({
  vul,
  lijn: "#000000",
  dikte: 0.5,
  delen: ringen.map((punten) => ({ punten, gesloten: true })),
  bogen: [],
});
const lijn = (punten: Xy[], gesloten = false): Pad => ({ vul: null, lijn: "#000000", dikte: 0.25, delen: [{ punten, gesloten }], bogen: [] });

function blad(paden: Pad[], teksten: string[] = []): Blad {
  return {
    breedte: BREEDTE,
    hoogte: HOOGTE,
    paden,
    teksten: teksten.map((tekst, i) => ({ tekst, x: 2000, y: 1500 + i * 20, breedte: 80, hoogte: 8, grootte: 8, hoek: 0 })),
    beeldvlak: 0,
  };
}

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Een boom: een cirkel van 2 m, als veelhoek. */
const boom = (midden: Xy, noemer = 200): Pad =>
  vlak(
    [Array.from({ length: 24 }, (_, k) => naarBlad([midden[0] + 2 * Math.cos((k * Math.PI) / 12), midden[1] + 2 * Math.sin((k * Math.PI) / 12)], noemer))],
    "#7fbf6a",
  );

const WAAR_WONING: Plaatsing = { x: 60, y: 45, hoek: 23.5 };
const WAAR_BERGING: Plaatsing = { x: 85, y: 70, hoek: -8 };

/**
 * Het inplantingsplan: het perceel als lijn, de woning als één grijs vlak,
 * de berging als vier losse muren, een buur van dezelfde oppervlakte als de
 * woning, en twee bomen.
 */
function inplantingsplan(opties: { noemer?: number; teksten?: string[]; berging?: boolean } = {}): Blad {
  const noemer = opties.noemer ?? 200;
  const muurdikte = 0.2;
  const muren = [
    rechthoek(0, 0, 6, muurdikte),
    rechthoek(0, 4 - muurdikte, 6, 4),
    rechthoek(0, muurdikte, muurdikte, 4 - muurdikte),
    rechthoek(6 - muurdikte, muurdikte, 6, 4 - muurdikte),
  ];
  return blad(
    [
      lijn(rechthoek(40, 20, 100, 95).map((p) => naarBlad(p, noemer)), true),
      vlak([geplaatst(woning, WONING, WAAR_WONING, noemer)]),
      ...(opties.berging === false ? [] : muren.map((muur) => vlak([geplaatst(berging, muur, WAAR_BERGING, noemer)], "#404040"))),
      vlak([rechthoek(10, 10, 20, 20).map((p) => naarBlad(p, noemer))], "#e0e0e0"),
      boom([50, 80], noemer),
      boom([95, 30], noemer),
    ],
    opties.teksten ?? ["INPLANTINGSPLAN", "schaal 1/200", "03/10/2026"],
  );
}

function verwacht(gevonden: { plaatsing: Plaatsing; overeenkomst: number } | undefined, waar: Plaatsing) {
  expect(gevonden).toBeDefined();
  const { plaatsing, overeenkomst } = gevonden!;
  expect(Math.abs(genormaliseerd(plaatsing.hoek - waar.hoek))).toBeLessThan(0.2);
  expect(Math.hypot(plaatsing.x - waar.x, plaatsing.y - waar.y)).toBeLessThan(0.06);
  // Losse muren groeien 2 cm voor ze samengevoegd worden: dat kost hoogstens een paar procent.
  expect(overeenkomst).toBeGreaterThan(0.97);
}

describe("de schaal van het inplantingsplan", () => {
  it("leest de schaal van het blad, niet de datum", () => {
    expect(schaalVanBlad(blad([], ["schaal 1/200", "03/10/2026"]))).toBe(200);
    expect(schaalVanBlad(blad([], ["Liggingsplan 1:2500", "Inplanting 1/250", "1/250"]))).toBe(250);
    expect(schaalVanBlad(blad([], ["01/10/2026"]))).toBeNull();
    // Een detail op 1:20 is geen inplanting.
    expect(schaalVanBlad(blad([], ["detail 1:20"]))).toBeNull();
  });
});

describe("de vormen op het blad", () => {
  it("neemt gesloten, rondgaande en gevulde vormen, geen open lijnen of piepkleine vlakjes", () => {
    const vormen = vormenVan(
      blad([
        lijn(rechthoek(10, 10, 60, 60), true),
        // Rond, maar niet als gesloten aangeduid: het laatste punt is het eerste.
        lijn([...rechthoek(100, 100, 160, 140), [100, 100]]),
        // Gevuld sluit altijd.
        { vul: "#cccccc", lijn: null, dikte: 0, delen: [{ punten: rechthoek(200, 200, 260, 250), gesloten: false }], bogen: [] },
        // Een open lijn, een vlakje van minder dan een vierkante punt, en een kader rond het hele blad.
        lijn([
          [300, 300],
          [400, 300],
          [400, 350],
        ]),
        vlak([rechthoek(500, 500, 500.5, 500.5)]),
        lijn(rechthoek(1, 1, BREEDTE - 1, HOOGTE - 1), true),
      ]),
    );
    expect(vormen.map((v) => Math.round(v.oppervlakte))).toEqual([2500, 2400, 3000]);
  });
});

describe("automatisch plaatsen", () => {
  it("vindt de woning en de berging met hun hoek en plaats, op de schaal van het blad", () => {
    const vondst = plaatsAutomatisch([woning, berging], inplantingsplan());
    expect(vondst).toMatchObject({ noemer: 200, bron: "plan" });
    verwacht(vondst.gevonden.get(1), WAAR_WONING);
    verwacht(vondst.gevonden.get(2), WAAR_BERGING);
  });

  it("berekent de schaal uit de gebouwen als het blad er geen vermeldt", () => {
    const vondst = plaatsAutomatisch([woning, berging], inplantingsplan({ teksten: ["INPLANTINGSPLAN"] }));
    expect(vondst).toMatchObject({ noemer: 200, bron: "gebouwen" });
    verwacht(vondst.gevonden.get(1), WAAR_WONING);
  });

  it("vindt de juiste schaal ook als het blad een andere vermeldt (afgedrukt op een ander formaat)", () => {
    const vondst = plaatsAutomatisch([woning, berging], inplantingsplan({ noemer: 250, teksten: ["schaal 1/200"] }));
    expect(vondst).toMatchObject({ noemer: 250, bron: "gebouwen" });
    verwacht(vondst.gevonden.get(1), WAAR_WONING);
    verwacht(vondst.gevonden.get(2), WAAR_BERGING);
  });

  it("zoekt met een gegeven schaal enkel op die schaal", () => {
    const plan = inplantingsplan({ noemer: 250, teksten: ["schaal 1/200"] });
    const gegeven = plaatsAutomatisch([woning, berging], plan, 250);
    expect(gegeven).toMatchObject({ noemer: 250, bron: "gegeven" });
    verwacht(gegeven.gevonden.get(1), WAAR_WONING);
    // Op een verkeerde schaal zoekt het niet verder: wat het vindt, past slecht.
    const fout = plaatsAutomatisch([woning, berging], plan, 200);
    expect(fout).toMatchObject({ noemer: 200, bron: "gegeven" });
    expect([...fout.gevonden.values()].every((v) => v.overeenkomst < 0.7)).toBe(true);
  });

  it("laat een gebouw dat niet op het plan staat, waar het is", () => {
    const vondst = plaatsAutomatisch([woning, berging], inplantingsplan({ berging: false }));
    verwacht(vondst.gevonden.get(1), WAAR_WONING);
    expect(vondst.gevonden.has(2)).toBe(false);
  });

  it("vindt een bijgebouw dat tegen de woning staat en er op het plan één vlak mee vormt", () => {
    // De berging vult de inham van de L en steekt 1 m uit: samen één gesloten vorm, 50 m rechts en 40 m lager op het terrein.
    const samen: Xy[] = [
      [0, 0],
      [12, 0],
      [12, 6],
      [13, 6],
      [13, 10],
      [0, 10],
    ];
    const vondst = plaatsAutomatisch([woning, berging], blad([vlak([samen.map((p) => naarBlad([p[0] + 50, p[1] + 40], 200))])], ["1/200"]));
    // De woning valt er helemaal in: 100 van de 124 m².
    expect(vondst.gevonden.get(1)?.overeenkomst).toBeCloseTo(100 / 124, 2);
    const waarWoning = vondst.gevonden.get(1)!.plaatsing;
    expect(Math.hypot(waarWoning.x - 56, waarWoning.y - 45)).toBeLessThan(0.06);
    expect(Math.abs(waarWoning.hoek)).toBeLessThan(0.2);
    // De berging (midden (3, 2)) krijgt wat overblijft: van (7, 6) tot (13, 10) in de woning.
    verwacht(vondst.gevonden.get(2), { x: 60, y: 48, hoek: 0 });
  });
});

describe("muren met een opening", () => {
  // De berging met een poort van 3 m in de voorgevel en een deur in de zijgevel: haar muren vallen in twee stukken uiteen.
  const MUREN = [
    rechthoek(0, 0, 1.5, 0.2),
    rechthoek(4.5, 0, 6, 0.2),
    rechthoek(0, 3.8, 6, 4),
    rechthoek(0, 0.2, 0.2, 1.5),
    rechthoek(0, 2.5, 0.2, 3.8),
    rechthoek(5.8, 0.2, 6, 3.8),
  ];
  const garage: Zoekgebouw = { ...zoekgebouw(2, BERGING), muren: MUREN.flatMap(randen) };
  const waar: Plaatsing = { x: 80, y: 40, hoek: -163 };

  it("vindt het bijgebouw met de poort aan de juiste kant, niet op het terras van dezelfde grootte", () => {
    const plan = blad(
      [
        ...MUREN.map((muur) => vlak([geplaatst(garage, muur, waar)], "#404040")),
        // Een terras van 6 × 4 m: even groot, maar één vlak.
        vlak([rechthoek(60, 60, 66, 64).map((p) => naarBlad(p, 200))], "#f2e6c9"),
      ],
      ["1/200"],
    );
    verwacht(plaatsAutomatisch([garage], plan).gevonden.get(2), waar);
  });
});

describe("een druk plan", () => {
  // De woning enkel als losse stukken muur van 30 cm, tussen 1500 willekeurige vlakjes en 2500 lijnen.
  function drukPlan(teksten: string[]): Blad {
    const stukken: Xy[][] = [];
    for (let x = 0; x < 12; x += 1.5) stukken.push(rechthoek(x, 0, x + 1.5, 0.3));
    for (let x = 0; x < 7; x += 1) stukken.push(rechthoek(x, 9.7, x + 1, 10));
    for (let x = 7; x < 12; x += 1) stukken.push(rechthoek(x, 5.7, x + 1, 6));
    for (let y = 0.3; y < 9.7; y += 1) stukken.push(rechthoek(0, y, 0.3, Math.min(9.7, y + 1)));
    for (let y = 0.3; y < 5.7; y += 1) stukken.push(rechthoek(11.7, y, 12, Math.min(5.7, y + 1)));
    for (let y = 6; y < 9.7; y += 1) stukken.push(rechthoek(6.7, y, 7, Math.min(9.7, y + 1)));
    const paden = stukken.map((stuk) => vlak([geplaatst(woning, stuk, WAAR_WONING)], "#404040"));
    let zaad = 7;
    const toeval = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 1500; k++) {
      const [x, y, b, h] = [toeval() * 2300, toeval() * 1600, 2 + toeval() * 30, 2 + toeval() * 30];
      paden.push(vlak([rechthoek(x, y, x + b, y + h)], toeval() < 0.5 ? "#ffffff" : "#7fbf6a"));
    }
    for (let k = 0; k < 2500; k++) {
      const [x, y] = [toeval() * 2300, toeval() * 1600];
      paden.push(lijn([
        [x, y],
        [x + toeval() * 50, y + toeval() * 50],
      ]));
    }
    return blad(paden, teksten);
  }

  it("vindt de woning uit losse muren tussen allerlei vormen, met of zonder schaal op het blad", () => {
    const metSchaal = plaatsAutomatisch([woning], drukPlan(["1/200"]));
    expect(metSchaal).toMatchObject({ noemer: 200, bron: "plan" });
    verwacht(metSchaal.gevonden.get(1), WAAR_WONING);
    // Zonder schaal past de L op 1/1000 ook voor meer dan 85% op een willekeurige rechthoek, maar op 1/200 beter.
    const zonder = plaatsAutomatisch([woning], drukPlan([]));
    expect(zonder).toMatchObject({ noemer: 200, bron: "gebouwen" });
    verwacht(zonder.gevonden.get(1), WAAR_WONING);
  });
});

describe("een symmetrische vorm", () => {
  const RECHTHOEK = rechthoek(0, 0, 10, 8);
  // Een binnenmuur dicht bij één kant: zo is het huis zelf niet symmetrisch.
  const BINNENMUUR: [Xy, Xy] = [
    [3, 0],
    [3, 8],
  ];
  const huis = zoekgebouw(5, RECHTHOEK, [BINNENMUUR]);
  const waar: Plaatsing = { x: 70, y: 50, hoek: -170 };

  it("kiest de draaiing waarbij de binnenmuren op het plan vallen", () => {
    const vondst = plaatsAutomatisch(
      [huis],
      blad([vlak([geplaatst(huis, RECHTHOEK, waar)]), lijn(BINNENMUUR.map((p) => naarBlad(naarTerrein(p, huis.midden, waar), 200)))], ["1/200"]),
    );
    verwacht(vondst.gevonden.get(5), waar);
  });

  it("kiest zonder binnenmuren de kleinste draaiing: zoals de grondplannen getekend zijn", () => {
    const vondst = plaatsAutomatisch([huis], blad([vlak([geplaatst(huis, RECHTHOEK, waar)])], ["1/200"]));
    verwacht(vondst.gevonden.get(5), { ...waar, hoek: 10 });
  });
});

describe("van een echte PDF", () => {
  it("vindt de woning op een inplantingsplan in een PDF, met y naar boven en een transformatie", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { leesBlad } = await import("@/lib/bouw/omzetting/lezen");
    const { maakPdf, pdf } = await import("./fixtures/bouw/pdf-schrijver");
    // In PDF ligt de oorsprong linksonder: (x, y) op het blad wordt (x, hoogte - y).
    const omhoog = (p: Xy): [number, number] => [p[0], HOOGTE - p[1]];
    const bytes = maakPdf([
      {
        breedte: BREEDTE,
        hoogte: HOOGTE,
        inhoud: [
          pdf.bewaar(),
          pdf.vulkleur("#c8c8c8"),
          pdf.lijnkleur("#000000"),
          pdf.veelhoek(geplaatst(woning, WONING, WAAR_WONING).map(omhoog)),
          pdf.vulEnTrek(),
          pdf.lijnkleur("#000000"),
          pdf.veelhoek(rechthoek(40, 20, 100, 95).map((p) => omhoog(naarBlad(p, 200)))),
          pdf.trek(),
          pdf.herstel(),
          pdf.tekst(2000, 100, 10, "INPLANTINGSPLAN 1/200"),
        ],
      },
    ]);
    const taak = getDocument({ data: bytes, verbosity: 0 });
    try {
      const document = await taak.promise;
      const gelezen = await leesBlad(await document.getPage(1));
      const vondst = plaatsAutomatisch([woning], gelezen);
      expect(vondst).toMatchObject({ noemer: 200, bron: "plan" });
      verwacht(vondst.gevonden.get(1), WAAR_WONING);
    } finally {
      await taak.destroy();
    }
  });
});

describe("plaatsingen bewaren", () => {
  it("houdt enkel nette getallen over, en de hoek tussen -180 en 180", () => {
    expect(
      schoneInplanting({
        planId: 4,
        schaal: 200,
        plaatsen: [
          { gebouwId: 1, plaats: { x: 60.12345, y: 45.0001, hoek: 383.5 } },
          { gebouwId: 2, plaats: null },
        ],
      }),
    ).toEqual({
      planId: 4,
      schaal: 200,
      plaatsen: [
        { gebouwId: 1, plaats: { x: 60.123, y: 45, hoek: 23.5 } },
        { gebouwId: 2, plaats: null },
      ],
    });
    expect(schoneInplanting({ planId: null, schaal: null, plaatsen: [] })).toEqual({ planId: null, schaal: null, plaatsen: [] });
  });

  it("weigert wat niet klopt", () => {
    const goed = { planId: 4, schaal: 200, plaatsen: [{ gebouwId: 1, plaats: { x: 1, y: 2, hoek: 3 } }] };
    expect(schoneInplanting(goed)).not.toBeNull();
    for (const fout of [
      null,
      "x",
      { ...goed, planId: -1 },
      { ...goed, planId: "4" },
      { ...goed, schaal: 5 },
      { ...goed, schaal: 200.5 },
      { ...goed, plaatsen: "x" },
      { ...goed, plaatsen: [{ gebouwId: 1, plaats: { x: Number.NaN, y: 2, hoek: 3 } }] },
      { ...goed, plaatsen: [{ gebouwId: 1, plaats: { x: 20000, y: 2, hoek: 3 } }] },
      { ...goed, plaatsen: [{ gebouwId: 1, plaats: { x: 1, y: 2 } }] },
      { ...goed, plaatsen: [goed.plaatsen[0], goed.plaatsen[0]] },
      { ...goed, plaatsen: Array.from({ length: 51 }, (_, i) => ({ gebouwId: i + 1, plaats: null })) },
    ]) {
      expect(schoneInplanting(fout)).toBeNull();
    }
  });

  it("houdt de gebouwen op hun plek op het plan als de schaal verandert, en zet een geheel in het midden", () => {
    const plaatsingen = new Map<number, Plaatsing>([[1, { x: 60, y: 40, hoek: 12 }]]);
    expect(herschaald(plaatsingen, 1.25).get(1)).toEqual({ x: 75, y: 50, hoek: 12 });
    const gebouwen = [{ id: 1, kader: { x0: 0, y0: 0, x1: 10, y1: 8 }, z1: 6 }];
    const midden = middenVan(kaderOpTerrein(gebouwen, rondMidden(gebouwen, plaatsingen, [100, 70])));
    expect(midden[0]).toBeCloseTo(100, 9);
    expect(midden[1]).toBeCloseTo(70, 9);
  });
});

// ---------------------------------------------------------------------------
// De inplanting in de databank, met de nagebootste databank
// ---------------------------------------------------------------------------

describe("de inplanting in de databank", () => {
  it("leest en bewaart de plaatsen, het plan en de schaal, en weigert wat van een ander huis is", async () => {
    const { vi } = await import("vitest");
    const { metHuis, nepSupabase, TESTHUIS } = await import("./stubs/nep-supabase");
    const db = nepSupabase({
      bouw_huizen: [{ ...TESTHUIS, inplanting_plan_id: null, inplanting_schaal: null }, { ...TESTHUIS, id: 2, naam: "Ander huis" }],
      bouw_gebouwen: [
        ...metHuis([
          { id: 1, naam: "Woning", volgorde: 0, plaats_x_m: 60, plaats_y_m: 45, plaats_hoek: 23.5 },
          { id: 2, naam: "Berging", volgorde: 1, plaats_x_m: null, plaats_y_m: null, plaats_hoek: null },
        ]),
        ...metHuis([{ id: 3, naam: "Woning", volgorde: 0 }], 2),
      ],
      bouw_plannen: [
        ...metHuis([{ id: 30, titel: "Inplantingsplan", soort: "inplanting" }]),
        ...metHuis([{ id: 40, titel: "Inplantingsplan", soort: "inplanting" }], 2),
      ],
    });
    vi.doMock("@/lib/supabase", () => ({ db: () => db.client }));
    vi.resetModules();
    const { bewaarInplanting, leesInplanting } = await import("@/lib/bouw/opslag");

    expect(await leesInplanting(1)).toEqual({ planId: null, schaal: null, plaatsen: new Map([[1, { x: 60, y: 45, hoek: 23.5 }]]), georef: null });

    await bewaarInplanting(1, {
      planId: 30,
      schaal: 200,
      plaatsen: [
        { gebouwId: 1, plaats: null },
        { gebouwId: 2, plaats: { x: 85, y: 70, hoek: -8 } },
      ],
    });
    expect(await leesInplanting(1)).toEqual({ planId: 30, schaal: 200, plaatsen: new Map([[2, { x: 85, y: 70, hoek: -8 }]]), georef: null });

    // Een plan of een gebouw van een ander huis: geweigerd, en niets veranderd.
    await expect(bewaarInplanting(1, { planId: 40, schaal: 250, plaatsen: [] })).rejects.toThrow("hoort niet bij dit huis");
    await expect(
      bewaarInplanting(1, { planId: 30, schaal: 250, plaatsen: [{ gebouwId: 3, plaats: { x: 1, y: 1, hoek: 0 } }] }),
    ).rejects.toThrow("hoort niet bij dit huis");
    expect(db.tabellen.bouw_gebouwen.find((g) => g.id === 3)?.plaats_x_m).toBeUndefined();
    expect(await leesInplanting(1)).toMatchObject({ planId: 30, schaal: 200 });

    // Waar het terrein op de kaart ligt (verzonnen coördinaten), en weer wissen.
    const { bewaarGeoref } = await import("@/lib/bouw/opslag");
    await bewaarGeoref(1, { x: 150000.5, y: 180000.25, hoek: 12.5 });
    expect((await leesInplanting(1)).georef).toEqual({ x: 150000.5, y: 180000.25, hoek: 12.5 });
    expect(db.tabellen.bouw_huizen.find((h) => h.id === 2)?.lambert_x).toBeUndefined();
    await bewaarGeoref(1, null);
    expect((await leesInplanting(1)).georef).toBeNull();
    vi.doUnmock("@/lib/supabase");
  });
});
