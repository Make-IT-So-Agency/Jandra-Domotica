/**
 * Meubels en toestellen in het huis, voor het 3D-model: een bed, een zetel,
 * de keuken, een warmtepomp, een regenwaterput. De catalogus staat hier, in de
 * code; de databank kijkt enkel de vorm van de soort na (zie de migratie
 * 20261004120000_bouw_objecten.sql). Puur, voor de server, de browser en de
 * tests.
 *
 * Een stuk staat op een verdieping, in meter in het assenstelsel van het
 * gebouw, zoals een punt: zo overleeft het een nieuwe versie van het plan.
 * - x en y zijn het midden van het stuk op het plan;
 * - z is de onderkant, boven de vloer van de verdieping. Een regenwaterput
 *   zit eronder;
 * - de hoek draait met de klok mee op het plan. Bij hoek 0 staat de rug
 *   bovenaan op het plan en kijkt de voorkant naar beneden;
 * - de breedte loopt van links naar rechts, de diepte van de rug naar voren.
 */

export const INRICHTINGSLAGEN = ["meubels", "toestellen"] as const;
export type Inrichtingslaag = (typeof INRICHTINGSLAGEN)[number];

export const INRICHTINGSLAAGNAMEN: Record<Inrichtingslaag, string> = {
  meubels: "Meubels",
  toestellen: "Toestellen",
};

export const GROEPEN = ["slapen", "zitten", "eten", "keuken", "badkamer", "wassen", "klimaat", "energie", "buiten"] as const;
export type Groep = (typeof GROEPEN)[number];

export const GROEPNAMEN: Record<Groep, string> = {
  slapen: "Slapen",
  zitten: "Zitten",
  eten: "Eten en werken",
  keuken: "Keuken",
  badkamer: "Badkamer",
  wassen: "Wassen",
  klimaat: "Verwarming en ventilatie",
  energie: "Elektriciteit en energie",
  buiten: "Buiten",
};

/** Op welke laag een groep komt: meubels richt je in, toestellen horen bij de technieken. */
export const LAAG_VAN_GROEP: Record<Groep, Inrichtingslaag> = {
  slapen: "meubels",
  zitten: "meubels",
  eten: "meubels",
  keuken: "meubels",
  badkamer: "meubels",
  wassen: "meubels",
  klimaat: "toestellen",
  energie: "toestellen",
  buiten: "toestellen",
};

/** Zachte kleuren per groep, in 3D en in het palet. */
export const GROEPKLEUREN: Record<Groep, string> = {
  slapen: "#c9b8e8",
  zitten: "#a7bfd6",
  eten: "#cfae84",
  keuken: "#e7e1d3",
  badkamer: "#f3f5f6",
  wassen: "#dde3e8",
  klimaat: "#b3d5c1",
  energie: "#f1d39b",
  buiten: "#b7c0c7",
};

/** Hoe een stuk er in 3D uitziet: eenvoudige blokken met een herkenbaar silhouet. */
export type Vorm =
  | "bed"
  | "zetel"
  | "hoekzetel"
  | "tafel"
  | "eettafel"
  | "bureau"
  | "kast"
  | "keuken"
  | "wc"
  | "lavabo"
  | "douche"
  | "bad"
  | "toestel"
  | "cilinder"
  | "buitenunit"
  | "paal"
  | "put";

/**
 * Waar een stuk staat:
 * - vloer: op de vloer, vrij in de ruimte;
 * - muur: tegen de muur, op de vloer of hangend op een hoogte. Bij het
 *   plaatsen gaat de rug tegen de dichtste muur;
 * - buiten: op de grond rond het huis, bij het gelijkvloers;
 * - grond: in de grond, met de bovenkant gelijk met de grond.
 */
export type Plaats = "vloer" | "muur" | "buiten" | "grond";

