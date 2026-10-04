import { hoekVan, type GeplaatstStuk } from "../inrichting";
import { binnen } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import type { Model3d } from "./model";
import { binnenVeelhoeken } from "./vlak";

/**
 * Zonnepanelen op het dak: een veld van rijen × kolommen panelen, staand of
 * liggend, dat de helling van het dakvlak volgt. Een veld is een stuk zoals
 * een meubel (zie inrichting.ts), met de breedte en de diepte van het veld,
 * de kanteling van het dak, en een hoek waarbij de voorkant naar beneden
 * wijst. Alles in meter, in het assenstelsel van het gebouw. Puur, met tests.
 */

/** Een gewoon paneel: 1,13 × 1,72 m, met 2 cm ertussen. */
export const PANEEL = { breedte: 1.13, lengte: 1.72, dikte: 0.04, tussen: 0.02, wattpiek: 430 } as const;
/** Zo hoog boven het dakvlak liggen de panelen, op hun haken. */
export const BOVEN_HET_DAK = 0.1;
/** Hoeveel rijen of kolommen een veld hoogstens heeft. */
export const MAX_RIJEN = 20;

export interface Veld {
  rijen: number;
  kolommen: number;
  /** Staand: de lange kant van het paneel langs de helling. */
  staand: boolean;
}

const paneelmaat = (staand: boolean): [number, number] => (staand ? [PANEEL.breedte, PANEEL.lengte] : [PANEEL.lengte, PANEEL.breedte]);
const cm = (waarde: number) => Math.round(waarde * 100) / 100;

/** De maat van een veld: de breedte langs de dakrand, de diepte langs de helling. */
export function veldmaat({ rijen, kolommen, staand }: Veld): { breedte: number; diepte: number } {
  const [b, d] = paneelmaat(staand);
  return { breedte: cm(kolommen * b + (kolommen - 1) * PANEEL.tussen), diepte: cm(rijen * d + (rijen - 1) * PANEEL.tussen) };
}

/** Hoe een veld van deze maat gelegd is: het aantal rijen en kolommen dat het best past, staand of liggend. */
export function veldVan(breedte: number, diepte: number): Veld {
  let beste: (Veld & { fout: number }) | null = null;
  for (const staand of [true, false]) {
    const [b, d] = paneelmaat(staand);
    const k = (breedte + PANEEL.tussen) / (b + PANEEL.tussen);
    const r = (diepte + PANEEL.tussen) / (d + PANEEL.tussen);
    const kolommen = Math.min(MAX_RIJEN, Math.max(1, Math.round(k)));
    const rijen = Math.min(MAX_RIJEN, Math.max(1, Math.round(r)));
    const fout = Math.abs(k - kolommen) + Math.abs(r - rijen);
    if (!beste || fout < beste.fout - 1e-9) beste = { rijen, kolommen, staand, fout };
  }
  return { rijen: beste!.rijen, kolommen: beste!.kolommen, staand: beste!.staand };
}

/** Hoeveel panelen, en hoeveel kilowattpiek bij 430 Wp per paneel. */
export function vermogen(veld: Veld): { panelen: number; kwp: number } {
  const panelen = veld.rijen * veld.kolommen;
  return { panelen, kwp: Math.round(panelen * PANEEL.wattpiek) / 1000 };
}

export interface Dakplek {
  /** Bij welke verdieping het veld hoort: die onder het dak. */
  verdiepingId: number;
  /** De hoogte van het dakvlak op dit punt, zoals de vloer van een verdieping. */
  z: number;
  /** De helling, in graden. */
  helling: number;
  /** De hoek van een veld dat de helling volgt, met de voorkant naar beneden (graden, met de klok mee). */
  hoek: number;
}

/**
 * Het dakvlak boven dit punt van een gebouw: een schuin vlak van het dak, of
 * een plat dak boven een verdieping. Het hoogste, als er meer zijn. Null
 * als er geen dak boven ligt.
 */
export function dakplekOnder(model: Model3d, gebouwId: number, p: Xy): Dakplek | null {
  const eigen = model.verdiepingen.filter((v) => v.gebouwId === gebouwId);
  const bovenste = [...eigen].sort((a, b) => b.z0 - a.z0)[0];
  let beste: Dakplek | null = null;
  const neem = (plek: Dakplek) => {
    if (!beste || plek.z > beste.z) beste = plek;
  };

  for (const { dak } of model.daken.filter((d) => d.gebouwId === gebouwId)) {
    for (const vlak of dak.vlakken) {
      if (!bovenste || vlak.length < 3 || !binnen(p, vlak.map(([x, y]): Xy => [x, y]))) continue;
      // De normaal van het vlak, naar boven.
      const [a, b, c] = [vlak[0], vlak[1], vlak[2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (n[2] < 0) n = n.map((x) => -x);
      if (n[2] < 1e-9) continue;
      const z = a[2] - (n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1])) / n[2];
      const helling = (Math.acos(n[2] / Math.hypot(n[0], n[1], n[2])) * 180) / Math.PI;
      // Naar beneden is waar de normaal naartoe leunt; de voorkant van een stuk kijkt bij hoek h naar (-sin h, cos h).
      const hoek = Math.hypot(n[0], n[1]) < 1e-9 ? 0 : (Math.atan2(-n[0], n[1]) * 180) / Math.PI;
      neem({ verdiepingId: bovenste.id, z, helling, hoek });
    }
  }
  for (const verdieping of eigen) {
    if (verdieping.dakplaat && binnenVeelhoeken(p, verdieping.dakplaat.veelhoeken)) {
      neem({ verdiepingId: verdieping.id, z: verdieping.dakplaat.z1, helling: 0, hoek: 0 });
    }
  }
  return beste;
}

/**
 * Het veld op het dak gelegd, waar het nu staat: op de hoogte van het
 * dakvlak, met zijn helling, en op een schuin dak met de voorkant naar
 * beneden. Bij de verdieping onder dat dak. Null als er daar geen dak is.
 */
export function legOpDak<T extends Pick<GeplaatstStuk, "x" | "y" | "z" | "hoek" | "kanteling" | "verdiepingId">>(stuk: T, model: Model3d): T | null {
  const gebouwId = model.verdiepingen.find((v) => v.id === stuk.verdiepingId)?.gebouwId;
  const plek = gebouwId === undefined ? null : dakplekOnder(model, gebouwId, [stuk.x, stuk.y]);
  const verdieping = plek ? model.verdiepingen.find((v) => v.id === plek.verdiepingId) : undefined;
  if (!plek || !verdieping) return null;
  return {
    ...stuk,
    verdiepingId: plek.verdiepingId,
    z: cm(plek.z - verdieping.z0 + BOVEN_HET_DAK),
    kanteling: Math.round(plek.helling * 10) / 10,
    hoek: plek.helling > 0.5 ? hoekVan(plek.hoek) : stuk.hoek,
  };
}
