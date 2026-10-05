import { nettoOppervlakte } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import { gedraaid, standaardBlad, type Draai } from "./deuren";
import { hartVan, vindGaten, type Gat, type Gatsoort, type Gekendeopening } from "./gaten";
import { LUIFELDIKTE, MIN_LUIFEL, onderkantVanLuifel, sluitLuifel, type Gekendeluifel } from "./luifels";
import { binnenVeelhoeken, doorsnede, verschil, vereniging, type Veelhoek } from "./vlak";
import { kleineZones, naarZones } from "./zones";

/**
 * Wat iemand op het plan verbeterde aan de muren, ramen en deuren van een
 * verdieping: het plan wordt niet altijd perfect omgezet. Een correctie staat
 * apart van de omzetting (`bouw_verdiepingen.correcties`), in meter in het
 * assenstelsel van het gebouw, zodat ze een nieuwe versie van het plan
 * overleeft: dan wordt ze opnieuw toegepast op de nieuwe muren.
 *
 * - muur: een muur erbij, langs zijn as van a naar b;
 * - weg: het stuk muur langs de as van a naar b gaat weg, tot het plafond;
 * - opening: een raam, deur of doorgang in een muur, van a naar b op de as;
 * - gat: een opening die de app vond (bij x, y) is een andere soort, heeft
 *   andere hoogtes, of (met een breedte) een andere breedte;
 * - dicht: een opening die de app vond (bij x, y) wordt weer muur;
 * - luifel: een luifel tegen de gevel, langs de as van de muur van a naar b,
 *   zo diep; zonder onderkant kiest de app ze (zie luifels.ts);
 * - luifelmaat: een luifel van het plan (waar x, y in ligt) krijgt een
 *   andere onderkant of dikte;
 * - luifelweg: een luifel van het plan (waar x, y in ligt) valt weg.
 *
 * Een deur (een opening of een gat) kan ook anders draaien: het scharnier
 * aan de andere kant, of naar de andere kant open (draai). Een nieuwe deur
 * krijgt een blad, ook zonder boog op het plan.
 *
 * Het 2D-scherm en het 3D-model rekenen met dezelfde pasCorrectiesToe: wat je
 * op het plan ziet, is wat 3D bouwt. Puur, met tests.
 */

export type Correctie =
  | { soort: "muur"; a: Xy; b: Xy; dikte: number }
  | { soort: "weg"; a: Xy; b: Xy }
  | { soort: "opening"; a: Xy; b: Xy; gat: Gatsoort; onder: number; boven: number; draai?: Draai }
  | { soort: "gat"; x: number; y: number; gat: Gatsoort; onder: number; boven: number; breedte?: number; draai?: Draai }
  | { soort: "dicht"; x: number; y: number }
  | { soort: "luifel"; a: Xy; b: Xy; diepte: number; onder?: number; dikte: number }
  | { soort: "luifelmaat"; x: number; y: number; onder?: number; dikte: number }
  | { soort: "luifelweg"; x: number; y: number };

export const GATSOORTEN: readonly Gatsoort[] = ["raam", "buitendeur", "deur", "doorgang"];
export const GATNAMEN: Record<Gatsoort, string> = { raam: "Raam", buitendeur: "Buitendeur", deur: "Deur", doorgang: "Doorgang" };
/** De diktes van een nieuwe muur, in meter. */
export const DIKTES = [0.09, 0.14, 0.19, 0.3, 0.4] as const;
/** Hoeveel correcties een verdieping hoogstens heeft (zoals de migratie). */
export const MAX_CORRECTIES = 200;
/** Hoe ver het midden van een opening mag liggen van waar een correctie het zoekt. */
export const BIJ_OPENING = 0.4;

// ---------------------------------------------------------------------------
// Rekenen langs een muur
// ---------------------------------------------------------------------------

