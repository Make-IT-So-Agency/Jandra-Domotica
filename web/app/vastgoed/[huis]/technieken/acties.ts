"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { bewaarTechniekinstellingen } from "@/lib/bouw/huizen";
import { huispad } from "@/lib/bouw/paden";
import { schoneInstellingen } from "@/lib/bouw/technieken/voorstel";
import { foutmelding, terug } from "@/lib/bouw/terug";

/** De aansluiting ("3x25": drie fasen, 25 A), de domotica, de laadpaal, de zonnepanelen en de batterij; leeg is geen. */
export async function bewaarTechniekenActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const pad = huispad(huis.id, "/technieken");
  const veld = (naam: string) => String(formulier.get(naam) ?? "").trim();
  const [fasen, stroom] = veld("aansluiting").split("x").map(Number);
  const zon = veld("zonnepanelen").replace(",", ".");
  const instellingen = schoneInstellingen({
    fasen,
    stroom,
    domotica: veld("domotica"),
    laadpaal: veld("laadpaal") === "" ? null : Number(veld("laadpaal")),
    zonnepanelen: zon === "" || Number(zon) === 0 ? null : Number(zon),
    batterij: veld("batterij") === "" ? null : veld("batterij"),
  });
  if (!instellingen) terug(pad, "fout", "Kijk de uitgangspunten na: kies uit de lijsten, en geef de zonnepanelen in kWp (tot 100).");
  try {
    await bewaarTechniekinstellingen(huis.id, instellingen);
  } catch (fout) {
    terug(pad, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pad, "goed", "Bewaard: het voorstel rekent nu zo.");
}
