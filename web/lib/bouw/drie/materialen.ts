import { MET_VOEG, STANDAARDKEUZES, isPatroon, type CategorieKeuze, type Keuze, type Optie, type Patroon, type Voorkeur } from "../keuzes";

/**
 * Welke keuze bepaalt welk materiaal in 3D: de gevelsteen de gevel, de
 * dakbedekking het dak, de ramen het schrijnwerk, de wanden de binnenmuren,
 * en een vloer of tegels de vloer van de ruimtes die eraan gekoppeld zijn.
 * Elke optie met een kleur, een foto of een patroon kan je in 3D uitproberen,
 * net als de stalen (zie stalen.ts) en een eigen kleur. Uitproberen bewaart
 * niets; bewaren maakt er een optie van bij de keuze. Puur.
 */

export type Slot = "gevel" | "dak" | "schrijnwerk" | "binnenmuur" | "vloer";

export const SLOTS: readonly Slot[] = ["gevel", "dak", "schrijnwerk", "binnenmuur", "vloer"];

export const SLOTNAMEN: Record<Slot, string> = {
  gevel: "Gevel",
  dak: "Dak",
  schrijnwerk: "Ramen en deuren",
  binnenmuur: "Binnenmuren",
  vloer: "Vloer",
};

export function isSlot(waarde: unknown): waarde is Slot {
  return (SLOTS as readonly unknown[]).includes(waarde);
}

/** Wat er staat zolang er niets gekozen is. */
export const STANDAARDKLEUREN: Record<
  Slot | "plaat" | "plafond" | "muurtop" | "glas" | "grond" | "dakrand" | "trap" | "binnendeur" | "deurboog" | "luifel",
  string
> = {
  gevel: "#a65a3a",
  dak: "#3d4248",
  schrijnwerk: "#2e3238",
  binnenmuur: "#f3f0e9",
  vloer: "#cbbfa9",
  plaat: "#a3a3a3",
  plafond: "#fafafa",
  muurtop: "#d9d4cb",
  glas: "#9fc3e0",
  grond: "#7d9f5c",
  dakrand: "#5b6066",
  trap: "#b08a5c",
  binnendeur: "#ebe6dc",
  deurboog: "#7a7f86",
  // Zichtbeton.
  luifel: "#c7c5c0",
};

export const SLOT_VAN: Partial<Record<CategorieKeuze, Slot>> = {
  gevel: "gevel",
  dak: "dak",
  buitenschrijnwerk: "schrijnwerk",
  wanden: "binnenmuur",
  vloeren: "vloer",
  sanitair: "vloer",
};

/**
 * De keuze die een slot volgt, met haar categorie: is ze er nog niet, dan
 * maakt bewaren ze zo. Een vloer krijgt een keuze per ruimte, "Vloer badkamer".
 */
export const KEUZE_VAN_SLOT: Record<Slot, { titel: string; categorie: CategorieKeuze }> = {
  gevel: { titel: "Gevelsteen", categorie: "gevel" },
  dak: { titel: "Dakbedekking", categorie: "dak" },
  schrijnwerk: { titel: "Ramen en buitendeuren", categorie: "buitenschrijnwerk" },
  binnenmuur: { titel: "Binnenmuren", categorie: "wanden" },
  vloer: { titel: "Vloer", categorie: "vloeren" },
};

/** De titel van een nieuwe vloerkeuze voor één ruimte: "Vloer badkamer", ook voor BADKAMER of Badkamer. */
export function vloertitel(ruimtenaam: string): string {
  const naam = ruimtenaam.trim().replace(/\s+/g, " ");
  if (!naam) return "Vloer";
  const klein = naam === naam.toUpperCase() ? naam.toLowerCase() : `${naam.charAt(0).toLowerCase()}${naam.slice(1)}`;
  return `Vloer ${klein}`;
}

const kaal = (titel: string) => titel.trim().toLowerCase().replace(/\s+/g, " ");

