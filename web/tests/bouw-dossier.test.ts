import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { gewoneSchrijfwijze, stelDossierVoor, verdiepingenUit, type Bladtekst } from "@/lib/bouw/omzetting/dossier";
import { leesBladteksten } from "@/lib/bouw/omzetting/lezen";
import type { Tekst } from "@/lib/bouw/omzetting/types";

import { testdossier } from "./fixtures/bouw/testplan";

async function lees(bytes: Uint8Array): Promise<Bladtekst[]> {
  const taak = getDocument({ data: bytes, verbosity: 0 });
  try {
    const document = await taak.promise;
    const bladen: Bladtekst[] = [];
    for (let pagina = 1; pagina <= document.numPages; pagina++) {
      bladen.push({ pagina, teksten: (await leesBladteksten(await document.getPage(pagina))).teksten });
    }
    return bladen;
  } finally {
    await taak.destroy();
  }
}

function tekst(inhoud: string, grootte: number, y: number, x = 100): Tekst {
  return { tekst: inhoud, x, y, breedte: inhoud.length * grootte * 0.5, hoogte: grootte, grootte, hoek: 0 };
}

describe("een dossier inlezen", () => {
  it("stelt per blad een plan voor, uit de bladcode en de titel", async () => {
    const voorstel = stelDossierVoor(await lees(testdossier()));
    expect(voorstel.bladen.map((b) => [b.pagina, b.soort, b.gebouw, b.verdieping, b.titel])).toEqual([
      [1, "gevel", "Bijgebouw", null, "Linkergevel en voorgevel"],
      [2, "grondplan", "Bijgebouw", "Gelijkvloers", "Grondplan"],
      [3, "gevel", "Woning", null, "Voorgevel"],
      [4, "grondplan", "Woning", "Gelijkvloers", "Gelijkvloers"],
      [5, "grondplan", "Woning", "Verdieping", "Verdieping"],
      [6, "dakplan", "Woning", null, "Dakenplan"],
      [7, "funderingsplan", "Woning", null, "Funderings- en rioleringsplan"],
      [8, "doorsnede", "Woning", null, "Doorsnede AA'"],
      [9, "inplanting", null, null, "Inplantingsplan – ontworpen toestand"],
      [10, "andere", null, null, "Legende"],
      [11, "doorsnede", null, null, "Terreinprofiel T1"],
      [12, "andere", "Woning", null, "Schets keuken"],
    ]);
    expect(voorstel.bladen.map((b) => b.bladcode)).toEqual([
      "BA_bijgebouw_G_N_1",
      "BA_bijgebouw_P_N_1",
      "BA_woning_G_N_1",
      "BA_woning_P_N_1",
      "BA_woning_P_N_2",
      "BA_woning_P_N_3",
      "BA_woning_P_N_4",
      "BA_woning_S_N_1",
      "BA_woning_I_N_1",
      "BA_woning_L_N_1",
      "BA_woning_T_N_1",
      null,
    ]);
    expect(voorstel.bladen.map((b) => b.schaal)).toEqual([50, 50, 50, 50, 50, 50, 50, 50, 200, null, 200, null]);
  });

  it("stelt per gebouw de verdiepingen voor, met peil, plafondhoogte en verdiepingshoogte", async () => {
    const voorstel = stelDossierVoor(await lees(testdossier()));
    expect(voorstel.verdiepingen).toEqual([
      { gebouw: "Bijgebouw", naam: "Gelijkvloers", volgorde: 0, vloerpeil: 0, plafondhoogte: 2.4, verdiepingshoogte: null },
      { gebouw: "Woning", naam: "Gelijkvloers", volgorde: 0, vloerpeil: 0, plafondhoogte: 2.8, verdiepingshoogte: 3.2 },
      { gebouw: "Woning", naam: "Verdieping", volgorde: 1, vloerpeil: 3.2, plafondhoogte: 2.6, verdiepingshoogte: null },
    ]);
    expect(voorstel.datum).toBe("2026-10-01");
  });

  it("zonder bladcode gaat het op de woorden, en een logo telt niet als titel", () => {
    const voorstel = stelDossierVoor([
      { pagina: 1, teksten: [tekst("ARCHITECTEN", 30, 50), tekst("GRONDPLAN EERSTE VERDIEPING", 18, 900), tekst("NIVO +3,10", 7, 400)] },
      { pagina: 2, teksten: [tekst("Doorsnede A-A", 14, 900)] },
      { pagina: 3, teksten: [tekst("iets", 8, 10)] },
    ]);
    expect(voorstel.bladen.map((b) => [b.soort, b.titel, b.verdieping, b.vloerpeil])).toEqual([
      ["grondplan", "Grondplan eerste verdieping", "Eerste verdieping", 3.1],
      ["doorsnede", "Doorsnede A-A", null, null],
      ["andere", "Iets", null, null],
    ]);
  });

  it("geeft een blad zonder tekst een titel met zijn nummer", () => {
    expect(stelDossierVoor([{ pagina: 7, teksten: [] }]).bladen[0].titel).toBe("Blad 7");
  });

  it("zet verdiepingen zonder peil achteraan, en telt twee plannen voor dezelfde verdieping één keer", () => {
    const blad = (pagina: number, verdieping: string, vloerpeil: number | null) => ({
      pagina,
      bladcode: null,
      titel: verdieping,
      soort: "grondplan" as const,
      gebouw: "Woning",
      verdieping,
      schaal: 50,
      vloerpeil,
      plafondhoogte: null,
    });
    expect(
      verdiepingenUit([blad(1, "Zolder", null), blad(2, "Gelijkvloers", 0), blad(3, "Gelijkvloers", null), blad(4, "Kelder", -2.8)]).map(
        (v) => [v.naam, v.volgorde, v.verdiepingshoogte],
      ),
    ).toEqual([
      ["Kelder", 0, 2.8],
      ["Gelijkvloers", 1, null],
      ["Zolder", 2, null],
    ]);
  });

  it("schrijft titels zoals een mens ze schrijft", () => {
    expect(gewoneSchrijfwijze("FUNDERINGS- en RIOLERINGSPLAN")).toBe("Funderings- en rioleringsplan");
    expect(gewoneSchrijfwijze("DOORSNEDE CC'")).toBe("Doorsnede CC'");
    expect(gewoneSchrijfwijze("TERREINPROFIEL T1")).toBe("Terreinprofiel T1");
    expect(gewoneSchrijfwijze("gelijkvloers")).toBe("Gelijkvloers");
  });
});
