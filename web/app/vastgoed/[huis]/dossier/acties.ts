"use server";

import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { datum, id, sleutelVan, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { STANDAARDONDERHOUD, isSoortDocument } from "@/lib/bouw/nazorg";
import {
  leesDocument,
  leesOnderhoud,
  lijstOnderhoud,
  registreerBeurt,
  verwijderBeurt,
  verwijderDocument,
  verwijderGarantie,
  verwijderOnderhoud,
  voegDocumentToe,
  voegGarantieToe,
  voegOnderhoudToe,
  wijzigDocument,
  wijzigGarantie,
  wijzigOnderhoud,
} from "@/lib/bouw/nazorg-opslag";
import { rondUploadAf, ruimOngebruikteBestandenOp } from "@/lib/bouw/opladen";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";

const documenten = (huisId: number) => huispad(huisId, "/dossier");
const garanties = (huisId: number) => huispad(huisId, "/dossier/garanties");
const onderhoudslijst = (huisId: number) => huispad(huisId, "/dossier/onderhoud");

function leesDag(formulier: FormData, veld: string, naam: string, terugNaar: string, verplicht = false): string | null {
  const ruw = tekst(formulier.get(veld));
  const dag = datum(ruw);
  if (ruw && !dag) terug(terugNaar, "fout", `${naam} is geen geldige datum.`);
  if (verplicht && !dag) terug(terugNaar, "fout", `Vul ${naam.toLowerCase()} in.`);
  return dag;
}

function leesMaanden(formulier: FormData, veld: string, terugNaar: string, max: number): number {
  const ruw = tekst(formulier.get(veld)) ?? "";
  const maanden = /^\d{1,3}$/.test(ruw) ? Number(ruw) : NaN;
  if (!(maanden >= 1 && maanden <= max)) terug(terugNaar, "fout", `Geef een aantal maanden tussen 1 en ${max}.`);
  return maanden;
}

// ---------------------------------------------------------------------------
// Documenten
// ---------------------------------------------------------------------------

function leesDocumentformulier(formulier: FormData, terugNaar: string) {
  const soort = String(formulier.get("soort") ?? "andere");
  if (!isSoortDocument(soort)) terug(terugNaar, "fout", "Kies wat voor document het is.");
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Geef het document een titel.");
  return {
    soort,
    titel: titel.slice(0, 200),
    partij_id: id(formulier.get("partij_id")),
    datum: leesDag(formulier, "datum", "De datum", terugNaar),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegDocumentToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const terugNaar = documenten(huis.id);
  const document = leesDocumentformulier(formulier, terugNaar);
  const bestandId = id(formulier.get("bestand_id"));
  if (!bestandId) terug(terugNaar, "fout", "Kies eerst de PDF.");
  const afgerond = await rondUploadAf(huis.id, bestandId);
  if (!afgerond.ok) terug(terugNaar, "fout", afgerond.melding);
  if (afgerond.data.doel !== "document") terug(terugNaar, "fout", "Dit bestand is geen document.");
  try {
    await voegDocumentToe(huis.id, { ...document, bestand_id: bestandId, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    await ruimOngebruikteBestandenOp(huis.id, [bestandId]).catch(() => undefined);
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `${document.titel} staat in het dossier.`);
}

export async function wijzigDocumentActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = documenten(huis.id);
  const documentId = id(formulier.get("document_id"));
  if (!documentId || !(await leesDocument(huis.id, documentId))) terug(terugNaar, "fout", "Dit document bestaat niet meer.");
  const document = leesDocumentformulier(formulier, terugNaar);
  try {
    await wijzigDocument(huis.id, documentId, document);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", "Bewaard.");
}

export async function verwijderDocumentActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = documenten(huis.id);
  const documentId = id(formulier.get("document_id"));
  if (!documentId) terug(terugNaar, "fout", "Onbekend document.");
  try {
    const bestand = await verwijderDocument(huis.id, documentId);
    if (bestand) await ruimOngebruikteBestandenOp(huis.id, [bestand]);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Document verwijderd.");
}

// ---------------------------------------------------------------------------
// Garanties
// ---------------------------------------------------------------------------

function leesGarantieformulier(formulier: FormData, terugNaar: string) {
  const wat = tekst(formulier.get("wat"));
  if (!wat) terug(terugNaar, "fout", "Zeg waarop de garantie slaat, bv. Warmtepomp.");
  return {
    wat: wat.slice(0, 200),
    partij_id: id(formulier.get("partij_id")),
    begin: leesDag(formulier, "begin", "Het begin", terugNaar, true)!,
    duur_maanden: leesMaanden(formulier, "duur_maanden", terugNaar, 600),
    document_id: id(formulier.get("document_id")),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegGarantieToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = garanties(huis.id);
  const garantie = leesGarantieformulier(formulier, terugNaar);
  try {
    await voegGarantieToe(huis.id, garantie);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `Garantie op ${garantie.wat} bewaard.`);
}

export async function wijzigGarantieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = garanties(huis.id);
  const garantieId = id(formulier.get("garantie_id"));
  if (!garantieId) terug(terugNaar, "fout", "Onbekende garantie.");
  const opnieuw = `${terugNaar}?garantie=${garantieId}`;
  const garantie = leesGarantieformulier(formulier, opnieuw);
  try {
    await wijzigGarantie(huis.id, garantieId, garantie);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", "Garantie bewaard.");
}

export async function verwijderGarantieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = garanties(huis.id);
  const garantieId = id(formulier.get("garantie_id"));
  if (!garantieId) terug(terugNaar, "fout", "Onbekende garantie.");
  try {
    await verwijderGarantie(huis.id, garantieId);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Garantie verwijderd.");
}

// ---------------------------------------------------------------------------
// Onderhoud
// ---------------------------------------------------------------------------

function leesOnderhoudformulier(formulier: FormData, terugNaar: string) {
  const wat = tekst(formulier.get("wat"));
  if (!wat) terug(terugNaar, "fout", "Zeg wat er moet gebeuren.");
  return {
    wat: wat.slice(0, 200),
    interval_maanden: leesMaanden(formulier, "interval_maanden", terugNaar, 240),
    partij_id: id(formulier.get("partij_id")),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegOnderhoudToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  const onderhoud = leesOnderhoudformulier(formulier, terugNaar);
  const laatst = leesDag(formulier, "laatst_gedaan", "Laatst gedaan", terugNaar);
  if (laatst && laatst > vandaag()) terug(terugNaar, "fout", "Laatst gedaan kan niet in de toekomst liggen.");
  try {
    await voegOnderhoudToe(huis.id, { ...onderhoud, laatst_gedaan: laatst }, korteNaam(ik.naam, ik.email));
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `${onderhoud.wat} toegevoegd.`);
}

export async function voegStandaardonderhoudToeActie(huisId: unknown): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  let aantal = 0;
  try {
    const bestaand = new Set((await lijstOnderhoud(huis.id)).map((item) => sleutelVan(item.wat)));
    for (const item of STANDAARDONDERHOUD) {
      if (bestaand.has(sleutelVan(item.wat))) continue;
      await voegOnderhoudToe(huis.id, { ...item, laatst_gedaan: null, partij_id: null, opmerking: null });
      aantal++;
    }
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(
    terugNaar,
    "goed",
    aantal === 0 ? "Het gewone onderhoud staat er al." : `${aantal} taken toegevoegd. Vul in wanneer ze laatst gebeurden.`,
  );
}

export async function wijzigOnderhoudActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  if (!onderhoudId) terug(terugNaar, "fout", "Onbekend onderhoud.");
  const opnieuw = `${terugNaar}?onderhoud=${onderhoudId}`;
  const onderhoud = leesOnderhoudformulier(formulier, opnieuw);
  try {
    await wijzigOnderhoud(huis.id, onderhoudId, onderhoud);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", "Bewaard.");
}

export async function verwijderOnderhoudActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  if (!onderhoudId) terug(terugNaar, "fout", "Onbekend onderhoud.");
  try {
    await verwijderOnderhoud(huis.id, onderhoudId);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Verwijderd, met alle beurten.");
}

/** Een beurt noteren: vandaag, of een andere dag. */
export async function beurtActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  const onderhoud = onderhoudId ? await leesOnderhoud(huis.id, onderhoudId) : null;
  if (!onderhoud) terug(terugNaar, "fout", "Dit onderhoud bestaat niet meer.");
  const dag = leesDag(formulier, "datum", "De datum", terugNaar) ?? vandaag();
  if (dag > vandaag()) terug(terugNaar, "fout", "Een beurt in de toekomst kan nog niet gebeurd zijn.");
  try {
    await registreerBeurt(huis.id, onderhoud, dag, korteNaam(ik.naam, ik.email), tekst(formulier.get("opmerking")));
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", `${onderhoud.wat}: genoteerd. Verkeerd? Bij Wijzigen kan je een beurt schrappen.`);
}

export async function verwijderBeurtActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = onderhoudslijst(huis.id);
  const beurtId = id(formulier.get("beurt_id"));
  if (!beurtId) terug(terugNaar, "fout", "Onbekende beurt.");
  let onderhoudId: number | null = null;
  try {
    onderhoudId = await verwijderBeurt(huis.id, beurtId);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Schrappen mislukt."));
  }
  terug(onderhoudId ? `${terugNaar}?onderhoud=${onderhoudId}` : terugNaar, "goed", "Beurt geschrapt.");
}
