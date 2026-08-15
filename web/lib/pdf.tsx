import "server-only";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { datum, datumTijd, euro, procent, tariefPerKwh } from "./format";
import type { RapportMomentopname } from "./types";

const kleur = {
  tekst: "#111827",
  zacht: "#6b7280",
  lijn: "#e5e7eb",
  vlak: "#f9fafb",
  accent: "#1d4ed8",
};

const stijl = StyleSheet.create({
  pagina: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9,
    color: kleur.tekst,
    fontFamily: "Helvetica",
  },
  kop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  ondertitel: { fontSize: 10, color: kleur.zacht, marginTop: 4 },
  referentie: { fontSize: 9, color: kleur.zacht, textAlign: "right" },
  partijen: { flexDirection: "row", gap: 24, marginBottom: 20 },
  partij: { flex: 1, backgroundColor: kleur.vlak, padding: 12, borderRadius: 4 },
  partijLabel: {
    fontSize: 7,
    color: kleur.zacht,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  partijNaam: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 2 },
  regelZacht: { color: kleur.zacht, lineHeight: 1.4 },

  totaalBlok: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: kleur.lijn,
    borderRadius: 4,
    marginBottom: 20,
  },
  totaalVak: {
    flex: 1,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: kleur.lijn,
  },
  totaalVakLaatste: { flex: 1, padding: 12 },
  totaalLabel: { fontSize: 7, color: kleur.zacht, textTransform: "uppercase", marginBottom: 4 },
  totaalWaarde: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  totaalAccent: { fontSize: 13, fontFamily: "Helvetica-Bold", color: kleur.accent },

  sectie: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 8 },

  tabelKop: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: kleur.tekst,
    paddingBottom: 4,
    marginBottom: 2,
  },
  rij: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: kleur.lijn,
    paddingVertical: 3,
  },
  totaalRij: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: kleur.tekst,
    paddingTop: 4,
    marginTop: 2,
  },
  kopCel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  vet: { fontFamily: "Helvetica-Bold" },
  rechts: { textAlign: "right" },

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
  notitie: { fontSize: 8, color: kleur.zacht, lineHeight: 1.5, marginTop: 4 },
});

// Kolombreedtes van de sessietabel, samen 100.
const kolom = {
  datum: { width: "17%" },
  laadpaal: { width: "17%" },
  voertuig: { width: "18%" },
  kwh: { width: "11%", textAlign: "right" as const },
  tarief: { width: "13%", textAlign: "right" as const },
  excl: { width: "12%", textAlign: "right" as const },
  btw: { width: "12%", textAlign: "right" as const },
};

function Kop({ rapport, referentie }: { rapport: RapportMomentopname; referentie: string }) {
  return (
    <View style={stijl.kop}>
      <View>
        <Text style={stijl.titel}>Laadkosten thuisladen</Text>
        <Text style={stijl.ondertitel}>
          {rapport.periode.label} · {datum(rapport.periode.start)} t.e.m.{" "}
          {datum(rapport.periode.eind)}
        </Text>
      </View>
      <View>
        <Text style={stijl.referentie}>{referentie}</Text>
        <Text style={stijl.referentie}>Opgemaakt op {datum(rapport.opgemaakt_op)}</Text>
      </View>
    </View>
  );
}

