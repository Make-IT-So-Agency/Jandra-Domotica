import "server-only";

import ExcelJS from "exceljs";

import {
  CATEGORIENAMEN_POST,
  factuurstand,
  kasplanning,
  kredietstand,
  poststanden,
  vervaldagVan,
  type Factuurstand,
} from "./geld";
import type { Geldgegevens } from "./geld-laden";

const EURO = '#,##0.00 "€"';
const DATUM = "dd/mm/yyyy";

const STANDNAMEN: Record<Factuurstand, string> = {
  betaald: "betaald",
  te_laat: "te laat",
  binnenkort: "binnenkort te betalen",
  open: "open",
};

/** Een datum als echte Excel-datum, zodat er mee te sorteren en te rekenen valt. */
const alsDatum = (datum: string | null) => (datum ? new Date(`${datum}T00:00:00Z`) : null);

function kop(werkblad: ExcelJS.Worksheet): void {
  const rij = werkblad.getRow(1);
  rij.font = { bold: true };
  rij.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  werkblad.views = [{ state: "frozen", ySplit: 1 }];
}

function formaat(werkblad: ExcelJS.Worksheet, kolommen: number[], numFmt: string): void {
  for (const kolom of kolommen) werkblad.getColumn(kolom).numFmt = numFmt;
}

/**
 * Het geld van de bouw als Excel: de posten, de offertes, de meer- en
 * minwerken, de facturen, de kasplanning en het krediet. Bedragen en datums
 * als echte getallen, zodat de boekhouder of de bank er meteen mee kan
 * rekenen. Een momentopname van `vandaag`.
 */