const plus = (a: Xy, b: Xy, f = 1): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];
const tussen = (a: Xy, b: Xy): Xy => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const afstand = (a: Xy, b: Xy) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const eenheid = (a: Xy, b: Xy): Xy => {
  const l = afstand(a, b) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
const links = (u: Xy): Xy => [-u[1], u[0]];
const punt = (u: Xy, v: Xy) => u[0] * v[0] + u[1] * v[1];
const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;
const oppervlakteVan = (veelhoeken: readonly Veelhoek[]) => veelhoeken.reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0);

/** Een rechthoek rond de as van a naar b, `breedte` breed. */
export function strook(a: Xy, b: Xy, breedte: number): Veelhoek {
  const n = links(eenheid(a, b));
  const h = breedte / 2;
  return [[plus(a, n, h), plus(b, n, h), plus(b, n, -h), plus(a, n, -h)]];
}

/** Alle randen van de muren. */
function randen(muren: readonly Veelhoek[]): [Xy, Xy][] {
  return muren.flatMap((veelhoek) => veelhoek.flatMap((ring) => ring.map((a, i): [Xy, Xy] => [a, ring[(i + 1) % ring.length]])));
}

/** Hoe ver je van p in richting r (lengte 1) in de muren blijft; p ligt in een muur. */
function uitgang(p: Xy, r: Xy, alle: readonly [Xy, Xy][], max = 40): number {
  let beste = max;
  for (const [a, b] of alle) {
    const e: Xy = [b[0] - a[0], b[1] - a[1]];
    const noemer = r[0] * e[1] - r[1] * e[0];
    if (Math.abs(noemer) < 1e-12) continue;
    const w: Xy = [a[0] - p[0], a[1] - p[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / noemer;
    const s = (w[0] * r[1] - w[1] * r[0]) / noemer;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < beste) beste = t;
  }
  return beste;
}

function dichtsteOpRand(p: Xy, a: Xy, b: Xy): Xy {
  const e: Xy = [b[0] - a[0], b[1] - a[1]];
  const l2 = e[0] * e[0] + e[1] * e[1];
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2));
  return [a[0] + e[0] * t, a[1] + e[1] * t];
}

/** Een plek op een muur: op de as, langs welke richting, en hoe dik de muur er is. */
export interface Muurplek {
  /** Op de as van de muur, ter hoogte van waar je tikte. */
  punt: Xy;
  /** Langs de muur, lengte 1. */
  richting: Xy;
  dikte: number;
}

/**
 * De muur bij p: p ligt erin, of hoogstens `bereik` meter ernaast. De dikte
 * is de kortste doorsnede, loodrecht op een van de randen dichtbij; de as
 * loopt evenwijdig met die rand, in het midden van de muur.
 */
export function opMuur(muren: readonly Veelhoek[], p: Xy, bereik = 0.3): Muurplek | null {
  const alle = randen(muren);
  if (alle.length === 0) return null;
  let q = p;
  if (!binnenVeelhoeken(p, muren)) {
    let beste: { punt: Xy; afstand: number; rand: [Xy, Xy] } | null = null;
    for (const rand of alle) {
      const c = dichtsteOpRand(p, rand[0], rand[1]);
      const d = afstand(p, c);
      if (d <= bereik && (!beste || d < beste.afstand)) beste = { punt: c, afstand: d, rand };
    }
    if (!beste) return null;
    const n = links(eenheid(beste.rand[0], beste.rand[1]));
    const binnenkant = [plus(beste.punt, n, 0.005), plus(beste.punt, n, -0.005)].find((x) => binnenVeelhoeken(x, muren));
    if (!binnenkant) return null;
    q = binnenkant;
  }

  // De kortste doorsnede, loodrecht op een rand in de buurt.
  let dun: { n: Xy; voor: number; achter: number } | null = null;
  for (const [a, b] of alle) {
    if (afstand(q, dichtsteOpRand(q, a, b)) > 1.2) continue;
    const n = links(eenheid(a, b));
    const voor = uitgang(q, n, alle);
    const achter = uitgang(q, [-n[0], -n[1]], alle);
    if (!dun || voor + achter < dun.voor + dun.achter - 1e-9) dun = { n, voor, achter };
  }
  if (!dun || dun.voor + dun.achter > 2) return null;
  const midden = plus(q, dun.n, (dun.voor - dun.achter) / 2);
  const richting = links([-dun.n[0], -dun.n[1]]);
  // Waar je tikte, op de as.
  const langs = punt([p[0] - midden[0], p[1] - midden[1]], richting);
  return { punt: plus(midden, richting, langs), richting, dikte: dun.voor + dun.achter };
}

