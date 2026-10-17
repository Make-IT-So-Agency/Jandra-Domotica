import "server-only";

import { Circle, Document, Page, Polygon, Polyline, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { datumTijd } from "@/lib/format";
import { eendraadschema, situatieschema, sneden, type Tekening, type Tekenstuk } from "./schema";
import type { Techniekinvoer, Techniekvoorstel } from "./voorstel";
import {
  beveiligingTekst,
  differentieelTekst,
  domoticaTekst,
  domoticakabelTekst,
  knxTekst,
  meters,
  netwerkTekst,
  plaatsTekst,
  ruimtesTekst,
  tellingTekst,
  uitgangspunten,
} from "./weergave";

/**
 * Het voorstel voor de technieken als PDF, voor de elektricien: de
 * uitgangspunten, de kringen, de kasten en de kabels, dan het eendraadschema
 * op A3 (over meer bladen als het breed is) en per verdieping het
 * situatieschema. Een momentopname: de datum staat erop.
 */

const kleur = { tekst: "#111827", zacht: "#6b7280", lijn: "#e5e7eb" };

const stijl = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 52, paddingHorizontal: 36, fontSize: 8.5, color: kleur.tekst, fontFamily: "Helvetica" },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  ondertitel: { fontSize: 10, color: kleur.zacht, marginTop: 4, marginBottom: 14 },
  kop: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },
  // Met de lettergrootte erbij: anders rekent @react-pdf de regelafstand op zijn eigen standaard van 18.
  tekst: { fontSize: 8.5, marginBottom: 3, lineHeight: 1.35 },
  zacht: { color: kleur.zacht },
  rijkop: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: kleur.tekst, paddingBottom: 3, marginBottom: 2 },
  rij: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: kleur.lijn, paddingVertical: 3 },
  kopcel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  vet: { fontFamily: "Helvetica-Bold" },
  voet: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: kleur.zacht,
    borderTopWidth: 0.5,
    borderTopColor: kleur.lijn,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

/** Helvetica in een PDF kent geen Grieks: de Δ van een differentieel wordt "Diff.". */
const pdfTekst = (tekst: string) => tekst.replace("ΔI", "Diff.");

const punten = (lijst: readonly [number, number][]) => lijst.map(([x, y]) => `${x},${y}`).join(" ");

function SvgStuk({ stuk }: { stuk: Tekenstuk }): ReactElement {
  switch (stuk.soort) {
    case "lijn":
      return (
        <Polyline
          points={punten(stuk.punten)}
          fill="none"
          stroke={stuk.kleur ?? kleur.tekst}
          strokeWidth={stuk.dikte ?? 0.8}
          strokeDasharray={stuk.streep ? "4 3" : undefined}
        />
      );
    case "vlak":
      return <Polygon points={punten(stuk.punten)} fill={stuk.vul} stroke={stuk.lijn ?? "none"} strokeWidth={0.8} />;
    case "rechthoek":
      return <Rect x={stuk.x} y={stuk.y} width={stuk.breedte} height={stuk.hoogte} fill={stuk.vul ?? "none"} stroke={stuk.lijn ?? "none"} strokeWidth={0.8} />;
    case "cirkel":
      return <Circle cx={stuk.x} cy={stuk.y} r={stuk.r} fill={stuk.vul ?? "none"} stroke={stuk.lijn ?? "none"} strokeWidth={0.8} />;
    case "tekst":
      return (
        <Text
          x={stuk.x}
          y={stuk.y}
          fill={stuk.kleur ?? kleur.tekst}
          textAnchor={stuk.anker ?? "start"}
          // De lettergrootte en het lettertype staan bij een tekst in een SVG in zijn stijl.
          style={{ fontSize: stuk.grootte, fontFamily: stuk.vet ? "Helvetica-Bold" : "Helvetica" } as object}
        >
          {pdfTekst(stuk.tekst)}
        </Text>
      );
  }
}

