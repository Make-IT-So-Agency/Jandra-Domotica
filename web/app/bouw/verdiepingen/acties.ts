"use server";

import { getal, id, tekst } from "@/lib/bouw/invoer";
import {
  verwijderGebouw,
  verwijderVerdieping,
  voegVerdiepingToe,
  wijzigGebouw,
  wijzigVerdieping,
  zoekOfMaakGebouw,
  type NieuweVerdieping,
} from "@/lib/bouw/opslag";
import { vereistHuisrechten } from "@/lib/bouw/huistoegang";
import { foutmelding, terug } from "@/lib/bouw/terug";

const PAD = "/bouw/verdiepingen";

/** Een getal uit het formulier, of terug met de melding als het er geen is. */
function getalOfTerug(formulier: FormData, naam: string, veld: string): number | null {
  const uitkomst = getal(formulier.get(naam), veld);
  if (!uitkomst.ok) terug(PAD, "fout", uitkomst.melding);
  return uitkomst.waarde;
}

/**
 * Leest een verdieping uit het formulier, of keert terug met wat er niet
 * klopt. Het gebouw wordt op naam gezocht en aangemaakt als het nog niet
 * bestaat; zo is een bijgebouw toevoegen één veld invullen.
 */
async function leesVerdieping(huisId: number, formulier: FormData): Promise<NieuweVerdieping> {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(PAD, "fout", "Geef de verdieping een naam.");
  const gebouw = tekst(formulier.get("gebouw"));
  if (!gebouw) terug(PAD, "fout", "Zeg bij welk gebouw de verdieping hoort, bv. Woning.");
  if (gebouw.length > 60) terug(PAD, "fout", "De naam van het gebouw is te lang.");

  const volgorde = getalOfTerug(formulier, "volgorde", "Volgorde");
  const vloerpeil = getalOfTerug(formulier, "vloerpeil_m", "Vloerpeil");
  const verdiepingshoogte = getalOfTerug(formulier, "verdiepingshoogte_m", "Verdiepingshoogte");
  const plafondhoogte = getalOfTerug(formulier, "plafondhoogte_m", "Plafondhoogte");

  for (const [hoogte, wat] of [
    [verdiepingshoogte, "De verdiepingshoogte"],
    [plafondhoogte, "De plafondhoogte"],
  ] as const) {
    if (hoogte !== null && (hoogte <= 0 || hoogte > 20)) terug(PAD, "fout", `${wat} moet tussen 0 en 20 m liggen.`);
  }
  if (plafondhoogte !== null && verdiepingshoogte !== null && plafondhoogte > verdiepingshoogte) {
    terug(PAD, "fout", "De plafondhoogte kan niet hoger zijn dan de verdiepingshoogte.");
  }

  let gebouwId: number;
  try {
    gebouwId = await zoekOfMaakGebouw(huisId, gebouw);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Het gebouw kon niet bewaard worden."));
  }

  return {
    gebouw_id: gebouwId,
    naam,
    volgorde: Math.round(volgorde ?? 0),
    vloerpeil_m: vloerpeil,
    verdiepingshoogte_m: verdiepingshoogte,
    plafondhoogte_m: plafondhoogte,
  };
}

export async function voegVerdiepingToeActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const verdieping = await leesVerdieping(huis.id, formulier);
  try {
    await voegVerdiepingToe(huis.id, verdieping);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(PAD, "goed", `${verdieping.naam} toegevoegd.`);
}

export async function wijzigVerdiepingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const verdiepingId = id(formulier.get("id"));
  if (!verdiepingId) terug(PAD, "fout", "Onbekende verdieping.");
  const verdieping = await leesVerdieping(huis.id, formulier);
  try {
    await wijzigVerdieping(huis.id, verdiepingId, verdieping);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", `${verdieping.naam} bewaard.`);
}

export async function verwijderVerdiepingActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const verdiepingId = id(formulier.get("id"));
  if (!verdiepingId) terug(PAD, "fout", "Onbekende verdieping.");
  try {
    await verwijderVerdieping(huis.id, verdiepingId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Verdieping verwijderd.");
}

export async function wijzigGebouwActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const gebouwId = id(formulier.get("id"));
  if (!gebouwId) terug(PAD, "fout", "Onbekend gebouw.");
  const naam = tekst(formulier.get("naam"));
  if (!naam || naam.length > 60) terug(PAD, "fout", "Geef het gebouw een naam van hoogstens 60 tekens.");
  const volgorde = getalOfTerug(formulier, "volgorde", "Volgorde");
  try {
    await wijzigGebouw(huis.id, gebouwId, { naam, volgorde: Math.round(volgorde ?? 0) });
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", `${naam} bewaard.`);
}

export async function verwijderGebouwActie(huisId: unknown, formulier: FormData): Promise<void> {
  const { huis } = await vereistHuisrechten(huisId);
  const gebouwId = id(formulier.get("id"));
  if (!gebouwId) terug(PAD, "fout", "Onbekend gebouw.");
  try {
    await verwijderGebouw(huis.id, gebouwId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Gebouw verwijderd.");
}
