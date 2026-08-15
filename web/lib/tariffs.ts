import "server-only";

import { haalTariefOp, type Regio } from "./creg";
import { kwartaalPeriode, kwartaalVan } from "./periods";
import { leesInstellingen } from "./settings";
import { db } from "./supabase";
import type { Periode } from "./periods";
import type { Tarief } from "./types";

export async function leesTarieven(regio?: string): Promise<Tarief[]> {
  let query = db().from("tariffs").select("*").order("period_start", { ascending: false });
  if (regio) query = query.eq("region", regio);

  const { data, error } = await query;
  if (error) throw new Error(`Tarieven lezen mislukt: ${error.message}`);
  return (data ?? []) as Tarief[];
}

/** De kwartalen die een periode overlapt, als lijst van {jaar, kwartaal}. */
export function kwartalenInPeriode(periode: Periode): Array<{ jaar: number; kwartaal: number }> {
  const begin = kwartaalVan(periode.start);
  const einde = kwartaalVan(periode.eind);

  const reeks: Array<{ jaar: number; kwartaal: number }> = [];
  let { jaar, kwartaal } = begin;
  while (jaar < einde.jaar || (jaar === einde.jaar && kwartaal <= einde.kwartaal)) {
    reeks.push({ jaar, kwartaal });
    kwartaal += 1;
    if (kwartaal > 4) {
      kwartaal = 1;
      jaar += 1;
    }
  }
  return reeks;
}

export interface TariefStatus {
  jaar: number;
  kwartaal: number;
  label: string;
  tarief: Tarief | null;
  bevestigd: boolean;
}

/** Voor elk kwartaal in de periode: is er een bevestigd tarief? */
export async function tariefStatusVoorPeriode(
  periode: Periode,
  regio: string,
): Promise<TariefStatus[]> {
  const tarieven = await leesTarieven(regio);

  return kwartalenInPeriode(periode).map(({ jaar, kwartaal }) => {
    const kwartaalStart = kwartaalPeriode(jaar, kwartaal).start;
    const gevonden = tarieven.find((tarief) => tarief.period_start === kwartaalStart) ?? null;
    return {
      jaar,
      kwartaal,
      label: `Q${kwartaal} ${jaar}`,
      tarief: gevonden,
      bevestigd: Boolean(gevonden?.confirmed_at),
    };
  });
}

export interface TariefInvoer {
  regio: string;
  jaar: number;
  kwartaal: number;
  eur_per_kwh: number;
  includes_vat: boolean;
  vat_rate: number;
  source: "manual" | "auto";
  source_url?: string | null;
  note?: string | null;
  /** Handmatige invoer is meteen bevestigd; een automatische vondst niet. */
  bevestigd: boolean;
}

export async function bewaarTarief(invoer: TariefInvoer): Promise<Tarief> {
  const periode = kwartaalPeriode(invoer.jaar, invoer.kwartaal);

  const { data, error } = await db()
    .from("tariffs")
    .upsert(
      {
        region: invoer.regio,
        period_start: periode.start,
        period_end: periode.eind,
        eur_per_kwh: invoer.eur_per_kwh,
        includes_vat: invoer.includes_vat,
        vat_rate: invoer.vat_rate,
        source: invoer.source,
        source_url: invoer.source_url ?? null,
        note: invoer.note ?? null,
        confirmed_at: invoer.bevestigd ? new Date().toISOString() : null,
      },
      { onConflict: "region,period_start" },
    )
    .select()
    .single();

  if (error) throw new Error(`Tarief bewaren mislukt: ${error.message}`);
  return data as Tarief;
}

export async function bevestigTarief(id: string): Promise<void> {
  const { error } = await db()
    .from("tariffs")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Tarief bevestigen mislukt: ${error.message}`);
}

export interface AutomatischResultaat {
  melding: string;
  tarief: Tarief | null;
  kandidaten: Array<{ eur_per_kwh: number; fragment: string; score: number }>;
}

/**
 * Probeer het tarief van een kwartaal automatisch op te halen.
 *
 * Een gevonden bedrag wordt bewaard als 'auto' en onbevestigd: het verschijnt
 * in de app met de gevonden zin erbij en één knop om te bevestigen. Een
 * bestaand bevestigd tarief wordt nooit overschreven.
 */
export async function probeerAutomatischTarief(
  regio: string,
  jaar: number,
  kwartaal: number,
): Promise<AutomatischResultaat> {
  const bestaande = await leesTarieven(regio);
  const kwartaalStart = kwartaalPeriode(jaar, kwartaal).start;
  const alAanwezig = bestaande.find((tarief) => tarief.period_start === kwartaalStart);

  if (alAanwezig?.confirmed_at) {
    return {
      melding: `Er staat al een bevestigd tarief voor Q${kwartaal} ${jaar}; dat blijft ongewijzigd.`,
      tarief: alAanwezig,
      kandidaten: [],
    };
  }

  const instellingen = await leesInstellingen();
  const resultaat = await haalTariefOp(instellingen.tarief_bron_url, regio as Regio, {
    jaar,
    kwartaal,
  });

  if (!resultaat.gelukt || resultaat.kandidaten.length === 0) {
    return { melding: resultaat.melding, tarief: null, kandidaten: [] };
  }

  const beste = resultaat.kandidaten[0];
  const tarief = await bewaarTarief({
    regio,
    jaar,
    kwartaal,
    eur_per_kwh: beste.eur_per_kwh,
    // De gepubliceerde maximumprijs is een consumententarief, dus inclusief
    // btw. Je kan dat per tarief omzetten als jouw situatie anders is.
    includes_vat: alAanwezig?.includes_vat ?? true,
    vat_rate: alAanwezig?.vat_rate ?? 0.06,
    source: "auto",
    source_url: resultaat.bron_url,
    note: beste.fragment,
    bevestigd: false,
  });

  return { melding: resultaat.melding, tarief, kandidaten: resultaat.kandidaten };
}
