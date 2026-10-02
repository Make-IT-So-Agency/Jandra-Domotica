"use server";

import { revalidatePath } from "next/cache";

import { datum, getal, id, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import {
  leesWerffoto,
  verwijderActiepunt,
  verwijderDagboekdag,
  verwijderWerffoto,
  voegActiepuntToe,
  voegDagboekdagToe,
  voegWerffotoToe,
  wijzigActiepunt,
  wijzigDagboekdag,
  wijzigWerffoto,
  zetActiepuntKlaar,
} from "@/lib/bouw/werf-opslag";
import { bouwgebruiker, vereistBouwrechten } from "@/lib/toegang";

const FOTOS = "/bouw/werf";
const DAGBOEK = "/bouw/werf/dagboek";
const ACTIEPUNTEN = "/bouw/werf/actiepunten";
const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

// ---------------------------------------------------------------------------
// Foto's: opladen gaat zoals elders, in drie stappen (zie lib/bouw/opladen.ts)
// ---------------------------------------------------------------------------

/** Stap 1, voor de foto en voor haar kleine versie: de browser heeft ze al verkleind tot een JPEG. */
export async function vraagWerffotoUploadAan(aanbod: { naam: string; grootte: number }): Promise<Uitkomst<Gestart>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);
  try {
    return await startUpload(
      { naam: String(aanbod?.naam ?? "foto.jpg"), type: "image/jpeg", grootte: Number(aanbod?.grootte) },
      "foto",
      ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

/** Een tijdstip uit de browser, of nu als het onzin is: niet in de toekomst, niet vóór 2000. */
function genomenOp(waarde: unknown, nu = new Date()): string {
  const tijd = new Date(String(waarde ?? ""));
  if (Number.isNaN(tijd.getTime()) || tijd.getTime() > nu.getTime() + 24 * 3600_000 || tijd.getFullYear() < 2000) {
    return nu.toISOString();
  }
  return tijd.toISOString();
}

/** Stap 3: beide bestanden nakijken en de foto bewaren. */
export async function bewaarWerffotoActie(vraag: {
  bestandId: number;
  duimId?: number | null;
  genomenOp: string;
  ruimteId?: number | null;
  verdiepingId?: number | null;
  onderschrift?: string | null;
  dagboekId?: number | null;
  opleverpuntId?: number | null;
}): Promise<Uitkomst<{ id: number }>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);
  const bestandId = id(String(vraag?.bestandId ?? ""));
  const duimId = id(String(vraag?.duimId ?? ""));
  if (!bestandId) return mislukt("Onbekend bestand.");
  const bestanden = duimId ? [bestandId, duimId] : [bestandId];

  try {
    for (const nummer of bestanden) {
      const afgerond = await rondUploadAf(nummer);
      if (!afgerond.ok) throw new Error(afgerond.melding);
      if (afgerond.data.doel !== "foto") throw new Error("Dit bestand is geen foto.");
    }
    const fotoId = await voegWerffotoToe({
      bestand_id: bestandId,
      duim_bestand_id: duimId,
      genomen_op: genomenOp(vraag?.genomenOp),
      onderschrift: tekst(String(vraag?.onderschrift ?? "").slice(0, 500)),
      verdieping_id: id(String(vraag?.verdiepingId ?? "")),
      ruimte_id: id(String(vraag?.ruimteId ?? "")),
      x_m: null,
      y_m: null,
      dagboek_id: id(String(vraag?.dagboekId ?? "")),
      opleverpunt_id: id(String(vraag?.opleverpuntId ?? "")),
      door: korteNaam(ik.naam, ik.email),
    });
    revalidatePath("/bouw/werf", "layout");
    return gelukt({ id: fotoId });
  } catch (fout) {
    await ruimOngebruikteBestandenOp(bestanden).catch(() => undefined);
    return mislukt(foutmelding(fout, "De foto bewaren is mislukt."));
  }
}

function leesPlaats(formulier: FormData, terugNaar: string) {
  const x = getal(formulier.get("x_m"), "De plaats");
  const y = getal(formulier.get("y_m"), "De plaats");
  if (!x.ok) terug(terugNaar, "fout", x.melding);
  if (!y.ok) terug(terugNaar, "fout", y.melding);
  const geprikt = x.waarde !== null && y.waarde !== null;
  return {
    verdieping_id: id(formulier.get("verdieping_id")),
    ruimte_id: id(formulier.get("ruimte_id")),
    x_m: geprikt ? x.waarde : null,
    y_m: geprikt ? y.waarde : null,
  };
}

