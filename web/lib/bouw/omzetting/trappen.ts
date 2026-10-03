import { binnen, inKader } from "./geometrie";
import type { Blad, Kader, Trapdeel, Trapvoorstel, Xy } from "./types";

export type { Trapdeel, Trapvoorstel };

/**
 * De trappen van een grondplan, voor het 3D-model. Een trap staat op het plan
 * als een reeks evenwijdige lijnen op gelijke afstand: de treden, van 60 cm
 * tot 1,60 m lang en 17 tot 36 cm uit elkaar. Zo'n reeks is een vlucht.
 *
 * - Eén vlucht is een rechte trap.
 * - Twee vluchten naast elkaar, met een muurtje of een spleet ertussen, zijn
 *   een trap die halfweg 180° draait: aan het einde waar ze samenkomen ligt
 *   een bordes over de hele breedte.
 * - Twee vluchten haaks op elkaar zijn een kwartdraai met een hoekbordes.
 *
 * Een pijltje in een vlucht (een gevulde driehoek of een open V) wijst naar
 * boven. Zonder pijl is de richting geraden; het 3D-model kiest dan, en je kan
 * de trap omdraaien.
 *
 * Een streepjeslijn (het deel van de trap boven de snede) wordt eerst weer één
 * lijn, en een trede die achter een muur verdwijnt, telt toch mee.
 *
 * Puur, met tests. In en uit in paginapunten; de regels rekenen in meter.
 */

const TREDE_MIN = 0.6;
const TREDE_MAX = 1.6;
const STAP_MIN = 0.17;
const STAP_MAX = 0.36;
/** Hoeveel een tussenafstand mag afwijken van de eerste, per stap. */
const STAP_SPELING = 0.035;
const MIN_LIJNEN = 4;
/** Evenwijdig: binnen deze hoek van elkaar (radialen), en samen niet meer dan het dubbele. */
const HOEK_SPELING = 0.01;
/** Op dezelfde lijn: zo ver van elkaar (meter), dwars op de lijn. */
const LIJN_SPELING = 0.012;
/** Het gat tussen twee streepjes van een streepjeslijn. */
const STREEPGAT = 0.12;
/** Tussen twee vluchten naast elkaar: een muurtje of een spleet. */
const NAAST_MAX = 0.4;
/** Ongeveer anderhalve graad: daar knipt de hoek, zodat een horizontale lijn bij 0 blijft. */
const KNIK = 0.026;

type Kader2 = Kader;

interface Rechte {
  /** De richting van de lijn, en de afstand tot de oorsprong dwars erop. */
  hoek: number;
  rho: number;
  t0: number;
  t1: number;
}

interface Vlucht {
  hoek: number;
  /** Langs de treden (t) en in de looprichting (rho), in meter. */
  t0: number;
  t1: number;
  rho0: number;
  rho1: number;
  treden: number;
}

const as = (hoek: number): { u: Xy; v: Xy } => ({
  u: [Math.cos(hoek), Math.sin(hoek)],
  v: [-Math.sin(hoek), Math.cos(hoek)],
});

const punt = (hoek: number, t: number, rho: number): Xy => {
  const { u, v } = as(hoek);
  return [u[0] * t + v[0] * rho, u[1] * t + v[1] * rho];
};

const inVlak = (hoek: number, p: Xy): { t: number; rho: number } => {
  const { u, v } = as(hoek);
  return { t: p[0] * u[0] + p[1] * u[1], rho: p[0] * v[0] + p[1] * v[1] };
};

/** De hoek van a naar b, tussen bijna 0 en bijna 180°. */
function hoekVan(a: Xy, b: Xy): number {
  let hoek = Math.atan2(b[1] - a[1], b[0] - a[0]);
  hoek = ((hoek % Math.PI) + Math.PI) % Math.PI;
  return hoek >= Math.PI - KNIK ? hoek - Math.PI : hoek;
}

