import { describe, expect, it } from "vitest";

import { vindTrappen, type Trapvoorstel } from "@/lib/bouw/omzetting/trappen";
import type { Blad, Pad, Xy } from "@/lib/bouw/omzetting/types";

/** Een proefblad op schaal 1 punt = 2 cm; alles hieronder in meter. */
const M = 0.02;
const pt = ([x, y]: Xy): Xy => [x / M, y / M];

function lijn(a: Xy, b: Xy): Pad {
  return { vul: null, lijn: "#000000", dikte: 0.5, delen: [{ punten: [pt(a), pt(b)], gesloten: false }], bogen: [] };
}

/** Een streepjeslijn: stukjes van 20 cm met 7 cm ertussen. */
function streepjes(a: Xy, b: Xy): Pad[] {
  const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const r: Xy = [(b[0] - a[0]) / lengte, (b[1] - a[1]) / lengte];
  const uit: Pad[] = [];
  for (let s = 0; s < lengte; s += 0.27) {
    const e = Math.min(lengte, s + 0.2);
    uit.push(lijn([a[0] + r[0] * s, a[1] + r[1] * s], [a[0] + r[0] * e, a[1] + r[1] * e]));
  }
  return uit;
}

/** Een gevuld pijltje met de punt in richting r. */
function pijl(midden: Xy, r: Xy): Pad {
  const n: Xy = [-r[1], r[0]];
  const top: Xy = [midden[0] + r[0] * 0.12, midden[1] + r[1] * 0.12];
  const a: Xy = [midden[0] - r[0] * 0.08 + n[0] * 0.04, midden[1] - r[1] * 0.08 + n[1] * 0.04];
  const b: Xy = [midden[0] - r[0] * 0.08 - n[0] * 0.04, midden[1] - r[1] * 0.08 - n[1] * 0.04];
  return { vul: "#000000", lijn: null, dikte: 0, delen: [{ punten: [pt(top), pt(a), pt(b)], gesloten: true }], bogen: [] };
}

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [pt([x0, y0]), pt([x1, y0]), pt([x1, y1]), pt([x0, y1])];

const blad = (paden: Pad[]): Blad => ({ breedte: 1000, hoogte: 1000, paden, teksten: [], beeldvlak: 0 });

/** In meter, op de centimeter, om makkelijk na te kijken (en zonder -0). */
const cm = (waarde: number) => Math.round(waarde * M * 100) / 100 || 0;

function inMeter(trap: Trapvoorstel) {
  return trap.delen.map((deel) => ({
    soort: deel.soort,
    treden: deel.treden,
    hoeken: deel.hoeken.map(([x, y]) => [cm(x), cm(y)]),
  }));
}

describe("een rechte trap", () => {
  const treden = Array.from({ length: 12 }, (_, k) => lijn([2, 1 + 0.25 * k], [3, 1 + 0.25 * k]));

  it("is een reeks treden, met de richting van de pijl", () => {
    const trappen = vindTrappen(blad([...treden, pijl([2.5, 2], [0, 1])]), M, null, []);
    expect(trappen).toHaveLength(1);
    expect(trappen[0].richting).toBe("pijl");
    const [vlucht] = inMeter(trappen[0]);
    expect(vlucht.soort).toBe("vlucht");
    expect(vlucht.treden).toBe(12);
    // Onderaan bij y = 1, bovenaan bij y = 3,75.
    expect(vlucht.hoeken.map(([, y]) => y)).toEqual([1, 1, 3.75, 3.75]);
  });

  it("loopt de andere kant op als de pijl omgekeerd staat", () => {
    const [trap] = vindTrappen(blad([...treden, pijl([2.5, 2], [0, -1])]), M, null, []);
    expect(inMeter(trap)[0].hoeken.map(([, y]) => y)).toEqual([3.75, 3.75, 1, 1]);
  });

  it("zonder pijl is de richting geraden", () => {
    const [trap] = vindTrappen(blad(treden), M, null, []);
    expect(trap.richting).toBe("geraden");
  });
});

