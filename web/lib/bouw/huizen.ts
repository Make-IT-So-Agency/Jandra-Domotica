import "server-only";

import { cache } from "react";

import { db } from "@/lib/supabase";

import { Bouwfout, HUISTABELLEN, check, geraakt, idsVanHuis } from "./databank";
import { ruimOngebruikteBestandenOp } from "./opladen";
import { isSoortHuis, type Huis, type SoortHuis } from "./types";

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

/** Het eerste huis: daar komen de oude links naar /bouw/... op uit (zie app/bouw/[[...pad]]). */
export async function oudsteHuisId(): Promise<number | null> {
  const rij = check(
    await db().from("bouw_huizen").select("id").order("id").limit(1).maybeSingle(),
    "Huizen lezen",
  ) as { id: number | string } | null;
  return rij ? Number(rij.id) : null;
}

/**
 * Het eerste huis: voor een API-route die geen ?huis= meekreeg, uit een oude
 * link of bladwijzer. De pagina's lezen hun huis uit hun adres.
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

// ---------------------------------------------------------------------------
// Huizen beheren
// ---------------------------------------------------------------------------

/** De naam van een huis: 1 tot 60 tekens, zonder spaties vooraan of achteraan. Null als ze niet past. */
export function schoneHuisnaam(waarde: unknown): string | null {
  const naam = String(waarde ?? "").trim().replace(/\s+/g, " ");
  return naam.length >= 1 && naam.length <= 60 ? naam : null;
}

const NAAM_BESTAAT = "Er is al een huis met die naam.";

/** Een nieuw huis achteraan, zonder gebouw vooraf: de Woning komt er pas als ze nodig is. */
export async function voegHuisToe(huis: { naam: string; soort: SoortHuis }): Promise<number> {
  const huizen = await lijstHuizen({ ookGearchiveerd: true });
  const volgorde = huizen.reduce((hoogste, ander) => Math.max(hoogste, ander.volgorde + 1), 0);
  const rij = check(
    await db().from("bouw_huizen").insert({ naam: huis.naam, soort: huis.soort, volgorde }).select("id").single(),
    "Huis toevoegen",
    { uniek: NAAM_BESTAAT },
  ) as { id: number | string };
  return Number(rij.id);
}

export async function wijzigHuis(id: number, huis: { naam: string; soort: SoortHuis; volgorde: number }): Promise<void> {
  geraakt(
    check(await db().from("bouw_huizen").update(huis).eq("id", id).select("id"), "Huis bewaren", { uniek: NAAM_BESTAAT }),
  );
}

/**
 * Een gearchiveerd huis verdwijnt uit het menu en uit de bot, en zijn links
 * werken niet meer. Alles blijft bewaard; terugzetten maakt het weer actief.
 */
export async function archiveerHuis(id: number, archiveren: boolean): Promise<void> {
  geraakt(
    check(
      await db()
        .from("bouw_huizen")
        .update({ gearchiveerd_op: archiveren ? new Date().toISOString() : null })
        .eq("id", id)
        .select("id"),
      "Huis bewaren",
    ),
  );
}

/** Hangt er iets aan dit huis, buiten de bestanden? Eén rij per tabel volstaat om het te weten. */
export async function heeftGegevens(id: number): Promise<boolean> {
  const tabellen = HUISTABELLEN.filter((tabel) => tabel !== "bouw_bestanden");
  const gevonden = await Promise.all(
    tabellen.map(async (tabel) => {
      const rijen = check(await db().from(tabel).select("id").eq("huis_id", id).limit(1), "Huis nakijken") as unknown[];
      return rijen.length > 0;
    }),
  );
  return gevonden.some(Boolean);
}

const NIET_LEEG = "Aan dit huis hangen nog gegevens. Archiveer het: dan verdwijnt het uit het menu en blijft alles bewaard.";

/**
 * Enkel een leeg huis verdwijnt echt. Wat er nog aan bestanden is (bv. een
 * upload die nooit afgerond werd), gaat eerst weg, uit Storage en uit de
 * databank.
 */
export async function verwijderHuis(id: number): Promise<void> {
  if (await heeftGegevens(id)) throw new Bouwfout(NIET_LEEG);
  await ruimOngebruikteBestandenOp(id, await idsVanHuis("bouw_bestanden", id));
  geraakt(
    check(await db().from("bouw_huizen").delete().eq("id", id).select("id"), "Huis verwijderen", { inGebruik: NIET_LEEG }),
  );
}
