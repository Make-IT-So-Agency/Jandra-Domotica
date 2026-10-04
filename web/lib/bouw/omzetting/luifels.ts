import { binnenVeelhoeken, vereniging, type Veelhoek } from "../drie/vlak";
import { afstandTotRing, binnen, oppervlakte } from "./geometrie";
import type { Blad, Luifelvoorstel, Ruimtevoorstel, Xy } from "./types";

/**
 * Luifels op een grondplan: een afdak of een overdekt terras tegen de gevel.
 *
 * Wat boven de snede ligt, tekent een architect in streepjes. Een luifel is
 * zo een streepjeslijn buiten het huis die van de gevel vertrekt en er weer
 * op uitkomt, met een tekst als "oversteek 100 cm" erin. Een luifel die je
 * van boven ziet (op het plan van de verdieping erboven), staat in volle lijn
 * en telt dus niet: die hoort bij de verdieping eronder.
 *
 * Zonder tekst telt een lijn niet. Ook de rand van een verdieping die
 * uitkraagt, staat in streepjes tegen de gevel; zo'n luifel zet je zelf.
 *
 * De omzetting bewaart de lijn. Het vlak sluit het 3D-model langs de gevel:
 * enkel dat kent de openingen in de muren, en wat binnen ligt.
 *
 * Puur, met tests. In en uit in paginapunten; de regels rekenen in meter.
 */

/** Zo ver mag een uiteinde van de gevel liggen. */
const TEGEN_GEVEL_M = 0.15;
/** Zo ver mag een poot doorlopen tot de gevel, als hij er niet tegen eindigt. */
const POOT_VERLENGEN_M = 1;
/** Twee stukken met de uiteinden zo dicht bij elkaar hangen aan elkaar. */
const KLEEF_M = 0.02;
const MIN_OPPERVLAKTE_M2 = 0.5;
const MIN_DIEPTE_M = 0.3;
const MAX_DIEPTE_M = 3;
/** Zo ver mag de tekst buiten het vlak staan. */
const TEKST_NABIJ_M = 0.5;
const MAX_LUIFELS = 20;
const LUIFELTEKST = /overste+k|luifel|overdekt|overkapping|afdak/i;

type Stuk = [Xy, Xy];

const afstand = (a: Xy, b: Xy) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** De stukken van de streepjeslijnen zonder vulling. */
function streepjesstukken(blad: Blad): Stuk[] {
  const stukken: Stuk[] = [];
  for (const pad of blad.paden) {
    if (!pad.streep || !pad.lijn || pad.vul) continue;
    for (const deel of pad.delen) {
      const punten = deel.gesloten ? [...deel.punten, deel.punten[0]] : deel.punten;
      for (let i = 1; i < punten.length; i++) {
        if (afstand(punten[i - 1], punten[i]) > 1e-6) stukken.push([punten[i - 1], punten[i]]);
      }
    }
  }
  return stukken;
}

/** Legt de stukken die aan elkaar hangen achter elkaar, tot een lijn. */
function ketens(stukken: Stuk[], kleef: number): Xy[][] {
  const vrij = new Set(stukken.map((_, i) => i));
  const uit: Xy[][] = [];
  while (vrij.size > 0) {
    const eerste = vrij.values().next().value as number;
    vrij.delete(eerste);
    const keten: Xy[] = [...stukken[eerste]];
    let gegroeid = true;
    while (gegroeid) {
      gegroeid = false;
      for (const i of vrij) {
        const [a, b] = stukken[i];
        const kop = keten[0];
        const staart = keten[keten.length - 1];
        if (afstand(staart, a) <= kleef) keten.push(b);
        else if (afstand(staart, b) <= kleef) keten.push(a);
        else if (afstand(kop, b) <= kleef) keten.unshift(a);
        else if (afstand(kop, a) <= kleef) keten.unshift(b);
        else continue;
        vrij.delete(i);
        gegroeid = true;
      }
    }
    uit.push(keten);
  }
  return uit;
}

/** Een plek op een ring: op de rand van punt `rand` naar het volgende, op `t` van 0 tot 1. */
export interface Plek {
  ring: Xy[];
  rand: number;
  t: number;
  punt: Xy;
}

/** Het dichtste punt op een van de ringen. */
export function dichtstePlek(p: Xy, ringen: readonly Xy[][]): (Plek & { afstand: number }) | null {
  let beste: (Plek & { afstand: number }) | null = null;
  for (const ring of ringen) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const punt: Xy = [a[0] + t * dx, a[1] + t * dy];
      const d = afstand(p, punt);
      if (!beste || d < beste.afstand) beste = { ring, rand: i, t, punt, afstand: d };
    }
  }
  return beste;
}

/** Waar een straal van p in richting r (lengte 1) de ringen eerst raakt, binnen een lengte. */
function straalRaakt(p: Xy, r: Xy, lengte: number, ringen: readonly Xy[][]): Plek | null {
  let beste: (Plek & { s: number }) | null = null;
  for (const ring of ringen) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const e: Xy = [b[0] - a[0], b[1] - a[1]];
      const noemer = r[0] * e[1] - r[1] * e[0];
      if (Math.abs(noemer) < 1e-12) continue;
      const w: Xy = [a[0] - p[0], a[1] - p[1]];
      const s = (w[0] * e[1] - w[1] * e[0]) / noemer;
      const t = (w[0] * r[1] - w[1] * r[0]) / noemer;
      if (s < 0 || s > lengte || t < 0 || t > 1) continue;
      if (!beste || s < beste.s) beste = { ring, rand: i, t, punt: [p[0] + r[0] * s, p[1] + r[1] * s], s };
    }
  }
  return beste;
}

