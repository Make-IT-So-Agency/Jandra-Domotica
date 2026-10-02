import "server-only";

import { db } from "@/lib/supabase";

import type { Bestand, Partij, Plan, Planversie, SoortPartij, SoortPlan, Verdieping } from "./types";

/**
 * Alles wat de module Bouw in de databank leest en schrijft. De tabellen staan
 * in supabase/migrations/20261002100000_bouw.sql. De bestanden zelf staan in
 * Storage; zie opslagruimte.ts.
 */

interface Databankfout {
  message: string;
  code?: string;
}

/** Een fout met de Postgres-code erbij, zodat een actie er een gerichte melding van kan maken. */
export class Bouwfout extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

interface Meldingen {
  /** 23505: er bestaat al iets met die naam of dat label. */
  uniek?: string;
  /** 23503: er hangt nog iets aan, of het verwijst naar iets wat er niet is. */
  inGebruik?: string;
}

function check<T>(r: { data: T; error: Databankfout | null }, wat: string, meldingen: Meldingen = {}): T {
  if (!r.error) return r.data;
  if (r.error.code === "23505" && meldingen.uniek) throw new Bouwfout(meldingen.uniek, r.error.code);
  if (r.error.code === "23503" && meldingen.inGebruik) throw new Bouwfout(meldingen.inGebruik, r.error.code);
  throw new Bouwfout(`${wat} mislukt: ${r.error.message}`, r.error.code);
}

// ---------------------------------------------------------------------------
// Het project: naam en adres. Enkel hier, nooit in de repository.
// ---------------------------------------------------------------------------

export interface Project {
  projectnaam: string | null;
  adres: string | null;
}

export async function leesProject(): Promise<Project> {
  const rijen = check(
    await db().from("bouw_instellingen").select("sleutel, waarde").in("sleutel", ["projectnaam", "adres"]),
    "Projectgegevens lezen",
  ) as { sleutel: string; waarde: string }[];
  const waarde = (sleutel: string) => rijen.find((rij) => rij.sleutel === sleutel)?.waarde ?? null;
  return { projectnaam: waarde("projectnaam"), adres: waarde("adres") };
}

/** Een lege waarde wist de instelling, zodat "niet ingevuld" ook echt niets is. */
export async function bewaarProject(project: Project): Promise<void> {
  for (const [sleutel, waarde] of Object.entries(project)) {
    if (waarde) {
      check(
        await db().from("bouw_instellingen").upsert({ sleutel, waarde, updated_at: new Date().toISOString() }),
        "Projectgegevens bewaren",
      );
    } else {
      check(await db().from("bouw_instellingen").delete().eq("sleutel", sleutel), "Projectgegevens bewaren");
    }
  }
}

// ---------------------------------------------------------------------------
// Verdiepingen
// ---------------------------------------------------------------------------

export type NieuweVerdieping = Omit<Verdieping, "id">;

/** Postgres geeft een numeric als tekst terug; wij rekenen met getallen. */
function alsVerdieping(rij: Record<string, unknown>): Verdieping {
  const getal = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
  return {
    id: Number(rij.id),
    naam: String(rij.naam),
    volgorde: Number(rij.volgorde ?? 0),
    vloerpeil_m: getal(rij.vloerpeil_m),
    verdiepingshoogte_m: getal(rij.verdiepingshoogte_m),
    plafondhoogte_m: getal(rij.plafondhoogte_m),
  };
}

