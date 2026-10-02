import { bedrag, datum, tekst } from "./invoer";
import type { SoortPartij } from "./types";

/**
 * De regels van een persoonlijke link voor een partij: welke rechten er zijn,
 * welke een architect of aannemer standaard krijgt, en of een link nog werkt.
 * Puur, voor de server, de browser en de tests. De rechten horen bij de
 * check-constraint in supabase/migrations/20261002202508_bouw_werf.sql.
 */

export const RECHTEN_LINK = ["plannen", "inzenden", "offertes", "facturen", "oplevering", "keuzes", "planning", "wensenlijst"] as const;

export type RechtLink = (typeof RECHTEN_LINK)[number];

export const RECHTNAMEN: Record<RechtLink, string> = {
  plannen: "De plannen bekijken en downloaden",
  inzenden: "Een dossier of plan insturen",
  offertes: "Een offerte insturen",
  facturen: "Een factuur insturen",
  oplevering: "De eigen opleverpunten zien en melden wat hersteld is",
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
      return ["plannen", "inzenden", "facturen", "keuzes", "planning"];
    case "aannemer":
      return ["plannen", "offertes", "facturen", "oplevering", "planning"];
    case "leverancier":
    case "adviseur":
      return ["plannen", "offertes", "facturen"];
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

// ---------------------------------------------------------------------------
// Wat een partij instuurt
// ---------------------------------------------------------------------------

/** Een plan of dossier komt bij Plannen; een offerte of factuur bij Geld. */
export const SOORTEN_INZENDING = ["plan", "offerte", "factuur"] as const;

export type SoortInzending = (typeof SOORTEN_INZENDING)[number];

export function isSoortInzending(waarde: string): waarde is SoortInzending {
  return (SOORTEN_INZENDING as readonly string[]).includes(waarde);
}

/** Het recht dat een link nodig heeft om dit in te sturen. */
export const RECHT_VOOR_INZENDING: Record<SoortInzending, RechtLink> = {
  plan: "inzenden",
  offerte: "offertes",
  factuur: "facturen",
};

/** Als welk soort bestand het binnenkomt: een plan tot 50 MB, een offerte of factuur tot 20 MB. */
export const DOEL_VOOR_INZENDING: Record<SoortInzending, "plan" | "document"> = {
  plan: "plan",
  offerte: "document",
  factuur: "document",
};

/** Wat een partij bij een offerte of factuur intikt, nog als tekst. */
export interface Geldvelden {
  bedrag?: string;
  nummer?: string;
  datum?: string;
  vervaldag?: string;
}

export interface Inzendgegevens {
  bedrag: number | null;
  nummer: string | null;
  datum: string | null;
  vervaldag: string | null;
}

export type Geldcontrole = { ok: true; waarde: Inzendgegevens } | { ok: false; melding: string };

/**
 * Kijkt na wat een partij bij een offerte of factuur intikt. Een offerte
 * heeft een bedrag nodig; een factuur ook een factuurdatum. Bij een plan
 * telt niets van dit alles.
 */
export function controleerGeldvelden(soort: SoortInzending, velden: Geldvelden | null | undefined): Geldcontrole {
  const leeg = { bedrag: null, nummer: null, datum: null, vervaldag: null };
  if (soort === "plan") return { ok: true, waarde: leeg };

  const gelezen = bedrag(velden?.bedrag, "Het bedrag");
  if (!gelezen.ok) return gelezen;
  if (gelezen.waarde === null || gelezen.waarde <= 0) return { ok: false, melding: "Vul het bedrag in, inclusief btw." };
  if (gelezen.waarde > 99_999_999) return { ok: false, melding: "Dat bedrag is wel erg hoog." };

  const ruweDatum = tekst(velden?.datum);
  const dag = datum(ruweDatum);
  if (ruweDatum && !dag) return { ok: false, melding: "De datum is geen geldige datum." };
  if (soort === "offerte") return { ok: true, waarde: { ...leeg, bedrag: gelezen.waarde, datum: dag } };

  if (!dag) return { ok: false, melding: "Vul de factuurdatum in." };
  const ruweVervaldag = tekst(velden?.vervaldag);
  const vervaldag = datum(ruweVervaldag);
  if (ruweVervaldag && !vervaldag) return { ok: false, melding: "De vervaldag is geen geldige datum." };
  if (vervaldag && vervaldag < dag) return { ok: false, melding: "De vervaldag ligt vóór de factuurdatum." };
  const nummer = tekst(velden?.nummer);
  if (nummer && nummer.length > 60) return { ok: false, melding: "Dat factuurnummer is te lang." };
  return { ok: true, waarde: { bedrag: gelezen.waarde, nummer, datum: dag, vervaldag } };
}
