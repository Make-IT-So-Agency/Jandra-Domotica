"use server";

import { revalidatePath } from "next/cache";

import { bedrag, datum, getal, id, sleutelVan, tekst } from "@/lib/bouw/invoer";
import { vandaag } from "@/lib/bouw/kalender";
import {
  EENHEDEN,
  STANDAARDKEUZES,
  beslissingstekst,
  hoeveelheidVan,
  isCategorieKeuze,
  isEenheid,
  kostVan,
  korteNaam,
} from "@/lib/bouw/keuzes";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { lijstPartijen, lijstRuimtes } from "@/lib/bouw/opslag";
import {
  beslisKeuze,
  leesKeuze,
  leesOptie,
  lijstKeuzes,
  lijstVoorkeuren,
  verwijderKeuze,
  verwijderOptie,
  voegBeslissingToe,
  voegKeuzeToe,
  voegOptieToe,
  wijzigKeuze,
  wijzigOptie,
  zetBasis,
  zetFoto,
  zetKeuzeRuimtes,
  zetVoorkeur,
  type NieuweKeuze,
  type NieuweOptie,
} from "@/lib/bouw/regie-opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import type { Gebruiker } from "@/lib/rollen";
import { bouwgebruiker, vereistBouwrechten } from "@/lib/toegang";

const LIJST = "/bouw/keuzes";
const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

const pagina = (keuzeId: number) => `${LIJST}/${keuzeId}`;
const wie = (ik: Gebruiker) => korteNaam(ik.naam, ik.email);

// ---------------------------------------------------------------------------
// Keuzes
// ---------------------------------------------------------------------------

function leesKeuzeformulier(formulier: FormData, terugNaar: string): NieuweKeuze {
  const titel = tekst(formulier.get("titel"));
  if (!titel) terug(terugNaar, "fout", "Geef de keuze een titel, bv. Gevelsteen.");
  const categorie = String(formulier.get("categorie") ?? "");
  if (!isCategorieKeuze(categorie)) terug(terugNaar, "fout", "Kies een categorie.");
  const eenheid = String(formulier.get("eenheid") ?? "totaal");
  if (!isEenheid(eenheid)) terug(terugNaar, "fout", `Kies een eenheid: ${EENHEDEN.join(", ")}.`);

  const ruweDeadline = tekst(formulier.get("deadline"));
  const deadline = datum(ruweDeadline);
  if (ruweDeadline && !deadline) terug(terugNaar, "fout", "De deadline is geen geldige datum.");

  const levertermijn = getal(formulier.get("levertermijn_weken"), "De levertermijn");
  if (!levertermijn.ok) terug(terugNaar, "fout", levertermijn.melding);
  if (levertermijn.waarde !== null && (!Number.isInteger(levertermijn.waarde) || levertermijn.waarde < 0 || levertermijn.waarde > 104)) {
    terug(terugNaar, "fout", "De levertermijn is een aantal weken, tussen 0 en 104.");
  }

  const hoeveelheid = getal(formulier.get("hoeveelheid"), "De hoeveelheid");
  if (!hoeveelheid.ok) terug(terugNaar, "fout", hoeveelheid.melding);
  if (hoeveelheid.waarde !== null && (hoeveelheid.waarde < 0 || hoeveelheid.waarde > 99_999_999)) {
    terug(terugNaar, "fout", "De hoeveelheid kan niet negatief zijn.");
  }

  return {
    titel,
    categorie,
    omschrijving: tekst(formulier.get("omschrijving")),
    deadline,
    planning_id: id(formulier.get("planning_id")),
    levertermijn_weken: levertermijn.waarde,
    eenheid,
    hoeveelheid: eenheid === "totaal" ? null : hoeveelheid.waarde,
    partij_id: id(formulier.get("partij_id")),
  };
}

export async function voegKeuzeToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const keuze = leesKeuzeformulier(formulier, LIJST);
  let keuzeId: number;
  try {
    keuzeId = await voegKeuzeToe(keuze);
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(pagina(keuzeId), "goed", `${keuze.titel} toegevoegd. Zet er nu de opties bij.`);
}

