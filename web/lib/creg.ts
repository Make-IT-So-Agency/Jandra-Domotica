/**
 * Zoekt het maximumtarief per kWh voor terugbetaling van thuisladen.
 *
 * Belangrijk: er bestaat geen officiële API voor dit cijfer. De overheid
 * publiceert het als tekst op een webpagina, en die pagina kan van vorm of
 * adres veranderen. Deze module doet dus een gefundeerde gok en levert altijd
 * de gevonden zin mee, zodat je in de app in één oogopslag ziet of het klopt
 * voor je het bevestigt. Zonder bevestiging wordt er geen rapport gemaakt.
 */

export type Regio = "vlaanderen" | "brussel" | "wallonie";

const REGIO_WOORDEN: Record<Regio, string[]> = {
  vlaanderen: ["vlaams", "vlaanderen", "flamand", "flemish"],
  brussel: ["brussel", "bruxell", "brussels"],
  wallonie: ["waals", "wallon", "walloon"],
};

/** Buiten deze grenzen is het cijfer bijna zeker geen €/kWh-tarief. */
const MIN_EUR_PER_KWH = 0.05;
const MAX_EUR_PER_KWH = 1.5;

export interface TariefKandidaat {
  eur_per_kwh: number;
  /** De zin waarin het bedrag gevonden is, om na te lezen in de app. */
  fragment: string;
  /** Hoger is betrouwbaarder: regio én kwartaal in dezelfde zin gevonden. */
  score: number;
}

/** Haalt de leesbare tekst uit een HTML-pagina. */
export function htmlNaarTekst(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&euro;/gi, "€")
    .replace(/&#8364;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}

/** Manieren waarop een kwartaal geschreven kan staan, in het Nederlands. */
function kwartaalWoorden(kwartaal: number): string[] {
  const rangtelwoord = ["eerste", "tweede", "derde", "vierde"][kwartaal - 1];
  return [
    `q${kwartaal}`,
    `kwartaal ${kwartaal}`,
    `${kwartaal}e kwartaal`,
    `${kwartaal}de kwartaal`,
    `${kwartaal}ste kwartaal`,
    `${rangtelwoord} kwartaal`,
  ];
}

function naarGetal(tekst: string): number | null {
  // Belgische notatie: komma als decimaalteken, punt als duizendtal.
  const genormaliseerd = tekst.replace(/\./g, "").replace(",", ".");
  const waarde = Number.parseFloat(genormaliseerd);
  return Number.isFinite(waarde) ? waarde : null;
}

/** Hoe de gewesten in de kopregel van het CREG-bestand heten. */
const REGIO_CSV_WOORD: Record<Regio, string> = {
  vlaanderen: "flanders",
  brussel: "brussels",
  wallonie: "wallonia",
};

export interface CsvResultaat {
  /** Null als het bestand klopt maar dit kwartaal er nog niet in staat. */
  kandidaat: TariefKandidaat | null;
  /** De rij waar het bedrag hoort te staan, om dat te kunnen melden. */
  gezocht: { jaar: number; maand: number };
}

/**
 * De rij waaruit het kwartaalbedrag komt.
 *
 * CREG vult de kolom "Average 3 months (M-2 to M-4)" enkel in op de eerste
 * maand van een kwartaal, en dat gemiddelde geldt voor het kwartaal dáárna.
 * Nagegaan tegen de tabel op de CREG-pagina zelf: rij 2026;4 geeft 32,22 en dat
 * noemt CREG Q3/2026; rij 2026;7 geeft 32,25 voor Q4/2026; rij 2024;10 geeft
 * 28,22 voor Q1/2025.
 */
function bronrij(jaar: number, kwartaal: number): { jaar: number; maand: number } {
  const vorige = kwartaal === 1 ? 4 : kwartaal - 1;
  return {
    jaar: kwartaal === 1 ? jaar - 1 : jaar,
    maand: (vorige - 1) * 3 + 1,
  };
}

/**
 * Leest het kwartaalbedrag uit het CSV-bestand dat CREG publiceert.
 *
 * Geeft null als dit geen CREG-bestand blijkt; dan valt de aanroeper terug op
 * het raden in gewone tekst. Dat onderscheid is opzettelijk: een verkeerd
 * gelezen bestand is erger dan een eerlijke "niet gevonden".
 */
export function leesCregCsv(
  csv: string,
  regio: Regio,
  periode: { jaar: number; kwartaal: number },
): CsvResultaat | null {
  // Het bestand begint met een byte order mark.
  const regels = csv.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim() !== "");
  if (regels.length < 2) return null;

  const koppen = regels[0].split(";").map((k) => k.trim().toLowerCase());
  if (!koppen[0]?.startsWith("year") || !koppen[1]?.startsWith("month")) return null;

  const woord = REGIO_CSV_WOORD[regio];
  const kolom = koppen.findIndex((kop) => kop.includes(woord) && kop.includes("average"));
  if (kolom === -1) return null;

  const gezocht = bronrij(periode.jaar, periode.kwartaal);

  for (const regel of regels.slice(1)) {
    const velden = regel.split(";").map((v) => v.trim());
    if (Number(velden[0]) !== gezocht.jaar || Number(velden[1]) !== gezocht.maand) continue;

    const cent = naarGetal(velden[kolom] ?? "");
    if (cent === null) break;

    const bedrag = cent / 100;
    if (bedrag < MIN_EUR_PER_KWH || bedrag > MAX_EUR_PER_KWH) break;

    return {
      gezocht,
      kandidaat: {
        eur_per_kwh: Math.round(bedrag * 100000) / 100000,
        fragment:
          `CREG-bestand, rij ${gezocht.jaar}-${String(gezocht.maand).padStart(2, "0")}, ` +
          `kolom "${regels[0].split(";")[kolom]?.trim()}": ${velden[kolom]} c€/kWh`,
        // Jaar, maand en gewest komen alle drie uit het bestand zelf; hier valt
        // niets te raden, dus dit is de hoogste zekerheid die we uitdrukken.
        score: 3,
      },
    };
  }

  return { kandidaat: null, gezocht };
}