/**
 * Het stuk muur door een plek, tot waar de muur ophoudt of een andere muur
 * erop aansluit: daar wordt de doorsnede anders.
 */
export function stukVanMuur(muren: readonly Veelhoek[], plek: Muurplek): { a: Xy; b: Xy; dikte: number } {
  const alle = randen(muren);
  const n = links(plek.richting);
  const STAP = 0.02;
  const zelfde = (t: number) => {
    const q = plus(plek.punt, plek.richting, t);
    if (!binnenVeelhoeken(q, muren)) return false;
    const doorsnee = uitgang(q, n, alle) + uitgang(q, [-n[0], -n[1]], alle);
    return Math.abs(doorsnee - plek.dikte) <= 0.05;
  };
  const einde = (teken: 1 | -1) => {
    let t = 0;
    while (Math.abs(t) < 40 && zelfde(t + teken * STAP)) t += teken * STAP;
    return t;
  };
  const [t0, t1] = [einde(-1), einde(1)];
  return { a: plus(plek.punt, plek.richting, t0), b: plus(plek.punt, plek.richting, t1), dikte: plek.dikte };
}

/**
 * Een nieuwe muur recht gezet: wijkt hij hoogstens 5° af van de richting van
 * de meeste muren (of haaks erop), dan volgt hij die.
 */
export function rechtGezet(a: Xy, b: Xy, muren: readonly Veelhoek[]): Xy {
  // De hoofdrichting: per rand de hoek binnen een kwartslag, gewogen met de lengte.
  let [sx, sy] = [0, 0];
  for (const [p, q] of randen(muren)) {
    const l = afstand(p, q);
    const hoek = Math.atan2(q[1] - p[1], q[0] - p[0]) * 4;
    sx += Math.cos(hoek) * l;
    sy += Math.sin(hoek) * l;
  }
  const hoofd = sx === 0 && sy === 0 ? 0 : Math.atan2(sy, sx) / 4;
  const lengte = afstand(a, b);
  const hoek = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const kwart = Math.PI / 2;
  const recht = hoofd + Math.round((hoek - hoofd) / kwart) * kwart;
  if (Math.abs(hoek - recht) > (5 * Math.PI) / 180) return b;
  return [mm(a[0] + Math.cos(recht) * lengte), mm(a[1] + Math.sin(recht) * lengte)];
}

/**
 * Het einde van een nieuwe muur van a naar b: ligt b op of tegen een muur,
 * dan loopt de nieuwe muur door tot de as ervan, in zijn eigen richting.
 */
export function eindeOpMuur(a: Xy, b: Xy, muren: readonly Veelhoek[], bereik = 0.3): Xy {
  const plek = opMuur(muren, b, bereik);
  if (!plek) return b;
  const u = eenheid(a, b);
  const noemer = u[0] * plek.richting[1] - u[1] * plek.richting[0];
  // Evenwijdig met de muur: dan niet.
  if (Math.abs(noemer) < 0.3) return b;
  const w: Xy = [plek.punt[0] - a[0], plek.punt[1] - a[1]];
  const t = (w[0] * plek.richting[1] - w[1] * plek.richting[0]) / noemer;
  return [mm(a[0] + u[0] * t), mm(a[1] + u[1] * t)];
}

// ---------------------------------------------------------------------------
// Toepassen
// ---------------------------------------------------------------------------

/** De rechthoek van een opening in de muur. */
export function vlakVanGat(gat: Pick<Gat, "a" | "b" | "n" | "dikte">): Veelhoek {
  const { a, b, n, dikte } = gat;
  return [[a, b, plus(b, n, dikte), plus(a, n, dikte)]];
}

