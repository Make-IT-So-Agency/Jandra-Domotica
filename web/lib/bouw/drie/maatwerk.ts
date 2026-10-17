import { deelmateriaal, type Deelmateriaal } from "./delen";

/**
 * Maatwerk: kasten op maat en de keuken, zoals de schrijnwerker of de
 * keukenbouwer ze tekent. Een stuk bij Inrichten krijgt een indeling:
 * - een kast: de fronten, een open vak met legplanken, een nis (zoals een
 *   koffiehoek) en een plint;
 * - de onderkasten en het eiland: deuren of lades, de kookplaat, de spoelbak,
 *   de vaatwasser, het werkblad, de spatwand, een overstek en wangen;
 * - een kolomkast: een oven, twee compacte ovens of de koelkast.
 * Een tweede materiaal, het blad, ligt op het werkblad, de spatwand, de wangen
 * en de achterkant van een nis; het eigen materiaal van het stuk op de
 * fronten en het corpus.
 *
 * Puur, met tests. De browser tekent de delen (stukken-scene.ts), de server
 * bewaart de indeling (bouw_objecten.indeling), en Technieken telt de
 * toestellen.
 *
 * De delen staan in het assenstelsel van het stuk: x van -breedte/2 (links)
 * tot +breedte/2, y van 0 (de onderkant) tot de hoogte, z van -diepte/2 (de
 * rug) tot +diepte/2 (de voorkant).
 */

/** De kleur van een werkblad zonder eigen blad. */
export const STANDAARDBLAD = "#6b6259";

export type Plek = "links" | "midden" | "rechts";
export const PLEKKEN: readonly Plek[] = ["links", "midden", "rechts"];
export const PLEKNAMEN: Record<Plek, string> = { links: "Links", midden: "In het midden", rechts: "Rechts" };
/** Waar het midden van een kookplaat of spoelbak komt, als deel van de breedte van de kasten. */
const PLEKDEEL: Record<Plek, number> = { links: 0.25, midden: 0.5, rechts: 0.75 };

export type Toestel = "oven" | "compact" | "twee" | "koelkast";
export const TOESTELLEN: readonly Toestel[] = ["oven", "compact", "twee", "koelkast"];
export const TOESTELNAMEN: Record<Toestel, string> = {
  oven: "Een oven (60 cm hoog)",
  compact: "Een compacte oven (45 cm)",
  twee: "Twee compacte ovens",
  koelkast: "Een koelkast",
};

export type Kant = "links" | "rechts";
export type Overstekkant = Kant | "achter";
export const OVERSTEKNAMEN: Record<Overstekkant, string> = { links: "Links", rechts: "Rechts", achter: "Achteraan" };

export interface Indeling {
  /** Kast, onderkasten: hoeveel fronten naast elkaar (zonder het open vak). */
  fronten?: number;
  /** Kast: een open vak met legplanken, aan een kant. */
  open?: { kant: Kant; breedte: number; planken: number } | null;
  /** Kast: een nis over de fronten van..tot (vanaf 1, van links), van onder tot boven boven de vloer, met een legger. */
  nis?: { van: number; tot: number; onder: number; boven: number; legger: boolean } | null;
  /** Kast: een plint onderaan, in meter; 0 zonder. */
  plint?: number;
  /** Kolomkast: een toestel, en zijn onderkant boven de vloer. */
  toestel?: Toestel | null;
  toestelhoogte?: number;
  /** Onderkasten: rijen lades; 0 of 1 zijn deuren. */
  lades?: number;
  kookplaat?: Plek | null;
  spoelbak?: Plek | null;
  vaatwasser?: boolean;
  /** Onderkasten: de spatwand boven het werkblad, in meter; 0 zonder. */
  spatwand?: number;
  /** De dikte van het werkblad, in meter. */
  blad?: number;
  /** Eiland: het werkblad steekt aan een kant uit, zonder kasten eronder (voor barkrukken). */
  overstek?: { kant: Overstekkant; lengte: number } | null;
  /** Eiland: het werkblad loopt aan de uiteinden door tot op de vloer. */
  wangen?: boolean;
  /** Het werkblad, de spatwand, de wangen en de achterkant van een nis. Leeg: het werkblad van de groep. */
  bladmateriaal?: Deelmateriaal | null;
}

