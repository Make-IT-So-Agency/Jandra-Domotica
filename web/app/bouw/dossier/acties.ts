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
import { foutmelding, terug } from "@/lib/bouw/terug";

const DOCUMENTEN = "/bouw/dossier";
const GARANTIES = "/bouw/dossier/garanties";
const ONDERHOUD = "/bouw/dossier/onderhoud";

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
  const document = leesDocumentformulier(formulier, DOCUMENTEN);
  const bestandId = id(formulier.get("bestand_id"));
  if (!bestandId) terug(DOCUMENTEN, "fout", "Kies eerst de PDF.");
  const afgerond = await rondUploadAf(huis.id, bestandId);
  if (!afgerond.ok) terug(DOCUMENTEN, "fout", afgerond.melding);
  if (afgerond.data.doel !== "document") terug(DOCUMENTEN, "fout", "Dit bestand is geen document.");
  try {
    await voegDocumentToe(huis.id, { ...document, bestand_id: bestandId, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    await ruimOngebruikteBestandenOp(huis.id, [bestandId]).catch(() => undefined);
    terug(DOCUMENTEN, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(DOCUMENTEN, "goed", `${document.titel} staat in het dossier.`);
}

export async function wijzigDocumentActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const documentId = id(formulier.get("document_id"));
  if (!documentId || !(await leesDocument(huis.id, documentId))) terug(DOCUMENTEN, "fout", "Dit document bestaat niet meer.");
  const document = leesDocumentformulier(formulier, DOCUMENTEN);
  try {
    await wijzigDocument(huis.id, documentId, document);
  } catch (fout) {
    terug(DOCUMENTEN, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(DOCUMENTEN, "goed", "Bewaard.");
}

export async function verwijderDocumentActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const documentId = id(formulier.get("document_id"));
  if (!documentId) terug(DOCUMENTEN, "fout", "Onbekend document.");
  try {
    const bestand = await verwijderDocument(huis.id, documentId);
    if (bestand) await ruimOngebruikteBestandenOp(huis.id, [bestand]);
  } catch (fout) {
    terug(DOCUMENTEN, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(DOCUMENTEN, "goed", "Document verwijderd.");
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
  const garantie = leesGarantieformulier(formulier, GARANTIES);
  try {
    await voegGarantieToe(huis.id, garantie);
  } catch (fout) {
    terug(GARANTIES, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(GARANTIES, "goed", `Garantie op ${garantie.wat} bewaard.`);
}

export async function wijzigGarantieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const garantieId = id(formulier.get("garantie_id"));
  if (!garantieId) terug(GARANTIES, "fout", "Onbekende garantie.");
  const opnieuw = `${GARANTIES}?garantie=${garantieId}`;
  const garantie = leesGarantieformulier(formulier, opnieuw);
  try {
    await wijzigGarantie(huis.id, garantieId, garantie);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(GARANTIES, "goed", "Garantie bewaard.");
}

export async function verwijderGarantieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const garantieId = id(formulier.get("garantie_id"));
  if (!garantieId) terug(GARANTIES, "fout", "Onbekende garantie.");
  try {
    await verwijderGarantie(huis.id, garantieId);
  } catch (fout) {
    terug(GARANTIES, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(GARANTIES, "goed", "Garantie verwijderd.");
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
  const onderhoud = leesOnderhoudformulier(formulier, ONDERHOUD);
  const laatst = leesDag(formulier, "laatst_gedaan", "Laatst gedaan", ONDERHOUD);
  if (laatst && laatst > vandaag()) terug(ONDERHOUD, "fout", "Laatst gedaan kan niet in de toekomst liggen.");
  try {
    await voegOnderhoudToe(huis.id, { ...onderhoud, laatst_gedaan: laatst }, korteNaam(ik.naam, ik.email));
  } catch (fout) {
    terug(ONDERHOUD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(ONDERHOUD, "goed", `${onderhoud.wat} toegevoegd.`);
}

export async function voegStandaardonderhoudToeActie(huisId: unknown): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  let aantal = 0;
  try {
    const bestaand = new Set((await lijstOnderhoud(huis.id)).map((item) => sleutelVan(item.wat)));
    for (const item of STANDAARDONDERHOUD) {
      if (bestaand.has(sleutelVan(item.wat))) continue;
      await voegOnderhoudToe(huis.id, { ...item, laatst_gedaan: null, partij_id: null, opmerking: null });
      aantal++;
    }
  } catch (fout) {
    terug(ONDERHOUD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(
    ONDERHOUD,
    "goed",
    aantal === 0 ? "Het gewone onderhoud staat er al." : `${aantal} taken toegevoegd. Vul in wanneer ze laatst gebeurden.`,
  );
}

export async function wijzigOnderhoudActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  if (!onderhoudId) terug(ONDERHOUD, "fout", "Onbekend onderhoud.");
  const opnieuw = `${ONDERHOUD}?onderhoud=${onderhoudId}`;
  const onderhoud = leesOnderhoudformulier(formulier, opnieuw);
  try {
    await wijzigOnderhoud(huis.id, onderhoudId, onderhoud);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(ONDERHOUD, "goed", "Bewaard.");
}

export async function verwijderOnderhoudActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  if (!onderhoudId) terug(ONDERHOUD, "fout", "Onbekend onderhoud.");
  try {
    await verwijderOnderhoud(huis.id, onderhoudId);
  } catch (fout) {
    terug(ONDERHOUD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(ONDERHOUD, "goed", "Verwijderd, met alle beurten.");
}

/** Een beurt noteren: vandaag, of een andere dag. */
export async function beurtActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const onderhoudId = id(formulier.get("onderhoud_id"));
  const onderhoud = onderhoudId ? await leesOnderhoud(huis.id, onderhoudId) : null;
  if (!onderhoud) terug(ONDERHOUD, "fout", "Dit onderhoud bestaat niet meer.");
  const dag = leesDag(formulier, "datum", "De datum", ONDERHOUD) ?? vandaag();
  if (dag > vandaag()) terug(ONDERHOUD, "fout", "Een beurt in de toekomst kan nog niet gebeurd zijn.");
  try {
    await registreerBeurt(huis.id, onderhoud, dag, korteNaam(ik.naam, ik.email), tekst(formulier.get("opmerking")));
  } catch (fout) {
    terug(ONDERHOUD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(ONDERHOUD, "goed", `${onderhoud.wat}: genoteerd. Verkeerd? Bij Wijzigen kan je een beurt schrappen.`);
}

export async function verwijderBeurtActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const beurtId = id(formulier.get("beurt_id"));
  if (!beurtId) terug(ONDERHOUD, "fout", "Onbekende beurt.");
  let onderhoudId: number | null = null;
  try {
    onderhoudId = await verwijderBeurt(huis.id, beurtId);
  } catch (fout) {
    terug(ONDERHOUD, "fout", foutmelding(fout, "Schrappen mislukt."));
  }
  terug(onderhoudId ? `${ONDERHOUD}?onderhoud=${onderhoudId}` : ONDERHOUD, "goed", "Beurt geschrapt.");
}
