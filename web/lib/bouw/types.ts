/**
 * De vaste lijsten en de vorm van de rijen van de module Bouw. Puur, zonder
 * databank: zowel de server als de browser gebruikt dit bestand.
 *
 * De tabellen staan in supabase/migrations/20261002202500_bouw.sql en
 * 20261002202501_bouw_omzetting.sql. Een lijst hier en een check-constraint
 * daar horen bij elkaar: wie er een aanpast, past de andere mee aan.
 */

export const SOORTEN_PARTIJ = [
  "architect",
  "aannemer",
  "leverancier",
  "adviseur",
  "overheid",
  "nutsbedrijf",
  "bank",
  "verzekeraar",
  "andere",
] as const;

export type SoortPartij = (typeof SOORTEN_PARTIJ)[number];

export const PARTIJNAMEN: Record<SoortPartij, string> = {
  architect: "Architect",
  aannemer: "Aannemer",
  leverancier: "Leverancier",
  adviseur: "Adviseur",
  overheid: "Overheid",
  nutsbedrijf: "Nutsbedrijf",
  bank: "Bank",
  verzekeraar: "Verzekeraar",
  andere: "Andere",
};

export const SOORTEN_PLAN = [
  "grondplan",
  "dakplan",
  "funderingsplan",
  "gevel",
  "doorsnede",
  "inplanting",
  "technieken",
  "detail",
  "andere",
] as const;

export type SoortPlan = (typeof SOORTEN_PLAN)[number];

export const PLANNAMEN: Record<SoortPlan, string> = {
  grondplan: "Grondplan",
  dakplan: "Dakplan",
  funderingsplan: "Funderingsplan",
  gevel: "Gevel",
  doorsnede: "Doorsnede",
  inplanting: "Inplantingsplan",
  technieken: "Technieken",
  detail: "Detail",
  andere: "Andere",
};

/** Wat voor ruimte het is. De omzetting raadt het uit de naam; zie omzetting/soorten.ts. */
export const SOORTEN_RUIMTE = [
  "leefruimte",
  "keuken",
  "slaapkamer",
  "badkamer",
  "wc",
  "inkom",
  "nachthal",
  "berging",
  "technieken",
  "bureau",
  "dressing",
  "wasplaats",
  "garage",
  "terras",
  "trap",
  "andere",
] as const;

export type SoortRuimte = (typeof SOORTEN_RUIMTE)[number];

export const RUIMTENAMEN: Record<SoortRuimte, string> = {
  leefruimte: "Leefruimte",
  keuken: "Keuken",
  slaapkamer: "Slaapkamer",
  badkamer: "Badkamer",
  wc: "Wc",
  inkom: "Inkom",
  nachthal: "Nachthal",
  berging: "Berging",
  technieken: "Technieken",
  bureau: "Bureau",
  dressing: "Dressing",
  wasplaats: "Wasplaats",
  garage: "Garage",
  terras: "Terras",
  trap: "Trap",
  andere: "Andere",
};

export function isSoortRuimte(waarde: string): waarde is SoortRuimte {
  return (SOORTEN_RUIMTE as readonly string[]).includes(waarde);
}

export function isSoortPartij(waarde: string): waarde is SoortPartij {
  return (SOORTEN_PARTIJ as readonly string[]).includes(waarde);
}

export function isSoortPlan(waarde: string): waarde is SoortPlan {
  return (SOORTEN_PLAN as readonly string[]).includes(waarde);
}

/** Een grondplan hoort bij één verdieping; een gevel of doorsnede niet. */
export function hoortBijVerdieping(soort: SoortPlan): boolean {
  return soort === "grondplan" || soort === "technieken";
}

export interface Partij {
  id: number;
  soort: SoortPartij;
  naam: string;
  vak: string | null;
  contactpersoon: string | null;
  email: string | null;
  telefoon: string | null;
  adres: string | null;
  website: string | null;
  btw_nummer: string | null;
  opmerking: string | null;
}

/** Een gebouw met zijn eigen verdiepingen en assenstelsel: de woning, een bijgebouw. */
export interface Gebouw {
  id: number;
  naam: string;
  volgorde: number;
}

export interface Verdieping {
  id: number;
  gebouw_id: number;
  naam: string;
  volgorde: number;
  vloerpeil_m: number | null;
  verdiepingshoogte_m: number | null;
  plafondhoogte_m: number | null;
}

export interface Plan {
  id: number;
  titel: string;
  soort: SoortPlan;
  /** Leeg voor wat over het hele project gaat, zoals het inplantingsplan. */
  gebouw_id: number | null;
  verdieping_id: number | null;
  /** De code uit het titelblok, bv. BA_woning_P_N_1. Daarmee herkent een volgend dossier het plan. */
  bladcode: string | null;
  opmerking: string | null;
  created_at: string;
}

export interface Planversie {
  id: number;
  plan_id: number;
  bestand_id: number;
  label: string;
  pagina: number;
  datum: string | null;
  kalibratie: Record<string, unknown> | null;
  opmerking: string | null;
  created_at: string;
}

/** Een ruimte van een verdieping; de veelhoek in meter, in het assenstelsel van het gebouw. */
export interface Ruimte {
  id: number;
  verdieping_id: number;
  naam: string;
  soort: SoortRuimte;
  /** De buitenrand en de gaten, elk een lijst van [x, y]. */
  veelhoek: [number, number][][];
  oppervlakte_m2: number;
  oppervlakte_plan_m2: number | null;
  plafondhoogte_m: number | null;
  vloerpeil_m: number | null;
  omzetting_id: number | null;
}

/** Een bevestigde omzetting van een planversie. */
export interface Omzetting {
  id: number;
  planversie_id: number;
  werkwijze: number;
  bevestigd_door: string | null;
  bevestigd_op: string;
}

export type BestandStatus = "wacht" | "klaar";

export interface Bestand {
  id: number;
  pad: string;
  doel: string;
  oorspronkelijke_naam: string;
  mime_type: string;
  grootte_bytes: number | null;
  status: BestandStatus;
  opgeladen_door: string | null;
  created_at: string;
  klaar_op: string | null;
}

/**
 * Wat een serveractie teruggeeft aan de browser. Een fout die een actie gooit,
 * krijgt de gebruiker in productie niet te zien (Next vervangt ze door een
 * code). Daarom geven acties die vanuit de browser aangeroepen worden hun
 * melding zelf terug.
 */
export type Uitkomst<T> = { ok: true; data: T } | { ok: false; melding: string };

export function gelukt<T>(data: T): Uitkomst<T> {
  return { ok: true, data };
}

export function mislukt<T = never>(melding: string): Uitkomst<T> {
  return { ok: false, melding };
}
