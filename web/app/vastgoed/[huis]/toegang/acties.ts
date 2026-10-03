"use server";

import { revalidatePath } from "next/cache";

import { adresVanApp } from "@/lib/bouw/adres";
import { huisgebruiker, vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { id } from "@/lib/bouw/invoer";
import { MAX_GELDIG_DAGEN, schoneRechten } from "@/lib/bouw/linkregels";
import { maakLink, trekLinkIn } from "@/lib/bouw/links";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

const pad = (huisId: number) => huispad(huisId, "/toegang");

/**
 * Maakt een link en geeft ze één keer terug: enkel de hash wordt bewaard. De
 * browser toont ze, met een knop om te kopiëren of te mailen.
 */
export async function maakLinkActie(
  huisId: unknown,
  vraag: {
    partijId: number;
    rechten: string[];
    vervaltOp: string;
  },
): Promise<Uitkomst<{ url: string; vervaltOp: string }>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const { ik, huis } = toegang;

  const partijId = id(String(vraag?.partijId));
  const partij = partijId ? (await lijstPartijen(huis.id)).find((p) => p.id === partijId) : undefined;
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
    const { token } = await maakLink(huis.id, { partijId: partij.id, rechten, vervaltOp, door: ik.email });
    revalidatePath(pad(huis.id));
    return gelukt({ url: `${await adresVanApp()}/extern/${token}`, vervaltOp: vervaltOp.toISOString() });
  } catch (fout) {
    return mislukt(foutmelding(fout, "De link maken is mislukt."));
  }
}

export async function trekLinkInActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const linkId = id(formulier.get("id"));
  if (!linkId) terug(pad(huis.id), "fout", "Onbekende link.");
  try {
    await trekLinkIn(huis.id, linkId);
  } catch (fout) {
    terug(pad(huis.id), "fout", foutmelding(fout, "Intrekken mislukt."));
  }
  terug(pad(huis.id), "goed", "De link is ingetrokken: wie hem nog heeft, kan er niets meer mee.");
}
