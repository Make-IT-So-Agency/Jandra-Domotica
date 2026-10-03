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

/** Een hoek tussen -180 en 180 graden. */
export function genormaliseerd(hoek: number): number {
  const rest = (((hoek + 180) % 360) + 360) % 360;
  return rest - 180;
}

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

/**
 * Alles een factor groter of kleiner, rond de linkerbovenhoek van het blad:
 * wie de schaal van het inplantingsplan aanpast, houdt zo elk gebouw op zijn
 * plek op het plan.
 */
export function herschaald(plaatsingen: ReadonlyMap<number, Plaatsing>, factor: number): Map<number, Plaatsing> {
  return new Map([...plaatsingen].map(([id, p]) => [id, { ...p, x: p.x * factor, y: p.y * factor }]));
}

/** Alles samen verschoven, zodat het midden van het geheel op `midden` komt. */
export function rondMidden(
  gebouwen: readonly { id: number; kader: Kader2d; z1: number }[],
  plaatsingen: ReadonlyMap<number, Plaatsing>,
  midden: Xy,
): Map<number, Plaatsing> {
  const [mx, my] = middenVan(kaderOpTerrein(gebouwen, plaatsingen));
  const [dx, dy] = [midden[0] - mx, midden[1] - my];
  return new Map([...plaatsingen].map(([id, p]) => [id, { ...p, x: p.x + dx, y: p.y + dy }]));
}

// ---------------------------------------------------------------------------
// Bewaren: wat de browser stuurt, nagekeken
// ---------------------------------------------------------------------------

/** Wat het 3D-scherm bewaart: het inplantingsplan, zijn schaal, en de plaats van elk gebouw. */
export interface Inplanting {
  planId: number | null;
  /** N van 1/N. */
  schaal: number | null;
  /** Per gebouw zijn plaats; null laat het 3D-scherm het gebouw zelf zoeken. */
  plaatsen: { gebouwId: number; plaats: Plaatsing | null }[];
}

/** Hoe ver een gebouw van de hoek van het blad mag staan, in meter. */
export const VERSTE = 10000;

const isId = (waarde: unknown): waarde is number => Number.isSafeInteger(waarde) && (waarde as number) > 0;
const afgerond = (waarde: number, cijfers: number) => Math.round(waarde * 10 ** cijfers) / 10 ** cijfers || 0;

/**
 * Een inplanting uit de browser, nagekeken en afgerond (mm, honderdste van
 * een graad); null als er iets niet klopt. Of het plan en de gebouwen bij het
 * huis horen, kijkt de opslag na.
 */
export function schoneInplanting(ruw: unknown): Inplanting | null {
  if (!ruw || typeof ruw !== "object") return null;
  const { planId, schaal, plaatsen } = ruw as Record<string, unknown>;
  if (planId !== null && !isId(planId)) return null;
  if (schaal !== null && !(Number.isInteger(schaal) && (schaal as number) >= 10 && (schaal as number) <= 5000)) return null;
  if (!Array.isArray(plaatsen) || plaatsen.length > 50) return null;
  const uit: Inplanting["plaatsen"] = [];
  for (const rij of plaatsen) {
    if (!rij || typeof rij !== "object") return null;
    const { gebouwId, plaats } = rij as Record<string, unknown>;
    if (!isId(gebouwId) || uit.some((p) => p.gebouwId === gebouwId)) return null;
    if (plaats === null) {
      uit.push({ gebouwId, plaats: null });
      continue;
    }
    if (!plaats || typeof plaats !== "object") return null;
    const { x, y, hoek } = plaats as Record<string, unknown>;
    if (![x, y, hoek].every((w) => typeof w === "number" && Number.isFinite(w))) return null;
    if (Math.abs(x as number) > VERSTE || Math.abs(y as number) > VERSTE) return null;
    uit.push({ gebouwId, plaats: { x: afgerond(x as number, 3), y: afgerond(y as number, 3), hoek: afgerond(genormaliseerd(hoek as number), 2) } });
  }
  return { planId: planId as number | null, schaal: schaal as number | null, plaatsen: uit };
}
