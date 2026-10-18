import { toestellenVan, type Keukentoestel } from "../drie/maatwerk";
import { vermogen, veldVan } from "../drie/zonnepanelen";
import { soortStuk, type GeplaatstStuk } from "../inrichting";
import { middenVan } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import { ruimteVan, soortVan, type Punt } from "../punten";
import type { SoortRuimte } from "../types";

/**
 * Een voorstel voor de technieken, uit wat op het plan staat: de punten
 * (lichtpunten, stopcontacten, drukknoppen, netwerk...) en de toestellen bij
 * Inrichten (de warmtepomp, de laadpaal, de omvormer...). Het geeft:
 * - de kringen, met hun automaat, hun kabel en hun punten (A1, A2...);
 * - de differentiëlen: 300 mA over alles, 30 mA voor de vochtige ruimtes, de
 *   wasmachine, de droogkast, de vaatwasser en buiten, en een eigen voor de
 *   laadpaal;
 * - de verdeelkast, de domoticakast en de netwerkkast, met hun modules en
 *   waar ze komen;
 * - geschatte kabellengtes.
 *
 * Het volgt de vuistregels die elektriciens uit het AREI halen: hoogstens 8
 * contactdozen per kring (een dubbele telt als één), 2,5 mm² op 20 A voor
 * stopcontacten, 1,5 mm² op 16 A voor verlichting, een aparte kring voor elk
 * groot toestel. Het is een voorstel om met de elektricien te bespreken: hij
 * maakt het eendraadschema en het situatieschema, en een erkend organisme
 * keurt de installatie.
 *
 * Puur, in meter in het assenstelsel van elk gebouw, met tests.
 */

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

/** De domotica: geen, KNX met Home Assistant, of een ander systeem (dan schat de app los van het merk). */
export const DOMOTICASYSTEMEN = ["geen", "knx", "ander"] as const;

export type Domoticasysteem = (typeof DOMOTICASYSTEMEN)[number];

/** Het vermogen van een laadpaal, in kW: eenfasig op 32 A, driefasig op 16 A of op 32 A. */
export const LAADVERMOGENS = [7.4, 11, 22] as const;

export type Laadvermogen = (typeof LAADVERMOGENS)[number];

/** Een thuisbatterij aan de omvormer van de zonnepanelen (hybride), of met een eigen omvormer. */
export const BATTERIJEN = ["hybride", "eigen"] as const;

export type Batterij = (typeof BATTERIJEN)[number];

/** Meer zonnepanelen dan dit (kWp) is geen woning meer: een tikfout. */
export const MAX_KWP = 100;

export interface Techniekinstellingen {
  /** De aansluiting: één fase (230 V) of drie fasen met nul (3N400 V). */
  fasen: 1 | 3;
  /** De stroom van de aansluiting, in ampère. */
  stroom: number;
  /** Met domotica gaat elke lichtgroep en elk rolluik met een eigen kabel naar de kast, en komen er drukknoppen in plaats van schakelaars. */
  domotica: Domoticasysteem;
  /** De laadpaal, in kW, of null. Een laadpaal op het plan of in 3D telt altijd mee. */
  laadpaal: Laadvermogen | null;
  /** De zonnepanelen, in kWp, of null. Panelen op het dak in 3D tellen altijd mee. */
  zonnepanelen: number | null;
  /** De thuisbatterij, of null. Een batterij in 3D telt altijd mee. */
  batterij: Batterij | null;
}

/** De gewone aansluitingen van Fluvius: eenfasig 40 A (9,2 kVA), driefasig 3N400 V van 16 tot 63 A. */
export const STROMEN: Record<1 | 3, readonly number[]> = { 1: [40, 63], 3: [16, 20, 25, 32, 40, 63] };

/** Het vermogen van een aansluiting, in kVA. */
export const kva = (instellingen: Pick<Techniekinstellingen, "fasen" | "stroom">) =>
  Math.round(((instellingen.fasen === 3 ? Math.sqrt(3) * 400 : 230) * instellingen.stroom) / 100) / 10;

/** Het vermogen van de zonnepanelen op het dak in 3D, in kWp. */
export function kwpIn3d(stukken: readonly Pick<GeplaatstStuk, "soort" | "breedte" | "diepte">[]): { panelen: number; kwp: number } {
  const som = stukken
    .filter((s) => s.soort === "zonnepanelen")
    .reduce(
      (totaal, s) => {
        const { panelen, kwp } = vermogen(veldVan(s.breedte, s.diepte));
        return { panelen: totaal.panelen + panelen, kwp: totaal.kwp + kwp };
      },
      { panelen: 0, kwp: 0 },
    );
  return { panelen: som.panelen, kwp: Math.round(som.kwp * 100) / 100 };
}

/**
 * Zonder bewaarde instellingen kiest de app uit wat op het plan staat: drie
 * fasen met een laadpaal of een warmtepomp, KNX als er drukknoppen staan, en
 * de laadpaal, de zonnepanelen en de batterij zoals in 3D.
 */
export function standaardInstellingen(
  punten: readonly Pick<Punt, "soort">[],
  stukken: readonly Pick<GeplaatstStuk, "soort" | "breedte" | "diepte">[],
): Techniekinstellingen {
  const laadpaal = punten.some((p) => p.soort === "laadpunt") || stukken.some((s) => s.soort === "laadpaal" || s.soort === "wallbox");
  const warmtepomp = stukken.some((s) => s.soort === "warmtepomp_binnen" || s.soort === "warmtepomp_buiten");
  const fasen = laadpaal || warmtepomp ? 3 : 1;
  const { kwp } = kwpIn3d(stukken);
  return {
    fasen,
    stroom: fasen === 3 ? 25 : 40,
    domotica: punten.some((p) => p.soort === "drukknop") ? "knx" : "geen",
    laadpaal: laadpaal ? (fasen === 3 ? 11 : 7.4) : null,
    zonnepanelen: kwp > 0 ? kwp : null,
    batterij: stukken.some((s) => s.soort === "thuisbatterij") ? (kwp > 0 ? "hybride" : "eigen") : null,
  };
}

const eenVan = <T>(lijst: readonly T[], waarde: unknown): waarde is T => (lijst as readonly unknown[]).includes(waarde);

/** Wat bewaard of ingestuurd werd, nagekeken; null als het niet klopt. Wat ontbreekt (laadpaal, zonnepanelen, batterij) is er niet. */
export function schoneInstellingen(ruw: unknown): Techniekinstellingen | null {
  if (!ruw || typeof ruw !== "object") return null;
  const r = ruw as Record<string, unknown>;
  const fasen = r.fasen === 1 || r.fasen === 3 ? r.fasen : null;
  if (fasen === null || typeof r.stroom !== "number" || !STROMEN[fasen].includes(r.stroom)) return null;
  if (!eenVan(DOMOTICASYSTEMEN, r.domotica)) return null;
  const laadpaal = r.laadpaal ?? null;
  if (laadpaal !== null && !eenVan(LAADVERMOGENS, laadpaal)) return null;
  const zon = r.zonnepanelen ?? null;
  if (zon !== null && (typeof zon !== "number" || !Number.isFinite(zon) || zon <= 0 || zon > MAX_KWP)) return null;
  const batterij = r.batterij ?? null;
  if (batterij !== null && !eenVan(BATTERIJEN, batterij)) return null;
  return {
    fasen,
    stroom: r.stroom,
    domotica: r.domotica as Domoticasysteem,
    laadpaal: laadpaal as Laadvermogen | null,
    zonnepanelen: zon === null ? null : Math.round(zon * 100) / 100,
    batterij: batterij as Batterij | null,
  };
}

// ---------------------------------------------------------------------------
// Invoer
// ---------------------------------------------------------------------------

export interface Techniekruimte {
  id: number;
  naam: string;
  soort: SoortRuimte;
  veelhoek: Xy[][];
}

export interface Techniekverdieping {
  id: number;
  naam: string;
  gebouwId: number;
  /** De vloer, boven ±0 van het gebouw. */
  z0: number;
  ruimtes: Techniekruimte[];
}

export interface Techniekinvoer {
  verdiepingen: Techniekverdieping[];
  punten: Punt[];
  stukken: GeplaatstStuk[];
}

// ---------------------------------------------------------------------------
// De regels per soort kring
// ---------------------------------------------------------------------------

export const KRINGSOORTEN = [
  "verlichting",
  "stopcontacten",
  "aanrecht",
  "badkamer",
  "buiten",
  "kookplaat",
  "oven",
  "koeling",
  "toestel",
  "vaatwasser",
  "wasmachine",
  "droogkast",
  "warmtepomp",
  "boiler",
  "ventilatie",
  "rolluiken",
  "omvormer",
  "batterij",
  "laadpaal",
  "domotica",
  "netwerk",
] as const;

