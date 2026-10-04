import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { lijstPunten, verwijderPunt, voegPuntToe, wijzigPunt } from "@/lib/bouw/opslag";
import {
  CATALOGUS,
  CATEGORIEEN,
  controleerPunt,
  hoogteTekst,
  maakWensenlijst,
  ruimteVan,
  standaardHoogte,
  vakVan,
  type Punt,
} from "@/lib/bouw/punten";
import { maakWensenlijstExcel, maakWensenlijstPdf, wensenlijstTitel } from "@/lib/bouw/wensenlijst-bestanden";

const vierkant = (x: number, y: number, b: number): [number, number][][] => [
  [
    [x, y],
    [x + b, y],
    [x + b, y + b],
    [x, y + b],
  ],
];

describe("de catalogus", () => {
  it("heeft unieke soorten en codes, in elke categorie minstens één", () => {
    expect(new Set(CATALOGUS.map((s) => s.soort)).size).toBe(CATALOGUS.length);
    expect(new Set(CATALOGUS.map((s) => s.code)).size).toBe(CATALOGUS.length);
    for (const categorie of CATEGORIEEN) expect(CATALOGUS.some((s) => s.categorie === categorie), categorie).toBe(true);
    // De databank kijkt de vorm na: kleine letters, cijfers en een liggend streepje.
    for (const s of CATALOGUS) expect(s.soort).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
  });

  it("geeft de gewone hoogte, of null voor aan het plafond", () => {
    expect(standaardHoogte("schakelaar")).toBe(1.1);
    expect(standaardHoogte("stopcontact")).toBe(0.3);
    expect(standaardHoogte("lichtpunt")).toBeNull();
    expect(hoogteTekst(null, 2.6)).toBe("plafond (2,60 m)");
    expect(hoogteTekst(1.1, 2.6)).toBe("1,10 m");
  });
});

describe("in welke ruimte een punt ligt", () => {
  const ruimtes = [
    { id: 1, naam: "leefruimte", veelhoek: vierkant(0, 0, 5) },
    { id: 2, naam: "keuken", veelhoek: vierkant(5.14, 0, 3) },
  ];

  it("in de ruimte, of op de muur ernaast", () => {
    expect(ruimteVan({ x_m: 2, y_m: 2 }, ruimtes)).toBe(1);
    // Een schakelaar in de muur van 14 cm, net naast de keuken.
    expect(ruimteVan({ x_m: 5.12, y_m: 1 }, ruimtes)).toBe(2);
    expect(ruimteVan({ x_m: 5.02, y_m: 1 }, ruimtes)).toBe(1);
    // Een buitenstopcontact een meter buiten de gevel.
    expect(ruimteVan({ x_m: -1, y_m: 1 }, ruimtes)).toBeNull();
  });
});

describe("wat de browser stuurt voor een punt", () => {
  const goed = { soort: "schakelaar", x_m: 1.23456, y_m: 2, hoogte_m: 1.1, aantal: 2, label: " naast de deur ", opmerking: "", status: "gewenst" };

  it("aanvaardt een gewoon punt, netjes afgerond", () => {
    expect(controleerPunt(goed)).toEqual({
      ok: true,
      data: { soort: "schakelaar", x_m: 1.235, y_m: 2, hoogte_m: 1.1, aantal: 2, label: "naast de deur", opmerking: null, status: "gewenst" },
    });
    expect(controleerPunt({ ...goed, hoogte_m: null }).ok).toBe(true);
  });

  it("weigert wat niet klopt", () => {
    const melding = (over: Record<string, unknown>) => {
      const uitkomst = controleerPunt({ ...goed, ...over });
      return uitkomst.ok ? "aanvaard" : uitkomst.melding;
    };
    expect(melding({ soort: "kernreactor" })).toBe("Kies wat voor punt het is.");
    expect(melding({ x_m: Number.NaN })).toBe("Dit punt ligt niet op het plan.");
    expect(melding({ hoogte_m: 25 })).toContain("tussen 0 en 20 m");
    expect(melding({ aantal: 0 })).toContain("tussen 1 en 99");
    expect(melding({ aantal: 1.5 })).toContain("tussen 1 en 99");
    expect(melding({ label: "x".repeat(41) })).toContain("hoogstens 40");
    expect(melding({ status: "kapot" })).toBe("Onbekende status.");
  });
});

function punt(id: number, soort: string, x: number, y: number, over: Partial<Punt> = {}): Punt {
  return { id, verdieping_id: 1, soort, x_m: x, y_m: y, hoogte_m: standaardHoogte(soort), aantal: 1, label: null, opmerking: null, status: "gewenst", ...over };
}

