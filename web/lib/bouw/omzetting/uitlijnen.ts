import { sleutelVan } from "../invoer";
import { draai, kaderVan, middenVan, naarHuis, type Kalibratie } from "./geometrie";
import type { Blad, Kader, Xy } from "./types";

/**
 * Een blad op zijn plaats leggen in het assenstelsel van het gebouw, op een
 * blad dat er al ligt: een vorige versie of een andere verdieping. Puur, met
 * tests.
 *
 * Twee manieren, die elkaar aanvullen:
 *
 * - op namen: een nieuwe versie heeft grotendeels dezelfde ruimtes, en het
 *   midden van "leefruimte" ligt dan op dezelfde plaats. De mediaan van die
 *   verschillen is de verschuiving;
 * - op lijnen: de lange, dikke lijnen (de muren) van beide bladen op een
 *   raster, en dan zoeken waar ze het best samenvallen. Met de dunne lijnen
 *   erbij ging het mis op een echt plan (meubels, maten en arcering zijn per
 *   verdieping anders), met enkel de muren niet.
 *
 * Een architect legt de verdiepingen meestal bijna op dezelfde plaats op hun
 * blad; daarom begint het zoeken daar, maar het kijkt tot 3 m ver.
 */

export interface Uitlijning {
  kwartslagen: number;
  dx: number;
  dy: number;
  /** Van 0 (gok) tot 1 (zeker): hoeveel beter de beste plaats is dan de beste andere. */
  zekerheid: number;
  methode: "namen" | "lijnen";
  /** Andere plaatsen die ook goed passen, de beste eerst: om uit te kiezen als het niet klopt. */
  alternatieven: { dx: number; dy: number }[];
}

export type Lijnstuk = [Xy, Xy];

/** Een stuk is lang als het minstens zoveel meter meet. */
const LANG_M = 1;

/** De cellen van het grove en het fijne raster, in meter. */
const GROF = 0.05;
const FIJN = 0.02;

function isDonker(kleur: string | null): boolean {
  if (!kleur || !/^#[0-9a-f]{6}$/.test(kleur)) return false;
  return [1, 3, 5].every((i) => parseInt(kleur.slice(i, i + 2), 16) <= 0x50);
}

/**
 * De lange, dikke donkere lijnen van een blad: de muren. Welke dikte "dik"
 * is, verschilt per tekenpakket; daarom de dikste lijnen die samen minstens
 * een vijfde van alle donkere lijnen uitmaken.
 */
export function muurlijnen(blad: Blad, meterPerPunt: number, gebied: Kader | null): Lijnstuk[] {
  const stukken: { a: Xy; b: Xy; dikte: number; lengte: number }[] = [];
  for (const pad of blad.paden) {
    if (!pad.lijn || !isDonker(pad.lijn) || pad.dikte < 0.1) continue;
    for (const deel of pad.delen) {
      const punten = deel.gesloten ? [...deel.punten, deel.punten[0]] : deel.punten;
      for (let i = 1; i < punten.length; i++) {
        const a = punten[i - 1];
        const b = punten[i];
        if (gebied && !inGebied(a, gebied) && !inGebied(b, gebied)) continue;
        stukken.push({ a, b, dikte: pad.dikte, lengte: Math.hypot(b[0] - a[0], b[1] - a[1]) * meterPerPunt });
      }
    }
  }
  const totaal = stukken.reduce((som, s) => som + s.lengte, 0);
  const diktes = [...new Set(stukken.map((s) => Math.round(s.dikte * 100) / 100))].sort((a, b) => b - a);
  let drempel = 0;
  let opgeteld = 0;
  for (const dikte of diktes) {
    drempel = dikte;
    opgeteld += stukken.filter((s) => Math.round(s.dikte * 100) / 100 === dikte).reduce((som, s) => som + s.lengte, 0);
    if (opgeteld >= totaal / 5) break;
  }
  return stukken.filter((s) => s.dikte >= drempel - 0.005 && s.lengte >= LANG_M).map((s) => [s.a, s.b] as Lijnstuk);
}

function inGebied(p: Xy, gebied: Kader): boolean {
  return p[0] >= gebied.x0 && p[0] <= gebied.x1 && p[1] >= gebied.y0 && p[1] <= gebied.y1;
}

/** Een raster van cellen in meter, met de cellen waar een lijn door loopt. */
interface Raster {
  cel: number;
  x0: number;
  y0: number;
  breedte: number;
  hoogte: number;
  vol: Uint8Array;
  cellen: Int32Array;
}

function maakRaster(stukken: Lijnstuk[], cel: number, kader: Kader, verwijden: boolean): Raster {
  const x0 = Math.floor(kader.x0 / cel) - 2;
  const y0 = Math.floor(kader.y0 / cel) - 2;
  const breedte = Math.ceil(kader.x1 / cel) - x0 + 3;
  const hoogte = Math.ceil(kader.y1 / cel) - y0 + 3;
  const vol = new Uint8Array(breedte * hoogte);
  const cellen: number[] = [];
  const zet = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= breedte || cy >= hoogte) return;
    const i = cy * breedte + cx;
    if (!vol[i]) {
      vol[i] = 1;
      cellen.push(cx, cy);
    }
  };
  for (const [a, b] of stukken) {
    const n = Math.max(1, Math.ceil((Math.hypot(b[0] - a[0], b[1] - a[1]) / cel) * 2));
    for (let j = 0; j <= n; j++) {
      zet(Math.round((a[0] + ((b[0] - a[0]) * j) / n) / cel) - x0, Math.round((a[1] + ((b[1] - a[1]) * j) / n) / cel) - y0);
    }
  }
  if (verwijden) {
    const kopie = vol.slice();
    for (let cy = 1; cy < hoogte - 1; cy++) {
      for (let cx = 1; cx < breedte - 1; cx++) {
        if (!kopie[cy * breedte + cx]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) vol[(cy + dy) * breedte + cx + dx] = 1;
      }
    }
  }
  return { cel, x0, y0, breedte, hoogte, vol, cellen: Int32Array.from(cellen) };
}