/**
 * Zet de gewone keuzes van een nieuwbouw erbij, zonder wat er al is (op titel).
 * Ruimtes van de juiste soort worden meteen gekoppeld.
 */
export async function voegStandaardkeuzesToeActie(): Promise<void> {
  await vereistBouwrechten();
  let aantal = 0;
  try {
    const [bestaand, ruimtes] = await Promise.all([lijstKeuzes(), lijstRuimtes()]);
    const titels = new Set(bestaand.map((keuze) => sleutelVan(keuze.titel)));
    for (const standaard of STANDAARDKEUZES) {
      if (titels.has(sleutelVan(standaard.titel))) continue;
      const ruimteIds = ruimtes.filter((ruimte) => standaard.ruimtesoorten?.includes(ruimte.soort)).map((ruimte) => ruimte.id);
      await voegKeuzeToe(
        {
          titel: standaard.titel,
          categorie: standaard.categorie,
          omschrijving: standaard.omschrijving ?? null,
          deadline: null,
          planning_id: null,
          levertermijn_weken: standaard.levertermijn_weken ?? null,
          eenheid: standaard.eenheid,
          hoeveelheid: null,
          partij_id: null,
        },
        ruimteIds,
      );
      aantal++;
    }
  } catch (fout) {
    terug(LIJST, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(
    LIJST,
    "goed",
    aantal === 0
      ? "De gewone keuzes staan er al."
      : `${aantal} keuzes toegevoegd. Hang ze aan een taak in de planning, dan volgt de deadline vanzelf.`,
  );
}

export async function wijzigKeuzeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const keuzeId = id(formulier.get("id"));
  if (!keuzeId) terug(LIJST, "fout", "Onbekende keuze.");
  const keuze = leesKeuzeformulier(formulier, pagina(keuzeId));
  const ruimteIds = formulier.getAll("ruimte").flatMap((waarde) => {
    const ruimteId = id(waarde);
    return ruimteId ? [ruimteId] : [];
  });
  try {
    await wijzigKeuze(keuzeId, keuze);
    await zetKeuzeRuimtes(keuzeId, ruimteIds);
  } catch (fout) {
    terug(pagina(keuzeId), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(keuzeId), "goed", "Keuze bewaard.");
}

export async function verwijderKeuzeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const keuzeId = id(formulier.get("id"));
  if (!keuzeId) terug(LIJST, "fout", "Onbekende keuze.");
  try {
    const fotos = await verwijderKeuze(keuzeId);
    await ruimOngebruikteBestandenOp(fotos);
  } catch (fout) {
    terug(pagina(keuzeId), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(LIJST, "goed", "Keuze verwijderd. Wat er al in het beslissingslog stond, blijft daar staan.");
}

// ---------------------------------------------------------------------------
// Opties
// ---------------------------------------------------------------------------

function leesOptieformulier(formulier: FormData, terugNaar: string): Omit<NieuweOptie, "keuze_id" | "volgorde"> {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(terugNaar, "fout", "Geef de optie een naam.");
  const prijs = bedrag(formulier.get("prijs"), "De prijs");
  if (!prijs.ok) terug(terugNaar, "fout", prijs.melding);
  if (prijs.waarde !== null && prijs.waarde > 9_999_999) terug(terugNaar, "fout", "Die prijs is wel erg hoog.");

  const url = tekst(formulier.get("url"));
  if (url && !/^https?:\/\/\S+$/i.test(url)) terug(terugNaar, "fout", "Een link begint met https://.");

  const metKleur = formulier.get("met_kleur") === "ja";
  const kleur = String(formulier.get("kleur") ?? "").toLowerCase();
  if (metKleur && !/^#[0-9a-f]{6}$/.test(kleur)) terug(terugNaar, "fout", "Kies een kleur.");

  return {
    naam,
    leverancier_id: id(formulier.get("leverancier_id")),
    prijs: prijs.waarde,
    kleur: metKleur ? kleur : null,
    url,
    opmerking: tekst(formulier.get("opmerking")),
  };
}

export async function voegOptieToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const keuzeId = id(formulier.get("keuze_id"));
  if (!keuzeId) terug(LIJST, "fout", "Onbekende keuze.");
  const optie = leesOptieformulier(formulier, pagina(keuzeId));
  try {
    await voegOptieToe({ ...optie, keuze_id: keuzeId, volgorde: 0 });
  } catch (fout) {
    terug(pagina(keuzeId), "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(pagina(keuzeId), "goed", `${optie.naam} toegevoegd.`);
}

export async function wijzigOptieActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const bestaand = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !bestaand) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  const optie = leesOptieformulier(formulier, pagina(bestaand.keuze_id));
  try {
    await wijzigOptie(optieId, { ...optie, volgorde: bestaand.volgorde });
  } catch (fout) {
    terug(pagina(bestaand.keuze_id), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(bestaand.keuze_id), "goed", `${optie.naam} bewaard.`);
}

export async function verwijderOptieActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const optie = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !optie) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  try {
    const keuze = await leesKeuze(optie.keuze_id);
    const foto = await verwijderOptie(optieId);
    if (foto) await ruimOngebruikteBestandenOp([foto]);
    if (keuze && keuze.gekozen_optie_id === optieId) {
      await voegBeslissingToe({
        datum: vandaag(),
        onderwerp: keuze.titel,
        beslissing: `De gekozen optie (${optie.naam}) is verwijderd; de keuze staat terug open.`,
        keuze_id: keuze.id,
        door: wie(ik),
      });
    }
  } catch (fout) {
    terug(pagina(optie.keuze_id), "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(pagina(optie.keuze_id), "goed", `${optie.naam} verwijderd.`);
}

/** Maakt een optie de basis (wat in de offerte staat), of haalt dat weg. */
export async function zetBasisActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const optie = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !optie) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  try {
    await zetBasis(optie.keuze_id, optie.basis ? null : optieId);
  } catch (fout) {
    terug(pagina(optie.keuze_id), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(
    pagina(optie.keuze_id),
    "goed",
    optie.basis ? `${optie.naam} is geen basis meer.` : `${optie.naam} is de basis; de meerprijs van de andere opties is daartegenover.`,
  );
}

/** Mijn voorkeur: nog eens op dezelfde optie tikken haalt ze weg. */
export async function voorkeurActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const optie = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !optie) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  let weg = false;
  try {
    const huidige = (await lijstVoorkeuren([optie.keuze_id])).find((voorkeur) => voorkeur.wie === ik.email);
    weg = huidige?.optie_id === optieId;
    await zetVoorkeur(optie.keuze_id, ik.email, wie(ik), weg ? null : optieId);
  } catch (fout) {
    terug(pagina(optie.keuze_id), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(optie.keuze_id), "goed", weg ? "Je voorkeur is weggehaald." : `Je voorkeur: ${optie.naam}.`);
}

/** Definitief kiezen, met een regel in het beslissingslog. */
export async function beslisActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const optie = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !optie) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  try {
    const keuze = await leesKeuze(optie.keuze_id);
    if (!keuze) throw new Error("Deze keuze bestaat niet meer.");
    const [partijen, ruimtes] = await Promise.all([lijstPartijen(), lijstRuimtes()]);
    const oppervlaktes = ruimtes.filter((ruimte) => keuze.ruimte_ids.includes(ruimte.id)).map((ruimte) => ruimte.oppervlakte_m2);
    const kost = kostVan(optie, hoeveelheidVan(keuze, oppervlaktes).waarde);
    const leverancier = partijen.find((partij) => partij.id === optie.leverancier_id)?.naam ?? null;

    await beslisKeuze(keuze.id, optieId, wie(ik));
    await voegBeslissingToe({
      datum: vandaag(),
      onderwerp: keuze.titel,
      beslissing: beslissingstekst(optie, leverancier, kost, keuze.eenheid),
      keuze_id: keuze.id,
      door: wie(ik),
    });
  } catch (fout) {
    terug(pagina(optie.keuze_id), "fout", foutmelding(fout, "Beslissen mislukt."));
  }
  terug(pagina(optie.keuze_id), "goed", `Beslist: ${optie.naam}. Het staat in het beslissingslog.`);
}

/** Een beslissing terugdraaien. Ook dat komt in het log. */
export async function heropenActie(formulier: FormData): Promise<void> {
  const ik = await vereistBouwrechten();
  const keuzeId = id(formulier.get("id"));
  const keuze = keuzeId ? await leesKeuze(keuzeId) : null;
  if (!keuzeId || !keuze) terug(LIJST, "fout", "Deze keuze bestaat niet meer.");
  try {
    const optie = keuze.gekozen_optie_id ? await leesOptie(keuze.gekozen_optie_id) : null;
    await beslisKeuze(keuzeId, null, null);
    await voegBeslissingToe({
      datum: vandaag(),
      onderwerp: keuze.titel,
      beslissing: optie ? `Terug open gezet (was: ${optie.naam}).` : "Terug open gezet.",
      keuze_id: keuzeId,
      door: wie(ik),
    });
  } catch (fout) {
    terug(pagina(keuzeId), "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(pagina(keuzeId), "goed", `${keuze.titel} staat terug open.`);
}

export async function verwijderFotoActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const optieId = id(formulier.get("id"));
  const optie = optieId ? await leesOptie(optieId) : null;
  if (!optieId || !optie) terug(LIJST, "fout", "Deze optie bestaat niet meer.");
  try {
    const oud = await zetFoto(optieId, null);
    if (oud) await ruimOngebruikteBestandenOp([oud]);
  } catch (fout) {
    terug(pagina(optie.keuze_id), "fout", foutmelding(fout, "Foto weghalen mislukt."));
  }
  terug(pagina(optie.keuze_id), "goed", "Foto weggehaald.");
}

// ---------------------------------------------------------------------------
// Een foto bij een optie: de browser verkleint ze, zet ze rechtstreeks in
// Storage, en meldt dan dat ze er staat. Zie lib/bouw/opladen.ts.
// ---------------------------------------------------------------------------

export async function vraagFotoUploadAan(vraag: { optieId: number; naam: string; grootte: number }): Promise<Uitkomst<Gestart>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);
  const optieId = id(String(vraag.optieId));
  if (!optieId || !(await leesOptie(optieId))) return mislukt("Deze optie bestaat niet meer.");
  try {
    return await startUpload(
      { naam: String(vraag.naam ?? "foto.jpg"), type: "image/jpeg", grootte: Number(vraag.grootte) },
      "foto",
      ik.email,
    );
  } catch (fout) {
    return mislukt(foutmelding(fout, "Opladen voorbereiden mislukt."));
  }
}

export async function bewaarFotoActie(vraag: { optieId: number; bestandId: number }): Promise<Uitkomst<null>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);
  const optieId = id(String(vraag.optieId));
  const bestandId = id(String(vraag.bestandId));
  if (!optieId || !bestandId) return mislukt("Onbekende optie of foto.");

  try {
    const afgerond = await rondUploadAf(bestandId);
    if (!afgerond.ok) return afgerond;
    if (afgerond.data.doel !== "foto") return mislukt("Dit bestand is geen foto.");
    const oud = await zetFoto(optieId, bestandId);
    if (oud && oud !== bestandId) await ruimOngebruikteBestandenOp([oud]);
    const optie = await leesOptie(optieId);
    if (optie) revalidatePath(pagina(optie.keuze_id));
    return gelukt(null);
  } catch (fout) {
    await ruimOngebruikteBestandenOp([bestandId]).catch(() => undefined);
    return mislukt(foutmelding(fout, "De foto bewaren is mislukt."));
  }
}
