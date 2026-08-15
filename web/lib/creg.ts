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
  let html: string;
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
    html = await antwoord.text();
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

  const kandidaten = zoekTariefKandidaten(htmlNaarTekst(html), regio, kwartaalHint);
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
