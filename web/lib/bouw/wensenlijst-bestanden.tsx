import "server-only";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import type { ReactElement } from "react";

import { datumTijd } from "../format";
import { CATEGORIENAMEN, type Wensenlijst } from "./punten";

/**
 * De wensenlijst als PDF en als Excel, voor de elektricien en de
 * domotica-installateur. Een export is een momentopname: de datum staat
 * erop.
 */

const kleur = { tekst: "#111827", zacht: "#6b7280", lijn: "#e5e7eb", vlak: "#f9fafb" };

const stijl = StyleSheet.create({
  pagina: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, color: kleur.tekst, fontFamily: "Helvetica" },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  ondertitel: { fontSize: 10, color: kleur.zacht, marginTop: 4, marginBottom: 18 },
  verdieping: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  ruimte: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  kop: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: kleur.tekst, paddingBottom: 3, marginBottom: 2 },
  rij: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: kleur.lijn, paddingVertical: 3 },
  kopCel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  code: { width: "9%", fontFamily: "Helvetica-Bold" },
  wat: { width: "33%" },
  aantal: { width: "8%", textAlign: "right", paddingRight: 8 },
  hoogte: { width: "18%" },
  opmerking: { width: "32%", color: kleur.zacht },
  voet: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 7,
    color: kleur.zacht,
    borderTopWidth: 0.5,
    borderTopColor: kleur.lijn,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function Kop() {
  return (
    <View style={stijl.kop}>
      <Text style={[stijl.kopCel, stijl.code]}>Code</Text>
      <Text style={[stijl.kopCel, stijl.wat]}>Wat</Text>
      <Text style={[stijl.kopCel, stijl.aantal]}>Aantal</Text>
      <Text style={[stijl.kopCel, stijl.hoogte]}>Hoogte</Text>
      <Text style={[stijl.kopCel, stijl.opmerking]}>Opmerking</Text>
    </View>
  );
}

function Document_({ lijst, project, opgemaakt }: { lijst: Wensenlijst; project: string | null; opgemaakt: Date }): ReactElement {
  return (
    <Document title="Wensenlijst elektriciteit en domotica" author={project ?? undefined}>
      <Page size="A4" style={stijl.pagina}>
        <Text style={stijl.titel}>Wensenlijst elektriciteit en domotica</Text>
        <Text style={stijl.ondertitel}>
          {project ? `${project} · ` : ""}
          {lijst.aantal} punten · momentopname van {datumTijd(opgemaakt.toISOString())}
        </Text>

        {lijst.verdiepingen.map((verdieping) => (
          <View key={verdieping.verdiepingId}>
            <Text style={stijl.verdieping}>
              {verdieping.naam} ({verdieping.aantal})
            </Text>
            {verdieping.ruimtes.map((ruimte) => (
              <View key={ruimte.ruimteId ?? "zonder"} wrap={false}>
                <Text style={stijl.ruimte}>
                  {ruimte.naam} ({ruimte.aantal})
                </Text>
                <Kop />
                {ruimte.regels.map((regel) => (
                  <View key={regel.soort} style={stijl.rij}>
                    <Text style={stijl.code}>{regel.code}</Text>
                    <Text style={stijl.wat}>{regel.naam}</Text>
                    <Text style={stijl.aantal}>{regel.aantal}</Text>
                    <Text style={stijl.hoogte}>{regel.hoogtes.join(", ")}</Text>
                    <Text style={stijl.opmerking}>{regel.opmerkingen.join("; ")}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View wrap={false}>
          <Text style={stijl.verdieping}>Totaal per soort</Text>
          <Kop />
          {lijst.totalen.map((regel) => (
            <View key={regel.soort} style={stijl.rij}>
              <Text style={stijl.code}>{regel.code}</Text>
              <Text style={stijl.wat}>{regel.naam}</Text>
              <Text style={stijl.aantal}>{regel.aantal}</Text>
              <Text style={stijl.hoogte}>{CATEGORIENAMEN[regel.categorie]}</Text>
              <Text style={stijl.opmerking} />
            </View>
          ))}
        </View>

        <View style={stijl.voet} fixed>
          <Text>Hoogtes boven de afgewerkte vloer. Wat gewenst is, is nog geen bestelling.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function maakWensenlijstPdf(lijst: Wensenlijst, project: string | null, opgemaakt = new Date()): Promise<Buffer> {
  return renderToBuffer(<Document_ lijst={lijst} project={project} opgemaakt={opgemaakt} />);
}

/** Twee bladen: alle punten per ruimte, en het totaal per soort. Aantallen als echte getallen. */
export async function maakWensenlijstExcel(lijst: Wensenlijst, project: string | null, opgemaakt = new Date()): Promise<Buffer> {
  const werkmap = new ExcelJS.Workbook();
  werkmap.creator = project ?? "Jandra";
  werkmap.created = opgemaakt;

  const kop = (werkblad: ExcelJS.Worksheet) => {
    const rij = werkblad.getRow(1);
    rij.font = { bold: true };
    rij.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    werkblad.views = [{ state: "frozen", ySplit: 1 }];
  };

  const perRuimte = werkmap.addWorksheet("Per ruimte");
  perRuimte.columns = [
    { header: "Verdieping", width: 26 },
    { header: "Ruimte", width: 24 },
    { header: "Code", width: 8 },
    { header: "Wat", width: 38 },
    { header: "Aantal", width: 9 },
    { header: "Hoogte", width: 22 },
    { header: "Opmerking", width: 50 },
  ];
  kop(perRuimte);
  for (const verdieping of lijst.verdiepingen) {
    for (const ruimte of verdieping.ruimtes) {
      for (const regel of ruimte.regels) {
        perRuimte.addRow([
          verdieping.naam,
          ruimte.naam,
          regel.code,
          regel.naam,
          regel.aantal,
          regel.hoogtes.join(", "),
          regel.opmerkingen.join("; "),
        ]);
      }
    }
  }

  const totaal = werkmap.addWorksheet("Totaal per soort");
  totaal.columns = [
    { header: "Categorie", width: 24 },
    { header: "Code", width: 8 },
    { header: "Wat", width: 38 },
    { header: "Aantal", width: 9 },
  ];
  kop(totaal);
  for (const regel of lijst.totalen) totaal.addRow([CATEGORIENAMEN[regel.categorie], regel.code, regel.naam, regel.aantal]);
  totaal.addRow(["Totaal", "", "", lijst.aantal]).font = { bold: true };

  return Buffer.from(await werkmap.xlsx.writeBuffer());
}