export type Kringsoort = (typeof KRINGSOORTEN)[number];

export const KRINGNAMEN: Record<Kringsoort, string> = {
  verlichting: "Verlichting",
  stopcontacten: "Stopcontacten",
  aanrecht: "Stopcontacten aanrecht",
  badkamer: "Badkamer",
  buiten: "Buiten",
  kookplaat: "Kookplaat",
  oven: "Oven",
  koeling: "Koelkast of diepvries",
  toestel: "Vast toestel",
  vaatwasser: "Vaatwasser",
  wasmachine: "Wasmachine",
  droogkast: "Droogkast",
  warmtepomp: "Warmtepomp",
  boiler: "Boiler",
  ventilatie: "Ventilatie",
  rolluiken: "Rolluiken en screens",
  omvormer: "Omvormer zonnepanelen",
  batterij: "Thuisbatterij",
  laadpaal: "Laadpaal",
  domotica: "Domoticakast",
  netwerk: "Netwerkkast",
};

export interface Beveiliging {
  polen: "1P+N" | "3P+N";
  ampere: number;
}

interface Kringregel {
  /** Hoeveel punten een kring hoogstens krijgt; null: één toestel per kring. */
  max: number | null;
  /** Achter een differentieel van 30 mA. */
  dertig: boolean;
  /** De automaat en de kabel, bij een of drie fasen. */
  bij: (fasen: 1 | 3) => { beveiliging: Beveiliging; kabel: string };
}

const een = (ampere: number, kabel: string) => () => ({ beveiliging: { polen: "1P+N" as const, ampere }, kabel });
const naarFasen =
  (eenfasig: [number, string], driefasig: [number, string]) =>
  (fasen: 1 | 3) =>
    fasen === 3
      ? { beveiliging: { polen: "3P+N" as const, ampere: driefasig[0] }, kabel: driefasig[1] }
      : { beveiliging: { polen: "1P+N" as const, ampere: eenfasig[0] }, kabel: eenfasig[1] };

/** Hoeveel contactdozen een kring hoogstens heeft; een dubbele in één doos telt als één. */
export const MAX_CONTACTDOZEN = 8;
/** Het AREI kent voor verlichting geen maximum; tien lichtpunten per kring houdt het overzichtelijk. */
export const MAX_LICHTPUNTEN = 10;
/** Motoren van rolluiken of screens per kring. */
export const MAX_MOTOREN = 10;
/** Kringen per extra differentieel van 30 mA: zo valt bij een lek niet te veel tegelijk uit. */
export const MAX_PER_DIFFERENTIEEL = 5;

export const KRINGREGELS: Record<Kringsoort, Kringregel> = {
  verlichting: { max: MAX_LICHTPUNTEN, dertig: false, bij: een(16, "XVB 3G1,5") },
  stopcontacten: { max: MAX_CONTACTDOZEN, dertig: false, bij: een(20, "XVB 3G2,5") },
  aanrecht: { max: MAX_CONTACTDOZEN, dertig: false, bij: een(20, "XVB 3G2,5") },
  // Licht en stopcontacten samen: elk lichtpunt telt als een contactdoos, op 16 A.
  badkamer: { max: MAX_CONTACTDOZEN, dertig: true, bij: een(16, "XVB 3G2,5") },
  buiten: { max: MAX_CONTACTDOZEN, dertig: true, bij: een(16, "XVB 3G2,5, in de grond EXVB") },
  kookplaat: { max: null, dertig: false, bij: naarFasen([32, "XVB 3G6"], [20, "XVB 5G2,5"]) },
  oven: { max: null, dertig: false, bij: een(20, "XVB 3G2,5") },
  koeling: { max: null, dertig: false, bij: een(20, "XVB 3G2,5") },
  toestel: { max: null, dertig: false, bij: een(20, "XVB 3G2,5") },
  vaatwasser: { max: null, dertig: true, bij: een(20, "XVB 3G2,5") },
  wasmachine: { max: null, dertig: true, bij: een(20, "XVB 3G2,5") },
  droogkast: { max: null, dertig: true, bij: een(20, "XVB 3G2,5") },
  warmtepomp: { max: null, dertig: false, bij: naarFasen([25, "XVB 3G4"], [16, "XVB 5G2,5"]) },
  boiler: { max: null, dertig: false, bij: een(16, "XVB 3G2,5") },
  ventilatie: { max: null, dertig: false, bij: een(16, "XVB 3G2,5") },
  rolluiken: { max: MAX_MOTOREN, dertig: false, bij: een(16, "XVB 3G1,5") },
  omvormer: { max: null, dertig: false, bij: naarFasen([20, "XVB 3G2,5"], [16, "XVB 5G2,5"]) },
  batterij: { max: null, dertig: false, bij: naarFasen([25, "XVB 3G4"], [16, "XVB 5G2,5"]) },
  laadpaal: { max: null, dertig: false, bij: naarFasen([32, "XVB 3G6"], [16, "XVB 5G6"]) },
  domotica: { max: null, dertig: false, bij: een(16, "XVB 3G2,5") },
  netwerk: { max: null, dertig: false, bij: een(16, "XVB 3G2,5") },
};

/** De omvormer volgt het vermogen van de panelen. */
function omvormerVoor(kwp: number, fasen: 1 | 3): { beveiliging: Beveiliging; kabel: string } {
  if (fasen === 3) return kwp > 10 ? { beveiliging: { polen: "3P+N", ampere: 25 }, kabel: "XVB 5G4" } : KRINGREGELS.omvormer.bij(3);
  if (kwp <= 3.7) return KRINGREGELS.omvormer.bij(1);
  return kwp <= 4.6 ? { beveiliging: { polen: "1P+N", ampere: 25 }, kabel: "XVB 3G4" } : { beveiliging: { polen: "1P+N", ampere: 32 }, kabel: "XVB 3G6" };
}

/** De automaat en de kabel van een laadpaal, volgens zijn vermogen. Driefasig altijd 5G6: zo kan later ook 22 kW. */
function laadpaalVoor(kw: Laadvermogen, fasen: 1 | 3): { beveiliging: Beveiliging; kabel: string } {
  if (fasen === 3 && kw === 22) return { beveiliging: { polen: "3P+N", ampere: 32 }, kabel: "XVB 5G6" };
  if (fasen === 3 && kw === 11) return { beveiliging: { polen: "3P+N", ampere: 16 }, kabel: "XVB 5G6" };
  return { beveiliging: { polen: "1P+N", ampere: 32 }, kabel: "XVB 3G6" };
}

/** Een vermogen in woorden: "7,4", "22". */
const komma = (getal: number) => String(getal).replace(".", ",");

/** Een vast toestel herkennen aan zijn label: "Oven", "Kookplaat", "Wasmachine"... */
export function toestelVan(label: string | null): Kringsoort {
  const t = (label ?? "").toLowerCase();
  if (/kook|inductie|vuur|fornuis/.test(t)) return "kookplaat";
  if (/vaatwas/.test(t)) return "vaatwasser";
  if (/droog/.test(t)) return "droogkast";
  if (/was/.test(t)) return "wasmachine";
  if (/oven|stoom|micro|magnetron/.test(t)) return "oven";
  if (/koel|vries/.test(t)) return "koeling";
  return "toestel";
}

/** De toestellen bij Inrichten die een eigen kring krijgen. */
const KRING_VAN_STUK: Record<string, Kringsoort> = {
  wasmachine: "wasmachine",
  droogkast: "droogkast",
  warmtepomp_binnen: "warmtepomp",
  warmtepomp_buiten: "warmtepomp",
  boiler: "boiler",
  ventilatie: "ventilatie",
  omvormer: "omvormer",
  thuisbatterij: "batterij",
  wallbox: "laadpaal",
  laadpaal: "laadpaal",
};

/** De toestellen in maatwerk (zie drie/maatwerk.ts), zoals de ovens in een kolomkast of de kookplaat in het eiland. */
const KRING_VAN_TOESTEL: Record<Keukentoestel, Kringsoort> = { oven: "oven", kookplaat: "kookplaat", vaatwasser: "vaatwasser", koelkast: "koeling" };
const TOESTELCODES: Record<Keukentoestel, string> = { oven: "OV", kookplaat: "KP", vaatwasser: "VW", koelkast: "KK" };
const KEUKENTOESTELNAMEN: Record<Keukentoestel, string> = { oven: "Oven", kookplaat: "Kookplaat", vaatwasser: "Vaatwasser", koelkast: "Koelkast" };

/** De korte code van een toestel bij Inrichten, zoals een punt een code heeft. */
const STUKCODES: Record<string, string> = {
  wasmachine: "WM",
  droogkast: "DK",
  warmtepomp_binnen: "WP",
  warmtepomp_buiten: "WP",
  boiler: "B",
  ventilatie: "V",
  omvormer: "OMV",
  thuisbatterij: "BAT",
  wallbox: "EV",
  laadpaal: "EV",
  zonnepanelen: "PV",
};

