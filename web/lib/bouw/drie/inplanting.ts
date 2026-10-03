import { afstandTotSegment, nettoOppervlakte, oppervlakte, vereenvoudig, zwaartepunt } from "../omzetting/geometrie";
import { meestVoorkomend, METER_PER_PUNT } from "../omzetting/schaal";
import { leesSchaal } from "../omzetting/teksten";
import type { Blad, Xy } from "../omzetting/types";
import { genormaliseerd, naarTerrein, type Plaatsing } from "./plaatsing";
import { doorsnede, omhullende, verschil, vereniging, vergrootConvex, type Veelhoek } from "./vlak";

/**
 * De gebouwen automatisch op het inplantingsplan. Puur, met tests.
 *
 * Een gebouw staat op het inplantingsplan als een gesloten vorm: één vlak, of
 * losse muren en ruimtes die samen zijn omtrek vormen. Voor elke vorm met
 * ongeveer de oppervlakte van het gebouw zoekt dit de draaiing en de plaats
 * waarop zijn gelijkvloers het best op die vorm valt:
 *
 * 1. de hoek uit de hoofdrichting van de randen, met elke kwartslag erbij;
 * 2. het zwaartepunt op het zwaartepunt;
 * 3. fijn bijsturen, tot 3° en enkele decimeter;
 * 4. de score is de overlap: de doorsnede gedeeld door de unie.
 *
 * Bij een rechthoek passen twee draaiingen even goed. Dan beslissen de muren
 * binnenin, als het plan die toont, en anders de draaiing die het dichtst bij
 * die van de grondplannen ligt: een tekenpakket tekent alles meestal in
 * dezelfde richting.
 *
 * Het beste paar gebouw-vorm wordt eerst geplaatst. Wat van een vorm overblijft
 * zonder dat gebouw, blijft een kandidaat: een bijgebouw dat tegen de woning
 * staat, vormt op het plan vaak één geheel met haar.
 *
 * Het terrein is het blad in meter: (x, y) in punten maal de schaal, met y
 * naar beneden, zoals in plaatsing.ts.
 */

/** Vanaf hoeveel overlap een gebouw automatisch geplaatst wordt. */
export const DREMPEL = 0.6;
/** Vanaf hoeveel overlap een plaatsing overtuigt; daaronder vraagt het scherm om na te kijken. */
export const OVERTUIGEND = 0.85;

/** Gangbare schalen voor een inplantingsplan, om te proberen als het blad er geen vermeldt. */
const GANGBAAR = [100, 200, 250, 500, 1000, 2500];
/** Hoe ver het bijsturen van de eerste hoek mag afwijken, in graden. */
const BIJDRAAIEN = 3;
/** Hoe dicht een muur bij een getekende lijn moet liggen om mee te tellen, in meter. */
const MUURAFSTAND = 0.12;

export interface Zoekgebouw {
  id: number;
  /** De voetafdruk van het gelijkvloers, in meter, in het assenstelsel van het gebouw. */
  voetafdruk: Veelhoek[];
  /** De randen van de muren van het gelijkvloers, om bij een symmetrische vorm de juiste kant te kiezen. */
  muren: [Xy, Xy][];
  /** Waarrond een plaatsing draait: het midden van het kader van het gebouw (zie plaatsing.ts). */
  midden: Xy;
}

/** Een gesloten vorm op het blad, in paginapunten, met de stijl waarin hij getekend is. */
export interface Bladvorm {
  ring: Xy[];
  stijl: string;
  /** In vierkante punten. */
  oppervlakte: number;
}

export interface Vondst {
  plaatsing: Plaatsing;
  /** De doorsnede gedeeld door de unie, van 0 tot 1. */
  overeenkomst: number;
}

export interface Inplantingsvondst {
  /** N van 1/N waarop gezocht werd; null als er geen schaal te vinden was. */
  noemer: number | null;
  /** Waar die schaal vandaan komt: zelf gegeven, van het blad, of uit de gebouwen berekend. */
  bron: "gegeven" | "plan" | "gebouwen" | null;
  gevonden: Map<number, Vondst>;
}

// ---------------------------------------------------------------------------
// Het blad
// ---------------------------------------------------------------------------

