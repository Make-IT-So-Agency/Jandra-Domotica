import type { Stuk } from "../inrichting";
import { hoekVan } from "../inrichting";
import type { Xy } from "../omzetting/types";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * Meubels en toestellen op hun plaats: de voetafdruk van een stuk, een stuk
 * tegen de muur zetten, en wat je tegenhoudt bij het rondwandelen. Alles in
 * meter, in het assenstelsel van het gebouw (zie inrichting.ts). Puur, met
 * tests.
 */

/** Zo ver blijft een stuk van de muur, tegen het flikkeren. */
export const SPELING = 0.005;
/** Een stuk dat hoger komt dan dit, houdt je tegen bij het rondwandelen; een tapijt niet. */
export const OBSTAKELHOOGTE = 0.3;
/** Wat hoger hangt dan dit, loop je onderdoor. */
const ONDERDOOR = 1.0;
/** Zo dicht moet de zijkant bij een muur in de hoek staan om ertegen te schuiven. */
const HOEKBEREIK = 0.3;

type Plaatsbaar = Pick<Stuk, "x" | "y" | "hoek" | "breedte" | "diepte">;

/** Naar rechts (langs de breedte) en naar voren (langs de diepte), op het plan. */
export function assen(hoek: number): { u: Xy; v: Xy } {
  const h = (hoek * Math.PI) / 180;
  return { u: [Math.cos(h), Math.sin(h)], v: [-Math.sin(h), Math.cos(h)] };
}

/** De vier hoeken van een stuk op het plan: linksachter, rechtsachter, rechtsvoor, linksvoor. */
export function voetafdruk(stuk: Plaatsbaar): [Xy, Xy, Xy, Xy] {
  const { u, v } = assen(stuk.hoek);
  const [w, d] = [stuk.breedte / 2, stuk.diepte / 2];
  const hoek = (su: number, sv: number): Xy => [stuk.x + u[0] * w * su + v[0] * d * sv, stuk.y + u[1] * w * su + v[1] * d * sv];
  return [hoek(-1, -1), hoek(1, -1), hoek(1, 1), hoek(-1, 1)];
}

interface Muurkant {
  a: Xy;
  b: Xy;
  /** Lengte 1, weg van de muur: de ruimte in. */
  n: Xy;
}

/** De kanten van de muren, elk met de normaal die van de muur wegwijst. */
function muurkanten(muren: readonly Veelhoek[]): Muurkant[] {
  const kanten: Muurkant[] = [];
  for (const veelhoek of muren) {
    for (const ring of veelhoek) {
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
        const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (lengte < 0.02) continue;
        const n: Xy = [-(b[1] - a[1]) / lengte, (b[0] - a[0]) / lengte];
        const m: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // De kant waar de muur niet is.
        const muurkant = binnenVeelhoeken([m[0] + n[0] * 0.01, m[1] + n[1] * 0.01], muren);
        kanten.push({ a, b, n: muurkant ? [-n[0], -n[1]] : n });
      }
    }
  }
  return kanten;
}

const dot = (a: Xy, b: Xy) => a[0] * b[0] + a[1] * b[1];
const min = (a: Xy, b: Xy): Xy => [a[0] - b[0], a[1] - b[1]];

/** Het dichtste punt op een kant, en hoe ver langs de kant (0 tot de lengte). */
function opKant(p: Xy, kant: Muurkant): { punt: Xy; t: number; lengte: number } {
  const e = min(kant.b, kant.a);
  const lengte = Math.hypot(e[0], e[1]);
  const t = Math.max(0, Math.min(lengte, dot(min(p, kant.a), e) / lengte));
  return { punt: [kant.a[0] + (e[0] / lengte) * t, kant.a[1] + (e[1] / lengte) * t], t, lengte };
}

/**
 * Het stuk met zijn rug tegen de dichtste muurkant, tot `bereik` van zijn
 * midden, de voorkant de ruimte in. Het blijft waar het langs de muur stond;
 * staat een muur in de hoek tot 30 cm naast een zijkant, dan schuift het er
 * ook tegenaan. Null als er geen muur in de buurt is.
 */
export function tegenMuur<T extends Plaatsbaar>(stuk: T, muren: readonly Veelhoek[], bereik = 1 + Math.max(stuk.breedte, stuk.diepte) / 2): T | null {
  const kanten = muurkanten(muren);
  const c: Xy = [stuk.x, stuk.y];
  let beste: { kant: Muurkant; punt: Xy; afstand: number } | null = null;
  for (const kant of kanten) {
    const { punt } = opKant(c, kant);
    const afstand = Math.hypot(c[0] - punt[0], c[1] - punt[1]);
    // Enkel een kant waar het stuk voor staat, niet een kant aan de andere kant van de muur.
    if (afstand > bereik || dot(min(c, punt), kant.n) < -0.05) continue;
    if (!beste || afstand < beste.afstand - 1e-9) beste = { kant, punt, afstand };
  }
  if (!beste) return null;

  const { n } = beste.kant;
  const hoek = hoekVan((Math.atan2(-n[0], n[1]) * 180) / Math.PI);
  const { u, v } = assen(hoek);
  let midden: Xy = [beste.punt[0] + n[0] * (stuk.diepte / 2 + SPELING), beste.punt[1] + n[1] * (stuk.diepte / 2 + SPELING)];

  // In een hoek: de zijkant tegen de muur ernaast, als die er dicht bij staat.
  let hoekschuif: { gat: number; n: Xy } | null = null;
  for (const kant of kanten) {
    if (Math.abs(dot(kant.n, u)) < 0.95) continue;
    const zijkant: Xy = [midden[0] - kant.n[0] * (stuk.breedte / 2), midden[1] - kant.n[1] * (stuk.breedte / 2)];
    const gat = dot(min(zijkant, kant.a), kant.n);
    if (gat >= HOEKBEREIK || gat <= -stuk.breedte / 2) continue;
    // De kant moet langs de zijkant lopen, tussen de rug en de voorkant.
    const [ta, tb] = [dot(min(kant.a, zijkant), v), dot(min(kant.b, zijkant), v)];
    const overlap = Math.min(Math.max(ta, tb), stuk.diepte / 2) - Math.max(Math.min(ta, tb), -stuk.diepte / 2);
    if (overlap < 0.05) continue;
    if (!hoekschuif || Math.abs(gat) < Math.abs(hoekschuif.gat)) hoekschuif = { gat, n: kant.n };
  }
  if (hoekschuif) {
    const schuif = SPELING - hoekschuif.gat;
    midden = [midden[0] + hoekschuif.n[0] * schuif, midden[1] + hoekschuif.n[1] * schuif];
  }
  return { ...stuk, x: Math.round(midden[0] * 1000) / 1000, y: Math.round(midden[1] * 1000) / 1000, hoek };
}

/**
 * Wat je tegenhoudt bij het rondwandelen: de voetafdruk van elk stuk dat
 * hoger komt dan 30 cm en niet zo hoog hangt dat je eronder loopt.
 */
export function obstakels(stukken: readonly Pick<Stuk, "x" | "y" | "z" | "hoek" | "breedte" | "diepte" | "hoogte">[]): Veelhoek[] {
  return stukken.filter((s) => s.z < ONDERDOOR && s.z + s.hoogte > OBSTAKELHOOGTE).map((s) => [voetafdruk(s)]);
}
