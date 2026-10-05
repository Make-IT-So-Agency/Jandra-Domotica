"use server";

import { revalidatePath } from "next/cache";

import { schoneCorrecties } from "@/lib/bouw/drie/correcties";
import { isDaktype, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import { KEUZE_VAN_SLOT, SLOT_VAN, isTeTonen, keuzeVoorPlek, schoneMateriaalvraag, vloertitel } from "@/lib/bouw/drie/materialen";
import { schoneGeoref } from "@/lib/bouw/drie/omgeving";
import { schoneInplanting } from "@/lib/bouw/drie/plaatsing";
import { schoneTrapstanden } from "@/lib/bouw/drie/trappen";
import { huisgebruiker } from "@/lib/bouw/huistoegang";
import { MAX_STUKKEN, schoneStukken, type GeplaatstStuk } from "@/lib/bouw/inrichting";
import { id } from "@/lib/bouw/invoer";
import { STANDAARDKEUZES, type Keuze } from "@/lib/bouw/keuzes";
import { nietVoorSoort } from "@/lib/bouw/onderdelen";
import { bewaarCorrecties, bewaarDak, bewaarGeoref, bewaarInplanting, bewaarStukken, bewaarTrapstanden, lijstRuimtes } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { lijstKeuzes, lijstOpties, voegKeuzeToe, voegOptieToe } from "@/lib/bouw/regie-opslag";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

/** Het dak van een gebouw, zoals in het 3D-scherm ingesteld. */
export async function bewaarDakActie(huisId: unknown, vraag: { gebouwId: number; dak: Dakinstelling }): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const gebouwId = id(String(vraag?.gebouwId));
  const dak = vraag?.dak;
  if (!gebouwId || !dak || !isDaktype(String(dak.type))) return mislukt("Onbekend gebouw of dak.");
  const helling = Number(dak.helling);
  const overstek = Number(dak.overstek);
  if (!Number.isFinite(helling) || helling < 5 || helling > 60) return mislukt("De helling ligt tussen 5 en 60 graden.");
  if (!Number.isFinite(overstek) || overstek < 0 || overstek > 1.5) return mislukt("Het overstek ligt tussen 0 en 1,5 m.");
  try {
    await bewaarDak(toegang.huis.id, gebouwId, {
      type: dak.type,
      helling: Math.round(helling * 10) / 10,
      nok: dak.nok === "y" ? "y" : "x",
      overstek,
    });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}

/** Hoe de trappen van een verdieping gekozen werden: omgedraaid, een andere vorm, of geen trap. */
export async function bewaarTrappenActie(huisId: unknown, vraag: { verdiepingId: number; standen: unknown }): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  try {
    await bewaarTrapstanden(toegang.huis.id, verdiepingId, schoneTrapstanden(vraag?.standen));
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}

/** Waar de gebouwen op het terrein staan, op welk inplantingsplan en op welke schaal. */
export async function bewaarInplantingActie(huisId: unknown, vraag: unknown): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const inplanting = schoneInplanting(vraag);
  if (!inplanting) return mislukt("Onbekende plaats, plan of schaal.");
  try {
    await bewaarInplanting(toegang.huis.id, inplanting);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}

/** Waar het terrein op de kaart ligt, zoals in het 3D-scherm gelegd; null wist het, dan zoekt het scherm opnieuw. */
export async function bewaarOmgevingActie(huisId: unknown, vraag: unknown): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const georef = vraag === null ? null : schoneGeoref(vraag);
  if (vraag !== null && !georef) return mislukt("Onbekende ligging.");
  try {
    await bewaarGeoref(toegang.huis.id, georef);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}

/** Wat op het plan verbeterd werd aan de muren, ramen en deuren van een verdieping. */
export async function bewaarCorrectiesActie(huisId: unknown, vraag: { verdiepingId: number; correcties: unknown }): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  if (!Array.isArray(vraag?.correcties)) return mislukt("Onbekende correcties.");
  const correcties = schoneCorrecties(vraag.correcties);
  if (correcties.length !== vraag.correcties.length) return mislukt("Een correctie klopt niet. Herlaad de pagina en probeer opnieuw.");
  try {
    await bewaarCorrecties(toegang.huis.id, verdiepingId, correcties);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  revalidatePath(huispad(toegang.huis.id, "/3d/verbeteren"));
  return gelukt(null);
}

/** De meubels en toestellen van een verdieping, allemaal samen; terug komen ze zoals ze bewaard zijn. */
export async function bewaarStukkenActie(huisId: unknown, vraag: { verdiepingId: number; stukken: unknown }): Promise<Uitkomst<GeplaatstStuk[]>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  if (!Array.isArray(vraag?.stukken)) return mislukt("Onbekende meubels.");
  if (vraag.stukken.length > MAX_STUKKEN) return mislukt(`Hoogstens ${MAX_STUKKEN} meubels en toestellen per verdieping.`);
  const stukken = schoneStukken(vraag.stukken);
  if (stukken.length !== vraag.stukken.length) return mislukt("Een meubel of toestel klopt niet. Herlaad de pagina en probeer opnieuw.");
  let bewaard: GeplaatstStuk[];
  try {
    bewaard = await bewaarStukken(toegang.huis.id, verdiepingId, stukken);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(bewaard);
}

export interface BewaardMateriaal {
  keuzeId: number;
  optieId: number;
  /** De titel van de keuze, voor de melding. */
  titel: string;
  /** Is de keuze nieuw gemaakt? */
  nieuweKeuze: boolean;
  /** Stond hetzelfde materiaal er al als optie? */
  bestond: boolean;
}

/**
 * Een materiaal uit 3D als optie bij zijn keuze: de keuze die 3D toont, anders
 * die van het slot (Gevelsteen, Dakbedekking...) of van de aangetikte ruimte.
 * Is er nog geen, dan maakt het ze, voor een vloer met enkel die ruimte. Staat
 * hetzelfde materiaal er al, dan blijft het bij die optie. Kiezen gebeurt
 * nog altijd bij de keuze zelf.
 */
export async function bewaarMateriaalActie(huisId: unknown, vraag: unknown): Promise<Uitkomst<BewaardMateriaal>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const nee = nietVoorSoort(toegang.huis, "keuzes");
  if (nee) return mislukt(nee);
  const materiaal = schoneMateriaalvraag(vraag);
  if (!materiaal) return mislukt("Dit materiaal klopt niet. Herlaad de pagina en probeer opnieuw.");
  const huis = toegang.huis.id;
  const { slot, ruimteId } = materiaal;

  let uit: BewaardMateriaal;
  try {
    const [keuzes, opties] = await Promise.all([lijstKeuzes(huis), lijstOpties(huis)]);
    const past = (keuze: Keuze) => SLOT_VAN[keuze.categorie] === slot && (ruimteId === null || keuze.ruimte_ids.includes(ruimteId));
    const metOpties = (keuzeId: number) => opties.some((optie) => optie.keuze_id === keuzeId && isTeTonen(optie));
    const keuze =
      keuzes.find((k) => k.id === materiaal.keuzeId && past(k)) ?? keuzeVoorPlek(slot, ruimteId, keuzes, metOpties);

    let keuzeId: number;
    let titel: string;
    if (keuze) {
      keuzeId = keuze.id;
      titel = keuze.titel;
    } else {
      let ruimtes: number[] = [];
      titel = KEUZE_VAN_SLOT[slot].titel;
      if (slot === "vloer") {
        const ruimte = (await lijstRuimtes(huis)).find((r) => r.id === ruimteId);
        if (!ruimte) return mislukt("Deze ruimte bestaat niet meer. Herlaad de pagina.");
        ruimtes = [ruimte.id];
        titel = vloertitel(ruimte.naam);
      }
      const standaard = STANDAARDKEUZES.find((s) => s.titel === titel);
      keuzeId = await voegKeuzeToe(
        huis,
        {
          titel,
          categorie: KEUZE_VAN_SLOT[slot].categorie,
          omschrijving: null,
          deadline: null,
          planning_id: null,
          levertermijn_weken: standaard?.levertermijn_weken ?? null,
          eenheid: standaard?.eenheid ?? "m2",
          hoeveelheid: null,
          partij_id: null,
        },
        ruimtes,
      );
    }

    const zelfde = opties.find(
      (optie) =>
        optie.keuze_id === keuzeId &&
        !optie.foto_bestand_id &&
        optie.kleur === materiaal.kleur &&
        optie.patroon === materiaal.patroon &&
        (optie.voegkleur ?? null) === materiaal.voegkleur,
    );
    const optieId =
      zelfde?.id ??
      (await voegOptieToe(huis, {
        keuze_id: keuzeId,
        naam: materiaal.naam,
        leverancier_id: null,
        prijs: null,
        kleur: materiaal.kleur,
        patroon: materiaal.patroon,
        voegkleur: materiaal.voegkleur,
        url: null,
        opmerking: null,
        volgorde: 0,
      }));
    uit = { keuzeId, optieId, titel, nieuweKeuze: !keuze, bestond: zelfde !== undefined };
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(huis, "/3d"));
  revalidatePath(huispad(huis, "/keuzes"));
  revalidatePath(huispad(huis, `/keuzes/${uit.keuzeId}`));
  return gelukt(uit);
}
