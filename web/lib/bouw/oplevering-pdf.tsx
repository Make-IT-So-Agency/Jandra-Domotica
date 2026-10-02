import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { datumTijd } from "../format";

/**
 * De opleverpunten van één aannemer als PDF, om mee te geven of te mailen.
 * Per punt de kleine versie van één foto: genoeg om te zien wat bedoeld is,
 * en de PDF blijft klein. Een momentopname: de datum staat erop.
 */

export interface Opleverregel {
  nummer: number;
  titel: string;
  omschrijving: string | null;
  waar: string | null;
  ronde: string;
  status: string;
  opmerking: string | null;
  /** De kleine versie van een foto, als JPEG. */
  foto: Buffer | null;
}

const kleur = { tekst: "#111827", zacht: "#6b7280", lijn: "#e5e7eb" };

const stijl = StyleSheet.create({
  pagina: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 10, color: kleur.tekst, fontFamily: "Helvetica" },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  ondertitel: { fontSize: 10, color: kleur.zacht, marginTop: 4, marginBottom: 16 },
  punt: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: kleur.lijn, paddingVertical: 8 },
  nummer: { width: 26, fontFamily: "Helvetica-Bold" },
  tekst: { flex: 1, paddingRight: 10 },
  wat: { fontFamily: "Helvetica-Bold" },
  zacht: { color: kleur.zacht, fontSize: 9, marginTop: 2 },
  foto: { width: 120, height: 90, objectFit: "cover" },
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

function Document_({
  partij,
  project,
  regels,
  opgemaakt,
  metLink,
}: {
  partij: string;
  project: string | null;
  regels: Opleverregel[];
  opgemaakt: Date;
  metLink: boolean;
}): ReactElement {
  return (
    <Document title={`Opleverpunten ${partij}`} author={project ?? undefined}>
      <Page size="A4" style={stijl.pagina}>
        <Text style={stijl.titel}>Opleverpunten</Text>
        <Text style={stijl.ondertitel}>
          {partij}
          {project ? ` · ${project}` : ""} · {regels.length === 1 ? "1 punt" : `${regels.length} punten`} · momentopname van{" "}
          {datumTijd(opgemaakt.toISOString())}
        </Text>
        {regels.length === 0 ? <Text>Niets meer te herstellen. Dank je!</Text> : null}
        {regels.map((regel) => (
          <View key={regel.nummer} style={stijl.punt} wrap={false}>
            <Text style={stijl.nummer}>{regel.nummer}.</Text>
            <View style={stijl.tekst}>
              <Text style={stijl.wat}>{regel.titel}</Text>
              <Text style={stijl.zacht}>{[regel.waar, regel.ronde, regel.status].filter(Boolean).join(" · ")}</Text>
              {regel.omschrijving ? <Text style={{ marginTop: 3 }}>{regel.omschrijving}</Text> : null}
              {regel.opmerking ? <Text style={stijl.zacht}>&quot;{regel.opmerking}&quot;</Text> : null}
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf kent geen alt */}
            {regel.foto ? <Image style={stijl.foto} src={regel.foto} /> : null}
          </View>
        ))}
        <View style={stijl.voet} fixed>
          <Text>
            {metLink
              ? "Meld wat hersteld is via je persoonlijke link; wij kijken het daarna na."
              : "Laat ons weten wat hersteld is; wij kijken het daarna na."}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function maakOpleverPdf(gegevens: {
  partij: string;
  project: string | null;
  regels: Opleverregel[];
  opgemaakt?: Date;
  metLink: boolean;
}): Promise<Buffer> {
  return renderToBuffer(<Document_ {...gegevens} opgemaakt={gegevens.opgemaakt ?? new Date()} />);
}
