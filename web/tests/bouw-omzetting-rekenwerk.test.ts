import { describe, expect, it } from "vitest";

import {
  binnenRuimte,
  middenVan,
  naarHuis,
  naarPagina,
  nettoOppervlakte,
  oppervlakte,
  splits,
  vereenvoudig,
  zwaartepunt,
  type Kalibratie,
} from "@/lib/bouw/omzetting/geometrie";
import { kwartcirkel } from "@/lib/bouw/omzetting/openingen";
import { meestVoorkomend } from "@/lib/bouw/omzetting/schaal";
import { raadSoort } from "@/lib/bouw/omzetting/soorten";
import {
  isNaamachtig,
  leesDatum,
  leesOppervlakte,
  leesPeil,
  leesPlafondhoogte,
  leesRaammaat,
  leesSchaal,
} from "@/lib/bouw/omzetting/teksten";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { isWit } from "@/lib/bouw/omzetting/vlakken";

describe("teksten op een plan", () => {
  it("leest oppervlaktes in elke gangbare schrijfwijze", () => {
    expect(leesOppervlakte("12,35m2")).toBe(12.35);
    expect(leesOppervlakte("12.35 m²")).toBe(12.35);
    expect(leesOppervlakte("72,95 M2")).toBe(72.95);
    expect(leesOppervlakte("18,1m2")).toBe(18.1);
    expect(leesOppervlakte("m2")).toBeNull();
    expect(leesOppervlakte("12,35")).toBeNull();
  });

  it("leest plafondhoogtes in cm of in m", () => {
    expect(leesPlafondhoogte("PH = 280")).toBe(2.8);
    expect(leesPlafondhoogte("PH=2,60")).toBe(2.6);
    expect(leesPlafondhoogte("P.H. 430")).toBe(4.3);
    expect(leesPlafondhoogte("PH = 9000")).toBeNull();
    expect(leesPlafondhoogte("BW = 40")).toBeNull();
  });

  it("leest peilen, ook negatief", () => {
    expect(leesPeil("NIVO 000")).toBe(0);
    expect(leesPeil("NIVO 320")).toBe(3.2);
    expect(leesPeil("NIVO +3,20")).toBe(3.2);
    expect(leesPeil("peil -15")).toBe(-0.15);
    expect(leesPeil("NIVEAU - 0,15")).toBe(-0.15);
    expect(leesPeil("nivo")).toBeNull();
  });

  it("leest raammaten en schalen", () => {
    expect(leesRaammaat("205 x 275")).toEqual({ breedte: 2.05, hoogte: 2.75 });
    expect(leesRaammaat("80×210")).toEqual({ breedte: 0.8, hoogte: 2.1 });
    expect(leesRaammaat("710/275")).toBeNull();
    expect(leesSchaal("1:50")).toBe(50);
    expect(leesSchaal("schaal 1/200")).toBe(200);
    expect(leesSchaal("SCHAAL 1 : 100")).toBe(100);
  });

  it("houdt een datum niet voor een schaal", () => {
    expect(leesSchaal("01/10/2026")).toBeNull();
    expect(leesSchaal("1/10/2026")).toBeNull();
    expect(leesSchaal("11:50")).toBeNull();
    expect(leesDatum("01/10/2026")).toBe("2026-10-01");
    expect(leesDatum("1-10-2026")).toBe("2026-10-01");
    expect(leesDatum("31/02/2026")).toBeNull();
  });

  it("weet wat een naam kan zijn", () => {
    for (const naam of ["leefruimte", "wc 1", "berging/technieken", "badk 2", "slaapkamer 3"]) {
      expect(isNaamachtig(naam), naam).toBe(true);
    }
    for (const geen of ["12,35m2", "PH = 280", "NIVO 000", "BW = 40", "deurspleet 1 cm", "205 x 275", "559", "90 cm", "x"]) {
      expect(isNaamachtig(geen), geen).toBe(false);
    }
  });

  it("raadt de soort uit de naam", () => {
    expect(raadSoort("leefruimte")).toBe("leefruimte");
    expect(raadSoort("ontspanningsruimte")).toBe("leefruimte");
    expect(raadSoort("berging/technieken")).toBe("technieken");
    expect(raadSoort("tuinberging")).toBe("berging");
    expect(raadSoort("nachthall")).toBe("nachthal");
    expect(raadSoort("inkom")).toBe("inkom");
    expect(raadSoort("badk 1")).toBe("badkamer");
    expect(raadSoort("wc 2")).toBe("wc");
    expect(raadSoort("slaapkamer 2")).toBe("slaapkamer");
    expect(raadSoort("overdekt terras")).toBe("terras");
    expect(raadSoort("trapbordes")).toBe("trap");
    expect(raadSoort("vide")).toBe("andere");
  });

  it("vindt de meest voorkomende waarde, bij gelijkstand de kleinste", () => {
    expect(meestVoorkomend([2.6, 4.3])).toBe(2.6);
    expect(meestVoorkomend([4.3, 2.6, 4.3])).toBe(4.3);
    expect(meestVoorkomend([])).toBeNull();
    expect(isWit("#ffffff")).toBe(true);
    expect(isWit("#fdfefe")).toBe(true);
    expect(isWit("#eeeeee")).toBe(false);
    expect(isWit(null)).toBe(false);
  });
});

