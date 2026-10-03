import { binnen, nettoOppervlakte, oppervlakte } from "../omzetting/geometrie";
import type { Trapdeel, Trapvoorstel, Xy } from "../omzetting/types";
import type { SoortRuimte, Trapstand } from "../types";
import { binnenVeelhoeken, doorsnede, omhullende, vereniging, type Veelhoek } from "./vlak";

/**
 * De trappen in 3D, van een verdieping naar die erboven. Puur, met tests.
 *
 * Waar een trap komt, in volgorde:
 * 1. een trap die de omzetting op het plan vond (omzetting/trappen.ts);
 * 2. onder een gat in de verdieping erboven met de vorm van een trapgat:
 *    0,6 tot 2,8 m breed en 1,8 tot 6,5 m lang. Smaller dan 1,6 m wordt een
 *    rechte trap, breder een trap die halfweg 180° draait. Een groter gat is
 *    een vide;
 * 3. in een ruimte van het soort Trap.
 *
 * De treden zijn even hoog, van het peil van de verdieping tot dat van de
 * verdieping erboven; een bordes ligt waar de eerste vlucht ophoudt. Waar de
 * richting niet op het plan staat, begint de trap bij een ruimte beneden en
 * komt hij aan bij een ruimte boven. Wie het beter weet, draait hem om,
 * spiegelt hem, kiest een andere vorm of zegt dat er geen trap is; dat
 * bewaart de verdieping (bouw_verdiepingen.trappen), bij het midden van de
 * trap.
 *
 * Boven elke trap komt een gat in de vloer erboven, als dat er nog niet was,
 * met een leuning rond het gat, behalve waar de trap aankomt.
 *
 * Alles in meter, in het assenstelsel van het gebouw.
 */

export type { Trapstand };

export const TRAPVORMEN = ["recht", "keer"] as const;

export interface Trapdeel3d extends Trapdeel {
  /** De hoogte waar het deel begint en eindigt; bij een bordes gelijk. */
  z0: number;
  z1: number;
}

export interface Trap3d {
  /** De verdieping waar de trap begint, en die waar hij aankomt. */
  van: number;
  naar: number;
  /** Het midden van de trap: de sleutel voor zijn stand. */
  midden: Xy;
  bron: "plan" | "gat" | "ruimte";
  vorm: "recht" | "keer" | "kwart";
  delen: Trapdeel3d[];
  /** De breedte van een vlucht. */
  breedte: number;
  /** De bovenste rand van de laatste vlucht: daar kom je boven aan. */
  aankomst: [Xy, Xy];
  /** De keuzes zoals ze nu gelden, ook als ze geraden zijn: daarop werken de knoppen. */
  stand: Required<Pick<Trapstand, "omgekeerd" | "bordesAnderEinde">> & { vorm: "recht" | "keer" | null };
}

/** Een stand hoort bij een trap als zijn midden binnen deze afstand ligt. */
export const STAND_AFSTAND = 0.75;

/**
 * De keuzes zoals ze uit de databank of uit de browser komen, nagekeken:
 * hoogstens 20, met een plaats binnen 10 km, en enkel gekende velden.
 */
export function schoneTrapstanden(ruw: unknown): Trapstand[] {
  if (!Array.isArray(ruw)) return [];
  const uit: Trapstand[] = [];
  for (const item of ruw.slice(0, 20) as Record<string, unknown>[]) {
    const x = Number(item?.x);
    const y = Number(item?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10000 || Math.abs(y) > 10000) continue;
    const stand: Trapstand = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    if (item.vorm === "recht" || item.vorm === "keer") stand.vorm = item.vorm;
    for (const veld of ["omgekeerd", "bordesAnderEinde", "geen"] as const) {
      if (typeof item[veld] === "boolean") stand[veld] = item[veld] as boolean;
    }
    uit.push(stand);
  }
  return uit;
}
/** De gewone hoogte van een trede. */
const OPTREDE = 0.18;

