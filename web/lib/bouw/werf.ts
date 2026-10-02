import { dagenTekst, dagenTussen, korteDatum, vandaag as vandaagIn } from "./kalender";
import type { SoortRuimte } from "./types";

/**
 * De werf: opleverpunten met hun stappen, actiepunten, de checklist per
 * ruimte vóór alles dichtgaat, en de foto's per dag. Puur, voor de server,
 * de browser en de tests.
 *
 * De lijsten horen bij supabase/migrations/20261002900000_bouw_werf.sql.
 */

// ---------------------------------------------------------------------------
// Opleverpunten
// ---------------------------------------------------------------------------

export const STATUSSEN_OPLEVERPUNT = ["open", "gemeld", "hersteld", "gecontroleerd"] as const;
export type StatusOpleverpunt = (typeof STATUSSEN_OPLEVERPUNT)[number];

export const STATUSNAMEN_OPLEVERPUNT: Record<StatusOpleverpunt, string> = {
  open: "open",
  gemeld: "gemeld",
  hersteld: "hersteld, te controleren",
  gecontroleerd: "gecontroleerd",
};

export const RONDES = ["werf", "voorlopig", "definitief"] as const;
export type Ronde = (typeof RONDES)[number];

export const RONDENAMEN: Record<Ronde, string> = {
  werf: "Tijdens de werf",
  voorlopig: "Voorlopige oplevering",
  definitief: "Definitieve oplevering",
};

export function isRonde(waarde: string): waarde is Ronde {
  return (RONDES as readonly string[]).includes(waarde);
}

export interface Opleverpunt {
  id: number;
  titel: string;
  omschrijving: string | null;
  partij_id: number | null;
  verdieping_id: number | null;
  ruimte_id: number | null;
  x_m: number | null;
  y_m: number | null;
  ronde: Ronde;
  status: StatusOpleverpunt;
  gemeld_op: string | null;
  hersteld_op: string | null;
  hersteld_door: string | null;
  herstelopmerking: string | null;
  gecontroleerd_op: string | null;
  gecontroleerd_door: string | null;
  door: string | null;
  created_at: string;
}

/**
 * Wat er met een opleverpunt kan gebeuren:
 * - melden: we hebben het aan de aannemer doorgegeven;
 * - hersteld: de aannemer zegt dat het in orde is (via zijn link, of wij noteren het);
 * - goedkeuren: wij hebben het nagekeken, en het is in orde;
 * - afkeuren: wij hebben het nagekeken, en het is niet in orde: terug naar gemeld;
 * - heropenen: toch nog niet in orde.
 *
 * Enkel wij keuren goed: een punt is pas af als wij het gecontroleerd hebben.
 */
export const STAPPEN = ["melden", "hersteld", "goedkeuren", "afkeuren", "heropenen"] as const;
export type Stap = (typeof STAPPEN)[number];

export const STAPNAMEN: Record<Stap, string> = {
  melden: "Gemeld",
  hersteld: "Hersteld",
  goedkeuren: "Goedgekeurd",
  afkeuren: "Niet in orde",
  heropenen: "Heropenen",
};

export function isStap(waarde: string): waarde is Stap {
  return (STAPPEN as readonly string[]).includes(waarde);
}

export type Wie = "wij" | "aannemer";

const NAAR: Record<Stap, StatusOpleverpunt> = {
  melden: "gemeld",
  hersteld: "hersteld",
  goedkeuren: "gecontroleerd",
  afkeuren: "gemeld",
  heropenen: "open",
};

export function stappenVoor(status: StatusOpleverpunt, wie: Wie): Stap[] {
  if (wie === "aannemer") return status === "open" || status === "gemeld" ? ["hersteld"] : [];
  switch (status) {
    case "open":
      return ["melden", "hersteld"];
    case "gemeld":
      return ["hersteld", "heropenen"];
    case "hersteld":
      return ["goedkeuren", "afkeuren"];
    case "gecontroleerd":
      return ["heropenen"];
  }
}