export interface Stuksoort {
  soort: string;
  naam: string;
  groep: Groep;
  vorm: Vorm;
  plaats: Plaats;
  /** De gewone maat, in meter: breedte, diepte en hoogte. */
  maat: readonly [number, number, number];
  /** Wat aan de muur hangt: de onderkant boven de vloer. */
  z?: number;
}

export const STUKSOORTEN: readonly Stuksoort[] = [
  { soort: "bed_1p", naam: "Eenpersoonsbed", groep: "slapen", vorm: "bed", plaats: "muur", maat: [0.9, 2.0, 0.5] },
  { soort: "bed_2p", naam: "Tweepersoonsbed", groep: "slapen", vorm: "bed", plaats: "muur", maat: [1.6, 2.0, 0.5] },
  { soort: "nachtkastje", naam: "Nachtkastje", groep: "slapen", vorm: "kast", plaats: "muur", maat: [0.45, 0.4, 0.5] },
  { soort: "kleerkast", naam: "Kleerkast", groep: "slapen", vorm: "kast", plaats: "muur", maat: [1.5, 0.6, 2.2] },
  { soort: "zetel_2", naam: "Zetel, twee zitplaatsen", groep: "zitten", vorm: "zetel", plaats: "vloer", maat: [1.6, 0.9, 0.85] },
  { soort: "zetel_3", naam: "Zetel, drie zitplaatsen", groep: "zitten", vorm: "zetel", plaats: "vloer", maat: [2.2, 0.95, 0.85] },
  { soort: "hoekzetel", naam: "Hoekzetel", groep: "zitten", vorm: "hoekzetel", plaats: "vloer", maat: [2.7, 1.9, 0.85] },
  { soort: "salontafel", naam: "Salontafel", groep: "zitten", vorm: "tafel", plaats: "vloer", maat: [1.1, 0.6, 0.4] },
  { soort: "tv_meubel", naam: "Tv-meubel", groep: "zitten", vorm: "kast", plaats: "muur", maat: [1.8, 0.45, 0.5] },
  { soort: "kast", naam: "Kast", groep: "zitten", vorm: "kast", plaats: "muur", maat: [1.0, 0.4, 2.0] },
  { soort: "eettafel", naam: "Eettafel met stoelen", groep: "eten", vorm: "eettafel", plaats: "vloer", maat: [1.8, 0.9, 0.75] },
  { soort: "bureau", naam: "Bureau", groep: "eten", vorm: "bureau", plaats: "muur", maat: [1.4, 0.7, 0.75] },
  { soort: "keuken_onder", naam: "Onderkasten met werkblad", groep: "keuken", vorm: "keuken", plaats: "muur", maat: [2.4, 0.62, 0.9] },
  { soort: "keuken_hoog", naam: "Hoge kast", groep: "keuken", vorm: "kast", plaats: "muur", maat: [0.6, 0.62, 2.2] },
  { soort: "keukeneiland", naam: "Keukeneiland", groep: "keuken", vorm: "keuken", plaats: "vloer", maat: [2.0, 1.0, 0.9] },
  { soort: "wc", naam: "Wc", groep: "badkamer", vorm: "wc", plaats: "muur", maat: [0.4, 0.6, 0.8] },
  { soort: "lavabo", naam: "Lavabo", groep: "badkamer", vorm: "lavabo", plaats: "muur", maat: [0.6, 0.48, 0.85] },
  { soort: "lavabo_dubbel", naam: "Dubbele lavabo", groep: "badkamer", vorm: "lavabo", plaats: "muur", maat: [1.2, 0.48, 0.85] },
  { soort: "douche", naam: "Douche", groep: "badkamer", vorm: "douche", plaats: "muur", maat: [0.9, 0.9, 2.0] },
  { soort: "bad", naam: "Bad", groep: "badkamer", vorm: "bad", plaats: "muur", maat: [1.7, 0.75, 0.6] },
  { soort: "wasmachine", naam: "Wasmachine", groep: "wassen", vorm: "toestel", plaats: "muur", maat: [0.6, 0.6, 0.85] },
  { soort: "droogkast", naam: "Droogkast", groep: "wassen", vorm: "toestel", plaats: "muur", maat: [0.6, 0.6, 0.85] },
  { soort: "warmtepomp_binnen", naam: "Warmtepomp, binnenunit", groep: "klimaat", vorm: "toestel", plaats: "muur", maat: [0.6, 0.7, 1.8] },
  { soort: "ventilatie", naam: "Ventilatie-unit", groep: "klimaat", vorm: "toestel", plaats: "muur", maat: [0.75, 0.6, 0.85], z: 0.5 },
  { soort: "boiler", naam: "Boiler", groep: "klimaat", vorm: "cilinder", plaats: "muur", maat: [0.6, 0.6, 1.6] },
  { soort: "buffervat", naam: "Buffervat", groep: "klimaat", vorm: "cilinder", plaats: "vloer", maat: [0.65, 0.65, 1.5] },
  { soort: "meterkast", naam: "Meterkast", groep: "energie", vorm: "kast", plaats: "muur", maat: [0.6, 0.25, 0.9], z: 0.5 },
  { soort: "verdeelkast", naam: "Verdeelkast", groep: "energie", vorm: "kast", plaats: "muur", maat: [0.55, 0.12, 0.8], z: 1.0 },
  { soort: "thuisbatterij", naam: "Thuisbatterij", groep: "energie", vorm: "toestel", plaats: "muur", maat: [0.75, 0.2, 1.15] },
  { soort: "omvormer", naam: "Omvormer", groep: "energie", vorm: "toestel", plaats: "muur", maat: [0.45, 0.2, 0.6], z: 1.2 },
  { soort: "wallbox", naam: "Laadpunt aan de muur", groep: "energie", vorm: "toestel", plaats: "muur", maat: [0.3, 0.15, 0.4], z: 0.9 },
  { soort: "warmtepomp_buiten", naam: "Warmtepomp, buitenunit", groep: "buiten", vorm: "buitenunit", plaats: "buiten", maat: [1.1, 0.45, 0.95] },
  { soort: "laadpaal", naam: "Laadpaal", groep: "buiten", vorm: "paal", plaats: "buiten", maat: [0.3, 0.3, 1.3] },
  { soort: "regenwaterput", naam: "Regenwaterput", groep: "buiten", vorm: "put", plaats: "grond", maat: [1.9, 1.9, 2.1] },
];

