import { dagenTussen, korteDatum, plusDagen } from "./kalender";
import type { SoortRuimte } from "./types";

/**
 * Keuzes: gevelsteen, dakpan, ramen, vloeren, keuken, warmtepomp... Elk met
 * opties, onze voorkeur, een deadline en de meerprijs per optie. Puur, voor
 * de server, de browser en de tests.
 *
 * De lijsten horen bij de check-constraints in
 * supabase/migrations/20261002202503_bouw_regie.sql.
 */

export const CATEGORIEEN_KEUZE = [
  "ruwbouw",
  "gevel",
  "dak",
  "buitenschrijnwerk",
  "binnenschrijnwerk",
  "vloeren",
  "wanden",
  "sanitair",
  "keuken",
  "klimaat",
  "elektriciteit",
  "energie",
  "buiten",
  "andere",
] as const;

export type CategorieKeuze = (typeof CATEGORIEEN_KEUZE)[number];

export const CATEGORIENAMEN_KEUZE: Record<CategorieKeuze, string> = {
  ruwbouw: "Ruwbouw en isolatie",
  gevel: "Gevel",
  dak: "Dak",
  buitenschrijnwerk: "Ramen en buitendeuren",
  binnenschrijnwerk: "Binnendeuren en trap",
  vloeren: "Vloeren",
  wanden: "Wanden en plafonds",
  sanitair: "Badkamer en sanitair",
  keuken: "Keuken",
  klimaat: "Verwarming en ventilatie",
  elektriciteit: "Elektriciteit en domotica",
  energie: "Zonnepanelen en energie",
  buiten: "Buitenaanleg",
  andere: "Andere",
};

export function isCategorieKeuze(waarde: string): waarde is CategorieKeuze {
  return (CATEGORIEEN_KEUZE as readonly string[]).includes(waarde);
}

export const EENHEDEN = ["totaal", "m2", "m", "stuk"] as const;

export type Eenheid = (typeof EENHEDEN)[number];

/** Hoe de prijs van een optie bedoeld is. */
export const EENHEIDNAMEN: Record<Eenheid, string> = {
  totaal: "in totaal",
  m2: "per m²",
  m: "per lopende meter",
  stuk: "per stuk",
};

/** Achter een hoeveelheid: "73,40 m²", "12 stuks". */
export const EENHEIDKORT: Record<Eenheid, string> = { totaal: "", m2: "m²", m: "m", stuk: "stuks" };

export function isEenheid(waarde: string): waarde is Eenheid {
  return (EENHEDEN as readonly string[]).includes(waarde);
}

/** Hoe een optie er in 3D uitziet, naast haar kleur: zonder patroon is ze egaal. */
export const PATRONEN = ["baksteen", "pannen", "leien", "zink", "planken", "parket", "tegels", "beton", "crepi"] as const;

export type Patroon = (typeof PATRONEN)[number];

export const PATROONNAMEN: Record<Patroon, string> = {
  baksteen: "Baksteen",
  pannen: "Dakpannen",
  leien: "Leien",
  zink: "Zink met staande naad",
  planken: "Houten planken",
  parket: "Parket",
  tegels: "Tegels",
  beton: "Beton",
  crepi: "Crepi of pleister",
};

export function isPatroon(waarde: unknown): waarde is Patroon {
  return (PATRONEN as readonly unknown[]).includes(waarde);
}

/** Heeft dit patroon voegen, met een eigen kleur? */
export const MET_VOEG: readonly Patroon[] = ["baksteen", "tegels"];

export interface Keuze {
  id: number;
  titel: string;
  categorie: CategorieKeuze;
  omschrijving: string | null;
  /** YYYY-MM-DD, of null: dan volgt ze eventueel uit de planning. */
  deadline: string | null;
  planning_id: number | null;
  levertermijn_weken: number | null;
  eenheid: Eenheid;
  /** Met de hand; anders de som van de gekoppelde ruimtes. */
  hoeveelheid: number | null;
  partij_id: number | null;
  gekozen_optie_id: number | null;
  beslist_op: string | null;
  beslist_door: string | null;
  /** De gekoppelde ruimtes. */
  ruimte_ids: number[];
}

export interface Optie {
  id: number;
  keuze_id: number;
  naam: string;
  leverancier_id: number | null;
  /** Inclusief btw, per eenheid van de keuze. */
  prijs: number | null;
  basis: boolean;
  kleur: string | null;
  /** Het patroon in 3D, en bij baksteen of tegels de kleur van de voeg. */
  patroon: Patroon | null;
  voegkleur: string | null;
  url: string | null;
  foto_bestand_id: number | null;
  opmerking: string | null;
  volgorde: number;
}

export interface Voorkeur {
  keuze_id: number;
  wie: string;
  naam: string;
  optie_id: number;
}

export interface Hoeveelheid {
  waarde: number | null;
  bron: "totaal" | "hand" | "ruimtes" | "geen";
}

const rond2 = (waarde: number) => Math.round(waarde * 100) / 100;

