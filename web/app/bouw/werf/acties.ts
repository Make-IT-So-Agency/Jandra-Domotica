"use server";

import { revalidatePath } from "next/cache";

import { datum, getal, id, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { isChecksleutel, isRonde, isStap, pasStapToe } from "@/lib/bouw/werf";
import {
  leesOpleverpunt,
  leesWerffoto,
  lijstOpleverpunten,
  verwijderActiepunt,
  verwijderOpleverpunt,
  voegOpleverpuntToe,
  wijzigOpleverpunt,
  zetOpleverstap,
  zetVinkje,
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
const OPLEVERING = "/bouw/werf/oplevering";
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

// ---------------------------------------------------------------------------
// Opleverpunten
// ---------------------------------------------------------------------------

/** Waar een formulier van de oplevering naar terug wil: de lijst, eventueel gefilterd. */
function opleverpad(formulier: FormData): string {
  const pad = String(formulier.get("terug") ?? "");
  return /^\/bouw\/werf\/oplevering(\?[a-z_=&0-9-]*)?$/.test(pad) ? pad : OPLEVERING;
}

function leesOpleverformulier(formulier: FormData, terugNaar: string) {
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Zeg wat er niet in orde is, bv. Barst in de voeg.");
  const ronde = String(formulier.get("ronde") ?? "voorlopig");
  if (!isRonde(ronde)) terug(terugNaar, "fout", "Kies een ronde.");
  return {
    titel: titel.slice(0, 200),
    omschrijving: tekst(formulier.get("omschrijving")),
    partij_id: id(formulier.get("partij_id")),
    ronde,
    ...leesPlaats(formulier, terugNaar),
  };
}

export async function voegOpleverpuntToeActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const terugNaar = opleverpad(formulier);
  const punt = leesOpleverformulier(formulier, terugNaar);
  try {
    await voegOpleverpuntToe({ ...punt, door: korteNaam(ik.naam, ik.email) });
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", "Opleverpunt toegevoegd. Een foto zet je erbij in de lijst.");
}

export async function wijzigOpleverpuntActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const puntId = id(formulier.get("punt_id"));
  if (!puntId) terug(OPLEVERING, "fout", "Onbekend opleverpunt.");
  const opnieuw = `${OPLEVERING}?punt=${puntId}`;
  const punt = leesOpleverformulier(formulier, opnieuw);
  try {
    await wijzigOpleverpunt(puntId, punt);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(OPLEVERING, "goed", "Opleverpunt bewaard.");
}

export async function verwijderOpleverpuntActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const puntId = id(formulier.get("punt_id"));
  if (!puntId) terug(OPLEVERING, "fout", "Onbekend opleverpunt.");
  try {
    await verwijderOpleverpunt(puntId);
  } catch (fout) {
    terug(OPLEVERING, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(OPLEVERING, "goed", "Opleverpunt verwijderd. Zijn foto's blijven bij de werf.");
}

/** Een stap op een opleverpunt; de knop zegt welke (name="stap"). */
export async function zetOpleverstapActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const terugNaar = opleverpad(formulier);
  const puntId = id(formulier.get("punt_id"));
  const stap = String(formulier.get("stap") ?? "");
  const punt = puntId ? await leesOpleverpunt(puntId) : null;
  if (!punt || !isStap(stap)) terug(terugNaar, "fout", "Dit opleverpunt bestaat niet meer.");
  const uitkomst = pasStapToe(punt, stap, "wij", korteNaam(ik.naam, ik.email), new Date(), tekst(formulier.get("opmerking")));
  if (!uitkomst.ok) terug(terugNaar, "fout", uitkomst.melding);
  let gelukt = false;
  try {
    gelukt = await zetOpleverstap(punt.id, punt.status, uitkomst.waarde);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  if (!gelukt) terug(terugNaar, "fout", "Iemand anders paste dit punt net aan. Kijk het opnieuw na.");
  terug(terugNaar, "goed", `"${punt.titel}": ${uitkomst.waarde.status === "gecontroleerd" ? "in orde" : uitkomst.waarde.status}.`);
}

/** Alles wat van één aannemer nog open staat, op gemeld zetten: als je hem de lijst bezorgt. */
export async function meldAllesActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const terugNaar = opleverpad(formulier);
  const partijId = id(formulier.get("partij_id"));
  if (!partijId) terug(terugNaar, "fout", "Kies een aannemer.");
  let aantal = 0;
  try {
    const nu = new Date();
    for (const punt of await lijstOpleverpunten({ partijId })) {
      if (punt.status !== "open") continue;
      const stap = pasStapToe(punt, "melden", "wij", korteNaam(ik.naam, ik.email), nu);
      if (stap.ok && (await zetOpleverstap(punt.id, "open", stap.waarde))) aantal++;
    }
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Melden mislukt."));
  }
  terug(terugNaar, "goed", aantal === 0 ? "Er stond niets open." : `${aantal === 1 ? "1 punt" : `${aantal} punten`} op gemeld gezet.`);
}

// ---------------------------------------------------------------------------
// De checklist vóór alles dichtgaat
// ---------------------------------------------------------------------------

/** Een vinkje zetten of weghalen; de browser roept dit zelf aan. */
export async function zetVinkjeActie(vraag: { ruimteId: number; sleutel: string; aan: boolean }): Promise<Uitkomst<null>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);
  const ruimteId = id(String(vraag?.ruimteId ?? ""));
  const sleutel = String(vraag?.sleutel ?? "");
  if (!ruimteId || !isChecksleutel(sleutel)) return mislukt("Onbekend punt van de checklist.");
  try {
    await zetVinkje(ruimteId, sleutel, vraag?.aan === true, korteNaam(ik.naam, ik.email));
    revalidatePath("/bouw/werf/checklist");
    return gelukt(null);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
}
