import "server-only";

import { rekenSessiesDoor } from "./billing";
import { leesInstellingen } from "./settings";
import { db } from "./supabase";
import { tariefStatusVoorPeriode } from "./tariffs";
import type { Periode } from "./periods";
import type {
  Laadpaal,
  Laadsessie,
  MeterstandOverzicht,
  RapportMomentopname,
  RapportRegel,
  RapportTotalen,
  Tarief,
  Vennootschap,
} from "./types";

export interface RapportVoorbereiding {
  vennootschap: Vennootschap;
  periode: Periode;
  regels: RapportRegel[];
  totalen: RapportTotalen;
  meterstanden: MeterstandOverzicht[];
  gebruikteTarieven: Tarief[];
  /** Sessies die niet meegeteld zijn, met reden. Altijd tonen aan de gebruiker. */
  overgeslagen: Array<{ omschrijving: string; reden: string }>;
  /** Redenen waarom er nog geen rapport gemaakt mag worden. Leeg = klaar. */
  blokkades: string[];
  /** Zaken om te weten, maar die niet blokkeren. */
  waarschuwingen: string[];
}

async function leesLaadpalen(): Promise<Laadpaal[]> {
  const { data, error } = await db().from("loadpoints").select("*").order("name");
  if (error) throw new Error(`Laadpalen lezen mislukt: ${error.message}`);
  return (data ?? []) as Laadpaal[];
}

async function leesSessiesInPeriode(periode: Periode): Promise<Laadsessie[]> {
  const { data, error } = await db()
    .from("sessions")
    .select("*")
    .gte("finished_at", periode.vanaf.toISOString())
    .lt("finished_at", periode.tot.toISOString())
    .order("started_at");

  if (error) throw new Error(`Sessies lezen mislukt: ${error.message}`);
  return (data ?? []) as Laadsessie[];
}

/**
 * Meterstand van een laadpaal het dichtst bij een tijdstip.
 *
 * De standen komen binnen bij elke synchronisatie, dus zelden exact op de
 * grens van een periode. We nemen de laatst gekende stand vóór het tijdstip,
 * en anders de eerste erna.
 */
