import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";

import { binnen } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";

/**
 * Vlakken samenvoegen en van elkaar aftrekken, voor het 3D-model. Een
 * veelhoek is een lijst ringen: de buitenrand, dan de gaten. Alles in meter,
 * in het assenstelsel van het gebouw. Puur.
 */

export type Veelhoek = Xy[][];

/** polygon-clipping sluit elke ring met het eerste punt; wij niet. */
function open(veelhoeken: MultiPolygon): Veelhoek[] {
  return veelhoeken.map((veelhoek) =>
    veelhoek.map((ring) => {
      const punten = ring.map(([x, y]) => [x, y] as Xy);
      const [eerste, laatste] = [punten[0], punten.at(-1)];
      return eerste && laatste && eerste[0] === laatste[0] && eerste[1] === laatste[1] ? punten.slice(0, -1) : punten;
    }),
  );
}

const alsInvoer = (veelhoeken: Veelhoek[]): Polygon[] =>
  veelhoeken.filter((veelhoek) => veelhoek[0]?.length >= 3).map((veelhoek) => veelhoek.map((ring) => ring.map(([x, y]) => [x, y] as [number, number])));

/** Alles samen tot losse veelhoeken zonder overlap. Lukt het niet, dan blijven ze apart. */
export function vereniging(veelhoeken: Veelhoek[]): Veelhoek[] {
  const invoer = alsInvoer(veelhoeken);
  if (invoer.length === 0) return [];
  try {
    return open(polygonClipping.union(invoer[0], ...invoer.slice(1)));
  } catch {
    return veelhoeken;
  }
}

/** Wat van a overblijft zonder b. */
export function verschil(a: Veelhoek[], b: Veelhoek[]): Veelhoek[] {
  const links = alsInvoer(a);
  const rechts = alsInvoer(b);
  if (links.length === 0) return [];
  if (rechts.length === 0) return a;
  try {
    return open(polygonClipping.difference(links, rechts));
  } catch {
    return a;
  }
}

/** Wat a en b gemeen hebben. */
export function doorsnede(a: Veelhoek[], b: Veelhoek[]): Veelhoek[] {
  const links = alsInvoer(a);
  const rechts = alsInvoer(b);
  if (links.length === 0 || rechts.length === 0) return [];
  try {
    return open(polygonClipping.intersection(links, rechts));
  } catch {
    return [];
  }
}

/** Ligt p in een van de veelhoeken, buiten hun gaten? */
export function binnenVeelhoeken(p: Xy, veelhoeken: readonly Veelhoek[]): boolean {
  return veelhoeken.some(([buitenrand, ...gaten]) => buitenrand && binnen(p, buitenrand) && !gaten.some((gat) => binnen(p, gat)));
}

/** De convexe omhullende, tegen de klok in (wiskundig), zonder dubbele punten. */
export function omhullende(punten: readonly Xy[]): Xy[] {
  const gesorteerd = [...punten].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (gesorteerd.length < 3) return gesorteerd;
  const kruis = (o: Xy, a: Xy, b: Xy) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const onder: Xy[] = [];
  for (const p of gesorteerd) {
    while (onder.length >= 2 && kruis(onder[onder.length - 2], onder[onder.length - 1], p) <= 1e-12) onder.pop();
    onder.push(p);
  }
  const boven: Xy[] = [];
  for (const p of [...gesorteerd].reverse()) {
    while (boven.length >= 2 && kruis(boven[boven.length - 2], boven[boven.length - 1], p) <= 1e-12) boven.pop();
    boven.push(p);
  }
  return [...onder.slice(0, -1), ...boven.slice(0, -1)];
}

/**
 * Een convexe veelhoek (tegen de klok in) die aan elke kant `marge` groter
 * is: de dakrand die over de muren uitsteekt.
 */
export function vergrootConvex(ring: readonly Xy[], marge: number): Xy[] {
  if (ring.length < 3 || marge === 0) return [...ring];
  const lijnen = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Tegen de klok in ligt de buitenkant rechts van de rand.
    const n: Xy = [(b[1] - a[1]) / lengte, -(b[0] - a[0]) / lengte];
    return { p: [a[0] + n[0] * marge, a[1] + n[1] * marge] as Xy, r: [b[0] - a[0], b[1] - a[1]] as Xy };
  });
  return lijnen.map((lijn, i) => {
    const vorige = lijnen[(i - 1 + lijnen.length) % lijnen.length];
    const noemer = vorige.r[0] * lijn.r[1] - vorige.r[1] * lijn.r[0];
    if (Math.abs(noemer) < 1e-12) return lijn.p;
    const t = ((lijn.p[0] - vorige.p[0]) * lijn.r[1] - (lijn.p[1] - vorige.p[1]) * lijn.r[0]) / noemer;
    return [vorige.p[0] + vorige.r[0] * t, vorige.p[1] + vorige.r[1] * t] as Xy;
  });
}
