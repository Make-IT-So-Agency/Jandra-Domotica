import { binnen } from "../omzetting/geometrie";
import type { Raamvorm, Xy } from "../omzetting/types";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * De ramen en deuren van een verdieping, voor het 3D-model. In het grondplan
 * zijn het de open plekken in een muur: langs de rand van een ruimte ligt
 * muur, dan even niet, dan weer wel. Wat erachter ligt, zegt wat het is:
 * buiten is een raam of een buitendeur, een andere ruimte een deur of een
 * doorgang. Wat de omzetting op het plan las, vult aan: een deurboog geeft
 * het deurblad en naar waar het draait, een raammaat de hoogte en de vakken,
 * een borstwering waar het raam begint.
 *
 * Puur. Alles in meter, in het assenstelsel van het gebouw.
 */

export type Gatsoort = "raam" | "buitendeur" | "deur" | "doorgang";

export interface Gat {
  soort: Gatsoort;
  /** Het begin en het einde van de opening, langs de rand van de ruimte. */
  a: Xy;
  b: Xy;
  /** Van de ruimte naar buiten (of naar de andere ruimte), lengte 1. */
  n: Xy;
  /** Hoe dik de muur is: van de rand van de ruimte tot de andere kant. */
  dikte: number;
  /** Boven de vloer: de onderkant (borstwering) en de bovenkant (latei). */
  onder: number;
  boven: number;
  /** De bladen van een deur, uit de bogen op het plan: één, of twee bij een dubbele deur. */
  bladen?: Deurblad[];
  /** Waar de stijlen tussen de vakken van een raam staan, in meter van a naar b. */
  verdeling?: number[];
}

/**
 * Een deurblad, in meter: het scharnier, en waar het uiteinde ligt als de
 * deur dicht is (langs de muur) en helemaal open (haaks erop, zoals de boog
 * op het plan). Punten, en geen "links" of "rechts": de volgorde van a en b
 * hangt af van de ruimte die de opening vond.
 */
export interface Deurblad {
  scharnier: Xy;
  dicht: Xy;
  open: Xy;
}

/** Een deurboog, raammaat of borstwering zoals de omzetting ze bewaarde, in meter. */
export interface Gekendeopening {
  soort: "deur" | "raam" | "borstwering";
  /** Bij een deur het scharnier, anders de tekst. */
  x: number;
  y: number;
  breedte: number;
  /** De hoogte van een raam, of de borstwering zelf. */
  hoogte: number | null;
  /** Bij een raam: "x" staat bij het raam, "/" op een maatlijn buiten de muur. */
  vorm?: Raamvorm;
  /** Bij een deur: de twee uiteinden van de boog. */
  boog?: [Xy, Xy];
}

const STAP = 0.05;
const PROBE = 0.06;
const MIN_BREEDTE = 0.4;
/** Een glazen gevel kan breed zijn. */
const MAX_BREEDTE = 12;
/**
 * Een opening mag voorbij het einde van de rand doorlopen, zolang daar geen
 * ruimte ligt: de voordeur van een inkom die smaller is dan de opening.
 */
const VERLENGING = 1.2;
/** Een gewone deur of raam, als het plan niets anders zegt. */
export const LATEI = 2.15;
export const BORSTWERING = 0.9;

const plus = (a: Xy, b: Xy, f = 1): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];
const afstand = (a: Xy, b: Xy) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function afstandTotSegment(p: Xy, a: Xy, b: Xy): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Van een boog op het plan naar een deurblad: het uiteinde dat langs de muur (u) ligt, is de dichte stand. */
export function deurbladVan(scharnier: Xy, boog: readonly [Xy, Xy], u: Xy): Deurblad {
  const langs = (p: Xy) => Math.abs((p[0] - scharnier[0]) * u[0] + (p[1] - scharnier[1]) * u[1]);
  const [dicht, open] = langs(boog[0]) >= langs(boog[1]) ? [boog[0], boog[1]] : [boog[1], boog[0]];
  return { scharnier, dicht, open };
}

