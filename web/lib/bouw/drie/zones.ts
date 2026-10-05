import { oppervlakte } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import { LATEI, hartVan, type Gat } from "./gaten";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * De kleine zones zonder ruimte op het plan: een traphal, een kast, een
 * schacht. Ze liggen ingesloten in de voetafdruk, maar de omzetting maakte er
 * geen ruimte van, want er stond geen oppervlakte bij. Ze horen bij binnen.
 *
 * Puur, in meter, in het assenstelsel van het gebouw.
 */

/**
 * Een ingesloten zone zonder ruimte op het plan, tot zo groot (m²), hoort bij
 * binnen: een trapzone, een kast, een schacht. Een grotere is een patio.
 */
export const KLEINE_ZONE = 12;

/** De kleine zones in een voetafdruk: haar gaten tot KLEINE_ZONE. */
export function kleineZones(voetafdruk: readonly Veelhoek[]): Veelhoek[] {
  return voetafdruk
    .flatMap((veelhoek) => veelhoek.slice(1))
    .filter((ring) => Math.abs(oppervlakte(ring)) <= KLEINE_ZONE)
    .map((ring): Veelhoek => [ring]);
}

/**
 * Een opening naar een kleine zone, zoals van de inkom naar de traphal, gaat
 * naar binnen. vindGaten ziet achter zo'n opening geen ruimte, en houdt ze
 * voor een raam of een buitendeur. Ze wordt een doorgang, of een deur als ze
 * een blad heeft.
 */
export function naarZones(gaten: readonly Gat[], zones: readonly Veelhoek[], plafond: number): Gat[] {
  if (zones.length === 0) return [...gaten];
  return gaten.map((gat): Gat => {
    if (gat.soort !== "raam" && gat.soort !== "buitendeur") return gat;
    const hart = hartVan(gat);
    const achter: Xy = [hart[0] + gat.n[0] * (gat.dikte / 2 + 0.12), hart[1] + gat.n[1] * (gat.dikte / 2 + 0.12)];
    if (!binnenVeelhoeken(achter, zones)) return gat;
    if (gat.bladen && gat.bladen.length > 0) return { ...gat, soort: "deur" };
    return { ...gat, soort: "doorgang", onder: 0, boven: Math.min(LATEI, plafond - 0.05) };
  });
}
