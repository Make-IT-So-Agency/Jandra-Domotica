import { nettoOppervlakte } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import type { SoortRuimte } from "../types";
import { maakDak, type Dak } from "./dak";
import type { Dakinstelling } from "./dakregels";
import { vindGaten, type Gat, type Gekendeopening } from "./gaten";
import { binnenVeelhoeken, verschil, vereniging, type Veelhoek } from "./vlak";

/**
 * Het huis in 3D, als gewone gegevens: per verdieping de muren met welke kant
 * binnen of buiten is, de ramen en deuren, de vloeren, de vloerplaat, en de
 * daken. Het 3D-scherm maakt er driehoeken van met three.js. Puur, zodat het
 * te testen valt zonder grafische kaart.
 *
 * x en y zoals op het plan (meter, y naar beneden), z naar boven.
 */

/** De dikte van een vloerplaat en van een plat dak. */
export const PLAAT = 0.25;
export const DAKPLAAT = 0.3;
export const STANDAARD_PLAFOND = 2.6;

const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;

export interface Invoerruimte {
  id: number;
  naam: string;
  soort: SoortRuimte;
  ringen: Xy[][];
  plafondhoogte: number | null;
}

export interface Invoerverdieping {
  id: number;
  naam: string;
  gebouwId: number;
  volgorde: number;
  vloerpeil: number | null;
  plafondhoogte: number | null;
  verdiepingshoogte: number | null;
  ruimtes: Invoerruimte[];
  /** De muren uit de omzetting, in meter. Leeg als het plan er geen had. */
  muren: Xy[][];
  openingen: Gekendeopening[];
}

export type Zijde = "binnen" | "buiten";

export interface Muurzijde {
  /** Kijkt deze kant naar een ruimte (pleister) of naar buiten (gevel)? */
  zijde: Zijde;
  /** De richting waarin de kant kijkt, lengte 1. */
  n: Xy;
}

export interface Muurstuk {
  /** Buitenrand en gaten, zonder overlap met andere muren. */
  veelhoek: Veelhoek;
  /** Per ring, per rand (van punt i naar i+1). */
  zijden: Muurzijde[][];
}

export interface Plaat {
  veelhoeken: Veelhoek[];
  z0: number;
  z1: number;
}

export interface Verdieping3d {
  id: number;
  gebouwId: number;
  naam: string;
  /** Hoeveel het gebouw opzij geschoven is, om naast de vorige te staan. Ook voor de punten. */
  verschuiving: Xy;
  /** De vloer. */
  z0: number;
  /** De bovenkant van de muren. */
  z1: number;
  plafond: number;
  muren: Muurstuk[];
  gaten: Gat[];
  vloeren: { ruimteId: number; soort: SoortRuimte; ringen: Xy[][] }[];
  /** De vloerplaat onder deze verdieping. */
  plaat: Plaat;
  /** Een plat dak over wat de verdieping erboven niet bedekt. */
  dakplaat: Plaat | null;
}

export interface Model3d {
  verdiepingen: Verdieping3d[];
  daken: { gebouwId: number; dak: Dak }[];
  kader: { x0: number; y0: number; x1: number; y1: number; z1: number };
}

/**
 * Van welke kant van een muurrand ligt de muur zelf, en waar kijkt de andere
 * kant naar? Binnen is een ruimte of de dagkant van een binnendeur; al de
 * rest is buiten, ook de dagkant van een raam.
 */
function zijdenVan(veelhoek: Veelhoek, muren: readonly Veelhoek[], binnen: readonly Veelhoek[]): Muurzijde[][] {
  return veelhoek.map((ring) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const links: Xy = [-(b[1] - a[1]) / lengte, (b[0] - a[0]) / lengte];
      const m: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const n: Xy = binnenVeelhoeken([m[0] + links[0] * 0.04, m[1] + links[1] * 0.04], muren) ? [-links[0], -links[1]] : links;
      const voor: Xy = [m[0] + n[0] * 0.04, m[1] + n[1] * 0.04];
      return { zijde: binnenVeelhoeken(voor, binnen) ? "binnen" : "buiten", n };
    }),
  );
}

