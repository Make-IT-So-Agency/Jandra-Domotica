import { describe, expect, it } from "vitest";

import { maakDak } from "@/lib/bouw/drie/dak";
import { deurbladOpKier, draaiboog, vastGlasNaast } from "@/lib/bouw/drie/deuren";
import { ramenLangs, vindGaten, type Gekendeopening } from "@/lib/bouw/drie/gaten";
import { maakModel, stapel, type Invoerverdieping, type Verdieping3d } from "@/lib/bouw/drie/model";
import { binnenVeelhoeken, doorsnede, omhullende, vergrootConvex, vereniging, verschil } from "@/lib/bouw/drie/vlak";
import { nettoOppervlakte } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

describe("vlakken", () => {
  it("voegt overlappende muren samen en trekt af", () => {
    const samen = vereniging([[rechthoek(0, 0, 2, 1)], [rechthoek(1, 0, 3, 1)]]);
    expect(samen).toHaveLength(1);
    expect(nettoOppervlakte(samen[0])).toBeCloseTo(3);
    const rest = verschil([[rechthoek(0, 0, 4, 4)]], [[rechthoek(0, 0, 2, 4)]]);
    expect(nettoOppervlakte(rest[0])).toBeCloseTo(8);
  });

  it("rekent ook met twee vormen die op een haar na samenvallen", () => {
    // polygon-clipping gooit hier "Unable to complete output ring"; een minieme verschuiving lost dat op.
    const a: Xy[] = [[34.26653861671696, 58.70361139390198], [64.61321183952688, 72.27119866312532], [79.89513371015445, 42.95460159013551], [58.98467773995562, 23.390531688441325]];
    const b: Xy[] = [[34.26653861671696, 58.703611393901994], [64.61321183952688, 72.27119866312532], [79.89513371015445, 42.954601590135525], [58.984677739955615, 23.39053168844132]];
    const gemeen = doorsnede([[a]], [[b]]).reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0);
    expect(gemeen).toBeCloseTo(nettoOppervlakte([a]), 2);
  });

  it("kent gaten, de omhullende en een grotere rand", () => {
    const ring = [rechthoek(0, 0, 10, 10), rechthoek(4, 4, 6, 6)];
    expect(binnenVeelhoeken([1, 1], [ring])).toBe(true);
    expect(binnenVeelhoeken([5, 5], [ring])).toBe(false);
    expect(omhullende([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]])).toHaveLength(4);
    const groter = vergrootConvex(omhullende(rechthoek(0, 0, 1, 1)), 0.5);
    expect(Math.min(...groter.map((p) => p[0]))).toBeCloseTo(-0.5);
    expect(Math.max(...groter.map((p) => p[1]))).toBeCloseTo(1.5);
  });
});

// Een eenvoudig huis: twee ruimtes, buitenmuren van 40 cm met een raam in de
// linkermuur en een voordeur onderaan, en een binnenmuur met een deur.
const LINKS = { id: 1, naam: "leefruimte", soort: "leefruimte" as const, ringen: [rechthoek(0.4, 0.4, 5, 7.6)], plafondhoogte: null };
const RECHTS = { id: 2, naam: "keuken", soort: "keuken" as const, ringen: [rechthoek(5.14, 0.4, 9.6, 7.6)], plafondhoogte: null };
const MUREN: Xy[][] = [
  rechthoek(0, 0, 10, 0.4),
  rechthoek(9.6, 0.4, 10, 7.6),
  // De onderste muur, met een voordeur van 1 m in de keuken.
  rechthoek(0, 7.6, 7, 8),
  rechthoek(8, 7.6, 10, 8),
  // De linkermuur, met een raam van 2 m.
  rechthoek(0, 0.4, 0.4, 2),
  rechthoek(0, 4, 0.4, 7.6),
  // De binnenmuur, met een deur van 90 cm.
  rechthoek(5, 0.4, 5.14, 3),
  rechthoek(5, 3.9, 5.14, 7.6),
];

