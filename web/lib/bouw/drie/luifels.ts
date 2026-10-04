import { afstandTotRing, nettoOppervlakte } from "../omzetting/geometrie";
import { dichtstePlek, langsDeRing } from "../omzetting/luifels";
import type { Xy } from "../omzetting/types";
import type { Gat } from "./gaten";
import { binnenVeelhoeken, verschil, type Veelhoek } from "./vlak";

/**
 * Een luifel in 3D: een afdak of een overdekt terras tegen de gevel, een
 * plaat buiten het huis. Van het plan (de omzetting bewaarde de lijn in
 * streepjes) of zelf gezet bij Verbeteren.
 *
 * De omzetting kent enkel de lijn, van de gevel tot weer op de gevel. Hier
 * wordt ze gesloten langs de gevel: zo volgt een luifel die rond een hoek
 * loopt die hoek, en valt weg wat binnen ligt.
 *
 * De onderkant: zoals op de gevels van de architect, tegen de bovenkant van
 * de ramen en deuren eronder. Zonder ramen of deuren: het plafond.
 *
 * Puur, in meter, in het assenstelsel van het gebouw.
 */

/** Een luifel zoals de omzetting ze bewaarde: de lijn in streepjes, van de gevel tot weer op de gevel, en de diepte. */
export interface Gekendeluifel {
  lijn: Xy[];
  diepte: number;
}

/** Zo dik is een luifel als niemand iets anders zegt. */
export const LUIFELDIKTE = 0.3;
/** Kleiner dan dit (m²) is geen luifel meer. */
export const MIN_LUIFEL = 0.05;
/** Zo ver mag een uiteinde van de lijn van de gevel liggen om er langs te sluiten. */
const TEGEN_GEVEL = 0.5;
/** Een raam of deur telt voor de onderkant als haar buitenkant zo dicht bij de luifel ligt. */
const BIJ_LUIFEL = 0.3;

const groot = (veelhoeken: Veelhoek[]) => veelhoeken.filter((veelhoek) => nettoOppervlakte(veelhoek) >= MIN_LUIFEL);

/**
 * Het vlak van een luifel van het plan: de lijn, gesloten langs de rand van
 * de voetafdruk (de kortste kant om), min wat binnen ligt. Liggen de
 * uiteinden niet tegen de gevel, dan rechtdoor gesloten.
 */
export function sluitLuifel(lijn: readonly Xy[], voetafdruk: readonly Veelhoek[]): Veelhoek[] {
  if (lijn.length < 2) return [];
  const ringen = voetafdruk.flat();
  const begin = dichtstePlek(lijn[0], ringen);
  const einde = dichtstePlek(lijn[lijn.length - 1], ringen);
  const langsGevel = begin && einde && begin.afstand <= TEGEN_GEVEL && einde.afstand <= TEGEN_GEVEL && begin.ring === einde.ring;
  const ring: Xy[] = langsGevel ? [begin.punt, ...lijn.slice(1, -1), einde.punt, ...langsDeRing(einde, begin)] : [...lijn];
  if (ring.length < 3) return [];
  return groot(verschil([[ring]], [...voetafdruk]));
}

/** Ligt p in de veelhoeken, of er hoogstens `marge` naast? */
function dichtbij(p: Xy, veelhoeken: readonly Veelhoek[], marge: number): boolean {
  if (binnenVeelhoeken(p, veelhoeken)) return true;
  return veelhoeken.some((veelhoek) => veelhoek.some((ring) => afstandTotRing(p, ring) <= marge));
}

/**
 * Waar de onderkant van een luifel komt als niemand ze gaf, boven de vloer:
 * de hoogste bovenkant van de ramen en buitendeuren waarvan de buitenkant
 * tegen de luifel ligt. Zonder: het plafond.
 */
export function onderkantVanLuifel(veelhoeken: readonly Veelhoek[], gaten: readonly Gat[], plafond: number): number {
  let hoogste: number | null = null;
  for (const gat of gaten) {
    if (gat.soort !== "raam" && gat.soort !== "buitendeur") continue;
    // De buitenkant van de opening: het begin, het midden en het einde.
    const buiten = [0, 0.5, 1].map((t): Xy => [
      gat.a[0] + (gat.b[0] - gat.a[0]) * t + gat.n[0] * gat.dikte,
      gat.a[1] + (gat.b[1] - gat.a[1]) * t + gat.n[1] * gat.dikte,
    ]);
    if (buiten.some((p) => dichtbij(p, veelhoeken, BIJ_LUIFEL))) hoogste = Math.max(hoogste ?? 0, gat.boven);
  }
  return hoogste ?? plafond;
}