// ---------------------------------------------------------------------------
// De uitkomst
// ---------------------------------------------------------------------------

export interface Kringpunt {
  bron: "punt" | "stuk";
  id: number;
  soort: string;
  code: string;
  naam: string;
  aantal: number;
  verdiepingId: number;
  ruimte: string | null;
  x: number;
  y: number;
  /** A1, A2...: de kring en het volgnummer langs de kabel. */
  nummer: string;
}

export interface Kring {
  letter: string;
  soort: Kringsoort;
  naam: string;
  beveiliging: Beveiliging;
  kabel: string;
  /** Het nummer van de differentieel ervoor: 0 is de algemene van 300 mA. */
  differentieel: number;
  punten: Kringpunt[];
  /** Wat meetelt voor de vuistregel: contactdozen, lichtpunten, motoren. */
  telling: number;
  /** Geschat, in meter; null als een punt in een ander gebouw ligt dan de kast. */
  kabellengte: number | null;
  opmerking: string | null;
}

export interface Differentieel {
  nummer: number;
  naam: string;
  gevoeligheid: 300 | 30;
  type: "A" | "A of B";
  polen: "2P" | "4P";
  ampere: number;
}

export interface Kastplaats {
  gebouwId: number;
  verdiepingId: number;
  punt: Xy;
  ruimte: string | null;
  /** Waar het vandaan komt: een kast bij Inrichten, een ruimte zoals Technieken, of het midden. */
  bron: "verdeelkast" | "meterkast" | "domoticakast" | "netwerkkast" | "ruimte" | "midden";
}

export interface Moduleregel {
  wat: string;
  aantal: number;
  /** Modules van 18 mm per stuk. */
  breedte: number;
}

export interface Kast {
  regels: Moduleregel[];
  modules: number;
  /** Vrije plaats voor later. */
  reserve: number;
  /** Rijen van 13 modules. */
  rijen: number;
}

export interface Domotica {
  /** KNX met Home Assistant, of een ander systeem: dan schat de app los van het merk. */
  systeem: "knx" | "ander";
  /** Waar de domoticakast staat: bij Inrichten, of naast de verdeelkast. */
  plaats: Kastplaats | null;
  relais: number;
  dimmers: number;
  led: number;
  motoren: number;
  drukknoppen: number;
  melders: number;
  perRuimte: { verdieping: string; ruimte: string; relais: number; dimmers: number; led: number; motoren: number; drukknoppen: number; melders: number }[];
  /** KNX: de toestellen op de bus (drukknoppen, melders, actoren en IP-routers), de lijnen, en de buskabel in meter. */
  knx: { toestellen: number; lijnen: number; buskabel: number | null } | null;
  kast: Kast;
  /** Een kabel per uitgang en per drukknop of melder, naar de kast. */
  kabels: { soort: string; aantal: number; lengte: number | null }[];
}

export interface Netwerk {
  /** Waar de netwerkkast staat: bij Inrichten, of naast de verdeelkast. */
  plaats: Kastplaats | null;
  poorten: { wat: string; aantal: number; poe: boolean }[];
  perRuimte: { verdieping: string; ruimte: string; aantal: number; poe: number }[];
  totaal: number;
  poe: number;
  patchpanelen: number;
  switchpoorten: number;
  /** Rackeenheden (U) van de kast. */
  hoogte: number;
  kabellengte: number | null;
  /** Poorten verder dan 90 m kabel: daar haalt UTP de snelheid niet. */
  telang: number;
}

export interface Techniekvoorstel {
  instellingen: Techniekinstellingen;
  kast: Kastplaats | null;
  kringen: Kring[];
  differentielen: Differentieel[];
  verdeelkast: Kast;
  domotica: Domotica | null;
  netwerk: Netwerk;
  /** Per soort kabel de geschatte lengte, in meter. */
  kabels: { soort: string; lengte: number }[];
  /** Zonnepanelen: aantal en vermogen. */
  zonnepanelen: { panelen: number; kwp: number } | null;
  /** Wat de app opviel: een punt met meer dan 8 contactdozen, een bijgebouw... */
  opmerkingen: string[];
}

// ---------------------------------------------------------------------------
// Rekenwerk
// ---------------------------------------------------------------------------

const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;

