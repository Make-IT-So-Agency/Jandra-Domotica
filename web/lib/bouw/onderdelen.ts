import { RECHTEN_LINK, type RechtLink } from "./linkregels";
import type { SoortHuis } from "./types";

/**
 * Wat een huis van elk soort heeft. Een nieuwbouw en een verbouwing hebben
 * alles. Een bestaand huis heeft geen keuzes, planning en werf: daar wordt
 * niet (meer) gebouwd. Het soort kan later wijzigen; wat er al was, blijft
 * bewaard en komt terug met het soort.
 *
 * Puur: het menu in de browser gebruikt dit ook.
 */

export const BOUWONDERDELEN = ["keuzes", "planning", "werf"] as const;

export type Bouwonderdeel = (typeof BOUWONDERDELEN)[number];

const ZONDER: Record<SoortHuis, readonly Bouwonderdeel[]> = {
  nieuwbouw: [],
  verbouwing: [],
  bestaand: BOUWONDERDELEN,
};

export const ONDERDEELNAMEN: Record<Bouwonderdeel, string> = {
  keuzes: "Keuzes",
  planning: "Planning",
  werf: "Werf",
};

export function heeftOnderdeel(soort: SoortHuis, onderdeel: Bouwonderdeel): boolean {
  return !ZONDER[soort].includes(onderdeel);
}

/** Waarom een huis dit onderdeel niet heeft, of null als het het wel heeft. */
export function nietVoorSoort(huis: { naam: string; soort: SoortHuis }, onderdeel: Bouwonderdeel): string | null {
  if (heeftOnderdeel(huis.soort, onderdeel)) return null;
  return `${huis.naam} is een bestaand huis: dat heeft geen ${ONDERDEELNAMEN[onderdeel].toLowerCase()}. Wordt er toch gebouwd of verbouwd, wijzig dan het soort bij Huizen.`;
}

/** Het onderdeel van een deel van een adres, bv. "/werf/dagboek" is de werf. */
export function onderdeelVan(deel: string): Bouwonderdeel | null {
  const eerste = deel.split(/[/?#]/).filter(Boolean)[0];
  return (BOUWONDERDELEN as readonly string[]).includes(eerste ?? "") ? (eerste as Bouwonderdeel) : null;
}

/** Welk onderdeel een recht van een link nodig heeft; de oplevering hoort bij de werf. */
const RECHT_VAN_ONDERDEEL: Partial<Record<RechtLink, Bouwonderdeel>> = {
  keuzes: "keuzes",
  planning: "planning",
  oplevering: "werf",
};

/** De rechten die een link voor een huis van dit soort kan krijgen. */
export function rechtenVoorSoort(soort: SoortHuis): RechtLink[] {
  return RECHTEN_LINK.filter((recht) => {
    const onderdeel = RECHT_VAN_ONDERDEEL[recht];
    return !onderdeel || heeftOnderdeel(soort, onderdeel);
  });
}

/** Houdt van de rechten enkel over wat bij dit soort huis past. */
export function rechtenBinnenSoort(rechten: readonly RechtLink[], soort: SoortHuis): RechtLink[] {
  const mogelijk = new Set(rechtenVoorSoort(soort));
  return rechten.filter((recht) => mogelijk.has(recht));
}
