"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Aanbod } from "@/lib/bouw/bestanden";
import { bekijkDossier, leesDossierIn } from "@/lib/bouw/dossier-inlezen";
import { controleerAanvraag, type Dossieraanvraag, type Dossieruitkomst } from "@/lib/bouw/dossierregels";
import { huisgebruiker, vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { datum, id, tekst } from "@/lib/bouw/invoer";
import { korteNaam } from "@/lib/bouw/keuzes";
import { leesInzending, zetInzendingStatus } from "@/lib/bouw/links";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import {
  leesBestand,
  leesPlan,
  leesVersie,
  verwijderPlan,
  verwijderVersie,
  voegPlanToe,
  voegVersieToe,
  wijzigPlan,
  type NieuwPlan,
} from "@/lib/bouw/opslag";
import { tijdelijkeUrl } from "@/lib/bouw/opslagruimte";
import { VASTGOED, huispad } from "@/lib/bouw/paden";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, isSoortPlan, mislukt, type Uitkomst } from "@/lib/bouw/types";

const lijst = (huisId: number) => huispad(huisId, "/plannen");
const planpagina = (huisId: number, planId: number) => huispad(huisId, `/plannen/${planId}`);
const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

// ---------------------------------------------------------------------------
// Formulieren: keren terug met een melding in de URL
// ---------------------------------------------------------------------------

