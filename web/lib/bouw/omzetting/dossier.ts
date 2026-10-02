import { sleutelVan } from "../invoer";
import type { SoortPlan } from "../types";
import { meestVoorkomend } from "./schaal";
import { leesDatum, leesPeil, leesPlafondhoogte, leesSchaal } from "./teksten";
import type { Tekst } from "./types";

/**
 * Een heel dossier in één keer inlezen: per blad een voorstel voor het plan
 * (titel, soort, gebouw, verdieping) en per gebouw de verdiepingen met hun
 * peil en hoogtes. Puur: de browser leest de teksten van elk blad, deze
 * functie maakt er een voorstel van, en Jan en Sandra kijken het na.
 *
 * Veel architecten zetten een bladcode in het titelblok, zoals
 * BA_woning_P_N_1: de fase (BA, bouwaanvraag), het gebouw, de soort (G gevel,
 * P plan, S snede, I inplanting, D detail, L legende, T terreinprofiel), de
 * toestand (N, nieuw) en het nummer. Zonder bladcode gaat het op de woorden
 * in de titel.
 */

export interface Bladtekst {
  pagina: number;
  teksten: Tekst[];
}

export interface Bladvoorstel {
  pagina: number;
  bladcode: string | null;
  titel: string;
  soort: SoortPlan;
  /** null: het hele project, zoals het inplantingsplan. */
  gebouw: string | null;
  /** Enkel bij een grondplan. */
  verdieping: string | null;
  schaal: number | null;
  vloerpeil: number | null;
  plafondhoogte: number | null;
}

export interface Verdiepingsvoorstel {
  gebouw: string;
  naam: string;
  volgorde: number;
  vloerpeil: number | null;
  plafondhoogte: number | null;
  verdiepingshoogte: number | null;
}

export interface Dossiervoorstel {
  bladen: Bladvoorstel[];
  verdiepingen: Verdiepingsvoorstel[];
  /** De datum die op de meeste bladen staat, als YYYY-MM-DD. */
  datum: string | null;
}

const BLADCODE = /^[A-Za-z]{1,4}_([\p{L}][\p{L}\d-]*)_([A-Za-z])(?:_[A-Za-z])?_\d{1,3}$/u;

/** Soorten die over het hele project gaan, niet over één gebouw. */
const PROJECTBREED = new Set(["I", "L", "T"]);

const PLANWOORDEN =
  /gevel|grondplan|gelijkvloers|verdieping|doorsnede|snede|inplanting|dak|fundering|riolering|legende|terreinprofiel|detail|kelder|zolder|technieken|plan\b/i;

const VERDIEPINGEN: [RegExp, string][] = [
  [/gelijkvloers/i, "Gelijkvloers"],
  [/tweede\s+verdieping|2e\s+verdieping/i, "Tweede verdieping"],
  [/eerste\s+verdieping|1e\s+verdieping/i, "Eerste verdieping"],
  [/dakverdieping/i, "Dakverdieping"],
  [/verdieping/i, "Verdieping"],
  [/zolder/i, "Zolder"],
  [/kelder|souterrain/i, "Kelder"],
];

/** Wat er op een blad staat, als het geen bladcode heeft of de letter niet volstaat. */
function soortUitWoorden(titel: string): SoortPlan {
  if (/gevel/i.test(titel)) return "gevel";
  if (/doorsnede|\bsnede|terreinprofiel/i.test(titel)) return "doorsnede";
  if (/inplanting|situering|liggingsplan/i.test(titel)) return "inplanting";
  if (/fundering|riolering/i.test(titel)) return "funderingsplan";
  if (/\bdak/i.test(titel)) return "dakplan";
  if (/detail/i.test(titel)) return "detail";
  if (/techniek|elektri|hvac|ventilatie/i.test(titel)) return "technieken";
  if (/gelijkvloers|verdieping|grondplan|kelder|zolder/i.test(titel)) return "grondplan";
  return "andere";
}

function soortVan(letter: string | null, titel: string): SoortPlan {
  switch (letter?.toUpperCase()) {
    case "G":
      return "gevel";
    case "S":
    case "T":
      return "doorsnede";
    case "I":
      return "inplanting";
    case "D":
      return "detail";
    case "L":
      return "andere";
    case "P": {
      const soort = soortUitWoorden(titel);
      return soort === "dakplan" || soort === "funderingsplan" || soort === "technieken" ? soort : "grondplan";
    }
    default:
      return soortUitWoorden(titel);
  }
}

