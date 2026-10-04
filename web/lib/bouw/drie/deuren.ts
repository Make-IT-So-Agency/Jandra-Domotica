import type { Xy } from "../omzetting/types";
import type { Deurblad, Gat } from "./gaten";

/**
 * Een deurblad in 3D: het staat op een kier naar de kant waar het
 * opendraait, met een dunne boog op de vloer zoals op het plan. Zo zie je
 * waar een deur draait als je meubels zet. Puur, in meter, in het
 * assenstelsel van het gebouw.
 */

/** Hoe ver een deur in 3D openstaat, in graden. */
export const KIER = 30;

const lengte = (v: Xy) => Math.hypot(v[0], v[1]);

/** De richting van het dichte blad en die waarin het opendraait, haaks erop; en hoe breed het blad is. */
function assen(blad: Deurblad): { dicht: Xy; open: Xy; breedte: number } | null {
  const d: Xy = [blad.dicht[0] - blad.scharnier[0], blad.dicht[1] - blad.scharnier[1]];
  const breedte = lengte(d);
  if (breedte < 1e-6) return null;
  const dicht: Xy = [d[0] / breedte, d[1] / breedte];
  const o: Xy = [blad.open[0] - blad.scharnier[0], blad.open[1] - blad.scharnier[1]];
  const langs = o[0] * dicht[0] + o[1] * dicht[1];
  const haaks: Xy = [o[0] - langs * dicht[0], o[1] - langs * dicht[1]];
  const l = lengte(haaks);
  if (l < 1e-6) return null;
  return { dicht, open: [haaks[0] / l, haaks[1] / l], breedte };
}

/** De richting van het blad als het `hoek` graden openstaat. */
function richting(a: { dicht: Xy; open: Xy }, hoek: number): Xy {
  const t = (hoek * Math.PI) / 180;
  return [a.dicht[0] * Math.cos(t) + a.open[0] * Math.sin(t), a.dicht[1] * Math.cos(t) + a.open[1] * Math.sin(t)];
}

/** De vier hoeken van het blad, `hoek` graden open, met de dikte rond de lijn van het blad. Null als de boog niet klopt. */
export function deurbladOpKier(blad: Deurblad, hoek = KIER, dikte = 0.04): [Xy, Xy, Xy, Xy] | null {
  const a = assen(blad);
  if (!a) return null;
  const r = richting(a, hoek);
  const p: Xy = [(-r[1] * dikte) / 2, (r[0] * dikte) / 2];
  const h = blad.scharnier;
  const eind: Xy = [h[0] + r[0] * a.breedte, h[1] + r[1] * a.breedte];
  return [
    [h[0] - p[0], h[1] - p[1]],
    [eind[0] - p[0], eind[1] - p[1]],
    [eind[0] + p[0], eind[1] + p[1]],
    [h[0] + p[0], h[1] + p[1]],
  ];
}

/**
 * De boog op de vloer waar het blad doorheen draait, als een smalle strook:
 * van dicht tot helemaal open. Een ring, of null als de boog niet klopt.
 */
export function draaiboog(blad: Deurblad, breedte = 0.015, stappen = 16): Xy[] | null {
  const a = assen(blad);
  if (!a) return null;
  const h = blad.scharnier;
  const punt = (t: number, straal: number): Xy => {
    const r = richting(a, (t * 90) / stappen);
    return [h[0] + r[0] * straal, h[1] + r[1] * straal];
  };
  const buiten = Array.from({ length: stappen + 1 }, (_, i) => punt(i, a.breedte + breedte / 2));
  const binnen = Array.from({ length: stappen + 1 }, (_, i) => punt(stappen - i, a.breedte - breedte / 2));
  return [...buiten, ...binnen];
}

/**
 * Welke stukken van een opening de dichte deurbladen niet vullen: daar
 * komt vast glas, zoals naast een voordeur. Langs de opening van a naar b,
 * in meter vanaf a.
 */
export function vastGlasNaast(a: Xy, b: Xy, bladen: readonly Deurblad[], minimum = 0.15): [number, number][] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 1e-6) return [];
  const u: Xy = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const langs = (p: Xy) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
  const vol = bladen
    .map((blad): [number, number] => {
      const [s, t] = [langs(blad.scharnier), langs(blad.dicht)];
      return [Math.max(0, Math.min(s, t)), Math.min(l, Math.max(s, t))];
    })
    .sort((x, y) => x[0] - y[0]);
  const vrij: [number, number][] = [];
  let tot = 0;
  for (const [van, naar] of vol) {
    if (van - tot >= minimum) vrij.push([tot, van]);
    tot = Math.max(tot, naar);
  }
  if (l - tot >= minimum) vrij.push([tot, l]);
  return vrij;
}

/**
 * Een deur verbeterd op het plan: het scharnier aan de andere kant van de
 * opening, en/of de deur draait naar de andere kant open.
 */
export interface Draai {
  scharnier?: boolean;
  kant?: boolean;
}

/** Een blad voor een deur zonder boog op het plan: het scharnier aan a, dicht tot b, open naar de ruimte die de opening vond. */
export function standaardBlad(gat: Pick<Gat, "a" | "b" | "n">): Deurblad {
  const l = Math.hypot(gat.b[0] - gat.a[0], gat.b[1] - gat.a[1]);
  return { scharnier: gat.a, dicht: gat.b, open: [gat.a[0] - gat.n[0] * l, gat.a[1] - gat.n[1] * l] };
}

/**
 * De bladen zoals verbeterd: gespiegeld over het midden van de opening (het
 * scharnier aan de andere kant), en/of over het midden van de muur (de deur
 * draait naar de andere kant open).
 */
export function gedraaid(bladen: readonly Deurblad[], gat: Pick<Gat, "a" | "b" | "n" | "dikte">, draai: Draai): Deurblad[] {
  const l = Math.hypot(gat.b[0] - gat.a[0], gat.b[1] - gat.a[1]);
  if (l < 1e-6) return [...bladen];
  const u: Xy = [(gat.b[0] - gat.a[0]) / l, (gat.b[1] - gat.a[1]) / l];
  const spiegel = (p: Xy): Xy => {
    const v: Xy = [p[0] - gat.a[0], p[1] - gat.a[1]];
    let [x, y] = p;
    if (draai.scharnier) {
      const langs = v[0] * u[0] + v[1] * u[1];
      x += u[0] * (l - 2 * langs);
      y += u[1] * (l - 2 * langs);
    }
    if (draai.kant) {
      const dwars = v[0] * gat.n[0] + v[1] * gat.n[1];
      x += gat.n[0] * (gat.dikte - 2 * dwars);
      y += gat.n[1] * (gat.dikte - 2 * dwars);
    }
    return [x, y];
  };
  return bladen.map((blad) => ({ scharnier: spiegel(blad.scharnier), dicht: spiegel(blad.dicht), open: spiegel(blad.open) }));
}

/** De boog van een blad op het plan, van dicht tot helemaal open: punten op de lijn zelf. */
export function boogpunten(blad: Deurblad, stappen = 12): Xy[] | null {
  const a = assen(blad);
  if (!a) return null;
  return Array.from({ length: stappen + 1 }, (_, i) => {
    const r = richting(a, (i * 90) / stappen);
    return [blad.scharnier[0] + r[0] * a.breedte, blad.scharnier[1] + r[1] * a.breedte] as Xy;
  });
}
