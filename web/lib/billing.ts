/**
 * Berekent wat een laadsessie kost volgens het geldende kwartaaltarief.
 *
 * Afronding gebeurt bewust per regel op de eurocent. Zo telt de kolom in het
 * rapport exact op tot het eindtotaal, wat een boekhouder verwacht van een
 * document waarop terugbetaald wordt.
 */

import type { Laadsessie, RapportRegel, RapportTotalen, Tarief } from "./types";

export function afrondenCent(bedrag: number): number {
  // Een bedrag als 1,005 wordt binair opgeslagen als 1,00499999999999989. Zou
  // je dat rechtstreeks afronden, dan kreeg je 1,00 in plaats van 1,01. We
  // schrapen die ruis er eerst af en ronden pas daarna af op de cent.
  const gecorrigeerd = Math.round(bedrag * 100 * 1e8) / 1e8;
  return Math.round(gecorrigeerd) / 100;
}

/**
 * Hoeveel van een sessie uit de zon kwam, in kWh.
 *
 * evcc houdt dat aandeel bij als percentage. Een percentage zegt weinig zonder
 * de omvang erbij: 90 % van een halve kWh is minder zon dan 30 % van honderd.
 * Geeft null zodra een van beide ontbreekt, want dan valt er niets te zeggen.
 */
export function zonneKwh(
  energieKwh: number | null | undefined,
  zonPercentage: number | null | undefined,
): number | null {
  if (energieKwh === null || energieKwh === undefined) return null;
  if (zonPercentage === null || zonPercentage === undefined) return null;

  const energie = Number(energieKwh);
  const aandeel = Number(zonPercentage);
  if (!Number.isFinite(energie) || !Number.isFinite(aandeel)) return null;

  // Drie cijfers na de komma, net als de kWh-kolommen in de databank.
  return Math.round((energie * aandeel) / 100 * 1000) / 1000;
}

export interface KwhVerdeling {
  /** Van het net gehaald. */
  net: number | null;
  /** Van de eigen zonnepanelen. */
  zon: number | null;
  totaal: number | null;
}

/**
 * Splits het verbruik van een sessie in net en zon.
 *
 * Het net wordt afgeleid en niet apart gemeten: het is wat overblijft. Daarom
 * wordt zon eerst afgerond en het net daarna als verschil berekend, zodat de
 * drie kolommen altijd exact optellen. Andersom -- allebei apart afronden --
 * kan een kolom opleveren die er een honderdste naast zit.
 */
export function verdeelKwh(
  energieKwh: number | null | undefined,
  zonPercentage: number | null | undefined,
): KwhVerdeling {
  const energie = Number(energieKwh);
  if (energieKwh === null || energieKwh === undefined || !Number.isFinite(energie)) {
    return { net: null, zon: null, totaal: null };
  }

  const totaal = Math.round(energie * 1000) / 1000;
  const zon = zonneKwh(energieKwh, zonPercentage);
  if (zon === null) {
    // Zonder percentage weten we niet wat er van het net kwam. Het totaal
    // tonen we wel; gokken doen we niet.
    return { net: null, zon: null, totaal };
  }

  return { net: Math.round((totaal - zon) * 1000) / 1000, zon, totaal };
}

export interface SessieKost {
  kwh: number;
  tarief_per_kwh: number;
  btw_percentage: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  bedrag_incl_btw: number;
}

/**
 * Reken één sessie door.
 *
 * Het CREG-bedrag is een maximum per kWh. Of dat bedrag btw bevat, verschilt
 * en staat daarom per tarief opgeslagen in plaats van vast in de code.
 */
export function berekenSessieKost(kwh: number, tarief: Tarief): SessieKost {
  if (!Number.isFinite(kwh) || kwh < 0) {
    throw new Error(`Ongeldig aantal kWh: ${kwh}`);
  }
  const btwVoet = Number(tarief.vat_rate);
  const prijs = Number(tarief.eur_per_kwh);

  let exclBtw: number;
  let inclBtw: number;

  if (tarief.includes_vat) {
    inclBtw = afrondenCent(kwh * prijs);
    exclBtw = afrondenCent(inclBtw / (1 + btwVoet));
  } else {
    exclBtw = afrondenCent(kwh * prijs);
    inclBtw = afrondenCent(exclBtw * (1 + btwVoet));
  }

  return {
    kwh,
    tarief_per_kwh: prijs,
    btw_percentage: btwVoet,
    bedrag_excl_btw: exclBtw,
    // Het btw-bedrag is het verschil, nooit een eigen afronding. Anders klopt
    // "excl + btw = incl" niet meer op de regel.
    btw_bedrag: afrondenCent(inclBtw - exclBtw),
    bedrag_incl_btw: inclBtw,
  };
}