function verdieping(over: Partial<Invoerverdieping> = {}): Invoerverdieping {
  return {
    id: 10,
    naam: "Gelijkvloers",
    gebouwId: 1,
    volgorde: 0,
    vloerpeil: 0,
    plafondhoogte: 2.8,
    verdiepingshoogte: 3.2,
    ruimtes: [LINKS, RECHTS],
    muren: MUREN,
    openingen: [
      { soort: "deur", x: 5.14, y: 3.9, breedte: 0.9, hoogte: null },
      { soort: "deur", x: 8, y: 7.6, breedte: 1, hoogte: null },
      { soort: "raam", x: -0.4, y: 3, breedte: 2, hoogte: 1.25 },
    ],
    ...over,
  };
}

describe("ramen en deuren in de open plekken", () => {
  it("vindt het raam, de binnendeur (één keer) en de voordeur", () => {
    const muren = vereniging(MUREN.map((ring) => [ring]));
    const gaten = vindGaten([LINKS, RECHTS], muren, verdieping().openingen, 2.8);
    const soorten = gaten.map((g) => [g.soort, Math.round(Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) * 100) / 100]);
    expect(soorten).toEqual(expect.arrayContaining([["raam", 2], ["deur", 0.9], ["buitendeur", 1]]));
    expect(gaten).toHaveLength(3);
    const raam = gaten.find((g) => g.soort === "raam")!;
    // Een label 205 x 125 geeft de hoogte; de latei op de gewone hoogte.
    expect(raam).toMatchObject({ onder: 0.9, boven: 2.15, dikte: 0.4 });
    expect(raam.n[0]).toBeCloseTo(-1);
    expect(gaten.find((g) => g.soort === "deur")!.dikte).toBeCloseTo(0.14, 1);
  });

  it("zonder muren geen openingen", () => {
    expect(vindGaten([LINKS], [], [], 2.8)).toEqual([]);
  });

  const muren = vereniging(MUREN.map((ring) => [ring]));

  it("zoekt ook langs een zone zonder ruimte, zoals een traphal, maar enkel naar buiten", () => {
    // Zonder de leefruimte ziet vindGaten het raam in de linkermuur (x = 0 tot 0,4) niet: het ligt langs geen ruimte.
    expect(vindGaten([RECHTS], muren, [], 2.8).some((g) => g.a[0] < 1)).toBe(false);
    // Langs de rand van die zone wel; de deur naar de keuken vindt de keuken zelf.
    const langs = ramenLangs([LINKS.ringen[0]], [RECHTS], muren, [], 2.8);
    expect(langs).toHaveLength(1);
    expect(langs[0]).toMatchObject({ soort: "raam", onder: 0.9, boven: 2.15, dikte: 0.4 });
    expect(langs[0].a[0]).toBeCloseTo(0.4);
  });
  const raamMet = (openingen: Gekendeopening[]) => vindGaten([LINKS, RECHTS], muren, openingen, 2.8).find((g) => g.soort === "raam")!;

  it("neemt een maat op een maatlijn buiten de muur, met dezelfde breedte", () => {
    // De linkermuur heeft een raam van 2 m tussen y = 2 en 4, met de buitenkant op x = 0.
    expect(raamMet([{ soort: "raam", x: -1, y: 3, breedte: 2, hoogte: 2.75, vorm: "/" }])).toMatchObject({ onder: 0, boven: 2.75 });
    // Een andere breedte, of binnen (een tegel): niet van dit raam.
    expect(raamMet([{ soort: "raam", x: -1, y: 3, breedte: 1.5, hoogte: 2.75, vorm: "/" }])).toMatchObject({ onder: 0.9, boven: 2.15 });
    expect(raamMet([{ soort: "raam", x: 1.5, y: 3, breedte: 2, hoogte: 2.75, vorm: "/" }])).toMatchObject({ onder: 0.9, boven: 2.15 });
  });

  it("begint een raam op zijn borstwering, en telt de hoogte erbovenop", () => {
    const bw: Gekendeopening = { soort: "borstwering", x: 0.5, y: 3, breedte: 0, hoogte: 0.4 };
    expect(raamMet([{ soort: "raam", x: -1, y: 3, breedte: 2, hoogte: 2.35, vorm: "/" }, bw])).toMatchObject({ onder: 0.4, boven: 2.75 });
    // Tot het plafond, niet hoger.
    expect(raamMet([{ soort: "raam", x: -1, y: 3, breedte: 2, hoogte: 2.75, vorm: "/" }, bw])).toMatchObject({ onder: 0.4, boven: 2.78 });
    // Een borstwering verder van het raam is de hoogte van een leuning.
    expect(raamMet([{ ...bw, x: 1 }])).toMatchObject({ onder: 0.9 });
  });

  it("ziet de vakken als de maten bij het raam samen de opening vullen", () => {
    const vakken: Gekendeopening[] = [
      { soort: "raam", x: -0.3, y: 2.6, breedte: 1.2, hoogte: 2.75, vorm: "x" },
      { soort: "raam", x: -0.3, y: 3.6, breedte: 0.8, hoogte: 2.75, vorm: "x" },
    ];
    // Van a (onderaan, y = 4) naar b: eerst het vak van 80 cm.
    const raam = raamMet(vakken);
    expect(raam.a[1]).toBeCloseTo(4);
    expect(raam.verdeling).toEqual([0.8]);
    // Tellen ze niet op tot de opening, dan geen vakken.
    expect(raamMet([vakken[0]]).verdeling).toBeUndefined();
    expect(raamMet([vakken[0], { ...vakken[1], breedte: 1.2 }]).verdeling).toBeUndefined();
  });

  it("geeft een deur haar blad, naar de kant waar ze opendraait", () => {
    // De binnendeur tussen y = 3 en 3,9, met het scharnier onderaan aan de kant van de keuken.
    const deur: Gekendeopening = { soort: "deur", x: 5.14, y: 3.9, breedte: 0.9, hoogte: null, boog: [[6.04, 3.9], [5.14, 3]] };
    const gat = vindGaten([LINKS, RECHTS], muren, [deur], 2.8).find((g) => g.soort === "deur")!;
    expect(gat.bladen).toEqual([{ scharnier: [5.14, 3.9], dicht: [5.14, 3], open: [6.04, 3.9] }]);
    // Een dubbele deur: twee bladen.
    const dubbel = vindGaten(
      [LINKS, RECHTS],
      muren,
      [
        { soort: "deur", x: 5.14, y: 3.9, breedte: 0.45, hoogte: null, boog: [[5.14, 3.45], [5.59, 3.9]] },
        { soort: "deur", x: 5.14, y: 3, breedte: 0.45, hoogte: null, boog: [[5.14, 3.45], [5.59, 3]] },
      ],
      2.8,
    ).find((g) => g.soort === "deur")!;
    expect(dubbel.bladen).toHaveLength(2);
    // De boog van een buurdeur, met het scharnier op dezelfde hoek maar dicht buiten de opening: niet van deze deur.
    const buur: Gekendeopening = { soort: "deur", x: 5.14, y: 3.9, breedte: 0.9, hoogte: null, boog: [[6.04, 3.9], [5.14, 4.8]] };
    const zonder = vindGaten([LINKS, RECHTS], muren, [buur], 2.8);
    expect(zonder.find((g) => g.soort === "deur")).toBeUndefined();
    expect(zonder.find((g) => g.soort === "doorgang")?.bladen).toBeUndefined();
  });

  it("geeft een buitendeur de hoogte van haar maat", () => {
    const deur: Gekendeopening = { soort: "deur", x: 8, y: 7.6, breedte: 1, hoogte: null, boog: [[7, 7.6], [8, 6.6]] };
    const maat: Gekendeopening = { soort: "raam", x: 7.5, y: 8.8, breedte: 1, hoogte: 2.4, vorm: "/" };
    const gat = vindGaten([LINKS, RECHTS], muren, [deur, maat], 2.8).find((g) => g.soort === "buitendeur")!;
    expect(gat).toMatchObject({ onder: 0, boven: 2.4 });
    expect(gat.bladen).toHaveLength(1);
  });
});

