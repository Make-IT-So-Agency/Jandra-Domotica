import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Terug naar een pagina van Vastgoed, met een melding bovenaan. Voor
 * formulieracties: een fout die een actie gooit, ziet de gebruiker in
 * productie niet.
 *
 * redirect() werkt door een fout te gooien. Roep terug() dus nooit binnen een
 * try aan, wel erna of in de catch.
 */
export function terug(pad: string, soort: "goed" | "fout", melding: string): never {
  revalidatePath("/vastgoed", "layout");
  // De melding hoort vóór een anker (#...), anders leest de pagina ze niet.
  const hekje = pad.indexOf("#");
  const zonderAnker = hekje === -1 ? pad : pad.slice(0, hekje);
  const anker = hekje === -1 ? "" : pad.slice(hekje);
  const scheiding = zonderAnker.includes("?") ? "&" : "?";
  redirect(`${zonderAnker}${scheiding}soort=${soort}&melding=${encodeURIComponent(melding)}${anker}`);
}

/** De tekst van een fout, of een algemene melding als het geen Error is. */
export function foutmelding(fout: unknown, anders: string): string {
  return fout instanceof Error && fout.message ? fout.message : anders;
}
