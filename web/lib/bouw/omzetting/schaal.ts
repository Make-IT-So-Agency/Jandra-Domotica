import { binnenRuimte, inKader } from "./geometrie";
import { leesOppervlakte, leesSchaal } from "./teksten";
import type { Schaal, Tekst, Xy } from "./types";
import type { Vlak } from "./vlakken";

/**
 * De schaal van een blad. Twee bronnen, die elkaar controleren:
 *
 * - het titelblok: "1:50" staat er als tekst;
 * - de oppervlaktes: de architect zet in elke ruimte haar oppervlakte, en het
 *   witte vlak rond dat label heeft op de juiste schaal precies die
 *   oppervlakte.
 *
 * Kloppen ze, dan is de schaal zeker. Zo valt ook een plan op dat op een
 * ander formaat afgedrukt werd: dan klopt het titelblok niet meer, en de
 * oppervlaktes wel.
 */

/** Meter per punt op ware grootte: een punt is 1/72 inch. */
export const METER_PER_PUNT = 0.0254 / 72;

/** Hoeveel een oppervlakte mag afwijken van het label om nog te kloppen. */
export const MARGE = 0.02;

const GANGBAAR = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

export interface Label {
  tekst: Tekst;
  /** In m². */
  waarde: number;
}

export function oppervlaktelabels(teksten: Tekst[]): Label[] {
  const labels: Label[] = [];
  for (const tekst of teksten) {
    const waarde = leesOppervlakte(tekst.tekst);
    if (waarde !== null) labels.push({ tekst, waarde });
  }
  return labels;
}

/**
 * De witte vlakken rond een label. Achter een label ligt vaak een klein wit
 * tekstvlak; dat is geen ruimte, dus een vlak moet ruim groter zijn dan het
 * label zelf.
 */
export function vlakkenRond(label: Label, vlakken: Vlak[]): Vlak[] {
  const p: Xy = [label.tekst.x, label.tekst.y];
  const labelvlak = Math.max(1, label.tekst.breedte * label.tekst.hoogte);
  return vlakken.filter(
    (vlak) => vlak.oppervlakte > labelvlak * 4 && inKader(p, vlak.kader) && binnenRuimte(p, vlak.ringen),
  );
}

export function afwijking(vlak: Vlak, meterPerPunt: number, label: Label): number {
  return Math.abs((vlak.oppervlakte * meterPerPunt * meterPerPunt) / label.waarde - 1);
}

/** De meest voorkomende waarde; bij gelijkstand de kleinste. */
export function meestVoorkomend(waarden: number[]): number | null {
  const tellingen = new Map<number, number>();
  for (const waarde of waarden) tellingen.set(waarde, (tellingen.get(waarde) ?? 0) + 1);
  let beste: number | null = null;
  let aantal = 0;
  for (const [waarde, keer] of tellingen) {
    if (keer > aantal || (keer === aantal && beste !== null && waarde < beste)) {
      beste = waarde;
      aantal = keer;
    }
  }
  return beste;
}

function telKloppend(labels: Label[], rond: Vlak[][], meterPerPunt: number): number {
  return labels.filter((label, i) => rond[i].some((vlak) => afwijking(vlak, meterPerPunt, label) <= MARGE)).length;
}

