import type { CategorieKeuze, Keuze, Optie, Voorkeur } from "../keuzes";

/**
 * Welke keuze bepaalt welk materiaal in 3D: de gevelsteen de gevel, de
 * dakbedekking het dak, de ramen het schrijnwerk, de wanden de binnenmuren,
 * en een vloer of tegels de vloer van de ruimtes die eraan gekoppeld zijn.
 * Elke optie met een kleur of een foto kan je in 3D uitproberen, zonder iets
 * te bewaren. Puur.
 */

export type Slot = "gevel" | "dak" | "schrijnwerk" | "binnenmuur" | "vloer";

export const SLOTNAMEN: Record<Slot, string> = {
  gevel: "Gevel",
  dak: "Dak",
  schrijnwerk: "Ramen en deuren",
  binnenmuur: "Binnenmuren",
  vloer: "Vloer",
};

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

const SLOT_VAN: Partial<Record<CategorieKeuze, Slot>> = {
  gevel: "gevel",
  dak: "dak",
  buitenschrijnwerk: "schrijnwerk",
  wanden: "binnenmuur",
  vloeren: "vloer",
  sanitair: "vloer",
};

export interface Proefoptie {
  id: number;
  naam: string;
  kleur: string | null;
  /** Een ondertekende URL van de foto, of null. */
  foto: string | null;
}

export interface Materiaalkeuze {
  keuzeId: number;
  titel: string;
  slot: Slot;
  /** Bij een vloer: de ruimtes waar ze ligt. */
  ruimteIds: number[];
  opties: Proefoptie[];
  /** Wat er standaard getoond wordt: de gekozen optie, anders mijn voorkeur, anders de eerste. */
  standaard: number;
}

/**
 * De keuzes die iets in 3D veranderen, met de opties die een kleur of foto
 * hebben. Een vloer zonder gekoppelde ruimtes hoort nergens: die valt weg.
 * Per slot telt de eerste keuze, behalve bij de vloeren.
 */
export function materiaalkeuzes(
  keuzes: readonly Keuze[],
  opties: readonly Optie[],
  voorkeuren: readonly Voorkeur[],
  fotos: ReadonlyMap<number, string>,
  ik: string,
): Materiaalkeuze[] {
  const uit: Materiaalkeuze[] = [];
  const bezet = new Set<Slot>();
  for (const keuze of keuzes) {
    const slot = SLOT_VAN[keuze.categorie];
    if (!slot) continue;
    if (slot === "vloer" ? keuze.ruimte_ids.length === 0 : bezet.has(slot)) continue;
    const bruikbaar = opties
      .filter((optie) => optie.keuze_id === keuze.id && (optie.kleur || (optie.foto_bestand_id && fotos.has(optie.foto_bestand_id))))
      .map((optie) => ({
        id: optie.id,
        naam: optie.naam,
        kleur: optie.kleur,
        foto: optie.foto_bestand_id ? (fotos.get(optie.foto_bestand_id) ?? null) : null,
      }));
    if (bruikbaar.length === 0) continue;
    const mijn = voorkeuren.find((v) => v.keuze_id === keuze.id && v.wie === ik)?.optie_id;
    const standaard =
      bruikbaar.find((o) => o.id === keuze.gekozen_optie_id)?.id ?? bruikbaar.find((o) => o.id === mijn)?.id ?? bruikbaar[0].id;
    uit.push({ keuzeId: keuze.id, titel: keuze.titel, slot, ruimteIds: keuze.ruimte_ids, opties: bruikbaar, standaard });
    if (slot !== "vloer") bezet.add(slot);
  }
  return uit;
}

/** Wat een materiaal in 3D is: een kleur, en eventueel een foto als textuur. */
export interface Materiaal {
  kleur: string;
  foto: string | null;
}

/**
 * Het materiaal van een slot, met wat er nu uitgeprobeerd wordt (keuze-id naar
 * optie-id). Bij een vloer: het materiaal van die ruimte.
 */
export function materiaalVan(
  slot: Slot,
  keuzes: readonly Materiaalkeuze[],
  proef: ReadonlyMap<number, number>,
  ruimteId?: number,
): Materiaal {
  const keuze = keuzes.find((k) => k.slot === slot && (slot !== "vloer" || (ruimteId !== undefined && k.ruimteIds.includes(ruimteId))));
  const optie = keuze ? keuze.opties.find((o) => o.id === (proef.get(keuze.keuzeId) ?? keuze.standaard)) : undefined;
  return { kleur: optie?.kleur ?? STANDAARDKLEUREN[slot], foto: optie?.foto ?? null };
}
