import type { Xy } from "./omzetting/types";
import { gelukt, mislukt, type Uitkomst } from "./types";

/**
 * Leidingen op het plan: water, afvoer, regenwater, ventilatie,
 * elektriciteit, data en vloerverwarming. Per verdieping, in meter in het
 * assenstelsel van het gebouw, zoals de punten: zo overleven ze een nieuwe
 * versie van het plan. De soorten staan hier, in de code; de databank kijkt
 * enkel de vorm na (zie de migratie 20261004140000_bouw_leidingen.sql). Puur,
 * voor de server, de browser en de tests.
 *
 * Een leiding is een lijn door punten, een stijgleiding één punt, en een zone
 * (vloerverwarming) een veelhoek. Waar ze ligt:
 * - in de vloer: in de dekvloer, net onder de afgewerkte vloer;
 * - in de muur: op een hoogte boven de vloer;
 * - aan het plafond: er net onder;
 * - in de grond: buiten, 60 cm diep;
 * - een stijgleiding: recht omhoog, tot een andere verdieping;
 * - een zone: een vlak in de vloer.
 */

export const LIGGINGEN = ["vloer", "muur", "plafond", "grond", "stijg", "zone"] as const;
export type Ligging = (typeof LIGGINGEN)[number];

export const LIGGINGNAMEN: Record<Ligging, string> = {
  vloer: "In de vloer",
  muur: "In de muur",
  plafond: "Aan het plafond",
  grond: "In de grond",
  stijg: "Stijgleiding",
  zone: "Zone in de vloer",
};

export const isLigging = (waarde: unknown): waarde is Ligging => LIGGINGEN.includes(waarde as Ligging);

export interface Leidingsoort {
  soort: string;
  naam: string;
  kleur: string;
  /** De gewone doorsnede, in millimeter. */
  diameter: number;
  /** Waar ze gewoonlijk ligt. */
  ligging: Ligging;
}

export const LEIDINGSOORTEN: readonly Leidingsoort[] = [
  { soort: "water_koud", naam: "Water koud", kleur: "#2563eb", diameter: 16, ligging: "vloer" },
  { soort: "water_warm", naam: "Water warm", kleur: "#dc2626", diameter: 16, ligging: "vloer" },
  { soort: "afvoer", naam: "Afvoer", kleur: "#6b7280", diameter: 110, ligging: "vloer" },
  { soort: "regenwater", naam: "Regenwater", kleur: "#16a34a", diameter: 90, ligging: "grond" },
  { soort: "ventilatie_toevoer", naam: "Ventilatie, toevoer", kleur: "#38bdf8", diameter: 160, ligging: "plafond" },
  { soort: "ventilatie_afvoer", naam: "Ventilatie, afvoer", kleur: "#eab308", diameter: 160, ligging: "plafond" },
  { soort: "elektriciteit", naam: "Elektriciteit", kleur: "#f97316", diameter: 20, ligging: "muur" },
  { soort: "data", naam: "Data", kleur: "#9333ea", diameter: 20, ligging: "muur" },
  { soort: "vloerverwarming", naam: "Vloerverwarming", kleur: "#f472b6", diameter: 16, ligging: "zone" },
];

const PER_SOORT = new Map(LEIDINGSOORTEN.map((s) => [s.soort, s]));

export function leidingsoort(soort: string): Leidingsoort | null {
  return PER_SOORT.get(soort) ?? null;
}

export interface Leiding {
  id: number;
  verdiepingId: number;
  soort: string;
  punten: Xy[];
  ligging: Ligging;
  /** In de muur: de hoogte boven de vloer, in meter. */
  hoogte: number | null;
  /** De doorsnede, in millimeter. */
  diameter: number;
  /** Een stijgleiding: tot welke verdieping ze loopt. */
  totVerdiepingId: number | null;
  label: string | null;
}

export type Nieuweleiding = Omit<Leiding, "id" | "verdiepingId">;

