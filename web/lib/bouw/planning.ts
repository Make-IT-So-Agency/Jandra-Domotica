import { beginVanMaand, dagenTussen, maandagVan, plusDagen, volgendeMaand } from "./kalender";

/**
 * De planning: fasen, taken en mijlpalen, en wat er deze en volgende week
 * gebeurt. Puur. De lijsten horen bij de check-constraints in
 * supabase/migrations/20261002202503_bouw_regie.sql.
 */

export const SOORTEN_PLANNING = ["fase", "taak", "mijlpaal"] as const;
export type SoortPlanning = (typeof SOORTEN_PLANNING)[number];

export const PLANNINGNAMEN: Record<SoortPlanning, string> = {
  fase: "Fase",
  taak: "Taak",
  mijlpaal: "Mijlpaal",
};

export const STATUSSEN_PLANNING = ["gepland", "bezig", "klaar"] as const;
export type StatusPlanning = (typeof STATUSSEN_PLANNING)[number];

export const PLANNINGSTATUSNAMEN: Record<StatusPlanning, string> = {
  gepland: "Gepland",
  bezig: "Bezig",
  klaar: "Klaar",
};

export function isSoortPlanning(waarde: string): waarde is SoortPlanning {
  return (SOORTEN_PLANNING as readonly string[]).includes(waarde);
}

export function isStatusPlanning(waarde: string): waarde is StatusPlanning {
  return (STATUSSEN_PLANNING as readonly string[]).includes(waarde);
}

export interface Planningsitem {
  id: number;
  soort: SoortPlanning;
  titel: string;
  begindatum: string;
  /** Leeg bij een mijlpaal, of bij iets van één dag. */
  einddatum: string | null;
  fase_id: number | null;
  partij_id: number | null;
  status: StatusPlanning;
  opmerking: string | null;
}

/** De laatste dag: de einddatum, of de begindatum zelf. */
export function eindeVan(item: Pick<Planningsitem, "begindatum" | "einddatum">): string {
  return item.einddatum ?? item.begindatum;
}

/** Hoeveel kalenderdagen, beide dagen meegeteld. */
export function duurInDagen(item: Pick<Planningsitem, "begindatum" | "einddatum">): number {
  return dagenTussen(item.begindatum, eindeVan(item)) + 1;
}

const volgens = (a: Planningsitem, b: Planningsitem) =>
  a.begindatum.localeCompare(b.begindatum) || eindeVan(a).localeCompare(eindeVan(b)) || a.id - b.id;

export interface Planningsgroep {
  /** Null voor wat bij geen fase hoort. */
  fase: Planningsitem | null;
  items: Planningsitem[];
}

/**
 * De fasen in de tijd, elk met hun taken en mijlpalen, en wat bij geen fase
 * hoort als laatste groep. Een item dat naar een onbekende fase wijst, hoort
 * bij geen fase.
 */
export function groepeer(items: Planningsitem[]): Planningsgroep[] {
  const fasen = items.filter((item) => item.soort === "fase").sort(volgens);
  const faseIds = new Set(fasen.map((fase) => fase.id));
  const groepen: Planningsgroep[] = fasen.map((fase) => ({
    fase,
    items: items.filter((item) => item.soort !== "fase" && item.fase_id === fase.id).sort(volgens),
  }));
  const los = items.filter((item) => item.soort !== "fase" && (item.fase_id === null || !faseIds.has(item.fase_id)));
  if (los.length > 0) groepen.push({ fase: null, items: los.sort(volgens) });
  return groepen;
}

/** Is het nu bezig, voorbij of nog niet begonnen? Een status "klaar" gaat voor. */
export function standVan(item: Pick<Planningsitem, "begindatum" | "einddatum" | "status">, vandaag: string): "klaar" | "bezig" | "te_laat" | "gepland" {
  if (item.status === "klaar") return "klaar";
  if (eindeVan(item) < vandaag) return "te_laat";
  if (item.begindatum <= vandaag || item.status === "bezig") return "bezig";
  return "gepland";
}