/** De letters van de kringen: A tot Z, dan AA, AB... */
export function kringletter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `${kringletter(Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
}

/** De ruimtes waar de kasten gewoonlijk komen, van best naar minder goed. */
const TECHNISCHE_RUIMTES: readonly SoortRuimte[] = ["technieken", "berging", "wasplaats", "garage"];

/**
 * Waar de kasten komen: bij de verdeelkast of meterkast die bij Inrichten
 * staat, anders in de technische ruimte, de berging, de wasplaats of de
 * garage van het laagste gelijkvloers van het hoofdgebouw, anders in het
 * midden ervan.
 */
export function kastplaatsVan(invoer: Techniekinvoer): Kastplaats | null {
  const verdieping = (id: number) => invoer.verdiepingen.find((v) => v.id === id);
  const ruimteOp = (v: Techniekverdieping, p: Xy) => {
    const id = ruimteVan({ x_m: p[0], y_m: p[1] }, v.ruimtes);
    return v.ruimtes.find((r) => r.id === id)?.naam ?? null;
  };
  for (const soort of ["verdeelkast", "meterkast"] as const) {
    const plaats = kastBijInrichten(invoer, soort);
    if (plaats) return plaats;
  }
  // Het hoofdgebouw: dat met de meeste punten, dan met de meeste ruimtes.
  const gebouwen = [...new Set(invoer.verdiepingen.map((v) => v.gebouwId))];
  if (gebouwen.length === 0) return null;
  const punten = (g: number) => invoer.punten.filter((p) => verdieping(p.verdieping_id)?.gebouwId === g).length;
  const ruimtes = (g: number) => invoer.verdiepingen.filter((v) => v.gebouwId === g).reduce((som, v) => som + v.ruimtes.length, 0);
  const hoofd = gebouwen.sort((a, b) => punten(b) - punten(a) || ruimtes(b) - ruimtes(a) || a - b)[0];
  // Het gelijkvloers: de laagste verdieping die geen kelder is, met ruimtes.
  const eigen = invoer.verdiepingen.filter((v) => v.gebouwId === hoofd && v.ruimtes.length > 0).sort((a, b) => a.z0 - b.z0);
  const gelijkvloers = eigen.find((v) => v.z0 >= -0.5) ?? eigen[0];
  if (!gelijkvloers) return null;
  for (const soort of TECHNISCHE_RUIMTES) {
    const ruimte = gelijkvloers.ruimtes.find((r) => r.soort === soort) ?? eigen.flatMap((v) => v.ruimtes).find((r) => r.soort === soort);
    if (!ruimte) continue;
    const v = eigen.find((w) => w.ruimtes.includes(ruimte))!;
    return { gebouwId: hoofd, verdiepingId: v.id, punt: middenVan(ruimte.veelhoek), ruimte: ruimte.naam, bron: "ruimte" };
  }
  const alle = gelijkvloers.ruimtes.flatMap((r) => r.veelhoek[0] ?? []);
  const midden: Xy = alle.length > 0 ? [alle.reduce((s, p) => s + p[0], 0) / alle.length, alle.reduce((s, p) => s + p[1], 0) / alle.length] : [0, 0];
  return { gebouwId: hoofd, verdiepingId: gelijkvloers.id, punt: [mm(midden[0]), mm(midden[1])], ruimte: ruimteOp(gelijkvloers, midden), bron: "midden" };
}

/** Waar een kast staat die bij Inrichten gezet werd, of null. */
export function kastBijInrichten(invoer: Techniekinvoer, soort: "verdeelkast" | "meterkast" | "domoticakast" | "netwerkkast"): Kastplaats | null {
  for (const stuk of invoer.stukken) {
    const v = stuk.soort === soort ? invoer.verdiepingen.find((w) => w.id === stuk.verdiepingId) : undefined;
    if (!v) continue;
    const id = ruimteVan({ x_m: stuk.x, y_m: stuk.y }, v.ruimtes);
    return { gebouwId: v.gebouwId, verdiepingId: v.id, punt: [stuk.x, stuk.y], ruimte: v.ruimtes.find((r) => r.id === id)?.naam ?? null, bron: soort };
  }
  return null;
}

const plekVan = (plaats: Kastplaats | null): Plek | null => (plaats ? { verdiepingId: plaats.verdiepingId, x: plaats.punt[0], y: plaats.punt[1] } : null);

/** Een plek in het huis: een verdieping en een punt op het plan. */
interface Plek {
  verdiepingId: number;
  x: number;
  y: number;
}

/**
 * Hoe ver een kabel loopt van a naar b: langs de muren (waterpas en haaks),
 * de hoogte tussen de verdiepingen, en telkens 1,5 m omhoog of omlaag in de
 * muur. Null als ze in een ander gebouw liggen.
 */
function kabelafstand(a: Plek, b: Plek, verdiepingen: readonly Techniekverdieping[]): number | null {
  const [va, vb] = [verdiepingen.find((v) => v.id === a.verdiepingId), verdiepingen.find((v) => v.id === b.verdiepingId)];
  if (!va || !vb || va.gebouwId !== vb.gebouwId) return null;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(va.z0 - vb.z0) + 3;
}

/** Een kabel die van punt tot punt loopt (een gewone kring): van de kast naar het dichtste punt, en zo verder. Ook de volgorde. */
function doorlussen<T extends Plek>(kast: Plek | null, punten: readonly T[], verdiepingen: readonly Techniekverdieping[]): { volgorde: T[]; lengte: number | null } {
  const rest = [...punten];
  const volgorde: T[] = [];
  let lengte: number | null = 0;
  let hier: Plek | null = kast;
  while (rest.length > 0) {
    let beste = 0;
    let besteAfstand = Infinity;
    rest.forEach((p, i) => {
      const d = hier ? (kabelafstand(hier, p, verdiepingen) ?? 1e6) : p.y * 1000 + p.x;
      if (d < besteAfstand) {
        besteAfstand = d;
        beste = i;
      }
    });
    const volgende = rest.splice(beste, 1)[0];
    const stap = hier ? kabelafstand(hier, volgende, verdiepingen) : null;
    lengte = lengte === null || stap === null ? null : lengte + stap;
    volgorde.push(volgende);
    hier = volgende;
  }
  // 10% voor bochten en wat in de doos blijft.
  return { volgorde, lengte: lengte === null || !kast ? null : Math.ceil(lengte * 1.1) };
}

/** Een kabel per punt, recht van de kast (domotica, netwerk): de som van de afstanden. */
function sterlengte(kast: Plek | null, punten: readonly Plek[], verdiepingen: readonly Techniekverdieping[]): number | null {
  if (!kast) return null;
  let som = 0;
  for (const p of punten) {
    const d = kabelafstand(kast, p, verdiepingen);
    if (d === null) return null;
    som += d;
  }
  return Math.ceil(som * 1.1);
}

/** Een punt of toestel dat stroom vraagt, met wat het meetelt in zijn kring. */
interface Verbruiker extends Plek {
  bron: "punt" | "stuk";
  id: number;
  soort: string;
  code: string;
  naam: string;
  aantal: number;
  telling: number;
  ruimteId: number | null;
  ruimte: string | null;
  kring: Kringsoort;
  /** Spots in dezelfde ruimte tellen samen als één lichtpunt. */
  groep: string | null;
}

/** De verbruikers op het plan: wat welke kring krijgt. */
function verbruikers(invoer: Techniekinvoer): { lijst: Verbruiker[]; kwp: number; panelen: number } {
  const lijst: Verbruiker[] = [];
  const verdiepingen = new Map(invoer.verdiepingen.map((v) => [v.id, v]));
  const ruimteVanPunt = (v: Techniekverdieping, x: number, y: number) => {
    const id = ruimteVan({ x_m: x, y_m: y }, v.ruimtes);
    return v.ruimtes.find((r) => r.id === id) ?? null;
  };
  for (const punt of invoer.punten) {
    const v = verdiepingen.get(punt.verdieping_id);
    const soort = soortVan(punt.soort);
    if (!v || !soort) continue;
    const ruimte = ruimteVanPunt(v, punt.x_m, punt.y_m);
    const inBadkamer = ruimte?.soort === "badkamer";
    const basis = {
      bron: "punt" as const,
      id: punt.id,
      soort: punt.soort,
      code: soort.code,
      naam: punt.label ? `${soort.naam}: ${punt.label}` : soort.naam,
      aantal: punt.aantal,
      verdiepingId: v.id,
      x: punt.x_m,
      y: punt.y_m,
      ruimteId: ruimte?.id ?? null,
      ruimte: ruimte?.naam ?? null,
      groep: null,
    };
    switch (punt.soort) {
      case "lichtpunt":
      case "wandlicht":
        lijst.push({ ...basis, telling: punt.aantal, kring: inBadkamer ? "badkamer" : "verlichting" });
        break;
      case "inbouwspot":
      case "ledstrip":
        lijst.push({ ...basis, telling: 1, kring: inBadkamer ? "badkamer" : "verlichting", groep: `${punt.soort}:${v.id}:${ruimte?.id ?? "geen"}` });
        break;
      case "buitenlicht":
      case "stopcontact_buiten":
        lijst.push({ ...basis, telling: punt.aantal, kring: "buiten" });
        break;
      case "stopcontact":
      case "stopcontact_dubbel":
        lijst.push({ ...basis, telling: punt.aantal, kring: inBadkamer ? "badkamer" : "stopcontacten" });
        break;
      case "stopcontact_aanrecht":
        lijst.push({ ...basis, telling: punt.aantal, kring: "aanrecht" });
        break;
      case "vast_toestel":
        // Elk toestel zijn eigen kring, ook twee ovens op één punt.
        for (let i = 0; i < punt.aantal; i++) lijst.push({ ...basis, aantal: 1, telling: 1, kring: toestelVan(punt.label) });
        break;
      case "laadpunt":
        for (let i = 0; i < punt.aantal; i++) lijst.push({ ...basis, aantal: 1, telling: 1, kring: "laadpaal" });
        break;
      case "rolluik":
        lijst.push({ ...basis, telling: punt.aantal, kring: "rolluiken" });
        break;
      default:
        break;
    }
  }
  // De toestellen bij Inrichten, als er geen punt van die soort voor staat. Eén warmtepomp, ook met een binnen- en buitenunit.
  const zonnepanelen = invoer.stukken.filter((s) => s.soort === "zonnepanelen");
  const opgeteld = kwpIn3d(zonnepanelen);
  // Een punt gaat voor: een vast toestel "wasmachine" op het plan is de wasmachine bij Inrichten, en een "oven" de oven in de kolomkast.
  const metPunt = new Set(lijst.map((v) => v.kring));
  for (const stuk of invoer.stukken) {
    const v = verdiepingen.get(stuk.verdiepingId);
    if (!v) continue;
    const soortnaam = soortStuk(stuk.soort)?.naam ?? stuk.soort;
    // Het stuk zelf, zoals een wasmachine, en wat erin zit, zoals de ovens in een kolomkast.
    const eigen = KRING_VAN_STUK[stuk.soort];
    const toestellen = [
      ...(eigen ? [{ kring: eigen, code: STUKCODES[stuk.soort] ?? "T", naam: soortnaam }] : []),
      ...toestellenVan(soortStuk(stuk.soort)?.vorm, stuk.indeling).map((t) => ({
        kring: KRING_VAN_TOESTEL[t],
        code: TOESTELCODES[t],
        naam: `${KEUKENTOESTELNAMEN[t]} in ${soortnaam.toLowerCase()}`,
      })),
    ];
    for (const { kring, code, naam } of toestellen) {
      if (metPunt.has(kring)) continue;
      if (kring === "warmtepomp" && lijst.some((x) => x.kring === "warmtepomp")) continue;
      const ruimte = ruimteVanPunt(v, stuk.x, stuk.y);
      lijst.push({
        bron: "stuk",
        id: stuk.id,
        soort: stuk.soort,
        code,
        naam: stuk.label ? `${naam}: ${stuk.label}` : naam,
        aantal: 1,
        telling: 1,
        verdiepingId: v.id,
        x: stuk.x,
        y: stuk.y,
        ruimteId: ruimte?.id ?? null,
        ruimte: ruimte?.naam ?? null,
        kring,
        groep: null,
      });
    }
  }
  // Zonnepanelen zonder omvormer bij Inrichten: toch een kring, bij het eerste veld.
  if (zonnepanelen.length > 0 && !lijst.some((v) => v.kring === "omvormer")) {
    const veld = zonnepanelen[0];
    const v = verdiepingen.get(veld.verdiepingId);
    if (v) {
      lijst.push({
        bron: "stuk",
        id: veld.id,
        soort: "zonnepanelen",
        code: "PV",
        naam: "Zonnepanelen",
        aantal: 1,
        telling: 1,
        verdiepingId: v.id,
        x: veld.x,
        y: veld.y,
        ruimteId: null,
        ruimte: null,
        kring: "omvormer",
        groep: null,
      });
    }
  }
  return { lijst, kwp: opgeteld.kwp, panelen: opgeteld.panelen };
}

/** Zet de eenheden achter elkaar in kringen van hoogstens `max`, ruimte per ruimte. Een ruimte wordt enkel gesplitst als ze alleen al te veel heeft. */
function vullen<T extends { telling: number }>(eenheden: readonly T[][], max: number): T[][] {
  const kringen: T[][] = [];
  let huidig: T[] = [];
  let teller = 0;
  for (const ruimte of eenheden) {
    const som = ruimte.reduce((s, e) => s + e.telling, 0);
    if (teller > 0 && teller + som > max) {
      kringen.push(huidig);
      huidig = [];
      teller = 0;
    }
    for (const eenheid of ruimte) {
      if (teller > 0 && teller + eenheid.telling > max) {
        kringen.push(huidig);
        huidig = [];
        teller = 0;
      }
      huidig.push(eenheid);
      teller += eenheid.telling;
    }
  }
  if (huidig.length > 0) kringen.push(huidig);
  return kringen;
}

const VOLGORDE: Record<Kringsoort, number> = Object.fromEntries(KRINGSOORTEN.map((soort, i) => [soort, i])) as Record<Kringsoort, number>;

export function maakVoorstel(invoer: Techniekinvoer, instellingen: Techniekinstellingen): Techniekvoorstel {
  const kast = kastplaatsVan(invoer);
  const kastplek = plekVan(kast);
  // De domoticakast en de netwerkkast: waar ze bij Inrichten staan, anders naast de verdeelkast.
  const domoticaplaats = kastBijInrichten(invoer, "domoticakast") ?? kast;
  const netwerkplaats = kastBijInrichten(invoer, "netwerkkast") ?? kast;
  const verdiepingen = invoer.verdiepingen;
  const verdiepingVan = (id: number) => verdiepingen.find((v) => v.id === id);
  const { lijst: alle, kwp: kwp3d, panelen } = verbruikers(invoer);
  // De zonnepanelen: zoals bij Uitgangspunten, anders zoals op het dak in 3D.
  const kwp = instellingen.zonnepanelen ?? kwp3d;
  // Een hybride omvormer neemt de thuisbatterij mee: die krijgt geen eigen kring.
  const hybride = instellingen.batterij === "hybride" && kwp > 0;
  const lijst = hybride ? alle.filter((v) => v.kring !== "batterij") : alle;
  // De laadpaal: zoals bij Uitgangspunten, en eenfasig hoogstens 7,4 kW.
  const laadkw: Laadvermogen = instellingen.fasen === 1 ? 7.4 : (instellingen.laadpaal ?? 11);
  const metDomotica = instellingen.domotica !== "geen";
  const opmerkingen: string[] = [];
  const afstandTotKast = (p: Plek) => (kastplek ? (kabelafstand(kastplek, p, verdiepingen) ?? 1e6) : 0);

  // Eerst de kringen met meer punten, per verdieping (de badkamer per ruimte, buiten per gebouw); dan een kring per toestel.
  interface Ontwerp {
    soort: Kringsoort;
    naam: string;
    leden: Verbruiker[];
    sorteer: number;
    /** Staat bij Uitgangspunten, maar nog niet op het plan of in 3D: de kabel is niet te schatten. */
    zonderPlaats?: boolean;
  }
  const ontwerpen: Ontwerp[] = [];
  const meer = lijst.filter((v) => KRINGREGELS[v.kring].max !== null);
  const sleutel = (v: Verbruiker) =>
    v.kring === "badkamer" ? `badkamer:${v.verdiepingId}:${v.ruimteId}` : v.kring === "buiten" ? `buiten:${verdiepingVan(v.verdiepingId)?.gebouwId}` : `${v.kring}:${v.verdiepingId}`;
  const groepen = new Map<string, Verbruiker[]>();
  for (const v of meer) groepen.set(sleutel(v), [...(groepen.get(sleutel(v)) ?? []), v]);
  for (const leden of groepen.values()) {
    const eerste = leden[0];
    const v = verdiepingVan(eerste.verdiepingId)!;
    // Spots of een ledstrip in één ruimte tellen samen als één lichtpunt.
    const eenheden = new Map<string, Verbruiker[]>();
    for (const lid of leden) {
      const id = lid.groep ?? `${lid.bron}:${lid.id}`;
      eenheden.set(id, [...(eenheden.get(id) ?? []), lid]);
    }
    const perEenheid = [...eenheden.values()].map((stukken) => ({
      stukken,
      telling: stukken[0].groep ? 1 : stukken.reduce((s, x) => s + x.telling, 0),
      ruimteId: stukken[0].ruimteId,
      afstand: afstandTotKast(stukken[0]),
    }));
    // Ruimte per ruimte, de dichtste bij de kast eerst.
    const perRuimte = new Map<number | null, typeof perEenheid>();
    for (const e of perEenheid) perRuimte.set(e.ruimteId, [...(perRuimte.get(e.ruimteId) ?? []), e]);
    const ruimtes = [...perRuimte.values()].sort((a, b) => Math.min(...a.map((e) => e.afstand)) - Math.min(...b.map((e) => e.afstand)));
    const max = KRINGREGELS[eerste.kring].max!;
    for (const e of perEenheid) {
      if (e.telling > max) opmerkingen.push(`${e.stukken[0].naam} in ${e.stukken[0].ruimte ?? "een ruimte"}: ${e.telling} op één punt, meer dan ${max} per kring.`);
    }
    const kringen = vullen(ruimtes, max);
    const basisnaam =
      eerste.kring === "badkamer"
        ? (eerste.ruimte ?? "Badkamer")
        : eerste.kring === "buiten"
          ? "Buiten"
          : `${KRINGNAMEN[eerste.kring]} ${v.naam.toLowerCase()}`;
    kringen.forEach((kring, i) =>
      ontwerpen.push({
        soort: eerste.kring,
        naam: kringen.length > 1 ? `${basisnaam} ${i + 1}` : basisnaam,
        leden: kring.flatMap((e) => e.stukken),
        sorteer: v.z0 * 1000 + i,
      }),
    );
  }
  // Een kring per toestel; een tweede van dezelfde soort krijgt een nummer.
  const teller = new Map<Kringsoort, number>();
  const enkel = lijst.filter((v) => KRINGREGELS[v.kring].max === null);
  for (const v of enkel) {
    const n = (teller.get(v.kring) ?? 0) + 1;
    teller.set(v.kring, n);
    ontwerpen.push({ soort: v.kring, naam: KRINGNAMEN[v.kring], leden: [v], sorteer: n });
  }
  for (const soort of KRINGSOORTEN) {
    if ((teller.get(soort) ?? 0) > 1) {
      let i = 0;
      for (const o of ontwerpen) if (o.soort === soort && KRINGREGELS[soort].max === null) o.naam = `${KRINGNAMEN[soort]} ${++i}`;
    }
  }
  // Wat bij Uitgangspunten staat maar nog niet op het plan of in 3D: een kring zonder plaats.
  const heeft = (soort: Kringsoort) => lijst.some((v) => v.kring === soort);
  const zonderPlaats = (soort: Kringsoort) => ontwerpen.push({ soort, naam: KRINGNAMEN[soort], leden: [], sorteer: 99, zonderPlaats: true });
  if (instellingen.laadpaal !== null && !heeft("laadpaal")) zonderPlaats("laadpaal");
  if (kwp > 0 && !heeft("omvormer")) zonderPlaats("omvormer");
  if (instellingen.batterij !== null && !hybride && !heeft("batterij")) zonderPlaats("batterij");
  // Een laadpaal heet naar zijn vermogen.
  for (const o of ontwerpen) if (o.soort === "laadpaal") o.naam = o.naam.replace(KRINGNAMEN.laadpaal, `${KRINGNAMEN.laadpaal} ${komma(laadkw)} kW`);

  // De kasten zelf: de domoticakast en de netwerkkast krijgen hun eigen kring.
  const domotica = metDomotica ? domoticaVan(invoer, domoticaplaats, verdiepingen, instellingen.domotica === "knx" ? "knx" : "ander") : null;
  const extra: Netwerkpoort[] = [];
  // Toestellen op het netwerk: een poort per laadpaal, omvormer en batterij, en één voor de warmtepomp en voor de ventilatie.
  const eenmaal = new Set<Kringsoort>();
  for (const o of ontwerpen) {
    if (!NETWERKKRINGEN.has(o.soort) || ((o.soort === "warmtepomp" || o.soort === "ventilatie") && eenmaal.has(o.soort))) continue;
    eenmaal.add(o.soort);
    extra.push({ wat: TOESTELPOORTEN, aantal: 1, plek: o.leden[0] ?? null });
  }
  if (domotica?.knx) {
    extra.push({ wat: "KNX IP-router", aantal: domotica.knx.lijnen, plek: plekVan(domoticaplaats) });
    extra.push({ wat: "Home Assistant (mini-pc of Home Assistant Green)", aantal: 1, plek: null });
  } else if (domotica) {
    extra.push({ wat: "Domoticakast", aantal: 1, plek: plekVan(domoticaplaats) });
  }
  // De P1-poort van de digitale meter: voor Home Assistant, en om de laadpaal of de zonnepanelen te sturen.
  if (instellingen.domotica === "knx" || heeft("laadpaal") || instellingen.laadpaal !== null || kwp > 0) {
    extra.push({ wat: "Digitale meter (P1-poort)", aantal: 1, plek: plekVan(kastBijInrichten(invoer, "meterkast") ?? kast) });
  }
  const netwerk = netwerkVan(invoer, netwerkplaats, verdiepingen, extra);
  if (domotica) ontwerpen.push({ soort: "domotica", naam: KRINGNAMEN.domotica, leden: [], sorteer: 0 });
  if (netwerk.totaal > 0) ontwerpen.push({ soort: "netwerk", naam: KRINGNAMEN.netwerk, leden: [], sorteer: 0 });

  // De volgorde: eerst wat op de algemene differentieel staat, dan de 30 mA, dan de laadpaal.
  const groep = (soort: Kringsoort) => (soort === "laadpaal" ? 2 : KRINGREGELS[soort].dertig ? 1 : 0);
  ontwerpen.sort((a, b) => groep(a.soort) - groep(b.soort) || VOLGORDE[a.soort] - VOLGORDE[b.soort] || a.sorteer - b.sorteer);

  // De differentiëlen: de algemene, dan per vijf kringen een van 30 mA, en een per laadpaal.
  const differentielen: Differentieel[] = [
    {
      nummer: 0,
      naam: "Algemeen",
      gevoeligheid: 300,
      type: "A",
      polen: instellingen.fasen === 3 ? "4P" : "2P",
      ampere: instellingen.stroom <= 40 ? 40 : 63,
    },
  ];
  const dertig = ontwerpen.filter((o) => groep(o.soort) === 1);
  for (let i = 0; i < dertig.length; i += MAX_PER_DIFFERENTIEEL) {
    differentielen.push({
      nummer: differentielen.length,
      naam: dertig.length > MAX_PER_DIFFERENTIEEL ? `Vochtige ruimtes en toestellen ${i / MAX_PER_DIFFERENTIEEL + 1}` : "Vochtige ruimtes en toestellen",
      gevoeligheid: 30,
      type: "A",
      polen: "2P",
      ampere: 40,
    });
  }
  const differentieelVan = new Map<Ontwerp, number>();
  dertig.forEach((o, i) => differentieelVan.set(o, 1 + Math.floor(i / MAX_PER_DIFFERENTIEEL)));
  for (const o of ontwerpen.filter((x) => x.soort === "laadpaal")) {
    differentieelVan.set(o, differentielen.length);
    differentielen.push({
      nummer: differentielen.length,
      naam: o.naam,
      gevoeligheid: 30,
      type: "A of B",
      polen: laadpaalVoor(laadkw, instellingen.fasen).beveiliging.polen === "3P+N" ? "4P" : "2P",
      ampere: 40,
    });
  }

  const kringen: Kring[] = ontwerpen.map((o, i) => {
    const letter = kringletter(i);
    const regel = KRINGREGELS[o.soort];
    const { beveiliging, kabel } =
      o.soort === "omvormer" ? omvormerVoor(kwp, instellingen.fasen) : o.soort === "laadpaal" ? laadpaalVoor(laadkw, instellingen.fasen) : regel.bij(instellingen.fasen);
    const ster = metDomotica && (o.soort === "verlichting" || o.soort === "rolluiken");
    // Met domotica vertrekt elke lichtgroep en elk rolluik uit de domoticakast.
    const vanaf = ster ? plekVan(domoticaplaats) : kastplek;
    const { volgorde, lengte } = doorlussen(vanaf, o.leden, verdiepingen);
    const punten: Kringpunt[] = volgorde.map((v, j) => ({
      bron: v.bron,
      id: v.id,
      soort: v.soort,
      code: v.code,
      naam: v.naam,
      aantal: v.aantal,
      verdiepingId: v.verdiepingId,
      ruimte: v.ruimte,
      x: v.x,
      y: v.y,
      nummer: `${letter}${j + 1}`,
    }));
    const kabellengte = o.zonderPlaats ? null : o.leden.length === 0 ? (kastplek ? 3 : null) : ster ? sterlengte(vanaf, o.leden, verdiepingen) : lengte;
    const knx = instellingen.domotica === "knx";
    const opmerking =
      [
        o.soort === "laadpaal" ? "Een eigen differentieel van 30 mA: type A als de laadpaal zelf 6 mA gelijkstroom ziet, anders type B." : null,
        o.soort === "koeling" ? "Niet achter de 30 mA: zo blijft de diepvries draaien als die uitvalt." : null,
        o.soort === "omvormer" && kwp > 0
          ? `${panelen > 0 && instellingen.zonnepanelen === null ? `${panelen} panelen, ` : ""}${komma(kwp)} kWp.` +
            (hybride ? " Hybride: de thuisbatterij hangt aan de omvormer, op gelijkstroom." : "") +
            (instellingen.fasen === 1 && kwp > 4.6 ? " Eenfasig mag een omvormer hoogstens 5 kVA leveren: driefasig is beter." : "")
          : null,
        ster && knx
          ? `KNX: een kabel per ${o.soort === "rolluiken" ? "motor (4G1,5), naar de jaloezieactor" : "lichtgroep, naar de schakel- of dimactor"} in de domoticakast.`
          : ster
            ? `Domotica: een kabel per ${o.soort === "rolluiken" ? "motor (4G1,5)" : "lichtgroep"}, recht naar de domoticakast.`
            : null,
        o.zonderPlaats ? "Nog niet op het plan of in 3D: zet het erop, dan rekent de app de kabel." : null,
      ]
        .filter(Boolean)
        .join(" ") || null;
    return {
      letter,
      soort: o.soort,
      naam: o.naam,
      beveiliging,
      kabel: ster && o.soort === "rolluiken" ? "XVB 4G1,5 per motor" : ster ? "XVB 3G1,5 per lichtgroep" : kabel,
      differentieel: differentieelVan.get(o) ?? 0,
      punten,
      telling: o.leden.reduce((s, v) => s + v.telling, 0) - spotsTeVeel(o.leden),
      kabellengte,
      opmerking,
    };
  });

  // Een bijgebouw: de kabels erheen schat de app niet.
  const anderGebouw = new Set(lijst.filter((v) => kast && verdiepingVan(v.verdiepingId)?.gebouwId !== kast.gebouwId).map((v) => v.verdiepingId));
  if (anderGebouw.size > 0) {
    opmerkingen.push(
      `Punten in een ander gebouw dan de verdeelkast (${[...anderGebouw].map((id) => verdiepingVan(id)?.naam).join(", ")}): daar komt meestal een eigen verdeelbord, met een voedingskabel vanuit de woning. De kabel erheen schat de app niet.`,
    );
  }
  const metLaadpaal = kringen.some((k) => k.soort === "laadpaal");
  if (instellingen.fasen === 1 && (metLaadpaal || kringen.some((k) => k.soort === "warmtepomp"))) {
    opmerkingen.push("Met een laadpaal of een warmtepomp is een driefasige aansluiting (3N400 V) beter: zo verdeelt de belasting zich.");
  }
  if (metLaadpaal) {
    if (instellingen.fasen === 1 && instellingen.laadpaal !== null && instellingen.laadpaal > 7.4) {
      opmerkingen.push(`Een laadpaal van ${komma(instellingen.laadpaal)} kW vraagt drie fasen: op één fase laadt hij hoogstens 7,4 kW.`);
    }
    const laadstroom = laadpaalVoor(laadkw, instellingen.fasen).beveiliging.ampere;
    if (laadstroom >= instellingen.stroom) {
      opmerkingen.push(
        `De laadpaal vraagt ${laadstroom} A, evenveel als of meer dan de aansluiting van ${instellingen.stroom} A: vraag een grotere aansluiting aan, of laat de laadpaal trager laden.`,
      );
    } else if (laadstroom > instellingen.stroom * 0.6) {
      opmerkingen.push(
        `De laadpaal neemt ${laadstroom} van de ${instellingen.stroom} A van de aansluiting: laat hem sturen op wat de digitale meter meet, zodat de hoofdschakelaar niet afslaat als ook de kookplaat en de warmtepomp draaien.`,
      );
    }
    opmerkingen.push(
      `Met het capaciteitstarief betaal je voor je hoogste kwartierpiek van de maand: laat ${instellingen.domotica === "knx" ? "Home Assistant" : "de laadpaal of een energiebeheerder"} het laden sturen op de P1-poort van de digitale meter.`,
    );
  }
  if (domotica?.knx && domotica.knx.lijnen > 1) {
    opmerkingen.push(
      `${domotica.knx.toestellen} KNX-toestellen, meer dan ${KNX_PER_LIJN} op één lijn: de app rekent met ${domotica.knx.lijnen} lijnen, elk met een voeding en een IP-router.`,
    );
  }
  if (domotica?.knx?.buskabel && domotica.knx.buskabel / domotica.knx.lijnen > 1000) {
    opmerkingen.push("Meer dan 1000 m buskabel op één lijn: verdeel de toestellen over meer lijnen.");
  }

  const verdeelkast = verdeelkastVan(kringen, differentielen, instellingen);

  // De kabels per soort: van de kringen, de domotica (drukknoppen en melders) en het netwerk.
  const perSoort = new Map<string, number>();
  const tel = (soort: string, lengte: number | null) => {
    if (lengte !== null && lengte > 0) perSoort.set(soort, (perSoort.get(soort) ?? 0) + lengte);
  };
  for (const k of kringen) tel(k.kabel.replace(/ per .*$/, "").replace(/, in de grond.*$/, ""), k.kabellengte);
  for (const k of domotica?.kabels ?? []) if (k.soort !== "XVB 3G1,5" && k.soort !== "XVB 4G1,5") tel(k.soort, k.lengte);
  tel("UTP cat. 6", netwerk.kabellengte);

  return {
    instellingen,
    kast,
    kringen,
    differentielen,
    verdeelkast,
    domotica,
    netwerk,
    kabels: [...perSoort].map(([soort, lengte]) => ({ soort, lengte })).sort((a, b) => a.soort.localeCompare(b.soort, "nl")),
    zonnepanelen: kwp > 0 ? { panelen, kwp } : null,
    opmerkingen,
  };
}

/** Spots en ledstrips in één ruimte tellen samen als één: wat er te veel geteld is. */
function spotsTeVeel(leden: readonly Verbruiker[]): number {
  const groepen = new Map<string, number>();
  for (const lid of leden) if (lid.groep) groepen.set(lid.groep, (groepen.get(lid.groep) ?? 0) + 1);
  return [...groepen.values()].reduce((som, n) => som + n - 1, 0);
}

/** Rijen van 13 modules, met een vijfde vrij voor later (minstens 4). */
function kastVan(regels: Moduleregel[]): Kast {
  const modules = regels.reduce((som, r) => som + r.aantal * r.breedte, 0);
  const reserve = Math.max(4, Math.ceil(modules * 0.2));
  return { regels: regels.filter((r) => r.aantal > 0), modules, reserve, rijen: Math.max(1, Math.ceil((modules + reserve) / 13)) };
}

function verdeelkastVan(kringen: readonly Kring[], differentielen: readonly Differentieel[], instellingen: Techniekinstellingen): Kast {
  const vier = instellingen.fasen === 3;
  const automaten = (polen: Beveiliging["polen"]) => kringen.filter((k) => k.beveiliging.polen === polen).length;
  return kastVan([
    { wat: `Algemene schakelaar met differentieel 300 mA type A, ${differentielen[0].polen} ${differentielen[0].ampere} A`, aantal: 1, breedte: vier ? 4 : 2 },
    { wat: "Differentieel 30 mA type A, 2P 40 A", aantal: differentielen.filter((d) => d.nummer > 0 && d.type === "A").length, breedte: 2 },
    ...(["4P", "2P"] as const).map((polen) => ({
      wat: `Differentieel 30 mA voor de laadpaal, ${polen} 40 A`,
      aantal: differentielen.filter((d) => d.type === "A of B" && d.polen === polen).length,
      breedte: polen === "4P" ? 4 : 2,
    })),
    { wat: "Automaat 1P+N", aantal: automaten("1P+N"), breedte: 1 },
    { wat: "Automaat 3P+N", aantal: automaten("3P+N"), breedte: 4 },
    { wat: `Overspanningsbeveiliging, ${vier ? "4P" : "2P"}`, aantal: 1, breedte: vier ? 4 : 2 },
  ]);
}

const LICHT = new Set(["lichtpunt", "wandlicht", "inbouwspot", "buitenlicht"]);
/** Melders die bij KNX op de bus zitten. Een waterlekmelder en een deurbel komen op een binaire ingang. */
const BUSMELDERS = new Set(["aanwezigheid", "temperatuur", "co2", "thermostaat"]);
const MELDERS = new Set([...BUSMELDERS, "waterlek", "deurbel"]);
const KNOPPEN = new Set(["drukknop", "schakelaar", "dimmer", "zonwering_bediening"]);

/** Hoeveel toestellen een KNX-lijn hoogstens heeft, met haar IP-router. */
export const KNX_PER_LIJN = 64;

/** De buskabel van KNX, groen, doorgelust van toestel tot toestel. */
export const KNX_BUSKABEL = "KNX-buskabel EIB-Y(St)Y 2×2×0,8";

/**
 * De domotica, per ruimte: de uitgangen (een relais of een dimmer per
 * lichtgroep, een ledsturing per ledstrip, een motoruitgang per rolluik) en
 * de ingangen (drukknoppen en melders).
 * - KNX: de drukknoppen en de meeste melders zitten op de buskabel, van
 *   toestel tot toestel; de actoren zitten in de kast, met de modules van
 *   gewone KNX-actoren. Een IP-router per lijn koppelt Home Assistant.
 * - Een ander systeem: een ruwe schatting los van het merk, met een kabel per
 *   ingang naar de kast.
 */
function domoticaVan(invoer: Techniekinvoer, plaats: Kastplaats | null, verdiepingen: readonly Techniekverdieping[], systeem: "knx" | "ander"): Domotica {
  const kastplek = plekVan(plaats);
  const perRuimte: Domotica["perRuimte"] = [];
  const uitgangen: { soort: "XVB 3G1,5" | "XVB 4G1,5"; plek: Plek }[] = [];
  // Een ander systeem: een kabel per drukknop en per melder. KNX: een toestel op de bus, of een contact op een binaire ingang.
  const ingangen: Plek[] = [];
  const bus: Plek[] = [];
  const binair: Plek[] = [];
  for (const v of verdiepingen) {
    const perId = new Map<number | null, Punt[]>();
    for (const p of invoer.punten.filter((punt) => punt.verdieping_id === v.id)) {
      const id = ruimteVan(p, v.ruimtes);
      perId.set(id, [...(perId.get(id) ?? []), p]);
    }
    for (const [id, eigen] of perId) {
      const r = { verdieping: v.naam, ruimte: v.ruimtes.find((x) => x.id === id)?.naam ?? "Buiten of zonder ruimte", relais: 0, dimmers: 0, led: 0, motoren: 0, drukknoppen: 0, melders: 0 };
      // Met een dimmer in de ruimte worden haar lichtpunten gedimd.
      const dimbaar = eigen.some((p) => p.soort === "dimmer");
      const plek = (p: Punt): Plek => ({ verdiepingId: v.id, x: p.x_m, y: p.y_m });
      for (const p of eigen) {
        if (LICHT.has(p.soort) && p.soort !== "inbouwspot") {
          // Een lichtpunt is één uitgang, ook met meer lampen: die gaan samen aan.
          if (dimbaar && p.soort !== "buitenlicht") r.dimmers++;
          else r.relais++;
          uitgangen.push({ soort: "XVB 3G1,5", plek: plek(p) });
        } else if (p.soort === "ledstrip") {
          r.led++;
          uitgangen.push({ soort: "XVB 3G1,5", plek: plek(p) });
        } else if (p.soort === "rolluik") {
          r.motoren += p.aantal;
          for (let i = 0; i < p.aantal; i++) uitgangen.push({ soort: "XVB 4G1,5", plek: plek(p) });
        } else if (KNOPPEN.has(p.soort)) {
          r.drukknoppen += p.aantal;
          // Bij KNX is een drukknop met meer knoppen op één plaats één toestel.
          bus.push(plek(p));
          for (let i = 0; i < p.aantal; i++) ingangen.push(plek(p));
        } else if (MELDERS.has(p.soort)) {
          r.melders += p.aantal;
          for (let i = 0; i < p.aantal; i++) {
            (BUSMELDERS.has(p.soort) ? bus : binair).push(plek(p));
            ingangen.push(plek(p));
          }
        }
      }
      // De spots van een ruimte gaan samen aan: één uitgang.
      const spots = eigen.filter((p) => p.soort === "inbouwspot");
      if (spots.length > 0) {
        if (dimbaar) r.dimmers++;
        else r.relais++;
        uitgangen.push({ soort: "XVB 3G1,5", plek: plek(spots[0]) });
      }
      if (r.relais + r.dimmers + r.led + r.motoren + r.drukknoppen + r.melders > 0) perRuimte.push(r);
    }
  }
  const som = (veld: "relais" | "dimmers" | "led" | "motoren" | "drukknoppen" | "melders") => perRuimte.reduce((s, r) => s + r[veld], 0);
  const [relais, dimmers, led, motoren, drukknoppen, melders] = [som("relais"), som("dimmers"), som("led"), som("motoren"), som("drukknoppen"), som("melders")];
  const uitgangkabels = (["XVB 3G1,5", "XVB 4G1,5"] as const).flatMap((soort) => {
    const eigen = uitgangen.filter((k) => k.soort === soort);
    return eigen.length > 0 ? [{ soort, aantal: eigen.length, lengte: sterlengte(kastplek, eigen.map((k) => k.plek), verdiepingen) }] : [];
  });
  const basis = { plaats, relais, dimmers, led, motoren, drukknoppen, melders, perRuimte };

  if (systeem === "knx") {
    // De modules van gewone KNX-actoren op een DIN-rail: ze verschillen wat per merk.
    const actoren = {
      schakel: Math.ceil(relais / 12),
      dim: Math.ceil(dimmers / 4),
      led: Math.ceil(led / 4),
      jaloezie: Math.ceil(motoren / 8),
      binair: Math.ceil(binair.length / 4),
    };
    const zonderRouters = bus.length + actoren.schakel + actoren.dim + actoren.led + actoren.jaloezie + actoren.binair;
    const lijnen = Math.max(1, Math.ceil(zonderRouters / (KNX_PER_LIJN - 1)));
    const buskabel = bus.length > 0 ? doorlussen(kastplek, bus, verdiepingen).lengte : null;
    return {
      systeem,
      ...basis,
      knx: { toestellen: zonderRouters + lijnen, lijnen, buskabel },
      kast: kastVan([
        { wat: "KNX-voeding 640 mA, met smoorspoel", aantal: lijnen, breedte: 4 },
        { wat: "KNX IP-router, naar Home Assistant", aantal: lijnen, breedte: 2 },
        { wat: "Schakelactor 12 kanalen, 16 A", aantal: actoren.schakel, breedte: 8 },
        { wat: "Dimactor 4 kanalen, universeel", aantal: actoren.dim, breedte: 4 },
        { wat: "Led-dimactor 4 kanalen, 24 V", aantal: actoren.led, breedte: 4 },
        { wat: "Voeding 24 V voor de ledstrips", aantal: actoren.led, breedte: 4 },
        { wat: "Jaloezieactor 8 kanalen, 230 V", aantal: actoren.jaloezie, breedte: 8 },
        { wat: "Binaire ingang 4 kanalen", aantal: actoren.binair, breedte: 2 },
      ]),
      kabels: [
        ...uitgangkabels,
        ...(bus.length > 0 ? [{ soort: KNX_BUSKABEL, aantal: bus.length, lengte: buskabel }] : []),
        ...(binair.length > 0 ? [{ soort: "Signaalkabel naar een binaire ingang", aantal: binair.length, lengte: sterlengte(kastplek, binair, verdiepingen) }] : []),
      ],
    };
  }

  // Een ruwe schatting: elk systeem heeft zijn eigen modules.
  return {
    systeem,
    ...basis,
    knx: null,
    kast: kastVan([
      { wat: "Sturing, voeding en netwerk", aantal: 1, breedte: 10 },
      { wat: "Schakelactor, 8 uitgangen", aantal: Math.ceil(relais / 8), breedte: 4 },
      { wat: "Dimactor, 4 kanalen", aantal: Math.ceil(dimmers / 4), breedte: 4 },
      { wat: "Ledsturing, 4 kanalen", aantal: Math.ceil(led / 4), breedte: 4 },
      { wat: "Rolluikactor, 4 motoren", aantal: Math.ceil(motoren / 4), breedte: 4 },
      { wat: "Ingangen, 8 per module", aantal: Math.ceil((drukknoppen + melders) / 8), breedte: 4 },
    ]),
    kabels: [...uitgangkabels, ...(ingangen.length > 0 ? [{ soort: "UTP of buskabel", aantal: ingangen.length, lengte: sterlengte(kastplek, ingangen, verdiepingen) }] : [])],
  };
}

/** Wat een netwerkkabel krijgt: de punten, en de toestellen die op het netwerk gaan. */
const NETWERKPUNTEN: Record<string, { wat: string; poe: boolean }> = {
  netwerk: { wat: "Netwerkaansluitingen", poe: false },
  tv: { wat: "Tv-aansluitingen", poe: false },
  wifi: { wat: "Wifi-toegangspunten", poe: true },
  camera: { wat: "Camera's", poe: true },
  deurbel: { wat: "Deurbel of parlofoon", poe: true },
};

/** Een poort op de netwerkkast die niet van een punt komt: een toestel, de domotica, Home Assistant, de digitale meter. */
interface Netwerkpoort {
  wat: string;
  aantal: number;
  /** Waar de kabel naartoe loopt; null: in de kast zelf, of nog niet op het plan. */
  plek: Plek | null;
}

/** De kringen waarvan het toestel een netwerkkabel krijgt. */
const NETWERKKRINGEN = new Set<Kringsoort>(["laadpaal", "omvormer", "batterij", "warmtepomp", "ventilatie"]);

/** De regel van de toestellen bij de poorten van de netwerkkast. */
const TOESTELPOORTEN = "Toestellen: laadpaal, omvormer, batterij, warmtepomp, ventilatie";

/** De gewone hoogtes van een netwerkkast aan de muur, in rackeenheden. */
const RACKHOOGTES = [6, 9, 12, 15, 18, 22];

function netwerkVan(invoer: Techniekinvoer, plaats: Kastplaats | null, verdiepingen: readonly Techniekverdieping[], extra: readonly Netwerkpoort[]): Netwerk {
  const kastplek = plekVan(plaats);
  const poorten = new Map<string, { wat: string; aantal: number; poe: boolean }>();
  const perRuimte = new Map<string, Netwerk["perRuimte"][number]>();
  const plekken: Plek[] = [];
  const voeg = (wat: string, poe: boolean, aantal: number, plek: Plek | null, ruimte: { verdieping: string; ruimte: string } | null) => {
    const huidig = poorten.get(wat) ?? { wat, aantal: 0, poe };
    huidig.aantal += aantal;
    poorten.set(wat, huidig);
    if (plek) for (let i = 0; i < aantal; i++) plekken.push(plek);
    if (ruimte) {
      const sleutel = `${ruimte.verdieping}:${ruimte.ruimte}`;
      const r = perRuimte.get(sleutel) ?? { ...ruimte, aantal: 0, poe: 0 };
      r.aantal += aantal;
      if (poe) r.poe += aantal;
      perRuimte.set(sleutel, r);
    }
  };
  for (const v of verdiepingen) {
    for (const p of invoer.punten.filter((punt) => punt.verdieping_id === v.id)) {
      const soort = NETWERKPUNTEN[p.soort];
      if (!soort) continue;
      const ruimte = v.ruimtes.find((r) => r.id === ruimteVan(p, v.ruimtes))?.naam ?? "Buiten of zonder ruimte";
      voeg(soort.wat, soort.poe, p.aantal, { verdiepingId: v.id, x: p.x_m, y: p.y_m }, { verdieping: v.naam, ruimte });
    }
  }
  for (const poort of extra) voeg(poort.wat, false, poort.aantal, poort.plek, null);
  const lijst = [...poorten.values()];
  const totaal = lijst.reduce((s, p) => s + p.aantal, 0);
  const poe = lijst.filter((p) => p.poe).reduce((s, p) => s + p.aantal, 0);
  const patchpanelen = totaal === 0 ? 0 : Math.ceil((totaal * 1.2) / 24);
  // Poorten op de switch: elke kabel, en twee naar de router en de domotica.
  const switchpoorten = totaal === 0 ? 0 : totaal + 2 <= 24 ? 24 : totaal + 2 <= 48 ? 48 : Math.ceil((totaal + 2) / 48) * 48;
  // Een patchpaneel en een kabelgeleider per 24, de switch, de router, een plank voor de modem, een stekkerdoos en twee vrij.
  const eenheden = totaal === 0 ? 0 : patchpanelen * 2 + Math.ceil(switchpoorten / 48) + 1 + 1 + 1 + 2;
  const hoogte = totaal === 0 ? 0 : (RACKHOOGTES.find((h) => h >= eenheden) ?? Math.ceil(eenheden / 3) * 3);
  const lengtes = kastplek ? plekken.map((p) => kabelafstand(kastplek, p, verdiepingen)) : [];
  return {
    plaats,
    poorten: lijst,
    perRuimte: [...perRuimte.values()],
    totaal,
    poe,
    patchpanelen,
    switchpoorten,
    hoogte,
    kabellengte: !kastplek || lengtes.some((l) => l === null) ? null : Math.ceil(lengtes.reduce<number>((s, l) => s + (l ?? 0), 0) * 1.1),
    telang: lengtes.filter((l) => l !== null && l * 1.1 > 90).length,
  };
}