describe("de wensenlijst", () => {
  const verdiepingen = [
    { id: 1, naam: "Gelijkvloers", plafondhoogte_m: 2.8 },
    { id: 2, naam: "Verdieping", plafondhoogte_m: 2.6 },
  ];
  const ruimtes = [
    { id: 10, naam: "leefruimte", veelhoek: vierkant(0, 0, 5), verdieping_id: 1, plafondhoogte_m: null },
    { id: 11, naam: "berging", veelhoek: vierkant(5.14, 0, 3), verdieping_id: 1, plafondhoogte_m: 2.4 },
  ];
  const punten = [
    punt(1, "stopcontact_dubbel", 1, 1, { aantal: 3, label: "tv-meubel" }),
    punt(2, "schakelaar", 4.98, 2),
    punt(3, "lichtpunt", 2.5, 2.5),
    punt(4, "lichtpunt", 6, 1),
    punt(5, "stopcontact_buiten", -1, 2),
    punt(6, "schakelaar", 2, 2, { hoogte_m: 0.9, opmerking: "rolstoelhoogte" }),
  ];

  it("telt per ruimte en per soort, in de volgorde van de catalogus", () => {
    const lijst = maakWensenlijst(verdiepingen, ruimtes, punten);
    expect(lijst.aantal).toBe(8);
    // Een verdieping zonder punten staat er niet in.
    expect(lijst.verdiepingen.map((v) => v.naam)).toEqual(["Gelijkvloers"]);
    const [gelijkvloers] = lijst.verdiepingen;
    expect(gelijkvloers.ruimtes.map((r) => [r.naam, r.aantal])).toEqual([
      ["berging", 1],
      ["leefruimte", 6],
      ["Buiten of zonder ruimte", 1],
    ]);
    const leef = gelijkvloers.ruimtes[1];
    expect(leef.regels.map((r) => [r.code, r.aantal])).toEqual([
      ["L", 1],
      ["S", 2],
      ["2WC", 3],
    ]);
    expect(leef.regels[1].hoogtes).toEqual(["1,10 m", "0,90 m"]);
    expect(leef.regels[1].opmerkingen).toEqual(["rolstoelhoogte"]);
    expect(leef.regels[2].opmerkingen).toEqual(["tv-meubel (3×)"]);
    // De plafondhoogte van de ruimte gaat voor die van de verdieping.
    expect(gelijkvloers.ruimtes[0].regels[0].hoogtes).toEqual(["plafond (2,40 m)"]);
    expect(leef.regels[0].hoogtes).toEqual(["plafond (2,80 m)"]);
    expect(lijst.totalen.map((r) => [r.code, r.aantal])).toEqual([
      ["L", 2],
      ["S", 2],
      ["2WC", 3],
      ["WCB", 1],
    ]);
  });

  it("splitst per vakgebied: sanitair en verwarming apart", () => {
    const met = [...punten, punt(7, "wc_aansluiting", 6, 1), punt(8, "radiator", 1, 4.5)];
    expect(maakWensenlijst(verdiepingen, ruimtes, met).aantal).toBe(10);
    expect(maakWensenlijst(verdiepingen, ruimtes, met, "elektriciteit").aantal).toBe(8);
    const sanitair = maakWensenlijst(verdiepingen, ruimtes, met, "sanitair");
    expect(sanitair.totalen.map((r) => [r.code, r.aantal])).toEqual([
      ["TOI", 1],
      ["RAD", 1],
    ]);
    expect(vakVan("thermostaat")).toBe("elektriciteit");
    expect(vakVan("collector")).toBe("sanitair");
    expect(vakVan("onbekend")).toBe("elektriciteit");
    expect(wensenlijstTitel("sanitair")).toBe("Wensenlijst sanitair en verwarming");
  });

  it("wordt een PDF en een Excel met de aantallen als getallen", async () => {
    const lijst = maakWensenlijst(verdiepingen, ruimtes, punten);
    const pdf = await maakWensenlijstPdf(lijst, "Ons huis", new Date("2026-10-02T12:00:00Z"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    const excel = await maakWensenlijstExcel(lijst, "Ons huis", new Date("2026-10-02T12:00:00Z"));
    const werkmap = new ExcelJS.Workbook();
    await werkmap.xlsx.load(excel as unknown as ArrayBuffer);
    expect(werkmap.worksheets.map((w) => w.name)).toEqual(["Per ruimte", "Totaal per soort"]);
    const perRuimte = werkmap.getWorksheet("Per ruimte")!;
    expect(perRuimte.rowCount).toBe(1 + 5);
    expect(perRuimte.getRow(2).getCell(5).value).toBe(1);
    const totaal = werkmap.getWorksheet("Totaal per soort")!;
    expect(totaal.getRow(totaal.rowCount).getCell(4).value).toBe(8);
  });
});

describe("punten in de databank", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_gebouwen: metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]),
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0 },
        { id: 2, gebouw_id: 1, naam: "Verdieping", volgorde: 1 },
      ],
      bouw_punten: [],
    });
    nep.client = db.client;
  });

  it("voegt toe, wijzigt, leest en verwijdert", async () => {
    const nieuw = await voegPuntToe(1, 1, { soort: "lichtpunt", x_m: 1, y_m: 2, hoogte_m: null, aantal: 1, label: null, opmerking: null, status: "gewenst" });
    expect(nieuw).toMatchObject({ verdieping_id: 1, soort: "lichtpunt", x_m: 1, y_m: 2, hoogte_m: null });

    const gewijzigd = await wijzigPunt(1, nieuw.id, { soort: "inbouwspot", x_m: 3, y_m: 2, hoogte_m: null, aantal: 4, label: "keuken", opmerking: null, status: "in_offerte" });
    expect(gewijzigd).toMatchObject({ soort: "inbouwspot", aantal: 4, status: "in_offerte" });
    expect(await wijzigPunt(1, 9999, { soort: "lichtpunt", x_m: 0, y_m: 0, hoogte_m: null, aantal: 1, label: null, opmerking: null, status: "gewenst" })).toBeNull();

    await voegPuntToe(1, 2, { soort: "schakelaar", x_m: 0, y_m: 0, hoogte_m: 1.1, aantal: 1, label: null, opmerking: null, status: "gewenst" });
    expect((await lijstPunten(1, 1)).map((p) => p.soort)).toEqual(["inbouwspot"]);
    expect(await lijstPunten(1)).toHaveLength(2);

    await verwijderPunt(1, nieuw.id);
    expect((await lijstPunten(1)).map((p) => p.verdieping_id)).toEqual([2]);
  });
});