function dichtsteGat(gaten: readonly Gat[], p: Xy, max = BIJ_OPENING): Gat | null {
  let beste: { gat: Gat; afstand: number } | null = null;
  for (const gat of gaten) {
    const d = afstand(hartVan(gat), p);
    if (d <= max && (!beste || d < beste.afstand)) beste = { gat, afstand: d };
  }
  return beste?.gat ?? null;
}

/** Een luifel zoals ze gebouwd wordt: buiten de voetafdruk, met haar hoogte boven de vloer. */
export interface Toegepasteluifel {
  veelhoeken: Veelhoek[];
  /** De onderkant boven de vloer, en hoe dik ze is. */
  onder: number;
  dikte: number;
  diepte: number;
  /** Koos de app de onderkant (de bovenkant van de ramen eronder)? */
  vanzelf: boolean;
  /** Van het plan, of zelf gezet; dan met de index van haar correctie. */
  bron: "plan" | "zelf";
  correctie?: number;
}

export interface Toegepast {
  muren: Veelhoek[];
  gaten: Gat[];
  /** Waar een muur weg is: daar komt vloer. */
  open: Veelhoek[];
  luifels: Toegepasteluifel[];
  /** Per correctie: raakt ze nog iets? Na een nieuwe versie van het plan misschien niet meer. */
  verslag: boolean[];
}

interface Snede {
  /** Welke correctie. */
  index: number;
  a: Xy;
  b: Xy;
  gat: Gatsoort;
  onder: number;
  boven: number;
  draai?: Draai;
}

const isDeur = (soort: Gatsoort) => soort === "deur" || soort === "buitendeur";

/**
 * De bladen van een deur na een correctie: die van het plan, of een blad als
 * er geen boog was en iemand de deur maakte of liet draaien; gespiegeld
 * zoals gevraagd.
 */
function bladenNa(gat: Gat, soort: Gatsoort, draai: Draai | undefined, nieuw: boolean): Pick<Gat, "bladen"> {
  if (!isDeur(soort)) return {};
  const basis = gat.bladen ?? (nieuw || draai ? [standaardBlad(gat)] : undefined);
  if (!basis) return {};
  return { bladen: draai ? gedraaid(basis, gat, draai) : basis };
}

/**
 * De correcties op de muren van een verdieping, in deze volgorde:
 * 1. muren erbij;
 * 2. stukken weg;
 * 3. openingen die dicht moeten of een andere breedte krijgen, eerst dicht;
 * 4. de nieuwe openingen uit de muur gesneden;
 * 5. de openingen gezocht zoals altijd (vindGaten);
 * 6. wat weg is, wordt een doorgang tot het plafond, en een opening krijgt
 *    de soort en de hoogtes van haar correctie. Een nieuwe opening die
 *    vindGaten niet ziet (in een nieuwe muur midden in een ruimte), komt er
 *    rechtstreeks bij;
 * 7. de luifels: die van het plan, gesloten langs de gevel, min wat weg
 *    moet en met hun eigen maten, en de eigen luifels tegen de gevel.
 */
