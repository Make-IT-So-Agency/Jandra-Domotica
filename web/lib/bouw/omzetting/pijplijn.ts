import { vindLuifels } from "./luifels";
import { vindMuren } from "./muren";
import { vindOpeningen } from "./openingen";
import { vindRuimtes } from "./ruimtes";
import { bepaalSchaal, handmatigeSchaal } from "./schaal";
import { vindTrappen } from "./trappen";
import type { Blad, Voorstel } from "./types";
import { witteVlakken } from "./vlakken";

/**
 * Van een blad naar een voorstel: de schaal, de ruimtes, de kandidaten, de
 * openingen, de muren, de trappen en de luifels. Puur en snel (milliseconden), dus het draait gewoon in de
 * browser; pdf.js leest de PDF al in zijn eigen worker.
 */

/**
 * Verhoog dit als de regels veranderen, zodat een bewaarde omzetting zegt met welke regels ze gemaakt is.
 * 2: de muren; 3: de trappen; 4: het bordes van een trap die 180° draait, de treden die de snedelijn knipt, en
 * geen pijlpunt als muur; 5: raammaten als "180/275", de borstwering ("BW = 40") en de luifels in streepjes.
 */
export const WERKWIJZE = 5;

export interface Opties {
  /** Een schaal die iemand zelf aanduidde, in meter per punt. */
  meterPerPunt?: number;
}

/** Een blad dat bijna enkel uit een afbeelding bestaat, is een scan. */
export function isScan(blad: Blad): boolean {
  return blad.beeldvlak > 0.5 && blad.paden.length < 200;
}

export function zetOm(blad: Blad, opties: Opties = {}): Voorstel {
  const leeg: Voorstel = {
    werkwijze: WERKWIJZE,
    blad: { breedte: blad.breedte, hoogte: blad.hoogte },
    schaal: null,
    ruimtes: [],
    kandidaten: [],
    openingen: [],
    muren: [],
    trappen: [],
    luifels: [],
    verdieping: { vloerpeil: null, plafondhoogte: null },
    gebied: null,
    meldingen: [],
  };

  if (isScan(blad)) {
    return {
      ...leeg,
      meldingen: ["Dit blad is vooral een afbeelding, zoals een scan. Daar kan de app geen ruimtes uit lezen."],
    };
  }

  const vlakken = witteVlakken(blad);
  const schaal =
    opties.meterPerPunt && opties.meterPerPunt > 0
      ? handmatigeSchaal(opties.meterPerPunt, blad.teksten, vlakken)
      : bepaalSchaal(blad.teksten, vlakken);
  if (!schaal) {
    return {
      ...leeg,
      meldingen: ["Er staat geen schaal op dit blad. Duid ze zelf aan: twee punten en hun echte afstand."],
    };
  }

  const gevonden = vindRuimtes(blad, vlakken, schaal);
  const meldingen = [...gevonden.meldingen];
  if (gevonden.ruimtes.length === 0) {
    meldingen.push(
      "Geen ruimtes gevonden: op dit blad staan geen witte vlakken met een oppervlakte erin. Voeg ze toe uit de kandidaten.",
    );
  }

  const muren = vindMuren(blad, gevonden.ruimtes, schaal.meterPerPunt, gevonden.gebied);
  return {
    ...leeg,
    schaal,
    ruimtes: gevonden.ruimtes,
    kandidaten: gevonden.kandidaten,
    openingen: vindOpeningen(blad, schaal, gevonden.ruimtes),
    muren,
    trappen: vindTrappen(blad, schaal.meterPerPunt, gevonden.gebied, muren),
    luifels: vindLuifels(blad, gevonden.ruimtes, muren, schaal.meterPerPunt),
    verdieping: gevonden.verdieping,
    gebied: gevonden.gebied,
    meldingen,
  };
}
