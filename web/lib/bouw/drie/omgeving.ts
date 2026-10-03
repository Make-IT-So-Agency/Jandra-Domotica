import { afstandTotRing, binnen, zwaartepunt } from "../omzetting/geometrie";
import type { Blad, Xy } from "../omzetting/types";
import { maakDak, type Dak } from "./dak";
import { DREMPEL, plaatsAutomatisch } from "./inplanting";
import { genormaliseerd, type Plaatsing } from "./plaatsing";

/**
 * De omgeving uit Vlaanderen rond het huis: de percelen en de gebouwen van het
 * GRB, en de luchtfoto. Puur, met tests; het ophalen gebeurt op de server
 * (omgeving-diensten.ts), het tekenen in de browser.
 *
 * Lambert 72 (EPSG:31370) heeft x naar het oosten en y naar het noorden, in
 * meter. In de browser gaat alles naar een eigen assenstelsel rond het
 * adrespunt, met x naar het oosten en y naar het zuiden: zo staat het net als
 * een gebouw (zie plaatsing.ts), en legt een plaatsing het op het terrein.
 * Die plaatsing zet het adrespunt op (x, y) van het terrein en draait de
 * kaart over `hoek` graden, met de klok mee.
 *
 * Bewaard wordt de georeferentie: waar de oorsprong van het terrein (de
 * linkerbovenhoek van het inplantingsplan) in Lambert ligt, en de hoek. Zo
 * blijft ze gelden, ook als het adrespunt ooit wat verschuift.
 *
 * Het adres, de coördinaten en de perceelnummers horen enkel in de databank
 * en bij wie het huis mag zien: nooit in een log of in de repository.
 */

export type Lambert = [number, number];

export interface Georef {
  x: number;
  y: number;
  hoek: number;
}

