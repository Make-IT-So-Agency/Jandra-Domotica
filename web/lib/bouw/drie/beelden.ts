import { middenVan, naarGebouw, naarTerrein, type Kader2d, type Plaatsing } from "./plaatsing";

/**
 * Beelden van het huis, zoals de renders van de keukenbouwer of de
 * schrijnwerker, met het standpunt van de camera: waar het oog stond, waar
 * het naar keek, en hoe breed het beeld kijkt. Zo legt het 3D-scherm het
 * beeld over het model, vanuit dezelfde plaats.
 *
 * Het standpunt staat in meter in het assenstelsel van het gebouw, zoals de
 * punten: x en y op het plan, en de hoogte zoals de muren (de vloer van het
 * gelijkvloers is 0). Zo klopt het nog als het gebouw op het terrein
 * verschuift. In three.js is het terrein (x, y) de wereld (x, z), en de
 * hoogte y.
 *
 * Puur, met tests: de browser en de server delen dit.
 */

export type Xyz = [number, number, number];

export interface Standpunt {
  /** Waar het oog staat: x en y op het plan, en de hoogte. */
  oog: Xyz;
  /** Een punt recht in het midden van het beeld. */
  doel: Xyz;
  /** Hoe breed het beeld kijkt, van de linker- tot de rechterrand, in graden. */
  kijkhoek: number;
}

export interface Beeld {
  id: number;
  titel: string;
  /** Wat het beeld toont. */
  ruimteId: number | null;
  /** Waar het oog staat; hoort bij het standpunt. */
  verdiepingId: number | null;
  standpunt: Standpunt | null;
  /** Een ondertekende URL, een uur geldig; null als ze niet te maken was. */
  url: string | null;
}

/** De kijkhoek van een render: meestal tussen 60 en 90 graden. */
export const KIJKHOEK = { min: 20, max: 120, standaard: 70 } as const;

/** Hoeveel beelden een huis hoogstens heeft. */
export const MAX_BEELDEN = 200;

const BEREIK = 1000;
const rond = (getal: number, stappen = 1000) => Math.round(getal * stappen) / stappen;
const getal = (waarde: unknown): number | null => (typeof waarde === "number" && Number.isFinite(waarde) ? waarde : null);

function punt(ruw: unknown): Xyz | null {
  if (!Array.isArray(ruw) || ruw.length !== 3) return null;
  const [x, y, h] = ruw.map(getal);
  if (x === null || y === null || h === null) return null;
  if (Math.abs(x) > BEREIK || Math.abs(y) > BEREIK || h < -10 || h > 60) return null;
  return [rond(x), rond(y), rond(h)];
}

/** Een standpunt zoals de browser het stuurt of de databank het gaf, nagekeken en afgerond; null als het niet klopt. */
export function schoonStandpunt(ruw: unknown): Standpunt | null {
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) return null;
  const s = ruw as Record<string, unknown>;
  const oog = punt(s.oog);
  const doel = punt(s.doel);
  const kijkhoek = getal(s.kijkhoek);
  if (!oog || !doel || kijkhoek === null || kijkhoek < KIJKHOEK.min || kijkhoek > KIJKHOEK.max) return null;
  if (Math.hypot(doel[0] - oog[0], doel[1] - oog[1], doel[2] - oog[2]) < 0.05) return null;
  return { oog, doel, kijkhoek: rond(kijkhoek, 10) };
}

/** Een titel: zonder dubbele spaties, 1 tot 80 tekens; null als er niets overblijft. */
export function schoneTitel(ruw: unknown): string | null {
  if (typeof ruw !== "string") return null;
  const titel = ruw.trim().replace(/\s+/g, " ");
  return titel.length >= 1 && titel.length <= 80 ? titel : null;
}

/** Een titel uit de naam van een bestand: zonder extensie, liggende streepjes als spatie. */
export function titelVanBestand(naam: string): string {
  const kaal = naam
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return schoneTitel(kaal.slice(0, 80)) ?? "Beeld";
}

// ---------------------------------------------------------------------------
// Van het gebouw naar de wereld van three.js, en terug
// ---------------------------------------------------------------------------

export interface Gebouwligging {
  kader: Kader2d;
  plaatsing: Plaatsing;
}

/** Een punt van het gebouw (x, y op het plan, en de hoogte) in de wereld van three.js. */
export function naarWereld(p: Xyz, gebouw: Gebouwligging): Xyz {
  const [x, z] = naarTerrein([p[0], p[1]], middenVan(gebouw.kader), gebouw.plaatsing);
  return [x, p[2], z];
}

/** Een punt van de wereld van three.js in het gebouw: het omgekeerde van naarWereld. */
export function uitWereld(w: Xyz, gebouw: Gebouwligging): Xyz {
  const [x, y] = naarGebouw([w[0], w[2]], middenVan(gebouw.kader), gebouw.plaatsing);
  return [x, y, w[1]];
}