/** De schaal die op het blad staat (de meest vermelde), of null. */
export function schaalVanBlad(blad: Pick<Blad, "teksten">): number | null {
  const noemers = blad.teksten
    .map((tekst) => leesSchaal(tekst.tekst))
    .filter((noemer): noemer is number => noemer !== null && noemer >= 50 && noemer <= 5000);
  return meestVoorkomend(noemers);
}

/**
 * De gesloten vormen van een blad: een gesloten deelpad, een deelpad dat eindigt
 * waar het begint, of een gevuld deelpad (vullen sluit altijd). Niets kleiner
 * dan een vierkante punt, en geen kader rond het halve blad.
 */
export function vormenVan(blad: Blad): Bladvorm[] {
  const vormen: Bladvorm[] = [];
  const grens = blad.breedte * blad.hoogte * 0.5;
  for (const pad of blad.paden) {
    const stijl = `${pad.vul ?? "-"}|${pad.lijn ?? "-"}`;
    for (const deel of pad.delen) {
      if (deel.punten.length < 3) continue;
      const eerste = deel.punten[0];
      const laatste = deel.punten[deel.punten.length - 1];
      const rond = Math.hypot(eerste[0] - laatste[0], eerste[1] - laatste[1]) < 0.5;
      if (!deel.gesloten && !rond && pad.vul === null) continue;
      const ring = vereenvoudig(deel.punten, 0.05);
      if (ring.length < 3) continue;
      const opp = Math.abs(oppervlakte(ring));
      if (opp >= 1 && opp <= grens) vormen.push({ ring, stijl, oppervlakte: opp });
    }
  }
  return vormen;
}

/** Alle getekende randen van het blad, in paginapunten: om muren op te herkennen. */
function lijnenVan(blad: Blad): [Xy, Xy][] {
  const lijnen: [Xy, Xy][] = [];
  for (const pad of blad.paden) {
    for (const deel of pad.delen) {
      const punten = deel.punten;
      for (let i = 1; i < punten.length; i++) lijnen.push([punten[i - 1], punten[i]]);
      if ((deel.gesloten || pad.vul !== null) && punten.length > 2) lijnen.push([punten[punten.length - 1], punten[0]]);
    }
  }
  return lijnen;
}

/** Een rooster van lijnstukken, om snel te weten of er een in de buurt ligt. */
class Lijnrooster {
  private readonly cellen = new Map<number, [Xy, Xy][]>();

  constructor(
    lijnen: readonly [Xy, Xy][],
    private readonly cel: number,
  ) {
    for (const lijn of lijnen) {
      const [a, b] = lijn;
      const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Een heel lange lijn (een kader rond het blad) zegt niets over een muur.
      if (lengte > 500) continue;
      // Om de halve cel een punt op de lijn: zo komt ze in elke cel die ze raakt, of in een buurcel.
      const stappen = Math.max(1, Math.ceil(lengte / (cel / 2)));
      let vorige = NaN;
      for (let k = 0; k <= stappen; k++) {
        const t = k / stappen;
        const sleutel = this.sleutel(Math.floor((a[0] + (b[0] - a[0]) * t) / cel), Math.floor((a[1] + (b[1] - a[1]) * t) / cel));
        if (sleutel === vorige) continue;
        vorige = sleutel;
        const lijst = this.cellen.get(sleutel);
        if (lijst) lijst.push(lijn);
        else this.cellen.set(sleutel, [lijn]);
      }
    }
  }

  private sleutel(i: number, j: number): number {
    return (i + 100000) * 200003 + (j + 100000);
  }

