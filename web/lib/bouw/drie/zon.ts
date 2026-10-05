import type { Xy } from "../omzetting/types";
import type { Georef, Lambert } from "./omgeving";
import type { Kader2d } from "./plaatsing";

/**
 * De zon boven het huis, op een datum en een uur, met het echte noorden.
 *
 * Waar het huis ligt, kent de app in Lambert 72 (EPSG:31370): het adrespunt
 * van de omgeving, en hoe het terrein op de kaart ligt (de Georef, zie
 * omgeving.ts). Dat wordt breedte en lengte met de omgekeerde
 * Lambert-kegelprojectie op de ellipsoïde van Hayford (1924). De verschuiving
 * naar WGS84, een honderd meter, valt weg: voor de zon is dat niets.
 *
 * Het noorden van Lambert is niet het ware noorden: de meridianen lopen naar
 * de pool toe. Het verschil (de convergentie) is in Vlaanderen hoogstens
 * anderhalve graad.
 *
 * De stand van de zon volgt de formules van de NOAA (naar Meeus), op een
 * tiende graad. Een uur is Belgische tijd; Intl kent de zomertijd.
 *
 * Hoeken in graden. Een hoek op het terrein draait met de klok mee vanaf de
 * bovenkant van het plan, net als een plaatsing (zie plaatsing.ts). In
 * three.js is x naar rechts, y omhoog en z de y van het plan.
 *
 * Puur, met tests.
 */

const GRAAD = Math.PI / 180;
const mod = (a: number, b: number) => ((a % b) + b) % b;
const begrens = (a: number, min: number, max: number) => Math.min(max, Math.max(min, a));

// ---------------------------------------------------------------------------
// Lambert 72 en breedte en lengte
// ---------------------------------------------------------------------------

/** Hayford (1924), de ellipsoïde van Belge 1972. */
const A = 6378388;
const AFPLATTING = 1 / 297;
const E2 = 2 * AFPLATTING - AFPLATTING * AFPLATTING;
const E = Math.sqrt(E2);
/** De parameters van EPSG:31370: twee standaardparallellen, de pool als oorsprong. */
const PHI1 = (49 + 50 / 60 + 0.00204 / 3600) * GRAAD;
const PHI2 = (51 + 10 / 60 + 0.00204 / 3600) * GRAAD;
const LAMBDA0 = (4 + 22 / 60 + 2.952 / 3600) * GRAAD;
const OOSTING = 150000.013;
const NOORDING = 5400088.438;

const mVan = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
const tVan = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi))) ** (E / 2);
const KEGEL = (Math.log(mVan(PHI1)) - Math.log(mVan(PHI2))) / (Math.log(tVan(PHI1)) - Math.log(tVan(PHI2)));
const AF = (A * mVan(PHI1)) / (KEGEL * tVan(PHI1) ** KEGEL);

export interface Geo {
  breedte: number;
  lengte: number;
}

/** Breedte en lengte (Belge 1972) naar Lambert 72. De oorsprong is de pool: daar is de straal nul. */
export function geoNaarLambert({ breedte, lengte }: Geo): Lambert {
  const r = AF * tVan(breedte * GRAAD) ** KEGEL;
  const theta = KEGEL * (lengte * GRAAD - LAMBDA0);
  return [OOSTING + r * Math.sin(theta), NOORDING - r * Math.cos(theta)];
}

/** Lambert 72 naar breedte en lengte: het omgekeerde van geoNaarLambert. */
export function lambertNaarGeo([x, y]: Lambert): Geo {
  const dx = x - OOSTING;
  const dy = NOORDING - y;
  const t = (Math.hypot(dx, dy) / AF) ** (1 / KEGEL);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 10; i++) {
    const s = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - s) / (1 + s)) ** (E / 2));
  }
  return { breedte: phi / GRAAD, lengte: (Math.atan2(dx, dy) / KEGEL + LAMBDA0) / GRAAD };
}

/** Hoeveel het noorden van Lambert ten oosten van het ware noorden ligt, op deze lengte. */
export const convergentie = (lengte: number) => KEGEL * (lengte - LAMBDA0 / GRAAD);

/** Ergens in het midden van Vlaanderen: waar de zon staat als de app niet weet waar het huis ligt. */
export const MIDDEN_VLAANDEREN: Geo = { breedte: 51.0, lengte: 4.2 };

