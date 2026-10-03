import "server-only";

import type { Factuur, Kredietopname, Meerwerk, Offerte, Post } from "./geld";
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
import { lijstPlanning } from "./regie-opslag";
import type { Huis, Partij } from "./types";

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

/** Alles wat de schermen van Geld en de Excel van een huis nodig hebben, in één keer. */
export async function laadGeld(huis: Huis): Promise<Geldgegevens> {
  const [posten, offertes, meerwerken, facturen, opnames, partijen, planning, vennootschappen] = await Promise.all([
    lijstPosten(huis.id),
    lijstOffertes(huis.id),
    lijstMeerwerken(huis.id),
    lijstFacturen(huis.id),
    lijstKredietopnames(huis.id),
    lijstPartijen(huis.id),
    lijstPlanning(huis.id),
    lijstVennootschappen(),
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
    krediet: huis.krediet_totaal,
    eigenInbreng: huis.eigen_inbreng,
  };
}
