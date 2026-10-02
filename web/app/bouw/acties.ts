"use server";

import { tekst } from "@/lib/bouw/invoer";
import { bewaarProject } from "@/lib/bouw/opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { vereistBouwrechten } from "@/lib/toegang";

export async function bewaarProjectActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();

  try {
    await bewaarProject({
      projectnaam: tekst(formulier.get("projectnaam")),
      adres: tekst(formulier.get("adres")),
    });
  } catch (fout) {
    terug("/bouw", "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug("/bouw", "goed", "Projectgegevens bewaard.");
}