const plus = (a: Xy, b: Xy, f = 1): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];
/** De oppervlakte van losse veelhoeken samen, elk zonder zijn gaten. */
const oppervlakteVan = (veelhoeken: readonly Veelhoek[]) => veelhoeken.reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0);
const midden2 = (a: Xy, b: Xy): Xy => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** De kleinste rechthoek rond een ring, langs een van zijn randen: lengte langs u, breedte langs v. */
export function rechthoekRond(ring: readonly Xy[]): { midden: Xy; u: Xy; v: Xy; lengte: number; breedte: number } | null {
  const romp = omhullende(ring);
  if (romp.length < 3) return null;
  let beste: { midden: Xy; u: Xy; v: Xy; lengte: number; breedte: number; opp: number } | null = null;
  for (let i = 0; i < romp.length; i++) {
    const a = romp[i];
    const b = romp[(i + 1) % romp.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    const u: Xy = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const v: Xy = [-u[1], u[0]];
    const tu = romp.map((p) => p[0] * u[0] + p[1] * u[1]);
    const tv = romp.map((p) => p[0] * v[0] + p[1] * v[1]);
    const [u0, u1, v0, v1] = [Math.min(...tu), Math.max(...tu), Math.min(...tv), Math.max(...tv)];
    const opp = (u1 - u0) * (v1 - v0);
    if (beste && opp >= beste.opp - 1e-9) continue;
    const mu = (u0 + u1) / 2;
    const mv = (v0 + v1) / 2;
    const midden: Xy = [u[0] * mu + v[0] * mv, u[1] * mu + v[1] * mv];
    // De lengte langs u is de langste kant.
    beste =
      u1 - u0 >= v1 - v0
        ? { midden, u, v, lengte: u1 - u0, breedte: v1 - v0, opp }
        : { midden, u: v, v: u, lengte: v1 - v0, breedte: u1 - u0, opp };
  }
  return beste ? { midden: beste.midden, u: beste.u, v: beste.v, lengte: beste.lengte, breedte: beste.breedte } : null;
}

/** De rechthoek rond een middelpunt, van s0 tot s1 langs u en van w0 tot w1 langs v; de hoeken beginnen bij (s0, w0). */
function rechthoek(midden: Xy, u: Xy, v: Xy, s0: number, s1: number, w0: number, w1: number): [Xy, Xy, Xy, Xy] {
  const p = (s: number, w: number): Xy => plus(plus(midden, u, s), v, w);
  return [p(s0, w0), p(s0, w1), p(s1, w1), p(s1, w0)];
}

/** Een vlucht van s0 naar s1 langs u, tussen w0 en w1 langs v. hoeken[0]-hoeken[1] is de onderste rand. */
function vlucht(midden: Xy, u: Xy, v: Xy, s0: number, s1: number, w0: number, w1: number, treden: number): Trapdeel {
  return { soort: "vlucht", hoeken: rechthoek(midden, u, v, s0, s1, w0, w1), treden };
}

/**
 * Een trap in een rechthoek, voor wat niet van het plan komt. Een rechte
 * trap loopt over de hele lengte. Een trap die 180° draait, heeft twee
 * vluchten naast elkaar en een bordes aan het einde, zo diep als een vlucht
 * breed is; `bordesAnderEinde` legt het bordes aan het andere einde.
 */
export function trapInRechthoek(
  vak: { midden: Xy; u: Xy; v: Xy; lengte: number; breedte: number },
  vorm: "recht" | "keer",
  optreden: number,
  bordesAnderEinde: boolean,
): Trapdeel[] {
  const { midden, lengte, breedte, v } = vak;
  const u: Xy = bordesAnderEinde ? [-vak.u[0], -vak.u[1]] : vak.u;
  const l = lengte / 2;
  const b = breedte / 2;
  if (vorm === "recht") return [vlucht(midden, u, v, -l, l, -b, b, Math.max(2, optreden))];
  // Twee vluchten naast elkaar (aan -v en +v), het bordes aan +u.
  const diepte = Math.min(b, lengte * 0.45);
  const eerste = Math.max(2, Math.floor(optreden / 2));
  const tweede = Math.max(2, optreden - eerste);
  return [
    vlucht(midden, u, v, -l, l - diepte, -b, 0, eerste),
    { soort: "bordes", hoeken: rechthoek(midden, u, v, l - diepte, l, -b, b), treden: 0 },
    // De tweede vlucht loopt terug: haar onderste rand ligt bij het bordes.
    { soort: "vlucht", hoeken: rechthoek(midden, [-u[0], -u[1]], [-v[0], -v[1]], -(l - diepte), l, -b, 0), treden: tweede },
  ];
}

/** Het midden van een trap: dat van al zijn hoeken. */
export function middenVan(delen: readonly Trapdeel[]): Xy {
  const punten = delen.flatMap((deel) => deel.hoeken);
  return [punten.reduce((som, p) => som + p[0], 0) / punten.length, punten.reduce((som, p) => som + p[1], 0) / punten.length];
}

/** De rand onderaan de eerste vlucht en die bovenaan de laatste. */
function randen(delen: readonly Trapdeel[]): { voet: [Xy, Xy]; kop: [Xy, Xy] } {
  const eerste = delen[0].hoeken;
  const laatste = delen.at(-1)!.hoeken;
  return { voet: [eerste[0], eerste[1]], kop: [laatste[3], laatste[2]] };
}

/** Dezelfde trap, de andere kant op: de delen in omgekeerde volgorde, elke vlucht omgedraaid. */
export function omgedraaid(delen: readonly Trapdeel[]): Trapdeel[] {
  return [...delen].reverse().map((deel) =>
    deel.soort === "bordes" ? deel : { ...deel, hoeken: [deel.hoeken[2], deel.hoeken[3], deel.hoeken[0], deel.hoeken[1]] as Trapdeel["hoeken"] },
  );
}

/** Een punt net voorbij een rand, weg van het midden van de trap. */
function voorbij(rand: [Xy, Xy], midden: Xy, afstand: number): Xy {
  const m = midden2(rand[0], rand[1]);
  const d: Xy = [rand[1][0] - rand[0][0], rand[1][1] - rand[0][1]];
  const l = Math.hypot(d[0], d[1]) || 1;
  let n: Xy = [-d[1] / l, d[0] / l];
  if ((m[0] - midden[0]) * n[0] + (m[1] - midden[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return plus(m, n, afstand);
}

/** Hoe goed past een trap: beneden een ruimte voor de voet, boven een ruimte bij de kop. */
function past(delen: readonly Trapdeel[], beneden: readonly Veelhoek[], boven: readonly Veelhoek[]): number {
  const { voet, kop } = randen(delen);
  const m = middenVan(delen);
  return (binnenVeelhoeken(voorbij(voet, m, 0.3), beneden) ? 1 : 0) + (binnenVeelhoeken(voorbij(kop, m, 0.3), boven) ? 1 : 0);
}

/** Zet de delen op hoogte: elke vlucht stijgt met zijn treden, een bordes blijft op dezelfde hoogte. */
function opHoogte(delen: readonly Trapdeel[], z0: number, z1: number): Trapdeel3d[] {
  const totaal = delen.reduce((som, deel) => som + deel.treden, 0) || 1;
  const stap = (z1 - z0) / totaal;
  let z = z0;
  return delen.map((deel) => {
    const begin = z;
    z += deel.treden * stap;
    return { ...deel, z0: begin, z1: z };
  });
}

export interface Trapinvoer {
  onder: {
    id: number;
    z0: number;
    ruimtes: { soort: SoortRuimte; ringen: Xy[][] }[];
    /** Wat de omzetting op het plan vond, in meter in het gebouw. */
    trappen: Trapvoorstel[];
    standen: Trapstand[];
  };
  boven: {
    id: number;
    z0: number;
    ruimtes: { ringen: Xy[][] }[];
    /** De vloerplaat: ruimtes, muren en openingen samen. Een gat erin kan een trapgat zijn. */
    voetafdruk: Veelhoek[];
    muren: Veelhoek[];
  };
}

export interface Trapuitvoer {
  trappen: Trap3d[];
  /** Wat uit de vloer erboven gaat, als er daar nog geen gat was. */
  uitsparingen: Veelhoek[];
  /** De leuningen rond de gaten, op de vloer erboven. */
  leuningen: [Xy, Xy][];
}

const standVan = (standen: readonly Trapstand[], midden: Xy) =>
  standen.find((stand) => Math.hypot(stand.x - midden[0], stand.y - midden[1]) <= STAND_AFSTAND);

/** Is een gat een trapgat? Zo niet, dan is het een vide. */
function alsTrapgat(ring: readonly Xy[]) {
  const vak = rechthoekRond(ring);
  if (!vak) return null;
  const opp = Math.abs(oppervlakte([...ring]));
  if (opp < 1.2 || opp < 0.55 * vak.lengte * vak.breedte) return null;
  if (vak.breedte < 0.6 || vak.breedte > 2.8 || vak.lengte < 1.8 || vak.lengte > 6.5) return null;
  return vak;
}

export function maakTrappen(invoer: Trapinvoer): Trapuitvoer {
  const { onder, boven } = invoer;
  const hoogte = boven.z0 - onder.z0;
  if (!(hoogte > 0.5)) return { trappen: [], uitsparingen: [], leuningen: [] };
  const optreden = Math.max(4, Math.round(hoogte / OPTREDE));
  const beneden = onder.ruimtes.map((r) => r.ringen);
  const bovenRuimtes = boven.ruimtes.map((r) => r.ringen);
  const gaten: Veelhoek[] = boven.voetafdruk.flatMap((veelhoek) => veelhoek.slice(1).map((ring) => [ring]));
  const trappen: Trap3d[] = [];
  const bezet: Veelhoek[] = [];
  const raakt = (vlak: Veelhoek) => bezet.some((ander) => oppervlakteVan(doorsnede([vlak], [ander])) > 0.3);

  // Waar je boven op de vloer staat: niet in een gat, wel op de vloerplaat.
  const vloerBoven = (p: Xy) => !binnenVeelhoeken(p, gaten) && binnenVeelhoeken(p, boven.voetafdruk);

  const voegToe = (gevonden: Trapdeel[], bron: Trap3d["bron"], vorm: Trap3d["vorm"], breedte: number, stand: Trap3d["stand"], midden: Xy) => {
    const delen = metAankomst(gevonden, vloerBoven);
    const { kop } = randen(delen);
    trappen.push({
      van: onder.id,
      naar: boven.id,
      midden,
      bron,
      vorm,
      delen: opHoogte(delen, onder.z0, boven.z0),
      breedte,
      aankomst: kop,
      stand,
    });
    bezet.push(...delen.map((deel) => [deel.hoeken] as Veelhoek));
  };

  // 1. Wat op het plan staat.
  for (const trap of onder.trappen) {
    const midden = middenVan(trap.delen);
    const stand = standVan(onder.standen, midden);
    if (stand?.geen) {
      bezet.push(...trap.delen.map((deel) => [deel.hoeken] as Veelhoek));
      continue;
    }
    // Zonder pijl de richting die het best past, tenzij er al gekozen werd.
    const geraden = trap.richting === "geraden" && past(omgedraaid(trap.delen), beneden, bovenRuimtes) > past(trap.delen, beneden, bovenRuimtes);
    const omgekeerd = stand?.omgekeerd ?? geraden;
    const delen = omgekeerd ? omgedraaid(trap.delen) : trap.delen;
    const eerste = delen[0].hoeken;
    const breedte = Math.hypot(eerste[1][0] - eerste[0][0], eerste[1][1] - eerste[0][1]);
    const vorm = delen.length === 1 ? "recht" : richtingVerschil(delen) < 0 ? "keer" : "kwart";
    voegToe(delen, "plan", vorm, breedte, { vorm: null, omgekeerd, bordesAnderEinde: false }, midden);
  }

  // 2. Onder een trapgat, en 3. in een ruimte van het soort Trap.
  const vakken = [
    ...gaten.map((gat) => ({ ring: gat[0], bron: "gat" as const })),
    ...onder.ruimtes.filter((r) => r.soort === "trap" && r.ringen[0]).map((r) => ({ ring: r.ringen[0], bron: "ruimte" as const })),
  ];
  for (const { ring, bron } of vakken) {
    const vak = bron === "gat" ? alsTrapgat(ring) : rechthoekRond(ring);
    if (!vak || vak.breedte < 0.6 || raakt([ring])) continue;
    const stand = standVan(onder.standen, vak.midden);
    if (stand?.geen) {
      bezet.push([ring]);
      continue;
    }
    const vorm = stand?.vorm ?? (vak.breedte < 1.6 ? "recht" : "keer");
    // Wat gekozen werd, geldt; de rest wordt geraden: de opstelling die het best past.
    const opties = [false, true].flatMap((omgekeerd) =>
      (vorm === "keer" ? [false, true] : [false]).map((bordesAnderEinde) => ({ omgekeerd, bordesAnderEinde })),
    );
    const toegelaten = opties.filter(
      (o) =>
        (stand?.omgekeerd === undefined || o.omgekeerd === stand.omgekeerd) &&
        (stand?.bordesAnderEinde === undefined || vorm !== "keer" || o.bordesAnderEinde === stand.bordesAnderEinde),
    );
    const metDelen = toegelaten.map((o) => {
      const basis = trapInRechthoek(vak, vorm, optreden, o.bordesAnderEinde);
      return { ...o, delen: o.omgekeerd ? omgedraaid(basis) : basis };
    });
    const gekozen = metDelen.reduce((beste, kandidaat) =>
      past(kandidaat.delen, beneden, bovenRuimtes) > past(beste.delen, beneden, bovenRuimtes) ? kandidaat : beste,
    );
    voegToe(
      gekozen.delen,
      bron,
      vorm,
      vorm === "recht" ? vak.breedte : vak.breedte / 2,
      { vorm, omgekeerd: gekozen.omgekeerd, bordesAnderEinde: gekozen.bordesAnderEinde },
      vak.midden,
    );
  }

  // Boven de trap een gat in de vloer, als er daar nog geen was.
  const uitsparingen: Veelhoek[] = [];
  const rondGaten: Veelhoek[] = [];
  for (const trap of trappen) {
    const vlak = vereniging(trap.delen.map((deel) => [deel.hoeken] as Veelhoek));
    const opp = oppervlakteVan(vlak);
    const open = oppervlakteVan(doorsnede(vlak, gaten));
    const bestaand = gaten.filter((gat) => oppervlakteVan(doorsnede([gat], vlak)) > 0.05);
    if (open < 0.3 * opp) {
      uitsparingen.push(...vlak);
      rondGaten.push(...vlak);
    } else rondGaten.push(...bestaand);
  }

  // Een leuning rond elk gat boven een trap, behalve tegen een muur en waar de trap aankomt.
  const leuningen: [Xy, Xy][] = [];
  for (const gat of vereniging(rondGaten)) {
    for (const ring of gat) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        for (const [p, q] of zonderAankomst(a, b, trappen)) {
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.1) continue;
          // Tegen een muur hoeft er geen leuning.
          const r: Xy = [q[0] - p[0], q[1] - p[1]];
          const l = Math.hypot(r[0], r[1]);
          const n: Xy = [-r[1] / l, r[0] / l];
          const mid = midden2(p, q);
          const naast = [plus(mid, n, 0.1), plus(mid, n, -0.1)];
          if (naast.some((punt) => binnenVeelhoeken(punt, boven.muren))) continue;
          leuningen.push([p, q]);
        }
      }
    }
  }

  return { trappen, uitsparingen, leuningen };
}

/**
 * Een gat boven is soms wat groter dan de trap: dan ligt er tussen de
 * bovenste trede en de vloer een kier. Tot 80 cm wordt dat een strook vloer
 * op de hoogte van de verdieping erboven, zodat je boven van de trap stapt.
 */
function metAankomst(delen: Trapdeel[], vloerBoven: (p: Xy) => boolean): Trapdeel[] {
  const laatste = delen.at(-1)!;
  if (laatste.soort !== "vlucht") return delen;
  const [a, b, c, d] = laatste.hoeken;
  const r: Xy = [(c[0] + d[0] - a[0] - b[0]) / 2, (c[1] + d[1] - a[1] - b[1]) / 2];
  const l = Math.hypot(r[0], r[1]);
  if (l < 1e-9) return delen;
  const u: Xy = [r[0] / l, r[1] / l];
  const kop = midden2(d, c);
  for (let diepte = 0.05; diepte <= 0.8 + 1e-9; diepte += 0.05) {
    if (!vloerBoven(plus(kop, u, diepte))) continue;
    // Terug tot aan de rand van de vloer, op een halve centimeter.
    let rand = diepte;
    while (rand - 0.005 > 0 && vloerBoven(plus(kop, u, rand - 0.005))) rand -= 0.005;
    if (rand <= 0.03) return delen;
    const strook = Math.round(rand * 1000) / 1000;
    return [...delen, { soort: "bordes", hoeken: [d, c, plus(c, u, strook), plus(d, u, strook)], treden: 0 }];
  }
  return delen;
}

/** Wijzen de eerste en de laatste vlucht dezelfde kant op (positief), haaks (0) of tegengesteld (negatief)? */
function richtingVerschil(delen: readonly Trapdeel[]): number {
  const r = (deel: Trapdeel): Xy => {
    const [a, b, c, d] = deel.hoeken;
    const x: Xy = [(c[0] + d[0] - a[0] - b[0]) / 2, (c[1] + d[1] - a[1] - b[1]) / 2];
    const l = Math.hypot(x[0], x[1]) || 1;
    return [x[0] / l, x[1] / l];
  };
  const vluchten = delen.filter((deel) => deel.soort === "vlucht");
  const p = r(vluchten[0]);
  const q = r(vluchten.at(-1)!);
  const cos = p[0] * q[0] + p[1] * q[1];
  return Math.abs(cos) < 0.5 ? 0 : cos;
}

/** Een rand van een gat, zonder het stuk waar een trap aankomt. */
function zonderAankomst(a: Xy, b: Xy, trappen: readonly Trap3d[]): [Xy, Xy][] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 1e-9) return [];
  const u: Xy = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  let stukken: [number, number][] = [[0, l]];
  for (const trap of trappen) {
    const [p, q] = trap.aankomst;
    const afstand = (x: Xy) => Math.abs((x[0] - a[0]) * -u[1] + (x[1] - a[1]) * u[0]);
    if (afstand(p) > 0.25 || afstand(q) > 0.25) continue;
    const tp = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
    const tq = (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
    const [van, tot] = [Math.min(tp, tq) - 0.05, Math.max(tp, tq) + 0.05];
    stukken = stukken.flatMap(([s0, s1]) => {
      if (tot <= s0 || van >= s1) return [[s0, s1] as [number, number]];
      const rest: [number, number][] = [];
      if (van > s0) rest.push([s0, van]);
      if (tot < s1) rest.push([tot, s1]);
      return rest;
    });
  }
  return stukken.map(([s0, s1]) => [plus(a, u, s0), plus(a, u, s1)] as [Xy, Xy]);
}

/** Ligt p op de trap? Dan het deel en de hoogte er, met een gelijkmatige helling over een vlucht. */
export function opTrap(trap: Trap3d, p: Xy): { deel: number; z: number; t: number } | null {
  for (const [i, deel] of trap.delen.entries()) {
    if (!binnen(p, deel.hoeken)) continue;
    if (deel.soort === "bordes") return { deel: i, z: deel.z0, t: 0.5 };
    const [a, b, , d] = deel.hoeken;
    const voet = midden2(a, b);
    const r: Xy = [d[0] - a[0], d[1] - a[1]];
    const l2 = r[0] * r[0] + r[1] * r[1] || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - voet[0]) * r[0] + (p[1] - voet[1]) * r[1]) / l2));
    return { deel: i, z: deel.z0 + t * (deel.z1 - deel.z0), t };
  }
  return null;
}