/**
 * Het ware noorden op het terrein, als hoek: de richting (sin h, -cos h) op
 * het plan. Het noorden van Lambert ligt er op de hoek van de georef (zie
 * naarLambert); het ware noorden ligt de convergentie meer naar het westen.
 */
export function noordenOpTerrein(georef: Georef, punt: Lambert): number {
  return georef.hoek - convergentie(lambertNaarGeo(punt).lengte);
}

/**
 * Waar het noorden en de plaats vandaan komen:
 * - bewaard: uit de bewaarde omgeving;
 * - omgeving: uit de omgeving zoals ze nu ligt, nog niet bewaard;
 * - aangenomen: de omgeving ligt nog met het noorden naar boven op de woning;
 * - noordpijl: van de noordpijl op het inplantingsplan (zie noordpijl.ts),
 *   zonder omgeving of met de omgeving zo op de woning gelegd;
 * - adres: de plaats is gekend, het noorden nog niet: boven op het plan;
 * - geen: geen adres: het noorden boven op het plan, in het midden van Vlaanderen.
 */
export type Noordbron = "bewaard" | "omgeving" | "aangenomen" | "noordpijl" | "adres" | "geen";

export interface Noorden {
  /** De hoek van het ware noorden op het terrein (zie noordenOpTerrein). */
  hoek: number;
  geo: Geo;
  bron: Noordbron;
}

/**
 * Het noorden en de plaats voor de zon. `ligging`: hoe de omgeving op het
 * terrein ligt, en hoe dat zo kwam (zie omgevingsbron in het 3D-scherm; "pijl"
 * is op de woning, gedraaid volgens de noordpijl); `adrespunt`: het adres in
 * Lambert, als de omgeving er is; `noordpijl`: de hoek van de noordpijl op het
 * inplantingsplan, als die er is. Het plan ligt rechtop op de grond, dus die
 * hoek geldt ook op het terrein.
 */
export function noordenVan(
  ligging: { georef: Georef; punt: Lambert; soort: "bewaard" | "plan" | "hand" | "huis" | "pijl" } | null,
  adrespunt: Lambert | null,
  noordpijl: number | null = null,
): Noorden {
  if (!ligging) {
    const geo = adrespunt ? lambertNaarGeo(adrespunt) : MIDDEN_VLAANDEREN;
    if (noordpijl !== null) return { hoek: noordpijl, geo, bron: "noordpijl" };
    return { hoek: 0, geo, bron: adrespunt ? "adres" : "geen" };
  }
  const bronnen = { bewaard: "bewaard", plan: "omgeving", hand: "omgeving", huis: "aangenomen", pijl: "noordpijl" } as const;
  return { hoek: noordenOpTerrein(ligging.georef, ligging.punt), geo: lambertNaarGeo(ligging.punt), bron: bronnen[ligging.soort] };
}

/** Wat bij de zon en de noordpijl staat: waar het noorden vandaan komt. */
export const NOORDUITLEG: Record<Noordbron, string> = {
  bewaard: "Het noorden en de plaats komen uit de bewaarde omgeving.",
  omgeving: "Het noorden komt uit de omgeving zoals ze nu ligt. Bewaar de omgeving, dan blijft het zo.",
  aangenomen: "De omgeving ligt nog met het noorden naar boven. Leg ze op het plan en bewaar ze, voor het echte noorden.",
  noordpijl: "Het noorden komt van de noordpijl op het inplantingsplan.",
  adres: "Het noorden is boven op het plan, tot de omgeving op het terrein ligt.",
  geen: "Zonder adres is het noorden boven op het plan, en staat de zon zoals in het midden van Vlaanderen. Vul het adres in en bewaar de omgeving, voor de echte zon.",
};

// ---------------------------------------------------------------------------
// De tijd in België
// ---------------------------------------------------------------------------

let klok: Intl.DateTimeFormat | null = null;

/** Datum en uur in Brussel, uit een ogenblik in UTC. */
function delenInBrussel(utc: number): { jaar: number; maand: number; dag: number; uur: number; minuut: number } {
  klok ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const delen = Object.fromEntries(klok.formatToParts(new Date(utc)).map((deel) => [deel.type, deel.value]));
  return { jaar: Number(delen.year), maand: Number(delen.month), dag: Number(delen.day), uur: Number(delen.hour), minuut: Number(delen.minute) };
}