/** "FUNDERINGS- en RIOLERINGSPLAN" wordt "Funderings- en rioleringsplan"; "AA'" en "T1" blijven. */
export function gewoneSchrijfwijze(tekst: string): string {
  const woorden = tekst
    .trim()
    .split(/\s+/)
    .map((woord) => (woord.length >= 4 && woord === woord.toUpperCase() && /\p{L}/u.test(woord) ? woord.toLowerCase() : woord));
  const zin = woorden.join(" ");
  return zin.charAt(0).toUpperCase() + zin.slice(1);
}

function metHoofdletter(woord: string): string {
  return woord.charAt(0).toUpperCase() + woord.slice(1).toLowerCase();
}

function titelVan(teksten: Tekst[], weglaten: Set<string>): string {
  const kandidaten = teksten.filter(
    (tekst) =>
      !weglaten.has(sleutelVan(tekst.tekst)) &&
      !BLADCODE.test(tekst.tekst) &&
      leesSchaal(tekst.tekst) === null &&
      leesDatum(tekst.tekst) === null &&
      /\p{L}{3}/u.test(tekst.tekst),
  );
  if (kandidaten.length === 0) return "";
  // De titel is de grootste tekst. Is er een grote tekst met een woord als
  // "gevel" of "grondplan", dan telt die: een logo of projectnaam kan groter zijn.
  const grootste = Math.max(...kandidaten.map((tekst) => tekst.grootte));
  const metPlanwoord = kandidaten.filter((tekst) => PLANWOORDEN.test(tekst.tekst) && tekst.grootte >= grootste * 0.6);
  const maat = metPlanwoord.length > 0 ? Math.max(...metPlanwoord.map((tekst) => tekst.grootte)) : grootste;
  const delen: string[] = [];
  for (const tekst of kandidaten
    .filter((t) => Math.abs(t.grootte - maat) <= maat * 0.05)
    .sort((a, b) => (Math.abs(a.y - b.y) > a.grootte * 0.5 ? a.y - b.y : a.x - b.x))) {
    if (!delen.some((deel) => sleutelVan(deel) === sleutelVan(tekst.tekst))) delen.push(tekst.tekst);
  }
  // Een deel in kleine letters is een ondertitel ("ontworpen toestand"),
  // twee titels in hoofdletters zijn twee tekeningen op één blad.
  return delen.reduce((titel, deel, i) => {
    const gewoon = gewoneSchrijfwijze(deel);
    if (i === 0) return gewoon;
    const verbinding = deel === deel.toUpperCase() ? (i === delen.length - 1 ? " en " : ", ") : " – ";
    return `${titel}${verbinding}${gewoon.charAt(0).toLowerCase()}${gewoon.slice(1)}`;
  }, "");
}

function gewoonsteWaarde(teksten: Tekst[], lees: (tekst: string) => number | null): number | null {
  return meestVoorkomend(teksten.map((tekst) => lees(tekst.tekst)).filter((w): w is number => w !== null));
}