/**
 * Zoek bedragen per kWh in de tekst en beoordeel hoe waarschijnlijk ze zijn.
 *
 * @param kwartaalHint bv. "Q3 2026" of "2026" om de juiste periode te herkennen
 */
export function zoekTariefKandidaten(
  tekst: string,
  regio: Regio,
  kwartaalHint?: { jaar: number; kwartaal: number },
): TariefKandidaat[] {
  // Bewust niet splitsen op een dubbele punt: publicaties schrijven het cijfer
  // net vaak als "Vlaams Gewest: 28,22 c€/kWh", en dan hoort de regionaam bij
  // het bedrag te blijven staan.
  const zinnen = tekst.split(/(?<=[.;!?])\s+|\s{2,}/);
  const regioWoorden = REGIO_WOORDEN[regio];
  const kandidaten: TariefKandidaat[] = [];

  const patroon =
    /(\d{1,3}(?:[.,]\d{1,5})?)\s*(eurocent|c€|cent|€|euro|eur)?\s*(?:\/|per\s+)\s*kwh/gi;

  for (const zin of zinnen) {
    const kleineZin = zin.toLowerCase();
    const heeftRegio = regioWoorden.some((woord) => kleineZin.includes(woord));

    let heeftKwartaal = false;
    if (kwartaalHint) {
      const { jaar, kwartaal } = kwartaalHint;
      heeftKwartaal =
        kleineZin.includes(String(jaar)) &&
        kwartaalWoorden(kwartaal).some((woord) => kleineZin.includes(woord));
    }

    for (const treffer of kleineZin.matchAll(patroon)) {
      const ruw = naarGetal(treffer[1]);
      if (ruw === null) continue;

      const eenheid = (treffer[2] ?? "").toLowerCase();
      const isCent =
        eenheid.includes("cent") || eenheid === "c€" || (!eenheid && ruw > MAX_EUR_PER_KWH);
      const bedrag = isCent ? ruw / 100 : ruw;

      if (bedrag < MIN_EUR_PER_KWH || bedrag > MAX_EUR_PER_KWH) continue;

      kandidaten.push({
        eur_per_kwh: Math.round(bedrag * 100000) / 100000,
        fragment: zin.trim().slice(0, 300),
        score: (heeftRegio ? 2 : 0) + (heeftKwartaal ? 1 : 0),
      });
    }
  }

  // Beste eerst, en dubbels met hetzelfde bedrag maar een lagere score weg.
  kandidaten.sort((a, b) => b.score - a.score);
  const gezien = new Set<number>();
  return kandidaten.filter((kandidaat) => {
    if (gezien.has(kandidaat.eur_per_kwh)) return false;
    gezien.add(kandidaat.eur_per_kwh);
    return true;
  });
}

