import { MET_VOEG, isPatroon, type Patroon } from "../keuzes";
import { binnenRuimte, oppervlakte } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import type { Xyz } from "./dak";
import type { Gat } from "./gaten";
import { alsMateriaal, vloertitel, type Materiaal, type Materiaalkeuze, type Slot } from "./materialen";
import type { Verdieping3d } from "./model";
import { eigenNaam } from "./stalen";
import { doorsnede, verschil, type Veelhoek } from "./vlak";

/**
 * Een deel van een vlak met een eigen materiaal: een stuk gevel in hout, de
 * muren van de badkamer tot 1,20 m in tegels, tegels in een deel van de
 * leefruimte, een groendak op een deel van het platte dak. Zonder deel
 * kleurt een materiaal het hele onderdeel, zoals de keuze Gevelsteen de hele
 * gevel.
 *
 * Vier vormen, in meter in het assenstelsel van het gebouw, zodat een deel
 * een nieuwe versie van het plan overleeft, zoals de punten:
 * - muur: een rechthoek op één kant van een muur, van a tot b (van links naar
 *   rechts, gezien van voor de muur), van `onder` tot `boven` boven de vloer
 *   van zijn verdieping. Hoger dan die verdieping mag: dan loopt het deel
 *   door op de gevel erboven, tot in de punt onder het dak;
 * - wanden: alle binnenmuren van een ruimte, van `onder` tot `boven`, zoals
 *   tegels in een badkamer;
 * - vloer: een veelhoek op de vloer, ook over de ruimtes heen;
 * - dak: een veelhoek op een plat dak.
 *
 * Een deel heeft zijn eigen materiaal: een staal, een optie van een keuze of
 * een eigen kleur. Het maakt zelf geen keuze. Een later deel ligt over een
 * vroeger, en een rechthoek op een muur over de muren van een ruimte.
 *
 * Puur: de scène (3d/scene.ts) knipt er de vlakken mee, en de tests rekenen
 * het na.
 */

export type Wandzijde = "gevel" | "binnenmuur";

export type Deelvorm =
  | { soort: "muur"; zijde: Wandzijde; a: Xy; b: Xy; n: Xy; onder: number; boven: number }
  | { soort: "wanden"; ruimteId: number; onder: number; boven: number }
  | { soort: "vloer"; veelhoek: Xy[] }
  | { soort: "dak"; veelhoek: Xy[] };

export type Deelsoort = Deelvorm["soort"];

export interface Deelmateriaal {
  /** De naam van het staal of de optie, of "Baksteen #a65a3a". */
  naam: string;
  kleur: string;
  patroon: Patroon | null;
  voegkleur: string | null;
  /** De optie van een keuze waar het van komt: die kan een foto hebben. */
  optieId: number | null;
}

export interface Deel {
  id: string;
  naam: string;
  vorm: Deelvorm;
  materiaal: Deelmateriaal;
}

/** Hoeveel delen een verdieping hoogstens heeft (zie de migratie 20261017100000_bouw_delen.sql). */
export const MAX_DELEN = 50;
/** Hoeveel hoeken een veelhoek op een vloer of dak hoogstens heeft. */
export const MAX_HOEKEN = 100;
/** Kleiner dan dit (m²) is geen deel van een vloer: een tik te veel. */
export const MIN_OPPERVLAKTE = 0.01;

const ID = /^[a-z0-9]{6,16}$/;
const KLEUR = /^#[0-9a-f]{6}$/;

/** Het materiaal in de scène van een deel: één per deel, zoals "vloer:12" per ruimte. */
export const deelsleutel = (id: string) => `deel:${id}`;

/** Het deel van een sleutel van de scène, of null. */
export const deelVanSleutel = (sleutel: string): string | null => (sleutel.startsWith("deel:") ? sleutel.slice(5) : null);

/** Welk onderdeel een deel volgt: zijn stalen, en zijn materiaal zolang het er geen eigen heeft. */
export function slotVanDeel(vorm: Deelvorm): Slot {
  switch (vorm.soort) {
    case "muur":
      return vorm.zijde;
    case "wanden":
      return "binnenmuur";
    case "vloer":
      return "vloer";
    case "dak":
      return "dak";
  }
}

