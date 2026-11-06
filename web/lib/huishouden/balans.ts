import { z } from "zod";

/**
 * De balans: Jan en Sandra verdelen de werkstromen van het gezin. Hier staan
 * de begrippen en de regels, zonder databank, zodat elke regel apart te
 * testen valt (zie tests/huishouden-balans.test.ts). De browser gebruikt dit
 * bestand ook. Zie huishouden/LEESMIJ.md voor wat de module doet.
 */

// --- Personen --------------------------------------------------------------

export const PERSONEN = ["jan", "sandra"] as const;
export type Persoon = (typeof PERSONEN)[number];

export const PERSOONSNAMEN: Record<Persoon, string> = { jan: "Jan", sandra: "Sandra" };

export function isPersoon(waarde: unknown): waarde is Persoon {
  return (PERSONEN as readonly unknown[]).includes(waarde);
}

export function ander(persoon: Persoon): Persoon {
  return persoon === "jan" ? "sandra" : "jan";
}

// --- Kaarten ---------------------------------------------------------------

export const FREQUENTIES = ["dagelijks", "wekelijks", "maandelijks", "kwartaal", "jaarlijks", "project"] as const;
export type Frequentie = (typeof FREQUENTIES)[number];

export const FREQUENTIENAMEN: Record<Frequentie, string> = {
  dagelijks: "Dagelijks",
  wekelijks: "Wekelijks",
  maandelijks: "Maandelijks",
  kwartaal: "Per kwartaal",
  jaarlijks: "Jaarlijks",
  project: "Project",
};

/** Hoe een kaart verdeeld wordt. */
export const VERDELINGEN = ["spel", "jan", "sandra", "elk", "samen"] as const;
export type Verdeling = (typeof VERDELINGEN)[number];

/** Zoals in de keuzelijst van de dialoog. */
export const VERDELINGSKEUZES: Record<Verdeling, string> = {
  spel: "Via het spel: inschatten en claimen",
  jan: "Vast bij Jan",
  sandra: "Vast bij Sandra",
  elk: "Elk voor zich (zoals hobbytijd)",
  samen: "Samen, telt niet mee in de weegschaal",
};

export interface Kaart {
  id: number;
  titel: string;
  domein: string;
  omschrijving: string | null;
  goedGenoeg: string | null;
  frequentie: Frequentie;
  verdeling: Verdeling;
  /** Enkel bij "elk voor zich": vaste uren per week, voor elk. */
  vasteUren: number | null;
  geschrapt: boolean;
  volgorde: number;
}

/** Wat je in de dialoog invult, voor een nieuwe kaart of een aanpassing. */
export type Kaartinvoer = Pick<Kaart, "titel" | "domein" | "omschrijving" | "goedGenoeg" | "frequentie" | "verdeling" | "vasteUren">;

export const GRENZEN = { titel: 60, domein: 40, omschrijving: 300, goedGenoeg: 300 } as const;

const tekst = (veld: string, max: number) =>
  z
    .string({ invalid_type_error: `${veld} ontbreekt.` })
    .transform((waarde) => waarde.trim())
    .pipe(z.string().max(max, `${veld} mag hoogstens ${max} tekens hebben.`));

const verplicht = (veld: string, max: number) =>
  tekst(veld, max).pipe(z.string().min(1, `Vul ${veld.toLowerCase()} in.`));

/** Leeg wordt null, zodat een leeg veld geen lege tekst in de databank zet. */
const optioneel = (veld: string, max: number) =>
  z
    .union([tekst(veld, max), z.null(), z.undefined()])
    .transform((waarde) => (waarde ? waarde : null));

/** Uren met een komma of een punt: "5", "4,5". Leeg is geen vaste uren. */
const uren = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((waarde, context) => {
    if (waarde === null || waarde === undefined) return null;
    const tekstwaarde = String(waarde).trim().replace(",", ".");
    if (tekstwaarde === "") return null;
    const getal = Number(tekstwaarde);
    if (!Number.isFinite(getal) || getal <= 0 || getal > 80) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Vaste uren: een getal van 0,5 tot 80." });
      return z.NEVER;
    }
    // Op een half uur, zoals overal in de module.
    return Math.round(getal * 2) / 2;
  });

const kaartschema = z
  .object({
    titel: verplicht("Titel", GRENZEN.titel),
    domein: verplicht("Domein", GRENZEN.domein),
    omschrijving: optioneel("Wat hoort erbij", GRENZEN.omschrijving),
    goedGenoeg: optioneel("Goed genoeg", GRENZEN.goedGenoeg),
    frequentie: z.enum(FREQUENTIES, { errorMap: () => ({ message: "Kies hoe vaak." }) }),
    verdeling: z.enum(VERDELINGEN, { errorMap: () => ({ message: "Kies hoe de kaart verdeeld wordt." }) }),
    vasteUren: uren,
  })
  // Vaste uren horen enkel bij "elk voor zich"; bij een andere verdeling
  // vallen ze weg in plaats van een fout te geven.
  .transform((kaart) => ({ ...kaart, vasteUren: kaart.verdeling === "elk" ? kaart.vasteUren : null }));

export type Leesresultaat = { ok: true; kaart: Kaartinvoer } | { ok: false; fout: string };

/** Controleert wat er uit de dialoog komt. De eerste fout volstaat. */
export function leesKaart(invoer: unknown): Leesresultaat {
  const resultaat = kaartschema.safeParse(invoer);
  if (resultaat.success) return { ok: true, kaart: resultaat.data };
  return { ok: false, fout: resultaat.error.issues[0]?.message ?? "Deze kaart klopt niet." };
}

