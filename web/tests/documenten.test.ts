import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { maakRapportExcel } from "@/lib/excel";
import { maakRapportPdf } from "@/lib/pdf";
import type { RapportMomentopname } from "@/lib/types";

const RAPPORT: RapportMomentopname = {
  vennootschap: {
    naam: "Jandra BV",
    btw_nummer: "BE0123.456.789",
    adres: "Teststraat 1, 9000 Gent",
  },
  begunstigde: {
    naam: "Jan Festjens",
    adres: "Thuisstraat 2, 9000 Gent",
    email: "jan@voorbeeld.be",
    rekeningnummer: "BE00 0000 0000 0000",
    btw_nummer: "",
  },
  periode: { start: "2026-07-01", eind: "2026-07-31", label: "juli 2026", soort: "month" },
  regels: [
    {
      sessie_id: "s1",
      external_id: "evcc:1",
      laadpaal: "Garage",
      voertuig: "Auto",
      gestart: "2026-07-03T18:00:00Z",
      gestopt: "2026-07-03T22:30:00Z",
      kwh: 31.42,
      tarief_per_kwh: 0.2822,
      bedrag_excl_btw: 8.36,
      btw_bedrag: 0.51,
      bedrag_incl_btw: 8.87,
      btw_percentage: 0.06,
    },
    {
      sessie_id: "s2",
      external_id: "evcc:2",
      laadpaal: "Garage",
      voertuig: null,
      gestart: "2026-07-11T19:00:00Z",
      gestopt: "2026-07-11T23:00:00Z",
      kwh: 18.5,
      tarief_per_kwh: 0.2822,
      bedrag_excl_btw: 4.92,
      btw_bedrag: 0.3,
      bedrag_incl_btw: 5.22,
      btw_percentage: 0.06,
    },
  ],
  totalen: { aantal_sessies: 2, kwh: 49.92, excl_btw: 13.28, btw: 0.81, incl_btw: 14.09 },
  meterstanden: [
    {
      laadpaal: "Garage",
      begin_kwh: 1000,
      eind_kwh: 1050.1,
      verschil_kwh: 50.1,
      sessies_kwh: 49.92,
      afwijking_kwh: 0.18,
    },
  ],
  tarieven: [
    {
      periode: "2026-07-01 t.e.m. 2026-09-30",
      eur_per_kwh: 0.2822,
      btw_percentage: 0.06,
      inclusief_btw: true,
      bron: "handmatig ingevuld",
      bron_url: null,
    },
  ],
  opgemaakt_op: "2026-08-01T09:00:00Z",
};

describe("maakRapportPdf", () => {
  it("levert een echt PDF-bestand op", async () => {
    const pdf = await maakRapportPdf(RAPPORT, "LK-2026-JANDRA-001");

    // "%PDF" is de vaste handtekening aan het begin van elk PDF-bestand.
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30000);

  it("werkt ook zonder sessies en zonder meterstanden", async () => {
    const leeg: RapportMomentopname = {
      ...RAPPORT,
      regels: [],
      meterstanden: [],
      totalen: { aantal_sessies: 0, kwh: 0, excl_btw: 0, btw: 0, incl_btw: 0 },
    };

    const pdf = await maakRapportPdf(leeg, "LK-2026-JANDRA-002");
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  }, 30000);
});

describe("maakRapportExcel", () => {
  it("maakt een werkmap met de juiste bladen en bedragen", async () => {
    const buffer = await maakRapportExcel(RAPPORT, "LK-2026-JANDRA-001");

    const werkmap = new ExcelJS.Workbook();
    await werkmap.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(werkmap.worksheets.map((blad) => blad.name)).toEqual([
      "Samenvatting",
      "Sessies",
      "Meterstanden",
    ]);

    const sessies = werkmap.getWorksheet("Sessies")!;
    // Kolomsleutels overleven het wegschrijven naar xlsx niet, dus tellen we
    // hier op kolomnummer: 5 is kWh, 9 is het bedrag inclusief btw.
    const KOLOM_KWH = 5;
    const KOLOM_INCL = 9;

    // Rij 1 is de kop, rij 2 en 3 de sessies, rij 4 het totaal.
    expect(sessies.rowCount).toBe(4);
    expect(sessies.getRow(1).getCell(KOLOM_KWH).value).toBe("kWh");
    expect(sessies.getRow(2).getCell(KOLOM_KWH).value).toBe(31.42);
    expect(sessies.getRow(4).getCell(KOLOM_INCL).value).toBe(14.09);
  }, 30000);

  it("laat het blad Meterstanden weg als er geen zijn", async () => {
    const buffer = await maakRapportExcel({ ...RAPPORT, meterstanden: [] }, "LK-2026-X-001");

    const werkmap = new ExcelJS.Workbook();
    await werkmap.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(werkmap.getWorksheet("Meterstanden")).toBeUndefined();
  }, 30000);
});
