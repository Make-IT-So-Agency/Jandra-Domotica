import "server-only";

import ExcelJS from "exceljs";

import type { RapportMomentopname } from "./types";

const EURO = '#,##0.00 "€"';
const KWH = "#,##0.000";
const DATUM_TIJD = "dd/mm/yyyy hh:mm";

function kopRij(werkblad: ExcelJS.Worksheet, rijnummer: number): void {
  const rij = werkblad.getRow(rijnummer);
  rij.font = { bold: true };
  rij.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F4F6" },
  };
  rij.border = { bottom: { style: "thin", color: { argb: "FF9CA3AF" } } };
}

/**
 * Maakt een werkmap met drie bladen: de samenvatting, alle sessies en de
 * meterstanden. Alle bedragen staan als echte getallen in de cellen, zodat de
 * boekhouder er meteen mee kan rekenen.
 */
export async function maakRapportExcel(
  rapport: RapportMomentopname,
  referentie: string,
): Promise<Buffer> {
  const werkmap = new ExcelJS.Workbook();
  werkmap.creator = rapport.begunstigde.naam || "Laadkosten";
  // Vaste aanmaakdatum vermijden we niet: die hoort bij het document zelf.
  werkmap.created = new Date(rapport.opgemaakt_op);

  // --- Samenvatting -------------------------------------------------------
  const samenvatting = werkmap.addWorksheet("Samenvatting");
  samenvatting.columns = [{ width: 30 }, { width: 40 }];

  const gegevens: Array<[string, string | number, string?]> = [
    ["Rapport", referentie],
    ["Periode", rapport.periode.label],
    ["Van", rapport.periode.start],
    ["Tot en met", rapport.periode.eind],
    ["", ""],
    ["Terug te betalen door", rapport.vennootschap.naam],
    ["BTW-nummer", rapport.vennootschap.btw_nummer ?? "—"],
    ["Adres", rapport.vennootschap.adres ?? "—"],
    ["", ""],
    ["Terug te betalen aan", rapport.begunstigde.naam || "—"],
    ["Rekeningnummer", rapport.begunstigde.rekeningnummer || "—"],
    ["", ""],
    ["Aantal sessies", rapport.totalen.aantal_sessies],
    ["Totaal geladen (kWh)", rapport.totalen.kwh, KWH],
    ["Totaal excl. btw", rapport.totalen.excl_btw, EURO],
    ["Btw", rapport.totalen.btw, EURO],
    ["Totaal incl. btw", rapport.totalen.incl_btw, EURO],
  ];

  for (const [label, waarde, formaat] of gegevens) {
    const rij = samenvatting.addRow([label, waarde]);
    rij.getCell(1).font = { bold: true };
    if (formaat) rij.getCell(2).numFmt = formaat;
  }
  samenvatting.getRow(samenvatting.rowCount).font = { bold: true };

  samenvatting.addRow([]);
  samenvatting.addRow(["Toegepast tarief", ""]).getCell(1).font = { bold: true };
  for (const tarief of rapport.tarieven) {
    samenvatting.addRow([
      tarief.periode,
      `${tarief.eur_per_kwh} €/kWh ${
        tarief.inclusief_btw ? "incl." : "excl."
      } btw ${(tarief.btw_percentage * 100).toFixed(0)}% (${tarief.bron})`,
    ]);
  }

  // --- Sessies ------------------------------------------------------------
  const sessies = werkmap.addWorksheet("Sessies");
  sessies.columns = [
    { header: "Gestart", key: "gestart", width: 18 },
    { header: "Gestopt", key: "gestopt", width: 18 },
    { header: "Laadpaal", key: "laadpaal", width: 20 },
    { header: "kWh", key: "kwh", width: 12 },
    { header: "Tarief €/kWh", key: "tarief", width: 14 },
    { header: "Excl. btw", key: "excl", width: 14 },
    { header: "Btw", key: "btw", width: 12 },
    { header: "Incl. btw", key: "incl", width: 14 },
    { header: "Referentie evcc", key: "extern", width: 16 },
  ];
  kopRij(sessies, 1);

  for (const regel of rapport.regels) {
    sessies.addRow({
      gestart: regel.gestart ? new Date(regel.gestart) : null,
      gestopt: regel.gestopt ? new Date(regel.gestopt) : null,
      laadpaal: regel.laadpaal,
      kwh: regel.kwh,
      tarief: regel.tarief_per_kwh,
      excl: regel.bedrag_excl_btw,
      btw: regel.btw_bedrag,
      incl: regel.bedrag_incl_btw,
      extern: regel.external_id,
    });
  }

  sessies.getColumn("gestart").numFmt = DATUM_TIJD;
  sessies.getColumn("gestopt").numFmt = DATUM_TIJD;
  sessies.getColumn("kwh").numFmt = KWH;
  sessies.getColumn("tarief").numFmt = "#,##0.00000";
  for (const kolom of ["excl", "btw", "incl"]) {
    sessies.getColumn(kolom).numFmt = EURO;
  }

  const totaalRij = sessies.addRow({
    gestart: "Totaal",
    kwh: rapport.totalen.kwh,
    excl: rapport.totalen.excl_btw,
    btw: rapport.totalen.btw,
    incl: rapport.totalen.incl_btw,
  });
  totaalRij.font = { bold: true };
  totaalRij.border = { top: { style: "thin", color: { argb: "FF111827" } } };
  totaalRij.getCell("gestart").numFmt = "General";

  sessies.views = [{ state: "frozen", ySplit: 1 }];
  sessies.autoFilter = { from: "A1", to: { row: 1, column: 10 } };

  // --- Meterstanden -------------------------------------------------------
  if (rapport.meterstanden.length > 0) {
    const meters = werkmap.addWorksheet("Meterstanden");
    meters.columns = [
      { header: "Laadpaal", key: "laadpaal", width: 24 },
      { header: "Stand begin", key: "begin", width: 16 },
      { header: "Stand einde", key: "eind", width: 16 },
      { header: "Verschil", key: "verschil", width: 14 },
      { header: "Som van de sessies", key: "sessies", width: 20 },
      { header: "Afwijking", key: "afwijking", width: 14 },
    ];
    kopRij(meters, 1);

    for (const stand of rapport.meterstanden) {
      meters.addRow({
        laadpaal: stand.laadpaal,
        begin: stand.begin_kwh,
        eind: stand.eind_kwh,
        verschil: stand.verschil_kwh,
        sessies: stand.sessies_kwh,
        afwijking: stand.afwijking_kwh,
      });
    }
    for (const kolom of ["begin", "eind", "verschil", "sessies", "afwijking"]) {
      meters.getColumn(kolom).numFmt = KWH;
    }
  }

  const buffer = await werkmap.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
