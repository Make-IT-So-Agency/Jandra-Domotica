"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isPersoon, PERSOONSNAMEN } from "@/lib/huishouden/balans";
import {
  koppelHuishouden,
  telHoofdbeheerders,
  voegGebruikerToe,
  verwijderGebruiker,
  wijzigGebruiker,
  zoekGebruikerOpId,
} from "@/lib/gebruikers";
import {
  isGeldigeRol,
  magGebruikersBeheren,
  magGebruikerVerwijderen,
  magHuishoudenKoppelen,
  magGebruikerWijzigen,
  magUitnodigen,
  normaliseerEmail,
  type Rol,
} from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

function terug(soort: "goed" | "fout", melding: string): never {
  revalidatePath("/gebruikers");
  redirect(`/gebruikers?soort=${soort}&melding=${encodeURIComponent(melding)}`);
}

/** Leest rol en vennootschap uit het formulier en controleert ze meteen. */
function leesRolKeuze(formulier: FormData): { rol: Rol; vennootschapId: string | null } {
  const ruweRol = String(formulier.get("rol") ?? "");
  if (!isGeldigeRol(ruweRol)) terug("fout", "Kies een geldige rol.");

  const ruweVennootschap = String(formulier.get("vennootschap") ?? "").trim();
  return {
    rol: ruweRol,
    // Een hoofdbeheerder hangt aan geen enkele vennootschap; een meegestuurde
    // keuze negeren we dan bewust in plaats van ze te weigeren.
    vennootschapId: ruweRol === "hoofdbeheerder" ? null : ruweVennootschap || null,
  };
}

export async function nodigGebruikerUit(formulier: FormData): Promise<void> {
  const actor = await vereistGebruiker();
  if (!magGebruikersBeheren(actor)) {
    terug("fout", "Je hebt geen rechten om mensen uit te nodigen.");
  }

  const email = normaliseerEmail(String(formulier.get("email") ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    terug("fout", "Vul een geldig e-mailadres in.");
  }

  const { rol, vennootschapId } = leesRolKeuze(formulier);
  const beslissing = magUitnodigen(actor, { email, rol, vennootschap_id: vennootschapId });
  if (!beslissing.toegestaan) terug("fout", beslissing.reden!);

  try {
    await voegGebruikerToe({
      email,
      rol,
      vennootschap_id: vennootschapId,
      uitgenodigd_door: actor.email,
    });
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Toevoegen mislukt.");
  }

  terug(
    "goed",
    `${email} heeft nu toegang. Die persoon meldt zich aan met Google op ditzelfde adres; ` +
      `een uitnodigingsmail is niet nodig.`,
  );
}

export async function wijzigGebruikerActie(formulier: FormData): Promise<void> {
  const actor = await vereistGebruiker();

  const id = String(formulier.get("id") ?? "");
  const doelwit = id ? await zoekGebruikerOpId(id) : null;
  if (!doelwit) terug("fout", "Deze gebruiker bestaat niet meer.");

  const { rol, vennootschapId } = leesRolKeuze(formulier);
  const beslissing = magGebruikerWijzigen(
    actor,
    doelwit,
    { rol, vennootschap_id: vennootschapId },
    await telHoofdbeheerders(),
  );
  if (!beslissing.toegestaan) terug("fout", beslissing.reden!);

  try {
    await wijzigGebruiker(id, rol, vennootschapId);
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Wijzigen mislukt.");
  }

  terug("goed", `De rechten van ${doelwit.email} zijn aangepast.`);
}

/** Koppelt iemand aan Jan of Sandra in Huishouden, of maakt dat los. Enkel de hoofdbeheerder. */
export async function koppelHuishoudenActie(formulier: FormData): Promise<void> {
  const actor = await vereistGebruiker();
  if (!magHuishoudenKoppelen(actor)) terug("fout", "Enkel de hoofdbeheerder koppelt iemand aan Huishouden.");

  const id = String(formulier.get("id") ?? "");
  const doelwit = id ? await zoekGebruikerOpId(id) : null;
  if (!doelwit) terug("fout", "Deze gebruiker bestaat niet meer.");

  const keuze = String(formulier.get("huishouden") ?? "");
  const persoon = isPersoon(keuze) ? keuze : null;
  if (keuze && !persoon) terug("fout", "Kies Jan, Sandra of niemand.");

  try {
    await koppelHuishouden(id, persoon);
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Koppelen mislukt.");
  }

  terug(
    "goed",
    persoon
      ? `${doelwit.email} is in Huishouden nu ${PERSOONSNAMEN[persoon]}.`
      : `${doelwit.email} ziet Huishouden niet meer.`,
  );
}

export async function verwijderGebruikerActie(formulier: FormData): Promise<void> {
  const actor = await vereistGebruiker();

  const id = String(formulier.get("id") ?? "");
  const doelwit = id ? await zoekGebruikerOpId(id) : null;
  if (!doelwit) terug("fout", "Deze gebruiker bestaat niet meer.");

  const beslissing = magGebruikerVerwijderen(actor, doelwit, await telHoofdbeheerders());
  if (!beslissing.toegestaan) terug("fout", beslissing.reden!);

  try {
    await verwijderGebruiker(id);
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Verwijderen mislukt.");
  }

  terug("goed", `${doelwit.email} heeft geen toegang meer.`);
}