/** Een opening langs de rand van een ruimte: het begin van de rand, de richting langs en naar buiten. */
interface Plek {
  a: Xy;
  u: Xy;
  n: Xy;
  /** Waar de opening begint en eindigt, langs de rand. */
  s0: number;
  s1: number;
  dikte: number;
}

/** Hoe ver een punt langs de rand ligt, en hoe ver naar buiten. */
function langsEnDwars(p: Xy, plek: Plek): [number, number] {
  const v: Xy = [p[0] - plek.a[0], p[1] - plek.a[1]];
  return [v[0] * plek.u[0] + v[1] * plek.u[1], v[0] * plek.n[0] + v[1] * plek.n[1]];
}

/**
 * De raammaat van een opening. Een maat op een maatlijn ("180/275") enkel
 * als ze er buiten de muur tegenover ligt en dezelfde breedte heeft: zo raakt
 * een tegel als "60/60" binnen niets. Anders de dichtste maat bij het raam
 * ("205 x 275"), en een met de juiste breedte eerst.
 */
function raammaatVoor(ramen: readonly Gekendeopening[], plek: Plek): Gekendeopening | null {
  const breedte = plek.s1 - plek.s0;
  const midden = (plek.s0 + plek.s1) / 2;
  const opMaatlijn = ramen
    .filter((o) => o.vorm === "/" && Math.abs(o.breedte - breedte) <= 0.15)
    .map((o) => ({ o, ld: langsEnDwars([o.x, o.y], plek) }))
    .filter(({ ld: [langs, dwars] }) => langs >= plek.s0 - 0.3 && langs <= plek.s1 + 0.3 && dwars >= plek.dikte - 0.05 && dwars <= plek.dikte + 3)
    .sort((x, y) => Math.abs(x.ld[0] - midden) - Math.abs(y.ld[0] - midden));
  if (opMaatlijn[0]) return opMaatlijn[0].o;
  const m = plus(plek.a, plek.u, midden);
  const bij = ramen
    .filter((o) => o.vorm !== "/" && afstand([o.x, o.y], m) <= 1.5)
    .sort((x, y) => afstand([x.x, x.y], m) - afstand([y.x, y.y], m));
  return bij.find((o) => Math.abs(o.breedte - breedte) <= 0.15) ?? bij[0] ?? null;
}

/**
 * De vakken van een raam: liggen er meer maten bij het raam ("205 x 275")
 * die samen de opening vullen (tot 10 cm verschil), dan staat er tussen
 * elk vak een stijl. Terug: waar, in meter vanaf het begin van de opening.
 */
function verdelingVoor(ramen: readonly Gekendeopening[], plek: Plek): number[] | undefined {
  const breedte = plek.s1 - plek.s0;
  const vakken = ramen
    .filter((o) => o.vorm !== "/")
    .map((o) => ({ o, ld: langsEnDwars([o.x, o.y], plek) }))
    .filter(({ ld: [langs, dwars] }) => langs >= plek.s0 - 0.2 && langs <= plek.s1 + 0.2 && Math.abs(dwars - plek.dikte / 2) <= plek.dikte / 2 + 1.5)
    .sort((x, y) => x.ld[0] - y.ld[0]);
  if (vakken.length < 2) return undefined;
  const som = vakken.reduce((totaal, vak) => totaal + vak.o.breedte, 0);
  if (Math.abs(som - breedte) > 0.1) return undefined;
  const schaal = breedte / som;
  const stijlen: number[] = [];
  let langs = 0;
  for (const vak of vakken.slice(0, -1)) {
    langs += vak.o.breedte * schaal;
    stijlen.push(cm(langs));
  }
  return stijlen;
}

/**
 * De borstwering van een opening: de dichtste "BW = …", tot 35 cm van de
 * opening. Een architect zet ze vlak naast het raam; verder weg is het de
 * hoogte van een leuning.
 */
function borstweringVoor(borstweringen: readonly Gekendeopening[], p0: Xy, p1: Xy, n: Xy, dikte: number): number | null {
  let beste: { hoogte: number; afstand: number } | null = null;
  for (const o of borstweringen) {
    if (o.hoogte === null) continue;
    const d = Math.min(afstandTotSegment([o.x, o.y], p0, p1), afstandTotSegment([o.x, o.y], plus(p0, n, dikte), plus(p1, n, dikte)));
    if (d <= 0.35 && (!beste || d < beste.afstand)) beste = { hoogte: o.hoogte, afstand: d };
  }
  return beste?.hoogte ?? null;
}

