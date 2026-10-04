/**
 * Het meetlint in 3D: wat er bij een maat staat, en waar een tik aan kleeft.
 *
 * Punten zijn in three.js: x naar rechts, y omhoog, z de y van het plan, in
 * meter. Het scherm is in pixels, met y naar beneden.
 *
 * Puur, met tests.
 */

export type P3 = [number, number, number];

/** Binnen hoeveel pixels op het scherm een tik aan een hoek kleeft. */
export const KLEEFAFSTAND = 12;
/** Een hoek mag zoveel verder van de camera liggen dan wat de tik raakte: verder ligt hij erachter. */
export const KLEEFDIEPTE = 0.3;

/** "3,42 m". */
export const meter = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m`;

/**
 * Het label van een maat: de lengte, en loopt de lijn niet waterpas, wat
 * waterpas en wat in de hoogte ligt ("waterpas 3,40 · hoogte 0,35").
 */
export function maattekst(a: P3, b: P3): { lengte: string; detail: string | null } {
  const waterpas = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const hoogte = Math.abs(b[1] - a[1]);
  const lengte = meter(Math.hypot(waterpas, hoogte));
  if (hoogte < 0.005 || waterpas < 0.005) return { lengte, detail: null };
  const kort = (waarde: number) => waarde.toFixed(2).replace(".", ",");
  return { lengte, detail: `waterpas ${kort(waterpas)} · hoogte ${kort(hoogte)}` };
}

export interface Kleefkandidaat {
  /** Op het scherm, in pixels. */
  scherm: [number, number];
  /** Hoe ver van de camera, in meter. */
  diepte: number;
}

/**
 * De hoek waaraan een tik kleeft: de dichtste op het scherm binnen
 * `afstand` pixels, en niet achter wat de tik raakte (`raak`: de diepte van
 * dat punt, of null als de tik niets raakte). -1 als er geen is.
 */
export function kleef(tik: [number, number], kandidaten: readonly Kleefkandidaat[], raak: number | null, afstand = KLEEFAFSTAND): number {
  let beste = -1;
  let besteAfstand = afstand;
  kandidaten.forEach((k, i) => {
    if (raak !== null && k.diepte > raak + KLEEFDIEPTE) return;
    const d = Math.hypot(k.scherm[0] - tik[0], k.scherm[1] - tik[1]);
    if (d <= besteAfstand) {
      beste = i;
      besteAfstand = d;
    }
  });
  return beste;
}

/**
 * De verschillende punten van een geometrie (x, y, z na elkaar), samengevoegd
 * op een raster van `raster` meter. Een muur of vloer heeft zijn hoeken als
 * punten: de hoeken waaraan een maat kleeft.
 */
export function uniekePunten(posities: ArrayLike<number>, raster = 0.005): P3[] {
  const gezien = new Set<string>();
  const uit: P3[] = [];
  for (let i = 0; i + 2 < posities.length; i += 3) {
    const p: P3 = [posities[i], posities[i + 1], posities[i + 2]];
    const sleutel = p.map((waarde) => Math.round(waarde / raster)).join(",");
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(p);
  }
  return uit;
}