function rechthoekVan(gat: Gat): Veelhoek {
  const { a, b, n, dikte } = gat;
  return [[a, b, [b[0] + n[0] * dikte, b[1] + n[1] * dikte], [a[0] + n[0] * dikte, a[1] + n[1] * dikte]]];
}

/** Zet de verdiepingen van een gebouw op hun hoogte, van onder naar boven. */
export function stapel(verdiepingen: readonly Invoerverdieping[]): { verdieping: Invoerverdieping; z0: number; hoogte: number }[] {
  // Op peil als elke verdieping er een heeft, anders op de volgorde.
  const opPeil = verdiepingen.every((v) => v.vloerpeil !== null);
  const gesorteerd = [...verdiepingen].sort(
    (a, b) => (opPeil ? a.vloerpeil! - b.vloerpeil! : 0) || a.volgorde - b.volgorde || a.id - b.id,
  );
  const uit: { verdieping: Invoerverdieping; z0: number; hoogte: number }[] = [];
  for (const [i, verdieping] of gesorteerd.entries()) {
    const vorige = uit[i - 1];
    const z0 = verdieping.vloerpeil ?? (vorige ? vorige.z0 + vorige.hoogte : 0);
    const volgende = gesorteerd[i + 1];
    const plafond = verdieping.plafondhoogte ?? STANDAARD_PLAFOND;
    const hoogte =
      verdieping.verdiepingshoogte ??
      (volgende?.vloerpeil !== null && volgende?.vloerpeil !== undefined && volgende.vloerpeil > z0 ? volgende.vloerpeil - z0 : plafond + 0.4);
    uit.push({ verdieping, z0, hoogte });
  }
  return uit;
}

const schuif = (p: Xy, d: Xy): Xy => [p[0] + d[0], p[1] + d[1]];

/** Een verdieping, verschoven: de ruimtes, de muren en de openingen. */
function verschoven(verdieping: Invoerverdieping, d: Xy): Invoerverdieping {
  if (d[0] === 0 && d[1] === 0) return verdieping;
  return {
    ...verdieping,
    ruimtes: verdieping.ruimtes.map((r) => ({ ...r, ringen: r.ringen.map((ring) => ring.map((p) => schuif(p, d))) })),
    muren: verdieping.muren.map((ring) => ring.map((p) => schuif(p, d))),
    openingen: verdieping.openingen.map((o) => ({ ...o, x: o.x + d[0], y: o.y + d[1] })),
  };
}

/** Tussen twee gebouwen, als ze naast elkaar gezet worden. */
const TUSSENRUIMTE = 5;

/**
 * Elk gebouw heeft zijn eigen assenstelsel: het grondplan van een bijgebouw
 * ligt niet op zijn echte plaats tegenover de woning. Daarom komt elk gebouw
 * naast het vorige, met wat ruimte ertussen.
 */