const getal = (ruw: unknown, min: number, max: number): number | null =>
  typeof ruw === "number" && Number.isFinite(ruw) && ruw >= min && ruw <= max ? ruw : null;
const geheel = (ruw: unknown, min: number, max: number): number | null => {
  const g = getal(ruw, min, max);
  return g !== null && Number.isInteger(g) ? g : null;
};
const cm = (waarde: number) => Math.round(waarde * 100) / 100;
const mm = (waarde: number) => Math.round(waarde * 1000) / 1000;
const isPlek = (ruw: unknown): ruw is Plek => PLEKKEN.includes(ruw as Plek);

/**
 * Een indeling zoals de browser ze stuurt of de databank ze gaf, nagekeken en
 * afgerond. Wat niet klopt, valt weg; zonder iets geldigs: null. De sleutels
 * staan altijd in dezelfde volgorde, zodat bewaren ziet of er iets veranderde.
 */
export function schoneIndeling(ruw: unknown): Indeling | null {
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) return null;
  const i = ruw as Record<string, unknown>;
  const uit: Indeling = {};
  const fronten = geheel(i.fronten, 1, 20);
  if (fronten !== null) uit.fronten = fronten;
  if (i.open && typeof i.open === "object") {
    const o = i.open as Record<string, unknown>;
    const breedte = getal(o.breedte, 0.15, 2);
    const planken = geheel(o.planken, 0, 12);
    if ((o.kant === "links" || o.kant === "rechts") && breedte !== null && planken !== null) uit.open = { kant: o.kant, breedte: cm(breedte), planken };
  }
  if (i.nis && typeof i.nis === "object") {
    const n = i.nis as Record<string, unknown>;
    const van = geheel(n.van, 1, 20);
    const tot = geheel(n.tot, 1, 20);
    const onder = getal(n.onder, 0, 3);
    const boven = getal(n.boven, 0, 3.5);
    if (van !== null && tot !== null && van <= tot && onder !== null && boven !== null && boven - onder >= 0.15) {
      uit.nis = { van, tot, onder: cm(onder), boven: cm(boven), legger: n.legger === true };
    }
  }
  const plint = getal(i.plint, 0, 0.3);
  if (plint !== null) uit.plint = cm(plint);
  if (TOESTELLEN.includes(i.toestel as Toestel)) uit.toestel = i.toestel as Toestel;
  const toestelhoogte = getal(i.toestelhoogte, 0, 2.2);
  if (toestelhoogte !== null) uit.toestelhoogte = cm(toestelhoogte);
  const lades = geheel(i.lades, 0, 5);
  if (lades !== null) uit.lades = lades;
  if (isPlek(i.kookplaat)) uit.kookplaat = i.kookplaat;
  if (isPlek(i.spoelbak)) uit.spoelbak = i.spoelbak;
  if (i.vaatwasser === true) uit.vaatwasser = true;
  const spatwand = getal(i.spatwand, 0, 1.5);
  if (spatwand !== null) uit.spatwand = cm(spatwand);
  const blad = getal(i.blad, 0.006, 0.1);
  if (blad !== null) uit.blad = mm(blad);
  if (i.overstek && typeof i.overstek === "object") {
    const o = i.overstek as Record<string, unknown>;
    const lengte = getal(o.lengte, 0.1, 1.5);
    if ((o.kant === "links" || o.kant === "rechts" || o.kant === "achter") && lengte !== null) uit.overstek = { kant: o.kant, lengte: cm(lengte) };
  }
  if (i.wangen === true) uit.wangen = true;
  const bladmateriaal = deelmateriaal(i.bladmateriaal);
  if (bladmateriaal) uit.bladmateriaal = bladmateriaal;
  return Object.keys(uit).length > 0 ? uit : null;
}

