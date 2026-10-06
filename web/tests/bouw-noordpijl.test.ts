import { describe, expect, it } from "vitest";

import { noordpijlOpBlad } from "@/lib/bouw/drie/noordpijl";
import { MIDDEN_VLAANDEREN, noordenVan, zonRichting } from "@/lib/bouw/drie/zon";
import type { Tekst } from "@/lib/bouw/omzetting/types";

/** Een letter op het blad, met haar middelpunt. */
const letter = (tekst: string, x: number, y: number, grootte = 8): Tekst => ({ tekst, x, y, breedte: grootte * 0.7, hoogte: grootte, grootte, hoek: 0 });

/** Een windroos rond (x, y): de letters op `straal`, met het noorden op `hoek` (met de klok mee vanaf boven). */
function windroos(x: number, y: number, hoek: number, letters: [string, string, string, string], straal = 30): Tekst[] {
  // Noord, oost, zuid, west: telkens een kwartslag verder met de klok mee. Op het blad loopt y naar beneden.
  return letters.map((tekst, i) => {
    const r = ((hoek + i * 90) * Math.PI) / 180;
    return letter(tekst, x + straal * Math.sin(r), y - straal * Math.cos(r));
  });
}

const ruis = [letter("INPLANTINGSPLAN", 400, 500, 14), letter("1/200", 400, 520), letter("300", 200, 220), letter("A", 120, 80), letter("N", 600, 40)];

describe("de noordpijl op het inplantingsplan", () => {
  it("leest een windroos met het noorden onderaan, zoals een plan met de straat onderaan", () => {
    // N onder, Z boven, O links en W rechts.
    const pijl = noordpijlOpBlad({ teksten: [...ruis, ...windroos(300, 100, 180, ["N", "O", "Z", "W"])] });
    expect(pijl).toMatchObject({ hoek: 180, letters: "NZOW" });
    expect(pijl?.midden[0]).toBeCloseTo(300);
    expect(pijl?.midden[1]).toBeCloseTo(100);
  });

  it("volgt een windroos die schuin staat, in elke taal", () => {
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 0, ["N", "O", "Z", "W"]) })?.hoek).toBe(0);
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 37, ["N", "E", "S", "W"]) })).toMatchObject({ hoek: 37, letters: "NSEW" });
    // In het Frans is O het westen.
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 250, ["N", "E", "S", "O"]) })).toMatchObject({ hoek: 250, letters: "NSEO" });
    // Enkel N en Z, of N met oost en west.
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 90, ["N", "", "Z", ""]) })?.hoek).toBe(90);
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 300, ["N", "O", "", "W"]) })).toMatchObject({ hoek: 300, letters: "NOW" });
    // Woorden in plaats van letters.
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 135, ["Noord", "Oost", "Zuid", "West"], 60) })?.hoek).toBe(135);
  });

  it("verzint geen noordpijl", () => {
    expect(noordpijlOpBlad({ teksten: ruis })).toBeNull();
    // Een N en een Z ver uit elkaar, of van een heel andere grootte.
    expect(noordpijlOpBlad({ teksten: [letter("N", 100, 100), letter("Z", 600, 100)] })).toBeNull();
    expect(noordpijlOpBlad({ teksten: [letter("N", 100, 100), letter("Z", 100, 140, 40)] })).toBeNull();
    // Gespiegeld: het westen waar het oosten hoort. Dan is het geen windroos.
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 0, ["N", "W", "Z", "E"]) })).toBeNull();
    // Twee keer O naast een N: geen oost en west.
    expect(noordpijlOpBlad({ teksten: windroos(300, 100, 0, ["N", "O", "", "O"]) })).toBeNull();
  });

  it("neemt de windroos met de meeste letters", () => {
    const pijl = noordpijlOpBlad({ teksten: [...windroos(300, 100, 0, ["N", "", "Z", ""]), ...windroos(700, 400, 180, ["N", "O", "Z", "W"])] });
    expect(pijl).toMatchObject({ hoek: 180, letters: "NZOW" });
  });
});

describe("de zon met de noordpijl", () => {
  it("draait het noorden mee, ook zonder omgeving", () => {
    expect(noordenVan(null, null, 180)).toEqual({ hoek: 180, geo: MIDDEN_VLAANDEREN, bron: "noordpijl" });
    expect(noordenVan(null, null, null).bron).toBe("geen");
    // 's Avonds in oktober in het zuidwesten: met het noorden onderaan staat de zon rechtsboven op het plan.
    const [x, , z] = zonRichting({ azimut: 240, hoogte: 17 }, 180);
    expect(x).toBeGreaterThan(0.7);
    expect(z).toBeLessThan(-0.3);
    const [x0, , z0] = zonRichting({ azimut: 240, hoogte: 17 }, 0);
    expect(x0).toBeLessThan(-0.7);
    expect(z0).toBeGreaterThan(0.3);
  });

  it("geeft de omgeving op de woning het noorden van de noordpijl", () => {
    const punt: [number, number] = [150000, 180000];
    const georef = { x: 149950, y: 180040, hoek: 180 };
    const noorden = noordenVan({ georef, punt, soort: "pijl" }, punt);
    expect(noorden.bron).toBe("noordpijl");
    expect(noorden.hoek).toBeCloseTo(180, 0);
  });
});

describe("van een echte PDF", () => {
  it("leest de letters van een windroos, met de oorsprong linksonder", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { leesBlad } = await import("@/lib/bouw/omzetting/lezen");
    const { maakPdf, pdf } = await import("./fixtures/bouw/pdf-schrijver");
    const hoogte = 842;
    // Op het blad: N onder, Z boven, O links, W rechts, rond (300, 200). In PDF loopt y naar boven.
    const op = (x: number, y: number, tekst: string) => pdf.tekst(x - 3, hoogte - y - 3, 8, tekst);
    const bytes = maakPdf([
      {
        breedte: 595,
        hoogte,
        inhoud: [
          pdf.lijnkleur("#000000"),
          pdf.lijn([300, hoogte - 175], [300, hoogte - 225]),
          pdf.trek(),
          pdf.lijn([275, hoogte - 200], [325, hoogte - 200]),
          pdf.trek(),
          op(300, 230, "N"),
          op(300, 170, "Z"),
          op(270, 200, "O"),
          op(330, 200, "W"),
          pdf.tekst(100, 100, 12, "INPLANTINGSPLAN 1/200"),
        ],
      },
    ]);
    const taak = getDocument({ data: bytes, verbosity: 0 });
    try {
      const document = await taak.promise;
      const pijl = noordpijlOpBlad(await leesBlad(await document.getPage(1)));
      expect(pijl?.letters).toBe("NZOW");
      expect(pijl?.hoek).toBeCloseTo(180, 0);
    } finally {
      await taak.destroy();
    }
  });
});