export interface Tijdas {
  begin: string;
  einde: string;
  dagen: number;
  /** De eerste dag van elke maand binnen de as. */
  maanden: string[];
}

/**
 * Van de eerste dag van de maand van het vroegste item tot het einde van de
 * maand van het laatste. Vandaag valt er altijd in, zodat de lijn van vandaag
 * nooit buiten beeld staat.
 */
export function tijdasVan(datums: string[], vandaag: string): Tijdas {
  const alles = [...datums, vandaag].sort();
  const begin = beginVanMaand(alles[0]);
  const einde = plusDagen(volgendeMaand(alles.at(-1)!), -1);
  const maanden: string[] = [];
  for (let maand = begin; maand <= einde; maand = volgendeMaand(maand)) maanden.push(maand);
  return { begin, einde, dagen: dagenTussen(begin, einde) + 1, maanden };
}

export interface Weekregel {
  datum: string;
  tekst: string;
  soort: "begint" | "eindigt" | "mijlpaal" | "deadline" | "loopt";
}

/**
 * Wat er van maandag deze week tot zondag volgende week gebeurt: wat begint,
 * eindigt of een mijlpaal is, en de deadlines van de keuzes. Wat al loopt,
 * komt er één keer bij, op maandag. Voor /week en de samenvatting van de bot.
 */
export function tweeWeken(
  items: Pick<Planningsitem, "soort" | "titel" | "begindatum" | "einddatum" | "status">[],
  deadlines: { titel: string; datum: string }[],
  vandaag: string,
): { van: string; tot: string; regels: Weekregel[] } {
  const van = maandagVan(vandaag);
  const tot = plusDagen(van, 13);
  const regels: Weekregel[] = [];
  const binnen = (datum: string) => datum >= van && datum <= tot;

  for (const item of items) {
    if (item.status === "klaar") continue;
    if (item.soort === "mijlpaal") {
      if (binnen(item.begindatum)) regels.push({ datum: item.begindatum, tekst: item.titel, soort: "mijlpaal" });
      continue;
    }
    const einde = eindeVan(item);
    if (binnen(item.begindatum)) regels.push({ datum: item.begindatum, tekst: item.titel, soort: "begint" });
    else if (item.begindatum < van && einde >= van) regels.push({ datum: van, tekst: item.titel, soort: "loopt" });
    if (item.einddatum && item.einddatum !== item.begindatum && binnen(einde)) {
      regels.push({ datum: einde, tekst: item.titel, soort: "eindigt" });
    }
  }
  for (const deadline of deadlines) {
    if (binnen(deadline.datum)) regels.push({ datum: deadline.datum, tekst: deadline.titel, soort: "deadline" });
  }

  const volgorde = { loopt: 0, begint: 1, mijlpaal: 2, deadline: 3, eindigt: 4 };
  regels.sort((a, b) => a.datum.localeCompare(b.datum) || volgorde[a.soort] - volgorde[b.soort]);
  return { van, tot, regels };
}

export interface Voorbeeldstap {
  soort: SoortPlanning;
  titel: string;
  /** Weken na het begin van de vorige fase, of na het begin van zijn fase. */
  naWeken: number;
  weken: number;
  taken?: { titel: string; naWeken: number; weken: number }[];
}

/**
 * Een gewone planning voor een nieuwbouw met losse aannemers, van de
 * vergunningsaanvraag tot de voorlopige oplevering. Enkel om mee te beginnen:
 * elke datum is aan te passen.
 */
