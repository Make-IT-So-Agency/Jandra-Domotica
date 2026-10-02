import { splits } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import type { Dakinstelling } from "./dakregels";
import { omhullende, vergrootConvex } from "./vlak";

export { DAKNAMEN, DAKTYPES, STANDAARDDAK, isDaktype, type Dakinstelling, type Daktype } from "./dakregels";

/**
 * Een eenvoudig dak boven de bovenste verdieping: plat, een zadeldak of een
 * lessenaarsdak, over de convexe omhullende van die verdieping. Genoeg om
 * dakpannen, leien of een plat dak te zien; het echte dak staat op het
 * dakplan van de architect. Puur.
 */


/** Een vlak punt in 3D: x en y zoals op het plan, z naar boven. */
export type Xyz = [number, number, number];

export interface Dak {
  /** De dakvlakken: elk een vlakke veelhoek. */
  vlakken: Xyz[][];
  /** De gevels onder een schuin dak: de driehoeken tussen de muren en het dak. */
  gevels: Xyz[][];
  /** Voor een plat dak: de omtrek en de hoogte van de plaat. */
  plat: { ring: Xy[]; z0: number; z1: number } | null;
}

const DIKTE_PLAT = 0.3;

/**
 * Het dak boven een verdieping waarvan de muren tot `top` reiken. `punten`
 * zijn de hoeken van die verdieping (muren en ruimtes).
 */
export function maakDak(punten: readonly Xy[], top: number, instelling: Dakinstelling): Dak | null {
  const romp = omhullende(punten);
  if (romp.length < 3) return null;

  if (instelling.type === "plat") {
    return { vlakken: [], gevels: [], plat: { ring: vergrootConvex(romp, Math.min(instelling.overstek, 0.15)), z0: top, z1: top + DIKTE_PLAT } };
  }

  const xs = romp.map((p) => p[0]);
  const ys = romp.map((p) => p[1]);
  const langsX = instelling.nok === "x";
  const midden = langsX ? (Math.min(...ys) + Math.max(...ys)) / 2 : (Math.min(...xs) + Math.max(...xs)) / 2;
  const laag = langsX ? Math.min(...ys) : Math.min(...xs);
  const halve = langsX ? (Math.max(...ys) - Math.min(...ys)) / 2 : (Math.max(...xs) - Math.min(...xs)) / 2;
  const tan = Math.tan((Math.max(5, Math.min(60, instelling.helling)) * Math.PI) / 180);
  const dwars = (p: Xy) => (langsX ? p[1] : p[0]);

  // Een zadeldak stijgt van beide randen naar de nok; een lessenaarsdak van de lage rand naar de andere.
  const hoogte = (p: Xy): number =>
    instelling.type === "zadel" ? top + tan * (halve - Math.abs(dwars(p) - midden)) : top + tan * (dwars(p) - laag);
  const in3d = (p: Xy): Xyz => [p[0], p[1], hoogte(p)];

  const rand = vergrootConvex(romp, Math.max(0, Math.min(1.5, instelling.overstek)));
  let vlakken: Xy[][];
  if (instelling.type === "zadel") {
    const a: Xy = langsX ? [0, midden] : [midden, 0];
    const b: Xy = langsX ? [1, midden] : [midden, 1];
    const delen = splits([rand], a, b);
    vlakken = delen ? [delen[0][0], delen[1][0]] : [rand];
  } else {
    vlakken = [rand];
  }

  // De gevels: elke rand van de romp, van de bovenkant van de muur tot onder het dak.
  const gevels: Xyz[][] = [];
  for (let i = 0; i < romp.length; i++) {
    const p = romp[i];
    const q = romp[(i + 1) % romp.length];
    const stukken: Xy[] = [p];
    if (instelling.type === "zadel") {
      // Snijdt de rand de nok, dan krijgt de gevel daar een punt.
      const dp = dwars(p) - midden;
      const dq = dwars(q) - midden;
      if (dp * dq < 0) {
        const t = dp / (dp - dq);
        stukken.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    stukken.push(q);
    if (stukken.every((s) => hoogte(s) - top < 0.02)) continue;
    gevels.push([[p[0], p[1], top], [q[0], q[1], top], ...[...stukken].reverse().map(in3d)]);
  }

  return { vlakken: vlakken.map((vlak) => vlak.map(in3d)), gevels, plat: null };
}