/** Draagt de keuze de titel van haar slot, of begint ze ermee ("Gevelsteen en voeg")? */
function isSlottitel(slot: Slot, titel: string): boolean {
  const gezocht = kaal(KEUZE_VAN_SLOT[slot].titel);
  const t = kaal(titel);
  return t === gezocht || t.startsWith(`${gezocht} `);
}

/** De gewone keuzes die geen materiaal van een slot zijn: Voegwerk, Dakgoten, Voordeur, Zonwering... */
const ANDERE_TITELS = new Set(STANDAARDKEUZES.map((standaard) => kaal(standaard.titel)));

/**
 * De keuze van een plek. Bij een vloer: de eerste keuze waar de ruimte aan
 * gekoppeld is, met voorrang voor een keuze met opties om uit te proberen.
 * Anders de keuze met de titel van het slot (Gevelsteen, Dakbedekking...), of
 * de eerste van het slot met opties, behalve een andere gewone keuze: het
 * voegwerk is geen gevel, de voordeur niet alle ramen. Null: er is er nog geen.
 */
export function keuzeVoorPlek<K extends Pick<Keuze, "id" | "titel" | "categorie" | "ruimte_ids">>(
  slot: Slot,
  ruimteId: number | null,
  keuzes: readonly K[],
  metOpties: (keuzeId: number) => boolean,
): K | null {
  const kandidaten = keuzes.filter((keuze) => SLOT_VAN[keuze.categorie] === slot);
  if (slot === "vloer") {
    if (ruimteId === null) return null;
    const metRuimte = kandidaten.filter((keuze) => keuze.ruimte_ids.includes(ruimteId));
    return metRuimte.find((keuze) => metOpties(keuze.id)) ?? metRuimte[0] ?? null;
  }
  return (
    kandidaten.find((keuze) => isSlottitel(slot, keuze.titel)) ??
    kandidaten.find((keuze) => metOpties(keuze.id) && !ANDERE_TITELS.has(kaal(keuze.titel))) ??
    null
  );
}

/** Wat een materiaal in 3D is: een kleur, en eventueel een foto of een patroon. */
export interface Materiaal {
  kleur: string;
  /** Een foto als textuur: een ondertekende URL. */
  foto: string | null;
  /** Een patroon op echte schaal (zie stalen.ts); gaat voor de foto. */
  patroon: Patroon | null;
  /** De kleur van de voeg, bij baksteen en tegels. */
  voegkleur: string | null;
}

export interface Proefoptie {
  id: number;
  naam: string;
  kleur: string | null;
  /** Een ondertekende URL van de foto, of null. */
  foto: string | null;
  patroon: Patroon | null;
  voegkleur: string | null;
}

export interface Materiaalkeuze {
  keuzeId: number;
  titel: string;
  slot: Slot;
  /** Bij een vloer: de ruimtes waar ze ligt. */
  ruimteIds: number[];
  /** De opties met een kleur, foto of patroon: die kan je in 3D uitproberen. Ook leeg: dan komt een bewaard materiaal hier. */
  opties: Proefoptie[];
  /** Wat er standaard getoond wordt: de gekozen optie, anders mijn voorkeur, anders de eerste. Null zonder opties. */
  standaard: number | null;
}

/** Kan je deze optie in 3D tonen? */
export function isTeTonen(optie: Pick<Optie, "kleur" | "patroon" | "foto_bestand_id">, fotos?: ReadonlyMap<number, string>): boolean {
  if (optie.kleur || optie.patroon) return true;
  if (!optie.foto_bestand_id) return false;
  return fotos ? fotos.has(optie.foto_bestand_id) : true;
}

/**
 * De keuzes die iets in 3D veranderen, met de opties die je kan tonen: per
 * slot de keuze van keuzeVoorPlek, en alle vloerkeuzes met ruimtes. Een vloer
 * zonder gekoppelde ruimtes hoort nergens: die valt weg.
 */
