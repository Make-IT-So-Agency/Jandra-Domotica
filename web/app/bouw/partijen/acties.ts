"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { id, tekst } from "@/lib/bouw/invoer";
import { verwijderPartij, voegPartijToe, wijzigPartij, type NieuwePartij } from "@/lib/bouw/opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { isSoortPartij } from "@/lib/bouw/types";

const PAD = "/bouw/partijen";

function leesPartij(formulier: FormData): NieuwePartij {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(PAD, "fout", "Vul een naam in.");

  const soort = String(formulier.get("soort") ?? "");
  if (!isSoortPartij(soort)) terug(PAD, "fout", "Kies wat voor partij dit is.");

  const email = tekst(formulier.get("email"));
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) terug(PAD, "fout", `"${email}" is geen e-mailadres.`);

  const website = tekst(formulier.get("website"));
  if (website && !/^https?:\/\//i.test(website) && !/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(website)) {
    terug(PAD, "fout", `"${website}" is geen website.`);
  }

  return {
    soort,
    naam,
    vak: tekst(formulier.get("vak")),
    contactpersoon: tekst(formulier.get("contactpersoon")),
    email,
    telefoon: tekst(formulier.get("telefoon")),
    adres: tekst(formulier.get("adres")),
    website,
    btw_nummer: tekst(formulier.get("btw_nummer")),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegPartijToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const partij = leesPartij(formulier);
  try {
    await voegPartijToe(huis.id, partij);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(PAD, "goed", `${partij.naam} toegevoegd.`);
}

export async function wijzigPartijActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const partijId = id(formulier.get("id"));
  if (!partijId) terug(PAD, "fout", "Onbekende partij.");
  const partij = leesPartij(formulier);
  try {
    await wijzigPartij(huis.id, partijId, partij);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", `${partij.naam} bewaard.`);
}

export async function verwijderPartijActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const partijId = id(formulier.get("id"));
  if (!partijId) terug(PAD, "fout", "Onbekende partij.");
  try {
    await verwijderPartij(huis.id, partijId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Partij verwijderd.");
}