/** Hoeveel minuten Brussel op dit ogenblik voor loopt op UTC: 60 in de winter, 120 in de zomer. */
function voorsprong(utc: number): number {
  const d = delenInBrussel(utc);
  return Math.round((Date.UTC(d.jaar, d.maand - 1, d.dag, d.uur, d.minuut) - Math.floor(utc / 60000) * 60000) / 60000);
}

/** Een datum ("2026-06-21") en een uur in minuten na middernacht, in Belgische tijd, als ogenblik in UTC. */
export function brusselseTijd(datum: string, minuten: number): number {
  const [jaar, maand, dag] = datum.split("-").map(Number);
  const alsUtc = Date.UTC(jaar, maand - 1, dag, 0, minuten);
  const eerste = alsUtc - voorsprong(alsUtc) * 60000;
  return alsUtc - voorsprong(eerste) * 60000;
}

/** Een ogenblik als datum en uur in Brussel. */
export function inBrussel(utc: number): { datum: string; minuten: number } {
  const d = delenInBrussel(utc);
  const twee = (n: number) => String(n).padStart(2, "0");
  return { datum: `${d.jaar}-${twee(d.maand)}-${twee(d.dag)}`, minuten: d.uur * 60 + d.minuut };
}

/** "05:29". */
export function uurtekst(minuten: number): string {
  const m = mod(Math.round(minuten), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// De stand van de zon
// ---------------------------------------------------------------------------

/** De declinatie van de zon (radialen) en de tijdsvereffening (minuten) op een ogenblik. */
function zonnebaan(utc: number): { declinatie: number; tijdsvereffening: number } {
  const t = (utc / 86400000 + 2440587.5 - 2451545) / 36525;
  const l0 = mod(280.46646 + t * (36000.76983 + 0.0003032 * t), 360) * GRAAD;
  const m = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * GRAAD;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const middelpunt = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * GRAAD;
  const lengte = (l0 / GRAAD + middelpunt - 0.00569 - 0.00478 * Math.sin(omega)) * GRAAD;
  const helling0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const helling = (helling0 + 0.00256 * Math.cos(omega)) * GRAAD;
  const y = Math.tan(helling / 2) ** 2;
  const vereffening =
    y * Math.sin(2 * l0) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l0) - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * m);
  return { declinatie: Math.asin(Math.sin(helling) * Math.sin(lengte)), tijdsvereffening: (4 * vereffening) / GRAAD };
}

/** Hoeveel hoger de zon lijkt door de lucht, bij een ware hoogte (graden). */
function breking(hoogte: number): number {
  if (hoogte > 85) return 0;
  const t = Math.tan(hoogte * GRAAD);
  const boogseconden =
    hoogte > 5
      ? 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5
      : hoogte > -0.575
        ? 1735 + hoogte * (-518.2 + hoogte * (103.4 + hoogte * (-12.79 + hoogte * 0.711)))
        : -20.774 / t;
  return boogseconden / 3600;
}

export interface Zonnestand {
  /** Met de klok mee vanaf het ware noorden: 90 is het oosten, 180 het zuiden. */
  azimut: number;
  /** Boven de horizon, zoals je ze ziet. Negatief: de zon is onder. */
  hoogte: number;
}

/** Waar de zon staat, op een ogenblik in UTC, gezien van een plaats. */
export function zonnestand(utc: number, { breedte, lengte }: Geo): Zonnestand {
  const { declinatie, tijdsvereffening } = zonnebaan(utc);
  const zonnetijd = mod(mod(utc / 60000, 1440) + tijdsvereffening + 4 * lengte, 1440);
  const uurhoek = (zonnetijd / 4 - 180) * GRAAD;
  const phi = breedte * GRAAD;
  const cosZenit = Math.sin(phi) * Math.sin(declinatie) + Math.cos(phi) * Math.cos(declinatie) * Math.cos(uurhoek);
  const hoogte = 90 - Math.acos(begrens(cosZenit, -1, 1)) / GRAAD;
  const azimut = mod(Math.atan2(Math.sin(uurhoek), Math.cos(uurhoek) * Math.sin(phi) - Math.tan(declinatie) * Math.cos(phi)) / GRAAD + 180, 360);
  return { azimut, hoogte: hoogte + breking(hoogte) };
}