/**
 * Hoeveel er nodig is: met de hand ingevuld, of bij een prijs per m² de som
 * van de gekoppelde ruimtes. Bij een prijs in totaal is dat gewoon 1.
 */
export function hoeveelheidVan(
  keuze: Pick<Keuze, "eenheid" | "hoeveelheid">,
  oppervlaktes: number[],
): Hoeveelheid {
  if (keuze.eenheid === "totaal") return { waarde: 1, bron: "totaal" };
  if (keuze.hoeveelheid !== null) return { waarde: keuze.hoeveelheid, bron: "hand" };
  if (keuze.eenheid === "m2" && oppervlaktes.length > 0) {
    return { waarde: rond2(oppervlaktes.reduce((som, o) => som + o, 0)), bron: "ruimtes" };
  }
  return { waarde: null, bron: "geen" };
}

/** Wat een optie in totaal kost, of null als de prijs of de hoeveelheid ontbreekt. */
export function kostVan(optie: Pick<Optie, "prijs">, hoeveelheid: number | null): number | null {
  if (optie.prijs === null || hoeveelheid === null) return null;
  return rond2(optie.prijs * hoeveelheid);
}

export interface Optieprijs {
  kost: number | null;
  /** Tegenover de referentie; null als een van beide geen prijs heeft. */
  meerprijs: number | null;
  isReferentie: boolean;
}

/**
 * De meerprijs van elke optie tegenover de basis (wat in de offerte staat), of
 * tegenover de goedkoopste als er geen basis is.
 */
export function meerprijzen(opties: Pick<Optie, "id" | "prijs" | "basis">[], hoeveelheid: number | null): Map<number, Optieprijs> {
  const kosten = new Map(opties.map((optie) => [optie.id, kostVan(optie, hoeveelheid)]));
  const metPrijs = opties.filter((optie) => kosten.get(optie.id) !== null);
  const referentie =
    opties.find((optie) => optie.basis) ??
    metPrijs.reduce<(typeof opties)[number] | undefined>(
      (goedkoopste, optie) =>
        goedkoopste === undefined || kosten.get(optie.id)! < kosten.get(goedkoopste.id)! ? optie : goedkoopste,
      undefined,
    );
  const referentiekost = referentie ? kosten.get(referentie.id) ?? null : null;

  return new Map(
    opties.map((optie) => {
      const kost = kosten.get(optie.id) ?? null;
      return [
        optie.id,
        {
          kost,
          meerprijs: kost !== null && referentiekost !== null ? rond2(kost - referentiekost) : null,
          isReferentie: optie.id === referentie?.id,
        },
      ];
    }),
  );
}

/** Een week om te bestellen, bovenop de levertermijn. */
export const BESTELMARGE_DAGEN = 7;

export interface Deadline {
  datum: string;
  bron: "vast" | "planning";
  /** Waar ze vandaan komt, voor in de lijst. Leeg bij een vaste deadline. */
  uitleg: string;
}

/**
 * Tegen wanneer we moeten beslissen. Een vaste deadline gaat voor. Anders: de
 * begindatum van de taak die het nodig heeft, min de levertermijn en een week
 * om te bestellen. Zonder levertermijn een week vóór de taak.
 */
export function deadlineVan(
  keuze: Pick<Keuze, "deadline" | "planning_id" | "levertermijn_weken">,
  planning: { id: number; titel: string; begindatum: string }[],
): Deadline | null {
  if (keuze.deadline) return { datum: keuze.deadline, bron: "vast", uitleg: "" };
  const taak = keuze.planning_id === null ? undefined : planning.find((item) => item.id === keuze.planning_id);
  if (!taak) return null;

  const weken = keuze.levertermijn_weken ?? 0;
  const datum = plusDagen(taak.begindatum, -(weken * 7 + BESTELMARGE_DAGEN));
  const begin = korteDatum(taak.begindatum, datum);
  return {
    datum,
    bron: "planning",
    uitleg:
      weken > 0
        ? `"${taak.titel}" begint op ${begin}; ${weken} weken levertermijn, plus een week om te bestellen`
        : `een week vóór "${taak.titel}" begint (${begin})`,
  };
}

export type Dringendheid = "te_laat" | "week" | "maand" | "later";

export function dringendheid(dagen: number): Dringendheid {
  if (dagen < 0) return "te_laat";
  if (dagen <= 7) return "week";
  if (dagen <= 31) return "maand";
  return "later";
}

export function dagenTotDeadline(deadline: Deadline, vandaag: string): number {
  return dagenTussen(vandaag, deadline.datum);
}

/**
 * De open keuzes met een deadline, de dringendste eerst. Wat al beslist is,
 * staat er niet in.
 */
export function openDeadlines<K extends Pick<Keuze, "id" | "titel" | "deadline" | "planning_id" | "levertermijn_weken" | "gekozen_optie_id">>(
  keuzes: K[],
  planning: { id: number; titel: string; begindatum: string }[],
  vandaag: string,
): { keuze: K; deadline: Deadline; dagen: number }[] {
  return keuzes
    .filter((keuze) => keuze.gekozen_optie_id === null)
    .flatMap((keuze) => {
      const deadline = deadlineVan(keuze, planning);
      return deadline ? [{ keuze, deadline, dagen: dagenTotDeadline(deadline, vandaag) }] : [];
    })
    .sort((a, b) => a.dagen - b.dagen || a.keuze.titel.localeCompare(b.keuze.titel, "nl-BE"));
}