describe("een deurblad in 3D", () => {
  const blad = { scharnier: [0, 0] as Xy, dicht: [0.9, 0] as Xy, open: [0, 0.9] as Xy };

  it("staat op een kier naar de kant waar het opendraait", () => {
    const hoeken = deurbladOpKier(blad, 30, 0.04)!;
    // Het uiteinde van het blad: 0,9 m van het scharnier, 30° naar de open kant.
    const eind: Xy = [(hoeken[1][0] + hoeken[2][0]) / 2, (hoeken[1][1] + hoeken[2][1]) / 2];
    expect(eind[0]).toBeCloseTo(0.9 * Math.cos(Math.PI / 6));
    expect(eind[1]).toBeCloseTo(0.9 * Math.sin(Math.PI / 6));
    expect(Math.hypot(hoeken[0][0] - hoeken[3][0], hoeken[0][1] - hoeken[3][1])).toBeCloseTo(0.04);
    expect(deurbladOpKier({ ...blad, dicht: [0, 0] })).toBeNull();
  });

  it("tekent de boog op de vloer, van dicht tot open", () => {
    const boog = draaiboog(blad, 0.02, 4)!;
    expect(boog).toHaveLength(10);
    expect(boog[0][0]).toBeCloseTo(0.91);
    expect(boog[4][1]).toBeCloseTo(0.91);
  });

  it("zet vast glas waar geen blad is", () => {
    // Een voordeur van 2 m: een blad van 1,2 m aan de kant van a, en 0,8 m glas.
    const voordeur = { scharnier: [0, 0] as Xy, dicht: [1.2, 0] as Xy, open: [0, 1.2] as Xy };
    expect(vastGlasNaast([0, 0], [2, 0], [voordeur])).toEqual([[1.2, 2]]);
    expect(vastGlasNaast([0, 0], [1.25, 0], [voordeur])).toEqual([]);
    // Een dubbele deur vult de opening.
    const tweede = { scharnier: [2, 0] as Xy, dicht: [1.2, 0] as Xy, open: [2, 0.8] as Xy };
    expect(vastGlasNaast([0, 0], [2, 0], [voordeur, tweede])).toEqual([]);
  });
});