/**
 * Hoort deze boog bij deze opening? Het scharnier ligt tegen een kant van de
 * opening, en het blad valt dicht in de opening zelf. Zo krijgt een deur het
 * blad van haar buurdeur niet, ook als hun scharnieren dicht bij elkaar
 * liggen.
 */
function boogVan(o: Gekendeopening, plek: Plek): boolean {
  const p0 = plus(plek.a, plek.u, plek.s0);
  const p1 = plus(plek.a, plek.u, plek.s1);
  const scharnier: Xy = [o.x, o.y];
  const tegen = Math.min(afstandTotSegment(scharnier, p0, p1), afstandTotSegment(scharnier, plus(p0, plek.n, plek.dikte), plus(p1, plek.n, plek.dikte)));
  if (tegen > 0.35) return false;
  if (!o.boog) return true;
  const { dicht } = deurbladVan(scharnier, o.boog, plek.u);
  const [langs] = langsEnDwars(dicht, plek);
  return langs >= plek.s0 - 0.15 && langs <= plek.s1 + 0.15 && afstand(dicht, scharnier) <= plek.s1 - plek.s0 + 0.15;
}

/** Het midden van een opening, halverwege in de muur. */
export function hartVan(gat: Pick<Gat, "a" | "b" | "n" | "dikte">): Xy {
  return [(gat.a[0] + gat.b[0]) / 2 + (gat.n[0] * gat.dikte) / 2, (gat.a[1] + gat.b[1]) / 2 + (gat.n[1] * gat.dikte) / 2];
}

const cm = (waarde: number) => Math.round(waarde * 100) / 100;

/** Hoe ver de muur doorloopt vanaf p in richting n, op een halve centimeter. */
function dikteVanaf(p: Xy, n: Xy, muren: readonly Veelhoek[]): number {
  let t = PROBE;
  while (t < 0.9 && binnenVeelhoeken(plus(p, n, t + 0.005), muren)) t += 0.005;
  return cm(t + 0.0025);
}