export function maakModel(
  gebouwen: readonly { id: number; dak: Dakinstelling }[],
  invoer: readonly Invoerverdieping[],
): Model3d {
  const verschuivingen = new Map<number, Xy>();
  let rechts: number | null = null;
  for (const gebouw of gebouwen) {
    const punten = invoer
      .filter((v) => v.gebouwId === gebouw.id && v.ruimtes.length > 0)
      .flatMap((v) => [...v.ruimtes.flatMap((r) => r.ringen[0] ?? []), ...v.muren.flat()]);
    if (punten.length === 0) continue;
    const links = Math.min(...punten.map((p) => p[0]));
    const d: Xy = rechts === null ? [0, 0] : [rechts + TUSSENRUIMTE - links, 0];
    verschuivingen.set(gebouw.id, d);
    rechts = Math.max(...punten.map((p) => p[0])) + d[0];
  }
  const verdiepingen = invoer.map((v) => verschoven(v, verschuivingen.get(v.gebouwId) ?? [0, 0]));

  const uit: Verdieping3d[] = [];
  const daken: Model3d["daken"] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let zmax = 0;

  for (const gebouw of gebouwen) {
    const gestapeld = stapel(verdiepingen.filter((v) => v.gebouwId === gebouw.id && v.ruimtes.length > 0));
    const voetafdrukken: Veelhoek[][] = [];

    for (const [i, { verdieping, z0, hoogte }] of gestapeld.entries()) {
      const plafond = verdieping.plafondhoogte ?? STANDAARD_PLAFOND;
      const bovenste = i === gestapeld.length - 1;
      const z1 = mm(bovenste ? z0 + Math.min(hoogte, plafond + 0.15) : z0 + hoogte - PLAAT);
      const ruimtes: Veelhoek[] = verdieping.ruimtes.map((r) => r.ringen);
      const muren = vereniging(verdieping.muren.map((ring) => [ring]));
      const gaten = vindGaten(verdieping.ruimtes, muren, verdieping.openingen, plafond);
      const voetafdruk = vereniging([...ruimtes, ...muren, ...gaten.map(rechthoekVan)]);
      voetafdrukken.push(voetafdruk);

      for (const veelhoek of voetafdruk) {
        for (const [x, y] of veelhoek[0]) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
      zmax = Math.max(zmax, z1);

      uit.push({
        id: verdieping.id,
        gebouwId: gebouw.id,
        naam: verdieping.naam,
        verschuiving: verschuivingen.get(gebouw.id) ?? [0, 0],
        z0,
        z1,
        plafond,
        muren: muren.map((veelhoek) => ({
          veelhoek,
          zijden: zijdenVan(veelhoek, muren, [
            ...ruimtes,
            ...gaten.filter((gat) => gat.soort === "deur" || gat.soort === "doorgang").map(rechthoekVan),
          ]),
        })),
        gaten,
        vloeren: verdieping.ruimtes.map((r) => ({ ruimteId: r.id, soort: r.soort, ringen: r.ringen })),
        plaat: { veelhoeken: voetafdruk, z0: mm(z0 - PLAAT), z1: z0 },
        dakplaat: null,
      });
    }

    // Wat de verdieping erboven niet bedekt, krijgt een plat dak; de bovenste het dak van het gebouw.
    const eigen = uit.filter((v) => v.gebouwId === gebouw.id);
    for (const [i, verdieping] of eigen.entries()) {
      const boven = voetafdrukken[i + 1];
      if (boven) {
        const bloot = verschil(voetafdrukken[i], boven).filter((veelhoek) => nettoOppervlakte(veelhoek) > 0.5);
        if (bloot.length > 0) verdieping.dakplaat = { veelhoeken: bloot, z0: verdieping.z1, z1: mm(verdieping.z1 + DAKPLAAT) };
      } else if (gebouw.dak.type === "plat") {
        verdieping.dakplaat = { veelhoeken: voetafdrukken[i], z0: verdieping.z1, z1: mm(verdieping.z1 + DAKPLAAT) };
        zmax = Math.max(zmax, verdieping.z1 + DAKPLAAT);
      } else {
        const dak = maakDak(voetafdrukken[i].flatMap((veelhoek) => veelhoek[0]), verdieping.z1, gebouw.dak);
        if (dak) {
          daken.push({ gebouwId: gebouw.id, dak });
          for (const vlak of dak.vlakken) for (const [, , z] of vlak) zmax = Math.max(zmax, z);
        }
      }
    }
  }

  return {
    verdiepingen: uit,
    daken,
    kader: Number.isFinite(x0) ? { x0, y0, x1, y1, z1: zmax } : { x0: 0, y0: 0, x1: 10, y1: 10, z1: 3 },
  };
}
