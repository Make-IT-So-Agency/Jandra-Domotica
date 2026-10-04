import { binnen } from "../omzetting/geometrie";
import type { Raamvorm, Xy } from "../omzetting/types";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * De ramen en deuren van een verdieping, voor het 3D-model. In het grondplan
 * zijn het de open plekken in een muur: langs de rand van een ruimte ligt
 * muur, dan even niet, dan weer wel. Wat erachter ligt, zegt wat het is:
 * buiten is een raam of een buitendeur, een andere ruimte een deur of een
 * doorgang. Een deurboog of een raamlabel van de omzetting vult aan.
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

        // Een deurboog met zijn scharnier bij een kant van de opening.
        const deur = gekend.some(
          (o) =>
            o.soort === "deur" &&
            Math.min(afstandTotSegment([o.x, o.y], p0, p1), afstandTotSegment([o.x, o.y], plus(p0, n, dikte), plus(p1, n, dikte))) <= 0.35,
        );

        if (binnenin) {
          // Van de andere kant ziet de andere ruimte dezelfde opening: één keer is genoeg.
          const hart = plus(m, n, dikte / 2);
          const dubbel = gaten.some((g) => (g.soort === "deur" || g.soort === "doorgang") && afstand(hartVan(g), hart) < dikte + 0.3);
          if (dubbel) continue;
          gaten.push({ soort: deur ? "deur" : "doorgang", a: p0, b: p1, n, dikte, onder: 0, boven: Math.min(LATEI, plafond - 0.05) });
          continue;
        }

        if (deur) {
          gaten.push({ soort: "buitendeur", a: p0, b: p1, n, dikte, onder: 0, boven: Math.min(LATEI, plafond - 0.05) });
          continue;
        }

        // Een raam: met een label in de buurt weten we de hoogte.
        const label = gekend
          .filter((o) => o.soort === "raam" && o.hoogte !== null && afstand([o.x, o.y], m) <= 1.5)
          .sort((x, y) => afstand([x.x, x.y], m) - afstand([y.x, y.y], m))[0];
        const hoogte = label?.hoogte ?? null;
        let boven = Math.min(LATEI, plafond - 0.1);
        let onder = breedte >= 2.4 ? 0 : BORSTWERING;
        if (hoogte !== null) {
          if (hoogte >= 2) {
            onder = 0;
            boven = Math.min(hoogte, plafond - 0.02);
          } else {
            onder = Math.max(0, boven - hoogte);
          }
        }
        gaten.push({ soort: "raam", a: p0, b: p1, n, dikte, onder: cm(onder), boven: cm(boven) });
      }
    }
  }
  return gaten;
}