describe("een trap die halfweg 180° draait", () => {
  // Zoals op het plan: de onderste vlucht rechts naar het bordes, de bovenste
  // terug, met een muurtje ertussen. De bovenste staat in streepjes (boven de
  // snede) en één trede verdwijnt achter een muur.
  const xs = Array.from({ length: 8 }, (_, k) => Math.round(k * 0.22 * 100) / 100);
  const onder = xs.map((x) => lijn([x, 2.2], [x, 3.2]));
  const boven = xs.filter((x) => x !== 0.44).flatMap((x) => streepjes([x, 1.06], [x, 2.06]));
  const muren = [rechthoek(0, 2.06, 1.54, 2.2), rechthoek(2.6, 1, 2.74, 3.3)];

  it("wordt vlucht, bordes, vlucht, met het bordes aan de kant van de muur", () => {
    const trappen = vindTrappen(blad([...onder, ...boven, pijl([0.7, 2.7], [1, 0])]), M, null, muren);
    expect(trappen).toHaveLength(1);
    const [eerste, bordes, tweede] = inMeter(trappen[0]);
    expect(trappen[0].richting).toBe("pijl");
    expect(eerste).toMatchObject({ soort: "vlucht", treden: 8 });
    expect(bordes.soort).toBe("bordes");
    expect(tweede).toMatchObject({ soort: "vlucht", treden: 8 });
    // De eerste vlucht begint links (x = 0) en loopt naar rechts.
    expect(eerste.hoeken[0][0]).toBe(0);
    expect(eerste.hoeken[2][0]).toBe(1.54);
    // Het bordes ligt tussen de vluchten en de muur, over de hele breedte.
    const bx = bordes.hoeken.map(([x]) => x);
    const by = bordes.hoeken.map(([, y]) => y);
    expect([Math.min(...bx), Math.max(...bx)]).toEqual([1.54, 2.6]);
    expect([Math.min(...by), Math.max(...by)]).toEqual([1.06, 3.2]);
    // De tweede vlucht begint bij het bordes en loopt terug naar links.
    expect(tweede.hoeken[0][0]).toBe(1.54);
    expect(tweede.hoeken[2][0]).toBe(0);
  });

  it("een pijl in de bovenste vlucht die van het bordes weg wijst, geeft dezelfde trap", () => {
    const trappen = vindTrappen(blad([...onder, ...boven, pijl([0.7, 1.5], [-1, 0])]), M, null, muren);
    expect(inMeter(trappen[0])[0].hoeken[0][1]).toBe(3.2);
  });
});