function Partijen({ rapport }: { rapport: RapportMomentopname }) {
  const { begunstigde, vennootschap } = rapport;
  return (
    <View style={stijl.partijen}>
      <View style={stijl.partij}>
        <Text style={stijl.partijLabel}>Terug te betalen door</Text>
        <Text style={stijl.partijNaam}>{vennootschap.naam}</Text>
        {vennootschap.adres ? (
          <Text style={stijl.regelZacht}>{vennootschap.adres}</Text>
        ) : null}
        {vennootschap.btw_nummer ? (
          <Text style={stijl.regelZacht}>BTW {vennootschap.btw_nummer}</Text>
        ) : null}
      </View>
      <View style={stijl.partij}>
        <Text style={stijl.partijLabel}>Terug te betalen aan</Text>
        <Text style={stijl.partijNaam}>{begunstigde.naam || "—"}</Text>
        {begunstigde.adres ? <Text style={stijl.regelZacht}>{begunstigde.adres}</Text> : null}
        {begunstigde.btw_nummer ? (
          <Text style={stijl.regelZacht}>BTW {begunstigde.btw_nummer}</Text>
        ) : null}
        {begunstigde.rekeningnummer ? (
          <Text style={stijl.regelZacht}>{begunstigde.rekeningnummer}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Totalen({ rapport }: { rapport: RapportMomentopname }) {
  const { totalen } = rapport;
  return (
    <View style={stijl.totaalBlok}>
      <View style={stijl.totaalVak}>
        <Text style={stijl.totaalLabel}>Geladen</Text>
        <Text style={stijl.totaalWaarde}>
          {totalen.kwh.toLocaleString("nl-BE", { maximumFractionDigits: 2 })} kWh
        </Text>
        <Text style={stijl.regelZacht}>{totalen.aantal_sessies} sessies</Text>
      </View>
      <View style={stijl.totaalVak}>
        <Text style={stijl.totaalLabel}>Excl. btw</Text>
        <Text style={stijl.totaalWaarde}>{euro(totalen.excl_btw)}</Text>
      </View>
      <View style={stijl.totaalVak}>
        <Text style={stijl.totaalLabel}>Btw</Text>
        <Text style={stijl.totaalWaarde}>{euro(totalen.btw)}</Text>
      </View>
      <View style={stijl.totaalVakLaatste}>
        <Text style={stijl.totaalLabel}>Totaal terug te betalen</Text>
        <Text style={stijl.totaalAccent}>{euro(totalen.incl_btw)}</Text>
      </View>
    </View>
  );
}

function Sessietabel({ rapport }: { rapport: RapportMomentopname }) {
  return (
    <View>
      <Text style={stijl.sectie}>Laadsessies</Text>
      <View style={stijl.tabelKop} fixed>
        <Text style={[stijl.kopCel, kolom.datum]}>Gestart</Text>
        <Text style={[stijl.kopCel, kolom.laadpaal]}>Laadpaal</Text>
        <Text style={[stijl.kopCel, kolom.voertuig]}>Voertuig</Text>
        <Text style={[stijl.kopCel, kolom.kwh]}>kWh</Text>
        <Text style={[stijl.kopCel, kolom.tarief]}>Tarief</Text>
        <Text style={[stijl.kopCel, kolom.excl]}>Excl. btw</Text>
        <Text style={[stijl.kopCel, kolom.btw]}>Btw</Text>
      </View>

      {rapport.regels.map((regel) => (
        <View key={regel.sessie_id} style={stijl.rij} wrap={false}>
          <Text style={kolom.datum}>{datumTijd(regel.gestart)}</Text>
          <Text style={kolom.laadpaal}>{regel.laadpaal}</Text>
          <Text style={kolom.voertuig}>{regel.voertuig ?? "—"}</Text>
          <Text style={kolom.kwh}>
            {regel.kwh.toLocaleString("nl-BE", { maximumFractionDigits: 2 })}
          </Text>
          <Text style={kolom.tarief}>{tariefPerKwh(regel.tarief_per_kwh)}</Text>
          <Text style={kolom.excl}>{euro(regel.bedrag_excl_btw)}</Text>
          <Text style={kolom.btw}>{euro(regel.btw_bedrag)}</Text>
        </View>
      ))}

      <View style={stijl.totaalRij}>
        <Text style={[stijl.vet, kolom.datum]}>Totaal</Text>
        <Text style={kolom.laadpaal} />
        <Text style={kolom.voertuig} />
        <Text style={[stijl.vet, kolom.kwh]}>
          {rapport.totalen.kwh.toLocaleString("nl-BE", { maximumFractionDigits: 2 })}
        </Text>
        <Text style={kolom.tarief} />
        <Text style={[stijl.vet, kolom.excl]}>{euro(rapport.totalen.excl_btw)}</Text>
        <Text style={[stijl.vet, kolom.btw]}>{euro(rapport.totalen.btw)}</Text>
      </View>
    </View>
  );
}

function Meterstanden({ rapport }: { rapport: RapportMomentopname }) {
  if (rapport.meterstanden.length === 0) return null;

  return (
    <View wrap={false}>
      <Text style={stijl.sectie}>Meterstanden ter controle</Text>
      <View style={stijl.tabelKop}>
        <Text style={[stijl.kopCel, { width: "28%" }]}>Laadpaal</Text>
        <Text style={[stijl.kopCel, { width: "18%", textAlign: "right" }]}>Begin</Text>
        <Text style={[stijl.kopCel, { width: "18%", textAlign: "right" }]}>Einde</Text>
        <Text style={[stijl.kopCel, { width: "18%", textAlign: "right" }]}>Verschil</Text>
        <Text style={[stijl.kopCel, { width: "18%", textAlign: "right" }]}>Sessies</Text>
      </View>
      {rapport.meterstanden.map((stand) => (
        <View key={stand.laadpaal} style={stijl.rij}>
          <Text style={{ width: "28%" }}>{stand.laadpaal}</Text>
          <Text style={{ width: "18%", textAlign: "right" }}>
            {stand.begin_kwh?.toFixed(1) ?? "—"}
          </Text>
          <Text style={{ width: "18%", textAlign: "right" }}>
            {stand.eind_kwh?.toFixed(1) ?? "—"}
          </Text>
          <Text style={{ width: "18%", textAlign: "right" }}>
            {stand.verschil_kwh?.toFixed(1) ?? "—"}
          </Text>
          <Text style={{ width: "18%", textAlign: "right" }}>
            {stand.sessies_kwh.toFixed(1)}
          </Text>
        </View>
      ))}
      <Text style={stijl.notitie}>
        Het verschil tussen de meterstanden hoort ongeveer gelijk te zijn aan de optelling
        van de sessies. Een groter verschil wijst meestal op laden buiten evcc om.
      </Text>
    </View>
  );
}

function Verantwoording({ rapport }: { rapport: RapportMomentopname }) {
  return (
    <View wrap={false}>
      <Text style={stijl.sectie}>Toegepast tarief</Text>
      {rapport.tarieven.map((tarief) => (
        <Text key={tarief.periode} style={stijl.notitie}>
          {tarief.periode}: {tariefPerKwh(tarief.eur_per_kwh)}{" "}
          {tarief.inclusief_btw ? "inclusief" : "exclusief"} btw van{" "}
          {procent(tarief.btw_percentage)} ({tarief.bron}).
        </Text>
      ))}
      <Text style={stijl.notitie}>
        De bedragen zijn per sessie op de eurocent afgerond, zodat de kolom exact optelt tot
        het eindtotaal.
      </Text>
    </View>
  );
}

export function RapportDocument({
  rapport,
  referentie,
}: {
  rapport: RapportMomentopname;
  referentie: string;
}): ReactElement {
  return (
    <Document
      title={`Laadkosten ${rapport.vennootschap.naam} ${rapport.periode.label}`}
      author={rapport.begunstigde.naam || "Laadkosten"}
    >
      <Page size="A4" style={stijl.pagina}>
        <Kop rapport={rapport} referentie={referentie} />
        <Partijen rapport={rapport} />
        <Totalen rapport={rapport} />
        <Sessietabel rapport={rapport} />
        <View style={{ height: 12 }} />
        <Meterstanden rapport={rapport} />
        <View style={{ height: 12 }} />
        <Verantwoording rapport={rapport} />

        <View style={stijl.voet} fixed>
          <Text>
            {referentie} · {rapport.vennootschap.naam} · {rapport.periode.label}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function maakRapportPdf(
  rapport: RapportMomentopname,
  referentie: string,
): Promise<Buffer> {
  return renderToBuffer(<RapportDocument rapport={rapport} referentie={referentie} />);
}