export function materiaalkeuzes(
  keuzes: readonly Keuze[],
  opties: readonly Optie[],
  voorkeuren: readonly Voorkeur[],
  fotos: ReadonlyMap<number, string>,
  ik: string,
): Materiaalkeuze[] {
  const bruikbaar = new Map<number, Proefoptie[]>();
  for (const optie of opties) {
    if (!isTeTonen(optie, fotos)) continue;
    const lijst = bruikbaar.get(optie.keuze_id) ?? [];
    lijst.push({
      id: optie.id,
      naam: optie.naam,
      kleur: optie.kleur,
      foto: optie.foto_bestand_id ? (fotos.get(optie.foto_bestand_id) ?? null) : null,
      patroon: optie.patroon,
      voegkleur: optie.voegkleur,
    });
    bruikbaar.set(optie.keuze_id, lijst);
  }
  const metOpties = (keuzeId: number) => (bruikbaar.get(keuzeId)?.length ?? 0) > 0;
  const gekozen = new Set<number>();
  for (const slot of SLOTS) {
    if (slot === "vloer") continue;
    const keuze = keuzeVoorPlek(slot, null, keuzes, metOpties);
    if (keuze) gekozen.add(keuze.id);
  }
  return keuzes
    .filter((keuze) => {
      const slot = SLOT_VAN[keuze.categorie];
      return slot === "vloer" ? keuze.ruimte_ids.length > 0 : gekozen.has(keuze.id);
    })
    .map((keuze) => {
      const lijst = bruikbaar.get(keuze.id) ?? [];
      const mijn = voorkeuren.find((v) => v.keuze_id === keuze.id && v.wie === ik)?.optie_id;
      const standaard = lijst.find((o) => o.id === keuze.gekozen_optie_id)?.id ?? lijst.find((o) => o.id === mijn)?.id ?? lijst[0]?.id ?? null;
      return { keuzeId: keuze.id, titel: keuze.titel, slot: SLOT_VAN[keuze.categorie]!, ruimteIds: keuze.ruimte_ids, opties: lijst, standaard };
    });
}

/**
 * De keuze van een plek in 3D, met dezelfde regel als keuzeVoorPlek: buiten
 * de vloer koos de server al één keuze per slot.
 */
export function keuzeVan(slot: Slot, keuzes: readonly Materiaalkeuze[], ruimteId?: number): Materiaalkeuze | null {
  if (slot !== "vloer") return keuzes.find((keuze) => keuze.slot === slot) ?? null;
  if (ruimteId === undefined) return null;
  const metRuimte = keuzes.filter((keuze) => keuze.slot === "vloer" && keuze.ruimteIds.includes(ruimteId));
  return metRuimte.find((keuze) => keuze.opties.length > 0) ?? metRuimte[0] ?? null;
}

/** Wat er op een plek uitgeprobeerd wordt: een optie van haar keuze, een staal, of een eigen kleur. */
export interface Proef {
  naam: string;
  materiaal: Materiaal;
  /** De optie van de keuze, of null: nog niet bewaard. */
  optieId: number | null;
}

/** Een plek in de proef: het slot, en bij een vloer elke ruimte apart ("vloer:12"). Zo heet ook het materiaal in de scène. */
export function proefsleutel(slot: Slot, ruimteId?: number): string {
  return slot === "vloer" ? `vloer:${ruimteId ?? 0}` : slot;
}

export function alsMateriaal(optie: Omit<Proefoptie, "id" | "naam">, slot: Slot): Materiaal {
  return {
    kleur: optie.kleur ?? STANDAARDKLEUREN[slot],
    foto: optie.foto,
    patroon: optie.patroon,
    voegkleur: optie.patroon && MET_VOEG.includes(optie.patroon) ? optie.voegkleur : null,
  };
}

/** Zien twee materialen er in 3D hetzelfde uit? */
export function zelfdeMateriaal(a: Materiaal, b: Materiaal): boolean {
  return a.kleur === b.kleur && a.foto === b.foto && a.patroon === b.patroon && (a.voegkleur ?? null) === (b.voegkleur ?? null);
}

