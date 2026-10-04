import { afstandTotRing, binnenRuimte, opBoog, rond } from "./geometrie";
import { leesBorstwering, leesRaammaat } from "./teksten";
import type { Blad, Boog, Opening, Ruimtevoorstel, Schaal, Xy } from "./types";

/**
 * De deuren en ramen op een grondplan, voor het 3D-model later.
 *
 * - Een deur tekent een architect als een kwartcirkel: de draaicirkel van het
 *   deurblad. Een kwartcirkel als Bézier-boog heeft zijn controlepunten op
 *   0,552 × de straal van de uiteinden, en de raaklijnen staan loodrecht op
 *   elkaar.
 * - Een raam krijgt een label als "205 x 275" (het schrijnwerk, bij het raam)
 *   of "180/275" (de opening, op een maatlijn buiten de muur): breedte en
 *   hoogte in cm.
 * - Een borstwering staat erbij als "BW = 40": in cm boven de vloer.
 *
 * Welk label bij welk raam hoort, weet pas het 3D-model: dat kent de
 * openingen in de muren (drie/gaten.ts).
 */

const DEUR_MIN_M = 0.5;
const DEUR_MAX_M = 1.4;

/** |p1 − p0| / koorde voor een kwartcirkel: 0,5523 / √2. */
const KWART = 0.5523 / Math.SQRT2;

/** Een deur hoort bij de ruimte waar ze in draait, of anders bij de dichtste binnen deze afstand. */
const DEUR_NABIJ_M = 0.6;
const RAAM_NABIJ_M = 1.2;

function lengte(a: Xy, b: Xy): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Het middelpunt van een kwartcirkel: loodrecht op de raaklijn in p0, op afstand r, aan de kant van p3. */
function scharnier(boog: Boog, straal: number): Xy {
  const t = [boog.p1[0] - boog.p0[0], boog.p1[1] - boog.p0[1]];
  const n = Math.hypot(t[0], t[1]) || 1;
  const kandidaten: Xy[] = [
    [boog.p0[0] - (t[1] / n) * straal, boog.p0[1] + (t[0] / n) * straal],
    [boog.p0[0] + (t[1] / n) * straal, boog.p0[1] - (t[0] / n) * straal],
  ];
  return kandidaten.sort((a, b) => Math.abs(lengte(a, boog.p3) - straal) - Math.abs(lengte(b, boog.p3) - straal))[0];
}

/** Is deze boog een kwartcirkel? Dan de straal in punten, anders null. */
export function kwartcirkel(boog: Boog): number | null {
  const koorde = lengte(boog.p0, boog.p3);
  if (koorde < 1e-6) return null;
  const k1 = lengte(boog.p0, boog.p1) / koorde;
  const k2 = lengte(boog.p3, boog.p2) / koorde;
  const t1 = [boog.p1[0] - boog.p0[0], boog.p1[1] - boog.p0[1]];
  const t2 = [boog.p2[0] - boog.p3[0], boog.p2[1] - boog.p3[1]];
  const loodrecht = Math.abs(t1[0] * t2[0] + t1[1] * t2[1]) / (koorde * koorde);
  if (Math.abs(k1 - KWART) > 0.04 || Math.abs(k2 - KWART) > 0.04 || loodrecht > 0.05) return null;
  return koorde / Math.SQRT2;
}

function dichtsteRuimte(p: Xy, ruimtes: Ruimtevoorstel[], maximum: number): string | null {
  const erin = ruimtes.find((ruimte) => binnenRuimte(p, ruimte.ringen));
  if (erin) return erin.sleutel;
  let beste: { sleutel: string; afstand: number } | null = null;
  for (const ruimte of ruimtes) {
    const afstand = afstandTotRing(p, ruimte.ringen[0]);
    if (afstand <= maximum && (!beste || afstand < beste.afstand)) beste = { sleutel: ruimte.sleutel, afstand };
  }
  return beste ? (beste as { sleutel: string }).sleutel : null;
}

export function vindOpeningen(blad: Blad, schaal: Schaal, ruimtes: Ruimtevoorstel[]): Opening[] {
  const m = schaal.meterPerPunt;
  const openingen: Opening[] = [];

  for (const pad of blad.paden) {
    if (!pad.lijn) continue;
    for (const boog of pad.bogen) {
      const straal = kwartcirkel(boog);
      if (straal === null) continue;
      const breedte = straal * m;
      if (breedte < DEUR_MIN_M || breedte > DEUR_MAX_M) continue;
      const midden = scharnier(boog, straal);
      // Dezelfde boog twee keer getekend (vlak en lijn) is één deur.
      const dubbel = openingen.some(
        (o) => o.soort === "deur" && lengte([o.x, o.y], midden) * m < 0.05 && Math.abs(o.breedte - breedte) < 0.05,
      );
      if (dubbel) continue;
      openingen.push({
        soort: "deur",
        x: rond(midden[0], 2),
        y: rond(midden[1], 2),
        punten: [boog.p0, boog.p3].map(([x, y]) => [rond(x, 2), rond(y, 2)] as Xy),
        breedte: rond(breedte, 2),
        hoogte: null,
        ruimte: dichtsteRuimte(opBoog(boog, 0.5), ruimtes, DEUR_NABIJ_M / m),
      });
    }
  }

  for (const tekst of blad.teksten) {
    const maat = leesRaammaat(tekst.tekst);
    if (maat) {
      openingen.push({
        soort: "raam",
        x: rond(tekst.x, 2),
        y: rond(tekst.y, 2),
        punten: [],
        breedte: maat.breedte,
        hoogte: maat.hoogte,
        vorm: maat.vorm,
        ruimte: dichtsteRuimte([tekst.x, tekst.y], ruimtes, RAAM_NABIJ_M / m),
      });
      continue;
    }
    const borstwering = leesBorstwering(tekst.tekst);
    if (borstwering === null) continue;
    openingen.push({
      soort: "borstwering",
      x: rond(tekst.x, 2),
      y: rond(tekst.y, 2),
      punten: [],
      breedte: 0,
      hoogte: borstwering,
      ruimte: dichtsteRuimte([tekst.x, tekst.y], ruimtes, RAAM_NABIJ_M / m),
    });
  }

  return openingen;
}