/** Hoeveel punten een leiding hoogstens heeft. */
export const MAX_LEIDINGPUNTEN = 200;
/** Hoe diep een leiding buiten in de grond ligt. */
export const GRONDDIEPTE = 0.6;
/** Hoe diep onder de afgewerkte vloer een leiding in de dekvloer ligt. */
export const IN_DE_VLOER = 0.05;
/** De gewone hoogte van een leiding in de muur: zoals een stopcontact. */
export const MUURHOOGTE = 0.3;

const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;

/** Wat iemand intekende of wat de databank gaf, nagekeken. */
export function controleerLeiding(ruw: unknown): Uitkomst<Nieuweleiding> {
  const l = (ruw ?? {}) as Record<string, unknown>;
  const soort = leidingsoort(String(l.soort ?? ""));
  if (!soort) return mislukt("Kies wat voor leiding het is.");
  if (!isLigging(l.ligging)) return mislukt("Kies waar de leiding ligt.");
  const ligging = l.ligging;
  if (!Array.isArray(l.punten) || l.punten.length > MAX_LEIDINGPUNTEN) return mislukt(`Een leiding heeft hoogstens ${MAX_LEIDINGPUNTEN} punten.`);
  const punten: Xy[] = [];
  for (const p of l.punten as unknown[]) {
    const [x, y] = Array.isArray(p) ? p.map(Number) : [Number.NaN, Number.NaN];
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1000 || Math.abs(y) > 1000) return mislukt("Deze leiding ligt niet op het plan.");
    const punt: Xy = [mm(x), mm(y)];
    // Twee keer na elkaar op dezelfde plek is één punt.
    const vorige = punten.at(-1);
    if (!vorige || Math.hypot(punt[0] - vorige[0], punt[1] - vorige[1]) >= 0.005) punten.push(punt);
  }
  if (ligging === "stijg" ? punten.length !== 1 : ligging === "zone" ? punten.length < 3 : punten.length < 2) {
    return mislukt(
      ligging === "stijg" ? "Een stijgleiding is één punt." : ligging === "zone" ? "Een zone heeft minstens drie punten." : "Een leiding heeft minstens twee punten.",
    );
  }
  let hoogte: number | null = null;
  if (ligging === "muur") {
    hoogte = l.hoogte === null || l.hoogte === undefined || l.hoogte === "" ? MUURHOOGTE : Number(l.hoogte);
    if (!Number.isFinite(hoogte) || hoogte < 0 || hoogte > 10) return mislukt("De hoogte in de muur ligt tussen 0 en 10 m.");
    hoogte = Math.round(hoogte * 100) / 100;
  }
  const diameter = l.diameter === null || l.diameter === undefined || l.diameter === "" ? soort.diameter : Number(l.diameter);
  if (!Number.isInteger(diameter) || diameter < 4 || diameter > 500) return mislukt("De doorsnede ligt tussen 4 en 500 mm.");
  let totVerdiepingId: number | null = null;
  if (ligging === "stijg") {
    totVerdiepingId = Number(l.totVerdiepingId);
    if (!Number.isSafeInteger(totVerdiepingId) || totVerdiepingId <= 0) return mislukt("Kies tot welke verdieping de stijgleiding loopt.");
  }
  const label = typeof l.label === "string" ? l.label.replace(/\s+/g, " ").trim() : "";
  if (label.length > 80) return mislukt("Het label is hoogstens 80 tekens.");
  return gelukt({ soort: soort.soort, punten, ligging, hoogte, diameter, totVerdiepingId, label: label || null });
}

/** De lengte langs de punten, in meter; van een zone de omtrek. */
export function lengteVan(leiding: Pick<Leiding, "punten" | "ligging">): number {
  const { punten } = leiding;
  let lengte = 0;
  for (let i = 1; i < punten.length; i++) lengte += Math.hypot(punten[i][0] - punten[i - 1][0], punten[i][1] - punten[i - 1][1]);
  if (leiding.ligging === "zone" && punten.length > 2) lengte += Math.hypot(punten[0][0] - punten.at(-1)![0], punten[0][1] - punten.at(-1)![1]);
  return lengte;
}