export function pasCorrectiesToe(
  begin: readonly Veelhoek[],
  ruimtes: readonly { ringen: Xy[][] }[],
  openingen: readonly Gekendeopening[],
  plafond: number,
  correcties: readonly Correctie[],
  luifels: readonly Gekendeluifel[] = [],
): Toegepast {
  const verslag = correcties.map(() => true);
  if (correcties.length === 0) {
    const gaten = naarBinnen(vindGaten(ruimtes, begin, openingen, plafond), ruimtes, begin, [], plafond);
    return { muren: [...begin], gaten, open: [], luifels: luifelsVan(begin, ruimtes, gaten, [], plafond, luifels, correcties, verslag), verslag };
  }
  let muren = [...begin];

  // 1. Muren erbij.
  const erbij = correcties.flatMap((c) => (c.soort === "muur" ? [strook(c.a, c.b, c.dikte)] : []));
  if (erbij.length > 0) muren = vereniging([...muren, ...erbij]);

  // 2. Stukken weg: over de dikte van de muur zoals ze nu is.
  const open: Veelhoek[] = [];
  correcties.forEach((c, i) => {
    if (c.soort !== "weg") return;
    const plek = muurLangs(muren, c.a, c.b);
    const stuk = plek ? doorsnede(muren, [strook(opAs(plek, c.a), opAs(plek, c.b), plek.dikte + 0.04)]) : [];
    if (oppervlakteVan(stuk) < 0.005) {
      verslag[i] = false;
      return;
    }
    muren = verschil(muren, stuk);
    open.push(...stuk);
  });

  // 3. Wat dicht moet, of een andere breedte krijgt: eerst dicht, op de openingen zoals ze nu zijn.
  const sneden: Snede[] = [];
  if (correcties.some((c) => c.soort === "dicht" || (c.soort === "gat" && c.breedte !== undefined))) {
    const gevonden = vindGaten(ruimtes, muren, openingen, plafond);
    const dicht: Veelhoek[] = [];
    correcties.forEach((c, i) => {
      if (c.soort !== "dicht" && !(c.soort === "gat" && c.breedte !== undefined)) return;
      const gat = dichtsteGat(gevonden, [c.x, c.y]);
      if (!gat) {
        verslag[i] = false;
        return;
      }
      dicht.push(vlakVanGat(gat));
      if (c.soort === "gat" && c.breedte !== undefined) {
        const u = eenheid(gat.a, gat.b);
        const hart = hartVan(gat);
        sneden.push({
          index: i,
          a: plus(hart, u, -c.breedte / 2),
          b: plus(hart, u, c.breedte / 2),
          gat: c.gat,
          onder: c.onder,
          boven: c.boven,
          draai: c.draai,
        });
      }
    });
    if (dicht.length > 0) muren = vereniging([...muren, ...dicht]);
  }

  // 4. De nieuwe openingen uit de muur.
  correcties.forEach((c, i) => {
    if (c.soort === "opening") sneden.push({ index: i, a: c.a, b: c.b, gat: c.gat, onder: c.onder, boven: c.boven, draai: c.draai });
  });
  const gesneden: { snede: Snede; plek: Muurplek; a: Xy; b: Xy }[] = [];
  for (const snede of sneden) {
    const plek = muurLangs(muren, snede.a, snede.b);
    const [a, b] = plek ? [opAs(plek, snede.a), opAs(plek, snede.b)] : [snede.a, snede.b];
    const stuk = plek ? doorsnede(muren, [strook(a, b, plek.dikte + 0.04)]) : [];
    if (!plek || oppervlakteVan(stuk) < 0.005) {
      verslag[snede.index] = false;
      continue;
    }
    muren = verschil(muren, stuk);
    gesneden.push({ snede, plek, a, b });
  }

  // 5. De openingen zoals altijd.
  const gaten = naarBinnen(vindGaten(ruimtes, muren, openingen, plafond), ruimtes, muren, open, plafond);

  // 6. Wat weg is, is open tot het plafond.
  for (const [i, gat] of gaten.entries()) {
    if (open.length > 0 && binnenVeelhoeken(hartVan(gat), open)) gaten[i] = { ...gat, soort: "doorgang", onder: 0, boven: plafond };
  }
  // Een nieuwe opening: de soort en de hoogtes van haar correctie.
  for (const { snede, plek, a, b } of gesneden) {
    const midden = tussen(a, b);
    const i = gaten.findIndex((gat) => afstand(hartVan(gat), midden) <= Math.max(BIJ_OPENING, plek.dikte));
    const hoogtes = { soort: snede.gat, onder: snede.onder, boven: Math.min(snede.boven, plafond) };
    if (i >= 0) {
      gaten[i] = { ...gaten[i], ...hoogtes, ...bladenNa(gaten[i], snede.gat, snede.draai, true) };
      continue;
    }
    // In een muur die niet langs een ruimte loopt, ziet vindGaten ze niet: dan rechtstreeks.
    const n = links(plek.richting);
    const nieuw: Gat = { a: plus(a, n, -plek.dikte / 2), b: plus(b, n, -plek.dikte / 2), n, dikte: plek.dikte, ...hoogtes };
    gaten.push({ ...nieuw, ...bladenNa(nieuw, snede.gat, snede.draai, true) });
  }
  // Een opening die de app vond, met een andere soort of andere hoogtes.
  correcties.forEach((c, i) => {
    if (c.soort !== "gat" || c.breedte !== undefined) return;
    const gat = dichtsteGat(gaten, [c.x, c.y]);
    if (!gat) {
      verslag[i] = false;
      return;
    }
    const j = gaten.indexOf(gat);
    gaten[j] = { ...gat, soort: c.gat, onder: c.onder, boven: Math.min(c.boven, plafond), ...bladenNa(gat, c.gat, c.draai, false) };
  });

  return { muren, gaten, open, luifels: luifelsVan(muren, ruimtes, gaten, open, plafond, luifels, correcties, verslag), verslag };
}

