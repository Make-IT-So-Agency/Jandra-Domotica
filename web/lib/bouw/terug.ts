import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Terug naar een pagina van Bouw, met een melding bovenaan. Voor
 * formulieracties: een fout die een actie gooit, ziet de gebruiker in
 * productie niet.
 *
 * redirect() werkt door een fout te gooien. Roep terug() dus nooit binnen een
 * try aan, wel erna of in de catch.
 */
export function terug(pad: string, soort: "goed" | "fout", melding: string): never {
  revalidatePath("/bouw", "layout");
  const scheiding = pad.includes("?") ? "&" : "?";
  redirect(`${pad}${scheiding}soort=${soort}&melding=${encodeURIComponent(melding)}`);
}

/** De tekst van een fout, of een algemene melding als het geen Error is. */
export function foutmelding(fout: unknown, anders: string): string {
  return fout instanceof Error && fout.message ? fout.message : anders;
}