function leesPlanformulier(formulier: FormData, terugNaar: string): NieuwPlan {
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Geef het plan een titel.");
  const soort = String(formulier.get("soort") ?? "");
  if (!isSoortPlan(soort)) terug(terugNaar, "fout", "Kies wat voor plan dit is.");
  return {
    titel,
    soort,
    // Bij een plan op een verdieping volgt het gebouw uit de verdieping; zie opslag.ts.
    gebouw_id: id(formulier.get("gebouw_id")),
    verdieping_id: id(formulier.get("verdieping_id")),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegPlanToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = lijst(huis.id);
  const plan = leesPlanformulier(formulier, terugNaar);
  let planId: number;
  try {
    planId = await voegPlanToe(huis.id, plan);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(planpagina(huis.id, planId), "goed", "Plan aangemaakt. Laad nu de eerste versie op.");
}

export async function wijzigPlanActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const planId = id(formulier.get("id"));
  if (!planId) terug(lijst(huis.id), "fout", "Onbekend plan.");
  const pagina = planpagina(huis.id, planId);
  const plan = leesPlanformulier(formulier, pagina);
  try {
    await wijzigPlan(huis.id, planId, plan);
  } catch (fout) {
    terug(pagina, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina, "goed", "Plan bewaard.");
}

export async function verwijderPlanActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = lijst(huis.id);
  const planId = id(formulier.get("id"));
  if (!planId) terug(terugNaar, "fout", "Onbekend plan.");
  try {
    const bestanden = await verwijderPlan(huis.id, planId);
    await ruimOngebruikteBestandenOp(huis.id, bestanden);
  } catch (fout) {
    terug(planpagina(huis.id, planId), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(terugNaar, "goed", "Plan en versies verwijderd.");
}

export async function verwijderVersieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const versieId = id(formulier.get("versie_id"));
  const planId = id(formulier.get("plan_id"));
  if (!versieId || !planId) terug(lijst(huis.id), "fout", "Onbekende versie.");
  const pagina = planpagina(huis.id, planId);
  try {
    const bestandId = await verwijderVersie(huis.id, versieId);
    if (bestandId) await ruimOngebruikteBestandenOp(huis.id, [bestandId]);
  } catch (fout) {
    terug(pagina, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(pagina, "goed", "Versie verwijderd.");
}

/** Het oorspronkelijke bestand downloaden, onder zijn eigen naam. */
export async function downloadVersieActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const versieId = id(formulier.get("versie_id"));
  const versie = versieId ? await leesVersie(huis.id, versieId) : null;
  const bestand = versie ? await leesBestand(huis.id, versie.bestand_id) : null;
  if (!versie || !bestand || bestand.status !== "klaar") terug(lijst(huis.id), "fout", "Dit bestand is er niet meer.");

  let url: string;
  try {
    url = await tijdelijkeUrl(bestand.pad, 60, bestand.oorspronkelijke_naam);
  } catch (fout) {
    terug(planpagina(huis.id, versie.plan_id), "fout", foutmelding(fout, "Downloaden mislukt."));
  }
  redirect(url);
}

// ---------------------------------------------------------------------------
// Acties die de browser zelf aanroept: geven hun melding terug
// ---------------------------------------------------------------------------

export interface Uploadvraag extends Aanbod {
  planId: number;
  label: string;
}

/** Een ingetikt label: niet leeg, niet te lang. */
function leesLabel(label: unknown): string | null {
  const schoon = String(label ?? "").trim();
  return schoon.length > 0 && schoon.length <= 40 ? schoon : null;
}

/**
 * Stap 1 van het opladen. Kijkt eerst na of het label nog vrij is, zodat een
 * dubbel label niet pas na het opladen van 40 MB opvalt.
 */
export async function vraagUploadAan(huisId: unknown, vraag: Uploadvraag): Promise<Uitkomst<Gestart>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const label = leesLabel(vraag.label);
  if (!label) return mislukt("Geef de versie een label van hoogstens 40 tekens, bv. v3 of vergunning.");
  const planId = id(String(vraag.planId));
  const plan = planId ? await leesPlan(toegang.huis.id, planId) : null;
  if (!plan) return mislukt("Dit plan bestaat niet meer.");
  if (plan.versies.some((versie) => versie.label === label)) {
    return mislukt(`Dit plan heeft al een versie "${label}".`);
  }

  try {
    return await startUpload(
      toegang.huis.id,
      { naam: String(vraag.naam ?? ""), type: String(vraag.type ?? ""), grootte: Number(vraag.grootte) },
      "plan",
      toegang.ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

export interface Nieuweversievraag {
  planId: number;
  bestandId: number;
  label: string;
  pagina: number;
  datum: string | null;
}

/** Stap 3: het bestand nakijken en de versie aanmaken. Werkt ook met een PDF die er al staat. */
export async function voegVersieToeActie(huisId: unknown, vraag: Nieuweversievraag): Promise<Uitkomst<{ versieId: number }>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const label = leesLabel(vraag.label);
  if (!label) return mislukt("Geef de versie een label van hoogstens 40 tekens.");
  const planId = id(String(vraag.planId));
  const bestandId = id(String(vraag.bestandId));
  const pagina = Number(vraag.pagina);
  if (!planId || !bestandId) return mislukt("Onbekend plan of bestand.");
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 9999) return mislukt("Kies een geldige pagina.");

  try {
    const afgerond = await rondUploadAf(toegang.huis.id, bestandId);
    if (!afgerond.ok) return afgerond;
    if (afgerond.data.doel !== "plan") return mislukt("Dit bestand is geen plan.");

    const versieId = await voegVersieToe(toegang.huis.id, {
      plan_id: planId,
      bestand_id: bestandId,
      label,
      pagina,
      datum: datum(vraag.datum ?? null),
      opmerking: null,
    });
    return gelukt({ versieId });
  } catch (fout) {
    // Een nieuw bestand dat toch geen versie werd, mag niet blijven rondslingeren.
    await ruimOngebruikteBestandenOp(toegang.huis.id, [bestandId]).catch(() => undefined);
    return mislukt(foutmelding(fout, "De versie bewaren is mislukt."));
  }
}

/** Een URL om een versie te tonen, twee minuten geldig. Enkel nodig als de browser het plan nog niet bewaard heeft. */
export async function vraagPlanUrl(huisId: unknown, versieId: number): Promise<Uitkomst<{ url: string }>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const versie = await leesVersie(toegang.huis.id, Number(versieId));
  const bestand = versie ? await leesBestand(toegang.huis.id, versie.bestand_id) : null;
  if (!versie || !bestand || bestand.status !== "klaar") return mislukt("Dit plan is er niet meer.");

  try {
    return gelukt({ url: await tijdelijkeUrl(bestand.pad, 120) });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Het plan openen is mislukt."));
  }
}

// ---------------------------------------------------------------------------
// Een dossier inlezen: alle bladen van één PDF in één keer
// ---------------------------------------------------------------------------

export interface Dossieruploadvraag {
  aanbod: Aanbod;
  aanvraag: Dossieraanvraag;
}

/**
 * Stap 1: kijkt het nagekeken voorstel na (labels die al bestaan, bladen die
 * bij hetzelfde plan horen), nog voor de PDF opgeladen wordt.
 */
export async function vraagDossierUploadAan(huisId: unknown, vraag: Dossieruploadvraag): Promise<Uitkomst<Gestart>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const aanvraag = controleerAanvraag(vraag?.aanvraag);
  if (!aanvraag.ok) return aanvraag;
  try {
    const { fouten } = await bekijkDossier(toegang.huis.id, aanvraag.data);
    if (fouten.length > 0) return mislukt(fouten.join(" "));
    const aanbod = vraag.aanbod ?? {};
    return await startUpload(
      toegang.huis.id,
      { naam: String(aanbod.naam ?? ""), type: String(aanbod.type ?? ""), grootte: Number(aanbod.grootte) },
      "plan",
      toegang.ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

/** Stap 3: het bestand nakijken en het dossier wegschrijven. */
export async function leesDossierInActie(
  huisId: unknown,
  vraag: { bestandId: number; aanvraag: Dossieraanvraag },
): Promise<Uitkomst<Dossieruitkomst>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const aanvraag = controleerAanvraag(vraag?.aanvraag);
  if (!aanvraag.ok) return aanvraag;
  const bestandId = id(String(vraag?.bestandId));
  if (!bestandId) return mislukt("Onbekend bestand.");

  let uitkomst: Uitkomst<Dossieruitkomst>;
  try {
    const afgerond = await rondUploadAf(toegang.huis.id, bestandId);
    if (!afgerond.ok) return afgerond;
    if (afgerond.data.doel !== "plan") return mislukt("Dit bestand is geen plan.");
    uitkomst = await leesDossierIn(toegang.huis.id, aanvraag.data, bestandId);
  } catch (fout) {
    uitkomst = mislukt(foutmelding(fout, "Het dossier inlezen is mislukt."));
  }
  // Een PDF waar geen enkele versie uit kwam, mag niet blijven rondslingeren.
  if (!uitkomst.ok) await ruimOngebruikteBestandenOp(toegang.huis.id, [bestandId]).catch(() => undefined);
  // Heel Vastgoed, zoals terug(). Met het nummer van het huis erin treft "layout"
  // niets: Next kent die layout als /vastgoed/[huis], niet als /vastgoed/12.
  revalidatePath(VASTGOED, "layout");
  return uitkomst;
}

// ---------------------------------------------------------------------------
// Wat een partij via haar link instuurde
// ---------------------------------------------------------------------------

/** Een URL om een ingestuurd dossier in de browser te lezen, een minuut geldig. */
export async function vraagInzendingUrl(huisId: unknown, inzendingId: number): Promise<Uitkomst<{ url: string }>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const inzending = await leesInzending(toegang.huis.id, Number(inzendingId));
  const bestand = inzending ? await leesBestand(toegang.huis.id, inzending.bestand_id) : null;
  if (!inzending || !bestand || bestand.status !== "klaar") return mislukt("Dit bestand is er niet meer.");
  try {
    return gelukt({ url: await tijdelijkeUrl(bestand.pad, 60) });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Ophalen mislukt."));
  }
}

/**
 * Een ingestuurd dossier inlezen. Zoals leesDossierInActie, maar het bestand
 * staat er al: niets op te laden, en niets weg te gooien als het mislukt.
 */
export async function leesInzendingInActie(
  huisId: unknown,
  vraag: { inzendingId: number; aanvraag: Dossieraanvraag },
): Promise<Uitkomst<Dossieruitkomst & { bestandId: number }>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const aanvraag = controleerAanvraag(vraag?.aanvraag);
  if (!aanvraag.ok) return aanvraag;
  const inzending = await leesInzending(toegang.huis.id, Number(vraag?.inzendingId));
  if (!inzending) return mislukt("Deze inzending bestaat niet meer.");
  if (inzending.soort !== "plan") return mislukt("Een offerte of factuur boek je in bij Geld.");
  if (inzending.status !== "nieuw") return mislukt("Deze inzending is al ingelezen of genegeerd.");

  try {
    const { fouten } = await bekijkDossier(toegang.huis.id, aanvraag.data);
    if (fouten.length > 0) return mislukt(fouten.join(" "));
    const uitkomst = await leesDossierIn(toegang.huis.id, aanvraag.data, inzending.bestand_id);
    if (!uitkomst.ok) return uitkomst;
    await zetInzendingStatus(toegang.huis.id, inzending.id, "verwerkt", korteNaam(toegang.ik.naam, toegang.ik.email));
    revalidatePath(VASTGOED, "layout");
    return gelukt({ ...uitkomst.data, bestandId: inzending.bestand_id });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Het dossier inlezen is mislukt."));
  }
}

/** Downloaden zoals een versie, onder de naam waaronder het ingestuurd werd. */
export async function downloadInzendingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = lijst(huis.id);
  const inzendingId = id(formulier.get("id"));
  const inzending = inzendingId ? await leesInzending(huis.id, inzendingId) : null;
  const bestand = inzending ? await leesBestand(huis.id, inzending.bestand_id) : null;
  if (!inzending || !bestand || bestand.status !== "klaar") terug(terugNaar, "fout", "Dit bestand is er niet meer.");

  let url: string;
  try {
    url = await tijdelijkeUrl(bestand.pad, 60, bestand.oorspronkelijke_naam);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Downloaden mislukt."));
  }
  redirect(url);
}

/** Niet nodig: weg ermee, ook uit de opslag. */
export async function negeerInzendingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const terugNaar = lijst(huis.id);
  const inzendingId = id(formulier.get("id"));
  const inzending = inzendingId ? await leesInzending(huis.id, inzendingId) : null;
  if (!inzending) terug(terugNaar, "fout", "Deze inzending bestaat niet meer.");
  try {
    await zetInzendingStatus(huis.id, inzending.id, "genegeerd", korteNaam(ik.naam, ik.email));
    await ruimOngebruikteBestandenOp(huis.id, [inzending.bestand_id]);
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Negeren mislukt."));
  }
  terug(terugNaar, "goed", "De inzending is genegeerd en verwijderd.");
}