/** Een opening naar een kleine zone zonder ruimte, zoals een traphal, gaat naar binnen (zie zones.ts). */
function naarBinnen(
  gaten: Gat[],
  ruimtes: readonly { ringen: Xy[][] }[],
  muren: readonly Veelhoek[],
  open: readonly Veelhoek[],
  plafond: number,
): Gat[] {
  if (!gaten.some((gat) => gat.soort === "raam" || gat.soort === "buitendeur")) return gaten;
  const voetafdruk = vereniging([...ruimtes.map((ruimte) => ruimte.ringen), ...muren, ...gaten.map(vlakVanGat), ...open]);
  return naarZones(gaten, kleineZones(voetafdruk), plafond);
}

/**
 * Een eigen luifel tegen de gevel: langs de as van de muur van a naar b, aan
 * de kant waar geen ruimte of muur ligt, vanaf de buitenkant van de muur zo
 * diep. Zoals een opening wordt ze opnieuw op de gevel gelegd, zodat ze een
 * nieuwe versie van het plan overleeft. Leeg als daar geen gevel ligt.
 */
function luifelLangsGevel(muren: readonly Veelhoek[], voetafdruk: readonly Veelhoek[], a: Xy, b: Xy, diepte: number): Veelhoek[] {
  const plek = muurLangs(muren, a, b);
  if (!plek) return [];
  const n = links(plek.richting);
  const half = plek.dikte / 2;
  const midden = opAs(plek, tussen(a, b));
  const kant = [1, -1].find((teken) => !binnenVeelhoeken(plus(midden, n, teken * (half + 0.05)), voetafdruk));
  if (kant === undefined) return [];
  const buiten: Xy = [n[0] * kant, n[1] * kant];
  const [p, q] = [plus(opAs(plek, a), buiten, half), plus(opAs(plek, b), buiten, half)];
  const vlak: Veelhoek = [[p, q, plus(q, buiten, diepte), plus(p, buiten, diepte)]];
  return verschil([vlak], [...voetafdruk]).filter((veelhoek) => nettoOppervlakte(veelhoek) >= MIN_LUIFEL);
}