const dot = (a: Xy, b: Xy) => a[0] * b[0] + a[1] * b[1];
const min = (a: Xy, b: Xy): Xy => [a[0] - b[0], a[1] - b[1]];
const plus = (a: Xy, b: Xy, f = 1): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];
const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;
const cm = (waarde: number) => Math.round(waarde * 100) / 100;

// ---------------------------------------------------------------------------
// Nakijken wat de browser stuurt of de databank gaf
// ---------------------------------------------------------------------------

const getal = (waarde: unknown, laag: number, hoog: number): number | null =>
  typeof waarde === "number" && Number.isFinite(waarde) && waarde >= laag && waarde <= hoog ? waarde : null;

function punt(ruw: unknown): Xy | null {
  if (!Array.isArray(ruw) || ruw.length !== 2) return null;
  const [x, y] = [getal(ruw[0], -1000, 1000), getal(ruw[1], -1000, 1000)];
  return x === null || y === null ? null : [mm(x), mm(y)];
}

function tekst(ruw: unknown, maximum = 80): string | null {
  if (typeof ruw !== "string") return null;
  const schoon = ruw.replace(/\s+/g, " ").trim();
  return schoon.length >= 1 && schoon.length <= maximum ? schoon : null;
}

/** Van onder tot boven, op een centimeter, en minstens 2 cm hoog. */
function hoogtes(v: Record<string, unknown>, laag: number, hoog: number): { onder: number; boven: number } | null {
  const [onder, boven] = [getal(v.onder, laag, hoog), getal(v.boven, laag, hoog)];
  if (onder === null || boven === null) return null;
  const [o, b] = [cm(onder), cm(boven)];
  return b - o >= 0.02 - 1e-9 ? { onder: o, boven: b } : null;
}

function veelhoekVan(ruw: unknown): Xy[] | null {
  if (!Array.isArray(ruw) || ruw.length > MAX_HOEKEN) return null;
  const punten: Xy[] = [];
  for (const p of ruw) {
    const q = punt(p);
    if (!q) return null;
    const vorige = punten.at(-1);
    if (!vorige || Math.hypot(q[0] - vorige[0], q[1] - vorige[1]) >= 0.005) punten.push(q);
  }
  // Het laatste punt op het eerste is dezelfde hoek.
  while (punten.length > 3 && Math.hypot(punten[0][0] - punten.at(-1)![0], punten[0][1] - punten.at(-1)![1]) < 0.005) punten.pop();
  return punten.length >= 3 && Math.abs(oppervlakte(punten)) >= MIN_OPPERVLAKTE ? punten : null;
}

function vormVan(ruw: unknown): Deelvorm | null {
  if (!ruw || typeof ruw !== "object") return null;
  const v = ruw as Record<string, unknown>;
  switch (v.soort) {
    case "muur": {
      if (v.zijde !== "gevel" && v.zijde !== "binnenmuur") return null;
      let [a, b] = [punt(v.a), punt(v.b)];
      const kijk = Array.isArray(v.n) && v.n.length === 2 ? ([Number(v.n[0]), Number(v.n[1])] as Xy) : null;
      const h = hoogtes(v, -5, 60);
      if (!a || !b || !kijk || !kijk.every(Number.isFinite) || !h) return null;
      const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const kijklengte = Math.hypot(kijk[0], kijk[1]);
      if (lengte < 0.05 || lengte > 200 || kijklengte < 1e-9) return null;
      // De kant volgt uit de lijn: van a naar b loopt van links naar rechts, gezien van voor het vlak.
      let n: Xy = [-(b[1] - a[1]) / lengte, (b[0] - a[0]) / lengte];
      const zelfde = dot(n, kijk) / kijklengte;
      if (Math.abs(zelfde) < 0.7) return null;
      if (zelfde < 0) {
        [a, b] = [b, a];
        n = [-n[0], -n[1]];
      }
      const rond = (waarde: number) => Math.round(waarde * 1e6) / 1e6 || 0;
      return { soort: "muur", zijde: v.zijde, a, b, n: [rond(n[0]), rond(n[1])], ...h };
    }
    case "wanden": {
      const ruimteId = typeof v.ruimteId === "number" && Number.isSafeInteger(v.ruimteId) && v.ruimteId > 0 ? v.ruimteId : null;
      const h = hoogtes(v, 0, 20);
      return ruimteId === null || !h ? null : { soort: "wanden", ruimteId, ...h };
    }
    case "vloer":
    case "dak": {
      const veelhoek = veelhoekVan(v.veelhoek);
      return veelhoek ? { soort: v.soort, veelhoek } : null;
    }
    default:
      return null;
  }
}