export interface Kader {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Hoe ver rond het adrespunt de app percelen en gebouwen haalt, en de helft van de luchtfoto, in meter. */
export const STRAAL = 100;

/** Wat de server de browser geeft: geen adres, geen perceelnummers. */
export interface Omgeving {
  punt: Lambert;
  /** Het kader van de luchtfoto, in Lambert. */
  luchtfoto: Kader;
  percelen: { ring: Lambert[]; eigen: boolean }[];
  gebouwen: { ring: Lambert[]; soort: string | null }[];
}

// ---------------------------------------------------------------------------
// Rekenen tussen Lambert, het eigen assenstelsel en het terrein
// ---------------------------------------------------------------------------

/** Een punt in Lambert, in het assenstelsel rond het adrespunt (oost, zuid). */
export const lokaal = (q: Lambert, punt: Lambert): Xy => [q[0] - punt[0], punt[1] - q[1]];

const rad = (graden: number) => (graden * Math.PI) / 180;

/** Een punt van het terrein in Lambert. */
export function naarLambert(t: Xy, g: Georef): Lambert {
  const [c, s] = [Math.cos(rad(g.hoek)), Math.sin(rad(g.hoek))];
  return [g.x + c * t[0] + s * t[1], g.y + s * t[0] - c * t[1]];
}

/** Een punt in Lambert op het terrein: het omgekeerde van naarLambert. */
export function vanLambert(q: Lambert, g: Georef): Xy {
  const [c, s] = [Math.cos(rad(g.hoek)), Math.sin(rad(g.hoek))];
  const [dx, dy] = [q[0] - g.x, q[1] - g.y];
  return [c * dx + s * dy, s * dx - c * dy];
}

/** Waar het adrespunt op het terrein ligt, en hoe de kaart gedraaid is. */
export function plaatsingVanGeoref(g: Georef, punt: Lambert): Plaatsing {
  const [x, y] = vanLambert(punt, g);
  return { x, y, hoek: g.hoek };
}

/** De georeferentie bij een plaatsing van het adrespunt op het terrein. */
export function georefVanPlaatsing(p: Plaatsing, punt: Lambert): Georef {
  const [c, s] = [Math.cos(rad(p.hoek)), Math.sin(rad(p.hoek))];
  return { x: punt[0] - (c * p.x + s * p.y), y: punt[1] - (s * p.x - c * p.y), hoek: genormaliseerd(p.hoek) };
}

/** Een vierkant van 2 × straal rond een punt. */
export const rond = (punt: Lambert, straal = STRAAL): Kader => ({
  x0: punt[0] - straal,
  y0: punt[1] - straal,
  x1: punt[0] + straal,
  y1: punt[1] + straal,
});

// ---------------------------------------------------------------------------
// De antwoorden van Digitaal Vlaanderen lezen
// ---------------------------------------------------------------------------

const isGetal = (waarde: unknown): waarde is number => typeof waarde === "number" && Number.isFinite(waarde);

/** Het adrespunt uit een antwoord van Geolocation v4, of null. */
export function leesAdrespunt(json: unknown): Lambert | null {
  const eerste = (json as { LocationResult?: { Location?: Record<string, unknown> }[] } | null)?.LocationResult?.[0];
  const x = eerste?.Location?.X_Lambert72;
  const y = eerste?.Location?.Y_Lambert72;
  // Lambert 72 dekt België ruim tussen 0 en 300 km.
  return isGetal(x) && isGetal(y) && x > 0 && x < 300000 && y > 0 && y < 300000 ? [x, y] : null;
}

function ringVan(ruw: unknown): Lambert[] | null {
  if (!Array.isArray(ruw)) return null;
  const punten = ruw.filter((p): p is Lambert => Array.isArray(p) && isGetal(p[0]) && isGetal(p[1])).map(([x, y]) => [x, y] as Lambert);
  const [eerste, laatste] = [punten[0], punten.at(-1)];
  // GeoJSON herhaalt het eerste punt op het einde; wij niet.
  if (eerste && laatste && punten.length > 1 && eerste[0] === laatste[0] && eerste[1] === laatste[1]) punten.pop();
  return punten.length >= 3 ? punten : null;
}

/**
 * De vormen uit een GeoJSON-antwoord van de WFS van het GRB: enkel de
 * buitenrand van elk (multi)polygoon, en hoogstens het soort (LBLTYPE). De
 * rest, zoals een perceelnummer, valt weg.
 */
export function leesGrb(json: unknown): { ring: Lambert[]; soort: string | null }[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const uit: { ring: Lambert[]; soort: string | null }[] = [];
  for (const feature of features) {
    const { geometry, properties } = (feature ?? {}) as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
    const soort = typeof properties?.LBLTYPE === "string" ? properties.LBLTYPE.slice(0, 40) : null;
    const veelhoeken =
      geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    for (const veelhoek of veelhoeken as unknown[]) {
      const ring = Array.isArray(veelhoek) ? ringVan(veelhoek[0]) : null;
      if (ring) uit.push({ ring, soort });
    }
  }
  return uit;
}

/**
 * De omgeving van een adrespunt: de percelen (het onze is dat met het punt
 * erin, of anders het dichtste binnen 30 m) en de gebouwen.
 */
export function maakOmgeving(punt: Lambert, percelen: { ring: Lambert[] }[], gebouwen: { ring: Lambert[]; soort: string | null }[]): Omgeving {
  let eigen = percelen.findIndex((perceel) => binnen(punt, perceel.ring));
  if (eigen < 0) {
    const afstanden = percelen.map((perceel) => afstandTotRing(punt, perceel.ring));
    const dichtste = Math.min(...afstanden);
    eigen = dichtste <= 30 ? afstanden.indexOf(dichtste) : -1;
  }
  return {
    punt,
    luchtfoto: rond(punt),
    percelen: percelen.map((perceel, i) => ({ ring: perceel.ring, eigen: i === eigen })),
    gebouwen: gebouwen.map((gebouw) => ({ ring: gebouw.ring, soort: gebouw.soort })),
  };
}

// ---------------------------------------------------------------------------
// Het terrein op de kaart leggen
// ---------------------------------------------------------------------------

const randenVan = (ring: readonly Xy[]): [Xy, Xy][] => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]);

/**
 * Zoekt ons perceel op het inplantingsplan, zoals een gebouw (inplanting.ts):
 * het perceel uit het GRB is de vorm, op de schaal van het plan. De randen van
 * de buurpercelen en de gebouwen rond ons perceel helpen kiezen bij een
 * symmetrisch perceel: die staan meestal ook op het plan.
 */
