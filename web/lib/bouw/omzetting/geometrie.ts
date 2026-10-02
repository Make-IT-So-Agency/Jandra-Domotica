import type { Boog, Kader, Xy } from "./types";

/**
 * Rekenwerk op punten en veelhoeken. Puur, voor de browser, de server en de
 * tests.
 *
 * Een ring is een gesloten veelhoek zonder het eerste punt te herhalen. Een
 * ruimte is een lijst van ringen: de buitenrand, en daarna eventuele gaten.
 */

/** Oppervlakte met teken (de schoenveterformule); positief of negatief volgt de draairichting. */
export function oppervlakte(ring: readonly Xy[]): number {
  let som = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    som += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return som / 2;
}

/** De netto-oppervlakte van een ruimte: de buitenrand min de gaten. */
export function nettoOppervlakte(ringen: readonly Xy[][]): number {
  if (ringen.length === 0) return 0;
  const [buiten, ...gaten] = ringen;
  return Math.abs(oppervlakte(buiten)) - gaten.reduce((som, gat) => som + Math.abs(oppervlakte(gat)), 0);
}

export function omtrek(ring: readonly Xy[]): number {
  let som = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    som += Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
  }
  return som;
}

/** Het zwaartepunt van een ring; bij een ring zonder oppervlakte het gemiddelde van de punten. */
export function zwaartepunt(ring: readonly Xy[]): Xy {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const kruis = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += kruis;
    cx += (ring[j][0] + ring[i][0]) * kruis;
    cy += (ring[j][1] + ring[i][1]) * kruis;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length);
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Ligt p binnen de ring? Een punt op de rand telt niet altijd mee; voor ons volstaat dat. */
export function binnen(p: Xy, ring: readonly Xy[]): boolean {
  let binnenkant = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) binnenkant = !binnenkant;
  }
  return binnenkant;
}

/** Ligt p in de ruimte: binnen de buitenrand en in geen enkel gat? */
export function binnenRuimte(p: Xy, ringen: readonly Xy[][]): boolean {
  if (ringen.length === 0 || !binnen(p, ringen[0])) return false;
  return !ringen.slice(1).some((gat) => binnen(p, gat));
}

/**
 * Een punt dat zeker in de ruimte ligt, om er een naam bij te zetten. Het
 * zwaartepunt, tenzij dat erbuiten valt (een L-vorm); dan het midden van het
 * breedste stuk op de hoogte van het zwaartepunt.
 */
export function middenVan(ringen: readonly Xy[][]): Xy {
  const buiten = ringen[0];
  const z = zwaartepunt(buiten);
  if (binnenRuimte(z, ringen)) return z;
  const snijpunten: number[] = [];
  for (let i = 0, j = buiten.length - 1; i < buiten.length; j = i++) {
    const [xi, yi] = buiten[i];
    const [xj, yj] = buiten[j];
    if (yi > z[1] !== yj > z[1]) snijpunten.push(xi + ((z[1] - yi) * (xj - xi)) / (yj - yi));
  }
  snijpunten.sort((a, b) => a - b);
  let beste: Xy = z;
  let breedste = -1;
  for (let i = 0; i + 1 < snijpunten.length; i += 2) {
    const breedte = snijpunten[i + 1] - snijpunten[i];
    if (breedte > breedste) {
      breedste = breedte;
      beste = [(snijpunten[i] + snijpunten[i + 1]) / 2, z[1]];
    }
  }
  return beste;
}

export function kaderVan(punten: Iterable<Xy>): Kader {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of punten) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function vergrootKader(kader: Kader, marge: number): Kader {
  return { x0: kader.x0 - marge, y0: kader.y0 - marge, x1: kader.x1 + marge, y1: kader.y1 + marge };
}

export function inKader(p: Xy, kader: Kader): boolean {
  return p[0] >= kader.x0 && p[0] <= kader.x1 && p[1] >= kader.y0 && p[1] <= kader.y1;
}

export function afstandTotSegment(p: Xy, a: Xy, b: Xy): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengte2 = dx * dx + dy * dy;
  const t = lengte2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengte2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** De afstand van p tot de rand van een ring; 0 als p erbinnen ligt. */
export function afstandTotRing(p: Xy, ring: readonly Xy[]): number {
  if (binnen(p, ring)) return 0;
  let kleinste = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    kleinste = Math.min(kleinste, afstandTotSegment(p, ring[j], ring[i]));
  }
  return kleinste;
}

/**
 * Een ring zonder overbodige punten: dubbele punten, het eerste punt dat op
 * het einde herhaald wordt, en punten op een rechte lijn tussen hun buren.
 */
export function vereenvoudig(ring: readonly Xy[], tolerantie = 0.01): Xy[] {
  let punten = ring.filter((p, i) => {
    const vorig = ring[(i - 1 + ring.length) % ring.length];
    return i === 0 || Math.hypot(p[0] - vorig[0], p[1] - vorig[1]) > tolerantie;
  });
  if (punten.length > 1) {
    const eerste = punten[0];
    const laatste = punten[punten.length - 1];
    if (Math.hypot(eerste[0] - laatste[0], eerste[1] - laatste[1]) <= tolerantie) punten = punten.slice(0, -1);
  }
  let veranderd = true;
  while (veranderd && punten.length > 3) {
    veranderd = false;
    for (let i = 0; i < punten.length && punten.length > 3; i++) {
      const vorig = punten[(i - 1 + punten.length) % punten.length];
      const volgend = punten[(i + 1) % punten.length];
      if (afstandTotSegment(punten[i], vorig, volgend) <= tolerantie) {
        punten = punten.filter((_, j) => j !== i);
        veranderd = true;
      }
    }
  }
  return punten;
}