  /** Ligt er een lijnstuk binnen `afstand` (minder dan een halve cel) van p? */
  dichtbij(p: Xy, afstand: number): boolean {
    const [i, j] = [Math.floor(p[0] / this.cel), Math.floor(p[1] / this.cel)];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const [a, b] of this.cellen.get(this.sleutel(i + di, j + dj)) ?? []) {
          if (afstandTotSegment(p, a, b) <= afstand) return true;
        }
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vormen vergelijken
// ---------------------------------------------------------------------------

interface Maat {
  oppervlakte: number;
  zwaartepunt: Xy;
  /** De hoofdrichting van de randen, in graden, tussen -45 en 45. */
  richting: number;
}

interface Gebouwmaat extends Maat {
  gebouw: Zoekgebouw;
  /** De voetafdruk zonder gaten: een trapgat of een patio telt niet op het inplantingsplan. */
  vorm: Veelhoek[];
  /** Punten op de muren, om te tellen hoeveel er op een getekende lijn vallen. */
  muurpunten: Xy[];
}

interface Kandidaat extends Maat {
  veelhoek: Veelhoek;
}

const buitenranden = (veelhoeken: readonly Veelhoek[]): Veelhoek[] =>
  veelhoeken.filter((veelhoek) => veelhoek[0]?.length >= 3).map((veelhoek) => [veelhoek[0]]);

function maatVan(veelhoeken: readonly Veelhoek[]): Maat {
  let opp = 0;
  let sx = 0;
  let sy = 0;
  let s = 0;
  let c = 0;
  for (const veelhoek of veelhoeken) {
    const a = nettoOppervlakte(veelhoek);
    const [x, y] = zwaartepunt(veelhoek[0]);
    opp += a;
    sx += x * a;
    sy += y * a;
    for (const ring of veelhoek) {
      ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const lengte = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const t = 4 * Math.atan2(q[1] - p[1], q[0] - p[0]);
        s += lengte * Math.sin(t);
        c += lengte * Math.cos(t);
      });
    }
  }
  return {
    oppervlakte: opp,
    zwaartepunt: opp > 0 ? [sx / opp, sy / opp] : [0, 0],
    richting: (Math.atan2(s, c) / 4) * (180 / Math.PI),
  };
}

