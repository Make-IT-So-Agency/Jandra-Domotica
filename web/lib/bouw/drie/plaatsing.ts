import type { Xy } from "../omzetting/types";

/**
 * Waar elk gebouw op het terrein staat. Elk gebouw heeft zijn eigen
 * assenstelsel, dat van zijn grondplannen; een plaatsing zet het midden van
 * zijn kader op (x, y) van het terrein en draait het daar rond.
 *
 * De hoek is in graden. Positief draait op het plan met de wijzers van de
 * klok mee, want y wijst er naar beneden. In three.js is dat een draaiing van
 * -hoek rond de y-as; zie scene.ts.
 *
 * Puur, met tests.
 */

export interface Plaatsing {
  x: number;
  y: number;
  hoek: number;
}

export interface Kader2d {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tussen twee gebouwen die nog geen plaats hebben, als ze naast elkaar gezet worden. */
export const TUSSENRUIMTE = 5;

export const middenVan = (kader: Kader2d): Xy => [(kader.x0 + kader.x1) / 2, (kader.y0 + kader.y1) / 2];

const rad = (graden: number) => (graden * Math.PI) / 180;

/** Een punt van het gebouw (rond het midden van zijn kader) op het terrein. */
export function naarTerrein(p: Xy, midden: Xy, plaatsing: Plaatsing): Xy {
  const c = Math.cos(rad(plaatsing.hoek));
  const s = Math.sin(rad(plaatsing.hoek));
  const dx = p[0] - midden[0];
  const dy = p[1] - midden[1];
  return [plaatsing.x + c * dx - s * dy, plaatsing.y + s * dx + c * dy];
}

/** Een punt van het terrein in het gebouw: het omgekeerde van naarTerrein. */
export function naarGebouw(p: Xy, midden: Xy, plaatsing: Plaatsing): Xy {
  const c = Math.cos(rad(plaatsing.hoek));
  const s = Math.sin(rad(plaatsing.hoek));
  const dx = p[0] - plaatsing.x;
  const dy = p[1] - plaatsing.y;
  return [midden[0] + c * dx + s * dy, midden[1] - s * dx + c * dy];
}

/** De hoeken van een kader op het terrein. */
function hoekenOpTerrein(kader: Kader2d, plaatsing: Plaatsing): Xy[] {
  const m = middenVan(kader);
  return (
    [
      [kader.x0, kader.y0],
      [kader.x1, kader.y0],
      [kader.x1, kader.y1],
      [kader.x0, kader.y1],
    ] as Xy[]
  ).map((p) => naarTerrein(p, m, plaatsing));
}

/**
 * Een plaats voor elk gebouw. Wat bewaard is, blijft. Een gebouw zonder plaats
 * komt rechts naast wat er al staat, met wat ruimte ertussen; het eerste
 * staat waar zijn plannen het zetten.
 */
export function standaardPlaatsingen(
  gebouwen: readonly { id: number; kader: Kader2d }[],
  bewaard: ReadonlyMap<number, Plaatsing> = new Map(),
): Map<number, Plaatsing> {
  const uit = new Map<number, Plaatsing>();
  let rechts: number | null = null;
  for (const gebouw of gebouwen) {
    const plaats = bewaard.get(gebouw.id);
    if (!plaats) continue;
    uit.set(gebouw.id, plaats);
    const xs = hoekenOpTerrein(gebouw.kader, plaats).map(([x]) => x);
    rechts = Math.max(rechts ?? -Infinity, ...xs);
  }
  for (const gebouw of gebouwen) {
    if (uit.has(gebouw.id)) continue;
    const [mx, my] = middenVan(gebouw.kader);
    const x = rechts === null ? mx : rechts + TUSSENRUIMTE + (mx - gebouw.kader.x0);
    const plaats = { x, y: my, hoek: 0 };
    uit.set(gebouw.id, plaats);
    rechts = Math.max(...hoekenOpTerrein(gebouw.kader, plaats).map(([px]) => px));
  }
  return uit;
}

/** Het kader van alle gebouwen samen op het terrein, met de hoogste top. */
export function kaderOpTerrein(
  gebouwen: readonly { id: number; kader: Kader2d; z1: number }[],
  plaatsingen: ReadonlyMap<number, Plaatsing>,
): Kader2d & { z1: number } {
  const punten = gebouwen.flatMap((gebouw) => {
    const plaats = plaatsingen.get(gebouw.id);
    return plaats ? hoekenOpTerrein(gebouw.kader, plaats) : [];
  });
  if (punten.length === 0) return { x0: 0, y0: 0, x1: 10, y1: 10, z1: 3 };
  return {
    x0: Math.min(...punten.map(([x]) => x)),
    y0: Math.min(...punten.map(([, y]) => y)),
    x1: Math.max(...punten.map(([x]) => x)),
    y1: Math.max(...punten.map(([, y]) => y)),
    z1: Math.max(3, ...gebouwen.map((gebouw) => gebouw.z1)),
  };
}