/** Een eigen materiaal, nagekeken: van een deel, of van een meubel of kast bij Inrichten. Null als het niet klopt. */
export function deelmateriaal(ruw: unknown): Deelmateriaal | null {
  if (!ruw || typeof ruw !== "object") return null;
  const m = ruw as Record<string, unknown>;
  const kleur = typeof m.kleur === "string" ? m.kleur.toLowerCase() : "";
  if (!KLEUR.test(kleur)) return null;
  const patroon = isPatroon(m.patroon) ? m.patroon : null;
  const voeg = typeof m.voegkleur === "string" ? m.voegkleur.toLowerCase() : null;
  const optieId = typeof m.optieId === "number" && Number.isSafeInteger(m.optieId) && m.optieId > 0 ? m.optieId : null;
  return {
    naam: tekst(m.naam) ?? eigenNaam({ kleur, patroon }),
    kleur,
    patroon,
    voegkleur: patroon && MET_VOEG.includes(patroon) && voeg && KLEUR.test(voeg) ? voeg : null,
    optieId,
  };
}

/**
 * De delen van een verdieping zoals de browser ze stuurt of de databank ze
 * gaf, nagekeken en afgerond: een punt op een millimeter, een hoogte op een
 * centimeter. Wat niet klopt, valt weg, net als een tweede deel met dezelfde
 * id. Hoogstens MAX_DELEN.
 */
export function schoneDelen(ruw: unknown): Deel[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Deel[] = [];
  const ids = new Set<string>();
  for (const item of ruw as Record<string, unknown>[]) {
    if (uit.length >= MAX_DELEN) break;
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !ID.test(item.id) || ids.has(item.id)) continue;
    const vorm = vormVan(item.vorm);
    const materiaal = deelmateriaal(item.materiaal);
    if (!vorm || !materiaal) continue;
    ids.add(item.id);
    uit.push({ id: item.id, naam: tekst(item.naam) ?? "Deel", vorm, materiaal });
  }
  return uit;
}

/** Twee delen met dezelfde vorm: een tweede tik op Dit muurvlak maakt er geen tweede. */
export const zelfdeVorm = (a: Deelvorm, b: Deelvorm): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Het muurvlak onder een tik
// ---------------------------------------------------------------------------

export interface Muurvlak {
  zijde: Wandzijde;
  /** Van links naar rechts, gezien van voor het vlak. */
  a: Xy;
  b: Xy;
  /** Waar het vlak naar kijkt, lengte 1. */
  n: Xy;
  /** De ramen en deuren in het vlak: in meter van a, en boven de vloer. */
  openingen: { van: number; tot: number; onder: number; boven: number }[];
}

/** Hoe ver een rand van de lijn mag liggen, en hoe schuin hij mag staan, om bij hetzelfde vlak te horen. */
const OP_DE_LIJN = 0.03;
const EVENWIJDIG = Math.cos((8 * Math.PI) / 180);
/** Een kier tussen twee stukken van hetzelfde vlak. Een muur die er haaks op staat, is breder. */
const KIER = 0.02;

/**
 * Het muurvlak waar p op ligt, met de kant die naar `kijk` kijkt: de muur
 * van hoek tot hoek op die lijn. Een raam of deur onderbreekt het vlak niet,
 * een muur die er haaks op staat wel: zo is het de muur van één ruimte, of de
 * gevel tot de volgende hoek. Null als er daar geen muur is.
 */
