import { describe, expect, it } from "vitest";

import { maakDak } from "@/lib/bouw/drie/dak";
import { vindGaten } from "@/lib/bouw/drie/gaten";
import { maakModel, stapel, type Invoerverdieping } from "@/lib/bouw/drie/model";
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