/** Een uiteinde van de lijn op de gevel: er vlak bij, of de laatste poot doorgetrokken tot ertegen. */
export function opGevel(eind: Xy, vorig: Xy, ringen: readonly Xy[][], tegen: number, verlengen: number): Plek | null {
  const dicht = dichtstePlek(eind, ringen);
  if (dicht && dicht.afstand <= tegen) return dicht;
  const lengte = afstand(vorig, eind);
  if (lengte < 1e-9) return null;
  const r: Xy = [(eind[0] - vorig[0]) / lengte, (eind[1] - vorig[1]) / lengte];
  return straalRaakt(eind, r, verlengen, ringen);
}

/**
 * De hoeken langs een ring van de ene plek naar de andere, de kortste kant
 * op, zonder de plekken zelf. Beide plekken liggen op dezelfde ring.
 */
export function langsDeRing(van: Plek, naar: Plek): Xy[] {
  const ring = van.ring;
  const n = ring.length;
  const lengte = (punten: Xy[]) => punten.slice(1).reduce((som, p, i) => som + afstand(punten[i], p), 0);
  const vooruit: Xy[] = [];
  if (!(van.rand === naar.rand && naar.t >= van.t)) {
    for (let i = (van.rand + 1) % n; vooruit.length <= n; i = (i + 1) % n) {
      vooruit.push(ring[i]);
      if (i === naar.rand) break;
    }
  }
  const achteruit: Xy[] = [];
  if (!(van.rand === naar.rand && naar.t <= van.t)) {
    for (let i = van.rand; achteruit.length <= n; i = (i - 1 + n) % n) {
      achteruit.push(ring[i]);
      if (i === (naar.rand + 1) % n) break;
    }
  }
  return lengte([van.punt, ...vooruit, naar.punt]) <= lengte([van.punt, ...achteruit, naar.punt]) ? vooruit : achteruit;
}

/** De diepte uit een tekst als "oversteek 100 cm", in meter. */
function diepteUitTekst(tekst: string): number | null {
  const m = tekst.match(/(\d{2,3})\s*cm/i);
  return m ? Number(m[1]) / 100 : null;
}

/**
 * De luifels van een grondplan. De voetafdruk zijn de ruimtes en de muren
 * samen, in paginapunten, zoals de omzetting ze vond.
 */
export function vindLuifels(blad: Blad, ruimtes: Ruimtevoorstel[], muren: Xy[][], meterPerPunt: number): Luifelvoorstel[] {
  const teksten = blad.teksten.filter((t) => LUIFELTEKST.test(t.tekst));
  if (teksten.length === 0 || meterPerPunt <= 0 || (ruimtes.length === 0 && muren.length === 0)) return [];
  const voetafdruk: Veelhoek[] = vereniging([...ruimtes.map((r) => r.ringen), ...muren.map((ring) => [ring])]);
  const randen = voetafdruk.flat();
  if (randen.length === 0) return [];
  const m = (meter: number) => meter / meterPerPunt;

  // Enkel wat buiten het huis ligt: een trap of een kast binnen telt niet.
  const buiten = streepjesstukken(blad).filter(([a, b]) => !binnenVeelhoeken([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], voetafdruk));

  const luifels: Luifelvoorstel[] = [];
  for (const keten of ketens(buiten, m(KLEEF_M))) {
    if (keten.length < 2 || afstand(keten[0], keten[keten.length - 1]) <= m(KLEEF_M)) continue;
    const begin = opGevel(keten[0], keten[1], randen, m(TEGEN_GEVEL_M), m(POOT_VERLENGEN_M));
    const einde = opGevel(keten[keten.length - 1], keten[keten.length - 2], randen, m(TEGEN_GEVEL_M), m(POOT_VERLENGEN_M));
    if (!begin || !einde) continue;

    const lijn: Xy[] = [begin.punt, ...keten.slice(1, -1), einde.punt];
    // Even groot en diep genoeg, met de lijn rechtdoor gesloten.
    const vlak = Math.abs(oppervlakte(lijn)) * meterPerPunt * meterPerPunt;
    if (vlak < MIN_OPPERVLAKTE_M2) continue;
    const diepte = Math.max(...lijn.map((p) => Math.min(...randen.map((r) => afstandTotRing(p, r))))) * meterPerPunt;
    if (diepte < MIN_DIEPTE_M || diepte > MAX_DIEPTE_M) continue;

    const tekst = teksten.find((t) => binnen([t.x, t.y], lijn) || afstandTotRing([t.x, t.y], lijn) <= m(TEKST_NABIJ_M));
    if (!tekst) continue;
    luifels.push({
      lijn,
      diepte: diepteUitTekst(tekst.tekst) ?? Math.round(diepte * 100) / 100,
      tekst: tekst.tekst,
    });
    if (luifels.length >= MAX_LUIFELS) break;
  }
  return luifels;
}