export async function maakGeldExcel(g: Geldgegevens, vandaag: string, opgemaakt = new Date()): Promise<Buffer> {
  const werkmap = new ExcelJS.Workbook();
  werkmap.creator = "Jandra";
  werkmap.created = opgemaakt;

  const partij = (id: number | null) => (id === null ? "" : (g.partijen.find((p) => p.id === id)?.naam ?? ""));
  const post = (id: number | null) => (id === null ? "" : (g.posten.find((p) => p.id === id)?.naam ?? ""));
  const standen = poststanden(g.posten, g.offertes, g.meerwerken, g.facturen);

  // --- Posten -------------------------------------------------------------
  const posten = werkmap.addWorksheet("Posten");
  posten.columns = [
    { header: "Categorie", width: 22 },
    { header: "Post", width: 34 },
    { header: "Partij", width: 28 },
    { header: "Raming", width: 14 },
    { header: "Gekozen offerte", width: 16 },
    { header: "Meer- en minwerk", width: 16 },
    { header: "Verwacht", width: 14 },
    { header: "Gefactureerd", width: 14 },
    { header: "Betaald", width: 14 },
    { header: "Te betalen", width: 14 },
    { header: "Nog te factureren", width: 17 },
    { header: "Tegenover raming", width: 16 },
  ];
  kop(posten);
  for (const stand of standen) {
    posten.addRow([
      CATEGORIENAMEN_POST[stand.post.categorie],
      stand.post.naam,
      partij(stand.gekozen?.partij_id ?? stand.post.partij_id),
      stand.post.raming,
      stand.gekozen?.bedrag ?? null,
      stand.meerwerk,
      stand.verwacht,
      stand.gefactureerd,
      stand.betaald,
      stand.open,
      stand.nogTeFactureren,
      stand.afwijking,
    ]);
  }
  if (standen.length > 0) {
    // Echte formules: wie een raming aanpast in de Excel, ziet het totaal mee veranderen.
    const laatste = standen.length + 1;
    const totaal = posten.addRow(["Totaal", "", ""]);
    for (let kolom = 4; kolom <= 12; kolom++) {
      const letter = posten.getColumn(kolom).letter;
      totaal.getCell(kolom).value = { formula: `SUM(${letter}2:${letter}${laatste})` };
    }
    totaal.font = { bold: true };
  }
  formaat(posten, [4, 5, 6, 7, 8, 9, 10, 11, 12], EURO);

  // --- Offertes -------------------------------------------------------------
  const offertes = werkmap.addWorksheet("Offertes");
  offertes.columns = [
    { header: "Post", width: 34 },
    { header: "Van", width: 28 },
    { header: "Omschrijving", width: 36 },
    { header: "Bedrag", width: 14 },
    { header: "Datum", width: 12 },
    { header: "Geldig tot", width: 12 },
    { header: "Stand", width: 12 },
    { header: "Opmerking", width: 40 },
  ];
  kop(offertes);
  for (const offerte of g.offertes) {
    offertes.addRow([
      post(offerte.post_id),
      partij(offerte.partij_id),
      offerte.omschrijving ?? "",
      offerte.bedrag,
      alsDatum(offerte.datum),
      alsDatum(offerte.geldig_tot),
      offerte.status,
      offerte.opmerking ?? "",
    ]);
  }
  formaat(offertes, [4], EURO);
  formaat(offertes, [5, 6], DATUM);

  // --- Meer- en minwerken ---------------------------------------------------
  const meerwerken = werkmap.addWorksheet("Meer- en minwerken");
  meerwerken.columns = [
    { header: "Post", width: 34 },
    { header: "Datum", width: 12 },
    { header: "Wat", width: 44 },
    { header: "Bedrag", width: 14 },
    { header: "Stand", width: 12 },
  ];
  kop(meerwerken);
  for (const meerwerk of g.meerwerken) {
    meerwerken.addRow([post(meerwerk.post_id), alsDatum(meerwerk.datum), meerwerk.omschrijving, meerwerk.bedrag, meerwerk.status]);
  }
  formaat(meerwerken, [4], EURO);
  formaat(meerwerken, [2], DATUM);

  // --- Facturen -------------------------------------------------------------
  const facturen = werkmap.addWorksheet("Facturen");
  facturen.columns = [
    { header: "Factuurdatum", width: 13 },
    { header: "Nummer", width: 14 },
    { header: "Van", width: 28 },
    { header: "Post", width: 30 },
    { header: "Omschrijving", width: 30 },
    { header: "Bedrag", width: 14 },
    { header: "Vervaldag", width: 12 },
    { header: "Betaald op", width: 12 },
    { header: "Ten laste van", width: 24 },
    { header: "Stand", width: 20 },
    { header: "Opmerking", width: 36 },
  ];
  kop(facturen);
  for (const factuur of [...g.facturen].sort((a, b) => a.factuurdatum.localeCompare(b.factuurdatum) || a.id - b.id)) {
    facturen.addRow([
      alsDatum(factuur.factuurdatum),
      factuur.nummer ?? "",
      partij(factuur.partij_id),
      post(factuur.post_id),
      factuur.omschrijving ?? "",
      factuur.bedrag,
      alsDatum(vervaldagVan(factuur)),
      alsDatum(factuur.betaald_op),
      factuur.vennootschap_id ? (g.vennootschappen.find((v) => v.id === factuur.vennootschap_id)?.naam ?? "") : "",
      factuur.bedrag < 0 ? (factuur.betaald_op ? "verrekend" : "creditnota") : STANDNAMEN[factuurstand(factuur, vandaag)],
      factuur.opmerking ?? "",
    ]);
  }
  formaat(facturen, [6], EURO);
  formaat(facturen, [1, 7, 8], DATUM);

  // --- Kasplanning ----------------------------------------------------------
  const { maanden, ongepland } = kasplanning(standen, g.facturen, g.planning, vandaag, g.eigenInbreng);
  const kas = werkmap.addWorksheet("Kasplanning");
  kas.columns = [
    { header: "Maand", width: 12 },
    { header: "Betaald", width: 14 },
    { header: "Te betalen", width: 14 },
    { header: "Gepland", width: 14 },
    { header: "Samen tot dan", width: 16 },
    { header: "Uit het krediet", width: 16 },
  ];
  kop(kas);
  for (const maand of maanden) {
    kas.addRow([maand.maand, maand.betaald, maand.teBetalen, maand.gepland, maand.cumulatief, maand.uitKrediet]);
  }
  if (ongepland > 0) kas.addRow(["Zonder datum", null, null, ongepland, null, null]);
  formaat(kas, [2, 3, 4, 5, 6], EURO);

  // --- Krediet --------------------------------------------------------------
  const stand = kredietstand(g.opnames, g.facturen, g.krediet, g.eigenInbreng);
  const krediet = werkmap.addWorksheet("Krediet");
  krediet.columns = [{ width: 28 }, { width: 16 }, { width: 40 }];
  const regels: [string, number | null][] = [
    ["Bouwkrediet", stand.krediet],
    ["Opgenomen", stand.opgenomen],
    ["Nog beschikbaar", stand.beschikbaar],
    ["Eigen inbreng", stand.eigenInbreng],
    ["Uit eigen middelen betaald", stand.eigenBetaald],
  ];
  for (const [label, waarde] of regels) {
    const rij = krediet.addRow([label, waarde]);
    rij.getCell(1).font = { bold: true };
    rij.getCell(2).numFmt = EURO;
  }
  krediet.addRow([]);
  const opnamekop = krediet.addRow(["Opname", "Bedrag", "Voor factuur / opmerking"]);
  opnamekop.font = { bold: true };
  for (const opname of g.opnames) {
    const factuur = g.facturen.find((f) => f.id === opname.factuur_id);
    const rij = krediet.addRow([
      alsDatum(opname.datum),
      opname.bedrag,
      [factuur ? [factuur.nummer, partij(factuur.partij_id)].filter(Boolean).join(" ") : "", opname.opmerking ?? ""]
        .filter(Boolean)
        .join(" · "),
    ]);
    rij.getCell(1).numFmt = DATUM;
    rij.getCell(2).numFmt = EURO;
  }

  return Buffer.from(await werkmap.xlsx.writeBuffer());
}
