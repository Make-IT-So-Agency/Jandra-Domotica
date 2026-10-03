"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { id, tekst } from "@/lib/bouw/invoer";
import { verwijderPartij, voegPartijToe, wijzigPartij, type NieuwePartij } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { isSoortPartij } from "@/lib/bouw/types";

const pad = (huisId: number) => huispad(huisId, "/partijen");

function leesPartij(formulier: FormData, terugNaar: string): NieuwePartij {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(terugNaar, "fout", "Vul een naam in.");

  const soort = String(formulier.get("soort") ?? "");
  if (!isSoortPartij(soort)) terug(terugNaar, "fout", "Kies wat voor partij dit is.");

  const email = tekst(formulier.get("email"));
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) terug(terugNaar, "fout", `"${email}" is geen e-mailadres.`);

  const website = tekst(formulier.get("website"));
  if (website && !/^https?:\/\//i.test(website) && !/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(website)) {
    terug(terugNaar, "fout", `"${website}" is geen website.`);
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
  const terugNaar = pad(huis.id);
  const partij = leesPartij(formulier, terugNaar);
  try {
    await voegPartijToe(huis.id, partij);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", `${partij.naam} toegevoegd.`);
}

export async function wijzigPartijActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const partijId = id(formulier.get("id"));
  if (!partijId) terug(terugNaar, "fout", "Onbekende partij.");
  const partij = leesPartij(formulier, terugNaar);
  try {
    await wijzigPartij(huis.id, partijId, partij);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `${partij.naam} bewaard.`);
}

export async function verwijderPartijActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = pad(huis.id);
  const partijId = id(formulier.get("id"));
  if (!partijId) terug(terugNaar, "fout", "Onbekende partij.");
  try {
    await verwijderPartij(huis.id, partijId);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Partij verwijderd.");
}