// ---------------------------------------------------------------------------
// De delen in 3D
// ---------------------------------------------------------------------------

/**
 * Wat een deel is, en dus welk materiaal het krijgt:
 * - front, corpus, plint, binnen, plank: het eigen materiaal (of de kleur van de groep);
 * - blad, nisrug: het blad;
 * - naad, greep, sokkel: donker; led: licht; kookplaat, spoelbak, kraan, toestel, scherm: zoals het toestel.
 */
export type Rol =
  | "corpus"
  | "front"
  | "naad"
  | "greep"
  | "plint"
  | "binnen"
  | "plank"
  | "nisrug"
  | "led"
  | "blad"
  | "sokkel"
  | "kookplaat"
  | "spoelbak"
  | "kraan"
  | "toestel"
  | "scherm";

export interface Blok {
  rol: Rol;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface Maat {
  breedte: number;
  diepte: number;
  hoogte: number;
}

/** De helft van de spleet tussen twee fronten. */
const NAAD = 0.003;
/** De dikte van een front. */
const FRONT = 0.02;
const binnen = (waarde: number, min: number, max: number) => Math.max(min, Math.min(max, waarde));

function verzamel() {
  const delen: Blok[] = [];
  const blok = (rol: Rol, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    if (x1 - x0 > 1e-3 && y1 - y0 > 1e-3 && z1 - z0 > 1e-3) delen.push({ rol, x0, x1, y0, y1, z0, z1 });
  };
  return { delen, blok };
}

/** Hoeveel fronten een kast krijgt zonder indeling: een deur per halve meter. */
const standaardFronten = (breedte: number, per: number) => Math.max(1, Math.min(20, Math.round(breedte / per) || 1));

/**
 * Een kast: het corpus met fronten tot tegen elkaar, een greep om en om, een
 * plint, een open vak met legplanken en een nis met een legger en licht.
 * Achter de fronten ligt een donkere strook: die schijnt door de spleten.
 */
export function kastdelen(maat: Maat, indeling: Indeling | null): Blok[] {
  const { breedte: w, diepte: d, hoogte: h } = maat;
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];
  const ind = indeling ?? {};
  const { delen, blok } = verzamel();
  const plint = binnen(ind.plint ?? 0, 0, h / 3);
  const open = ind.open && ind.open.breedte <= w - 0.15 ? ind.open : null;
  const [gx0, gx1] = open ? (open.kant === "links" ? [x0 + open.breedte, x1] : [x0, x1 - open.breedte]) : [x0, x1];
  const aantal = ind.fronten ?? standaardFronten(gx1 - gx0, 0.5);
  const fw = (gx1 - gx0) / aantal;
  const ruw = ind.nis && ind.nis.van <= aantal ? ind.nis : null;
  const nis = ruw
    ? { ...ruw, tot: Math.min(ruw.tot, aantal), onder: Math.max(plint + 0.05, ruw.onder), boven: Math.min(h - 0.05, ruw.boven) }
    : null;
  const metNis = nis && nis.boven - nis.onder >= 0.15 ? nis : null;
  const [nx0, nx1] = metNis ? [gx0 + (metNis.van - 1) * fw, gx0 + metNis.tot * fw] : [gx0, gx0];
  const voor = z1 - FRONT - 0.002;

