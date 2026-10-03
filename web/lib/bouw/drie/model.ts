import { nettoOppervlakte } from "../omzetting/geometrie";
import type { Trapvoorstel, Xy } from "../omzetting/types";
import type { SoortRuimte } from "../types";
import { maakDak, type Dak } from "./dak";
import type { Dakinstelling } from "./dakregels";
import { vindGaten, type Gat, type Gekendeopening } from "./gaten";
import { maakTrappen, type Trap3d, type Trapstand } from "./trappen";
import { binnenVeelhoeken, verschil, vereniging, type Veelhoek } from "./vlak";

/**
 * Het huis in 3D, als gewone gegevens: per verdieping de muren met welke kant
 * binnen of buiten is, de ramen en deuren, de vloeren, de vloerplaat, de
 * trappen naar boven, en de daken. Het 3D-scherm maakt er driehoeken van met
 * three.js. Puur, zodat het te testen valt zonder grafische kaart.
 *
 * Elk gebouw blijft in zijn eigen assenstelsel, dat van zijn grondplannen:
 * het grondplan van een bijgebouw ligt niet op zijn echte plaats tegenover de
 * woning. Waar een gebouw op het terrein staat, beslist de scène; zie
 * drie/plaatsing.ts.
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
  /** De trappen die de omzetting op het plan vond, in meter. */
  trappen?: Trapvoorstel[];
  /** Hoe de trappen van deze verdieping gekozen werden. */
  trapstanden?: Trapstand[];
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
  /** De trappen die hier beginnen en naar de verdieping erboven gaan. */
  trappen: Trap3d[];
  /** De leuningen rond een trapgat in deze vloer. */
  leuningen: [Xy, Xy][];
}

/** Een gebouw in zijn eigen assenstelsel: waar het ligt, en hoe hoog het komt. */
export interface Gebouw3d {
  id: number;
  kader: { x0: number; y0: number; x1: number; y1: number };
  z1: number;
}

export interface Model3d {
  verdiepingen: Verdieping3d[];
  daken: { gebouwId: number; dak: Dak }[];
  gebouwen: Gebouw3d[];
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

/** De buitenranden, zonder hun gaten: een trapgat of een vide bedekt de verdieping eronder ook. */
const zonderGaten = (veelhoeken: Veelhoek[]): Veelhoek[] => veelhoeken.map((veelhoek) => [veelhoek[0]]);

export function maakModel(
  gebouwen: readonly { id: number; dak: Dakinstelling }[],
  invoer: readonly Invoerverdieping[],
): Model3d {
  const uit: Verdieping3d[] = [];
  const daken: Model3d["daken"] = [];
  const kaders: Gebouw3d[] = [];

  for (const gebouw of gebouwen) {
    const gestapeld = stapel(invoer.filter((v) => v.gebouwId === gebouw.id && v.ruimtes.length > 0));
    if (gestapeld.length === 0) continue;
    const voetafdrukken: Veelhoek[][] = [];
    const murenPer: Veelhoek[][] = [];
    const eigen: Verdieping3d[] = [];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let zmax = 0;

    for (const [i, { verdieping, z0, hoogte }] of gestapeld.entries()) {
      const plafond = verdieping.plafondhoogte ?? STANDAARD_PLAFOND;
      const bovenste = i === gestapeld.length - 1;
      const z1 = mm(bovenste ? z0 + Math.min(hoogte, plafond + 0.15) : z0 + hoogte - PLAAT);
      const ruimtes: Veelhoek[] = verdieping.ruimtes.map((r) => r.ringen);
      const muren = vereniging(verdieping.muren.map((ring) => [ring]));
      const gaten = vindGaten(verdieping.ruimtes, muren, verdieping.openingen, plafond);
      const voetafdruk = vereniging([...ruimtes, ...muren, ...gaten.map(rechthoekVan)]);
      voetafdrukken.push(voetafdruk);
      murenPer.push(muren);

      for (const veelhoek of voetafdruk) {
        for (const [x, y] of veelhoek[0]) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
      zmax = Math.max(zmax, z1);

      eigen.push({
        id: verdieping.id,
        gebouwId: gebouw.id,
        naam: verdieping.naam,
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
        trappen: [],
        leuningen: [],
      });
    }

    // De trappen van elke verdieping naar die erboven, met een gat en een leuning boven.
    for (let i = 0; i + 1 < eigen.length; i++) {
      const [onder, boven] = [eigen[i], eigen[i + 1]];
      const [invoerOnder, invoerBoven] = [gestapeld[i].verdieping, gestapeld[i + 1].verdieping];
      const { trappen, uitsparingen, leuningen } = maakTrappen({
        onder: { id: onder.id, z0: onder.z0, ruimtes: invoerOnder.ruimtes, trappen: invoerOnder.trappen ?? [], standen: invoerOnder.trapstanden ?? [] },
        boven: { id: boven.id, z0: boven.z0, ruimtes: invoerBoven.ruimtes, voetafdruk: voetafdrukken[i + 1], muren: murenPer[i + 1] },
      });
      onder.trappen = trappen;
      boven.leuningen = leuningen;
      if (uitsparingen.length > 0) {
        boven.plaat = { ...boven.plaat, veelhoeken: verschil(boven.plaat.veelhoeken, uitsparingen) };
        boven.vloeren = boven.vloeren.flatMap((vloer) => verschil([vloer.ringen], uitsparingen).map((ringen) => ({ ...vloer, ringen })));
      }
    }

    // Wat de verdieping erboven niet bedekt, krijgt een plat dak; de bovenste het dak van het gebouw.
    for (const [i, verdieping] of eigen.entries()) {
      const boven = voetafdrukken[i + 1];
      if (boven) {
        const bloot = verschil(voetafdrukken[i], zonderGaten(boven)).filter((veelhoek) => nettoOppervlakte(veelhoek) > 0.5);
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

    uit.push(...eigen);
    if (Number.isFinite(x0)) kaders.push({ id: gebouw.id, kader: { x0, y0, x1, y1 }, z1: zmax });
  }

  return { verdiepingen: uit, daken, gebouwen: kaders };
}