async function meterstandRond(
  laadpaal: string,
  tijdstip: Date,
): Promise<number | null> {
  const voor = await db()
    .from("meter_readings")
    .select("reading_kwh")
    .ilike("loadpoint_name", laadpaal)
    .lte("read_at", tijdstip.toISOString())
    .order("read_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (voor.data) return Number(voor.data.reading_kwh);

  const na = await db()
    .from("meter_readings")
    .select("reading_kwh")
    .ilike("loadpoint_name", laadpaal)
    .gt("read_at", tijdstip.toISOString())
    .order("read_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return na.data ? Number(na.data.reading_kwh) : null;
}

async function bouwMeterstanden(
  laadpalen: Laadpaal[],
  periode: Periode,
  regels: RapportRegel[],
): Promise<MeterstandOverzicht[]> {
  const overzicht: MeterstandOverzicht[] = [];

  for (const laadpaal of laadpalen) {
    const begin = await meterstandRond(laadpaal.name, periode.vanaf);
    const eind = await meterstandRond(laadpaal.name, periode.tot);

    const sessiesKwh = regels
      .filter((regel) => regel.laadpaal.toLowerCase() === laadpaal.name.toLowerCase())
      .reduce((som, regel) => som + regel.kwh, 0);

    const verschil =
      begin !== null && eind !== null ? Math.round((eind - begin) * 1000) / 1000 : null;

    overzicht.push({
      laadpaal: laadpaal.display_name ?? laadpaal.name,
      begin_kwh: begin,
      eind_kwh: eind,
      verschil_kwh: verschil,
      sessies_kwh: Math.round(sessiesKwh * 1000) / 1000,
      afwijking_kwh:
        verschil !== null ? Math.round((verschil - sessiesKwh) * 1000) / 1000 : null,
    });
  }

  return overzicht;
}

export async function bereidRapportVoor(
  vennootschapId: string,
  periode: Periode,
): Promise<RapportVoorbereiding> {
  const [{ data: vennootschapData, error: vennootschapFout }, laadpalen, instellingen] =
    await Promise.all([
      db().from("companies").select("*").eq("id", vennootschapId).single(),
      leesLaadpalen(),
      leesInstellingen(),
    ]);

  if (vennootschapFout || !vennootschapData) {
    throw new Error("Deze vennootschap bestaat niet (meer).");
  }
  const vennootschap = vennootschapData as Vennootschap;

  const eigenLaadpalen = laadpalen.filter(
    (laadpaal) => laadpaal.company_id === vennootschapId,
  );

  const blokkades: string[] = [];
  const waarschuwingen: string[] = [];

  if (eigenLaadpalen.length === 0) {
    blokkades.push(
      `Er is nog geen laadpaal toegewezen aan ${vennootschap.name}. Doe dat eerst bij Laadpalen.`,
    );
  }

  // Tarieven: elk kwartaal dat de periode raakt, moet een bevestigd tarief hebben.
  const regios = [...new Set(eigenLaadpalen.map((laadpaal) => laadpaal.region))];
  for (const regio of regios.length > 0 ? regios : [instellingen.regio]) {
    for (const status of await tariefStatusVoorPeriode(periode, regio)) {
      if (!status.tarief) {
        blokkades.push(
          `Er is nog geen tarief ingevuld voor ${status.label}. Ga naar Tarieven en vul het aan.`,
        );
      } else if (!status.bevestigd) {
        blokkades.push(
          `Het tarief voor ${status.label} is automatisch gevonden maar nog niet bevestigd. ` +
            `Kijk het na bij Tarieven en klik op Bevestigen.`,
        );
      }
    }
  }

  const alleSessies = await leesSessiesInPeriode(periode);
  const eigenNamen = new Set(
    eigenLaadpalen.map((laadpaal) => laadpaal.name.toLowerCase()),
  );
  const gekendeNamen = new Set(laadpalen.map((laadpaal) => laadpaal.name.toLowerCase()));

  const nietToegewezen = alleSessies.filter(
    (sessie) => !gekendeNamen.has((sessie.loadpoint_name ?? "").toLowerCase()),
  );
  if (nietToegewezen.length > 0) {
    const namen = [
      ...new Set(nietToegewezen.map((sessie) => sessie.loadpoint_name ?? "onbekend")),
    ];
    waarschuwingen.push(
      `${nietToegewezen.length} sessie(s) horen bij een laadpaal die nog nergens aan gekoppeld is ` +
        `(${namen.join(", ")}). Die staan in geen enkel rapport.`,
    );
  }

  const eigenSessies = alleSessies.filter((sessie) =>
    eigenNamen.has((sessie.loadpoint_name ?? "").toLowerCase()),
  );

  const doorrekening = rekenSessiesDoor(eigenSessies, {
    tarieven: await leesAlleTarieven(),
    regioPerLaadpaal: new Map(
      laadpalen.map((laadpaal) => [laadpaal.name.toLowerCase(), laadpaal.region]),
    ),
  });

  const meterstanden = await bouwMeterstanden(eigenLaadpalen, periode, doorrekening.regels);

  for (const stand of meterstanden) {
    if (stand.afwijking_kwh !== null && Math.abs(stand.afwijking_kwh) > 1) {
      waarschuwingen.push(
        `Bij ${stand.laadpaal} verschilt de meterstand ${stand.afwijking_kwh.toFixed(1)} kWh ` +
          `van de optelling van de sessies. Meestal is dat laden buiten evcc om.`,
      );
    }
  }

  if (doorrekening.regels.length === 0 && blokkades.length === 0) {
    blokkades.push("Er zijn geen afgeronde laadsessies in deze periode.");
  }

  return {
    vennootschap,
    periode,
    regels: doorrekening.regels,
    totalen: doorrekening.totalen,
    meterstanden,
    gebruikteTarieven: doorrekening.gebruikteTarieven,
    overgeslagen: doorrekening.overgeslagen.map(({ sessie, reden }) => ({
      omschrijving: `${sessie.started_at?.slice(0, 16).replace("T", " ") ?? "?"} · ${
        sessie.loadpoint_name ?? "onbekend"
      }`,
      reden,
    })),
    blokkades,
    waarschuwingen,
  };
}

async function leesAlleTarieven(): Promise<Tarief[]> {
  const { data, error } = await db().from("tariffs").select("*");
  if (error) throw new Error(`Tarieven lezen mislukt: ${error.message}`);
  return (data ?? []) as Tarief[];
}

export function bouwMomentopname(
  voorbereiding: RapportVoorbereiding,
  begunstigde: RapportMomentopname["begunstigde"],
): RapportMomentopname {
  return {
    vennootschap: {
      naam: voorbereiding.vennootschap.name,
      btw_nummer: voorbereiding.vennootschap.vat_number,
      adres: voorbereiding.vennootschap.address,
    },
    begunstigde,
    periode: {
      start: voorbereiding.periode.start,
      eind: voorbereiding.periode.eind,
      label: voorbereiding.periode.label,
      soort: voorbereiding.periode.soort,
    },
    regels: voorbereiding.regels,
    totalen: voorbereiding.totalen,
    meterstanden: voorbereiding.meterstanden,
    tarieven: voorbereiding.gebruikteTarieven.map((tarief) => ({
      periode: `${tarief.period_start} t.e.m. ${tarief.period_end}`,
      eur_per_kwh: Number(tarief.eur_per_kwh),
      btw_percentage: Number(tarief.vat_rate),
      inclusief_btw: tarief.includes_vat,
      bron: tarief.source === "auto" ? "automatisch opgehaald" : "handmatig ingevuld",
      bron_url: tarief.source_url,
    })),
    opgemaakt_op: new Date().toISOString(),
  };
}

function referentieVoor(naam: string, jaar: number, volgnummer: number): string {
  const kort = naam
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  return `LK-${jaar}-${kort || "VENN"}-${String(volgnummer).padStart(3, "0")}`;
}

export interface BewaardRapport {
  id: string;
  reference: string;
}

/** Bewaart het rapport als onveranderlijke momentopname. */
export async function bewaarRapport(
  voorbereiding: RapportVoorbereiding,
  door: string,
): Promise<BewaardRapport> {
  if (voorbereiding.blokkades.length > 0) {
    throw new Error(voorbereiding.blokkades.join(" "));
  }

  const instellingen = await leesInstellingen();
  const momentopname = bouwMomentopname(voorbereiding, instellingen.begunstigde);
  const jaar = Number(voorbereiding.periode.start.slice(0, 4));

  const { count, error: telFout } = await db()
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("company_id", voorbereiding.vennootschap.id)
    .gte("period_start", `${jaar}-01-01`)
    .lte("period_start", `${jaar}-12-31`);

  if (telFout) throw new Error(`Rapporten tellen mislukt: ${telFout.message}`);

  // Bij een gelijktijdige aanmaak kan hetzelfde volgnummer twee keer opduiken;
  // de unieke index vangt dat op en we proberen gewoon het volgende nummer.
  let volgnummer = (count ?? 0) + 1;
  for (let poging = 0; poging < 10; poging += 1) {
    const referentie = referentieVoor(voorbereiding.vennootschap.name, jaar, volgnummer);
    const { data, error } = await db()
      .from("reports")
      .insert({
        company_id: voorbereiding.vennootschap.id,
        reference: referentie,
        period_start: voorbereiding.periode.start,
        period_end: voorbereiding.periode.eind,
        period_kind: voorbereiding.periode.soort,
        session_count: voorbereiding.totalen.aantal_sessies,
        total_kwh: voorbereiding.totalen.kwh,
        total_excl_vat: voorbereiding.totalen.excl_btw,
        total_vat: voorbereiding.totalen.btw,
        total_incl_vat: voorbereiding.totalen.incl_btw,
        snapshot: momentopname,
        generated_by: door,
      })
      .select("id, reference")
      .single();

    if (!error && data) return data as BewaardRapport;
    if (error && error.code !== "23505") {
      throw new Error(`Rapport bewaren mislukt: ${error.message}`);
    }
    volgnummer += 1;
  }

  throw new Error("Kon geen vrij rapportnummer vinden. Probeer het opnieuw.");
}