/**
 * Wanneer de zon opkomt en ondergaat op een datum, in minuten na middernacht
 * in Belgische tijd: de bovenrand van de zon op de horizon, met de breking
 * erbij (90,833° van het zenit). Null als ze die dag niet op of onder gaat.
 */
export function zonOpEnOnder(datum: string, { breedte, lengte }: Geo): { op: number; onder: number } | null {
  const [jaar, maand, dag] = datum.split("-").map(Number);
  const middernacht = Date.UTC(jaar, maand - 1, dag);
  const phi = breedte * GRAAD;
  const rond = (utcMinuten: number, teken: 1 | -1): number | null => {
    let minuten = utcMinuten;
    // Twee keer: de declinatie en de tijdsvereffening op het ogenblik zelf.
    for (let i = 0; i < 2; i++) {
      const { declinatie, tijdsvereffening } = zonnebaan(middernacht + minuten * 60000);
      const cos = Math.cos(90.833 * GRAAD) / (Math.cos(phi) * Math.cos(declinatie)) - Math.tan(phi) * Math.tan(declinatie);
      if (cos < -1 || cos > 1) return null;
      const middag = 720 - 4 * lengte - tijdsvereffening;
      minuten = middag + teken * ((4 * Math.acos(cos)) / GRAAD);
    }
    return minuten;
  };
  const op = rond(360, -1);
  const onder = rond(1080, 1);
  if (op === null || onder === null) return null;
  const opDeMinuut = (minuten: number) => inBrussel(middernacht + Math.round(minuten) * 60000).minuten;
  return { op: opDeMinuut(op), onder: opDeMinuut(onder) };
}

const RICHTINGEN = ["het noorden", "het noordoosten", "het oosten", "het zuidoosten", "het zuiden", "het zuidwesten", "het westen", "het noordwesten"];

/** "het zuidwesten": de windrichting van een azimut. */
export const windrichting = (azimut: number) => RICHTINGEN[Math.round(mod(azimut, 360) / 45) % 8];

// ---------------------------------------------------------------------------
// De zon in de scène
// ---------------------------------------------------------------------------

/** Naar de zon toe, in three.js, lengte 1. `noorden` is de hoek van het ware noorden op het terrein. */
export function zonRichting(stand: Zonnestand, noorden: number): [number, number, number] {
  const a = (stand.azimut + noorden) * GRAAD;
  const h = stand.hoogte * GRAAD;
  return [Math.cos(h) * Math.sin(a), Math.sin(h), -Math.cos(h) * Math.cos(a)];
}

/** De vaste zon van altijd: schuin van linksboven, zoals een plan van boven getekend wordt. */
export const VASTE_ZON: [number, number, number] = (() => {
  const [x, y, z] = [-1, 1.6, -0.7];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

const glad = (t: number) => {
  const u = begrens(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/**
 * Hoe fel het licht is bij een hoogte van de zon: de zon zelf (0 onder de
 * horizon), het licht van de hemel (wat schemer blijft, zodat je nog iets
 * ziet), en hoe oranje de zon kleurt als ze laag staat (0 tot 1).
 */
export function daglicht(hoogte: number): { zon: number; hemel: number; laag: number } {
  return {
    zon: glad(hoogte / 10),
    hemel: 0.35 + 0.65 * glad((hoogte + 6) / 14),
    laag: 1 - glad(hoogte / 20),
  };
}

/**
 * Het vak waarin de zon schaduw werpt: rond het midden van de gebouwen, en
 * met de omgeving erbij ook over de tuin en de buren. Begrensd, zodat de
 * schaduw scherp blijft.
 */
export function schaduwvak(kader: Kader2d & { z1: number }, metOmgeving: boolean): { midden: Xy; straal: number } {
  const grootte = Math.max(kader.x1 - kader.x0, kader.y1 - kader.y0, kader.z1, 4);
  return {
    midden: [(kader.x0 + kader.x1) / 2, (kader.y0 + kader.y1) / 2],
    straal: metOmgeving ? Math.max(grootte, Math.min(60, grootte / 2 + 30)) : grootte,
  };
}