  if (plint > 0) blok("plint", x0 + 0.01, x1 - 0.01, 0, plint, z0, z1 - 0.05);
  if (metNis) {
    blok("corpus", gx0, nx0, plint, h, z0, voor);
    blok("corpus", nx1, gx1, plint, h, z0, voor);
    blok("corpus", nx0, nx1, plint, metNis.onder, z0, voor);
    blok("corpus", nx0, nx1, metNis.boven, h, z0, voor);
    // De nis: de achterkant en de bodem in het blad, de zijkanten en de bovenkant binnen, een legger, en licht onder de bovenkant.
    const t = 0.018;
    blok("nisrug", nx0, nx1, metNis.onder, metNis.boven, z0, z0 + t);
    blok("blad", nx0, nx1, metNis.onder, metNis.onder + 0.02, z0 + t, z1);
    blok("binnen", nx0, nx0 + t, metNis.onder + 0.02, metNis.boven, z0 + t, z1);
    blok("binnen", nx1 - t, nx1, metNis.onder + 0.02, metNis.boven, z0 + t, z1);
    blok("binnen", nx0, nx1, metNis.boven - t, metNis.boven, z0 + t, z1);
    if (metNis.legger) {
      const y = metNis.onder + (metNis.boven - metNis.onder) * 0.55;
      blok("plank", nx0 + t, nx1 - t, y - 0.014, y + 0.014, z0 + t, z1 - 0.06);
    }
    blok("led", nx0 + 0.04, nx1 - 0.04, metNis.boven - t - 0.006, metNis.boven - t, z1 - 0.12, z1 - 0.1);
  } else {
    blok("corpus", gx0, gx1, plint, h, z0, voor);
  }
  // De donkere strook achter de fronten, maar niet voor de nis.
  if (metNis) {
    blok("naad", gx0, nx0, plint, h, voor, z1 - FRONT);
    blok("naad", nx1, gx1, plint, h, voor, z1 - FRONT);
    blok("naad", nx0, nx1, plint, metNis.onder, voor, z1 - FRONT);
    blok("naad", nx0, nx1, metNis.boven, h, voor, z1 - FRONT);
  } else {
    blok("naad", gx0, gx1, plint, h, voor, z1 - FRONT);
  }

  for (let i = 0; i < aantal; i++) {
    const fx0 = gx0 + i * fw + NAAD;
    const fx1 = gx0 + (i + 1) * fw - NAAD;
    const inNis = metNis !== null && i >= metNis.van - 1 && i < metNis.tot;
    const hoogtes: [number, number][] = inNis ? [[plint + NAAD, metNis.onder - NAAD], [metNis.boven + NAAD, h - NAAD]] : [[plint + NAAD, h - NAAD]];
    for (const [fy0, fy1] of hoogtes) {
      if (fy1 - fy0 < 0.05) continue;
      blok("front", fx0, fx1, fy0, fy1, z1 - FRONT, z1);
      // Een uitgefreesde greep aan de kant waar de deur opengaat, om en om.
      if (fy1 - fy0 >= 0.25) {
        const gx = i % 2 === 0 ? fx1 - 0.025 : fx0 + 0.005;
        const gy = fy0 + (fy1 - fy0) * 0.45;
        blok("greep", gx, gx + 0.02, gy, gy + Math.min(0.15, (fy1 - fy0) / 4), z1, z1 + 0.003);
      }
    }
  }

  if (open) {
    const [ox0, ox1] = open.kant === "links" ? [x0, x0 + open.breedte] : [x1 - open.breedte, x1];
    const t = 0.02;
    blok("binnen", ox0, ox1, plint, h, z0, z0 + t);
    blok("plank", ox0, ox0 + t, plint, h, z0 + t, z1);
    blok("plank", ox1 - t, ox1, plint, h, z0 + t, z1);
    blok("plank", ox0 + t, ox1 - t, plint, plint + t, z0 + t, z1);
    blok("plank", ox0 + t, ox1 - t, h - t, h, z0 + t, z1);
    for (let k = 1; k <= open.planken; k++) {
      const y = plint + ((h - plint) * k) / (open.planken + 1);
      blok("plank", ox0 + t, ox1 - t, y - 0.014, y + 0.014, z0 + t, z1 - 0.01);
    }
  }
  return delen;
}

/**
 * Onderkasten met een werkblad, of een eiland: een sokkel, de kasten met
 * deuren of lades, het werkblad met de kookplaat en de spoelbak, en tegen de
 * muur de spatwand. Bij een eiland kan het werkblad aan een kant uitsteken,
 * en aan de uiteinden doorlopen tot op de vloer. Zonder indeling: een
 * kookplaat links, zoals vroeger.
 */
