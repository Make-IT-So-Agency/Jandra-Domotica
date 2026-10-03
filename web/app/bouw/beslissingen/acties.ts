"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { datum, id, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { lijstBeslissingen, verwijderBeslissing, voegBeslissingToe } from "@/lib/bouw/regie-opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";

const PAD = "/bouw/beslissingen";

export async function voegBeslissingToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const onderwerp = tekst(formulier.get("onderwerp"));
  const beslissing = tekst(formulier.get("beslissing"));
  if (!onderwerp || !beslissing) terug(PAD, "fout", "Vul het onderwerp en de beslissing in.");
  const ruweDatum = tekst(formulier.get("datum"));
  const dag = ruweDatum ? datum(ruweDatum) : vandaag();
  if (!dag) terug(PAD, "fout", "Dat is geen geldige datum.");
  try {
    await voegBeslissingToe(huis.id, { datum: dag, onderwerp, beslissing, keuze_id: null, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", "Beslissing bewaard.");
}

/** Enkel wat met de hand in het log kwam; wat een keuze schreef, blijft staan. */
export async function verwijderBeslissingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const beslissingId = id(formulier.get("id"));
  if (!beslissingId) terug(PAD, "fout", "Onbekende beslissing.");
  try {
    const beslissing = (await lijstBeslissingen(huis.id)).find((rij) => rij.id === beslissingId);
    if (!beslissing) throw new Error("Deze beslissing bestaat niet meer.");
    if (beslissing.keuze_id !== null) throw new Error("Deze regel hoort bij een keuze en blijft staan.");
    await verwijderBeslissing(huis.id, beslissingId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Beslissing verwijderd.");
}