export const VOORBEELDPLANNING: readonly Voorbeeldstap[] = [
  {
    soort: "fase",
    titel: "Omgevingsvergunning",
    naWeken: 0,
    weken: 21,
    taken: [
      { titel: "Aanvraag indienen", naWeken: 0, weken: 1 },
      { titel: "Openbaar onderzoek", naWeken: 3, weken: 5 },
      // Een vergunning mag je pas gebruiken vanaf de 36e dag na de aanplakking.
      { titel: "Aanplakking en wachttermijn", naWeken: 16, weken: 5 },
    ],
  },
  { soort: "mijlpaal", titel: "Vergunning verleend", naWeken: 16, weken: 0 },
  {
    soort: "fase",
    titel: "Offertes en aannemers",
    naWeken: 4,
    weken: 12,
    taken: [
      { titel: "Lastenboek en meetstaat", naWeken: 0, weken: 4 },
      { titel: "Offertes vergelijken", naWeken: 5, weken: 5 },
      { titel: "Contracten tekenen", naWeken: 10, weken: 2 },
    ],
  },
  {
    soort: "fase",
    titel: "Ruwbouw",
    naWeken: 17,
    weken: 16,
    taken: [
      { titel: "Grondwerken en fundering", naWeken: 0, weken: 3 },
      { titel: "Riolering", naWeken: 2, weken: 2 },
      { titel: "Metselwerk en vloerplaten", naWeken: 3, weken: 10 },
      { titel: "Dakstructuur", naWeken: 12, weken: 3 },
    ],
  },
  {
    soort: "fase",
    titel: "Wind- en waterdicht",
    naWeken: 15,
    weken: 6,
    taken: [
      { titel: "Dakbedekking", naWeken: 0, weken: 3 },
      { titel: "Ramen en buitendeuren plaatsen", naWeken: 2, weken: 3 },
    ],
  },
  {
    soort: "fase",
    titel: "Technieken",
    naWeken: 5,
    weken: 8,
    taken: [
      { titel: "Elektriciteit (ruwbouw)", naWeken: 0, weken: 3 },
      { titel: "Sanitair en verwarming (ruwbouw)", naWeken: 0, weken: 3 },
      { titel: "Ventilatie", naWeken: 2, weken: 2 },
    ],
  },
  {
    soort: "fase",
    titel: "Afwerking",
    naWeken: 4,
    weken: 18,
    taken: [
      { titel: "Pleisterwerk", naWeken: 0, weken: 3 },
      { titel: "Chape", naWeken: 3, weken: 2 },
      { titel: "Vloeren en tegels", naWeken: 8, weken: 4 },
      { titel: "Binnendeuren en trap", naWeken: 12, weken: 2 },
      { titel: "Keuken plaatsen", naWeken: 13, weken: 2 },
      { titel: "Schilderwerk", naWeken: 15, weken: 3 },
      { titel: "Keuring elektriciteit", naWeken: 17, weken: 1 },
    ],
  },
  { soort: "fase", titel: "Buitenaanleg", naWeken: 12, weken: 6 },
  { soort: "mijlpaal", titel: "Voorlopige oplevering", naWeken: 6, weken: 0 },
];

export interface Voorbeelditem {
  soort: SoortPlanning;
  titel: string;
  begindatum: string;
  einddatum: string | null;
  /** Index in dezelfde lijst van de fase waar dit bij hoort. */
  fase: number | null;
}

/**
 * De voorbeeldplanning vanaf een begindatum. Elke fase begint een aantal
 * weken na het begin van de vorige; een mijlpaal ligt een aantal weken na het
 * begin van de vorige fase.
 */
export function voorbeeldVanaf(begin: string): Voorbeelditem[] {
  const uit: Voorbeelditem[] = [];
  let vorigeFase = begin;
  for (const stap of VOORBEELDPLANNING) {
    const start = plusDagen(vorigeFase, stap.naWeken * 7);
    if (stap.soort === "mijlpaal") {
      uit.push({ soort: "mijlpaal", titel: stap.titel, begindatum: start, einddatum: null, fase: null });
      continue;
    }
    vorigeFase = start;
    const faseIndex = uit.length;
    uit.push({ soort: stap.soort, titel: stap.titel, begindatum: start, einddatum: plusDagen(start, stap.weken * 7 - 1), fase: null });
    for (const taak of stap.taken ?? []) {
      const taakbegin = plusDagen(start, taak.naWeken * 7);
      uit.push({
        soort: "taak",
        titel: taak.titel,
        begindatum: taakbegin,
        einddatum: plusDagen(taakbegin, taak.weken * 7 - 1),
        fase: faseIndex,
      });
    }
  }
  return uit;
}