function mediaan(waarden: number[]): number {
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** De korte getrokken lijnstukken van het blad, in meter, binnen het gebouw. */
function stukkenVan(blad: Blad, m: number, gebied: Kader2 | null): { hoek: number; a: Xy; b: Xy }[] {
  const kader = gebied ? { x0: gebied.x0 * m, y0: gebied.y0 * m, x1: gebied.x1 * m, y1: gebied.y1 * m } : null;
  const uit: { hoek: number; a: Xy; b: Xy }[] = [];
  for (const pad of blad.paden) {
    if (pad.lijn === null) continue;
    for (const deel of pad.delen) {
      const p = deel.punten;
      const aantal = deel.gesloten ? p.length : p.length - 1;
      for (let i = 0; i < aantal; i++) {
        const a: Xy = [p[i][0] * m, p[i][1] * m];
        const b: Xy = [p[(i + 1) % p.length][0] * m, p[(i + 1) % p.length][1] * m];
        const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Een streepje is kort; een lijn die langer is dan een trede, hoort er niet bij.
        if (lengte < 0.01 || lengte > TREDE_MAX * 1.2) continue;
        if (kader && !inKader([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], kader)) continue;
        uit.push({ hoek: hoekVan(a, b), a, b });
      }
    }
  }
  return uit;
}

/** Groepen van ongeveer evenwijdige dingen, op hun hoek. */
function opHoek<T extends { hoek: number }>(dingen: T[]): T[][] {
  const gesorteerd = [...dingen].sort((a, b) => a.hoek - b.hoek);
  const groepen: T[][] = [];
  for (const ding of gesorteerd) {
    const groep = groepen.at(-1);
    if (groep && ding.hoek - groep.at(-1)!.hoek <= HOEK_SPELING && ding.hoek - groep[0].hoek <= 2.5 * HOEK_SPELING) groep.push(ding);
    else groepen.push([ding]);
  }
  return groepen;
}

/** De rechte lijnen: stukken op dezelfde lijn, met hoogstens een streepgat ertussen, worden één. */
export function rechtenVan(stukken: { hoek: number; a: Xy; b: Xy }[]): Rechte[] {
  const uit: Rechte[] = [];
  for (const groep of opHoek(stukken)) {
    const hoek = groep.reduce((som, s) => som + s.hoek, 0) / groep.length;
    const lijnen = groep
      .map((s) => {
        const a = inVlak(hoek, s.a);
        const b = inVlak(hoek, s.b);
        return { rho: (a.rho + b.rho) / 2, t0: Math.min(a.t, b.t), t1: Math.max(a.t, b.t) };
      })
      .sort((x, y) => x.rho - y.rho);
    // Dwars op de lijn dicht bij elkaar: dezelfde lijn.
    let begin = 0;
    for (let i = 1; i <= lijnen.length; i++) {
      if (i < lijnen.length && lijnen[i].rho - lijnen[i - 1].rho <= LIJN_SPELING && lijnen[i].rho - lijnen[begin].rho <= 2 * LIJN_SPELING) continue;
      const zelfde = lijnen.slice(begin, i).sort((x, y) => x.t0 - y.t0);
      const rho = zelfde.reduce((som, l) => som + l.rho, 0) / zelfde.length;
      let huidig = { t0: zelfde[0].t0, t1: zelfde[0].t1 };
      for (const l of zelfde.slice(1)) {
        if (l.t0 - huidig.t1 <= STREEPGAT) huidig.t1 = Math.max(huidig.t1, l.t1);
        else {
          uit.push({ hoek, rho, ...huidig });
          huidig = { t0: l.t0, t1: l.t1 };
        }
      }
      uit.push({ hoek, rho, ...huidig });
      begin = i;
    }
  }
  return uit;
}

const lengte = (r: { t0: number; t1: number }) => r.t1 - r.t0;

/** Liggen twee treden naast elkaar in dezelfde trap: ongeveer even lang, en grotendeels tegenover elkaar. */
function tegenover(a: Rechte, b: Rechte): boolean {
  const kort = Math.min(lengte(a), lengte(b));
  const lang = Math.max(lengte(a), lengte(b));
  const overlap = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
  return lang <= kort * 1.35 && overlap >= 0.7 * kort;
}

/** De langste reeks treden die bij `begin` start, met een vaste stap; een ontbrekende trede mag. */
function reeksVanaf(lijnen: Rechte[], begin: number): { lijnen: number[]; treden: number } {
  let beste = { lijnen: [begin], treden: 1 };
  for (let eerste = begin + 1; eerste < lijnen.length; eerste++) {
    const stap = lijnen[eerste].rho - lijnen[begin].rho;
    if (stap > STAP_MAX) break;
    if (stap < STAP_MIN || !tegenover(lijnen[eerste], lijnen[begin])) continue;
    const reeks = [begin, eerste];
    let treden = 2;
    let laatste = eerste;
    for (let j = eerste + 1; j < lijnen.length; j++) {
      const afstand = lijnen[j].rho - lijnen[laatste].rho;
      if (afstand > 2 * stap + STAP_SPELING * 2) break;
      const keer = Math.round(afstand / stap);
      if ((keer === 1 || keer === 2) && Math.abs(afstand - keer * stap) <= STAP_SPELING * keer && tegenover(lijnen[j], lijnen[begin])) {
        reeks.push(j);
        treden += keer;
        laatste = j;
      }
    }
    if (reeks.length > beste.lijnen.length) beste = { lijnen: reeks, treden };
  }
  return beste;
}

/** De vluchten: reeksen van minstens vier treden, zonder raster van lijnen dwars erdoor. */
function vluchtenVan(rechten: Rechte[]): Vlucht[] {
  const kandidaten = rechten.filter((r) => lengte(r) >= TREDE_MIN && lengte(r) <= TREDE_MAX);
  const vluchten: Vlucht[] = [];
  for (const groep of opHoek(kandidaten)) {
    const lijnen = [...groep].sort((a, b) => a.rho - b.rho);
    const gebruikt = new Set<number>();
    for (let i = 0; i < lijnen.length; i++) {
      if (gebruikt.has(i)) continue;
      const reeks = reeksVanaf(
        lijnen.map((l, j) => (gebruikt.has(j) ? { ...l, t0: 0, t1: 0 } : l)),
        i,
      );
      if (reeks.lijnen.length < MIN_LIJNEN) continue;
      reeks.lijnen.forEach((j) => gebruikt.add(j));
      const deze = reeks.lijnen.map((j) => lijnen[j]);
      vluchten.push({
        hoek: deze[0].hoek,
        t0: mediaan(deze.map((l) => l.t0)),
        t1: mediaan(deze.map((l) => l.t1)),
        rho0: deze[0].rho,
        rho1: deze.at(-1)!.rho,
        treden: reeks.treden,
      });
    }
  }
  // Een raster (tegels, een arcering) heeft ook lijnen dwars door de vlucht.
  return vluchten.filter((vlucht) => {
    const dwars = rechten.filter((r) => {
      const verschil = Math.abs(Math.abs(r.hoek - vlucht.hoek) - Math.PI / 2);
      if (verschil > 0.05 || lengte(r) < 0.3) return false;
      const midden = punt(r.hoek, (r.t0 + r.t1) / 2, r.rho);
      const { t, rho } = inVlak(vlucht.hoek, midden);
      return t > vlucht.t0 + 0.08 && t < vlucht.t1 - 0.08 && rho > vlucht.rho0 && rho < vlucht.rho1;
    });
    return dwars.length < 3;
  });
}

interface Pijl {
  midden: Xy;
  richting: Xy;
}

/** De pijltjes: een kleine gevulde driehoek, of een open V van twee korte lijnen. */
function pijlenVan(blad: Blad, m: number): Pijl[] {
  const uit: Pijl[] = [];
  for (const pad of blad.paden) {
    for (const deel of pad.delen) {
      let p = deel.punten.map(([x, y]) => [x * m, y * m] as Xy);
      if (p.length === 4 && Math.hypot(p[0][0] - p[3][0], p[0][1] - p[3][1]) < 1e-6) p = p.slice(0, 3);
      if (p.length !== 3) continue;
      const zijden = [0, 1, 2].map((i) => Math.hypot(p[(i + 1) % 3][0] - p[i][0], p[(i + 1) % 3][1] - p[i][1]));
      if (Math.max(...zijden) > 0.6 || Math.min(...zijden) < 0.02) continue;
      const gevuld = pad.vul !== null && pad.vul !== "patroon" && (deel.gesloten || p.length === 3);
      if (gevuld) {
        const opp = Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2;
        if (opp < 0.001 || opp > 0.08) continue;
        // De punt staat tegenover de kortste zijde; een gelijkzijdige driehoek wijst nergens heen.
        const kort = zijden.indexOf(Math.min(...zijden));
        const gesorteerd = [...zijden].sort((a, b) => a - b);
        if (gesorteerd[0] > 0.85 * gesorteerd[1]) continue;
        const a = p[kort];
        const b = p[(kort + 1) % 3];
        const top = p[(kort + 2) % 3];
        const voet: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const l = Math.hypot(top[0] - voet[0], top[1] - voet[1]);
        uit.push({ midden: [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3], richting: [(top[0] - voet[0]) / l, (top[1] - voet[1]) / l] });
      } else if (pad.lijn !== null && !deel.gesloten && zijden[0] <= 0.35 && zijden[1] <= 0.35) {
        // Een open V: de punt is het middelste punt, met een scherpe hoek.
        const [a, top, b] = p;
        const ua: Xy = [(a[0] - top[0]) / zijden[0], (a[1] - top[1]) / zijden[0]];
        const ub: Xy = [(b[0] - top[0]) / zijden[1], (b[1] - top[1]) / zijden[1]];
        const cos = ua[0] * ub[0] + ua[1] * ub[1];
        if (cos < Math.cos((100 * Math.PI) / 180) || cos > Math.cos((15 * Math.PI) / 180)) continue;
        const terug: Xy = [ua[0] + ub[0], ua[1] + ub[1]];
        const l = Math.hypot(terug[0], terug[1]);
        uit.push({ midden: top, richting: [-terug[0] / l, -terug[1] / l] });
      }
    }
  }
  return uit;
}

/** Wijst een pijl in deze vlucht naar hogere rho (1), lagere (-1), of is er geen (0)? */
function pijlIn(vlucht: Vlucht, pijlen: Pijl[]): 1 | -1 | 0 {
  const { v } = as(vlucht.hoek);
  for (const pijl of pijlen) {
    const { t, rho } = inVlak(vlucht.hoek, pijl.midden);
    if (t < vlucht.t0 - 0.2 || t > vlucht.t1 + 0.2 || rho < vlucht.rho0 - 0.2 || rho > vlucht.rho1 + 0.2) continue;
    const langs = pijl.richting[0] * v[0] + pijl.richting[1] * v[1];
    if (Math.abs(langs) >= 0.7) return langs > 0 ? 1 : -1;
  }
  return 0;
}

/** De vlucht als deel van de trap, in de richting waarin ze oploopt. */
function vluchtdeel(vlucht: Vlucht, op: 1 | -1): Trapdeel {
  const [onder, boven] = op === 1 ? [vlucht.rho0, vlucht.rho1] : [vlucht.rho1, vlucht.rho0];
  const [links, rechts] = op === 1 ? [vlucht.t0, vlucht.t1] : [vlucht.t1, vlucht.t0];
  return {
    soort: "vlucht",
    hoeken: [punt(vlucht.hoek, links, onder), punt(vlucht.hoek, rechts, onder), punt(vlucht.hoek, rechts, boven), punt(vlucht.hoek, links, boven)],
    treden: vlucht.treden,
  };
}

/** Hoe ver er vanaf p in richting r een muur staat, tussen van en tot meter; null als er geen is. */
function muurOp(p: Xy, r: Xy, muren: Xy[][], van: number, tot: number): number | null {
  const inMuur = (d: number) => muren.some((ring) => binnen([p[0] + r[0] * d, p[1] + r[1] * d], ring));
  for (let d = van; d <= tot; d += 0.05) {
    if (!inMuur(d)) continue;
    // Terug naar de rand van de muur, op een halve centimeter.
    let rand = d;
    while (rand - 0.005 >= van && inMuur(rand - 0.005)) rand -= 0.005;
    return Math.round(rand * 1000) / 1000;
  }
  return null;
}

/** Twee vluchten naast elkaar: een trap die 180° draait, met een bordes aan het einde. */
function alsKeertrap(a: Vlucht, b: Vlucht, pijlen: Pijl[], muren: Xy[][]): Trapvoorstel | null {
  if (Math.abs(a.hoek - b.hoek) > 3 * HOEK_SPELING) return null;
  const [links, rechts] = a.t0 <= b.t0 ? [a, b] : [b, a];
  const spleet = rechts.t0 - links.t1;
  if (spleet < -0.1 || spleet > NAAST_MAX) return null;
  const samen = Math.min(a.rho1, b.rho1) - Math.max(a.rho0, b.rho0);
  if (samen < 0.3 * Math.min(a.rho1 - a.rho0, b.rho1 - b.rho0)) return null;

  const hoek = (a.hoek + b.hoek) / 2;
  const { v } = as(hoek);
  const t0 = Math.min(a.t0, b.t0);
  const t1 = Math.max(a.t1, b.t1);
  const breedte = ((a.t1 - a.t0) + (b.t1 - b.t0)) / 2;
  const bovenGelijk = Math.abs(a.rho1 - b.rho1) <= 0.4;
  const onderGelijk = Math.abs(a.rho0 - b.rho0) <= 0.4;
  if (!bovenGelijk && !onderGelijk) return null;

  // Het bordes ligt aan het einde waar beide vluchten samen ophouden. Liggen ze
  // aan beide kanten gelijk, dan aan de kant met de meeste tekens van een
  // bordes: een muur op een vluchtbreedte verder, het muurtje tussen de
  // vluchten dat daar ophoudt, en de uiteinden die het best gelijk liggen.
  const einde = (kant: 1 | -1) => (kant === 1 ? Math.max(a.rho1, b.rho1) : Math.min(a.rho0, b.rho0));
  const diepte = (kant: 1 | -1) => muurOp(punt(hoek, (t0 + t1) / 2, einde(kant)), [v[0] * kant, v[1] * kant], muren, 0.5, 2.2);
  const spleetVrij = (kant: 1 | -1) =>
    spleet < 0.05 ? false : !muren.some((ring) => binnen(punt(hoek, (links.t1 + rechts.t0) / 2, einde(kant) + kant * 0.2), ring));
  const verschil = (kant: 1 | -1) => (kant === 1 ? Math.abs(a.rho1 - b.rho1) : Math.abs(a.rho0 - b.rho0));
  const score = (kant: 1 | -1) => (diepte(kant) !== null ? 1 : 0) + (spleetVrij(kant) ? 1 : 0) - verschil(kant);
  const kant: 1 | -1 = bovenGelijk && onderGelijk ? (score(1) >= score(-1) ? 1 : -1) : bovenGelijk ? 1 : -1;
  const tot = diepte(kant) ?? breedte;
  const r0 = einde(kant);
  const r1 = r0 + kant * tot;
  const bordes: Trapdeel = {
    soort: "bordes",
    hoeken: [punt(hoek, t0, Math.min(r0, r1)), punt(hoek, t1, Math.min(r0, r1)), punt(hoek, t1, Math.max(r0, r1)), punt(hoek, t0, Math.max(r0, r1))],
    treden: 0,
  };

  // De eerste vlucht loopt naar het bordes toe, de tweede ervan weg.
  const pijlA = pijlIn(a, pijlen);
  const pijlB = pijlIn(b, pijlen);
  let eerste = a;
  if (pijlA !== 0) eerste = pijlA === kant ? a : b;
  else if (pijlB !== 0) eerste = pijlB === kant ? b : a;
  const tweede = eerste === a ? b : a;
  return {
    delen: [vluchtdeel(eerste, kant), bordes, vluchtdeel(tweede, kant === 1 ? -1 : 1)],
    richting: pijlA !== 0 || pijlB !== 0 ? "pijl" : "geraden",
  };
}

/** Twee vluchten haaks op elkaar: een kwartdraai met een vierkant bordes in de hoek. */
function alsKwartdraai(a: Vlucht, b: Vlucht, pijlen: Pijl[]): Trapvoorstel | null {
  if (Math.abs(Math.abs(a.hoek - b.hoek) - Math.PI / 2) > 0.05) return null;
  const breedteA = a.t1 - a.t0;
  const breedteB = b.t1 - b.t0;
  // Het bordes ligt in het verlengde van beide vluchten: voorbij een einde van a, en voorbij een einde van b.
  for (const kantA of [1, -1] as const) {
    const rA = kantA === 1 ? a.rho1 : a.rho0;
    const middenA = punt(a.hoek, (a.t0 + a.t1) / 2, rA + (kantA * breedteB) / 2);
    for (const kantB of [1, -1] as const) {
      const rB = kantB === 1 ? b.rho1 : b.rho0;
      const middenB = punt(b.hoek, (b.t0 + b.t1) / 2, rB + (kantB * breedteA) / 2);
      if (Math.hypot(middenA[0] - middenB[0], middenA[1] - middenB[1]) > 0.3 * Math.max(breedteA, breedteB)) continue;
      const r0 = Math.min(rA, rA + kantA * breedteB);
      const r1 = Math.max(rA, rA + kantA * breedteB);
      const bordes: Trapdeel = {
        soort: "bordes",
        hoeken: [punt(a.hoek, a.t0, r0), punt(a.hoek, a.t1, r0), punt(a.hoek, a.t1, r1), punt(a.hoek, a.t0, r1)],
        treden: 0,
      };
      const pijlA = pijlIn(a, pijlen);
      const pijlB = pijlIn(b, pijlen);
      // a loopt naar het bordes toe als ze oploopt in de richting van kantA.
      const aEerst = pijlA !== 0 ? pijlA === kantA : pijlB !== 0 ? pijlB !== kantB : true;
      const delen = aEerst
        ? [vluchtdeel(a, kantA), bordes, vluchtdeel(b, kantB === 1 ? -1 : 1)]
        : [vluchtdeel(b, kantB), bordes, vluchtdeel(a, kantA === 1 ? -1 : 1)];
      return { delen, richting: pijlA !== 0 || pijlB !== 0 ? "pijl" : "geraden" };
    }
  }
  return null;
}

/**
 * Vindt de trappen op een blad. `gebied` is waar het gebouw ligt en `muren`
 * zijn de muren van de omzetting, allebei in paginapunten.
 */
export function vindTrappen(blad: Blad, meterPerPunt: number, gebied: Kader | null, murenInPunten: Xy[][]): Trapvoorstel[] {
  if (!(meterPerPunt > 0)) return [];
  const m = meterPerPunt;
  const muren = murenInPunten.map((ring) => ring.map(([x, y]) => [x * m, y * m] as Xy));
  const rechten = rechtenVan(stukkenVan(blad, m, gebied));
  // Een trede ligt niet in een muur: de arcering van een muur is geen trap.
  const vrij = rechten.filter((r) => {
    if (lengte(r) < TREDE_MIN || lengte(r) > TREDE_MAX) return true;
    const midden = punt(r.hoek, (r.t0 + r.t1) / 2, r.rho);
    return !muren.some((ring) => binnen(midden, ring));
  });
  const vluchten = vluchtenVan(vrij);
  const pijlen = pijlenVan(blad, m);

  const trappen: Trapvoorstel[] = [];
  const gebruikt = new Set<number>();
  for (let i = 0; i < vluchten.length; i++) {
    for (let j = i + 1; j < vluchten.length && !gebruikt.has(i); j++) {
      if (gebruikt.has(j)) continue;
      const trap = alsKeertrap(vluchten[i], vluchten[j], pijlen, muren) ?? alsKwartdraai(vluchten[i], vluchten[j], pijlen);
      if (trap) {
        trappen.push(trap);
        gebruikt.add(i);
        gebruikt.add(j);
      }
    }
  }
  vluchten.forEach((vlucht, i) => {
    if (gebruikt.has(i)) return;
    const pijl = pijlIn(vlucht, pijlen);
    trappen.push({ delen: [vluchtdeel(vlucht, pijl === -1 ? -1 : 1)], richting: pijl === 0 ? "geraden" : "pijl" });
  });

  // Terug naar paginapunten, zoals de rest van het voorstel.
  const naarPunten = (p: Xy): Xy => [p[0] / m, p[1] / m];
  return trappen.map((trap) => ({
    ...trap,
    delen: trap.delen.map((deel) => ({ ...deel, hoeken: deel.hoeken.map(naarPunten) as Trapdeel["hoeken"] })),
  }));
}

/** Hoeveel een trap draait tussen zijn eerste en laatste vlucht: 0 (recht), 90 of 180 graden. */
export function trapdraai(trap: Trapvoorstel): 0 | 90 | 180 {
  const richting = (deel: Trapdeel): Xy => {
    const [a, b, c, d] = deel.hoeken;
    const r: Xy = [(c[0] + d[0] - a[0] - b[0]) / 2, (c[1] + d[1] - a[1] - b[1]) / 2];
    const l = Math.hypot(r[0], r[1]) || 1;
    return [r[0] / l, r[1] / l];
  };
  const eerste = richting(trap.delen[0]);
  const laatste = richting(trap.delen.at(-1)!);
  const cos = eerste[0] * laatste[0] + eerste[1] * laatste[1];
  return cos < -0.7 ? 180 : cos < 0.7 ? 90 : 0;
}