function muurpuntenVan(muren: readonly [Xy, Xy][]): Xy[] {
  const punten: Xy[] = [];
  for (const [a, b] of muren) {
    const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const stappen = Math.max(1, Math.round(lengte / 0.25));
    for (let k = 0; k < stappen; k++) {
      const t = (k + 0.5) / stappen;
      punten.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  // Genoeg om te beslissen; meer maakt het enkel trager.
  const stap = Math.max(1, Math.ceil(punten.length / 600));
  return punten.filter((_, i) => i % stap === 0);
}

function gebouwmaat(gebouw: Zoekgebouw): Gebouwmaat {
  const vorm = buitenranden(gebouw.voetafdruk);
  return { gebouw, vorm, muurpunten: muurpuntenVan(gebouw.muren), ...maatVan(vorm) };
}

function kandidaatVan(ring: Xy[]): Kandidaat {
  const veelhoek: Veelhoek = [ring];
  return { veelhoek, ...maatVan([veelhoek]) };
}

/** De plaatsing die het zwaartepunt van het gebouw op (cx, cy) zet, met die hoek. */
function plaatsingVoor(maat: Gebouwmaat, cx: number, cy: number, hoek: number): Plaatsing {
  const r = (hoek * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  const dx = maat.zwaartepunt[0] - maat.gebouw.midden[0];
  const dy = maat.zwaartepunt[1] - maat.gebouw.midden[1];
  return { x: cx - (c * dx - s * dy), y: cy - (s * dx + c * dy), hoek };
}

const opTerrein = (veelhoeken: readonly Veelhoek[], midden: Xy, plaatsing: Plaatsing): Veelhoek[] =>
  veelhoeken.map((veelhoek) => veelhoek.map((ring) => ring.map((p) => naarTerrein(p, midden, plaatsing))));

const totaal = (veelhoeken: readonly Veelhoek[]) => veelhoeken.reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0);

/** De overlap van een geplaatst gebouw met een vorm: doorsnede gedeeld door unie. */
function overlap(maat: Gebouwmaat, plaatsing: Plaatsing, kandidaat: Kandidaat): number {
  const gemeen = totaal(doorsnede(opTerrein(maat.vorm, maat.gebouw.midden, plaatsing), [kandidaat.veelhoek]));
  const unie = maat.oppervlakte + kandidaat.oppervlakte - gemeen;
  return unie > 0 ? gemeen / unie : 0;
}

/** Hoeveel van de muren van het geplaatste gebouw op een getekende lijn vallen, van 0 tot 1. */
function muurscore(maat: Gebouwmaat, plaatsing: Plaatsing, rooster: Lijnrooster): number {
  if (maat.muurpunten.length === 0) return 0;
  let raak = 0;
  for (const p of maat.muurpunten) if (rooster.dichtbij(naarTerrein(p, maat.gebouw.midden, plaatsing), MUURAFSTAND)) raak++;
  return raak / maat.muurpunten.length;
}

interface Stand {
  cx: number;
  cy: number;
  hoek: number;
  score: number;
}

/** Bijsturen: telkens een kleine stap opzij of een kleine draai, zolang het beter wordt. */
function stuurBij(maat: Gebouwmaat, kandidaat: Kandidaat, begin: Stand): Stand {
  let beste = begin;
  for (const [stap, draai] of [
    [0.3, 1],
    [0.1, 0.3],
    [0.03, 0.1],
  ]) {
    for (let keer = 0, beter = true; beter && keer < 10; keer++) {
      beter = false;
      for (const [dx, dy, dh] of [
        [stap, 0, 0],
        [-stap, 0, 0],
        [0, stap, 0],
        [0, -stap, 0],
        [0, 0, draai],
        [0, 0, -draai],
      ]) {
        const hoek = beste.hoek + dh;
        if (Math.abs(genormaliseerd(hoek - begin.hoek)) > BIJDRAAIEN) continue;
        const [cx, cy] = [beste.cx + dx, beste.cy + dy];
        const score = overlap(maat, plaatsingVoor(maat, cx, cy, hoek), kandidaat);
        if (score > beste.score + 1e-6) {
          beste = { cx, cy, hoek, score };
          beter = true;
        }
      }
    }
  }
  return beste;
}

/** De eerste schatting voor elke kwartslag: zwaartepunt op zwaartepunt, randen evenwijdig. */
function kwartslagen(maat: Gebouwmaat, kandidaat: Kandidaat): Stand[] {
  return [0, 1, 2, 3].map((k) => {
    const hoek = genormaliseerd(kandidaat.richting - maat.richting + 90 * k);
    const [cx, cy] = kandidaat.zwaartepunt;
    return { cx, cy, hoek, score: overlap(maat, plaatsingVoor(maat, cx, cy, hoek), kandidaat) };
  });
}

/** Een plaatsing, met hoeveel van de muren van het gebouw op een getekende lijn vallen. */
interface Paar {
  vondst: Vondst;
  muren: number;
}

/**
 * Is a beter dan b? Eerst de overlap; scheelt die weinig, dan de muren: een
 * terras van dezelfde grootte heeft geen muren die op die van het gebouw
 * vallen.
 */
function beter(a: Paar, b: Paar | null): boolean {
  if (!b) return true;
  const verschil = a.vondst.overeenkomst - b.vondst.overeenkomst;
  if (Math.abs(verschil) > 0.03) return verschil > 0;
  if (Math.abs(a.muren - b.muren) > 0.05) return a.muren > b.muren;
  return verschil > 0;
}

/**
 * Hoe een gebouw het best op een vorm valt. Draaiingen die bijna even goed
 * passen (een rechthoek past ook omgekeerd), scheidt eerst de muurscore, dan
 * de kleinste draaiing.
 */
function pasOp(maat: Gebouwmaat, kandidaat: Kandidaat, rooster: () => Lijnrooster): Paar {
  const ruw = kwartslagen(maat, kandidaat);
  const besteRuw = Math.max(...ruw.map((stand) => stand.score));
  const verfijnd = ruw.filter((stand) => stand.score >= besteRuw - 0.1).map((stand) => stuurBij(maat, kandidaat, stand));
  const beste = Math.max(...verfijnd.map((stand) => stand.score));
  const bijna = verfijnd
    .filter((stand) => stand.score >= beste - 0.03)
    .map((stand) => ({ stand, plaatsing: plaatsingVoor(maat, stand.cx, stand.cy, stand.hoek) }))
    .map((paar) => ({ ...paar, muren: muurscore(maat, paar.plaatsing, rooster()) }));
  const meesteMuren = Math.max(...bijna.map((paar) => paar.muren));
  const gekozen = bijna
    .filter((paar) => paar.muren >= meesteMuren - 0.05)
    .sort((a, b) => Math.abs(a.stand.hoek) - Math.abs(b.stand.hoek))[0];
  return { vondst: { plaatsing: gekozen.plaatsing, overeenkomst: gekozen.stand.score }, muren: gekozen.muren };
}

// ---------------------------------------------------------------------------
// Zoeken op een schaal
// ---------------------------------------------------------------------------

/** Twee kandidaten die zo goed als samenvallen, tellen één keer. */
function zonderDubbels(kandidaten: Kandidaat[]): Kandidaat[] {
  const uit: Kandidaat[] = [];
  for (const k of kandidaten) {
    const dubbel = uit.some(
      (u) =>
        Math.abs(u.oppervlakte - k.oppervlakte) <= 0.01 * k.oppervlakte &&
        Math.hypot(u.zwaartepunt[0] - k.zwaartepunt[0], u.zwaartepunt[1] - k.zwaartepunt[1]) <= 0.02 * Math.sqrt(k.oppervlakte),
    );
    if (!dubbel) uit.push(k);
  }
  return uit;
}

interface Stuk {
  ring: Xy[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Hoeveel een stuk groeit voor het samenvoegen, in meter: genoeg om aan te sluiten, te weinig om te tellen. */
const AANSLUITEN = 0.02;

/**
 * Een ring die aan elke kant wat groter is. Twee muren die tegen elkaar
 * getekend zijn, raken elkaar na een draaiing niet altijd meer precies; zo
 * overlappen ze, en worden ze bij het samenvoegen één geheel.
 */
function gegroeid(ring: Xy[]): Xy[] {
  return vergrootConvex(oppervlakte(ring) < 0 ? [...ring].reverse() : ring, AANSLUITEN);
}

/**
 * Welke stukken elkaar raken of bijna raken (hun kaders, met wat marge), in
 * groepjes. Een rooster houdt het snel, ook met duizenden stukken.
 */
function groepjes(stukken: readonly Stuk[], marge: number): number[][] {
  const ouder = stukken.map((_, i) => i);
  const wortel = (i: number): number => (ouder[i] === i ? i : (ouder[i] = wortel(ouder[i])));
  const cel = 2;
  const rooster = new Map<string, number[]>();
  stukken.forEach((stuk, i) => {
    for (let x = Math.floor((stuk.x0 - marge) / cel); x <= Math.floor((stuk.x1 + marge) / cel); x++) {
      for (let y = Math.floor((stuk.y0 - marge) / cel); y <= Math.floor((stuk.y1 + marge) / cel); y++) {
        const sleutel = `${x},${y}`;
        const buren = rooster.get(sleutel);
        if (!buren) {
          rooster.set(sleutel, [i]);
          continue;
        }
        for (const j of buren) {
          const ander = stukken[j];
          if (stuk.x0 - marge <= ander.x1 && ander.x0 - marge <= stuk.x1 && stuk.y0 - marge <= ander.y1 && ander.y0 - marge <= stuk.y1) {
            ouder[wortel(i)] = wortel(j);
          }
        }
        buren.push(i);
      }
    }
  });
  const uit = new Map<number, number[]>();
  stukken.forEach((_, i) => {
    const w = wortel(i);
    const groep = uit.get(w);
    if (groep) groep.push(i);
    else uit.set(w, [i]);
  });
  return [...uit.values()];
}

/**
 * De kandidaten op een schaal, in meter: de vormen met een passende
 * oppervlakte, en wat stukken samen vormen (muren en ruimtes, per stijl en
 * allemaal samen): hun omtrek, en hun omhullende voor muren met een opening
 * ertussen. Enkel stukken kleiner dan een gebouw doen mee, zodat een perceel
 * of een kader niet alles opslokt.
 */
function kandidatenOpSchaal(vormen: readonly Bladvorm[], meterPerPunt: number, maten: readonly Gebouwmaat[]): Kandidaat[] {
  const kleinste = Math.min(...maten.map((m) => m.oppervlakte)) * 0.5;
  const grootste = Math.max(...maten.map((m) => m.oppervlakte));
  const m2 = meterPerPunt * meterPerPunt;
  const inMeter = (ring: Xy[]): Xy[] => ring.map(([x, y]) => [x * meterPerPunt, y * meterPerPunt]);
  const past = (opp: number) => opp >= kleinste && opp <= grootste * 2;

  const ringen: Xy[][] = vormen.filter((vorm) => past(vorm.oppervlakte * m2)).map((vorm) => inMeter(vorm.ring));
  const groepen = new Map<string, Stuk[]>([["*", []]]);
  for (const vorm of vormen) {
    const opp = vorm.oppervlakte * m2;
    if (opp < 0.02 || opp > grootste * 1.2) continue;
    const ring = inMeter(vorm.ring);
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    const stuk: Stuk = { ring, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    groepen.get("*")!.push(stuk);
    const groep = groepen.get(vorm.stijl);
    if (groep) groep.push(stuk);
    else groepen.set(vorm.stijl, [stuk]);
  }
  for (const [stijl, groep] of groepen) {
    if (groep.length < 2 || groep.length > 5000) continue;
    // Wat elkaar raakt, en voor stukken in dezelfde stijl ook over een deur of een poort heen (tot 3,2 m).
    for (const marge of stijl === "*" ? [0.05] : [0.05, 1.6]) {
      for (const leden of groepjes(groep, marge)) {
        if (leden.length < 2) continue;
        // De omtrek van muren omsluit meer dan de muren zelf, maar nooit meer dan hun kader.
        const breedte = Math.max(...leden.map((i) => groep[i].x1)) - Math.min(...leden.map((i) => groep[i].x0));
        const hoogte = Math.max(...leden.map((i) => groep[i].y1)) - Math.min(...leden.map((i) => groep[i].y0));
        if (breedte * hoogte < kleinste) continue;
        if (marge < 1) {
          for (const samen of vereniging(leden.map((i) => [gegroeid(groep[i].ring)]))) {
            if (past(Math.abs(oppervlakte(samen[0])))) ringen.push(samen[0]);
          }
        }
        // Muren met een deur of een poort ertussen sluiten niet rond; hun omhullende wel.
        const omhulsel = omhullende(leden.flatMap((i) => groep[i].ring));
        if (omhulsel.length >= 3 && past(Math.abs(oppervlakte(omhulsel)))) ringen.push(omhulsel);
      }
    }
  }
  return zonderDubbels(ringen.map(kandidaatVan));
}

/**
 * Elk gebouw op zijn vorm, op één schaal. Het beste paar eerst; wat van een
 * vorm overblijft zonder dat gebouw, is een nieuwe kandidaat voor de rest.
 */
function zoekOpSchaal(maten: readonly Gebouwmaat[], vormen: readonly Bladvorm[], lijnen: readonly [Xy, Xy][], meterPerPunt: number): Map<number, Vondst> {
  const gevonden = new Map<number, Vondst>();
  let kandidaten = kandidatenOpSchaal(vormen, meterPerPunt, maten);
  if (kandidaten.length === 0) return gevonden;
  // Pas gemaakt als er een vorm te vergelijken valt.
  let rooster: Lijnrooster | null = null;
  const lijnrooster = () =>
    (rooster ??= new Lijnrooster(
      lijnen.map(([a, b]) => [
        [a[0] * meterPerPunt, a[1] * meterPerPunt],
        [b[0] * meterPerPunt, b[1] * meterPerPunt],
      ]),
      0.5,
    ));
  const geplaatst: Veelhoek[] = [];
  const paren = new Map<string, Paar>();

  for (let ronde = 0; ronde < maten.length; ronde++) {
    let beste: { maat: Gebouwmaat; paar: Paar } | null = null;
    for (const maat of maten) {
      if (gevonden.has(maat.gebouw.id)) continue;
      // Eerst ruw, dan enkel de drie beste vormen verfijnen.
      const passend = kandidaten
        .filter((k) => k.oppervlakte >= maat.oppervlakte * 0.5 && k.oppervlakte <= maat.oppervlakte * 2)
        .map((k) => ({ k, ruw: Math.max(...kwartslagen(maat, k).map((stand) => stand.score)) }))
        .filter((paar) => paar.ruw >= 0.3)
        .sort((a, b) => b.ruw - a.ruw)
        .slice(0, 3);
      for (const { k } of passend) {
        const sleutel = `${maat.gebouw.id}:${k.zwaartepunt.join(",")}:${k.oppervlakte}`;
        const paar = paren.get(sleutel) ?? pasOp(maat, k, lijnrooster);
        paren.set(sleutel, paar);
        if (beter(paar, beste?.paar ?? null)) beste = { maat, paar };
      }
    }
    if (!beste || beste.paar.vondst.overeenkomst < DREMPEL) break;
    gevonden.set(beste.maat.gebouw.id, beste.paar.vondst);
    const voetafdruk = opTerrein(beste.maat.vorm, beste.maat.gebouw.midden, beste.paar.vondst.plaatsing);
    geplaatst.push(...voetafdruk);
    // Wat het gebouw bedekt, is niet meer vrij.
    kandidaten = zonderDubbels(
      kandidaten.flatMap((k) => {
        if (totaal(doorsnede([k.veelhoek], voetafdruk)) < 0.05 * k.oppervlakte) return [k];
        return buitenranden(verschil([k.veelhoek], geplaatst))
          .filter((rest) => Math.abs(oppervlakte(rest[0])) >= 1)
          .map((rest) => kandidaatVan(rest[0]));
      }),
    );
  }
  return gevonden;
}

// ---------------------------------------------------------------------------
// Alles samen
// ---------------------------------------------------------------------------

/** Elk gebouw gevonden, en goed. */
const overtuigend = (gevonden: Map<number, Vondst>, aantal: number) =>
  gevonden.size === aantal && [...gevonden.values()].every((v) => v.overeenkomst >= OVERTUIGEND);

/**
 * Hoe goed een schaal past: een goede plaatsing telt veel meer dan twee
 * matige. Op een verkeerde schaal valt een gebouw soms nog voor 65% over een
 * andere vorm; dat mag niet winnen van één gebouw dat precies past.
 */
const waardeVan = (gevonden: Map<number, Vondst>) =>
  [...gevonden.values()].reduce((som, v) => som + ((v.overeenkomst - DREMPEL) / (1 - DREMPEL)) ** 3, 0);

/**
 * Zoekt de gebouwen op een inplantingsplan. Met een gegeven schaal enkel op
 * die schaal; anders op de schaal van het blad, en vindt die niets, op de
 * gangbare schalen waarop een vorm op het blad zo groot is als een gebouw.
 */
export function plaatsAutomatisch(gebouwen: readonly Zoekgebouw[], blad: Blad, gegeven: number | null = null): Inplantingsvondst {
  const maten = gebouwen.map(gebouwmaat).filter((maat) => maat.oppervlakte > 1);
  const vanBlad = schaalVanBlad(blad);
  const vormen = vormenVan(blad);
  if (gegeven !== null) {
    const gevonden = maten.length > 0 ? zoekOpSchaal(maten, vormen, lijnenVan(blad), gegeven * METER_PER_PUNT) : new Map<number, Vondst>();
    return { noemer: gegeven, bron: "gegeven", gevonden };
  }
  const leeg: Inplantingsvondst = { noemer: vanBlad, bron: vanBlad === null ? null : "plan", gevonden: new Map() };
  if (maten.length === 0 || vormen.length === 0) return leeg;

  const lijnen = lijnenVan(blad);
  let beste = leeg;
  if (vanBlad !== null) {
    beste = { ...leeg, gevonden: zoekOpSchaal(maten, vormen, lijnen, vanBlad * METER_PER_PUNT) };
    // Een gebouw op een verkeerde schaal valt nog altijd voor 60% over een
    // kleinere vorm: enkel als alles goed past, hoeft het niet verder.
    if (overtuigend(beste.gevonden, maten.length)) return beste;
  }

  // De andere gangbare schalen: eerst die waarop het meest vormen zo groot zijn als een gebouw.
  const stemmen = new Map<number, number>(GANGBAAR.filter((n) => n !== vanBlad).map((n) => [n, 0]));
  for (const maat of maten) {
    for (const vorm of vormen) {
      const noemer = Math.sqrt(maat.oppervlakte / vorm.oppervlakte) / METER_PER_PUNT;
      const gangbaar = GANGBAAR.find((n) => Math.abs(noemer / n - 1) < 0.1);
      if (gangbaar !== undefined && stemmen.has(gangbaar)) stemmen.set(gangbaar, stemmen.get(gangbaar)! + 1);
    }
  }
  // Allemaal proberen: op een verkeerde schaal past een L ook voor 83% in een
  // rechthoek die toevallig zo groot is. Een berekende schaal telt enkel als
  // er minstens één gebouw overtuigend op past, en de schaal van het blad
  // blijft tenzij een andere duidelijk beter past.
  for (const [noemer] of [...stemmen].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    const gevonden = zoekOpSchaal(maten, vormen, lijnen, noemer * METER_PER_PUNT);
    if (![...gevonden.values()].some((v) => v.overeenkomst >= OVERTUIGEND)) continue;
    if (waardeVan(gevonden) > waardeVan(beste.gevonden) + (beste.bron === "plan" ? 0.05 : 0)) beste = { noemer, bron: "gebouwen", gevonden };
  }
  return beste;
}