describe("veelhoeken", () => {
  const ell: Xy[] = [[0, 0], [6, 0], [6, 4], [4, 4], [4, 8], [0, 8]];

  it("rekent de oppervlakte uit, ook met een gat", () => {
    expect(Math.abs(oppervlakte(ell))).toBe(6 * 4 + 4 * 4);
    expect(nettoOppervlakte([ell, [[1, 1], [2, 1], [2, 2], [1, 2]]])).toBe(39);
  });

  it("vindt een punt dat echt in een L-vorm ligt", () => {
    const u: Xy[] = [[0, 0], [9, 0], [9, 9], [6, 9], [6, 3], [3, 3], [3, 9], [0, 9]];
    // Het zwaartepunt van een U valt in de opening.
    expect(binnenRuimte(zwaartepunt(u), [u])).toBe(false);
    expect(binnenRuimte(middenVan([u]), [u])).toBe(true);
  });

  it("splitst een ruimte met een lijn, en houdt de oppervlakte", () => {
    const delen = splits([ell], [3, -1], [3, 9]);
    expect(delen).not.toBeNull();
    const [links, rechts] = delen!;
    expect(nettoOppervlakte(links) + nettoOppervlakte(rechts)).toBeCloseTo(40, 9);
    expect([nettoOppervlakte(links), nettoOppervlakte(rechts)].sort((a, b) => a - b)).toEqual([16, 24]);
  });

  it("splitst niet met een lijn die de ruimte mist", () => {
    expect(splits([ell], [10, 0], [10, 8])).toBeNull();
    expect(splits([ell], [1, 1], [1, 1])).toBeNull();
  });

  it("geeft een gat aan het deel waar het in ligt", () => {
    const vierkant: Xy[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const gat: Xy[] = [[7, 7], [8, 7], [8, 8], [7, 8]];
    const [a, b] = splits([vierkant, gat], [5, 0], [5, 10])!;
    expect([a.length, b.length].sort()).toEqual([1, 2]);
    expect(nettoOppervlakte(a) + nettoOppervlakte(b)).toBeCloseTo(99, 9);
  });

  it("haalt overbodige punten weg", () => {
    expect(vereenvoudig([[0, 0], [5, 0], [10, 0], [10, 10], [10, 10], [0, 10], [0, 0]])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
  });
});

describe("van het blad naar het huis", () => {
  it("rekent heen en terug, ook met een kwartslag", () => {
    for (const kwartslagen of [0, 1, 2, 3]) {
      const k: Kalibratie = { meterPerPunt: 0.0176, kwartslagen, dx: 3.5, dy: -1.25 };
      const huis = naarHuis([120, 340], k);
      const terug = naarPagina(huis, k);
      expect(terug[0]).toBeCloseTo(120, 9);
      expect(terug[1]).toBeCloseTo(340, 9);
    }
  });

  it("draait met de klok mee zoals op het scherm: oost wordt zuid", () => {
    const [x, y] = naarHuis([1, 0], { meterPerPunt: 1, kwartslagen: 1, dx: 0, dy: 0 });
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(1, 9);
  });
});

describe("deuren", () => {
  it("herkent een kwartcirkel, en geen andere boog", () => {
    const r = 50;
    const k = 0.5523 * r;
    expect(kwartcirkel({ p0: [r, 0], p1: [r, k], p2: [k, r], p3: [0, r] })).toBeCloseTo(r, 1);
    // Een halve cirkel als één boog, of een S-bocht, is geen deur.
    expect(kwartcirkel({ p0: [0, 0], p1: [0, 60], p2: [100, 60], p3: [100, 0] })).toBeNull();
    expect(kwartcirkel({ p0: [0, 0], p1: [30, 30], p2: [70, -30], p3: [100, 0] })).toBeNull();
  });
});