export function muurvlakBij(verdieping: Pick<Verdieping3d, "muren" | "gaten">, p: Xy, kijk: Xy): Muurvlak | null {
  const lengte = Math.hypot(kijk[0], kijk[1]);
  if (lengte < 1e-9) return null;
  const n: Xy = [kijk[0] / lengte, kijk[1] / lengte];
  const r: Xy = [n[1], -n[0]];
  interface Stuk {
    u0: number;
    u1: number;
    /** Hoe ver het stuk voor of achter p ligt. */
    d: number;
    /** Een stuk muur zegt welke kant het is; een raam of deur niet. */
    zijde: Wandzijde | null;
    gat: Gat | null;
  }
  const stukken: Stuk[] = [];
  const voeg = (a: Xy, b: Xy, kant: Xy, zijde: Wandzijde | null, gat: Gat | null) => {
    if (dot(kant, n) < EVENWIJDIG) return;
    const [da, db] = [dot(min(a, p), n), dot(min(b, p), n)];
    if (Math.abs(da) > OP_DE_LIJN || Math.abs(db) > OP_DE_LIJN) return;
    const [ua, ub] = [dot(min(a, p), r), dot(min(b, p), r)];
    if (Math.abs(ub - ua) < 1e-6) return;
    stukken.push({ u0: Math.min(ua, ub), u1: Math.max(ua, ub), d: (da + db) / 2, zijde, gat });
  };
  for (const muur of verdieping.muren) {
    muur.veelhoek.forEach((ring, i) =>
      ring.forEach((a, j) => {
        const kant = muur.zijden[i]?.[j];
        if (kant) voeg(a, ring[(j + 1) % ring.length], kant.n, kant.zijde === "buiten" ? "gevel" : "binnenmuur", null);
      }),
    );
  }
  for (const gat of verdieping.gaten) {
    // De kant van de ruimte kijkt de ruimte in; de overkant naar buiten, of naar de andere ruimte.
    voeg(gat.a, gat.b, [-gat.n[0], -gat.n[1]], null, gat);
    voeg(plus(gat.a, gat.n, gat.dikte), plus(gat.b, gat.n, gat.dikte), gat.n, null, gat);
  }
  stukken.sort((x, y) => x.u0 - y.u0);

  // Wat aan elkaar hangt, en dezelfde kant is, is één vlak.
  const reeksen: { stukken: Stuk[]; u0: number; u1: number; zijde: Wandzijde | null }[] = [];
  for (const stuk of stukken) {
    const huidig = reeksen.at(-1);
    const andereKant = huidig?.zijde && stuk.zijde && huidig.zijde !== stuk.zijde;
    if (huidig && stuk.u0 <= huidig.u1 + KIER && !andereKant) {
      huidig.stukken.push(stuk);
      huidig.u1 = Math.max(huidig.u1, stuk.u1);
      huidig.zijde ??= stuk.zijde;
    } else {
      reeksen.push({ stukken: [stuk], u0: stuk.u0, u1: stuk.u1, zijde: stuk.zijde });
    }
  }
  const afstand = (reeks: { u0: number; u1: number }) => Math.max(0, reeks.u0 - 0, 0 - reeks.u1);
  const reeks = reeksen.filter((kandidaat) => kandidaat.zijde !== null && afstand(kandidaat) <= 0.05).sort((x, y) => afstand(x) - afstand(y))[0];
  if (!reeks?.zijde) return null;

  // Op de lijn van de muur zelf, niet van de tik.
  const d = reeks.stukken.reduce((som, stuk) => som + stuk.d, 0) / reeks.stukken.length;
  const op = plus(p, n, d);
  const gezien = new Set<Gat>();
  const openingen: Muurvlak["openingen"] = [];
  for (const stuk of reeks.stukken) {
    if (!stuk.gat || gezien.has(stuk.gat)) continue;
    gezien.add(stuk.gat);
    openingen.push({ van: mm(Math.max(0, stuk.u0 - reeks.u0)), tot: mm(stuk.u1 - reeks.u0), onder: stuk.gat.onder, boven: stuk.gat.boven });
  }
  const a = plus(op, r, reeks.u0);
  const b = plus(op, r, reeks.u1);
  return { zijde: reeks.zijde, a: [mm(a[0]), mm(a[1])], b: [mm(b[0]), mm(b[1])], n, openingen };
}

/** De ruimte voor een kant van een muur: waar je staat als je ernaar kijkt. Null: buiten, of een zone zonder ruimte. */
export function ruimteVoor(vloeren: readonly { ruimteId: number; ringen: Xy[][] }[], a: Xy, b: Xy, kijk: Xy): number | null {
  const lengte = Math.hypot(kijk[0], kijk[1]) || 1;
  const m: Xy = [(a[0] + b[0]) / 2 + (kijk[0] / lengte) * 0.05, (a[1] + b[1]) / 2 + (kijk[1] / lengte) * 0.05];
  return vloeren.find((vloer) => binnenRuimte(m, vloer.ringen))?.ruimteId ?? null;
}