/** De oppervlakte van een zone, in vierkante meter. */
export function oppervlakteVan(leiding: Pick<Leiding, "punten" | "ligging">): number {
  if (leiding.ligging !== "zone") return 0;
  let som = 0;
  const p = leiding.punten;
  for (let i = 0; i < p.length; i++) {
    const [a, b] = [p[i], p[(i + 1) % p.length]];
    som += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(som) / 2;
}

/**
 * Waar de as van de leiding ligt, boven de vloer van haar verdieping (in
 * meter). `grond` is waar de grond ligt tegenover die vloer (negatief). Een
 * stijgleiding begint op de vloer.
 */
export function hoogteVan(leiding: Pick<Leiding, "ligging" | "hoogte" | "diameter">, plafond: number, grond: number): number {
  switch (leiding.ligging) {
    case "muur":
      return leiding.hoogte ?? MUURHOOGTE;
    case "plafond":
      return plafond - leiding.diameter / 2000 - 0.03;
    case "grond":
      return grond - GRONDDIEPTE;
    case "stijg":
      return 0;
    case "zone":
      return -0.03;
    default:
      return -IN_DE_VLOER;
  }
}

export interface Leidingtotaal {
  soort: string;
  naam: string;
  kleur: string;
  aantal: number;
  /** De lengte op het plan, in meter, zonder de stijgleidingen. */
  lengte: number;
  /** De oppervlakte van de zones, in vierkante meter. */
  oppervlakte: number;
}

/** Per soort, in de volgorde van de catalogus: hoeveel leidingen, hoe lang, en hoeveel vloer. */
export function totalen(leidingen: readonly Pick<Leiding, "soort" | "punten" | "ligging">[]): Leidingtotaal[] {
  return LEIDINGSOORTEN.flatMap((s) => {
    const eigen = leidingen.filter((l) => l.soort === s.soort);
    if (eigen.length === 0) return [];
    return [
      {
        soort: s.soort,
        naam: s.naam,
        kleur: s.kleur,
        aantal: eigen.length,
        lengte: eigen.filter((l) => l.ligging !== "zone").reduce((som, l) => som + lengteVan(l), 0),
        oppervlakte: eigen.reduce((som, l) => som + oppervlakteVan(l), 0),
      },
    ];
  });
}

/**
 * Waar een getikt punt naartoe kleeft: een punt in de buurt (een kraan, een
 * afvoer, een punt van een andere leiding) binnen `straal`, en anders recht
 * van het vorige punt als de richting tot `speling` graden van een veelvoud
 * van 45° afwijkt. Werkt in elke eenheid, ook op de pagina van het plan.
 */
export function kleefLeiding(
  p: Xy,
  opties: { vorige: Xy | null; kandidaten: readonly Xy[]; straal: number; speling?: number },
): { punt: Xy; soort: "punt" | "recht" | null } {
  let beste: { punt: Xy; afstand: number } | null = null;
  for (const k of opties.kandidaten) {
    const afstand = Math.hypot(k[0] - p[0], k[1] - p[1]);
    if (afstand <= opties.straal && (!beste || afstand < beste.afstand)) beste = { punt: k, afstand };
  }
  if (beste) return { punt: beste.punt, soort: "punt" };
  const v = opties.vorige;
  if (!v) return { punt: p, soort: null };
  const [dx, dy] = [p[0] - v[0], p[1] - v[1]];
  const lengte = Math.hypot(dx, dy);
  if (lengte === 0) return { punt: p, soort: null };
  const hoek = Math.atan2(dy, dx);
  const recht = Math.round(hoek / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(hoek - recht) > ((opties.speling ?? 6) * Math.PI) / 180) return { punt: p, soort: null };
  // Op de rechte lijn, even ver als waar getikt werd langs die lijn.
  const langs = dx * Math.cos(recht) + dy * Math.sin(recht);
  return { punt: [v[0] + Math.cos(recht) * langs, v[1] + Math.sin(recht) * langs], soort: "recht" };
}

/** De lengte als tekst: "12,4 m". */
export function metertekst(meter: number): string {
  return `${(Math.round(meter * 10) / 10).toFixed(1).replace(".", ",")} m`;
}
