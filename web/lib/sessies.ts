import type { Laadsessie } from "./types";

/**
 * Voorvoegsel van een rij die een sessie is die op dít moment loopt.
 *
 * Zo'n rij komt niet uit de sessielijst van evcc -- die bevat enkel afgeronde
 * sessies -- maar uit de status, en er bestaat er hoogstens één per laadpunt.
 * Zodra de sessie afgerond is stuurt evcc ze met haar eigen id als een aparte
 * rij, en verdwijnt de lopende versie.
 */
export const LIVE_VOORVOEGSEL = "evcc:live:";

export function isLopend(sessie: Laadsessie): boolean {
  return sessie.external_id.startsWith(LIVE_VOORVOEGSEL);
}

export type SessieToestand = "afgerond" | "bezig" | "onafgewerkt";

/**
 * In welke van de drie toestanden een sessie verkeert.
 *
 * "onafgewerkt" is niet hetzelfde als "bezig": evcc heeft die sessie wel
 * afgesloten maar er ontbreekt iets aan (meestal het verbruik), dus ze wordt
 * nooit meer vanzelf compleet en telt in geen enkel rapport mee. Dat verschil
 * is de reden dat er een legende onder de tabel staat.
 */
export function sessieToestand(sessie: Laadsessie): SessieToestand {
  if (sessie.is_complete) return "afgerond";
  return isLopend(sessie) ? "bezig" : "onafgewerkt";
}

export interface ToestandUiterlijk {
  icoon: string;
  label: string;
  klasse: string;
  uitleg: string;
}

export const TOESTANDEN: Record<SessieToestand, ToestandUiterlijk> = {
  afgerond: {
    icoon: "✓",
    label: "Afgerond",
    klasse: "goed",
    uitleg: "telt mee in de totalen en in een rapport",
  },
  // Bewust geen bliksem of ander emoji-teken: die worden door het
  // emoji-lettertype ingekleurd en negeren dan de kleur van hun bolletje.
  bezig: {
    icoon: "⋯",
    label: "Bezig",
    klasse: "bezig",
    uitleg: "wordt nu geladen; het getal is de stand van de laatste synchronisatie",
  },
  onafgewerkt: {
    icoon: "!",
    label: "Onafgewerkt",
    klasse: "let-op",
    uitleg: "evcc gaf geen verbruik door; telt nergens mee",
  },
};