export interface OphaalResultaat {
  gelukt: boolean;
  kandidaten: TariefKandidaat[];
  bron_url: string;
  melding: string;
}

export async function haalTariefOp(
  bronUrl: string,
  regio: Regio,
  kwartaalHint: { jaar: number; kwartaal: number },
  fetchImpl: typeof fetch = fetch,
): Promise<OphaalResultaat> {
  let inhoud: string;
  try {
    const antwoord = await fetchImpl(bronUrl, {
      headers: { "User-Agent": "laadkosten-rapportage/1.0" },
      // De bron verandert hooguit per kwartaal; een dag cache volstaat ruim.
      next: { revalidate: 86400 },
    } as RequestInit);

    if (!antwoord.ok) {
      return {
        gelukt: false,
        kandidaten: [],
        bron_url: bronUrl,
        melding: `De bronpagina gaf statuscode ${antwoord.status}. Vul het tarief handmatig in.`,
      };
    }
    inhoud = await antwoord.text();
  } catch (fout) {
    return {
      gelukt: false,
      kandidaten: [],
      bron_url: bronUrl,
      melding: `De bronpagina is niet bereikbaar (${
        fout instanceof Error ? fout.message : "onbekende fout"
      }). Vul het tarief handmatig in.`,
    };
  }

  // Is dit het CSV-bestand van CREG, dan valt er niets te raden: jaar, maand en
  // gewest staan er met naam in. Enkel als het dat níet is, vallen we terug op
  // het zoeken in gewone tekst.
  const csv = leesCregCsv(inhoud, regio, kwartaalHint);
  if (csv) {
    if (csv.kandidaat) {
      return {
        gelukt: true,
        kandidaten: [csv.kandidaat],
        bron_url: bronUrl,
        melding:
          "Bedrag uit het CREG-bestand, voor dit gewest en dit kwartaal. " +
          "Kijk het even na en bevestig.",
      };
    }
    const maand = `${csv.gezocht.jaar}-${String(csv.gezocht.maand).padStart(2, "0")}`;
    return {
      gelukt: false,
      kandidaten: [],
      bron_url: bronUrl,
      melding:
        `Het CREG-bestand heeft nog geen cijfer voor dit kwartaal; dat hoort in de rij ${maand} ` +
        "te komen. CREG publiceert het bij de start van het vorige kwartaal. " +
        "Vul het tarief handmatig in.",
    };
  }

  const kandidaten = zoekTariefKandidaten(htmlNaarTekst(inhoud), regio, kwartaalHint);
  if (kandidaten.length === 0) {
    return {
      gelukt: false,
      kandidaten: [],
      bron_url: bronUrl,
      melding:
        "Op de bronpagina stond geen herkenbaar bedrag per kWh. Vul het tarief handmatig in.",
    };
  }

  return {
    gelukt: true,
    kandidaten,
    bron_url: bronUrl,
    melding:
      kandidaten[0].score >= 3
        ? "Bedrag gevonden voor de juiste regio en het juiste kwartaal. Kijk het even na en bevestig."
        : "Bedrag gevonden, maar niet met zekerheid voor deze regio en dit kwartaal. Kijk het na voor je bevestigt.",
  };
}