export async function lijstVerdiepingen(): Promise<Verdieping[]> {
  const rijen = check(
    await db().from("bouw_verdiepingen").select("*").order("volgorde").order("naam"),
    "Verdiepingen lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsVerdieping);
}

export async function voegVerdiepingToe(verdieping: NieuweVerdieping): Promise<void> {
  check(await db().from("bouw_verdiepingen").insert(verdieping), "Verdieping toevoegen", {
    uniek: `Er bestaat al een verdieping "${verdieping.naam}".`,
  });
}

export async function wijzigVerdieping(id: number, verdieping: NieuweVerdieping): Promise<void> {
  check(await db().from("bouw_verdiepingen").update(verdieping).eq("id", id), "Verdieping bewaren", {
    uniek: `Er bestaat al een verdieping "${verdieping.naam}".`,
  });
}

export async function verwijderVerdieping(id: number): Promise<void> {
  check(await db().from("bouw_verdiepingen").delete().eq("id", id), "Verdieping verwijderen", {
    inGebruik: "Aan deze verdieping hangt nog een plan. Verwijder of verplaats dat plan eerst.",
  });
}

// ---------------------------------------------------------------------------
// Partijen
// ---------------------------------------------------------------------------

export type NieuwePartij = Omit<Partij, "id">;

export async function lijstPartijen(): Promise<Partij[]> {
  return check(
    await db().from("bouw_partijen").select("*").order("soort").order("naam"),
    "Partijen lezen",
  ) as Partij[];
}

export async function voegPartijToe(partij: NieuwePartij): Promise<void> {
  check(await db().from("bouw_partijen").insert(partij), "Partij toevoegen");
}

export async function wijzigPartij(id: number, partij: NieuwePartij): Promise<void> {
  check(await db().from("bouw_partijen").update(partij).eq("id", id), "Partij bewaren");
}

export async function verwijderPartij(id: number): Promise<void> {
  check(await db().from("bouw_partijen").delete().eq("id", id), "Partij verwijderen");
}

// ---------------------------------------------------------------------------
// Plannen en hun versies
// ---------------------------------------------------------------------------

export interface NieuwPlan {
  titel: string;
  soort: SoortPlan;
  verdieping_id: number | null;
  opmerking: string | null;
}

export interface PlanMetVersies extends Plan {
  versies: Planversie[];
}

export async function lijstPlannen(): Promise<PlanMetVersies[]> {
  const [plannen, versies] = await Promise.all([
    db().from("bouw_plannen").select("*").order("titel"),
    db().from("bouw_planversies").select("*").order("created_at"),
  ]);
  const alleVersies = check(versies, "Planversies lezen") as Planversie[];
  return (check(plannen, "Plannen lezen") as Plan[]).map((plan) => ({
    ...plan,
    versies: alleVersies.filter((versie) => versie.plan_id === plan.id),
  }));
}

export async function leesPlan(id: number): Promise<PlanMetVersies | null> {
  const plan = check(await db().from("bouw_plannen").select("*").eq("id", id).maybeSingle(), "Plan lezen") as Plan | null;
  if (!plan) return null;
  const versies = check(
    await db().from("bouw_planversies").select("*").eq("plan_id", id).order("created_at"),
    "Planversies lezen",
  ) as Planversie[];
  return { ...plan, versies };
}

export async function voegPlanToe(plan: NieuwPlan): Promise<number> {
  const rij = check(await db().from("bouw_plannen").insert(plan).select("id").single(), "Plan toevoegen", {
    inGebruik: "Die verdieping bestaat niet meer.",
  }) as { id: number };
  return rij.id;
}

export async function wijzigPlan(id: number, plan: NieuwPlan): Promise<void> {
  check(await db().from("bouw_plannen").update(plan).eq("id", id), "Plan bewaren", {
    inGebruik: "Die verdieping bestaat niet meer.",
  });
}

/** Verwijdert het plan en, via de databank, al zijn versies. De bestanden ruimt opladen.ts op. */
export async function verwijderPlan(id: number): Promise<number[]> {
  const versies = check(
    await db().from("bouw_planversies").select("bestand_id").eq("plan_id", id),
    "Planversies lezen",
  ) as { bestand_id: number }[];
  check(await db().from("bouw_plannen").delete().eq("id", id), "Plan verwijderen");
  return [...new Set(versies.map((versie) => versie.bestand_id))];
}

export interface NieuweVersie {
  plan_id: number;
  bestand_id: number;
  label: string;
  pagina: number;
  datum: string | null;
  opmerking: string | null;
}

export async function voegVersieToe(versie: NieuweVersie): Promise<number> {
  const rij = check(
    await db().from("bouw_planversies").insert(versie).select("id").single(),
    "Versie toevoegen",
    { uniek: `Dit plan heeft al een versie "${versie.label}".` },
  ) as { id: number };
  return rij.id;
}

export async function leesVersie(id: number): Promise<Planversie | null> {
  return check(
    await db().from("bouw_planversies").select("*").eq("id", id).maybeSingle(),
    "Versie lezen",
  ) as Planversie | null;
}

/** Verwijdert de versie en geeft het bestand terug, om op te ruimen als niets anders het nog gebruikt. */
export async function verwijderVersie(id: number): Promise<number | null> {
  const versie = await leesVersie(id);
  if (!versie) return null;
  check(await db().from("bouw_planversies").delete().eq("id", id), "Versie verwijderen");
  return versie.bestand_id;
}

// ---------------------------------------------------------------------------
// Het register van de bestanden in Storage
// ---------------------------------------------------------------------------

export interface NieuwBestand {
  pad: string;
  doel: string;
  oorspronkelijke_naam: string;
  mime_type: string;
  grootte_bytes: number;
  opgeladen_door: string;
}

export async function registreerBestand(bestand: NieuwBestand): Promise<Bestand> {
  return check(
    await db().from("bouw_bestanden").insert({ ...bestand, status: "wacht" }).select("*").single(),
    "Bestand registreren",
  ) as Bestand;
}

export async function leesBestand(id: number): Promise<Bestand | null> {
  return check(
    await db().from("bouw_bestanden").select("*").eq("id", id).maybeSingle(),
    "Bestand lezen",
  ) as Bestand | null;
}

export async function leesBestanden(ids: number[]): Promise<Bestand[]> {
  if (ids.length === 0) return [];
  return check(
    await db().from("bouw_bestanden").select("*").in("id", ids),
    "Bestanden lezen",
  ) as Bestand[];
}

export async function markeerKlaar(id: number, grootte: number): Promise<void> {
  check(
    await db()
      .from("bouw_bestanden")
      .update({ status: "klaar", grootte_bytes: grootte, klaar_op: new Date().toISOString() })
      .eq("id", id),
    "Bestand bevestigen",
  );
}

/** Gebruikt een planversie dit bestand nog? */
export async function wordtGebruikt(bestandId: number): Promise<boolean> {
  const rijen = check(
    await db().from("bouw_planversies").select("id").eq("bestand_id", bestandId).limit(1),
    "Gebruik van een bestand nakijken",
  ) as unknown[];
  return rijen.length > 0;
}

/** Uploads die al lang op "wacht" staan: de browser heeft ze nooit afgerond. */
export async function verlatenUploads(voor: Date): Promise<Bestand[]> {
  return check(
    await db().from("bouw_bestanden").select("*").eq("status", "wacht").lt("created_at", voor.toISOString()),
    "Verlaten uploads zoeken",
  ) as Bestand[];
}

export async function verwijderBestandRij(id: number): Promise<void> {
  check(await db().from("bouw_bestanden").delete().eq("id", id), "Bestand uit het register halen", {
    inGebruik: "Dit bestand wordt nog gebruikt door een planversie.",
  });
}

/** De PDF's die er al staan, om een ander blad uit dezelfde PDF als versie te kiezen. */
export async function lijstPlanbestanden(): Promise<Bestand[]> {
  return check(
    await db()
      .from("bouw_bestanden")
      .select("*")
      .eq("doel", "plan")
      .eq("status", "klaar")
      .order("created_at", { ascending: false }),
    "Bestanden lezen",
  ) as Bestand[];
}

// ---------------------------------------------------------------------------
// De stand, voor het overzicht
// ---------------------------------------------------------------------------

export interface Bouwstand {
  project: Project;
  verdiepingen: number;
  plannen: { id: number; titel: string; versies: number }[];
  partijen: { soort: SoortPartij }[];
  bytes: number;
}

export async function leesBouwstand(): Promise<Bouwstand> {
  const [project, verdiepingen, plannen, partijen, bestanden] = await Promise.all([
    leesProject(),
    db().from("bouw_verdiepingen").select("id"),
    lijstPlannen(),
    db().from("bouw_partijen").select("soort"),
    db().from("bouw_bestanden").select("grootte_bytes").eq("status", "klaar"),
  ]);
  const grootten = check(bestanden, "Bestanden tellen") as { grootte_bytes: number | null }[];
  return {
    project,
    verdiepingen: (check(verdiepingen, "Verdiepingen tellen") as unknown[]).length,
    plannen: plannen.map((plan) => ({ id: plan.id, titel: plan.titel, versies: plan.versies.length })),
    partijen: check(partijen, "Partijen lezen") as { soort: SoortPartij }[],
    bytes: grootten.reduce((som, rij) => som + Number(rij.grootte_bytes ?? 0), 0),
  };
}