/** Een stuk van een tekening, van x = van tot tot, zo groot als past in `breedte` op `hoogte`. */
function Schema({ tekening, van, tot, breedte, hoogte }: { tekening: Tekening; van: number; tot: number; breedte: number; hoogte: number }) {
  const w = tot - van;
  const schaal = Math.min(1, breedte / w, hoogte / tekening.hoogte);
  return (
    <Svg width={w * schaal} height={tekening.hoogte * schaal} viewBox={`${van} 0 ${w} ${tekening.hoogte}`}>
      <Rect x={van} y={0} width={w} height={tekening.hoogte} fill="#ffffff" />
      {tekening.stukken.map((stuk, i) => (
        <SvgStuk key={i} stuk={stuk} />
      ))}
    </Svg>
  );
}

function Tabel({ koppen, breedtes, rijen }: { koppen: string[]; breedtes: string[]; rijen: string[][] }) {
  return (
    <View>
      <View style={stijl.rijkop}>
        {koppen.map((kop, i) => (
          <Text key={kop} style={[stijl.kopcel, { width: breedtes[i] }]}>
            {kop}
          </Text>
        ))}
      </View>
      {rijen.map((rij, r) => (
        <View key={r} style={stijl.rij} wrap={false}>
          {rij.map((cel, i) => (
            <Text key={i} style={{ width: breedtes[i], paddingRight: 4 }}>
              {cel}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Een kop die niet alleen onderaan een blad blijft staan: is er minder plaats dan voor een paar regels, dan gaat ze mee naar het volgende. */
function Kop({ children }: { children: string }) {
  return (
    <Text style={stijl.kop} minPresenceAhead={60}>
      {children}
    </Text>
  );
}

function Voet() {
  return (
    <View style={stijl.voet} fixed>
      <Text>Een voorstel om met de elektricien te bespreken: geen eendraadschema of situatieschema voor de keuring.</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Voorstel_({ voorstel, invoer, project, opgemaakt }: { voorstel: Techniekvoorstel; invoer: Techniekinvoer; project: string | null; opgemaakt: Date }): ReactElement {
  const { kringen, differentielen, verdeelkast, domotica, netwerk, instellingen } = voorstel;
  const schema = eendraadschema(voorstel);
  // A3 liggend: 1190 op 842 punten, min de randen en de titel.
  const a3 = { breedte: 1190 - 72, hoogte: 842 - 36 - 52 - 30 };
  const stukken = sneden(schema, a3.breedte);
  const situaties = invoer.verdiepingen.flatMap((v) => {
    const tekening = situatieschema(voorstel, v, 1190 - 72 - 20, 842 - 36 - 52 - 50);
    return tekening ? [{ verdieping: v.naam, tekening }] : [];
  });
  return (
    <Document title="Voorstel elektriciteit" author={project ?? undefined}>
      <Page size="A4" style={stijl.pagina}>
        <Text style={stijl.titel}>Voorstel elektriciteit</Text>
        <Text style={stijl.ondertitel}>
          {project ? `${project} · ` : ""}momentopname van {datumTijd(opgemaakt.toISOString())}
        </Text>

        <Kop>Uitgangspunten</Kop>
        {uitgangspunten(instellingen).map((regel) => (
          <Text key={regel} style={stijl.tekst}>
            {regel}
          </Text>
        ))}
        <Text style={stijl.tekst}>Verdeelkast: {plaatsTekst(voorstel.kast, invoer.verdiepingen)}</Text>
        {voorstel.opmerkingen.map((o) => (
          <Text key={o} style={[stijl.tekst, stijl.zacht]}>
            {o}
          </Text>
        ))}

        <Kop>{`Kringen (${kringen.length})`}</Kop>
        <Tabel
          koppen={["Kring", "Wat", "Automaat", "Kabel", "Differentieel", "Punten", "Lengte"]}
          breedtes={["6%", "34%", "11%", "15%", "14%", "11%", "9%"]}
          rijen={kringen.map((k) => [
            k.letter,
            [k.naam, ruimtesTekst(k), k.opmerking ?? ""].filter(Boolean).join(" · "),
            beveiligingTekst(k.beveiliging),
            k.kabel,
            differentieelTekst(differentielen[k.differentieel], differentielen),
            tellingTekst(k),
            meters(k.kabellengte),
          ])}
        />

        <Kop>Verdeelkast</Kop>
        <Tabel
          koppen={["Wat", "Aantal", "Modules"]}
          breedtes={["70%", "15%", "15%"]}
          rijen={[
            ...verdeelkast.regels.map((r) => [r.wat, String(r.aantal), String(r.aantal * r.breedte)]),
            [`Samen, met ${verdeelkast.reserve} vrij: ${verdeelkast.rijen} rijen van 13 modules`, "", String(verdeelkast.modules + verdeelkast.reserve)],
          ]}
        />

        {domotica ? (
          <View wrap={false}>
            <Kop>{domotica.knx ? "Domoticakast: KNX met Home Assistant" : "Domoticakast"}</Kop>
            <Text style={stijl.tekst}>
              {domoticaTekst(domotica)}. {domotica.plaats?.bron === "domoticakast" ? plaatsTekst(domotica.plaats, invoer.verdiepingen) : "Naast de verdeelkast."}
              {domotica.knx ? ` ${knxTekst(domotica.knx)}` : ""}
            </Text>
            <Text style={[stijl.tekst, { marginBottom: 6 }]}>Kabels naar de kast: {domotica.kabels.map(domoticakabelTekst).join(", ")}.</Text>
            <Tabel
              koppen={["Module (ruwe schatting)", "Aantal", "Modules"]}
              breedtes={["70%", "15%", "15%"]}
              rijen={[
                ...domotica.kast.regels.map((r) => [r.wat, String(r.aantal), String(r.aantal * r.breedte)]),
                [`Samen, met ${domotica.kast.reserve} vrij: ${domotica.kast.rijen} rijen van 13 modules`, "", String(domotica.kast.modules + domotica.kast.reserve)],
              ]}
            />
          </View>
        ) : null}

        {netwerk.totaal > 0 ? (
          <View wrap={false}>
            <Kop>Netwerkkast</Kop>
            <Tabel
              koppen={["Wat", "Poorten", "PoE"]}
              breedtes={["70%", "15%", "15%"]}
              rijen={[...netwerk.poorten.map((p) => [p.wat, String(p.aantal), p.poe ? "ja" : ""]), ["Totaal", String(netwerk.totaal), `${netwerk.poe} met PoE`]]}
            />
            <Text style={[stijl.tekst, { marginTop: 4 }]}>
              {netwerk.plaats?.bron === "netwerkkast" ? plaatsTekst(netwerk.plaats, invoer.verdiepingen) : "Naast de verdeelkast."} {netwerkTekst(netwerk)}
            </Text>
          </View>
        ) : null}

        <View wrap={false}>
          <Kop>Kabels, geschat</Kop>
          <Tabel koppen={["Kabel", "Lengte"]} breedtes={["70%", "30%"]} rijen={voorstel.kabels.map((k) => [k.soort, `± ${k.lengte} m`])} />
          <Text style={[stijl.tekst, stijl.zacht, { marginTop: 4 }]}>
            Van de kast langs de muren naar elk punt, de hoogte tussen de verdiepingen, telkens 1,5 m in de muur, en 10% speling.
          </Text>
        </View>
        <Voet />
      </Page>

      {stukken.map(([van, tot], i) => (
        <Page key={`schema-${i}`} size="A3" orientation="landscape" style={stijl.pagina}>
          <Text style={[stijl.kop, { marginTop: 0 }]}>
            Eendraadschema{stukken.length > 1 ? ` (${i + 1} van ${stukken.length})` : ""}
          </Text>
          <Schema tekening={schema} van={van} tot={tot} breedte={a3.breedte} hoogte={a3.hoogte} />
          <Voet />
        </Page>
      ))}

      {situaties.map(({ verdieping, tekening }) => (
        <Page key={`situatie-${verdieping}`} size="A3" orientation="landscape" style={stijl.pagina}>
          <Text style={[stijl.kop, { marginTop: 0 }]}>Situatieschema {verdieping.toLowerCase()}</Text>
          <Schema tekening={tekening} van={0} tot={tekening.breedte} breedte={a3.breedte} hoogte={a3.hoogte - 20} />
          <Voet />
        </Page>
      ))}
    </Document>
  );
}

export async function maakTechniekenPdf(voorstel: Techniekvoorstel, invoer: Techniekinvoer, project: string | null, opgemaakt = new Date()): Promise<Buffer> {
  return renderToBuffer(<Voorstel_ voorstel={voorstel} invoer={invoer} project={project} opgemaakt={opgemaakt} />);
}
