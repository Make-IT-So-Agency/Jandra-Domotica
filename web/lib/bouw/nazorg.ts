import { dagenTekst, dagenTussen, korteDatum, plusMaanden } from "./kalender";

/**
 * Het woningdossier en de nazorg: welke documenten bij het huis horen, tot
 * wanneer een garantie loopt, en wanneer een onderhoud opnieuw moet. Puur,
 * voor de server, de browser en de tests.
 *
 * De lijsten horen bij supabase/migrations/20261003000000_bouw_dossier.sql.
 */

export const SOORTEN_DOCUMENT = ["as_built", "arei", "epb", "pid", "vergunning", "attest", "handleiding", "garantie", "andere"] as const;
export type SoortDocument = (typeof SOORTEN_DOCUMENT)[number];

export const DOCUMENTNAMEN: Record<SoortDocument, string> = {
  as_built: "As-built-plannen",
  arei: "Elektriciteit: AREI-keuring en schema's",
  epb: "EPB-aangifte en energieprestatie",
  pid: "Postinterventiedossier",
  vergunning: "Vergunning en wat de gemeente stuurde",
  attest: "Andere attesten en keuringen",
  handleiding: "Handleidingen",
  garantie: "Garantiebewijzen",
  andere: "Andere",
};

/** Wat er in elk soort zit, voor wie het dossier pas opent. */
export const DOCUMENTUITLEG: Partial<Record<SoortDocument, string>> = {
  as_built: "de plannen zoals er echt gebouwd is",
  arei: "het keuringsverslag, het eendraadschema en het situatieschema",
  pid: "wat wie later aan het huis werkt moet weten: leidingen, materialen, gevaren",
};

export function isSoortDocument(waarde: string): waarde is SoortDocument {
  return (SOORTEN_DOCUMENT as readonly string[]).includes(waarde);
}