export function keukendelen(maat: Maat, indeling: Indeling | null, eiland: boolean): Blok[] {
  const { breedte: w, diepte: d, hoogte: h } = maat;
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];
  const ind: Indeling = indeling ?? (w >= 1.2 ? { kookplaat: "links" } : {});
  const { delen, blok } = verzamel();
  const blad = binnen(ind.blad ?? 0.04, 0.006, Math.min(0.1, h / 2));
  const sokkel = Math.min(0.1, h / 4);
  const wang = ind.wangen && eiland ? Math.max(blad, 0.02) : 0;

  // Waar de kasten staan: zonder het overstek, en binnen de wangen.
  let [kx0, kx1, kz0] = [x0 + wang, x1 - wang, z0];
  const overstek = eiland ? ind.overstek : null;
  if (overstek?.kant === "links") kx0 = Math.min(kx1 - 0.3, x0 + overstek.lengte);
  if (overstek?.kant === "rechts") kx1 = Math.max(kx0 + 0.3, x1 - overstek.lengte);
  if (overstek?.kant === "achter") kz0 = Math.min(z1 - 0.3, z0 + overstek.lengte);

  if (wang > 0) {
    blok("blad", x0, x0 + wang, 0, h, z0, z1);
    blok("blad", x1 - wang, x1, 0, h, z0, z1);
  }
  blok("blad", x0 + wang, x1 - wang, h - blad, h, z0, z1);

  const voor = z1 - 0.04;
  blok("sokkel", kx0 + 0.02, kx1 - 0.02, 0, sokkel, kz0 + 0.02, voor - 0.04);
  blok("corpus", kx0, kx1, sokkel, h - blad, kz0, voor - 0.002);
  blok("naad", kx0, kx1, sokkel, h - blad, voor - 0.002, voor);
  const aantal = ind.fronten ?? standaardFronten(kx1 - kx0, 0.6);
  const rijen = Math.max(1, ind.lades ?? 1);
  const fw = (kx1 - kx0) / aantal;
  const fh = (h - blad - sokkel) / rijen;
  for (let i = 0; i < aantal; i++) {
    for (let r = 0; r < rijen; r++) {
      blok("front", kx0 + i * fw + NAAD, kx0 + (i + 1) * fw - NAAD, sokkel + r * fh + NAAD, sokkel + (r + 1) * fh - NAAD, voor, voor + FRONT);
    }
  }

  // De kookplaat en de spoelbak, in het midden van de diepte van de kasten.
  const zm = (kz0 + voor) / 2;
  const plaats = (plek: Plek) => kx0 + (kx1 - kx0) * PLEKDEEL[plek];
  if (ind.kookplaat) {
    const kw = Math.min(0.8, (kx1 - kx0) * 0.9);
    const kd = Math.min(0.52, (voor - kz0) * 0.85);
    const kx = plaats(ind.kookplaat);
    blok("kookplaat", kx - kw / 2, kx + kw / 2, h, h + 0.006, zm - kd / 2, zm + kd / 2);
  }
  if (ind.spoelbak) {
    const sw = Math.min(0.6, (kx1 - kx0) * 0.8);
    const sd = Math.min(0.42, (voor - kz0) * 0.7);
    const sx = plaats(ind.spoelbak);
    blok("spoelbak", sx - sw / 2, sx + sw / 2, h - 0.003, h + 0.002, zm - sd / 2, zm + sd / 2);
    // De kraan, achter de spoelbak: een buis omhoog en een uitloop naar voren.
    const kz = Math.max(kz0 + 0.02, zm - sd / 2 - 0.05);
    blok("kraan", sx - 0.012, sx + 0.012, h, h + 0.32, kz - 0.012, kz + 0.012);
    blok("kraan", sx - 0.012, sx + 0.012, h + 0.3, h + 0.322, kz, kz + 0.2);
  }
  if (!eiland && (ind.spatwand ?? 0) > 0) blok("blad", x0, x1, h, h + (ind.spatwand ?? 0), z0, z0 + 0.012);
  return delen;
}