/** De luifels: die van het plan met hun correcties, en de eigen. */
function luifelsVan(
  muren: readonly Veelhoek[],
  ruimtes: readonly { ringen: Xy[][] }[],
  gaten: readonly Gat[],
  open: readonly Veelhoek[],
  plafond: number,
  gevonden: readonly Gekendeluifel[],
  correcties: readonly Correctie[],
  verslag: boolean[],
): Toegepasteluifel[] {
  const metLuifel = correcties.some((c) => c.soort === "luifel" || c.soort === "luifelmaat" || c.soort === "luifelweg");
  if (gevonden.length === 0 && !metLuifel) return [];
  const voetafdruk = vereniging([...ruimtes.map((r) => r.ringen), ...muren, ...gaten.map(vlakVanGat), ...open]);

  const vanHetPlan = gevonden
    .map((luifel) => ({
      veelhoeken: sluitLuifel(luifel.lijn, voetafdruk),
      diepte: luifel.diepte,
      weg: false,
      maat: null as { onder?: number; dikte: number } | null,
    }))
    .filter((luifel) => luifel.veelhoeken.length > 0);
  correcties.forEach((c, i) => {
    if (c.soort !== "luifelmaat" && c.soort !== "luifelweg") return;
    const luifel = vanHetPlan.find((l) => binnenVeelhoeken([c.x, c.y], l.veelhoeken));
    if (!luifel) {
      verslag[i] = false;
      return;
    }
    if (c.soort === "luifelweg") luifel.weg = true;
    else luifel.maat = { ...(c.onder === undefined ? {} : { onder: c.onder }), dikte: c.dikte };
  });

  const uit: Toegepasteluifel[] = vanHetPlan
    .filter((luifel) => !luifel.weg)
    .map((luifel) => {
      const onder = luifel.maat?.onder;
      return {
        veelhoeken: luifel.veelhoeken,
        onder: onder ?? onderkantVanLuifel(luifel.veelhoeken, gaten, plafond),
        dikte: luifel.maat?.dikte ?? LUIFELDIKTE,
        diepte: luifel.diepte,
        vanzelf: onder === undefined,
        bron: "plan" as const,
      };
    });
  correcties.forEach((c, i) => {
    if (c.soort !== "luifel") return;
    const veelhoeken = luifelLangsGevel(muren, voetafdruk, c.a, c.b, c.diepte);
    if (veelhoeken.length === 0) {
      verslag[i] = false;
      return;
    }
    uit.push({
      veelhoeken,
      onder: c.onder ?? onderkantVanLuifel(veelhoeken, gaten, plafond),
      dikte: c.dikte,
      diepte: c.diepte,
      vanzelf: c.onder === undefined,
      bron: "zelf",
      correctie: i,
    });
  });
  return uit;
}

/**
 * De muur langs een stuk van a naar b: in het midden, of als daar geen muur
 * evenwijdig met het stuk ligt (bv. een deur in het midden), wat verder. Zo
 * telt de muur tussen twee tikken, ook als de eerste in een hoek viel.
 */
export function muurLangs(muren: readonly Veelhoek[], a: Xy, b: Xy): Muurplek | null {
  const u = eenheid(a, b);
  for (const t of [0.5, 0.3, 0.7, 0.15, 0.85, 0.05, 0.95]) {
    const plek = opMuur(muren, plus(a, [b[0] - a[0], b[1] - a[1]], t), 0.15);
    if (plek && Math.abs(punt(plek.richting, u)) >= 0.95) return plek;
  }
  return null;
}

/** Een punt op de as van de muur van een plek, loodrecht erop. */
export function opAs(plek: Muurplek, p: Xy): Xy {
  return plus(plek.punt, plek.richting, punt([p[0] - plek.punt[0], p[1] - plek.punt[1]], plek.richting));
}

// ---------------------------------------------------------------------------
// Inlezen
// ---------------------------------------------------------------------------

const isGatsoort = (waarde: unknown): waarde is Gatsoort => GATSOORTEN.includes(waarde as Gatsoort);

function xy(ruw: unknown): Xy | null {
  if (!Array.isArray(ruw) || ruw.length !== 2) return null;
  const [x, y] = ruw.map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 10000 && Math.abs(y) <= 10000 ? [mm(x), mm(y)] : null;
}

const getal = (ruw: unknown, min: number, max: number): number | null => {
  const waarde = Number(ruw);
  return ruw !== null && ruw !== "" && Number.isFinite(waarde) && waarde >= min && waarde <= max ? mm(waarde) : null;
};

/** Een opening: de hoogtes kloppen, en de bovenkant ligt minstens 10 cm boven de onderkant. */
function hoogtesVan(item: Record<string, unknown>): { gat: Gatsoort; onder: number; boven: number } | null {
  const onder = getal(item.onder, 0, 5);
  const boven = getal(item.boven, 0.1, 6);
  if (!isGatsoort(item.gat) || onder === null || boven === null || boven < onder + 0.1) return null;
  return { gat: item.gat, onder, boven };
}