// ---------------------------------------------------------------------------
// De vlakken knippen, voor de scène
// ---------------------------------------------------------------------------

/** Een deel van een muur zoals de scène het toepast: een rechthoek op een lijn, in hoogte boven ±0 van het gebouw. */
export interface Muurknip {
  sleutel: string;
  zijde: Wandzijde;
  a: Xy;
  /** Van a naar b, lengte 1. */
  r: Xy;
  n: Xy;
  lengte: number;
  z0: number;
  z1: number;
}

/** De muren van een ruimte, in hoogte boven ±0. */
export interface Wandknip {
  sleutel: string;
  ruimteId: number;
  z0: number;
  z1: number;
}

/** Een deel van een vloer of een plat dak. */
export interface Vlakknip {
  sleutel: string;
  veelhoek: Xy[];
}

/** Een verticaal vlak tussen twee punten op het plan, zoals de scène het tekent. */
export interface Wand {
  sleutel: string;
  a: Xy;
  b: Xy;
  z0: number;
  z1: number;
}

/** Een rechthoek langs een wand: van t0 tot t1 meter langs de wand, van z0 tot z1 hoog. */
interface Rechthoek {
  t0: number;
  t1: number;
  z0: number;
  z1: number;
  sleutel: string;
}

const KLEIN = 1e-4;

/** Wat van p overblijft zonder q (dat in p ligt): hoogstens vier rechthoeken. */
function zonder(p: Rechthoek, q: Omit<Rechthoek, "sleutel">): Rechthoek[] {
  const uit: Rechthoek[] = [];
  const voeg = (t0: number, t1: number, z0: number, z1: number) => {
    if (t1 - t0 >= KLEIN && z1 - z0 >= KLEIN) uit.push({ t0, t1, z0, z1, sleutel: p.sleutel });
  };
  voeg(p.t0, q.t0, p.z0, p.z1);
  voeg(q.t1, p.t1, p.z0, p.z1);
  voeg(q.t0, q.t1, p.z0, q.z0);
  voeg(q.t0, q.t1, q.z1, p.z1);
  return uit;
}

/** Ligt dit deel van een muur op de lijn van a naar b, aan dezelfde kant? */
function opLijn(m: Muurknip, zijde: string, kijk: Xy, punten: readonly Xy[]): boolean {
  return m.zijde === zijde && dot(kijk, m.n) >= EVENWIJDIG && punten.every((p) => Math.abs(dot(min(p, m.a), m.n)) <= OP_DE_LIJN);
}

/**
 * Een wand (gevel of binnenmuur), geknipt met de delen die erop liggen: wat
 * in een deel valt, krijgt de sleutel van dat deel. `kijk` is de kant die je
 * ziet, `ruimteId` de ruimte ervoor (voor de muren van een ruimte). De
 * stukken liggen op dezelfde lijn: de textuur loopt erover door.
 */
export function knipWand(wand: Wand, kijk: Xy, ruimteId: number | null, muren: readonly Muurknip[], wanden: readonly Wandknip[]): Wand[] {
  const lengte = Math.hypot(wand.b[0] - wand.a[0], wand.b[1] - wand.a[1]);
  if (lengte < 1e-9 || (muren.length === 0 && wanden.length === 0)) return [wand];
  const u: Xy = [(wand.b[0] - wand.a[0]) / lengte, (wand.b[1] - wand.a[1]) / lengte];
  const vlakken: Rechthoek[] = [];
  if (wand.sleutel === "binnenmuur" && ruimteId !== null) {
    for (const w of wanden) if (w.ruimteId === ruimteId) vlakken.push({ t0: 0, t1: lengte, z0: w.z0, z1: w.z1, sleutel: w.sleutel });
  }
  for (const m of muren) {
    if (!opLijn(m, wand.sleutel, kijk, [wand.a, wand.b])) continue;
    const [s0, s1] = [dot(min(m.a, wand.a), u), dot(min(plus(m.a, m.r, m.lengte), wand.a), u)];
    vlakken.push({ t0: Math.min(s0, s1), t1: Math.max(s0, s1), z0: m.z0, z1: m.z1, sleutel: m.sleutel });
  }
  if (vlakken.length === 0) return [wand];

  let stukken: Rechthoek[] = [{ t0: 0, t1: lengte, z0: wand.z0, z1: wand.z1, sleutel: wand.sleutel }];
  for (const vlak of vlakken) {
    stukken = stukken.flatMap((stuk) => {
      const binnen = { t0: Math.max(stuk.t0, vlak.t0), t1: Math.min(stuk.t1, vlak.t1), z0: Math.max(stuk.z0, vlak.z0), z1: Math.min(stuk.z1, vlak.z1) };
      if (binnen.t1 - binnen.t0 < KLEIN || binnen.z1 - binnen.z0 < KLEIN) return [stuk];
      return [...zonder(stuk, binnen), { ...binnen, sleutel: vlak.sleutel }];
    });
  }
  return stukken.map((stuk) => ({ sleutel: stuk.sleutel, a: plus(wand.a, u, stuk.t0), b: plus(wand.a, u, stuk.t1), z0: stuk.z0, z1: stuk.z1 }));
}