/** Hoeveel cellen van `bewegend`, verschoven met (sx, sy) cellen, in `vast` vallen. */
function score(vast: Raster, bewegend: Raster, sx: number, sy: number): number {
  const ox = bewegend.x0 - vast.x0 + sx;
  const oy = bewegend.y0 - vast.y0 + sy;
  let raak = 0;
  const c = bewegend.cellen;
  for (let i = 0; i < c.length; i += 2) {
    const x = c[i] + ox;
    const y = c[i + 1] + oy;
    if (x >= 0 && y >= 0 && x < vast.breedte && y < vast.hoogte && vast.vol[y * vast.breedte + x]) raak++;
  }
  return raak;
}

interface Plaats {
  sx: number;
  sy: number;
  s: number;
}

/** Alle verschuivingen binnen het bereik rond het midden, met hun score. */
function scores(vast: Raster, bewegend: Raster, midden: [number, number], bereik: number): Plaats[] {
  const alle: Plaats[] = [];
  for (let sy = midden[1] - bereik; sy <= midden[1] + bereik; sy++) {
    for (let sx = midden[0] - bereik; sx <= midden[0] + bereik; sx++) {
      alle.push({ sx, sy, s: score(vast, bewegend, sx, sy) });
    }
  }
  return alle;
}

/** De beste plaatsen die minstens `afstand` cellen van elkaar liggen, de beste eerst. */
function toppen(alle: Plaats[], aantal: number, afstand: number, midden: [number, number]): Plaats[] {
  // Bij gelijkstand wint wat het dichtst bij het begin ligt.
  const gesorteerd = [...alle].sort(
    (a, b) => b.s - a.s || Math.hypot(a.sx - midden[0], a.sy - midden[1]) - Math.hypot(b.sx - midden[0], b.sy - midden[1]),
  );
  const uit: Plaats[] = [];
  for (const plaats of gesorteerd) {
    if (plaats.s <= 0 || uit.length >= aantal) break;
    if (uit.every((t) => Math.abs(t.sx - plaats.sx) > afstand || Math.abs(t.sy - plaats.sy) > afstand)) uit.push(plaats);
  }
  return uit;
}

/**
 * Op lijnen: de muren van het nieuwe blad (in punten) op die van de
 * referentie (in meter, al in het gebouw gelegd). Geeft de kalibratie van het
 * nieuwe blad.
 *
 * begin is de verschuiving om rond te zoeken; zonder begin: dezelfde plaats
 * op het blad als de referentie.
 */