describe("een trap die 180° draait, zoals architecten hem tekenen", () => {
  // De onderste vlucht begint bij x = 0 en loopt naar het bordes rechts; de
  // snedelijn knipt twee treden in stukken. De bovenste vlucht (streepjes)
  // komt een trede verder links aan, bij x = -0,22. Het bordes begint bij
  // x = 1,54: één streepjeslijn over beide vluchten, want het muurtje ertussen
  // houdt daar op. Links een open inkom met een muur op 1,7 m, een maatlijn
  // twee treden voor de trap, en een lange lijn die over beide vluchten en
  // verder loopt.
  const xs = Array.from({ length: 7 }, (_, k) => Math.round(k * 0.22 * 100) / 100);
  const onder = xs.flatMap((x) =>
    x === 0.88 ? [lijn([x, 2.2], [x, 2.86]), lijn([x, 3.01], [x, 3.3])] : x === 1.1 ? [lijn([x, 2.2], [x, 2.49]), lijn([x, 2.64], [x, 3.3])] : [lijn([x, 2.2], [x, 3.3])],
  );
  const snede = [lijn([0.7, 3.3], [1.3, 2.2]), lijn([0.85, 3.3], [1.45, 2.2])];
  const boven = [-0.22, ...xs].flatMap((x) => streepjes([x, 0.96], [x, 2.06]));
  const rand = streepjes([1.54, 0.96], [1.54, 3.3]);
  const maatlijn = lijn([-0.44, 2.0], [-0.44, 3.4]);
  const aslijn = lijn([-0.6, 0.5], [-0.6, 3.6]);
  const muren = [rechthoek(-0.22, 2.06, 1.54, 2.2), rechthoek(2.54, 0.8, 2.68, 3.5), rechthoek(-2.04, 0.8, -1.9, 3.5)];
  const paden = [...onder, ...snede, ...boven, ...rand, maatlijn, aslijn, pijl([0.5, 2.75], [1, 0])];

  it("legt het bordes waar de lijn over beide vluchten loopt, en telt alle treden", () => {
    const trappen = vindTrappen(blad(paden), M, null, muren);
    expect(trappen).toHaveLength(1);
    expect(trappen[0].richting).toBe("pijl");
    const [eerste, bordes, tweede] = inMeter(trappen[0]);
    // De eerste vlucht: van x = 0 tot het bordes, 7 treden en de stap op het bordes.
    expect(eerste).toMatchObject({ soort: "vlucht", treden: 8 });
    expect([eerste.hoeken[0][0], eerste.hoeken[2][0]]).toEqual([0, 1.54]);
    expect([Math.min(...eerste.hoeken.map(([, y]) => y)), Math.max(...eerste.hoeken.map(([, y]) => y))]).toEqual([2.2, 3.3]);
    // Het bordes: van de rand tot de muur, over beide vluchten.
    expect(bordes.soort).toBe("bordes");
    const bx = bordes.hoeken.map(([x]) => x);
    const by = bordes.hoeken.map(([, y]) => y);
    expect([Math.min(...bx), Math.max(...bx)]).toEqual([1.54, 2.54]);
    expect([Math.min(...by), Math.max(...by)]).toEqual([0.96, 3.3]);
    // De tweede vlucht: van het bordes terug naar x = -0,22, 9 treden. Samen 17.
    expect(tweede).toMatchObject({ soort: "vlucht", treden: 9 });
    expect([tweede.hoeken[0][0], tweede.hoeken[2][0]]).toEqual([1.54, -0.22]);
  });

  it("zonder pijl ligt het bordes ook bij de lijn over beide vluchten", () => {
    const [trap] = vindTrappen(blad(paden.slice(0, -1)), M, null, muren);
    expect(trap.richting).toBe("geraden");
    const bx = inMeter(trap)[1].hoeken.map(([x]) => x);
    expect([Math.min(...bx), Math.max(...bx)]).toEqual([1.54, 2.54]);
  });

  it("met de rand per vlucht getekend tellen de geknipte treden mee, en ligt het bordes waar beide vluchten ophouden", () => {
    const perVlucht = [...streepjes([1.54, 0.96], [1.54, 2.06]), lijn([1.54, 2.2], [1.54, 3.3])];
    const zonderRand = [...onder, ...snede, ...boven, ...perVlucht, maatlijn, aslijn, pijl([0.5, 2.75], [1, 0])];
    const [trap] = vindTrappen(blad(zonderRand), M, null, muren);
    const [eerste, bordes, tweede] = inMeter(trap);
    expect(eerste).toMatchObject({ soort: "vlucht", treden: 8 });
    expect([eerste.hoeken[0][0], eerste.hoeken[2][0]]).toEqual([0, 1.54]);
    const bx = bordes.hoeken.map(([x]) => x);
    expect([Math.min(...bx), Math.max(...bx)]).toEqual([1.54, 2.54]);
    expect(tweede).toMatchObject({ soort: "vlucht", treden: 9 });
  });
});

describe("een kwartdraai", () => {
  it("wordt vlucht, hoekbordes, vlucht", () => {
    const a = Array.from({ length: 6 }, (_, k) => lijn([0, k * 0.22], [1, k * 0.22]));
    const b = Array.from({ length: 6 }, (_, k) => lijn([1 + k * 0.22, 1.1], [1 + k * 0.22, 2.1]));
    const [trap] = vindTrappen(blad([...a, ...b]), M, null, []);
    expect(trap.delen.map((d) => d.soort)).toEqual(["vlucht", "bordes", "vlucht"]);
    const bordes = inMeter(trap)[1];
    expect(bordes.hoeken.map(([x]) => x).sort()).toEqual([0, 0, 1, 1]);
    expect(bordes.hoeken.map(([, y]) => y).sort()).toEqual([1.1, 1.1, 2.1, 2.1]);
  });
});