describe("het model", () => {
  it("stapelt verdiepingen op hun peil, of op hun volgorde", () => {
    const boven = verdieping({ id: 11, naam: "Verdieping", volgorde: 1, vloerpeil: 3.2, plafondhoogte: 2.6, verdiepingshoogte: null });
    expect(stapel([boven, verdieping()]).map((s) => [s.verdieping.id, s.z0, s.hoogte])).toEqual([
      [10, 0, 3.2],
      [11, 3.2, 3],
    ]);
    const zonderPeil = stapel([verdieping({ vloerpeil: null }), { ...boven, vloerpeil: null }]);
    expect(zonderPeil.map((s) => s.z0)).toEqual([0, 3.2]);
  });

  it("geeft elke muurkant binnen of buiten, ook de dagkant van een deur", () => {
    const model = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [verdieping()]);
    const [gelijkvloers] = model.verdiepingen;
    expect(gelijkvloers).toMatchObject({ z0: 0, z1: 2.95, plafond: 2.8 });
    const kanten = gelijkvloers.muren.flatMap((m) =>
      m.veelhoek.flatMap((ring, r) => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length], ...m.zijden[r][i] }))),
    );
    // De bovenkant van de bovenste buitenmuur (y = 0) kijkt naar buiten, de onderkant (y = 0,4) naar de ruimte.
    const op = (y: number, x: number) => kanten.find((k) => k.a[1] === y && k.b[1] === y && Math.min(k.a[0], k.b[0]) <= x && Math.max(k.a[0], k.b[0]) >= x);
    expect(op(0, 2)).toMatchObject({ zijde: "buiten", n: [0, -1] });
    expect(op(0.4, 2)?.zijde).toBe("binnen");
    // De dagkant van de binnendeur hoort bij binnen.
    const dagkant = kanten.find((k) => k.a[0] >= 5 && k.b[0] <= 5.14 && (k.a[1] === 3 || k.b[1] === 3) && k.a[1] === k.b[1]);
    expect(dagkant?.zijde).toBe("binnen");
    // Plat dak: een plaat bovenop.
    expect(gelijkvloers.dakplaat).toMatchObject({ z0: 2.95, z1: 3.25 });
    expect(model.gebouwen[0].kader).toMatchObject({ x0: 0, y0: 0, x1: 10, y1: 8 });
  });

  it("rekent een kleine zone zonder naam (een trapzone) tot binnen; een patio niet", () => {
    // Rechts onderaan een zone van 4,46 × 2,6 m zonder ruimte op het plan, met een trap erin; erboven het trapgat.
    const muren: Xy[][] = [
      rechthoek(0, 0, 10, 0.4),
      rechthoek(9.6, 0.4, 10, 7.6),
      rechthoek(0, 7.6, 10, 8),
      rechthoek(0, 0.4, 0.4, 7.6),
      rechthoek(5, 0.4, 5.14, 7.6),
      rechthoek(5.14, 4.86, 9.6, 5),
    ];
    const keuken = { ...RECHTS, ringen: [rechthoek(5.14, 0.4, 9.6, 4.86)] };
    const trap = {
      richting: "pijl" as const,
      delen: [{ soort: "vlucht" as const, hoeken: [[5.3, 5], [5.3, 6.1], [9.4, 6.1], [9.4, 5]] as [Xy, Xy, Xy, Xy], treden: 16 }],
    };
    const onder = verdieping({ ruimtes: [LINKS, keuken], muren, openingen: [], trappen: [trap] });
    const boven = verdieping({ id: 11, naam: "Verdieping", volgorde: 1, vloerpeil: 3.2, verdiepingshoogte: null, ruimtes: [LINKS, keuken], muren, openingen: [] });
    const [gv, v1] = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [onder, boven]).verdiepingen;
    const zijdeOp = (verd: typeof gv, y: number, x: number, n: Xy) =>
      verd.muren
        .flatMap((m) => m.veelhoek.flatMap((ring, r) => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length], ...m.zijden[r][i] }))))
        .find((k) => k.a[1] === y && k.b[1] === y && Math.min(k.a[0], k.b[0]) <= x && Math.max(k.a[0], k.b[0]) >= x && k.n[1] === n[1])?.zijde;
    // Beneden: de vloerplaat loopt door de zone, en de muren rond de zone zijn binnenmuren.
    expect(binnenVeelhoeken([7, 6.8], gv.plaat.veelhoeken)).toBe(true);
    expect(zijdeOp(gv, 5, 7, [0, 1])).toBe("binnen");
    expect(zijdeOp(gv, 7.6, 7, [0, -1])).toBe("binnen");
    expect(zijdeOp(gv, 8, 7, [0, 1])).toBe("buiten");
    // Boven: het trapgat blijft open, en ook daar zijn de muren eromheen binnenmuren.
    expect(binnenVeelhoeken([7, 6.8], v1.plaat.veelhoeken)).toBe(false);
    expect(zijdeOp(v1, 5, 7, [0, 1])).toBe("binnen");
    // Maar het dak erboven is dicht: een traphal staat niet open naar de lucht.
    expect(binnenVeelhoeken([7, 6.8], v1.dakplaat!.veelhoeken)).toBe(true);
    // Ook als het trapgat aan een raam ligt dat de omzetting niet als opening las: wat boven de trap ligt, is binnen.
    const zonderRaam = { ...boven, muren: [...muren.filter((m) => m[0][1] !== 7.6), rechthoek(0, 7.6, 5.14, 8)] };
    const [, open] = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [onder, zonderRaam]).verdiepingen;
    expect(zijdeOp(open, 5, 7, [0, 1])).toBe("binnen");
    expect(zijdeOp(open, 0, 7, [0, -1])).toBe("buiten");

    // Een patio van 4 × 4 m tussen vier ruimtes blijft buiten.
    const ruimte = (id: number, ring: Xy[]) => ({ id, naam: `r${id}`, soort: "leefruimte" as const, ringen: [ring], plafondhoogte: null });
    const rond = verdieping({
      ruimtes: [ruimte(1, rechthoek(0.4, 0.4, 9.6, 2.86)), ruimte(2, rechthoek(0.4, 7.14, 9.6, 9.6)), ruimte(3, rechthoek(0.4, 3, 2.86, 7)), ruimte(4, rechthoek(7.14, 3, 9.6, 7))],
      muren: [
        rechthoek(0, 0, 10, 0.4),
        rechthoek(0, 9.6, 10, 10),
        rechthoek(0, 0.4, 0.4, 9.6),
        rechthoek(9.6, 0.4, 10, 9.6),
        rechthoek(2.86, 2.86, 7.14, 3),
        rechthoek(2.86, 7, 7.14, 7.14),
        rechthoek(2.86, 3, 3, 7),
        rechthoek(7, 3, 7.14, 7),
      ],
      openingen: [],
    });
    const [metPatio] = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [rond]).verdiepingen;
    expect(binnenVeelhoeken([5, 5], metPatio.plaat.veelhoeken)).toBe(false);
    expect(zijdeOp(metPatio, 3, 5, [0, 1])).toBe("buiten");
    // Een patio heeft ook geen dak.
    expect(binnenVeelhoeken([5, 5], metPatio.dakplaat!.veelhoeken)).toBe(false);
  });

  it("vult een traphal aan die boven open is naar buiten: met het raam ervoor, of met de gevel van beneden", () => {
    // Zoals hierboven: rechts onderaan een trapzone van 4,46 × 2,6 m zonder ruimte, met een trap van het plan erin.
    const muren: Xy[][] = [
      rechthoek(0, 0, 10, 0.4),
      rechthoek(9.6, 0.4, 10, 7.6),
      rechthoek(0, 7.6, 10, 8),
      rechthoek(0, 0.4, 0.4, 7.6),
      rechthoek(5, 0.4, 5.14, 7.6),
      rechthoek(5.14, 4.86, 9.6, 5),
    ];
    const keuken = { ...RECHTS, ringen: [rechthoek(5.14, 0.4, 9.6, 4.86)] };
    const trap = {
      richting: "pijl" as const,
      delen: [{ soort: "vlucht" as const, hoeken: [[5.3, 5], [5.3, 6.1], [9.4, 6.1], [9.4, 5]] as [Xy, Xy, Xy, Xy], treden: 16 }],
    };
    const onder = verdieping({ ruimtes: [LINKS, keuken], muren, openingen: [], trappen: [trap] });
    // Boven dezelfde muren, met een andere onderste gevel.
    const boven = (gevel: Xy[][], ruimtes = [LINKS, keuken], binnenmuren = muren.filter((m) => m[0][1] !== 7.6)) =>
      verdieping({ id: 11, naam: "Verdieping", volgorde: 1, vloerpeil: 3.2, verdiepingshoogte: null, ruimtes, muren: [...binnenmuren, ...gevel], openingen: [] });
    const plat = [{ id: 1, dak: { type: "plat" as const, helling: 35, nok: "x" as const, overstek: 0.3 } }];
    const geenDak = (v: Verdieping3d, p: Xy) => v.dakplaat === null || !binnenVeelhoeken(p, v.dakplaat.veelhoeken);
    const zijdeOp = (v: Verdieping3d, y: number, x: number, n: Xy) =>
      v.muren
        .flatMap((m) => m.veelhoek.flatMap((ring, r) => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length], ...m.zijden[r][i] }))))
        .find((k) => k.a[1] === y && k.b[1] === y && Math.min(k.a[0], k.b[0]) <= x && Math.max(k.a[0], k.b[0]) >= x && k.n[1] === n[1])?.zijde;
    const raamOnderaan = (v: Verdieping3d) => v.gaten.find((g) => g.soort === "raam" && Math.abs(g.a[1] - 7.6) < 0.01 && g.a[0] > 5);

    // Boven staat in de gevel voor de trapzone een raam van 2,6 m, dat de omzetting niet als opening las: daar is de muur open.
    const [gv, v1] = maakModel(plat, [onder, boven([rechthoek(0, 7.6, 6, 8), rechthoek(8.6, 7.6, 10, 8)])]).verdiepingen;
    const raam = raamOnderaan(v1);
    expect(raam).toBeDefined();
    expect(Math.min(raam!.a[0], raam!.b[0])).toBeCloseTo(6, 1);
    expect(Math.max(raam!.a[0], raam!.b[0])).toBeCloseTo(8.6, 1);
    // Het gelijkvloers krijgt er geen plat dak meer, ook niet op zijn gevel; boven is het dak dicht.
    expect(geenDak(gv, [7, 6.8])).toBe(true);
    expect(geenDak(gv, [7.3, 7.8])).toBe(true);
    expect(binnenVeelhoeken([7, 6.8], v1.dakplaat!.veelhoeken)).toBe(true);
    // Het trapgat blijft open, onder het raam ligt vloer, en rond de traphal zijn het binnenmuren.
    expect(binnenVeelhoeken([7, 6.8], v1.plaat.veelhoeken)).toBe(false);
    expect(binnenVeelhoeken([7.3, 7.8], v1.plaat.veelhoeken)).toBe(true);
    expect(zijdeOp(v1, 5, 7, [0, 1])).toBe("binnen");

    // Ligt ook de hoek open, dan vindt de app geen raam: dan komt de gevelmuur van beneden, binnen gepleisterd.
    const [gv2, v2] = maakModel(plat, [onder, boven([rechthoek(0, 7.6, 5.14, 8)])]).verdiepingen;
    expect(raamOnderaan(v2)).toBeUndefined();
    expect(zijdeOp(v2, 8, 7, [0, 1])).toBe("buiten");
    expect(zijdeOp(v2, 7.6, 7, [0, -1])).toBe("binnen");
    expect(geenDak(gv2, [7, 6.8])).toBe(true);
    expect(binnenVeelhoeken([7, 6.8], v2.dakplaat!.veelhoeken)).toBe(true);
    expect(binnenVeelhoeken([7, 6.8], v2.plaat.veelhoeken)).toBe(false);

    // Dekt de verdieping erboven de hele rechterkant niet (een terras), dan komt er niets bij: de keuken krijgt een plat dak,
    // de trap van beneden niet.
    const links = [rechthoek(0, 0, 5.14, 0.4), rechthoek(0, 0.4, 0.4, 7.6), rechthoek(5, 0.4, 5.14, 7.6)];
    const [gv3, v3] = maakModel(plat, [onder, boven([rechthoek(0, 7.6, 5.14, 8)], [LINKS], links)]).verdiepingen;
    expect(v3.muren.some((m) => binnenVeelhoeken([9.8, 3], [m.veelhoek]))).toBe(false);
    expect(binnenVeelhoeken([7, 2], gv3.dakplaat!.veelhoeken)).toBe(true);
    expect(binnenVeelhoeken([7, 6.8], gv3.dakplaat!.veelhoeken)).toBe(false);
  });

  it("maakt van een opening naar een trapzone een doorgang, geen raam", () => {
    // De keuken komt via een opening van 1 m uit in de trapzone eronder, die geen ruimte heeft.
    const muren: Xy[][] = [
      rechthoek(0, 0, 10, 0.4),
      rechthoek(9.6, 0.4, 10, 7.6),
      rechthoek(0, 7.6, 10, 8),
      rechthoek(0, 0.4, 0.4, 7.6),
      rechthoek(5, 0.4, 5.14, 7.6),
      rechthoek(5.14, 4.86, 6, 5),
      rechthoek(7, 4.86, 9.6, 5),
    ];
    const keuken = { ...RECHTS, ringen: [rechthoek(5.14, 0.4, 9.6, 4.86)] };
    const plat = [{ id: 1, dak: { type: "plat" as const, helling: 35, nok: "x" as const, overstek: 0.3 } }];
    const [gv] = maakModel(plat, [verdieping({ ruimtes: [LINKS, keuken], muren, openingen: [] })]).verdiepingen;
    const opening = gv.gaten.find((g) => Math.abs(g.a[1] - 4.86) < 0.01);
    expect(opening).toMatchObject({ soort: "doorgang", onder: 0, boven: 2.15 });
    // Naar buiten blijft een raam een raam.
    expect(gv.gaten.some((g) => g.soort === "raam")).toBe(false);
    const rechts = [...muren.filter((m) => m[0][0] !== 9.6), rechthoek(9.6, 0.4, 10, 2), rechthoek(9.6, 3, 10, 7.6)];
    const [metRaam] = maakModel(plat, [verdieping({ ruimtes: [LINKS, keuken], muren: rechts, openingen: [] })]).verdiepingen;
    expect(metRaam.gaten.find((g) => g.a[0] > 9)?.soort).toBe("raam");
  });

  it("legt een plat dak op wat de verdieping erboven niet bedekt", () => {
    const boven = verdieping({
      id: 11,
      volgorde: 1,
      vloerpeil: 3.2,
      verdiepingshoogte: null,
      ruimtes: [LINKS],
      muren: [rechthoek(0, 0, 5.14, 0.4), rechthoek(0, 7.6, 5.14, 8), rechthoek(0, 0.4, 0.4, 7.6), rechthoek(5, 0.4, 5.14, 7.6)],
      openingen: [],
    });
    const model = maakModel([{ id: 1, dak: { type: "zadel", helling: 35, nok: "x", overstek: 0.3 } }], [verdieping(), boven]);
    const [onder, op] = model.verdiepingen;
    expect(onder.z1).toBeCloseTo(2.95);
    expect(onder.dakplaat).not.toBeNull();
    expect(nettoOppervlakte(onder.dakplaat!.veelhoeken[0])).toBeCloseTo(4.86 * 8, 0);
    expect(op.dakplaat).toBeNull();
    expect(model.daken).toHaveLength(1);
  });
});