export function stelDossierVoor(bladen: Bladtekst[]): Dossiervoorstel {
  const codes = bladen.map((blad) => {
    const tekst = blad.teksten.find((t) => BLADCODE.test(t.tekst));
    const delen = tekst?.tekst.match(BLADCODE);
    return delen ? { code: tekst!.tekst, gebouw: metHoofdletter(delen[1]), letter: delen[2].toUpperCase() } : null;
  });
  const gebouwnamen = [...new Set(codes.filter((c) => c !== null).map((c) => c!.gebouw))];
  const standaardgebouw =
    meestVoorkomendeTekst(codes.filter((c) => c !== null && !PROJECTBREED.has(c.letter)).map((c) => c!.gebouw)) ?? "Woning";

  const voorstellen: Bladvoorstel[] = bladen.map((blad, i) => {
    const code = codes[i];
    const weglaten = new Set(gebouwnamen.map(sleutelVan));
    const titel = titelVan(blad.teksten, weglaten) || `Blad ${blad.pagina}`;
    const soort = soortVan(code?.letter ?? null, titel);
    // Zonder bladcode: het gebouw dat in de titelteksten staat, anders het gewoonste.
    const genoemd = gebouwnamen.find((naam) => blad.teksten.some((t) => sleutelVan(t.tekst) === sleutelVan(naam)));
    const gebouw = code
      ? PROJECTBREED.has(code.letter)
        ? null
        : code.gebouw
      : soort === "inplanting"
        ? null
        : (genoemd ?? standaardgebouw);
    const vloerpeil = gewoonsteWaarde(blad.teksten, leesPeil);
    let verdieping: string | null = null;
    if (soort === "grondplan") {
      verdieping =
        VERDIEPINGEN.find(([woord]) => woord.test(titel))?.[1] ??
        (vloerpeil === null || vloerpeil === 0 ? "Gelijkvloers" : vloerpeil < 0 ? "Kelder" : "Verdieping");
    }
    return {
      pagina: blad.pagina,
      bladcode: code?.code ?? null,
      titel,
      soort,
      gebouw,
      verdieping,
      schaal: meestVoorkomend(blad.teksten.map((t) => leesSchaal(t.tekst)).filter((n): n is number => n !== null)),
      vloerpeil: soort === "grondplan" ? vloerpeil : null,
      plafondhoogte: soort === "grondplan" ? gewoonsteWaarde(blad.teksten, leesPlafondhoogte) : null,
    };
  });

  return {
    bladen: voorstellen,
    verdiepingen: verdiepingenUit(voorstellen, standaardgebouw),
    datum: meestVoorkomendeTekst(bladen.flatMap((blad) => blad.teksten.map((t) => leesDatum(t.tekst)).filter((d): d is string => d !== null))),
  };
}

function meestVoorkomendeTekst(waarden: string[]): string | null {
  const tellingen = new Map<string, number>();
  for (const waarde of waarden) tellingen.set(waarde, (tellingen.get(waarde) ?? 0) + 1);
  let beste: string | null = null;
  let aantal = 0;
  for (const [waarde, keer] of tellingen) {
    if (keer > aantal) {
      beste = waarde;
      aantal = keer;
    }
  }
  return beste;
}

/** De verdiepingen per gebouw, op peil gesorteerd, met de hoogte tot de verdieping erboven. */
export function verdiepingenUit(bladen: Bladvoorstel[], standaardgebouw = "Woning"): Verdiepingsvoorstel[] {
  const perGebouw = new Map<string, Map<string, Verdiepingsvoorstel>>();
  for (const blad of bladen) {
    if (blad.soort !== "grondplan" || !blad.verdieping) continue;
    const gebouw = blad.gebouw ?? standaardgebouw;
    const lijst = perGebouw.get(sleutelVan(gebouw)) ?? new Map<string, Verdiepingsvoorstel>();
    perGebouw.set(sleutelVan(gebouw), lijst);
    const bestaand = lijst.get(sleutelVan(blad.verdieping));
    if (bestaand) {
      bestaand.vloerpeil ??= blad.vloerpeil;
      bestaand.plafondhoogte ??= blad.plafondhoogte;
    } else {
      lijst.set(sleutelVan(blad.verdieping), {
        gebouw,
        naam: blad.verdieping,
        volgorde: 0,
        vloerpeil: blad.vloerpeil,
        plafondhoogte: blad.plafondhoogte,
        verdiepingshoogte: null,
      });
    }
  }

  const uit: Verdiepingsvoorstel[] = [];
  for (const lijst of perGebouw.values()) {
    const gesorteerd = [...lijst.values()].sort(
      (a, b) => (a.vloerpeil ?? Number.POSITIVE_INFINITY) - (b.vloerpeil ?? Number.POSITIVE_INFINITY),
    );
    gesorteerd.forEach((verdieping, i) => {
      const erboven = gesorteerd[i + 1];
      const hoogte =
        erboven && erboven.vloerpeil !== null && verdieping.vloerpeil !== null ? erboven.vloerpeil - verdieping.vloerpeil : null;
      uit.push({ ...verdieping, volgorde: i, verdiepingshoogte: hoogte !== null && hoogte > 0 ? Math.round(hoogte * 1000) / 1000 : null });
    });
  }
  return uit;
}