export function vindGaten(
  ruimtes: readonly { ringen: Xy[][] }[],
  muren: readonly Veelhoek[],
  gekend: readonly Gekendeopening[],
  plafond: number,
): Gat[] {
  if (muren.length === 0) return [];
  const gaten: Gat[] = [];
  const ramen = gekend.filter((o) => o.soort === "raam" && o.hoogte !== null);
  const borstweringen = gekend.filter((o) => o.soort === "borstwering");

  for (const ruimte of ruimtes) {
    const ring = ruimte.ringen[0];
    if (!ring || ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const lengte = afstand(a, b);
      if (lengte < MIN_BREEDTE) continue;
      const u: Xy = [(b[0] - a[0]) / lengte, (b[1] - a[1]) / lengte];
      const links: Xy = [-u[1], u[0]];
      const midden = plus(a, u, lengte / 2);
      const n: Xy = binnen(plus(midden, links, 0.03), ring) ? [-links[0], -links[1]] : links;

      // De rand in stappen van 5 cm, met aan elk einde een stuk verlenging.
      const extra = Math.floor(VERLENGING / STAP);
      const aantal = Math.floor(lengte / STAP) + 2 * extra;
      const plaats = (k: number) => (k - extra + 0.5) * STAP;
      const stand = Array.from({ length: aantal }, (_, k): "muur" | "open" | "stop" => {
        const p = plus(a, u, plaats(k));
        if (binnenVeelhoeken(plus(p, n, PROBE), muren)) return "muur";
        const opDeRand = plaats(k) >= 0 && plaats(k) <= lengte;
        // Voorbij de rand telt het enkel mee als er aan geen van beide kanten een ruimte ligt.
        if (!opDeRand && ruimtes.some((r) => r.ringen[0] && (binnen(plus(p, n, -PROBE), r.ringen[0]) || binnen(plus(p, n, PROBE), r.ringen[0])))) {
          return "stop";
        }
        return "open";
      });

      for (let k = 1; k < aantal; k++) {
        if (stand[k] !== "open" || stand[k - 1] !== "muur") continue;
        let einde = k;
        while (einde < aantal && stand[einde] === "open") einde++;
        // Enkel een opening met aan beide kanten muur.
        if (einde >= aantal || stand[einde] !== "muur") {
          k = einde;
          continue;
        }
        const s0 = plaats(k) - STAP / 2;
        const s1 = plaats(einde) - STAP / 2;
        k = einde;
        // Een opening die helemaal in de verlenging ligt, hoort bij een andere rand.
        if (s1 <= 0 || s0 >= lengte) continue;
        const breedte = s1 - s0;
        if (breedte < MIN_BREEDTE || breedte > MAX_BREEDTE) continue;

        // De dunste van de twee kanten: aan een kant kan een dwarse muur staan.
        const dikte = Math.max(
          0.08,
          Math.min(dikteVanaf(plus(a, u, s0 - STAP / 2), n, muren), dikteVanaf(plus(a, u, s1 + STAP / 2), n, muren)),
        );
        const p0 = plus(a, u, s0);
        const p1 = plus(a, u, s1);
        const m = plus(a, u, (s0 + s1) / 2);
        const achter = plus(m, n, dikte + 0.12);
        const binnenin = ruimtes.some((andere) => andere !== ruimte && andere.ringen[0] && binnen(achter, andere.ringen[0]));

        // De deurbogen van deze opening; twee bij een dubbele deur.
        const plek: Plek = { a, u, n, s0, s1, dikte };
        const bogen = gekend.filter((o) => o.soort === "deur" && boogVan(o, plek));
        const bladen = bogen.flatMap((o) => (o.boog ? [deurbladVan([o.x, o.y], o.boog, u)] : []));
        const metBladen = bladen.length > 0 ? { bladen } : {};

        if (binnenin) {
          // Van de andere kant ziet de andere ruimte dezelfde opening: één keer is genoeg.
          const hart = plus(m, n, dikte / 2);
          const dubbel = gaten.some((g) => (g.soort === "deur" || g.soort === "doorgang") && afstand(hartVan(g), hart) < dikte + 0.3);
          if (dubbel) continue;
          gaten.push({
            soort: bogen.length > 0 ? "deur" : "doorgang",
            a: p0,
            b: p1,
            n,
            dikte,
            onder: 0,
            boven: Math.min(LATEI, plafond - 0.05),
            ...metBladen,
          });
          continue;
        }

        // Naar buiten: de maat van het raam of de buitendeur, en haar vakken.
        const hoogte = raammaatVoor(ramen, plek)?.hoogte ?? null;
        const verdeling = verdelingVoor(ramen, plek);
        const metVerdeling = verdeling ? { verdeling } : {};

        if (bogen.length > 0) {
          const boven = hoogte !== null && hoogte >= 1.8 ? Math.min(hoogte, plafond - 0.02) : Math.min(LATEI, plafond - 0.05);
          gaten.push({ soort: "buitendeur", a: p0, b: p1, n, dikte, onder: 0, boven: cm(boven), ...metBladen, ...metVerdeling });
          continue;
        }

        // Een raam: met een maat weten we de hoogte, met een borstwering ook waar het begint.
        const bw = borstweringVoor(borstweringen, p0, p1, n, dikte);
        let boven = Math.min(LATEI, plafond - 0.1);
        let onder = breedte >= 2.4 ? 0 : BORSTWERING;
        if (bw !== null) {
          onder = bw;
          boven = hoogte !== null ? Math.min(bw + hoogte, plafond - 0.02) : Math.max(boven, Math.min(bw + 1, plafond - 0.02));
        } else if (hoogte !== null) {
          if (hoogte >= 2) {
            onder = 0;
            boven = Math.min(hoogte, plafond - 0.02);
          } else {
            onder = Math.max(0, boven - hoogte);
          }
        }
        gaten.push({ soort: "raam", a: p0, b: p1, n, dikte, onder: cm(onder), boven: cm(boven), ...metVerdeling });
      }
    }
  }
  return gaten;
}
