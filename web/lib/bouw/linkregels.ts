import type { SoortPartij } from "./types";

/**
 * De regels van een persoonlijke link voor een partij: welke rechten er zijn,
 * welke een architect of aannemer standaard krijgt, en of een link nog werkt.
 * Puur, voor de server, de browser en de tests. De rechten horen bij de
 * check-constraint in supabase/migrations/20261002500000_bouw_links.sql.
 */

export const RECHTEN_LINK = ["plannen", "inzenden", "keuzes", "planning", "wensenlijst"] as const;

export type RechtLink = (typeof RECHTEN_LINK)[number];

export const RECHTNAMEN: Record<RechtLink, string> = {
  plannen: "De plannen bekijken en downloaden",
  inzenden: "Een dossier of plan insturen",
  keuzes: "De keuzes en beslissingen lezen, zonder prijzen",
  planning: "De planning lezen",
  wensenlijst: "De wensenlijst voor de elektricien lezen",
};

export function isRechtLink(waarde: string): waarde is RechtLink {
  return (RECHTEN_LINK as readonly string[]).includes(waarde);
}

/** Wat een partij van deze soort standaard krijgt. Aan te passen bij het maken. */
export function standaardRechten(soort: SoortPartij): RechtLink[] {
  switch (soort) {
    case "architect":
      return ["plannen", "inzenden", "keuzes", "planning"];
    case "aannemer":
      return ["plannen", "planning"];
    default:
      return ["plannen"];
  }
}

/** Een half jaar, tenzij anders gekozen; nooit langer dan twee jaar. */
export const STANDAARD_GELDIG_DAGEN = 182;
export const MAX_GELDIG_DAGEN = 731;

/** Zoveel bestanden mag één link per etmaal insturen: genoeg voor een dossier, te weinig om de opslag te vullen. */
export const MAX_INZENDINGEN_PER_DAG = 20;

/** Een token: 32 willekeurige bytes in base64url, dus 43 tekens. */
export const TOKENVORM = /^[A-Za-z0-9_-]{43}$/;

export interface Linkstand {
  vervalt_op: string;
  ingetrokken_op: string | null;
}

export function standVanLink(link: Linkstand, nu: Date): "actief" | "verlopen" | "ingetrokken" {
  if (link.ingetrokken_op) return "ingetrokken";
  return new Date(link.vervalt_op).getTime() > nu.getTime() ? "actief" : "verlopen";
}

/** De gekozen rechten, zonder dubbels of onbekende, in een vaste volgorde. */
export function schoneRechten(waarden: unknown[]): RechtLink[] {
  const gekozen = new Set(waarden.map(String));
  return RECHTEN_LINK.filter((recht) => gekozen.has(recht));
}
