/**
 * De adressen van Vastgoed. Elk huis staat onder /vastgoed/<nummer>; het
 * nummer en niet de naam, zodat een huisnaam nooit in een URL of een log komt.
 *
 * Puur: het menu in de browser gebruikt dit ook.
 */

export const VASTGOED = "/vastgoed";

/** /vastgoed/12/geld/facturen: het deel begint met /, ? of #, of is leeg voor het overzicht. */
export function huispad(huisId: number, deel = ""): string {
  return `${VASTGOED}/${huisId}${deel}`;
}

/** Het huis in een pad onder /vastgoed, of null. /vastgoed/12 is huis 12, niet huis 1. */
export function huisUitPad(pad: string): number | null {
  const gevonden = /^\/vastgoed\/(\d{1,9})(?=$|[/?#])/.exec(pad);
  return gevonden ? Number(gevonden[1]) : null;
}

/** Het deel na /vastgoed/<nummer>, zonder vraag of anker; "" voor het overzicht. */
export function deelVan(pad: string): string {
  const gevonden = /^\/vastgoed\/\d{1,9}(\/[^?#]*)?/.exec(pad);
  return gevonden?.[1]?.replace(/\/+$/, "") ?? "";
}