export interface Dossierdocument {
  id: number;
  bestand_id: number;
  soort: SoortDocument;
  titel: string;
  partij_id: number | null;
  datum: string | null;
  opmerking: string | null;
  door: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Garanties
// ---------------------------------------------------------------------------

export interface Garantie {
  id: number;
  wat: string;
  partij_id: number | null;
  begin: string;
  duur_maanden: number;
  document_id: number | null;
  opmerking: string | null;
}

/** Gangbare looptijden, om te kiezen bij een nieuwe garantie. */
export const GARANTIEDUREN: readonly { maanden: number; naam: string }[] = [
  { maanden: 24, naam: "2 jaar (wettelijke garantie op een product)" },
  { maanden: 60, naam: "5 jaar" },
  { maanden: 120, naam: "10 jaar (tienjarige aansprakelijkheid voor de ruwbouw)" },
];

export function eindeVan(garantie: Pick<Garantie, "begin" | "duur_maanden">): string {
  return plusMaanden(garantie.begin, garantie.duur_maanden);
}

/** Hoe lang op voorhand een garantie die afloopt opvalt. */
export const GARANTIE_LET_OP_DAGEN = 90;

export function garantiestand(
  garantie: Pick<Garantie, "begin" | "duur_maanden">,
  vandaag: string,
): { einde: string; dagen: number; stand: "loopt" | "vervalt" | "vervallen" } {
  const einde = eindeVan(garantie);
  const dagen = dagenTussen(vandaag, einde);
  return { einde, dagen, stand: dagen < 0 ? "vervallen" : dagen <= GARANTIE_LET_OP_DAGEN ? "vervalt" : "loopt" };
}

// ---------------------------------------------------------------------------
// Onderhoud
// ---------------------------------------------------------------------------

export interface Onderhoud {
  id: number;
  wat: string;
  interval_maanden: number;
  laatst_gedaan: string | null;
  partij_id: number | null;
  opmerking: string | null;
}

/** Wat nog nooit gebeurde, moet nu. */
export function volgendeBeurt(onderhoud: Pick<Onderhoud, "interval_maanden" | "laatst_gedaan">, vandaag: string): string {
  return onderhoud.laatst_gedaan ? plusMaanden(onderhoud.laatst_gedaan, onderhoud.interval_maanden) : vandaag;
}

export function onderhoudsstand(
  onderhoud: Pick<Onderhoud, "interval_maanden" | "laatst_gedaan">,
  vandaag: string,
): { volgende: string; dagen: number; stand: "te_laat" | "binnenkort" | "later" } {
  const volgende = volgendeBeurt(onderhoud, vandaag);
  const dagen = dagenTussen(vandaag, volgende);
  return { volgende, dagen, stand: dagen < 0 ? "te_laat" : dagen <= 30 ? "binnenkort" : "later" };
}

/** "elke maand", "elk half jaar", "elk jaar", "om de 2 jaar", "om de 3 maanden". */
export function intervalTekst(maanden: number): string {
  if (maanden === 1) return "elke maand";
  if (maanden === 6) return "elk half jaar";
  if (maanden === 12) return "elk jaar";
  if (maanden % 12 === 0) return `om de ${maanden / 12} jaar`;
  return `om de ${maanden} maanden`;
}

/** Het gewone onderhoud van een nieuwbouw, om mee te beginnen. Wat je niet hebt, verwijder je. */
export const STANDAARDONDERHOUD: readonly { wat: string; interval_maanden: number }[] = [
  { wat: "Filters van de ventilatie vervangen", interval_maanden: 6 },
  { wat: "Ventilatie: onderhoud van het toestel", interval_maanden: 12 },
  { wat: "Warmtepomp: onderhoud", interval_maanden: 12 },
  { wat: "Rookmelders testen", interval_maanden: 6 },
  { wat: "Dakgoten en afvoeren reinigen", interval_maanden: 12 },
  { wat: "Regenwaterput en filter nakijken", interval_maanden: 12 },
  { wat: "Sifons reinigen", interval_maanden: 6 },
  { wat: "Siliconevoegen in badkamer en keuken nakijken", interval_maanden: 12 },
  { wat: "Ramen en deuren: scharnieren smeren, dichtingen nakijken", interval_maanden: 12 },
  { wat: "Zonnepanelen en omvormer nakijken", interval_maanden: 12 },
];

/**
 * Voor "nog te doen" op het overzicht en bij /taken: het onderhoud dat al
 * eens gebeurde en de garanties, met het aantal dagen tot ze aan de beurt
 * zijn of aflopen.
 */
export function nazorgstand(onderhoud: readonly Onderhoud[], garanties: readonly Garantie[], vandaag: string) {
  return {
    onderhoud: onderhoud.flatMap((item) =>
      item.laatst_gedaan ? [{ onderhoudId: item.id, wat: item.wat, dagen: onderhoudsstand(item, vandaag).dagen }] : [],
    ),
    garanties: garanties.map((garantie) => ({ garantieId: garantie.id, wat: garantie.wat, dagen: garantiestand(garantie, vandaag).dagen })),
  };
}

// ---------------------------------------------------------------------------
// Herinneringen voor de bot
// ---------------------------------------------------------------------------

/** Een week vooraf en op de dag zelf; wat te laat is, elke maand opnieuw. */
export const ONDERHOUD_HERINNEREN_OP = [7, 0];
/** Twee maanden, een maand en een week voor een garantie afloopt. */
export const GARANTIE_HERINNEREN_OP = [60, 30, 7];

export function nazorgherinneringen(
  onderhoud: readonly Onderhoud[],
  garanties: readonly Garantie[],
  partijnaam: (partijId: number | null) => string | null,
  vandaag: string,
): { sleutel: string; tekst: string; pad: string }[] {
  const uit: { sleutel: string; tekst: string; pad: string }[] = [];
  for (const item of onderhoud) {
    // Wat nog nooit gebeurde, heeft geen datum om aan te herinneren: dat
    // staat bij "nog te doen" in de app.
    if (!item.laatst_gedaan) continue;
    const { volgende, dagen } = onderhoudsstand(item, vandaag);
    const telaat = dagen < 0 && -dagen % 30 === 0;
    if (!ONDERHOUD_HERINNEREN_OP.includes(dagen) && !telaat) continue;
    const wie = partijnaam(item.partij_id);
    uit.push({
      sleutel: `onderhoud:${item.id}:${volgende}:${dagen}`,
      tekst:
        dagen < 0
          ? `🧰 ${item.wat}${wie ? ` (${wie})` : ""} moest ${korteDatum(volgende, vandaag)} gebeuren, ${dagenTekst(dagen)}.`
          : dagen === 0
            ? `🧰 Vandaag: ${item.wat}${wie ? ` (${wie})` : ""}.`
            : `🧰 ${item.wat}${wie ? ` (${wie})` : ""}: ${dagenTekst(dagen)} (${korteDatum(volgende, vandaag)}).`,
      pad: "/bouw/dossier/onderhoud",
    });
  }
  for (const garantie of garanties) {
    const { einde, dagen } = garantiestand(garantie, vandaag);
    if (!GARANTIE_HERINNEREN_OP.includes(dagen)) continue;
    const wie = partijnaam(garantie.partij_id);
    uit.push({
      sleutel: `garantie:${garantie.id}:${einde}:${dagen}`,
      tekst: `🛡️ De garantie op ${garantie.wat}${wie ? ` (${wie})` : ""} loopt af ${dagenTekst(dagen)} (${korteDatum(einde, vandaag)}). Is er nog iets te melden?`,
      pad: "/bouw/dossier/garanties",
    });
  }
  return uit;
}
