"use server";

import { bedrag, datum, id, sleutelVan, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { STANDAARDPOSTEN, euroBedrag, isCategoriePost, isStatusMeerwerk } from "@/lib/bouw/geld";
import {
  boekInzendingIn,
  kiesOfferte,
  leesFactuur,
  leesOfferte,
  leesPost,
  lijstPosten,
  verwijderFactuur,
  verwijderKredietopname,
  verwijderMeerwerk,
  verwijderOfferte,
  verwijderPost,
  voegFactuurToe,
  voegKredietopnameToe,
  voegMeerwerkToe,
  voegOfferteToe,
  voegPostToe,
  wijzigFactuur,
  wijzigOfferte,
  wijzigPost,
  zetBestandVanFactuur,
  zetBestandVanOfferte,
  zetBetaald,
  zetMeerwerkStatus,
  type NieuwePost,
} from "@/lib/bouw/geld-opslag";
import { huisgebruiker, vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { bewaarFinanciering } from "@/lib/bouw/huizen";
import { leesInzending, zetInzendingStatus } from "@/lib/bouw/links";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { voegBeslissingToe } from "@/lib/bouw/regie-opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { mislukt, type Uitkomst } from "@/lib/bouw/types";

const LIJST = "/bouw/geld";
const FACTUREN = "/bouw/geld/facturen";
const pagina = (postId: number) => `${LIJST}/${postId}`;

/** Waar een formulier naar terug wil: enkel een pagina van Geld. */
function terugpad(formulier: FormData): string {
  const pad = String(formulier.get("terug") ?? "");
  return /^\/bouw\/geld(\/\d{1,15}|\/facturen)?$/.test(pad) ? pad : FACTUREN;
}

/** Een verplicht of optioneel bedrag uit een formulier, of terug met een melding. */
function leesBedrag(formulier: FormData, veld: string, naam: string, terugNaar: string, verplicht: boolean): number | null {
  const uitkomst = bedrag(formulier.get(veld), naam);
  if (!uitkomst.ok) terug(terugNaar, "fout", uitkomst.melding);
  if (verplicht && uitkomst.waarde === null) terug(terugNaar, "fout", `Vul ${naam.toLowerCase()} in.`);
  if (uitkomst.waarde !== null && uitkomst.waarde > 99_999_999) terug(terugNaar, "fout", `${naam} is wel erg hoog.`);
  return uitkomst.waarde;
}

function leesDatum(formulier: FormData, veld: string, naam: string, terugNaar: string): string | null {
  const ruw = tekst(formulier.get(veld));
  const waarde = datum(ruw);
  if (ruw && !waarde) terug(terugNaar, "fout", `${naam} is geen geldige datum.`);
  return waarde;
}

/** Een opgeladen PDF afronden; null als er geen is. Een bestand dat geen document is, valt weg. */
async function document(huisId: number, formulier: FormData, terugNaar: string): Promise<number | null> {
  const bestandId = id(formulier.get("bestand_id"));
  if (!bestandId) return null;
  const afgerond = await rondUploadAf(huisId, bestandId);
  if (!afgerond.ok) terug(terugNaar, "fout", afgerond.melding);
  if (afgerond.data.doel !== "document") terug(terugNaar, "fout", "Dit bestand is geen offerte of factuur.");
  return bestandId;
}

// ---------------------------------------------------------------------------
// Posten
// ---------------------------------------------------------------------------

function leesPostformulier(formulier: FormData, terugNaar: string): NieuwePost {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(terugNaar, "fout", "Geef de post een naam, bv. Ruwbouw.");
  const categorie = String(formulier.get("categorie") ?? "werken");
  if (!isCategoriePost(categorie)) terug(terugNaar, "fout", "Kies een categorie.");
  return {
    naam,
    categorie,
    raming: leesBedrag(formulier, "raming", "De raming", terugNaar, false),
    partij_id: id(formulier.get("partij_id")),
    planning_id: id(formulier.get("planning_id")),
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegPostToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const post = leesPostformulier(formulier, LIJST);
  let postId: number;
  try {
    postId = await voegPostToe(huis.id, post);
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(pagina(postId), "goed", `${post.naam} toegevoegd.`);
}

export async function voegStandaardpostenToeActie(huisId: unknown): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  let aantal = 0;
  try {
    const bestaand = new Set((await lijstPosten(huis.id)).map((post) => sleutelVan(post.naam)));
    for (const standaard of STANDAARDPOSTEN) {
      if (bestaand.has(sleutelVan(standaard.naam))) continue;
      await voegPostToe(huis.id, {
        naam: standaard.naam,
        categorie: standaard.categorie,
        raming: null,
        partij_id: null,
        planning_id: null,
        opmerking: null,
      });
      aantal++;
    }
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(LIJST, "goed", aantal === 0 ? "De gewone posten staan er al." : `${aantal} posten toegevoegd. Vul per post een raming in.`);
}

export async function wijzigPostActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const postId = id(formulier.get("id"));
  if (!postId) terug(LIJST, "fout", "Onbekende post.");
  const post = leesPostformulier(formulier, pagina(postId));
  try {
    await wijzigPost(huis.id, postId, post);
  } catch (fout) {
    terug(pagina(postId), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(postId), "goed", `${post.naam} bewaard.`);
}

export async function verwijderPostActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const postId = id(formulier.get("id"));
  if (!postId) terug(LIJST, "fout", "Onbekende post.");
  try {
    await ruimOngebruikteBestandenOp(huis.id, await verwijderPost(huis.id, postId));
  } catch (fout) {
    terug(pagina(postId), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(LIJST, "goed", "Post verwijderd.");
}

// ---------------------------------------------------------------------------
// Offertes
// ---------------------------------------------------------------------------

export async function voegOfferteToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const postId = id(formulier.get("post_id"));
  if (!postId) terug(LIJST, "fout", "Onbekende post.");
  const terugNaar = pagina(postId);
  const waarde = leesBedrag(formulier, "bedrag", "Het bedrag", terugNaar, true)!;
  const offerte = {
    post_id: postId,
    partij_id: id(formulier.get("partij_id")),
    omschrijving: tekst(formulier.get("omschrijving")),
    bedrag: waarde,
    datum: leesDatum(formulier, "datum", "De datum", terugNaar),
    geldig_tot: leesDatum(formulier, "geldig_tot", "Geldig tot", terugNaar),
    opmerking: tekst(formulier.get("opmerking")),
  };
  // Buiten de try: document() kan terug() aanroepen, en dat is een redirect.
  const bestandId = await document(huis.id, formulier, terugNaar);
  try {
    await voegOfferteToe(huis.id, { ...offerte, bestand_id: bestandId });
  } catch (fout) {
    if (bestandId) await ruimOngebruikteBestandenOp(huis.id, [bestandId]).catch(() => undefined);
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", `Offerte van ${euroBedrag(waarde)} toegevoegd.`);
}

export async function wijzigOfferteActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const offerteId = id(formulier.get("id"));
  const bestaand = offerteId ? await leesOfferte(huis.id, offerteId) : null;
  if (!offerteId || !bestaand) terug(LIJST, "fout", "Deze offerte bestaat niet meer.");
  const terugNaar = pagina(bestaand.post_id);
  // Bij een fout blijft het formulier open.
  const opnieuw = `${terugNaar}?offerte=${offerteId}`;
  const offerte = {
    partij_id: id(formulier.get("partij_id")),
    omschrijving: tekst(formulier.get("omschrijving")),
    bedrag: leesBedrag(formulier, "bedrag", "Het bedrag", opnieuw, true)!,
    datum: leesDatum(formulier, "datum", "De datum", opnieuw),
    geldig_tot: leesDatum(formulier, "geldig_tot", "Geldig tot", opnieuw),
    opmerking: tekst(formulier.get("opmerking")),
  };
  try {
    await wijzigOfferte(huis.id, offerteId, offerte);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", "Offerte bewaard.");
}

export async function verwijderOfferteActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const offerteId = id(formulier.get("id"));
  const offerte = offerteId ? await leesOfferte(huis.id, offerteId) : null;
  if (!offerteId || !offerte) terug(LIJST, "fout", "Deze offerte bestaat niet meer.");
  try {
    const bestand = await verwijderOfferte(huis.id, offerteId);
    if (bestand) await ruimOngebruikteBestandenOp(huis.id, [bestand]);
  } catch (fout) {
    terug(pagina(offerte.post_id), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(pagina(offerte.post_id), "goed", "Offerte verwijderd.");
}

/** Een offerte kiezen: de andere worden afgewezen, en het komt in het beslissingslog. */
export async function kiesOfferteActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const offerteId = id(formulier.get("id"));
  const offerte = offerteId ? await leesOfferte(huis.id, offerteId) : null;
  if (!offerteId || !offerte) terug(LIJST, "fout", "Deze offerte bestaat niet meer.");
  const terugNaar = pagina(offerte.post_id);
  const opnieuw = offerte.status === "gekozen";
  try {
    const [post, partijen] = await Promise.all([leesPost(huis.id, offerte.post_id), lijstPartijen(huis.id)]);
    if (!post) throw new Error("Deze post bestaat niet meer.");
    const partij = partijen.find((p) => p.id === offerte.partij_id)?.naam;
    await kiesOfferte(huis.id, post.id, opnieuw ? null : offerteId);
    if (!opnieuw && offerte.partij_id && post.partij_id === null) {
      // De partij van de gekozen offerte wordt de partij van de post.
      await wijzigPost(huis.id, post.id, { ...post, partij_id: offerte.partij_id });
    }
    await voegBeslissingToe(huis.id, {
      datum: vandaag(),
      onderwerp: post.naam,
      beslissing: opnieuw
        ? "De gekozen offerte is teruggedraaid."
        : `Offerte${partij ? ` van ${partij}` : ""} gekozen: ${euroBedrag(offerte.bedrag)}.`,
      keuze_id: null,
      door: korteNaam(ik.naam, ik.email),
    });
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Kiezen mislukt."));
  }
  terug(terugNaar, "goed", opnieuw ? "De offerte is niet meer gekozen." : "Offerte gekozen. Het staat in het beslissingslog.");
}

// ---------------------------------------------------------------------------
// Meer- en minwerken
// ---------------------------------------------------------------------------

export async function voegMeerwerkToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const postId = id(formulier.get("post_id"));
  if (!postId) terug(LIJST, "fout", "Onbekende post.");
  const terugNaar = pagina(postId);
  const omschrijving = tekst(formulier.get("omschrijving"));
  if (!omschrijving) terug(terugNaar, "fout", "Zeg wat het meerwerk is.");
  const waarde = leesBedrag(formulier, "bedrag", "Het bedrag", terugNaar, true)!;
  const min = formulier.get("soort") === "min";
  const wanneer = leesDatum(formulier, "datum", "De datum", terugNaar) ?? vandaag();
  try {
    await voegMeerwerkToe(huis.id, {
      post_id: postId,
      omschrijving,
      bedrag: min ? -waarde : waarde,
      datum: wanneer,
      status: "voorgesteld",
    });
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", `${min ? "Minwerk" : "Meerwerk"} toegevoegd. Het telt mee zodra het aanvaard is.`);
}

/** De knop zegt wat er moet gebeuren: name="status", met de nieuwe status of "weg" als waarde. */
export async function zetMeerwerkActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const meerwerkId = id(formulier.get("meerwerk_id"));
  const postId = id(formulier.get("post_id"));
  const status = String(formulier.get("status") ?? "");
  if (!meerwerkId || !postId) terug(LIJST, "fout", "Onbekend meerwerk.");
  try {
    if (status === "weg") await verwijderMeerwerk(huis.id, meerwerkId);
    else if (isStatusMeerwerk(status)) await zetMeerwerkStatus(huis.id, meerwerkId, status);
    else throw new Error("Onbekende status.");
  } catch (fout) {
    terug(pagina(postId), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(postId), "goed", status === "weg" ? "Meerwerk verwijderd." : "Meerwerk bewaard.");
}

// ---------------------------------------------------------------------------
// Facturen
// ---------------------------------------------------------------------------

function leesFactuurformulier(formulier: FormData, terugNaar: string) {
  const factuurdatum = leesDatum(formulier, "factuurdatum", "De factuurdatum", terugNaar);
  if (!factuurdatum) terug(terugNaar, "fout", "Vul de factuurdatum in.");
  const vervaldag = leesDatum(formulier, "vervaldag", "De vervaldag", terugNaar);
  if (vervaldag && vervaldag < factuurdatum) terug(terugNaar, "fout", "De vervaldag ligt vóór de factuurdatum.");
  const waarde = leesBedrag(formulier, "bedrag", "Het bedrag", terugNaar, true)!;
  if (waarde === 0) terug(terugNaar, "fout", "Een factuur van € 0 heeft geen zin.");
  const creditnota = formulier.get("creditnota") === "ja";
  const vennootschap = tekst(formulier.get("vennootschap_id"));
  return {
    post_id: id(formulier.get("post_id")),
    partij_id: id(formulier.get("partij_id")),
    nummer: tekst(formulier.get("nummer")),
    omschrijving: tekst(formulier.get("omschrijving")),
    bedrag: creditnota ? -waarde : waarde,
    factuurdatum,
    vervaldag,
    betaald_op: leesDatum(formulier, "betaald_op", "Betaald op", terugNaar),
    vennootschap_id: vennootschap && /^[0-9a-f-]{36}$/i.test(vennootschap) ? vennootschap : null,
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegFactuurToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = terugpad(formulier);
  const factuur = leesFactuurformulier(formulier, terugNaar);
  const bestandId = await document(huis.id, formulier, terugNaar);
  try {
    await voegFactuurToe(huis.id, { ...factuur, bestand_id: bestandId });
  } catch (fout) {
    if (bestandId) await ruimOngebruikteBestandenOp(huis.id, [bestandId]).catch(() => undefined);
    terug(terugNaar, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(terugNaar, "goed", `Factuur van ${euroBedrag(factuur.bedrag)} toegevoegd.`);
}

export async function wijzigFactuurActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const factuurId = id(formulier.get("id"));
  if (!factuurId || !(await leesFactuur(huis.id, factuurId))) terug(FACTUREN, "fout", "Deze factuur bestaat niet meer.");
  // Bij een fout blijft het formulier open.
  const opnieuw = `${FACTUREN}?factuur=${factuurId}`;
  const factuur = leesFactuurformulier(formulier, opnieuw);
  try {
    await wijzigFactuur(huis.id, factuurId, factuur);
  } catch (fout) {
    terug(opnieuw, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(FACTUREN, "goed", "Factuur bewaard.");
}

/** Betaald vandaag, of terug op niet betaald. */
export async function betaalActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const factuurId = id(formulier.get("id"));
  const factuur = factuurId ? await leesFactuur(huis.id, factuurId) : null;
  const terugNaar = terugpad(formulier);
  if (!factuurId || !factuur) terug(terugNaar, "fout", "Deze factuur bestaat niet meer.");
  try {
    await zetBetaald(huis.id, factuurId, factuur.betaald_op ? null : vandaag());
  } catch (fout) {
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", factuur.betaald_op ? "De factuur staat terug open." : "Betaald. Dank je.");
}

export async function verwijderFactuurActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const factuurId = id(formulier.get("id"));
  if (!factuurId) terug(FACTUREN, "fout", "Onbekende factuur.");
  try {
    const bestand = await verwijderFactuur(huis.id, factuurId);
    if (bestand) await ruimOngebruikteBestandenOp(huis.id, [bestand]);
  } catch (fout) {
    terug(FACTUREN, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(FACTUREN, "goed", "Factuur verwijderd.");
}

// ---------------------------------------------------------------------------
// Krediet en eigen inbreng
// ---------------------------------------------------------------------------

export async function bewaarFinancieringActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const krediet = leesBedrag(formulier, "krediet", "Het krediet", LIJST, false);
  const eigen = leesBedrag(formulier, "eigen_inbreng", "De eigen inbreng", LIJST, false);
  try {
    await bewaarFinanciering(huis.id, { krediet, eigenInbreng: eigen });
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(LIJST, "goed", "Financiering bewaard.");
}

export async function voegKredietopnameToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const waarde = leesBedrag(formulier, "bedrag", "Het bedrag", FACTUREN, true)!;
  if (waarde <= 0) terug(FACTUREN, "fout", "Een opname is een positief bedrag.");
  const wanneer = leesDatum(formulier, "datum", "De datum", FACTUREN) ?? vandaag();
  try {
    await voegKredietopnameToe(huis.id, {
      datum: wanneer,
      bedrag: waarde,
      factuur_id: id(formulier.get("factuur_id")),
      opmerking: tekst(formulier.get("opmerking")),
    });
  } catch (fout) {
    terug(FACTUREN, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(FACTUREN, "goed", `Opname van ${euroBedrag(waarde)} bewaard.`);
}

export async function verwijderKredietopnameActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const opnameId = id(formulier.get("id"));
  if (!opnameId) terug(FACTUREN, "fout", "Onbekende opname.");
  try {
    await verwijderKredietopname(huis.id, opnameId);
  } catch (fout) {
    terug(FACTUREN, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(FACTUREN, "goed", "Opname verwijderd.");
}

// ---------------------------------------------------------------------------
// Een PDF opladen voor een offerte of factuur
// ---------------------------------------------------------------------------

/** Een PDF bij een offerte of factuur die er al is. Een vorige PDF gaat weg. */
export async function zetDocumentActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const terugNaar = terugpad(formulier);
  const soort = formulier.get("soort");
  const doelId = id(formulier.get("id"));
  if (!doelId || (soort !== "offerte" && soort !== "factuur")) terug(terugNaar, "fout", "Onbekende offerte of factuur.");
  const bestandId = await document(huis.id, formulier, terugNaar);
  if (!bestandId) terug(terugNaar, "fout", "Kies eerst een PDF.");
  try {
    const vorig =
      soort === "offerte"
        ? await zetBestandVanOfferte(huis.id, doelId, bestandId)
        : await zetBestandVanFactuur(huis.id, doelId, bestandId);
    if (vorig) await ruimOngebruikteBestandenOp(huis.id, [vorig]);
  } catch (fout) {
    await ruimOngebruikteBestandenOp(huis.id, [bestandId]).catch(() => undefined);
    terug(terugNaar, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(terugNaar, "goed", "PDF bewaard.");
}

export async function vraagDocumentUploadAan(
  huisId: unknown,
  aanbod: { naam: string; type: string; grootte: number },
): Promise<Uitkomst<Gestart>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  try {
    return await startUpload(
      toegang.huis.id,
      { naam: String(aanbod?.naam ?? ""), type: String(aanbod?.type ?? ""), grootte: Number(aanbod?.grootte) },
      "document",
      toegang.ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

// ---------------------------------------------------------------------------
// Wat een partij via haar link instuurde
// ---------------------------------------------------------------------------

/** Een ingestuurde offerte of factuur inboeken. Daarna sta je op de offerte of de factuur, om ze na te kijken. */
export async function boekInzendingInActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const inzendingId = id(formulier.get("inzending_id"));
  const inzending = inzendingId ? await leesInzending(huis.id, inzendingId) : null;
  if (!inzending || inzending.soort === "plan") terug(LIJST, "fout", "Deze inzending bestaat niet meer.");
  const postId = id(formulier.get("post_id"));
  let ingeboekt: { soort: "offerte" | "factuur"; id: number };
  try {
    ingeboekt = await boekInzendingIn(huis.id, inzending, postId, korteNaam(ik.naam, ik.email));
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Inboeken mislukt."));
  }
  if (ingeboekt.soort === "offerte") terug(pagina(postId!), "goed", "De offerte is ingeboekt.");
  terug(`${FACTUREN}?factuur=${ingeboekt.id}`, "goed", "De factuur is ingeboekt. Kijk ze even na.");
}

/** Niet nodig: weg ermee, ook uit de opslag. */
export async function negeerGeldinzendingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { ik, huis } = await vereistHuisrechten(huisId);
  const inzendingId = id(formulier.get("inzending_id"));
  const inzending = inzendingId ? await leesInzending(huis.id, inzendingId) : null;
  if (!inzending || inzending.soort === "plan" || inzending.status !== "nieuw") terug(LIJST, "fout", "Deze inzending bestaat niet meer.");
  try {
    await zetInzendingStatus(huis.id, inzending.id, "genegeerd", korteNaam(ik.naam, ik.email));
    await ruimOngebruikteBestandenOp(huis.id, [inzending.bestand_id]);
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Negeren mislukt."));
  }
  terug(LIJST, "goed", "De inzending is genegeerd en verwijderd.");
}