/**
 * Knipt een ring met een halfvlak: het deel aan één kant van de lijn door a
 * en b (Sutherland-Hodgman met één snijlijn). Welke kant 1 is, maakt niet
 * uit: splits vraagt ze allebei.
 */
function knip(ring: readonly Xy[], a: Xy, b: Xy, kant: 1 | -1): Xy[] {
  const zijde = (p: Xy) => kant * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  const uit: Xy[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const zp = zijde(p);
    const zq = zijde(q);
    if (zp >= 0) uit.push(p);
    if ((zp >= 0) !== (zq >= 0)) {
      const t = zp / (zp - zq);
      uit.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return uit;
}

/**
 * Splitst een ruimte met een rechte lijn door a en b, in twee delen. Gaten
 * gaan mee met het deel waar ze in liggen. null als de lijn de ruimte niet
 * echt in twee snijdt.
 */
export function splits(ringen: readonly Xy[][], a: Xy, b: Xy): [Xy[][], Xy[][]] | null {
  if (ringen.length === 0 || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return null;
  const [buiten, ...gaten] = ringen;
  const links = vereenvoudig(knip(buiten, a, b, 1), 1e-6);
  const rechts = vereenvoudig(knip(buiten, a, b, -1), 1e-6);
  const totaal = Math.abs(oppervlakte(buiten));
  const klein = totaal * 0.001;
  if (links.length < 3 || rechts.length < 3) return null;
  if (Math.abs(oppervlakte(links)) < klein || Math.abs(oppervlakte(rechts)) < klein) return null;
  const linksRingen: Xy[][] = [links];
  const rechtsRingen: Xy[][] = [rechts];
  for (const gat of gaten) {
    (binnen(zwaartepunt(gat), links) ? linksRingen : rechtsRingen).push(gat);
  }
  return [linksRingen, rechtsRingen];
}

// ---------------------------------------------------------------------------
// Van het blad naar het huis
// ---------------------------------------------------------------------------

/**
 * Hoe een blad in het assenstelsel van het gebouw ligt:
 *
 *   huis = draai(punt × meterPerPunt, kwartslagen) + (dx, dy)
 *
 * Een kwartslag draait met de klok mee zoals het op het scherm staat (y naar
 * beneden): oost wordt zuid.
 */
export interface Kalibratie {
  meterPerPunt: number;
  kwartslagen: number;
  dx: number;
  dy: number;
}

export function draai(p: Xy, kwartslagen: number): Xy {
  switch (((Math.round(kwartslagen) % 4) + 4) % 4) {
    case 1:
      return [-p[1], p[0]];
    case 2:
      return [-p[0], -p[1]];
    case 3:
      return [p[1], -p[0]];
    default:
      return [p[0], p[1]];
  }
}

export function naarHuis(p: Xy, k: Kalibratie): Xy {
  const [x, y] = draai([p[0] * k.meterPerPunt, p[1] * k.meterPerPunt], k.kwartslagen);
  return [x + k.dx, y + k.dy];
}

export function naarPagina(p: Xy, k: Kalibratie): Xy {
  const [x, y] = draai([p[0] - k.dx, p[1] - k.dy], -k.kwartslagen);
  return [x / k.meterPerPunt, y / k.meterPerPunt];
}

/** Een getal afgerond op een aantal cijfers na de komma, voor wat bewaard wordt. */
export function rond(waarde: number, cijfers = 3): number {
  const factor = 10 ** cijfers;
  return Math.round(waarde * factor) / factor;
}

// ---------------------------------------------------------------------------
// Bogen
// ---------------------------------------------------------------------------

/** Een punt op de boog, t van 0 tot 1. */
export function opBoog(boog: Boog, t: number): Xy {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * boog.p0[0] + b * boog.p1[0] + c * boog.p2[0] + d * boog.p3[0],
    a * boog.p0[1] + b * boog.p1[1] + c * boog.p2[1] + d * boog.p3[1],
  ];
}

/** De punten na p0 om de boog als rechte stukken te tekenen, ongeveer om de `stap` punten. */
export function afvlakken(boog: Boog, stap = 3): Xy[] {
  const lengte =
    Math.hypot(boog.p1[0] - boog.p0[0], boog.p1[1] - boog.p0[1]) +
    Math.hypot(boog.p2[0] - boog.p1[0], boog.p2[1] - boog.p1[1]) +
    Math.hypot(boog.p3[0] - boog.p2[0], boog.p3[1] - boog.p2[1]);
  const n = Math.max(2, Math.min(16, Math.ceil(lengte / stap)));
  const punten: Xy[] = [];
  for (let i = 1; i <= n; i++) punten.push(opBoog(boog, i / n));
  return punten;
}
