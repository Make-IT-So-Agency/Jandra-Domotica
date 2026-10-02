"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { Aanbod } from "@/lib/bouw/bestanden";
import { bekijkDossier, leesDossierIn } from "@/lib/bouw/dossier-inlezen";
import { controleerAanvraag, type Dossieraanvraag, type Dossieruitkomst } from "@/lib/bouw/dossierregels";
import { datum, id, tekst } from "@/lib/bouw/invoer";
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
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, isSoortPlan, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { bouwgebruiker, vereistBouwrechten } from "@/lib/toegang";

const LIJST = "/bouw/plannen";
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

export async function voegPlanToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const plan = leesPlanformulier(formulier, LIJST);
  let planId: number;
  try {
    planId = await voegPlanToe(plan);
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(`${LIJST}/${planId}`, "goed", "Plan aangemaakt. Laad nu de eerste versie op.");
}

export async function wijzigPlanActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const planId = id(formulier.get("id"));
  if (!planId) terug(LIJST, "fout", "Onbekend plan.");
  const pagina = `${LIJST}/${planId}`;
  const plan = leesPlanformulier(formulier, pagina);
  try {
    await wijzigPlan(planId, plan);
  } catch (fout) {
    terug(pagina, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina, "goed", "Plan bewaard.");
}

export async function verwijderPlanActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const planId = id(formulier.get("id"));
  if (!planId) terug(LIJST, "fout", "Onbekend plan.");
  try {
    const bestanden = await verwijderPlan(planId);
    await ruimOngebruikteBestandenOp(bestanden);
  } catch (fout) {
    terug(`${LIJST}/${planId}`, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(LIJST, "goed", "Plan en versies verwijderd.");
}

export async function verwijderVersieActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const versieId = id(formulier.get("versie_id"));
  const planId = id(formulier.get("plan_id"));
  if (!versieId || !planId) terug(LIJST, "fout", "Onbekende versie.");
  const pagina = `${LIJST}/${planId}`;
  try {
    const bestandId = await verwijderVersie(versieId);
    if (bestandId) await ruimOngebruikteBestandenOp([bestandId]);
  } catch (fout) {
    terug(pagina, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(pagina, "goed", "Versie verwijderd.");
}

/** Het oorspronkelijke bestand downloaden, onder zijn eigen naam. */
export async function downloadVersieActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const versieId = id(formulier.get("versie_id"));
  const versie = versieId ? await leesVersie(versieId) : null;
  const bestand = versie ? await leesBestand(versie.bestand_id) : null;
  if (!versie || !bestand || bestand.status !== "klaar") terug(LIJST, "fout", "Dit bestand is er niet meer.");

  let url: string;
  try {
    url = await tijdelijkeUrl(bestand.pad, 60, bestand.oorspronkelijke_naam);
  } catch (fout) {
    terug(`${LIJST}/${versie.plan_id}`, "fout", foutmelding(fout, "Downloaden mislukt."));
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
export async function vraagUploadAan(vraag: Uploadvraag): Promise<Uitkomst<Gestart>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const label = leesLabel(vraag.label);
  if (!label) return mislukt("Geef de versie een label van hoogstens 40 tekens, bv. v3 of vergunning.");
  const planId = id(String(vraag.planId));
  const plan = planId ? await leesPlan(planId) : null;
  if (!plan) return mislukt("Dit plan bestaat niet meer.");
  if (plan.versies.some((versie) => versie.label === label)) {
    return mislukt(`Dit plan heeft al een versie "${label}".`);
  }

  try {
    return await startUpload(
      { naam: String(vraag.naam ?? ""), type: String(vraag.type ?? ""), grootte: Number(vraag.grootte) },
      "plan",
      ik.email,
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
export async function voegVersieToeActie(vraag: Nieuweversievraag): Promise<Uitkomst<{ versieId: number }>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const label = leesLabel(vraag.label);
  if (!label) return mislukt("Geef de versie een label van hoogstens 40 tekens.");
  const planId = id(String(vraag.planId));
  const bestandId = id(String(vraag.bestandId));
  const pagina = Number(vraag.pagina);
  if (!planId || !bestandId) return mislukt("Onbekend plan of bestand.");
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 9999) return mislukt("Kies een geldige pagina.");

  try {
    const afgerond = await rondUploadAf(bestandId);
    if (!afgerond.ok) return afgerond;
    if (afgerond.data.doel !== "plan") return mislukt("Dit bestand is geen plan.");

    const versieId = await voegVersieToe({
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
    await ruimOngebruikteBestandenOp([bestandId]).catch(() => undefined);
    return mislukt(foutmelding(fout, "De versie bewaren is mislukt."));
  }
}

/** Een URL om een versie te tonen, twee minuten geldig. Enkel nodig als de browser het plan nog niet bewaard heeft. */
export async function vraagPlanUrl(versieId: number): Promise<Uitkomst<{ url: string }>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const versie = await leesVersie(Number(versieId));
  const bestand = versie ? await leesBestand(versie.bestand_id) : null;
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
export async function vraagDossierUploadAan(vraag: Dossieruploadvraag): Promise<Uitkomst<Gestart>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const aanvraag = controleerAanvraag(vraag?.aanvraag);
  if (!aanvraag.ok) return aanvraag;
  try {
    const { fouten } = await bekijkDossier(aanvraag.data);
    if (fouten.length > 0) return mislukt(fouten.join(" "));
    const aanbod = vraag.aanbod ?? {};
    return await startUpload(
      { naam: String(aanbod.naam ?? ""), type: String(aanbod.type ?? ""), grootte: Number(aanbod.grootte) },
      "plan",
      ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

/** Stap 3: het bestand nakijken en het dossier wegschrijven. */
export async function leesDossierInActie(vraag: {
  bestandId: number;
  aanvraag: Dossieraanvraag;
}): Promise<Uitkomst<Dossieruitkomst>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const aanvraag = controleerAanvraag(vraag?.aanvraag);
  if (!aanvraag.ok) return aanvraag;
  const bestandId = id(String(vraag?.bestandId));
  if (!bestandId) return mislukt("Onbekend bestand.");

  let uitkomst: Uitkomst<Dossieruitkomst>;
  try {
    const afgerond = await rondUploadAf(bestandId);
    if (!afgerond.ok) return afgerond;
    if (afgerond.data.doel !== "plan") return mislukt("Dit bestand is geen plan.");
    uitkomst = await leesDossierIn(aanvraag.data, bestandId);
  } catch (fout) {
    uitkomst = mislukt(foutmelding(fout, "Het dossier inlezen is mislukt."));
  }
  // Een PDF waar geen enkele versie uit kwam, mag niet blijven rondslingeren.
  if (!uitkomst.ok) await ruimOngebruikteBestandenOp([bestandId]).catch(() => undefined);
  revalidatePath("/bouw", "layout");
  return uitkomst;
}
