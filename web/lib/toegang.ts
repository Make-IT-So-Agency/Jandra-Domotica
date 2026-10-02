import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { zoekGebruiker } from "./gebruikers";
import { magBouwZien, magInstellingenBeheren, magRapportenMaken, type Gebruiker } from "./rollen";

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

/**
 * Voor formulieracties van Bouw. Een gewone gebruiker ziet die formulieren
 * niet eens; komt er toch zo'n aanvraag binnen, dan weigeren we ze.
 */
export async function vereistBouwrechten(): Promise<Gebruiker> {
  const gebruiker = await vereistGebruiker();
  if (!magBouwZien(gebruiker)) {
    throw new Error("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  }
  return gebruiker;
}

/**
 * Voor acties van Bouw die de browser zelf aanroept: geeft null in plaats van
 * te gooien of door te sturen, zodat de actie zelf een melding kan teruggeven.
 */
export async function bouwgebruiker(): Promise<Gebruiker | null> {
  const gebruiker = await huidigeGebruiker();
  return gebruiker && magBouwZien(gebruiker) ? gebruiker : null;
}