export type Stapwijziging = Pick<
  Opleverpunt,
  "status" | "gemeld_op" | "hersteld_op" | "hersteld_door" | "herstelopmerking" | "gecontroleerd_op" | "gecontroleerd_door"
>;

/**
 * Een stap toepassen: de nieuwe status en wie wat wanneer deed. Wat niet
 * mag, geeft een melding. Afkeuren en heropenen wissen het herstel, zodat
 * de aannemer opnieuw kan melden; de opmerking van het afkeuren blijft.
 */
export function pasStapToe(
  punt: Pick<Opleverpunt, keyof Stapwijziging>,
  stap: Stap,
  wie: Wie,
  door: string,
  nu: Date,
  opmerking: string | null = null,
): { ok: true; waarde: Stapwijziging } | { ok: false; melding: string } {
  if (!stappenVoor(punt.status, wie).includes(stap)) {
    return { ok: false, melding: `Dit punt staat op "${STATUSNAMEN_OPLEVERPUNT[punt.status]}": dat kan nu niet.` };
  }
  const tijd = nu.toISOString();
  const nieuw: Stapwijziging = {
    status: NAAR[stap],
    gemeld_op: punt.gemeld_op,
    hersteld_op: punt.hersteld_op,
    hersteld_door: punt.hersteld_door,
    herstelopmerking: punt.herstelopmerking,
    gecontroleerd_op: punt.gecontroleerd_op,
    gecontroleerd_door: punt.gecontroleerd_door,
  };
  switch (stap) {
    case "melden":
      nieuw.gemeld_op = tijd;
      break;
    case "hersteld":
      nieuw.gemeld_op = punt.gemeld_op ?? tijd;
      nieuw.hersteld_op = tijd;
      nieuw.hersteld_door = door;
      nieuw.herstelopmerking = opmerking;
      break;
    case "goedkeuren":
      nieuw.gecontroleerd_op = tijd;
      nieuw.gecontroleerd_door = door;
      break;
    case "afkeuren":
      nieuw.hersteld_op = null;
      nieuw.hersteld_door = null;
      nieuw.herstelopmerking = opmerking ? `Niet in orde: ${opmerking}` : "Niet in orde.";
      break;
    case "heropenen":
      nieuw.hersteld_op = null;
      nieuw.hersteld_door = null;
      nieuw.gecontroleerd_op = null;
      nieuw.gecontroleerd_door = null;
      nieuw.status = punt.status === "gecontroleerd" ? "gemeld" : "open";
      break;
  }
  return { ok: true, waarde: nieuw };
}

export interface Opleverstand {
  open: number;
  gemeld: number;
  hersteld: number;
  gecontroleerd: number;
  totaal: number;
}