/**
 * Hoe de camera van three.js draait om van het oog naar het doel te kijken:
 * kijk rond de verticale as en op naar boven, voor rotation.set(op, kijk, 0,
 * "YXZ"). Zonder draaiing kijkt de camera naar -z.
 */
export function camerarichting(oog: Xyz, doel: Xyz): { kijk: number; op: number } {
  const [dx, dy, dz] = [doel[0] - oog[0], doel[1] - oog[1], doel[2] - oog[2]];
  return { kijk: Math.atan2(-dx, -dz), op: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Waar de camera naar kijkt, als een richting van lengte 1: het omgekeerde van camerarichting. */
export function vooruit(kijk: number, op: number): Xyz {
  return [-Math.sin(kijk) * Math.cos(op), Math.sin(op), -Math.cos(kijk) * Math.cos(op)];
}

/**
 * Het standpunt van een camera in de wereld, in het gebouw: het oog, en een
 * punt 3 m voor zich uit.
 */
export function standpuntVan(oog: Xyz, kijk: number, op: number, kijkhoek: number, gebouw: Gebouwligging): Standpunt {
  const r = vooruit(kijk, op);
  const doel: Xyz = [oog[0] + r[0] * 3, oog[1] + r[1] * 3, oog[2] + r[2] * 3];
  const afgerond = (p: Xyz): Xyz => p.map((v) => rond(v)) as Xyz;
  return { oog: afgerond(uitWereld(oog, gebouw)), doel: afgerond(uitWereld(doel, gebouw)), kijkhoek: rond(kijkhoek, 10) };
}

/**
 * Een camera in de wereld, als haar gebouw op het terrein verschuift of draait
 * (zoals wanneer het inplantingsplan gelezen is): het oog en de blik gaan mee,
 * zodat ze in het gebouw op dezelfde plaats blijven.
 */
export function verplaatsOog(oog: Xyz, kijk: number, op: number, oud: Gebouwligging, nieuw: Gebouwligging): { oog: Xyz; kijk: number; op: number } {
  const r = vooruit(kijk, op);
  const doel: Xyz = [oog[0] + r[0] * 3, oog[1] + r[1] * 3, oog[2] + r[2] * 3];
  const nieuwOog = naarWereld(uitWereld(oog, oud), nieuw);
  return { oog: nieuwOog, ...camerarichting(nieuwOog, naarWereld(uitWereld(doel, oud), nieuw)) };
}

/**
 * In welk gebouw het oog staat: het gebouw waar het in het kader valt (met een
 * halve meter speling), anders het dichtste. Null zonder gebouwen.
 */
export function gebouwVanOog<G extends Gebouwligging & { id: number }>(gebouwen: readonly G[], oog: Xyz): G | null {
  let beste: { gebouw: G; afstand: number } | null = null;
  for (const gebouw of gebouwen) {
    const [x, y] = uitWereld(oog, gebouw);
    const { x0, y0, x1, y1 } = gebouw.kader;
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    const afstand = Math.hypot(dx, dy);
    if (afstand <= 0.5) return gebouw;
    if (!beste || afstand < beste.afstand) beste = { gebouw, afstand };
  }
  return beste?.gebouw ?? null;
}

/** Op welke verdieping het oog staat: de hoogste die eronder begint (30 cm speling), anders de laagste. */
export function verdiepingVanOog<V extends { id: number; z0: number }>(verdiepingen: readonly V[], hoogte: number): V | null {
  const op = [...verdiepingen].sort((a, b) => a.z0 - b.z0);
  return op.filter((v) => v.z0 - 0.3 <= hoogte).at(-1) ?? op[0] ?? null;
}

/**
 * De verticale kijkhoek van de camera van three.js (in graden) zodat het beeld,
 * zo groot mogelijk en in het midden van het vak, precies samenvalt met wat de
 * camera ziet. Het beeld kijkt `kijkhoek` breed en is `verhouding` keer zo
 * breed als hoog. Is het vak breder dan het beeld, dan vult het beeld de
 * hoogte; anders de breedte, en ziet de camera boven en onder meer.
 */
export function cameraKijkhoek(kijkhoek: number, verhouding: number, vak: { breedte: number; hoogte: number }): number {
  const halfBreed = Math.tan((kijkhoek * Math.PI) / 360);
  const halfHoog = halfBreed / verhouding;
  const vakverhouding = vak.breedte / Math.max(1, vak.hoogte);
  const beeldhoogte = vakverhouding >= verhouding ? 1 : vakverhouding / verhouding;
  return (Math.atan(halfHoog / beeldhoogte) * 360) / Math.PI;
}

/** De rechthoek van het beeld in het vak, in pixels: zo groot mogelijk, in het midden. */
export function beeldInVak(verhouding: number, vak: { breedte: number; hoogte: number }): { x: number; y: number; breedte: number; hoogte: number } {
  const breedte = Math.min(vak.breedte, vak.hoogte * verhouding);
  const hoogte = breedte / verhouding;
  return { x: (vak.breedte - breedte) / 2, y: (vak.hoogte - hoogte) / 2, breedte, hoogte };
}
