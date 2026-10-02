"use server";

import { getal, id, tekst } from "@/lib/bouw/invoer";
import {
  verwijderVerdieping,
  voegVerdiepingToe,
  wijzigVerdieping,
  type NieuweVerdieping,
} from "@/lib/bouw/opslag";
import { foutmelding, terug } from "@/lib/bouw/terug";
import { vereistBouwrechten } from "@/lib/toegang";

const PAD = "/bouw/verdiepingen";

/** Een getal uit het formulier, of terug met de melding als het er geen is. */
function getalOfTerug(formulier: FormData, naam: string, veld: string): number | null {
  const uitkomst = getal(formulier.get(naam), veld);
  if (!uitkomst.ok) terug(PAD, "fout", uitkomst.melding);
  return uitkomst.waarde;
}

/** Leest een verdieping uit het formulier, of keert terug met wat er niet klopt. */
function leesVerdieping(formulier: FormData): NieuweVerdieping {
  const naam = tekst(formulier.get("naam"));
  if (!naam) terug(PAD, "fout", "Geef de verdieping een naam.");

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

  return {
    naam,
    volgorde: Math.round(volgorde ?? 0),
    vloerpeil_m: vloerpeil,
    verdiepingshoogte_m: verdiepingshoogte,
    plafondhoogte_m: plafondhoogte,
  };
}

export async function voegVerdiepingToeActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const verdieping = leesVerdieping(formulier);
  try {
    await voegVerdiepingToe(verdieping);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Toevoegen mislukt."));
  }
  terug(PAD, "goed", `${verdieping.naam} toegevoegd.`);
}

export async function wijzigVerdiepingActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const verdiepingId = id(formulier.get("id"));
  if (!verdiepingId) terug(PAD, "fout", "Onbekende verdieping.");
  const verdieping = leesVerdieping(formulier);
  try {
    await wijzigVerdieping(verdiepingId, verdieping);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Bewaren mislukt."));
  }
  terug(PAD, "goed", `${verdieping.naam} bewaard.`);
}

export async function verwijderVerdiepingActie(formulier: FormData): Promise<void> {
  await vereistBouwrechten();
  const verdiepingId = id(formulier.get("id"));
  if (!verdiepingId) terug(PAD, "fout", "Onbekende verdieping.");
  try {
    await verwijderVerdieping(verdiepingId);
  } catch (fout) {
    terug(PAD, "fout", foutmelding(fout, "Verwijderen mislukt."));
  }
  terug(PAD, "goed", "Verdieping verwijderd.");
}
