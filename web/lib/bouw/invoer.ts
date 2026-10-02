/**
 * Waarden uit een formulier lezen. Puur, zodat elke regel apart te testen
 * valt.
 */

/**
 * Een naam om te vergelijken: zonder hoofdletters en dubbele spaties. Zo is
 * "woning" uit een bladcode dezelfde als de Woning die er al staat.
 */
export function sleutelVan(naam: string): string {
  return naam.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-BE");
}

/** Een tekstveld, zonder witruimte rond. Leeg wordt null. */
export function tekst(waarde: FormDataEntryValue | null | undefined): string | null {
  const schoon = String(waarde ?? "").trim();
  return schoon.length > 0 ? schoon : null;
}

export type Getal = { ok: true; waarde: number | null } | { ok: false; melding: string };

/**
 * Een getal zoals iemand het in België intikt: "2,7" of "2.7", eventueel met
 * spaties. Leeg is geen fout maar null: de meeste getallen zijn optioneel.
 */
export function getal(waarde: FormDataEntryValue | null | undefined, veld: string): Getal {
  const ruw = String(waarde ?? "").replace(/\s/g, "");
  if (ruw === "") return { ok: true, waarde: null };

  // Eén komma of punt als decimaalteken. "1.234,5" (duizendtallen) laten we
  // bewust niet toe: bij een hoogte of peil is dat eerder een tikfout.
  if (!/^-?\d+([.,]\d+)?$/.test(ruw)) {
    return { ok: false, melding: `${veld}: "${String(waarde).trim()}" is geen getal.` };
  }
  return { ok: true, waarde: Number(ruw.replace(",", ".")) };
}

/**
 * Een bedrag zoals iemand het in België intikt: "1.250", "1 250", "1250,50",
 * "€ 1.250,50". Een komma is altijd het decimaalteken; punten en spaties zijn
 * dan duizendtallen. Zonder komma is "1.250" duizend tweehonderdvijftig, maar
 * "12.5" twaalf en een half: met één of twee cijfers na de punt is dat geen
 * duizendtal. Leeg is null.
 */
export function bedrag(waarde: FormDataEntryValue | null | undefined, veld: string): Getal {
  const ruw = String(waarde ?? "")
    .replace(/€|eur(o)?/gi, "")
    .replace(/[\s\u00a0]/g, "");
  if (ruw === "") return { ok: true, waarde: null };
  const fout = { ok: false as const, melding: `${veld}: "${String(waarde).trim()}" is geen bedrag.` };

  let getalTekst: string;
  if (ruw.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(ruw)) return fout;
    getalTekst = ruw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(ruw)) {
    getalTekst = ruw.replace(/\./g, "");
  } else if (/^\d+(\.\d{1,2})?$/.test(ruw)) {
    getalTekst = ruw;
  } else {
    return fout;
  }
  return { ok: true, waarde: Number(getalTekst) };
}

/** Een positief geheel getal uit een verborgen veld of een URL, bv. een id. */
export function id(waarde: FormDataEntryValue | string | null | undefined): number | null {
  const ruw = String(waarde ?? "").trim();
  if (!/^\d{1,15}$/.test(ruw)) return null;
  const getalWaarde = Number(ruw);
  return getalWaarde > 0 && Number.isSafeInteger(getalWaarde) ? getalWaarde : null;
}

/** Een datum uit een datumveld (YYYY-MM-DD). Leeg wordt null, onzin ook. */
export function datum(waarde: FormDataEntryValue | null | undefined): string | null {
  const ruw = String(waarde ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ruw)) return null;
  const [jaar, maand, dag] = ruw.split("-").map(Number);
  const moment = new Date(Date.UTC(jaar, maand - 1, dag));
  return moment.getUTCFullYear() === jaar && moment.getUTCMonth() === maand - 1 && moment.getUTCDate() === dag
    ? ruw
    : null;
}
