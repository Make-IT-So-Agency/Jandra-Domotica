"use server";

import { leesPerceelnummer } from "@/lib/bouw/drie/omgeving";
import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { bewaarProject } from "@/lib/bouw/huizen";
import { tekst } from "@/lib/bouw/invoer";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";

export async function bewaarProjectActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const ruwPerceel = tekst(formulier.get("perceel"));
  const perceel = ruwPerceel ? leesPerceelnummer(ruwPerceel) : null;
  if (ruwPerceel && !perceel) terug(huispad(huis.id), "fout", "Dat perceelnummer ken ik niet. Neem het over zoals op Geopunt, bv. 12345A0678/00B000.");

  try {
    await bewaarProject(huis.id, {
      projectnaam: tekst(formulier.get("projectnaam")),
      adres: tekst(formulier.get("adres")),
      perceel,
    });
  } catch (fout) {
    terug(huispad(huis.id), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(huispad(huis.id), "goed", "Projectgegevens bewaard.");
}
