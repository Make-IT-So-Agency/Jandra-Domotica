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
export const GEBOUWDE_FASES: readonly Fase[] = ["lijst", "inschatten", "voorstel", "vastgelegd"];

export function isGebouwd(fase: Fase): boolean {
  return GEBOUWDE_FASES.includes(fase);
}

/** De fase na deze, als die al gebouwd is; stap 3 (bieden) mag ontbreken. */
export function volgendeFase(fase: Fase): Fase | null {
  const volgende = FASES[FASES.indexOf(fase) + 1];
  if (!volgende) return null;
  if (isGebouwd(volgende)) return volgende;
  if (volgende === "bieden" && isGebouwd("voorstel")) return "voorstel";
  return null;
}

export interface Ronde {
  id: number;
  fase: Fase;
  /** Het moment van de laatste wijziging aan de lijst, als ISO-tekst. */
  lijstVersie: string;
  /** Het moment van de laatste wijziging aan het voorstel (stap 4). */
  voorstelVersie: string;
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

// --- Stap 2: inschatten en claimen ------------------------------------------

export const CLAIMS = ["wil", "mag", "liever_niet", "echt_niet"] as const;
export type Claim = (typeof CLAIMS)[number];

export const CLAIMNAMEN: Record<Claim, string> = {
  wil: "Wil ik",
  mag: "Mag",
  liever_niet: "Liever niet",
  echt_niet: "Echt niet",
};

export function isClaim(waarde: unknown): waarde is Claim {
  return (CLAIMS as readonly unknown[]).includes(waarde);
}

export const SCORES = [1, 2, 3, 4, 5] as const;
export type Score = (typeof SCORES)[number];

export function isScore(waarde: unknown): waarde is Score {
  return (SCORES as readonly unknown[]).includes(waarde);
}

/** Fysieke tijd, van score naar uren per week (overdracht, R7). */
export const UREN_PER_SCORE: Record<Score, number> = { 1: 0.5, 2: 1, 3: 2.5, 4: 4, 5: 7 };

/** Wat een score voor fysieke tijd betekent, als tooltip bij het bolletje. */
export const TIJDSCORES: Record<Score, string> = {
  1: "½ u per week",
  2: "1 u per week",
  3: "2 à 3 u per week",
  4: "Een halve dag per week",
  5: "7 u of meer per week",
};

/** Wat er per kaart in te vullen is. */
export interface Vragen {
  claim: boolean;
  tijd: boolean;
  last: boolean;
}

/**
 * Per soort kaart enkel wat van toepassing is (overdracht, stap 2):
 * via het spel alles; vast bij iemand tijd en last; elk voor zich zonder
 * vaste uren enkel tijd; elk voor zich met vaste uren en samen niets.
 */
export function vragenVoor(kaart: Pick<Kaart, "verdeling" | "vasteUren">): Vragen {
  switch (kaart.verdeling) {
    case "spel":
      return { claim: true, tijd: true, last: true };
    case "jan":
    case "sandra":
      return { claim: false, tijd: true, last: true };
    case "elk":
      return { claim: false, tijd: kaart.vasteUren === null, last: false };
    case "samen":
      return { claim: false, tijd: false, last: false };
  }
}

export function heeftVragen(vragen: Vragen): boolean {
  return vragen.claim || vragen.tijd || vragen.last;
}

/** Wat één persoon voor één kaart invulde. */
export interface Invoer {
  claim: Claim | null;
  tijd: Score | null;
  last: Score | null;
}

export const LEGE_INVOER: Invoer = { claim: null, tijd: null, last: null };

export function kaartIngevuld(vragen: Vragen, invoer: Invoer): boolean {
  return (!vragen.claim || invoer.claim !== null) && (!vragen.tijd || invoer.tijd !== null) && (!vragen.last || invoer.last !== null);
}

/** De kaarten waarvoor in stap 2 iets in te vullen is: actief en met vragen. */
export function kaartenOmInTeVullen<T extends Pick<Kaart, "geschrapt" | "verdeling" | "vasteUren">>(kaarten: T[]): T[] {
  return actieveKaarten(kaarten).filter((kaart) => heeftVragen(vragenVoor(kaart)));
}

export interface Voortgang {
  /** Volledig ingevulde kaarten. */
  klaar: number;
  totaal: number;
  tijdIngevuld: boolean;
  /** Alles ingevuld, ook de beschikbare tijd. */
  af: boolean;
}

/** Hoe ver iemand staat met stap 2. */
export function voortgang(
  kaarten: Pick<Kaart, "id" | "geschrapt" | "verdeling" | "vasteUren">[],
  invoer: ReadonlyMap<number, Invoer>,
  beschikbareTijd: number | null,
): Voortgang {
  const inTeVullen = kaartenOmInTeVullen(kaarten);
  const klaar = inTeVullen.filter((kaart) => kaartIngevuld(vragenVoor(kaart), invoer.get(kaart.id) ?? LEGE_INVOER)).length;
  const tijdIngevuld = beschikbareTijd !== null;
  return { klaar, totaal: inTeVullen.length, tijdIngevuld, af: tijdIngevuld && klaar === inTeVullen.length };
}

/** "Jan 7/13", met " · tijd?" zolang de beschikbare tijd ontbreekt. */
export function voortgangstekst(persoon: Persoon, stand: Voortgang): string {
  return `${PERSOONSNAMEN[persoon]} ${stand.klaar}/${stand.totaal}${stand.tijdIngevuld ? "" : " · tijd?"}`;
}

/**
 * De beschikbare tijd uit het invoerveld: een geheel getal van 1 tot 80.
 * Leeg of 0 is "nog niet ingevuld" (null); iets anders is een fout.
 */
export function leesBeschikbareTijd(invoer: unknown): { ok: true; uren: number | null } | { ok: false; fout: string } {
  const tekst = String(invoer ?? "").trim().replace(",", ".");
  if (tekst === "" || tekst === "0") return { ok: true, uren: null };
  const getal = Number(tekst);
  if (!Number.isFinite(getal) || getal < 1 || getal > 80) {
    return { ok: false, fout: "Je beschikbare tijd is een getal van 1 tot 80 uur per week." };
  }
  return { ok: true, uren: Math.round(getal) };
}

/** Mag je in deze fase inschatten en claimen? Vanaf stap 2, ook later nog. */
export function magInschatten(ronde: Pick<Ronde, "fase">): boolean {
  return ronde.fase !== "lijst";
}

/** De scores van de ander zie je pas als het spel verder is dan stap 2. */
export function toonScoresVanAnder(ronde: Pick<Ronde, "fase">): boolean {
  return stapVan(ronde.fase) > 2;
}

/** Mag het spel verder dan stap 2? Als allebei alles ingevuld hebben. */
export function magVerderNaInschatten(ronde: Pick<Ronde, "fase">, stand: Record<Persoon, Voortgang>): Beslissing {
  if (ronde.fase !== "inschatten") return { ok: false, reden: "Jullie zijn al verder." };
  if (!stand.jan.af || !stand.sandra.af) return { ok: false, reden: "Jullie moeten allebei alles ingevuld hebben." };
  return { ok: true };
}

/**
 * Wat de pagina in stap 2 meekrijgt: enkel je eigen keuzes, de voortgang van
 * allebei, en de scores van de ander pas als het spel verder is dan stap 2.
 * De claims van de ander gaan nooit mee.
 */
export interface Stap2Gegevens {
  mijn: Record<number, Invoer>;
  mijnTijd: number | null;
  stand: Record<Persoon, Voortgang>;
  ander: Record<number, Pick<Invoer, "tijd" | "last">> | null;
}