const PER_SOORT = new Map(STUKSOORTEN.map((s) => [s.soort, s]));

export function soortStuk(soort: string): Stuksoort | null {
  return PER_SOORT.get(soort) ?? null;
}

/** Op welke laag een stuk komt; een onbekende soort is een meubel. */
export function laagVan(soort: string): Inrichtingslaag {
  const gekend = soortStuk(soort);
  return gekend ? LAAG_VAN_GROEP[gekend.groep] : "meubels";
}

export interface Stuk {
  /** Uit de databank; negatief zolang het niet bewaard is. */
  id: number;
  soort: string;
  x: number;
  y: number;
  /** De onderkant, boven de vloer van de verdieping. */
  z: number;
  /** Graden, met de klok mee op het plan. */
  hoek: number;
  /** Graden: hoe schuin het ligt, zoals zonnepanelen op een hellend dak. */
  kanteling: number;
  breedte: number;
  diepte: number;
  hoogte: number;
  label: string | null;
}

/** Een stuk met de verdieping waar het staat. */
export interface GeplaatstStuk extends Stuk {
  verdiepingId: number;
}

/** Hoeveel stukken een verdieping hoogstens heeft. */
export const MAX_STUKKEN = 300;
/** De grootste maat van een stuk, in meter. */
export const MAX_MAAT = 30;
/** Hoe lang een label mag zijn. */
export const MAX_LABEL = 80;

