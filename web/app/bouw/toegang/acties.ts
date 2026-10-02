"use server";

import { revalidatePath } from "next/cache";

import { adresVanApp } from "@/lib/bouw/adres";
import { id } from "@/lib/bouw/invoer";
import { MAX_GELDIG_DAGEN, schoneRechten } from "@/lib/bouw/linkregels";
import { maakLink, trekLinkIn } from "@/lib/bouw/links";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { bouwgebruiker, vereistBouwrechten } from "@/lib/toegang";

const PAD = "/bouw/toegang";

/**
 * Maakt een link en geeft ze één keer terug: enkel de hash wordt bewaard. De
 * browser toont ze, met een knop om te kopiëren of te mailen.
 */
export async function maakLinkActie(vraag: {
  partijId: number;
  rechten: string[];
  vervaltOp: string;
}): Promise<Uitkomst<{ url: string; vervaltOp: string }>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");

  const partijId = id(String(vraag?.partijId));
  const partij = partijId ? (await lijstPartijen()).find((p) => p.id === partijId) : undefined;
  if (!partij) return mislukt("Kies voor wie de link is.");

  const rechten = schoneRechten(Array.isArray(vraag.rechten) ? vraag.rechten : []);
  if (rechten.length === 0) return mislukt("Kies minstens één ding dat de link mag.");

  const datum = String(vraag.vervaltOp ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return mislukt("Kies tot wanneer de link werkt.");
  // Tot het einde van die dag, in Brussel: 23.59 uur in de winter, ruim genoeg in de zomer.
  const vervaltOp = new Date(`${datum}T22:59:59Z`);
  const nu = Date.now();
  if (Number.isNaN(vervaltOp.getTime()) || vervaltOp.getTime() <= nu) return mislukt("De vervaldatum ligt in het verleden.");
  if (vervaltOp.getTime() - nu > MAX_GELDIG_DAGEN * 24 * 60 * 60 * 1000) {
    return mislukt("Een link werkt hoogstens twee jaar. Maak later gerust een nieuwe.");
  }

  try {
    const { token } = await maakLink({ partijId: partij.id, rechten, vervaltOp, door: ik.email });
    revalidatePath(PAD);
    return gelukt({ url: `${await adresVanApp()}/extern/${token}`, vervaltOp: vervaltOp.toISOString() });
  } catch (fout) {
    return mislukt(foutmelding(fout, "De link maken is mislukt."));
  }
}

export async function trekLinkInActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const linkId = id(formulier.get("id"));
  if (!linkId) terug(PAD, "fout", "Onbekende link.");
  try {
    await trekLinkIn(linkId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Intrekken mislukt."));
  }
  terug(PAD, "goed", "De link is ingetrokken: wie hem nog heeft, kan er niets meer mee.");
}