export interface Getoond {
  materiaal: Materiaal;
  /** De naam van de optie of het staal; null bij de standaardkleur. */
  naam: string | null;
  /** De optie die getoond wordt, of null. */
  optieId: number | null;
  bron: "proef" | "keuze" | "standaard";
}

/**
 * Wat er op een plek te zien is: wat er uitgeprobeerd wordt, anders de optie
 * van de keuze, anders de standaardkleur. Bij een vloer: die van de ruimte.
 */
export function materiaalVan(slot: Slot, keuzes: readonly Materiaalkeuze[], proef: ReadonlyMap<string, Proef>, ruimteId?: number): Getoond {
  const uitgeprobeerd = proef.get(proefsleutel(slot, ruimteId));
  if (uitgeprobeerd) return { materiaal: uitgeprobeerd.materiaal, naam: uitgeprobeerd.naam, optieId: uitgeprobeerd.optieId, bron: "proef" };
  const keuze = keuzeVan(slot, keuzes, ruimteId);
  const optie = keuze?.opties.find((o) => o.id === keuze.standaard);
  if (optie) return { materiaal: alsMateriaal(optie, slot), naam: optie.naam, optieId: optie.id, bron: "keuze" };
  return { materiaal: { kleur: STANDAARDKLEUREN[slot], foto: null, patroon: null, voegkleur: null }, naam: null, optieId: null, bron: "standaard" };
}

/** Een eigen kleur of staal is misschien al een optie van de keuze: dan die. */
export function bewaardAls(keuze: Materiaalkeuze | null, materiaal: Materiaal): Proefoptie | null {
  return keuze?.opties.find((optie) => zelfdeMateriaal(alsMateriaal(optie, keuze.slot), materiaal)) ?? null;
}

/** Wat een plek bewaren vraagt, nagekeken: de browser stuurt het. */
export interface Materiaalvraag {
  slot: Slot;
  /** Bij een vloer: de ruimte die aangetikt werd. */
  ruimteId: number | null;
  /** De keuze die 3D toont, of null: dan zoekt of maakt de server ze. */
  keuzeId: number | null;
  naam: string;
  kleur: string;
  patroon: Patroon | null;
  voegkleur: string | null;
}

const KLEUR = /^#[0-9a-f]{6}$/;
const positief = (waarde: unknown): number | null => (typeof waarde === "number" && Number.isInteger(waarde) && waarde > 0 ? waarde : null);

export function schoneMateriaalvraag(vraag: unknown): Materiaalvraag | null {
  if (!vraag || typeof vraag !== "object") return null;
  const v = vraag as Record<string, unknown>;
  if (!isSlot(v.slot)) return null;
  const ruimteId = positief(v.ruimteId);
  if (v.slot === "vloer" ? ruimteId === null : v.ruimteId !== null && v.ruimteId !== undefined) return null;
  const keuzeId = v.keuzeId === null || v.keuzeId === undefined ? null : positief(v.keuzeId);
  if (v.keuzeId !== null && v.keuzeId !== undefined && keuzeId === null) return null;
  const naam = typeof v.naam === "string" ? v.naam.trim().replace(/\s+/g, " ") : "";
  if (naam.length < 1 || naam.length > 80) return null;
  const kleur = typeof v.kleur === "string" ? v.kleur.toLowerCase() : "";
  if (!KLEUR.test(kleur)) return null;
  if (v.patroon !== null && v.patroon !== undefined && !isPatroon(v.patroon)) return null;
  const patroon = isPatroon(v.patroon) ? v.patroon : null;
  const voeg = typeof v.voegkleur === "string" ? v.voegkleur.toLowerCase() : null;
  if (voeg !== null && !KLEUR.test(voeg)) return null;
  return {
    slot: v.slot,
    ruimteId: v.slot === "vloer" ? ruimteId : null,
    keuzeId,
    naam,
    kleur,
    patroon,
    voegkleur: patroon && MET_VOEG.includes(patroon) ? voeg : null,
  };
}