describe("het dak", () => {
  const vloer = rechthoek(0, 0, 10, 8);

  it("een zadeldak: twee vlakken, twee gevels met een punt op de nok", () => {
    const dak = maakDak(vloer, 6, { type: "zadel", helling: 45, nok: "x", overstek: 0 })!;
    expect(dak.vlakken).toHaveLength(2);
    expect(dak.gevels).toHaveLength(2);
    const nok = Math.max(...dak.vlakken.flat().map((p) => p[2]));
    expect(nok).toBeCloseTo(10);
    expect(dak.gevels[0]).toHaveLength(5);
  });

  it("een lessenaarsdak loopt op van de lage rand", () => {
    const dak = maakDak(vloer, 6, { type: "lessenaar", helling: 10, nok: "y", overstek: 0 })!;
    expect(dak.vlakken).toHaveLength(1);
    const hoogtes = dak.vlakken[0].map((p) => p[2]);
    expect(Math.min(...hoogtes)).toBeCloseTo(6);
    expect(Math.max(...hoogtes)).toBeCloseTo(6 + 10 * Math.tan((10 * Math.PI) / 180));
  });

  it("een plat dak is een plaat", () => {
    expect(maakDak(vloer, 6, { type: "plat", helling: 0, nok: "x", overstek: 0 })?.plat).toMatchObject({ z0: 6, z1: 6.3 });
  });
});