/** Een kolomkast: een sokkel, de fronten, en een oven, twee compacte ovens of de koelkast. */
export function kolomdelen(maat: Maat, indeling: Indeling | null): Blok[] {
  const { breedte: w, diepte: d, hoogte: h } = maat;
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];
  const ind = indeling ?? {};
  const { delen, blok } = verzamel();
  const sokkel = Math.min(0.1, h / 4);
  const voor = z1 - FRONT - 0.002;
  blok("sokkel", x0 + 0.02, x1 - 0.02, 0, sokkel, z0, z1 - 0.06);
  blok("corpus", x0, x1, sokkel, h, z0, voor);
  blok("naad", x0, x1, sokkel, h, voor, z1 - FRONT);

  const toestel = ind.toestel ?? null;
  const hoog = toestel === "oven" ? 0.6 : toestel === "compact" ? 0.45 : toestel === "twee" ? 0.9 : 0;
  const onder = hoog > 0 ? binnen(ind.toestelhoogte ?? 0.9, sokkel, Math.max(sokkel, h - hoog)) : 0;
  const ovens: [number, number][] = toestel === "twee" ? [[onder, onder + 0.45], [onder + 0.45, onder + 0.9]] : hoog > 0 ? [[onder, onder + hoog]] : [];
  // De fronten rond de ovens; een koelkast heeft één deur van 178 cm met een kast erboven.
  const grenzen =
    ovens.length > 0
      ? [sokkel, ovens[0][0], ovens[ovens.length - 1][1], h]
      : toestel === "koelkast"
        ? [sokkel, Math.min(h - 0.2, sokkel + 1.8), h]
        : [sokkel, sokkel + (h - sokkel) * 0.6, h];
  const vakken: [number, number][] = ovens.length > 0 ? [[grenzen[0], grenzen[1]], [grenzen[2], grenzen[3]]] : [[grenzen[0], grenzen[1]], [grenzen[1], grenzen[2]]];
  for (const [a, b] of vakken) {
    if (b - a < 0.05) continue;
    blok("front", x0 + NAAD, x1 - NAAD, a + NAAD, b - NAAD, z1 - FRONT, z1);
  }
  for (const [a, b] of ovens) {
    blok("toestel", x0 + 0.01, x1 - 0.01, a + 0.004, b - 0.004, z1 - FRONT, z1);
    blok("scherm", x0 + 0.06, x1 - 0.06, b - 0.07, b - 0.03, z1, z1 + 0.002);
  }
  return delen;
}

/** Een zwevende legger: één plank. */
export function plankdelen(maat: Maat): Blok[] {
  const { breedte: w, diepte: d, hoogte: h } = maat;
  return [{ rol: "front", x0: -w / 2, x1: w / 2, y0: 0, y1: h, z0: -d / 2, z1: d / 2 }];
}

// ---------------------------------------------------------------------------
// De toestellen, voor Technieken
// ---------------------------------------------------------------------------

export type Keukentoestel = "oven" | "kookplaat" | "vaatwasser" | "koelkast";

/** Welke toestellen in een stuk zitten, volgens zijn vorm en indeling: elk krijgt bij Technieken een eigen kring. */
export function toestellenVan(vorm: string | null | undefined, indeling: Indeling | null | undefined): Keukentoestel[] {
  if (!indeling) return [];
  if (vorm === "kolom") {
    if (indeling.toestel === "oven" || indeling.toestel === "compact") return ["oven"];
    if (indeling.toestel === "twee") return ["oven", "oven"];
    if (indeling.toestel === "koelkast") return ["koelkast"];
    return [];
  }
  if (vorm === "keuken") {
    const uit: Keukentoestel[] = [];
    if (indeling.kookplaat) uit.push("kookplaat");
    if (indeling.vaatwasser) uit.push("vaatwasser");
    return uit;
  }
  return [];
}
