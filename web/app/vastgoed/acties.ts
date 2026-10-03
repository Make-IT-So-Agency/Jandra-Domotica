"use server";

import { revalidatePath } from "next/cache";

import { archiveerHuis, leesHuis, schoneHuisnaam, verwijderHuis, voegHuisToe, wijzigHuis } from "@/lib/bouw/huizen";
import { getal, id } from "@/lib/bouw/invoer";
import { VASTGOED, huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { isSoortHuis, type SoortHuis } from "@/lib/bouw/types";
import { vereistBouwrechten } from "@/lib/toegang";

/**
 * De huizen beheren. Na elke wijziging ververst het menu, dat in de layout
 * van de hele app staat.
 */

function naarHuizen(soort: "goed" | "fout", melding: string): never {
  revalidatePath("/", "layout");
  terug(VASTGOED, soort, melding);
}

function leesNaamEnSoort(formulier: FormData): { naam: string; soort: SoortHuis } {
  const naam = schoneHuisnaam(formulier.get("naam"));
  if (!naam) naarHuizen("fout", "Geef het huis een naam van 1 tot 60 tekens, bv. Huidig huis.");
  const soort = String(formulier.get("soort") ?? "");
  if (!isSoortHuis(soort)) naarHuizen("fout", "Kies wat voor huis het is.");
  return { naam, soort };
}

/** Het huis uit het formulier, of terug met een melding als het er niet (meer) is. */
async function leesGekozenHuis(formulier: FormData) {
  const huisId = id(formulier.get("id"));
  const huis = huisId ? await leesHuis(huisId) : null;
  if (!huis) naarHuizen("fout", "Dit huis bestaat niet meer.");
  return huis;
}

export async function voegHuisToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const nieuw = leesNaamEnSoort(formulier);
  let huisId: number;
  try {
    huisId = await voegHuisToe(nieuw);
  } catch (fout) {
    naarHuizen("fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  revalidatePath("/", "layout");
  terug(huispad(huisId), "goed", `${nieuw.naam} toegevoegd. Begin bij Verdiepingen of Partijen.`);
}

export async function wijzigHuisActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const huis = await leesGekozenHuis(formulier);
  const { naam, soort } = leesNaamEnSoort(formulier);
  const volgorde = getal(formulier.get("volgorde"), "Volgorde");
  if (!volgorde.ok) naarHuizen("fout", volgorde.melding);
  try {
    await wijzigHuis(huis.id, { naam, soort, volgorde: Math.round(volgorde.waarde ?? huis.volgorde) });
  } catch (fout) {
    naarHuizen("fout", foutmelding(fout, "Bewaren mislukt."));
  }
  naarHuizen("goed", `${naam} bewaard.`);
}

export async function archiveerHuisActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const huis = await leesGekozenHuis(formulier);
  try {
    await archiveerHuis(huis.id, true);
  } catch (fout) {
    naarHuizen("fout", foutmelding(fout, "Archiveren mislukt."));
  }
  naarHuizen("goed", `${huis.naam} is gearchiveerd: het staat niet meer in het menu, de bot volgt het niet meer, en zijn links werken niet meer.`);
}

export async function zetHuisTerugActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const huis = await leesGekozenHuis(formulier);
  try {
    await archiveerHuis(huis.id, false);
  } catch (fout) {
    naarHuizen("fout", foutmelding(fout, "Terugzetten mislukt."));
  }
  naarHuizen("goed", `${huis.naam} is terug actief.`);
}

export async function verwijderHuisActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const huis = await leesGekozenHuis(formulier);
  try {
    await verwijderHuis(huis.id);
  } catch (fout) {
    naarHuizen("fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  naarHuizen("goed", `${huis.naam} is verwijderd.`);
}