/** De naam die we tonen: de voornaam, of wat voor de @ staat. */
export function korteNaam(naam: string | null, email: string): string {
  const voornaam = naam?.trim().split(/\s+/)[0];
  if (voornaam) return voornaam;
  const begin = email.split("@")[0] ?? email;
  return begin.charAt(0).toLocaleUpperCase("nl-BE") + begin.slice(1);
}

const euroFormatter = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** "€ 12.345", afgerond op de euro: genoeg om opties te vergelijken. */
export function euroRond(bedrag: number): string {
  return euroFormatter.format(Math.round(bedrag));
}

/** "+€ 1.250", "−€ 300", "€ 0". Met een harde spatie na het euroteken, zoals Intl. */
export function meerprijsTekst(bedrag: number): string {
  if (Math.round(bedrag) === 0) return euroRond(0);
  return `${bedrag > 0 ? "+" : "−"}${euroRond(Math.abs(bedrag))}`;
}

/** Wat in het beslissingslog komt als een keuze definitief wordt. */
export function beslissingstekst(
  optie: Pick<Optie, "naam">,
  leverancier: string | null,
  kost: number | null,
  eenheid: Eenheid,
): string {
  const delen = [optie.naam];
  if (leverancier) delen[0] += ` (${leverancier})`;
  if (kost !== null) delen.push(eenheid === "totaal" ? euroRond(kost) : `${euroRond(kost)} in totaal`);
  return delen.join(", ");
}

export interface Standaardkeuze {
  titel: string;
  categorie: CategorieKeuze;
  eenheid: Eenheid;
  levertermijn_weken?: number;
  /** De ruimtes van deze soort worden meteen gekoppeld. */
  ruimtesoorten?: SoortRuimte[];
  omschrijving?: string;
}

/**
 * De keuzes die bij bijna elke nieuwbouw terugkomen, om mee te beginnen. De
 * levertermijnen zijn een gewone orde van grootte; vraag ze na bij de
 * leverancier.
 */
export const STANDAARDKEUZES: readonly Standaardkeuze[] = [
  { titel: "Gevelsteen", categorie: "gevel", eenheid: "m2", levertermijn_weken: 8 },
  { titel: "Voegwerk", categorie: "gevel", eenheid: "totaal", omschrijving: "Kleur en soort voeg." },
  { titel: "Dakbedekking", categorie: "dak", eenheid: "m2", levertermijn_weken: 6 },
  { titel: "Dakgoten en regenpijpen", categorie: "dak", eenheid: "totaal" },
  {
    titel: "Ramen en buitendeuren",
    categorie: "buitenschrijnwerk",
    eenheid: "totaal",
    levertermijn_weken: 12,
    omschrijving: "Materiaal, kleur binnen en buiten, beglazing.",
  },
  { titel: "Voordeur", categorie: "buitenschrijnwerk", eenheid: "totaal", levertermijn_weken: 10 },
  { titel: "Zonwering", categorie: "buitenschrijnwerk", eenheid: "totaal", levertermijn_weken: 8 },
  { titel: "Binnendeuren", categorie: "binnenschrijnwerk", eenheid: "stuk", levertermijn_weken: 6 },
  { titel: "Trap", categorie: "binnenschrijnwerk", eenheid: "totaal", levertermijn_weken: 8 },
  {
    titel: "Vloer leefruimte en keuken",
    categorie: "vloeren",
    eenheid: "m2",
    levertermijn_weken: 4,
    ruimtesoorten: ["leefruimte", "keuken", "inkom"],
  },
  { titel: "Vloer slaapkamers", categorie: "vloeren", eenheid: "m2", levertermijn_weken: 4, ruimtesoorten: ["slaapkamer", "nachthal", "dressing", "bureau"] },
  { titel: "Tegels badkamer", categorie: "sanitair", eenheid: "m2", levertermijn_weken: 4, ruimtesoorten: ["badkamer"] },
  { titel: "Sanitair", categorie: "sanitair", eenheid: "totaal", levertermijn_weken: 4 },
  { titel: "Keuken", categorie: "keuken", eenheid: "totaal", levertermijn_weken: 10 },
  { titel: "Warmtepomp", categorie: "klimaat", eenheid: "totaal", levertermijn_weken: 6 },
  { titel: "Ventilatie", categorie: "klimaat", eenheid: "totaal", omschrijving: "Systeem D met warmterecuperatie, of C+." },
  { titel: "Domotica", categorie: "elektriciteit", eenheid: "totaal" },
  { titel: "Zonnepanelen", categorie: "energie", eenheid: "totaal" },
  { titel: "Oprit en terras", categorie: "buiten", eenheid: "m2" },
];
