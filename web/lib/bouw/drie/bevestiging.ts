import type { Xy } from "../omzetting/types";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * Waar een punt in 3D hangt, zodat het herkenbaar is: een stopcontact als
 * plaatje tegen de muur, een lichtpunt als rozet aan het plafond, een
 * vloerputje in de vloer. Een punt ligt in meter in het assenstelsel van het
 * gebouw, met een hoogte boven de vloer, of geen hoogte voor het plafond (zie
 * punten.ts).
 *
 * Puur, met tests.
 */

export type Bevestiging =
  /** Op de muurkant, met de normaal van de muur weg (de ruimte in), lengte 1. */
  | { soort: "muur"; punt: Xy; n: Xy }
  | { soort: "plafond" }
  | { soort: "vloer" }
  /** Geen muur in de buurt: het punt staat vrij, bv. een paaltje in de tuin. */
  | { soort: "vrij" };

/** Hoe ver een punt van een muurkant mag liggen om ertegen te hangen. */
export const TEGEN_MUUR = 0.4;
/** Tot deze hoogte ligt een punt in de vloer. */
const IN_DE_VLOER = 0.02;

function dichtste(p: Xy, a: Xy, b: Xy): Xy {
  const e: Xy = [b[0] - a[0], b[1] - a[1]];
  const l2 = e[0] * e[0] + e[1] * e[1];
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2));
  return [a[0] + e[0] * t, a[1] + e[1] * t];
}

export function bevestigingVan(p: Xy, hoogte: number | null, muren: readonly Veelhoek[]): Bevestiging {
  if (hoogte === null) return { soort: "plafond" };
  if (hoogte <= IN_DE_VLOER) return { soort: "vloer" };
  let beste: { punt: Xy; afstand: number; a: Xy; b: Xy } | null = null;
  for (const veelhoek of muren) {
    for (const ring of veelhoek) {
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
        const c = dichtste(p, a, b);
        const afstand = Math.hypot(p[0] - c[0], p[1] - c[1]);
        if (afstand <= TEGEN_MUUR && (!beste || afstand < beste.afstand)) beste = { punt: c, afstand, a, b };
      }
    }
  }
  if (!beste) return { soort: "vrij" };
  const lengte = Math.hypot(beste.b[0] - beste.a[0], beste.b[1] - beste.a[1]) || 1;
  const n: Xy = [-(beste.b[1] - beste.a[1]) / lengte, (beste.b[0] - beste.a[0]) / lengte];
  // De kant waar de muur niet is: daar kijkt het plaatje naartoe.
  const muurkant = binnenVeelhoeken([beste.punt[0] + n[0] * 0.01, beste.punt[1] + n[1] * 0.01], muren);
  return { soort: "muur", punt: beste.punt, n: muurkant ? [-n[0], -n[1]] : n };
}
