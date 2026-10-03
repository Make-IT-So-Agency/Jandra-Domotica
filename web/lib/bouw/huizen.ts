import "server-only";

import { cache } from "react";

import { db } from "@/lib/supabase";

import { Bouwfout, check } from "./databank";
import { isSoortHuis, type Huis } from "./types";

/**
 * De huizen: de nieuwbouw, en later bv. het huidige huis. Elk huis heeft zijn
 * eigen gegevens; zie databank.ts voor hoe een rij bij een huis hoort.
 *
 * De naam, de projectnaam en het adres staan enkel in de databank, nooit in de
 * repository.
 */

const getal = (waarde: unknown) => (waarde === null || waarde === undefined || waarde === "" ? null : Number(waarde));

function alsHuis(rij: Record<string, unknown>): Huis {
  const soort = String(rij.soort ?? "");
  return {
    id: Number(rij.id),
    naam: String(rij.naam),
    soort: isSoortHuis(soort) ? soort : "nieuwbouw",
    projectnaam: (rij.projectnaam as string | null) ?? null,
    adres: (rij.adres as string | null) ?? null,
    krediet_totaal: getal(rij.krediet_totaal),
    eigen_inbreng: getal(rij.eigen_inbreng),
    volgorde: Number(rij.volgorde ?? 0),
    gearchiveerd_op: (rij.gearchiveerd_op as string | null) ?? null,
  };
}

/** De huizen in hun volgorde; de gearchiveerde enkel als je erom vraagt. */
export async function lijstHuizen(opties: { ookGearchiveerd?: boolean } = {}): Promise<Huis[]> {
  const rijen = check(
    await db().from("bouw_huizen").select("*").order("volgorde").order("id"),
    "Huizen lezen",
  ) as Record<string, unknown>[];
  const huizen = rijen.map(alsHuis);
  return opties.ookGearchiveerd ? huizen : huizen.filter((huis) => huis.gearchiveerd_op === null);
}

/** Eén huis, één keer per weergave opgevraagd: de layout en de pagina vragen het allebei. */
export const leesHuis = cache(async (id: number): Promise<Huis | null> => {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const rij = check(
    await db().from("bouw_huizen").select("*").eq("id", id).maybeSingle(),
    "Huis lezen",
  ) as Record<string, unknown> | null;
  return rij ? alsHuis(rij) : null;
});

/** Het eerste huis: daar komen de oude links naar /bouw/... op uit. */
export async function oudsteHuisId(): Promise<number | null> {
  const rij = check(
    await db().from("bouw_huizen").select("id").order("id").limit(1).maybeSingle(),
    "Huizen lezen",
  ) as { id: number | string } | null;
  return rij ? Number(rij.id) : null;
}

/**
 * Het huis waarop de pagina's van Bouw werken, zolang hun adres nog geen huis
 * bevat: het eerste.
 */
export async function standaardHuis(): Promise<Huis> {
  const id = await oudsteHuisId();
  const huis = id === null ? null : await leesHuis(id);
  if (!huis) throw new Bouwfout("Er is nog geen huis. Voer eerst de migraties van Bouw uit.");
  return huis;
}

/** Een lege waarde wist het veld, zodat "niet ingevuld" ook echt niets is. */
export async function bewaarProject(huisId: number, project: { projectnaam: string | null; adres: string | null }): Promise<void> {
  check(
    await db()
      .from("bouw_huizen")
      .update({ projectnaam: project.projectnaam || null, adres: project.adres || null })
      .eq("id", huisId),
    "Projectgegevens bewaren",
  );
}

export async function bewaarFinanciering(
  huisId: number,
  financiering: { krediet: number | null; eigenInbreng: number | null },
): Promise<void> {
  check(
    await db()
      .from("bouw_huizen")
      .update({ krediet_totaal: financiering.krediet, eigen_inbreng: financiering.eigenInbreng })
      .eq("id", huisId),
    "Financiering bewaren",
  );
}
