/**
 * Een blad uit een PDF lezen: de getekende vlakken en lijnen, en de teksten.
 * Dit is het enige bestand van de omzetting dat pdf.js aanspreekt; de rest
 * werkt op het Blad dat hier uit komt.
 *
 * Werkt in de browser en in Node (de tests). Hoort nooit op de server: daar
 * komt pdf.js niet.
 *
 * Wat pdf.js geeft, is de operatorlijst die het ook gebruikt om te tekenen.
 * Wij volgen de grafische toestand zelf (save, restore, transform) en rekenen
 * elk punt om naar het blad zoals het op het scherm staat: de CTM begint bij
 * viewport.transform, dus met y naar beneden en de rotatie van het blad
 * erin.
 */

import { AnnotationMode, OPS, Util, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { afvlakken } from "./geometrie";
import type { Blad, Boog, Deelpad, Pad, Tekst, Xy } from "./types";

type Matrix = [number, number, number, number, number, number];

/** Codes in de padgegevens van pdf.js 6 (DrawOPS), met hun aantal getallen. */
const VERPLAATS = 0; // x y
const LIJN = 1; // x y
const BOOG = 2; // x1 y1 x2 y2 x y
const KWADRATISCH = 3; // x1 y1 x y
const SLUIT = 4;

const VULLEN = new Set<number>([
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);
const LIJNEN = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);
const SLUITEN = new Set<number>([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
const BEELDEN = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintSolidColorImageMask,
]);

function vermenigvuldig(m: Matrix, n: readonly number[]): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function pas(m: Matrix, x: number, y: number): Xy {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function isMatrix(waarde: unknown): waarde is number[] {
  return (Array.isArray(waarde) || ArrayBuffer.isView(waarde)) && (waarde as ArrayLike<number>).length === 6;
}

function kleur(waarde: unknown): string | null {
  return typeof waarde === "string" && /^#[0-9a-f]{6}$/i.test(waarde) ? waarde.toLowerCase() : null;
}

interface Toestand {
  ctm: Matrix;
  vul: string | null;
  lijn: string | null;
  dikte: number;
}

/** Hoeveel van het blad een afbeelding in de eenheidsvierkant onder deze CTM bedekt. */
function vlakVanEenheid(ctm: Matrix): number {
  return Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
}

function leesPad(args: unknown[], t: Toestand): Pad | null {
  const teken = Number(args[0]);
  const vult = VULLEN.has(teken);
  const lijnt = LIJNEN.has(teken);
  // endPath en dergelijke: een knippad, niets om te tonen.
  if (!vult && !lijnt) return null;

  const gegevens = (args[1] as ArrayLike<number>[] | undefined)?.[0];
  if (!gegevens) return null;

  const delen: Deelpad[] = [];
  const bogen: Boog[] = [];
  let huidig: Deelpad | undefined;
  const nieuwDeel = (p: Xy): Deelpad => {
    const deel: Deelpad = { punten: [p], gesloten: false };
    delen.push(deel);
    return deel;
  };

  for (let i = 0; i < gegevens.length; ) {
    const code = gegevens[i++];
    if (code === VERPLAATS) {
      huidig = nieuwDeel(pas(t.ctm, gegevens[i++], gegevens[i++]));
    } else if (code === LIJN) {
      const p = pas(t.ctm, gegevens[i++], gegevens[i++]);
      if (huidig) huidig.punten.push(p);
      else huidig = nieuwDeel(p);
    } else if (code === BOOG) {
      const p0: Xy = huidig ? huidig.punten[huidig.punten.length - 1] : [0, 0];
      const boog: Boog = {
        p0,
        p1: pas(t.ctm, gegevens[i++], gegevens[i++]),
        p2: pas(t.ctm, gegevens[i++], gegevens[i++]),
        p3: pas(t.ctm, gegevens[i++], gegevens[i++]),
      };
      huidig ??= nieuwDeel(p0);
      bogen.push(boog);
      huidig.punten.push(...afvlakken(boog));
    } else if (code === KWADRATISCH) {
      // Een PDF kent geen kwadratische bogen; pdf.js maakt ze enkel voor
      // lettertypes. Het eindpunt volstaat.
      i += 2;
      const p = pas(t.ctm, gegevens[i++], gegevens[i++]);
      if (huidig) huidig.punten.push(p);
      else huidig = nieuwDeel(p);
    } else if (code === SLUIT) {
      if (huidig) huidig.gesloten = true;
    } else {
      // Onbekende code: de rest van dit pad is niet meer te vertrouwen.
      break;
    }
  }
  if (SLUITEN.has(teken)) for (const deel of delen) deel.gesloten = true;

  const schaal = Math.sqrt(Math.abs(t.ctm[0] * t.ctm[3] - t.ctm[1] * t.ctm[2]));
  return {
    vul: vult ? t.vul : null,
    lijn: lijnt ? t.lijn : null,
    dikte: t.dikte * schaal,
    delen: delen.filter((deel) => deel.punten.length > 1),
    bogen,
  };
}

/**
 * De paden uit een operatorlijst. begin is de matrix van het blad naar het
 * scherm (viewport.transform bij schaal 1).
 */
export function leesPaden(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  begin: readonly number[],
  bladvlak: number,
): { paden: Pad[]; beeldvlak: number } {
  let t: Toestand = { ctm: [...begin] as Matrix, vul: "#000000", lijn: "#000000", dikte: 1 };
  const stapel: Toestand[] = [];
  const paden: Pad[] = [];
  let beeld = 0;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case OPS.save:
      case OPS.beginGroup:
        stapel.push(t);
        break;
      case OPS.restore:
      case OPS.endGroup:
        t = stapel.pop() ?? t;
        break;
      case OPS.paintFormXObjectBegin:
        stapel.push(t);
        if (isMatrix(args[0])) t = { ...t, ctm: vermenigvuldig(t.ctm, Array.from(args[0])) };
        break;
      case OPS.paintFormXObjectEnd:
        t = stapel.pop() ?? t;
        break;
      case OPS.transform:
        if (isMatrix(args)) t = { ...t, ctm: vermenigvuldig(t.ctm, args) };
        break;
      case OPS.setLineWidth:
        t = { ...t, dikte: Number(args[0]) || 0 };
        break;
      case OPS.setGState:
        for (const paar of (args[0] as unknown[][] | undefined) ?? []) {
          if (Array.isArray(paar) && paar[0] === "LW") t = { ...t, dikte: Number(paar[1]) || 0 };
        }
        break;
      case OPS.setFillRGBColor:
        t = { ...t, vul: kleur(args[0]) };
        break;
      case OPS.setStrokeRGBColor:
        t = { ...t, lijn: kleur(args[0]) };
        break;
      case OPS.setFillColorN:
        t = { ...t, vul: kleur(args[0]) ?? "patroon" };
        break;
      case OPS.setStrokeColorN:
        t = { ...t, lijn: kleur(args[0]) ?? "patroon" };
        break;
      case OPS.setFillTransparent:
        t = { ...t, vul: null };
        break;
      case OPS.setStrokeTransparent:
        t = { ...t, lijn: null };
        break;
      case OPS.constructPath: {
        const pad = leesPad(args, t);
        if (pad && pad.delen.length > 0) paden.push(pad);
        break;
      }
      default:
        if (BEELDEN.has(fn)) beeld += vlakVanEenheid(t.ctm);
    }
  }
  return { paden, beeldvlak: bladvlak > 0 ? Math.min(1, beeld / bladvlak) : 0 };
}