/**
 * Een gevel onder een schuin dak (een vlakke veelhoek, staand), geknipt met
 * de delen van de muren: zo loopt een deel door tot in de punt. Null als er
 * geen deel op ligt; anders de stukken, elk met de sleutel van zijn deel.
 */
export function knipGevel(punten: readonly Xyz[], kijk: Xy, muren: readonly Muurknip[]): { sleutel: string; veelhoek: Xyz[][] }[] | null {
  if (punten.length < 3) return null;
  const vlak = punten.map(([x, y]): Xy => [x, y]);
  const op = muren.filter((m) => opLijn(m, "gevel", kijk, vlak));
  if (op.length === 0) return null;
  const o: Xy = vlak[0];
  const lengte = Math.hypot(kijk[0], kijk[1]) || 1;
  const r: Xy = [kijk[1] / lengte, -kijk[0] / lengte];
  const naarVlak = ([x, y, z]: Xyz): Xy => [dot(min([x, y], o), r), z];
  const terug = ([t, z]: Xy): Xyz => [o[0] + r[0] * t, o[1] + r[1] * t, z];

  let rest: Veelhoek[] = [[punten.map(naarVlak)]];
  const stukken: { sleutel: string; veelhoek: Veelhoek }[] = [];
  // Het laatste deel ligt bovenaan: het krijgt eerst zijn stuk.
  for (const m of [...op].reverse()) {
    const [s0, s1] = [dot(min(m.a, o), r), dot(min(plus(m.a, m.r, m.lengte), o), r)];
    const [t0, t1] = [Math.min(s0, s1), Math.max(s0, s1)];
    const rechthoek: Veelhoek[] = [[[[t0, m.z0], [t1, m.z0], [t1, m.z1], [t0, m.z1]]]];
    const binnen = doorsnede(rest, rechthoek);
    if (binnen.length === 0) continue;
    stukken.push(...binnen.map((veelhoek) => ({ sleutel: m.sleutel, veelhoek })));
    rest = verschil(rest, rechthoek);
  }
  if (stukken.length === 0) return null;
  return [...rest.map((veelhoek) => ({ sleutel: "gevel", veelhoek })), ...stukken].map(({ sleutel, veelhoek }) => ({
    sleutel,
    veelhoek: veelhoek.map((ring) => ring.map(terug)),
  }));
}

/**
 * Een vloer of plat dak, geknipt met de delen die erop liggen. Het laatste
 * deel ligt bovenaan; wat geen deel raakt, houdt `sleutel`.
 */
export function knipVlak(veelhoek: Veelhoek, delen: readonly Vlakknip[], sleutel: string): { sleutel: string; veelhoek: Veelhoek }[] {
  if (delen.length === 0) return [{ sleutel, veelhoek }];
  let rest: Veelhoek[] = [veelhoek];
  const stukken: { sleutel: string; veelhoek: Veelhoek }[] = [];
  for (const deel of [...delen].reverse()) {
    const vorm: Veelhoek[] = [[deel.veelhoek]];
    const binnen = doorsnede(rest, vorm);
    if (binnen.length === 0) continue;
    stukken.push(...binnen.map((stuk) => ({ sleutel: deel.sleutel, veelhoek: stuk })));
    rest = verschil(rest, vorm);
  }
  return [...rest.map((stuk) => ({ sleutel, veelhoek: stuk })), ...stukken];
}