describe("geen trap", () => {
  it("een raster van lijnen in twee richtingen", () => {
    const paden: Pad[] = [];
    for (let k = 0; k < 8; k++) {
      paden.push(lijn([0, k * 0.25], [1.2, k * 0.25]));
      paden.push(lijn([k * 0.25, 0], [k * 0.25, 1.2]));
    }
    expect(vindTrappen(blad(paden), M, null, [])).toEqual([]);
  });

  it("de lijnen van een raam in een muur", () => {
    const paden = Array.from({ length: 4 }, (_, k) => lijn([0, k * 0.05], [1.2, k * 0.05]));
    expect(vindTrappen(blad(paden), M, null, [])).toEqual([]);
  });

  it("de arcering van een muur", () => {
    const muur = rechthoek(0, 0, 3, 0.4);
    const paden = Array.from({ length: 10 }, (_, k) => lijn([0.2 + k * 0.25, 0.05], [0.2 + k * 0.25 + 0.3, 0.35]));
    expect(vindTrappen(blad(paden), M, null, [muur])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Van een echte PDF tot de bevestiging, met het testplan
// ---------------------------------------------------------------------------

describe("de trap van een testplan", () => {
  async function voorstelMetTrap() {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { leesBlad } = await import("@/lib/bouw/omzetting/lezen");
    const { zetOm } = await import("@/lib/bouw/omzetting/pijplijn");
    const { gelijkvloers, testplanPdf } = await import("./fixtures/bouw/testplan");
    const taak = getDocument({ data: testplanPdf(gelijkvloers({ trap: true })), verbosity: 0 });
    try {
      const document = await taak.promise;
      return zetOm(await leesBlad(await document.getPage(1)));
    } finally {
      await taak.destroy();
    }
  }

  it("vindt de trap van 180° met zijn richting, ook met streepjes uit de PDF", async () => {
    const voorstel = await voorstelMetTrap();
    expect(voorstel.trappen).toHaveLength(1);
    const [trap] = voorstel.trappen;
    expect(trap.richting).toBe("pijl");
    expect(trap.delen.map((d) => [d.soort, d.treden])).toEqual([
      ["vlucht", 8],
      ["bordes", 0],
      ["vlucht", 8],
    ]);
  });

  it("gaat in meter mee bij het bevestigen, op zijn plaats in het huis", async () => {
    const { controleerBevestiging, omzettingsvoorstel, naarRuimterijen } = await import("@/lib/bouw/omzetting/bevestigen");
    const voorstel = await voorstelMetTrap();
    const kalibratie = { meterPerPunt: voorstel.schaal!.meterPerPunt, kwartslagen: 0, dx: 0, dy: 0 };
    const gecontroleerd = controleerBevestiging({
      versieId: 1,
      kalibratie: { ...kalibratie, bron: "titelblok", bewijs: "", referentieVersieId: null },
      ruimtes: voorstel.ruimtes.filter((r) => r.naam).map((r) => ({ ruimteId: null, naam: r.naam, soort: r.soort, ringen: r.ringen, oppervlaktePlan: null, plafondhoogte: null, vloerpeil: null })),
      openingen: [],
      muren: [],
      trappen: [...voorstel.trappen, { delen: [{ soort: "bordes", hoeken: [[0, 0], [1, 0], [1, 1], [0, 1]], treden: 0 }] }],
      verdieping: {},
      schaal: null,
    });
    expect(gecontroleerd.ok).toBe(true);
    if (!gecontroleerd.ok) return;
    // Een "trap" die enkel een bordes is, valt weg.
    expect(gecontroleerd.data.trappen).toHaveLength(1);
    const rijen = naarRuimterijen(gecontroleerd.data);
    if (!rijen.ok) throw new Error(rijen.melding);
    const bewaard = omzettingsvoorstel(gecontroleerd.data, rijen.data) as { trappen: { delen: { hoeken: [number, number][] }[] }[] };
    const eerste = bewaard.trappen[0].delen[0];
    // Op het testplan begint de onderste vlucht 2,6 m van de linkerrand van het tekenvak (2 m verschoven + 0,6 m).
    const xs = eerste.hoeken.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.54, 1);
  });
});
