import "server-only";

import { notFound } from "next/navigation";

import type { Gebruiker } from "@/lib/rollen";
import { bouwgebruiker, vereistBouwrechten } from "@/lib/toegang";

import { leesHuis, standaardHuis } from "./huizen";
import { id as leesId } from "./invoer";
import { nietVoorSoort, type Bouwonderdeel } from "./onderdelen";
import type { Huis } from "./types";

/**
 * Een actie van Bouw krijgt haar huis mee via .bind(null, huis.id). Wat de
 * browser meestuurt, is niet te vertrouwen: het nummer wordt hier opnieuw
 * gelezen, en het huis moet bestaan.
 */

function alsId(waarde: unknown): number | null {
  if (typeof waarde === "number") return leesId(String(waarde));
  return typeof waarde === "string" ? leesId(waarde) : null;
}

/**
 * Voor formulieracties: gooit als de gebruiker of het huis niet klopt, of als
 * het huis het onderdeel van de actie niet heeft (een bestaand huis heeft geen
 * keuzes, planning of werf).
 */
export async function vereistHuisrechten(huisId: unknown, onderdeel?: Bouwonderdeel): Promise<{ ik: Gebruiker; huis: Huis }> {
  const ik = await vereistBouwrechten();
  const id = alsId(huisId);
  const huis = id === null ? null : await leesHuis(id);
  if (!huis) throw new Error("Dit huis bestaat niet (meer). Laad de pagina opnieuw.");
  const nee = onderdeel ? nietVoorSoort(huis, onderdeel) : null;
  if (nee) throw new Error(nee);
  return { ik, huis };
}

/** Voor acties die de browser zelf aanroept: null in plaats van te gooien. */
export async function huisgebruiker(huisId: unknown): Promise<{ ik: Gebruiker; huis: Huis } | null> {
  const ik = await bouwgebruiker();
  if (!ik) return null;
  const id = alsId(huisId);
  const huis = id === null ? null : await leesHuis(id);
  return huis ? { ik, huis } : null;
}

/**
 * Voor een API-route van Bouw: wie het vraagt en voor welk huis. Het huis staat
 * in ?huis=; zonder is het het standaardhuis. Null voor wie Bouw niet mag zien
 * en voor een onbekend huis: liever niets dan de gegevens van een ander huis.
 */
export async function huisVoorRoute(request: Request): Promise<{ ik: Gebruiker; huis: Huis } | null> {
  const ik = await bouwgebruiker();
  if (!ik) return null;
  const gevraagd = new URL(request.url).searchParams.get("huis");
  if (gevraagd === null) return { ik, huis: await standaardHuis() };
  const id = alsId(gevraagd);
  const huis = id === null ? null : await leesHuis(id);
  return huis ? { ik, huis } : null;
}

/**
 * Het huis van een pagina onder /vastgoed/<nummer>. Een onbekend nummer geeft
 * 404, net als een id van een rij die niet bij dit huis hoort.
 */
export async function vereistHuis(params: Promise<{ huis: string }>): Promise<Huis> {
  const id = alsId((await params).huis);
  const huis = id === null ? null : await leesHuis(id);
  if (!huis) notFound();
  return huis;
}