/** Een tekst zoals pdf.js hem geeft; enkel wat wij gebruiken. */
interface Tekstitem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTekstitem(item: unknown): item is Tekstitem {
  return typeof item === "object" && item !== null && typeof (item as Tekstitem).str === "string";
}

interface Ruw {
  tekst: string;
  /** Het begin van de basislijn, de richting ervan en de richting naar boven. */
  begin: Xy;
  richting: Xy;
  omhoog: Xy;
  breedte: number;
  hoogte: number;
  grootte: number;
  hoek: number;
}

function alsTekst(ruw: Ruw): Tekst {
  return {
    tekst: ruw.tekst,
    x: ruw.begin[0] + (ruw.richting[0] * ruw.breedte) / 2 + (ruw.omhoog[0] * ruw.hoogte) / 2,
    y: ruw.begin[1] + (ruw.richting[1] * ruw.breedte) / 2 + (ruw.omhoog[1] * ruw.hoogte) / 2,
    breedte: ruw.breedte,
    hoogte: ruw.hoogte,
    grootte: ruw.grootte,
    hoek: ruw.hoek,
  };
}

/**
 * Plakt stukken tekst aan elkaar die op dezelfde regel net na elkaar komen:
 * sommige pakketten schrijven "12,35" en "m²" als twee stukken.
 */