/** Per partij hoeveel punten in elke stand staan; null is "zonder aannemer". */
export function opleverstand(punten: readonly Pick<Opleverpunt, "partij_id" | "status">[]): Map<number | null, Opleverstand> {
  const uit = new Map<number | null, Opleverstand>();
  for (const punt of punten) {
    const stand = uit.get(punt.partij_id) ?? { open: 0, gemeld: 0, hersteld: 0, gecontroleerd: 0, totaal: 0 };
    stand[punt.status]++;
    stand.totaal++;
    uit.set(punt.partij_id, stand);
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Actiepunten
// ---------------------------------------------------------------------------

export interface Actiepunt {
  id: number;
  titel: string;
  omschrijving: string | null;
  partij_id: number | null;
  deadline: string | null;
  status: "open" | "klaar";
  klaar_op: string | null;
  door: string | null;
  created_at: string;
}

/** Herinneren de dag vóór de deadline, op de dag zelf, en één keer de dag erna. */
export const ACTIEPUNT_HERINNEREN_OP = [1, 0, -1];

export function actiepuntherinneringen(
  punten: readonly Actiepunt[],
  partijnaam: (partijId: number | null) => string | null,
  vandaag: string,
): { sleutel: string; tekst: string; pad: string }[] {
  const uit: { sleutel: string; tekst: string; pad: string }[] = [];
  for (const punt of punten) {
    if (punt.status !== "open" || !punt.deadline) continue;
    const dagen = dagenTussen(vandaag, punt.deadline);
    if (!ACTIEPUNT_HERINNEREN_OP.includes(dagen)) continue;
    const wie = partijnaam(punt.partij_id);
    const wat = `${punt.titel}${wie ? ` (${wie})` : ""}`;
    uit.push({
      sleutel: `actiepunt:${punt.id}:${punt.deadline}:${dagen}`,
      tekst:
        dagen < 0
          ? `⚠️ Actiepunt ${wat}: de deadline was gisteren (${korteDatum(punt.deadline, vandaag)}).`
          : `📌 Actiepunt ${wat}: klaar tegen ${dagenTekst(dagen)}.`,
      pad: "/bouw/werf/actiepunten",
    });
  }
  return uit;
}

// ---------------------------------------------------------------------------
// De checklist vóór alles dichtgaat
// ---------------------------------------------------------------------------

export interface Checkpunt {
  sleutel: string;
  tekst: string;
  /** Enkel voor deze soorten ruimtes; zonder lijst voor elke ruimte. */
  voor?: readonly SoortRuimte[];
}

const NAT: readonly SoortRuimte[] = ["badkamer", "wc", "keuken", "wasplaats", "technieken"];
const BINNEN: readonly SoortRuimte[] = [
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
  "trap",
  "andere",
];

/**
 * Wat je in een ruimte nakijkt en fotografeert vóór het pleisterwerk en de
 * chape: later zit het in de muur of de vloer, en wil je weten waar.
 */
export const CHECKLIST_DICHT: readonly Checkpunt[] = [
  { sleutel: "foto_muren", tekst: "Elke muur gefotografeerd, met de leidingen en dozen erin, en een meter erbij" },
  { sleutel: "dozen_nagemeten", tekst: "Dozen en hoogtes nagemeten tegen de wensenlijst", voor: BINNEN },
  { sleutel: "netwerk", tekst: "Netwerkkabels getrokken en gelabeld", voor: ["leefruimte", "slaapkamer", "bureau", "technieken", "garage"] },
  { sleutel: "versterking", tekst: "Versterking in de muur voor wat zwaar is: tv, kasten, handdoekradiator", voor: BINNEN },
  { sleutel: "sanitair", tekst: "Water en afvoer gefotografeerd en op lekken getest", voor: NAT },
  { sleutel: "ventilatie", tekst: "Ventilatiekanalen gefotografeerd", voor: BINNEN },
  { sleutel: "vloer", tekst: "De vloer gefotografeerd vóór de chape: vloerverwarming en leidingen", voor: BINNEN },
  { sleutel: "luchtdicht", tekst: "Luchtdichting rond doorvoeren nagekeken" },
];

export function checklistVoor(soort: SoortRuimte): Checkpunt[] {
  return CHECKLIST_DICHT.filter((punt) => !punt.voor || punt.voor.includes(soort));
}

export function isChecksleutel(waarde: string): boolean {
  return CHECKLIST_DICHT.some((punt) => punt.sleutel === waarde);
}

// ---------------------------------------------------------------------------
// Foto's
// ---------------------------------------------------------------------------

/** De dag in België waarop een foto genomen werd. */
export function dagVan(genomenOp: string): string {
  return vandaagIn(new Date(genomenOp));
}

/** Foto's per dag, de laatste dag eerst; binnen een dag in volgorde van nemen. */
export function perDag<T extends { genomen_op: string }>(fotos: readonly T[]): { dag: string; fotos: T[] }[] {
  const dagen = new Map<string, T[]>();
  for (const foto of [...fotos].sort((a, b) => a.genomen_op.localeCompare(b.genomen_op))) {
    const dag = dagVan(foto.genomen_op);
    dagen.set(dag, [...(dagen.get(dag) ?? []), foto]);
  }
  return [...dagen.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([dag, lijst]) => ({ dag, fotos: lijst }));
}