export function perceelOpPlan(omgeving: Omgeving, blad: Blad, noemer: number): { georef: Georef; overeenkomst: number } | null {
  const eigen = omgeving.percelen.find((perceel) => perceel.eigen);
  if (!eigen) return null;
  const naar = (q: Lambert) => lokaal(q, omgeving.punt);
  const dichtbij = (ring: Lambert[]) => ring.some((q) => Math.hypot(q[0] - omgeving.punt[0], q[1] - omgeving.punt[1]) <= 60);
  const randen = [
    ...omgeving.percelen.filter((perceel) => dichtbij(perceel.ring)).flatMap((perceel) => randenVan(perceel.ring.map(naar))),
    ...omgeving.gebouwen.filter((gebouw) => dichtbij(gebouw.ring)).flatMap((gebouw) => randenVan(gebouw.ring.map(naar))),
  ];
  const vondst = plaatsAutomatisch([{ id: 0, voetafdruk: [[eigen.ring.map(naar)]], muren: randen, midden: [0, 0] }], blad, noemer).gevonden.get(0);
  if (!vondst || vondst.overeenkomst < DREMPEL) return null;
  return { georef: georefVanPlaatsing(vondst.plaatsing, omgeving.punt), overeenkomst: vondst.overeenkomst };
}

// ---------------------------------------------------------------------------
// De huizen van de buren
// ---------------------------------------------------------------------------

/** Hoe hoog een huis van de buren is tot aan de dakrand: het GRB kent geen hoogtes. */
export const BUURHOOGTE = 6;

/**
 * Een huis van de buren als volume: muren tot 6 m en een zadeldak van 35° met
 * de nok langs de lange kant. `ring` is in het assenstelsel rond het
 * adrespunt. Het dak volgt de hoofdrichting van de muren: daarvoor draait de
 * vorm eerst recht, dan weer terug.
 */
export function buurhuis(ring: readonly Xy[]): { ring: Xy[]; dak: Dak | null } {
  let s = 0;
  let c = 0;
  for (const [a, b] of randenVan(ring)) {
    const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = 4 * Math.atan2(b[1] - a[1], b[0] - a[0]);
    s += lengte * Math.sin(t);
    c += lengte * Math.cos(t);
  }
  const hoek = Math.atan2(s, c) / 4;
  const [ch, sh] = [Math.cos(hoek), Math.sin(hoek)];
  const [m0, m1] = zwaartepunt(ring as Xy[]);
  // Rechtgedraaid rond het zwaartepunt, en terug.
  const recht = ring.map(([x, y]): Xy => [ch * (x - m0) + sh * (y - m1), -sh * (x - m0) + ch * (y - m1)]);
  const terug = ([x, y, z]: [number, number, number]): [number, number, number] => [m0 + ch * x - sh * y, m1 + sh * x + ch * y, z];
  const xs = recht.map(([x]) => x);
  const ys = recht.map(([, y]) => y);
  const langsX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const dak = maakDak(recht, BUURHOOGTE, { type: "zadel", helling: 35, nok: langsX ? "x" : "y", overstek: 0.3 });
  return {
    ring: [...ring],
    dak: dak ? { vlakken: dak.vlakken.map((vlak) => vlak.map(terug)), gevels: dak.gevels.map((gevel) => gevel.map(terug)), plat: null } : null,
  };
}

// ---------------------------------------------------------------------------
// Bewaren: wat de browser stuurt, nagekeken
// ---------------------------------------------------------------------------

/** Een georeferentie uit de browser, afgerond op een millimeter en een honderdste graad; null als ze niet klopt. */
export function schoneGeoref(ruw: unknown): Georef | null {
  if (!ruw || typeof ruw !== "object") return null;
  const { x, y, hoek } = ruw as Record<string, unknown>;
  if (![x, y, hoek].every(isGetal)) return null;
  if ((x as number) < 0 || (x as number) > 400000 || (y as number) < 0 || (y as number) > 400000) return null;
  const afgerond = (waarde: number, cijfers: number) => Math.round(waarde * 10 ** cijfers) / 10 ** cijfers || 0;
  return { x: afgerond(x as number, 3), y: afgerond(y as number, 3), hoek: afgerond(genormaliseerd(hoek as number), 2) };
}