/** Hoe een deur anders draait; enkel wat aan staat. */
function draaiVan(ruw: unknown): { draai?: Draai } {
  if (!ruw || typeof ruw !== "object") return {};
  const r = ruw as Record<string, unknown>;
  const draai: Draai = { ...(r.scharnier === true ? { scharnier: true } : {}), ...(r.kant === true ? { kant: true } : {}) };
  return draai.scharnier || draai.kant ? { draai } : {};
}

/** Wat bewaard of ingestuurd werd, als correcties. Wat niet klopt, valt weg. */
export function schoneCorrecties(ruw: unknown): Correctie[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Correctie[] = [];
  for (const item of ruw as Record<string, unknown>[]) {
    if (uit.length >= MAX_CORRECTIES) break;
    if (!item || typeof item !== "object") continue;
    if (item.soort === "muur" || item.soort === "weg" || item.soort === "opening") {
      const [a, b] = [xy(item.a), xy(item.b)];
      if (!a || !b) continue;
      const lengte = afstand(a, b);
      if (item.soort === "muur") {
        const dikte = getal(item.dikte, 0.05, 1);
        if (dikte !== null && lengte >= 0.05 && lengte <= 100) uit.push({ soort: "muur", a, b, dikte });
      } else if (item.soort === "weg") {
        if (lengte >= 0.02 && lengte <= 100) uit.push({ soort: "weg", a, b });
      } else {
        const hoogtes = hoogtesVan(item);
        if (hoogtes && lengte >= 0.3 && lengte <= 12) uit.push({ soort: "opening", a, b, ...hoogtes, ...draaiVan(item.draai) });
      }
      continue;
    }
    if (item.soort === "gat" || item.soort === "dicht") {
      const plek = xy([item.x, item.y]);
      if (!plek) continue;
      const [x, y] = plek;
      if (item.soort === "dicht") {
        uit.push({ soort: "dicht", x, y });
        continue;
      }
      const hoogtes = hoogtesVan(item);
      if (!hoogtes) continue;
      const breedte = item.breedte === undefined || item.breedte === null ? undefined : getal(item.breedte, 0.3, 12);
      if (breedte === null) continue;
      uit.push({ soort: "gat", x, y, ...hoogtes, ...(breedte === undefined ? {} : { breedte }), ...draaiVan(item.draai) });
      continue;
    }
    if (item.soort === "luifel") {
      const [a, b] = [xy(item.a), xy(item.b)];
      const maten = luifelmatenVan(item);
      const diepte = getal(item.diepte, 0.2, 5);
      if (!a || !b || !maten || diepte === null) continue;
      const lengte = afstand(a, b);
      if (lengte >= 0.3 && lengte <= 30) uit.push({ soort: "luifel", a, b, diepte, ...maten });
      continue;
    }
    if (item.soort === "luifelmaat" || item.soort === "luifelweg") {
      const plek = xy([item.x, item.y]);
      if (!plek) continue;
      const [x, y] = plek;
      if (item.soort === "luifelweg") {
        uit.push({ soort: "luifelweg", x, y });
        continue;
      }
      const maten = luifelmatenVan(item);
      if (maten) uit.push({ soort: "luifelmaat", x, y, ...maten });
    }
  }
  return uit;
}

/** De onderkant (als iemand ze gaf) en de dikte van een luifel; null als ze niet kloppen. */
function luifelmatenVan(item: Record<string, unknown>): { onder?: number; dikte: number } | null {
  const dikte = getal(item.dikte, 0.05, 1);
  const zonderOnder = item.onder === undefined || item.onder === null;
  const onder = zonderOnder ? undefined : getal(item.onder, 0, 6);
  if (dikte === null || onder === null) return null;
  return { ...(onder === undefined ? {} : { onder }), dikte };
}