export interface Scenedelen {
  /** Per gebouw: een deel van een muur kan over de verdiepingen heen lopen. */
  muren: Map<number, Muurknip[]>;
  /** Per verdieping: de muren van een ruimte, de delen van de vloer en van het platte dak. */
  wanden: Map<number, Wandknip[]>;
  vloeren: Map<number, Vlakknip[]>;
  daken: Map<number, Vlakknip[]>;
}

/** De delen per verdieping, zoals de scène ze toepast: in hoogte boven ±0 van het gebouw. */
export function scenedelen(
  verdiepingen: readonly Pick<Verdieping3d, "id" | "gebouwId" | "z0">[],
  delen: ReadonlyMap<number, readonly Pick<Deel, "id" | "vorm">[]>,
): Scenedelen {
  const uit: Scenedelen = { muren: new Map(), wanden: new Map(), vloeren: new Map(), daken: new Map() };
  const bij = <T>(lijsten: Map<number, T[]>, id: number, item: T) => lijsten.set(id, [...(lijsten.get(id) ?? []), item]);
  for (const v of verdiepingen) {
    for (const deel of delen.get(v.id) ?? []) {
      const sleutel = deelsleutel(deel.id);
      const { vorm } = deel;
      if (vorm.soort === "muur") {
        const lengte = Math.hypot(vorm.b[0] - vorm.a[0], vorm.b[1] - vorm.a[1]);
        if (lengte < 1e-9) continue;
        bij(uit.muren, v.gebouwId, {
          sleutel,
          zijde: vorm.zijde,
          a: vorm.a,
          r: [(vorm.b[0] - vorm.a[0]) / lengte, (vorm.b[1] - vorm.a[1]) / lengte],
          n: vorm.n,
          lengte,
          z0: v.z0 + vorm.onder,
          z1: v.z0 + vorm.boven,
        });
      } else if (vorm.soort === "wanden") {
        bij(uit.wanden, v.id, { sleutel, ruimteId: vorm.ruimteId, z0: v.z0 + vorm.onder, z1: v.z0 + vorm.boven });
      } else {
        bij(vorm.soort === "vloer" ? uit.vloeren : uit.daken, v.id, { sleutel, veelhoek: vorm.veelhoek });
      }
    }
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Tekenen: waar een tik aan kleeft
// ---------------------------------------------------------------------------

/**
 * Waar een tik op een muurvlak kleeft, in meter van het begin van het vlak
 * en boven de vloer: aan de randen van het vlak, aan de zijkanten, de
 * borstwering en de latei van een raam of deur, aan de vloer en de
 * bovenkant, tot `marge` ver. Anders op 5 cm.
 */
export function kleefOpMuur(
  t: number,
  z: number,
  vlak: { lengte: number; hoogte: number; openingen: readonly { van: number; tot: number; onder: number; boven: number }[] },
  marge: number,
): Xy {
  const kleef = (waarde: number, kandidaten: number[]) => {
    let beste: number | null = null;
    for (const k of kandidaten) if (Math.abs(k - waarde) <= marge && (beste === null || Math.abs(k - waarde) < Math.abs(beste - waarde))) beste = k;
    return beste ?? Math.round(waarde / 0.05) * 0.05;
  };
  const langs = kleef(t, [0, vlak.lengte, ...vlak.openingen.flatMap((o) => [o.van, o.tot])]);
  const hoog = kleef(z, [0, vlak.hoogte, ...vlak.openingen.flatMap((o) => [o.onder, o.boven]).filter((h) => h > 0.01)]);
  return [mm(Math.max(0, Math.min(vlak.lengte, langs))), mm(hoog)];
}

/** De hoeken van een verdieping waar een tik op de vloer aan kleeft: van de muren en de ruimtes. */
export function hoekenVan(verdieping: Pick<Verdieping3d, "muren" | "vloeren">): Xy[] {
  const uit: Xy[] = [];
  const gezien = new Set<string>();
  const voeg = (p: Xy) => {
    const sleutel = `${Math.round(p[0] / 0.005)},${Math.round(p[1] / 0.005)}`;
    if (gezien.has(sleutel)) return;
    gezien.add(sleutel);
    uit.push(p);
  };
  for (const muur of verdieping.muren) for (const ring of muur.veelhoek) ring.forEach(voeg);
  for (const vloer of verdieping.vloeren) for (const ring of vloer.ringen) ring.forEach(voeg);
  return uit;
}

// ---------------------------------------------------------------------------
// Namen en materialen
// ---------------------------------------------------------------------------

const RICHTINGEN = ["noord", "noordoost", "oost", "zuidoost", "zuid", "zuidwest", "west", "noordwest"] as const;

/** De windrichting waar iets op het plan naar kijkt, met het noorden op `noorden` graden (met de klok mee vanaf boven op het plan). */
export function windrichting(kijk: Xy, noorden: number): (typeof RICHTINGEN)[number] {
  const opPlan = (Math.atan2(kijk[0], -kijk[1]) * 180) / Math.PI;
  const kompas = (((opPlan - noorden) % 360) + 360) % 360;
  return RICHTINGEN[Math.round(kompas / 45) % 8];
}

const hoofdletter = (woord: string) => `${woord.charAt(0).toUpperCase()}${woord.slice(1)}`;
const klein = (naam: string) => (naam === naam.toUpperCase() ? naam.toLowerCase() : `${naam.charAt(0).toLowerCase()}${naam.slice(1)}`);

/**
 * Een naam voor een nieuw deel: "Zuidgevel, gelijkvloers", "Badkamer,
 * noordmuur", "Muren badkamer", "Vloer keuken, deel" of "Plat dak, deel".
 * Een binnenmuur heet naar waar ze in de ruimte staat: wie naar het zuiden
 * kijkt, ziet de noordmuur. Bestaat de naam al, dan met een nummer erbij.
 */
export function deelnaam(
  vorm: Deelvorm,
  plaats: { verdieping: string; ruimte: string | null; noorden: number },
  bestaand: Iterable<string> = [],
): string {
  let naam: string;
  switch (vorm.soort) {
    case "muur": {
      const achter: Xy = [-vorm.n[0], -vorm.n[1]];
      naam =
        vorm.zijde === "gevel"
          ? `${hoofdletter(windrichting(vorm.n, plaats.noorden))}gevel, ${klein(plaats.verdieping)}`
          : plaats.ruimte
            ? `${plaats.ruimte}, ${windrichting(achter, plaats.noorden)}muur`
            : `Binnenmuur ${windrichting(achter, plaats.noorden)}, ${klein(plaats.verdieping)}`;
      break;
    }
    case "wanden":
      naam = plaats.ruimte ? `Muren ${klein(plaats.ruimte)}` : "Muren van een ruimte";
      break;
    case "vloer":
      naam = `${plaats.ruimte ? vloertitel(plaats.ruimte) : "Vloer"}, deel`;
      break;
    case "dak":
      naam = "Plat dak, deel";
      break;
  }
  const gebruikt = new Set(bestaand);
  if (!gebruikt.has(naam)) return naam;
  for (let i = 2; ; i++) if (!gebruikt.has(`${naam} ${i}`)) return `${naam} ${i}`;
}

/** Wat een deel toont: zijn optie (met haar foto) als die nog bestaat, anders zijn eigen kleur en patroon. */
export function materiaalVanDeel(deel: Pick<Deel, "materiaal">, keuzes: readonly Materiaalkeuze[]): Materiaal {
  const { optieId, kleur, patroon, voegkleur } = deel.materiaal;
  if (optieId !== null) {
    for (const keuze of keuzes) {
      const optie = keuze.opties.find((o) => o.id === optieId);
      if (optie) return alsMateriaal(optie, keuze.slot);
    }
  }
  return { kleur, foto: null, patroon, voegkleur: patroon && MET_VOEG.includes(patroon) ? voegkleur : null };
}

/** Hoe groot een deel is, in m²: een rechthoek op een muur zonder de ramen, een veelhoek. De muren van een ruimte: null. */
export function grootteVan(vorm: Deelvorm): number | null {
  switch (vorm.soort) {
    case "muur":
      return Math.hypot(vorm.b[0] - vorm.a[0], vorm.b[1] - vorm.a[1]) * (vorm.boven - vorm.onder);
    case "wanden":
      return null;
    default:
      return Math.abs(oppervlakte(vorm.veelhoek));
  }
}