/** Het bovenschrift van een kaart: "Huishouden · Dagelijks". In hoofdletters via de opmaak. */
export function bovenschrift(kaart: Pick<Kaart, "domein" | "frequentie">): string {
  return `${kaart.domein} · ${FREQUENTIENAMEN[kaart.frequentie]}`;
}

/** Het label bij een kaart die niet via het spel gaat en niet vast bij iemand is. */
export function verdelingslabel(kaart: Pick<Kaart, "verdeling" | "vasteUren">): string | null {
  if (kaart.verdeling === "elk") {
    return kaart.vasteUren === null ? "Elk voor zich" : `Elk voor zich · ${uurtekst(kaart.vasteUren)} elk`;
  }
  if (kaart.verdeling === "samen") return "Samen, telt niet mee";
  return null;
}

/** "5 u", "4,5 u". */
export function uurtekst(uren: number): string {
  return `${String(uren).replace(".", ",")} u`;
}

/** De domeinen die al bestaan, als suggestie in de dialoog: elk één keer, alfabetisch. */
export function domeinen(kaarten: Pick<Kaart, "domein">[]): string[] {
  const gezien = new Map<string, string>();
  for (const { domein } of kaarten) {
    const sleutel = domein.trim().toLocaleLowerCase("nl");
    if (sleutel && !gezien.has(sleutel)) gezien.set(sleutel, domein.trim());
  }
  return [...gezien.values()].sort((a, b) => a.localeCompare(b, "nl"));
}

export function actieveKaarten<T extends Pick<Kaart, "geschrapt">>(kaarten: T[]): T[] {
  return kaarten.filter((kaart) => !kaart.geschrapt);
}

// --- Rondes en stappen -----------------------------------------------------

export const FASES = ["lijst", "inschatten", "bieden", "voorstel", "vastgelegd"] as const;
export type Fase = (typeof FASES)[number];

export const STAPPEN: { fase: Fase; naam: string; ondertitel: string }[] = [
  { fase: "lijst", naam: "Stel activiteitenlijst op", ondertitel: "Welke stromen" },
  { fase: "inschatten", naam: "Inschatten en claimen", ondertitel: "Tijd, last en wat je graag doet" },
  { fase: "bieden", naam: "Bieden", ondertitel: "Wat jullie allebei willen" },
  { fase: "voorstel", naam: "Voorstel", ondertitel: "Samen bijsturen" },
  { fase: "vastgelegd", naam: "Wie heeft wat", ondertitel: "Uitlenen en nieuwe ronde" },
];

/**
 * De stappen die al gebouwd zijn. De module komt er stap voor stap bij (zie
 * huishouden/LEESMIJ.md); zolang een stap er niet is, kan je er ook niet heen.
 */
export const GEBOUWDE_STAPPEN = 1;

export interface Ronde {
  id: number;
  fase: Fase;
  /** Het moment van de laatste wijziging aan de lijst, als ISO-tekst. */
  lijstVersie: string;
}

export interface Lijstakkoord {
  persoon: Persoon;
  /** De lijstversie waarop het akkoord slaat. */
  versie: string | null;
}

/** Twee tijdstippen als hetzelfde moment, ook als de databank ze anders schrijft. */
export function zelfdeVersie(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const [tijdA, tijdB] = [Date.parse(a), Date.parse(b)];
  return Number.isFinite(tijdA) && tijdA === tijdB;
}

/**
 * Wie akkoord is met de lijst zoals ze nu is. Een akkoord op een oudere
 * versie telt niet meer: elke wijziging, door wie dan ook, wist het akkoord
 * van allebei.
 */
export function akkoordMetLijst(ronde: Ronde, akkoorden: Lijstakkoord[]): Record<Persoon, boolean> {
  const geldig = (persoon: Persoon) =>
    akkoorden.some((akkoord) => akkoord.persoon === persoon && zelfdeVersie(akkoord.versie, ronde.lijstVersie));
  return { jan: geldig("jan"), sandra: geldig("sandra") };
}

/** Mag de lijst nog wijzigen? Enkel in stap 1; daarna ligt ze vast tot een nieuwe ronde. */
export function lijstOpen(ronde: Pick<Ronde, "fase">): boolean {
  return ronde.fase === "lijst";
}

export type Beslissing = { ok: true } | { ok: false; reden: string };

/** Mag je akkoord geven? Op een lege lijst niet, en enkel op de versie die je zag. */
export function magAkkoordGeven(ronde: Ronde, gezieneVersie: string, aantalActieveKaarten: number): Beslissing {
  if (!lijstOpen(ronde)) return { ok: false, reden: "De lijst ligt al vast." };
  if (aantalActieveKaarten === 0) return { ok: false, reden: "Voeg eerst een kaart toe." };
  if (!zelfdeVersie(gezieneVersie, ronde.lijstVersie)) {
    return { ok: false, reden: "De lijst is net gewijzigd. Kijk ze nog even na." };
  }
  return { ok: true };
}

/** Mag het spel naar stap 2? Als allebei akkoord zijn met de lijst zoals ze nu is. */
export function magAanDeSlag(ronde: Ronde, akkoorden: Lijstakkoord[], aantalActieveKaarten: number): Beslissing {
  if (!lijstOpen(ronde)) return { ok: false, reden: "Jullie zijn al aan de slag." };
  if (aantalActieveKaarten === 0) return { ok: false, reden: "Voeg eerst een kaart toe." };
  const akkoord = akkoordMetLijst(ronde, akkoorden);
  if (!akkoord.jan || !akkoord.sandra) return { ok: false, reden: "Jullie moeten allebei akkoord zijn met de lijst." };
  return { ok: true };
}

/** Het nummer van de stap (1 tot 5) waarin het gezin nu staat. */
export function stapVan(fase: Fase): number {
  return FASES.indexOf(fase) + 1;
}
