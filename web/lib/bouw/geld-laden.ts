import "server-only";

import { bedragUitInstelling, type Factuur, type Kredietopname, type Meerwerk, type Offerte, type Post } from "./geld";
import {
  lijstFacturen,
  lijstKredietopnames,
  lijstMeerwerken,
  lijstOffertes,
  lijstPosten,
  lijstVennootschappen,
} from "./geld-opslag";
import { lijstPartijen } from "./opslag";
import type { Planningsitem } from "./planning";
import { leesInstelling, lijstPlanning } from "./regie-opslag";
import type { Partij } from "./types";

/** In bouw_instellingen: het bedrag van het bouwkrediet en de eigen inbreng. */
export const KREDIET_SLEUTEL = "krediet_totaal";
export const EIGEN_INBRENG_SLEUTEL = "eigen_inbreng";

export interface Geldgegevens {
  posten: Post[];
  offertes: Offerte[];
  meerwerken: Meerwerk[];
  facturen: Factuur[];
  opnames: Kredietopname[];
  partijen: Partij[];
  planning: Planningsitem[];
  vennootschappen: { id: string; naam: string }[];
  krediet: number | null;
  eigenInbreng: number | null;
}

/** Alles wat de schermen van Geld en de Excel nodig hebben, in één keer. */
export async function laadGeld(): Promise<Geldgegevens> {
  const [posten, offertes, meerwerken, facturen, opnames, partijen, planning, vennootschappen, krediet, eigenInbreng] =
    await Promise.all([
      lijstPosten(),
      lijstOffertes(),
      lijstMeerwerken(),
      lijstFacturen(),
      lijstKredietopnames(),
      lijstPartijen(),
      lijstPlanning(),
      lijstVennootschappen(),
      leesInstelling(KREDIET_SLEUTEL),
      leesInstelling(EIGEN_INBRENG_SLEUTEL),
    ]);
  return {
    posten,
    offertes,
    meerwerken,
    facturen,
    opnames,
    partijen,
    planning,
    vennootschappen,
    krediet: bedragUitInstelling(krediet),
    eigenInbreng: bedragUitInstelling(eigenInbreng),
  };
}