function voegSamen(stukken: Ruw[]): Ruw[] {
  const uit: Ruw[] = [];
  for (const stuk of stukken) {
    const vorig = uit[uit.length - 1];
    if (vorig && Math.abs(vorig.hoek - stuk.hoek) < 1 && Math.abs(vorig.grootte - stuk.grootte) <= vorig.grootte * 0.05) {
      const eind: Xy = [
        vorig.begin[0] + vorig.richting[0] * vorig.breedte,
        vorig.begin[1] + vorig.richting[1] * vorig.breedte,
      ];
      const verschil: Xy = [stuk.begin[0] - eind[0], stuk.begin[1] - eind[1]];
      const langs = verschil[0] * vorig.richting[0] + verschil[1] * vorig.richting[1];
      const dwars = verschil[0] * vorig.omhoog[0] + verschil[1] * vorig.omhoog[1];
      if (Math.abs(dwars) < vorig.grootte * 0.25 && langs > -vorig.grootte * 0.2 && langs < vorig.grootte * 0.35) {
        const spatie = langs > vorig.grootte * 0.15 && !vorig.tekst.endsWith(" ") && !stuk.tekst.startsWith(" ");
        uit[uit.length - 1] = {
          ...vorig,
          tekst: `${vorig.tekst}${spatie ? " " : ""}${stuk.tekst}`,
          breedte: vorig.breedte + langs + stuk.breedte,
        };
        continue;
      }
    }
    uit.push(stuk);
  }
  return uit;
}

/** De teksten van een blad, met hun middelpunt op het scherm. */
export function leesTeksten(items: readonly unknown[], begin: readonly number[]): Tekst[] {
  const stukken: Ruw[] = [];
  for (const item of items) {
    if (!isTekstitem(item) || item.str.trim() === "") continue;
    const m = Util.transform([...begin], item.transform) as number[];
    const hoek = Math.atan2(m[1], m[0]);
    const grootte = Math.hypot(item.transform[2], item.transform[3]);
    stukken.push({
      tekst: item.str.replace(/\s+/g, " "),
      begin: [m[4], m[5]],
      richting: [Math.cos(hoek), Math.sin(hoek)],
      omhoog: [Math.sin(hoek), -Math.cos(hoek)],
      breedte: Math.max(0, item.width),
      hoogte: item.height > 0 ? item.height : grootte,
      grootte,
      hoek: (hoek * 180) / Math.PI,
    });
  }
  return voegSamen(stukken)
    .map((stuk) => ({ ...stuk, tekst: stuk.tekst.trim() }))
    .filter((stuk) => stuk.tekst !== "")
    .map(alsTekst);
}

/** Leest één blad. */
export async function leesBlad(pagina: PDFPageProxy): Promise<Blad> {
  const viewport = pagina.getViewport({ scale: 1 });
  const [lijst, inhoud] = await Promise.all([
    pagina.getOperatorList({ annotationMode: AnnotationMode.DISABLE }),
    pagina.getTextContent(),
  ]);
  const { paden, beeldvlak } = leesPaden(
    lijst.fnArray,
    lijst.argsArray,
    viewport.transform,
    viewport.width * viewport.height,
  );
  return {
    breedte: viewport.width,
    hoogte: viewport.height,
    paden,
    teksten: leesTeksten(inhoud.items, viewport.transform),
    beeldvlak,
  };
}

/** Enkel de teksten van een blad: genoeg om een dossier in te lezen, en veel sneller. */
export async function leesBladteksten(pagina: PDFPageProxy): Promise<{ breedte: number; hoogte: number; teksten: Tekst[] }> {
  const viewport = pagina.getViewport({ scale: 1 });
  const inhoud = await pagina.getTextContent();
  return { breedte: viewport.width, hoogte: viewport.height, teksten: leesTeksten(inhoud.items, viewport.transform) };
}