export async function wijzigWerffotoActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const fotoId = id(formulier.get("foto_id"));
  if (!fotoId || !(await leesWerffoto(fotoId))) terug(FOTOS, "fout", "Deze foto bestaat niet meer.");
  const pagina = `${FOTOS}/foto/${fotoId}`;
  const plaats = leesPlaats(formulier, pagina);
  try {
    await wijzigWerffoto(fotoId, { onderschrift: tekst(formulier.get("onderschrift")), ...plaats });
  } catch (fout) {
    terug(pagina, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina, "goed", "Foto bewaard.");
}

export async function verwijderWerffotoActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const fotoId = id(formulier.get("foto_id"));
  if (!fotoId) terug(FOTOS, "fout", "Onbekende foto.");
  try {
    await ruimOngebruikteBestandenOp(await verwijderWerffoto(fotoId));
  } catch (fout) {
    terug(`${FOTOS}/foto/${fotoId}`, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(FOTOS, "goed", "Foto verwijderd.");
}

// ---------------------------------------------------------------------------
// Het dagboek
// ---------------------------------------------------------------------------

function leesDag(formulier: FormData, terugNaar: string) {
  const dag = datum(formulier.get("datum"));
  if (!dag) terug(terugNaar, "fout", "Kies de dag.");
  if (dag > vandaag()) terug(terugNaar, "fout", "Een dag in de toekomst hoort niet in het dagboek.");
  const inhoud = tekst(formulier.get("tekst"));
  if (!inhoud) terug(terugNaar, "fout", "Schrijf op wat er gebeurde.");
  return {
    datum: dag,
    tekst: inhoud.slice(0, 10_000),
    aanwezig: tekst(formulier.get("aanwezig")),
    weer: tekst(formulier.get("weer")),
  };
}

export async function voegDagboekToeActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const dag = leesDag(formulier, DAGBOEK);
  try {
    await voegDagboekdagToe({ ...dag, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    terug(DAGBOEK, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(DAGBOEK, "goed", "In het dagboek gezet.");
}

export async function wijzigDagboekActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const dagId = id(formulier.get("dag_id"));
  if (!dagId) terug(DAGBOEK, "fout", "Onbekende dag.");
  const dag = leesDag(formulier, DAGBOEK);
  try {
    await wijzigDagboekdag(dagId, dag);
  } catch (fout) {
    terug(DAGBOEK, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(DAGBOEK, "goed", "Bewaard.");
}

export async function verwijderDagboekActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const dagId = id(formulier.get("dag_id"));
  if (!dagId) terug(DAGBOEK, "fout", "Onbekende dag.");
  try {
    await verwijderDagboekdag(dagId);
  } catch (fout) {
    terug(DAGBOEK, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(DAGBOEK, "goed", "Verwijderd. De foto's van die dag blijven.");
}

// ---------------------------------------------------------------------------
// Actiepunten
// ---------------------------------------------------------------------------

function leesActiepunt(formulier: FormData, terugNaar: string) {
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Zeg wat er moet gebeuren.");
  const ruw = tekst(formulier.get("deadline"));
  const deadline = datum(ruw);
  if (ruw && !deadline) terug(terugNaar, "fout", "De deadline is geen geldige datum.");
  return { titel, omschrijving: tekst(formulier.get("omschrijving")), partij_id: id(formulier.get("partij_id")), deadline };
}

export async function voegActiepuntToeActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const punt = leesActiepunt(formulier, ACTIEPUNTEN);
  try {
    await voegActiepuntToe({ ...punt, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    terug(ACTIEPUNTEN, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(ACTIEPUNTEN, "goed", "Actiepunt toegevoegd.");
}

export async function wijzigActiepuntActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const puntId = id(formulier.get("punt_id"));
  if (!puntId) terug(ACTIEPUNTEN, "fout", "Onbekend actiepunt.");
  const opnieuw = `${ACTIEPUNTEN}?punt=${puntId}`;
  const punt = leesActiepunt(formulier, opnieuw);
  try {
    await wijzigActiepunt(puntId, punt);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(ACTIEPUNTEN, "goed", "Actiepunt bewaard.");
}

/** Klaar, of toch nog niet. */
export async function zetActiepuntActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const puntId = id(formulier.get("punt_id"));
  if (!puntId) terug(ACTIEPUNTEN, "fout", "Onbekend actiepunt.");
  const klaar = formulier.get("klaar") === "ja";
  try {
    await zetActiepuntKlaar(puntId, klaar);
  } catch (fout) {
    terug(ACTIEPUNTEN, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(ACTIEPUNTEN, "goed", klaar ? "Klaar. Goed zo." : "Het actiepunt staat terug open.");
}

export async function verwijderActiepuntActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const puntId = id(formulier.get("punt_id"));
  if (!puntId) terug(ACTIEPUNTEN, "fout", "Onbekend actiepunt.");
  try {
    await verwijderActiepunt(puntId);
  } catch (fout) {
    terug(ACTIEPUNTEN, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(ACTIEPUNTEN, "goed", "Actiepunt verwijderd.");
}