export function bepaalSchaal(teksten: Tekst[], vlakken: Vlak[]): Schaal | null {
  const noemers = teksten.map((tekst) => leesSchaal(tekst.tekst)).filter((n): n is number => n !== null);
  const titelblok = meestVoorkomend(noemers);
  const labels = oppervlaktelabels(teksten);
  const rond = labels.map((label) => vlakkenRond(label, vlakken));

  const volgensTitelblok = (kloppend: number): Schaal | null =>
    titelblok === null
      ? null
      : {
          meterPerPunt: titelblok * METER_PER_PUNT,
          noemer: titelblok,
          bron: kloppend > 0 ? "beide" : "titelblok",
          titelblok,
          kloppend,
          getoetst: labels.length,
          zeker: kloppend >= Math.min(2, labels.length) && kloppend > 0,
        };

  // Het titelblok, als de oppervlaktes het bevestigen.
  if (titelblok !== null) {
    const kloppend = telKloppend(labels, rond, titelblok * METER_PER_PUNT);
    if (labels.length === 0 || kloppend * 2 >= labels.length) return volgensTitelblok(kloppend);
  }

  // Anders de oppervlaktes zelf: elk label met een vlak eromheen geeft een
  // schaal. De schaal waar de meeste labels mee kloppen, wint.
  let beste: { meterPerPunt: number; kloppend: number } | null = null;
  labels.forEach((label, i) => {
    for (const vlak of rond[i]) {
      const meterPerPunt = Math.sqrt(label.waarde / vlak.oppervlakte);
      const kloppend = telKloppend(labels, rond, meterPerPunt);
      if (!beste || kloppend > beste.kloppend) beste = { meterPerPunt, kloppend };
    }
  });
  const gevonden = beste as { meterPerPunt: number; kloppend: number } | null;
  if (gevonden && gevonden.kloppend >= Math.min(2, labels.length)) {
    const noemer = gevonden.meterPerPunt / METER_PER_PUNT;
    const gangbaar = GANGBAAR.find((n) => Math.abs(n / noemer - 1) < 0.01);
    const meterPerPunt = gangbaar ? gangbaar * METER_PER_PUNT : gevonden.meterPerPunt;
    const kloppend = telKloppend(labels, rond, meterPerPunt);
    return {
      meterPerPunt,
      noemer: gangbaar ?? Math.round(noemer * 10) / 10,
      bron: "oppervlaktes",
      titelblok,
      kloppend,
      getoetst: labels.length,
      zeker: kloppend >= 3,
    };
  }

  // Het titelblok zonder bevestiging, of niets.
  return volgensTitelblok(titelblok === null ? 0 : telKloppend(labels, rond, titelblok * METER_PER_PUNT));
}

/** Een schaal die iemand zelf aanduidde, met wat de oppervlaktes ervan vinden. */
export function handmatigeSchaal(meterPerPunt: number, teksten: Tekst[], vlakken: Vlak[]): Schaal {
  const labels = oppervlaktelabels(teksten);
  const rond = labels.map((label) => vlakkenRond(label, vlakken));
  const noemers = teksten.map((tekst) => leesSchaal(tekst.tekst)).filter((n): n is number => n !== null);
  const kloppend = telKloppend(labels, rond, meterPerPunt);
  return {
    meterPerPunt,
    noemer: Math.round((meterPerPunt / METER_PER_PUNT) * 10) / 10,
    bron: "hand",
    titelblok: meestVoorkomend(noemers),
    kloppend,
    getoetst: labels.length,
    zeker: true,
  };
}

const noemerTekst = (noemer: number) => `1:${String(noemer).replace(".", ",")}`;

/** Het bewijs in mensentaal, voor het nakijkscherm. */
export function bewijs(schaal: Schaal): string {
  const s = noemerTekst(schaal.noemer);
  const telling = `${schaal.kloppend} van de ${schaal.getoetst} oppervlaktes ${schaal.kloppend === 1 ? "klopt" : "kloppen"}`;
  switch (schaal.bron) {
    case "beide":
      return `${s} volgens het titelblok, en ${telling}.`;
    case "titelblok":
      return schaal.getoetst === 0
        ? `${s} volgens het titelblok. Er staan geen oppervlaktes op om dat na te kijken.`
        : `${s} volgens het titelblok, maar ${telling}. Kijk de schaal na.`;
    case "oppervlaktes":
      return `${s} uit de oppervlaktes: ${telling}. ${
        schaal.titelblok === null
          ? "Er staat geen schaal op het blad."
          : `Het titelblok zegt ${noemerTekst(schaal.titelblok)}; misschien is het op een ander formaat afgedrukt.`
      }`;
    case "hand":
      return `${s}, zelf aangeduid${schaal.getoetst > 0 ? `; ${telling}` : ""}.`;
  }
}
