import { nettoOppervlakte, omtrek } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import { vlakVanGat } from "./correcties";
import { hartVan, ramenLangs, type Gat, type Gekendeopening } from "./gaten";
import { binnenVeelhoeken, doorsnede, verschil, vereniging, type Veelhoek } from "./vlak";
import { KLEINE_ZONE } from "./zones";

/**
 * Een traphal die boven niet gesloten is. Op het plan heeft een traphal
 * meestal geen ruimte, en de ramen worden langs de ruimtes gezocht: zo vindt
 * de app het raam in de gevel van de traphal niet, en ligt daar boven een gat
 * in de gevel. Dan is de traphal geen ingesloten zone maar een inkeping:
 * zonder dak, met het platte dak van de verdieping eronder rond de trap.
 *
 * Komt een trap van beneden boven uit in zo'n inkeping, en is ze klein (een
 * traphal, geen terras), dan vult de verdieping eronder ze aan: eerst de
 * ramen langs de traphal, dan, waar de gevel nog open is, de gevelmuur van
 * beneden. Zo is de traphal boven weer een ingesloten zone, zoals een
 * traphal waarvan het raam wel gevonden werd. Een binnenmuur van beneden
 * komt niet mee: boven kan de traphal groter zijn.
 *
 * Puur, in meter, in het assenstelsel van het gebouw.
 */

/** Zo breed is een muur van beneden gemiddeld minstens: dunner is een splinter langs de gevel boven. */
const MIN_MUUR = 0.08;
/** Zo diep ligt een gevelmuur hoogstens, van de buitenrand naar binnen. */
const GEVELDIEPTE = 0.6;

export interface Traphal {
  /** De voetafdruk boven, met de traphal erin als ingesloten zone. */
  voetafdruk: Veelhoek[];
  /** De muren boven, met die van beneden waar de gevel open was. */
  muren: Veelhoek[];
  /** De ramen langs de traphal, die de omzetting niet als opening las. */
  ramen: Gat[];
}

const oppervlakteVan = (veelhoeken: readonly Veelhoek[]) => veelhoeken.reduce((som, veelhoek) => som + nettoOppervlakte(veelhoek), 0);
const buitenranden = (veelhoeken: readonly Veelhoek[]): Veelhoek[] => veelhoeken.map((veelhoek) => [veelhoek[0]]);
/** Gemiddeld zo breed: de oppervlakte over de halve omtrek. */
const gemiddeldBreed = (veelhoek: Veelhoek) => (2 * nettoOppervlakte(veelhoek)) / (veelhoek.reduce((som, ring) => som + omtrek(ring), 0) || 1);

/** De strook langs de buitenrand, zo diep als een gevelmuur, waar ze bij een vlak komt. */
function gevelstrook(buitenrand: readonly Veelhoek[], bij: Veelhoek): Veelhoek[] {
  const xs = bij[0].map(([x]) => x);
  const ys = bij[0].map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - GEVELDIEPTE, Math.max(...xs) + GEVELDIEPTE, Math.min(...ys) - GEVELDIEPTE, Math.max(...ys) + GEVELDIEPTE];
  const stroken: Veelhoek[] = [];
  for (const [ring] of buitenrand) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) continue;
      const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (lengte < 1e-6) continue;
      // Naar binnen: de kant waar de voetafdruk ligt.
      let n: Xy = [-(b[1] - a[1]) / lengte, (b[0] - a[0]) / lengte];
      const m: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (!binnenVeelhoeken([m[0] + n[0] * 0.01, m[1] + n[1] * 0.01], buitenrand)) n = [-n[0], -n[1]];
      const diep = (p: Xy): Xy => [p[0] + n[0] * GEVELDIEPTE, p[1] + n[1] * GEVELDIEPTE];
      stroken.push([[a, b, diep(b), diep(a)]]);
    }
  }
  return stroken.length > 0 ? vereniging(stroken) : [];
}

/**
 * De traphal boven, aangevuld van de verdieping eronder. Leeg als er niets
 * aan te vullen is: de traphal is al ingesloten, of de trap komt niet uit in
 * een inkeping.
 */
export function traphalBoven(invoer: {
  /** De trappen van de verdieping eronder naar boven. */
  trappen: readonly Veelhoek[];
  onder: { voetafdruk: readonly Veelhoek[]; muren: readonly Veelhoek[] };
  boven: {
    voetafdruk: readonly Veelhoek[];
    muren: readonly Veelhoek[];
    ruimtes: readonly { ringen: Xy[][] }[];
    /** Wat de omzetting op het plan las: de raammaten en borstweringen gelden ook hier. */
    openingen: readonly Gekendeopening[];
    gaten: readonly Gat[];
    plafond: number;
  };
}): Traphal | null {
  const { onder, boven } = invoer;
  const trap = vereniging([...invoer.trappen]);
  if (trap.length === 0) return null;
  const ramen: Gat[] = [];
  const geleend: Veelhoek[] = [];
  const hallen: Veelhoek[] = [];
  const inkepingen: Veelhoek[] = [];
  const buitenrandOnder = buitenranden(onder.voetafdruk);
  // Wat beneden binnen de gevel ligt en boven niet: daar zit de inkeping.
  for (const inkeping of verschil(buitenrandOnder, buitenranden(boven.voetafdruk))) {
    if (oppervlakteVan(doorsnede([inkeping], trap)) < 0.3) continue;
    // De gevelmuur van beneden voor de inkeping, en daarachter de traphal: één kleine zone, met de trap erin.
    const gevel = doorsnede(doorsnede([inkeping], [...onder.muren]), gevelstrook(buitenrandOnder, inkeping));
    const hal = verschil([inkeping], gevel).filter((deel) => nettoOppervlakte(deel) > 0.3);
    if (hal.length !== 1 || nettoOppervlakte(hal[0]) > KLEINE_ZONE || oppervlakteVan(doorsnede(hal, trap)) < 0.3) continue;
    const gekend = [...boven.gaten, ...ramen].map(vlakVanGat);
    const langs = ramenLangs([hal[0][0]], boven.ruimtes, boven.muren, boven.openingen, boven.plafond);
    const nieuw = langs.filter((raam) => !binnenVeelhoeken(hartVan(raam), gekend));
    ramen.push(...nieuw);
    // Waar de gevel boven dan nog open is: de gevelmuur van beneden.
    const muur = verschil(gevel, nieuw.map(vlakVanGat));
    geleend.push(...muur.filter((deel) => gemiddeldBreed(deel) >= MIN_MUUR));
    hallen.push(...hal);
    inkepingen.push(inkeping);
  }
  if (hallen.length === 0) return null;

  const muren = geleend.length > 0 ? vereniging([...boven.muren, ...geleend]) : [...boven.muren];
  let voetafdruk = vereniging([...boven.voetafdruk, ...ramen.map(vlakVanGat), ...geleend]);
  // Nog niet rondom dicht (de gevel van beneden had zelf een gat): de hele inkeping, met de traphal als zone erin.
  if (oppervlakteVan(verschil(hallen, buitenranden(voetafdruk))) > 0.05) {
    voetafdruk = verschil(vereniging([...voetafdruk, ...inkepingen]), hallen);
  }
  return { voetafdruk, muren, ramen };
}
