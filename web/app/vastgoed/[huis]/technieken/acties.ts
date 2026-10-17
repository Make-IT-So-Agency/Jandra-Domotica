"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { bewaarTechniekinstellingen } from "@/lib/bouw/huizen";
import { huispad } from "@/lib/bouw/paden";
import { schoneInstellingen } from "@/lib/bouw/technieken/voorstel";
import { foutmelding, terug } from "@/lib/bouw/terug";

/** De aansluiting ("3x25": drie fasen, 25 A) en of er domotica komt. */
export async function bewaarTechniekenActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const pad = huispad(huis.id, "/technieken");
  const [fasen, stroom] = String(formulier.get("aansluiting") ?? "").split("x").map(Number);
  const instellingen = schoneInstellingen({ fasen, stroom, domotica: formulier.get("domotica") === "ja" });
  if (!instellingen) terug(pad, "fout", "Kies een aansluiting uit de lijst.");
  try {
    await bewaarTechniekinstellingen(huis.id, instellingen);
  } catch (fout) {
    terug(pad, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pad, "goed", "Bewaard: het voorstel rekent nu zo.");
}
