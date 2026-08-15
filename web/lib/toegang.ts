import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { zoekGebruiker } from "./gebruikers";
import { magInstellingenBeheren, magRapportenMaken, type Gebruiker } from "./rollen";

/**
 * De aangemelde gebruiker met zijn actuele rol.
 *
 * De rol wordt bij elke paginaweergave opnieuw opgezocht in plaats van in het
 * aanmeldkoekje bewaard. Zo werkt het intrekken van iemands toegang meteen, en
 * niet pas nadat die persoon zich opnieuw aanmeldt.
 */
export async function huidigeGebruiker(): Promise<Gebruiker | null> {
  const sessie = await auth();
  const email = sessie?.user?.email;
  if (!email) return null;

  return zoekGebruiker(email);
}

/** Voor pagina's: stuurt naar het inlogscherm als er niemand aangemeld is. */
export async function vereistGebruiker(): Promise<Gebruiker> {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect("/login");
  return gebruiker;
}

/** Voor pagina's en acties die enkel de hoofdbeheerder toekomen. */
export async function vereistHoofdbeheerder(): Promise<Gebruiker> {
  const gebruiker = await vereistGebruiker();
  if (!magInstellingenBeheren(gebruiker)) {
    throw new Error("Hier heb je geen toegang toe. Vraag het aan de hoofdbeheerder.");
  }
  return gebruiker;
}

export async function vereistRapportenrechten(): Promise<Gebruiker> {
  const gebruiker = await vereistGebruiker();
  if (!magRapportenMaken(gebruiker)) {
    throw new Error("Enkel de hoofdbeheerder kan rapporten aanmaken of verwijderen.");
  }
  return gebruiker;
}