/** Zoek het tarief dat geldt op het moment van de sessie. */
export function tariefVoorDatum(
  tarieven: Tarief[],
  datum: string,
  regio: string,
): Tarief | null {
  const dag = datum.slice(0, 10);
  return (
    tarieven.find(
      (tarief) =>
        tarief.region === regio &&
        tarief.period_start <= dag &&
        tarief.period_end >= dag,
    ) ?? null
  );
}

export interface DoorrekenResultaat {
  regels: RapportRegel[];
  totalen: RapportTotalen;
  /** Sessies die niet doorgerekend konden worden, met de reden erbij. */
  overgeslagen: Array<{ sessie: Laadsessie; reden: string }>;
  /** De tarieven die effectief gebruikt zijn, voor de momentopname. */
  gebruikteTarieven: Tarief[];
}

export interface DoorrekenContext {
  tarieven: Tarief[];
  /** Regio per laadpaalnaam, in kleine letters. */
  regioPerLaadpaal: Map<string, string>;
}

export function rekenSessiesDoor(
  sessies: Laadsessie[],
  context: DoorrekenContext,
): DoorrekenResultaat {
  const regels: RapportRegel[] = [];
  const overgeslagen: DoorrekenResultaat["overgeslagen"] = [];
  const gebruikt = new Map<string, Tarief>();

  for (const sessie of sessies) {
    const referentie = sessie.finished_at ?? sessie.started_at;

    if (!sessie.is_complete || referentie === null) {
      overgeslagen.push({ sessie, reden: "sessie is nog niet afgerond" });
      continue;
    }
    const kwh = Number(sessie.energy_kwh);
    if (!Number.isFinite(kwh) || kwh <= 0) {
      overgeslagen.push({ sessie, reden: "geen geldig verbruik geregistreerd" });
      continue;
    }

    const laadpaal = sessie.loadpoint_name ?? "";
    const regio = context.regioPerLaadpaal.get(laadpaal.toLowerCase()) ?? "vlaanderen";
    const tarief = tariefVoorDatum(context.tarieven, referentie, regio);
    if (!tarief) {
      overgeslagen.push({
        sessie,
        reden: `geen tarief gekend voor ${referentie.slice(0, 10)} (${regio})`,
      });
      continue;
    }

    const kost = berekenSessieKost(kwh, tarief);
    gebruikt.set(tarief.id, tarief);
    regels.push({
      sessie_id: sessie.id,
      external_id: sessie.external_id,
      laadpaal: laadpaal || "onbekend",
      gestart: sessie.started_at,
      gestopt: sessie.finished_at,
      kwh,
      tarief_per_kwh: kost.tarief_per_kwh,
      bedrag_excl_btw: kost.bedrag_excl_btw,
      btw_bedrag: kost.btw_bedrag,
      bedrag_incl_btw: kost.bedrag_incl_btw,
      btw_percentage: kost.btw_percentage,
    });
  }

  regels.sort((a, b) => (a.gestart ?? "").localeCompare(b.gestart ?? ""));

  const totalen = regels.reduce<RapportTotalen>(
    (som, regel) => ({
      aantal_sessies: som.aantal_sessies + 1,
      kwh: som.kwh + regel.kwh,
      excl_btw: som.excl_btw + regel.bedrag_excl_btw,
      btw: som.btw + regel.btw_bedrag,
      incl_btw: som.incl_btw + regel.bedrag_incl_btw,
    }),
    { aantal_sessies: 0, kwh: 0, excl_btw: 0, btw: 0, incl_btw: 0 },
  );

  return {
    regels,
    totalen: {
      aantal_sessies: totalen.aantal_sessies,
      kwh: Math.round(totalen.kwh * 1000) / 1000,
      excl_btw: afrondenCent(totalen.excl_btw),
      btw: afrondenCent(totalen.btw),
      incl_btw: afrondenCent(totalen.incl_btw),
    },
    overgeslagen,
    gebruikteTarieven: [...gebruikt.values()].sort((a, b) =>
      a.period_start.localeCompare(b.period_start),
    ),
  };
}