/** Een hoek tussen -180 (niet inbegrepen) en 180 graden, op een tiende. */
export function hoekVan(graden: number): number {
  const rest = (((graden % 360) + 540) % 360) - 180;
  const rond = Math.round(rest * 10) / 10;
  return rond === -180 ? 180 : rond === 0 ? 0 : rond;
}

const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;
const cm = (waarde: number) => Math.round(waarde * 100) / 100;

/**
 * Een nieuw stuk van deze soort, met zijn midden op dit punt. `grond` is waar
 * de grond ligt tegenover de vloer van de verdieping (negatief): daar staat
 * iets buiten op, en een put zit eronder.
 */
export function nieuwStuk(soort: Stuksoort, [x, y]: readonly [number, number], id: number, grond: number): Stuk {
  const [breedte, diepte, hoogte] = soort.maat;
  const z = soort.plaats === "buiten" ? grond : soort.plaats === "grond" ? grond - hoogte : (soort.z ?? 0);
  return { id, soort: soort.soort, x: mm(x), y: mm(y), z: cm(z), hoek: 0, kanteling: 0, breedte, diepte, hoogte, label: null };
}

const getal = (ruw: unknown, min: number, max: number): number | null => {
  const waarde = typeof ruw === "string" && ruw.trim() !== "" ? Number(ruw) : ruw;
  return typeof waarde === "number" && Number.isFinite(waarde) && waarde >= min && waarde <= max ? waarde : null;
};

/** Een label: zonder witruimte rond, hoogstens 80 tekens; leeg wordt null. */
export function schoonLabel(ruw: unknown): string | null {
  if (typeof ruw !== "string") return null;
  const schoon = ruw.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
  return schoon.length > 0 ? schoon : null;
}

/**
 * Wat bewaard of ingestuurd werd, als stukken. Een stuk van een onbekende
 * soort, of met een maat die niet klopt, valt weg; de rest wordt afgerond
 * zoals de databank het bewaart.
 */
export function schoneStukken(ruw: unknown): Stuk[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Stuk[] = [];
  for (const item of ruw as Record<string, unknown>[]) {
    if (uit.length >= MAX_STUKKEN) break;
    if (!item || typeof item !== "object" || typeof item.soort !== "string" || !soortStuk(item.soort)) continue;
    const id = getal(item.id, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    const x = getal(item.x, -1000, 1000);
    const y = getal(item.y, -1000, 1000);
    const z = getal(item.z, -10, 30);
    const hoek = getal(item.hoek, -100000, 100000);
    const kanteling = getal(item.kanteling ?? 0, 0, 90);
    const breedte = getal(item.breedte, 0.01, MAX_MAAT);
    const diepte = getal(item.diepte, 0.01, MAX_MAAT);
    const hoogte = getal(item.hoogte, 0.01, MAX_MAAT);
    if (id === null || !Number.isInteger(id) || id === 0) continue;
    if (x === null || y === null || z === null || hoek === null || kanteling === null) continue;
    if (breedte === null || diepte === null || hoogte === null) continue;
    uit.push({
      id,
      soort: item.soort,
      x: mm(x),
      y: mm(y),
      z: cm(z),
      hoek: hoekVan(hoek),
      kanteling: Math.round(kanteling * 10) / 10,
      // Op een centimeter, maar nooit nul.
      breedte: Math.max(0.01, cm(breedte)),
      diepte: Math.max(0.01, cm(diepte)),
      hoogte: Math.max(0.01, cm(hoogte)),
      label: schoonLabel(item.label),
    });
  }
  return uit;
}

/** De maat als tekst, in centimeter: "160 × 200 cm, 50 hoog". */
export function maattekst(stuk: Pick<Stuk, "breedte" | "diepte" | "hoogte">): string {
  const c = (m: number) => String(Math.round(m * 100));
  return `${c(stuk.breedte)} × ${c(stuk.diepte)} cm, ${c(stuk.hoogte)} hoog`;
}