export function lijnUitOpLijnen(
  nieuw: Lijnstuk[],
  meterPerPunt: number,
  referentie: Lijnstuk[],
  opties: { begin?: { dx: number; dy: number }; kwartslagen?: number[]; bereikM?: number } = {},
): Uitlijning | null {
  if (nieuw.length === 0 || referentie.length === 0) return null;
  // Een tekening die op haar blad gedraaid staat, is zeldzaam, en een
  // symmetrisch huis past ook na een halve draai: enkel als het gevraagd wordt.
  const kwartslagen = opties.kwartslagen ?? [0];
  const bereikM = opties.bereikM ?? 3;
  const refKader = kaderVan(referentie.flat());

  let beste: Uitlijning | null = null;
  let besteScore = -1;
  for (const k of kwartslagen) {
    const gedraaid = nieuw.map(
      ([a, b]) =>
        [
          naarHuis(a, { meterPerPunt, kwartslagen: k, dx: 0, dy: 0 }),
          naarHuis(b, { meterPerPunt, kwartslagen: k, dx: 0, dy: 0 }),
        ] as Lijnstuk,
    );
    const kader = kaderVan(gedraaid.flat());
    // Waar beginnen: wat gevraagd werd, of de middens van beide tekeningen op elkaar.
    const begin =
      k === 0 && opties.begin
        ? opties.begin
        : { dx: (refKader.x0 + refKader.x1 - kader.x0 - kader.x1) / 2, dy: (refKader.y0 + refKader.y1 - kader.y0 - kader.y1) / 2 };

    // Grof op 5 cm, over het hele bereik. Een muur heeft lagen van 10 tot 17
    // cm, en een gebouw vaak twee gevelvlakken: dan liggen er meerdere toppen
    // dicht bij elkaar. Daarom gaan de beste zes grove toppen allemaal naar
    // het fijne raster, en wint daar de beste.
    const grofVast = maakRaster(referentie, GROF, refKader, true);
    const grofBewegend = maakRaster(gedraaid, GROF, kader, false);
    const grofMidden: [number, number] = [Math.round(begin.dx / GROF), Math.round(begin.dy / GROF)];
    const groveToppen = toppen(
      scores(grofVast, grofBewegend, grofMidden, Math.round(bereikM / GROF)),
      6,
      Math.round(0.15 / GROF),
      grofMidden,
    );

    const fijnVast = maakRaster(referentie, FIJN, refKader, true);
    const fijnExact = maakRaster(referentie, FIJN, refKader, false);
    const fijnBewegend = maakRaster(gedraaid, FIJN, kader, false);
    const verhouding = GROF / FIJN;
    const fijn = groveToppen
      .map((top) => {
        const midden: [number, number] = [Math.round(top.sx * verhouding), Math.round(top.sy * verhouding)];
        // Het verwijde raster geeft een plateau van gelijke scores; het
        // onverwijde kiest daarbinnen de plaats waar de lijnen echt samenvallen.
        const alle = scores(fijnVast, fijnBewegend, midden, Math.ceil(verhouding) + 2).map((p) => ({
          ...p,
          s: p.s * 4 + score(fijnExact, fijnBewegend, p.sx, p.sy),
        }));
        const top1 = toppen(alle, 1, 0, midden)[0];
        return top1 ? { ...top1, s: Math.floor(top1.s / 4) } : undefined;
      })
      .filter((t): t is Plaats => t !== undefined)
      .sort((a, b) => b.s - a.s);
    const [eerste, ...rest] = fijn;
    if (!eerste) continue;
    const tweede = rest.find((t) => Math.hypot(t.sx - eerste.sx, t.sy - eerste.sy) * FIJN > 0.1);

    const cellen = fijnBewegend.cellen.length / 2;
    const relatief = cellen > 0 ? eerste.s / cellen : 0;
    if (relatief > besteScore) {
      besteScore = relatief;
      const alsMeter = (t: Plaats) => ({ dx: Math.round(t.sx * FIJN * 1000) / 1000, dy: Math.round(t.sy * FIJN * 1000) / 1000 });
      beste = {
        kwartslagen: k,
        ...alsMeter(eerste),
        zekerheid: tweede ? Math.max(0, Math.min(1, 1 - tweede.s / eerste.s)) : 1,
        methode: "lijnen",
        alternatieven: rest
          .filter((t, i) => rest.findIndex((u) => Math.hypot(u.sx - t.sx, u.sy - t.sy) * FIJN < 0.1) === i)
          .filter((t) => Math.hypot(t.sx - eerste.sx, t.sy - eerste.sy) * FIJN >= 0.1)
          .slice(0, 3)
          .map(alsMeter),
      };
    }
  }
  return beste;
}

/**
 * Op namen: het midden van elke nieuwe ruimte bij het midden van de oude
 * ruimte met dezelfde naam. Minstens twee namen nodig; de mediaan houdt een
 * ruimte die echt verplaatst werd erbuiten.
 */
export function lijnUitOpNamen(
  nieuw: { naam: string; ringen: Xy[][] }[],
  oud: { naam: string; ringen: Xy[][] }[],
  meterPerPunt: number,
  kwartslagen = 0,
): Uitlijning | null {
  const verschillen: Xy[] = [];
  for (const ruimte of nieuw) {
    if (!ruimte.naam.trim()) continue;
    const zelfde = oud.filter((o) => sleutelVan(o.naam) === sleutelVan(ruimte.naam));
    if (zelfde.length !== 1) continue;
    const [nx, ny] = draai(
      middenVan(ruimte.ringen).map((w) => w * meterPerPunt) as Xy,
      kwartslagen,
    );
    const [ox, oy] = middenVan(zelfde[0].ringen);
    verschillen.push([ox - nx, oy - ny]);
  }
  if (verschillen.length < 2) return null;
  const mediaan = (waarden: number[]) => {
    const s = [...waarden].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const dx = mediaan(verschillen.map((v) => v[0]));
  const dy = mediaan(verschillen.map((v) => v[1]));
  const binnen = verschillen.filter((v) => Math.hypot(v[0] - dx, v[1] - dy) < 0.1).length;
  return {
    kwartslagen,
    dx: Math.round(dx * 1000) / 1000,
    dy: Math.round(dy * 1000) / 1000,
    zekerheid: binnen / verschillen.length,
    methode: "namen",
    alternatieven: [],
  };
}

/** De referentielijnen in meter: het blad van de referentie met zijn kalibratie. */
export function inHuis(stukken: Lijnstuk[], kalibratie: Kalibratie): Lijnstuk[] {
  return stukken.map(([a, b]) => [naarHuis(a, kalibratie), naarHuis(b, kalibratie)] as Lijnstuk);
}
