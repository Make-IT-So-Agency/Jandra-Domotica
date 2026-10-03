"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { bewaarProject } from "@/lib/bouw/huizen";
import { tekst } from "@/lib/bouw/invoer";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";

export async function bewaarProjectActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);

  try {
    await bewaarProject(huis.id, {
      projectnaam: tekst(formulier.get("projectnaam")),
      adres: tekst(formulier.get("adres")),
    });
  } catch (fout) {
    terug(huispad(huis.id), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(huispad(huis.id), "goed", "Projectgegevens bewaard.");
}
