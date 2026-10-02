import { vindOpeningen } from "./openingen";
import { vindRuimtes } from "./ruimtes";
import { bepaalSchaal, handmatigeSchaal } from "./schaal";
import type { Blad, Voorstel } from "./types";
import { witteVlakken } from "./vlakken";

/**
 * Van een blad naar een voorstel: de schaal, de ruimtes, de kandidaten en de
 * openingen. Puur en snel (milliseconden), dus het draait gewoon in de
 * browser; pdf.js leest de PDF al in zijn eigen worker.
 */

/** Verhoog dit als de regels veranderen, zodat een bewaarde omzetting zegt met welke regels ze gemaakt is. */
export const WERKWIJZE = 1;

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

  return {
    ...leeg,
    schaal,
    ruimtes: gevonden.ruimtes,
    kandidaten: gevonden.kandidaten,
    openingen: vindOpeningen(blad, schaal, gevonden.ruimtes),
    verdieping: gevonden.verdieping,
    gebied: gevonden.gebied,
    meldingen,
  };
}
