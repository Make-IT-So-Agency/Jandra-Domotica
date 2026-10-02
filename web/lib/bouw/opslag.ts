import "server-only";

import { db } from "@/lib/supabase";

import { sleutelVan } from "./invoer";
import type { Ruimterij } from "./omzetting/bevestigen";
import type { Nieuwpunt, Punt, StatusPunt } from "./punten";
import type {
  Bestand,
  Gebouw,
  Omzetting,
  Partij,
  Plan,
  Planversie,
  Ruimte,
  SoortPartij,
  SoortPlan,
  SoortRuimte,
  Verdieping,
} from "./types";

/**
 * Alles wat de module Bouw in de databank leest en schrijft. De tabellen staan
 * in supabase/migrations/20261002100000_bouw.sql en de migraties van Bouw
 * erna. De planning, de keuzes en het beslissingslog staan apart in
 * regie-opslag.ts. De bestanden zelf staan in Storage; zie opslagruimte.ts.
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

export interface Meldingen {
  /** 23505: er bestaat al iets met die naam of dat label. */
  uniek?: string;
  /** 23503: er hangt nog iets aan, of het verwijst naar iets wat er niet is. */
  inGebruik?: string;
}

export function check<T>(r: { data: T; error: Databankfout | null }, wat: string, meldingen: Meldingen = {}): T {
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
// Gebouwen
// ---------------------------------------------------------------------------

export async function lijstGebouwen(): Promise<Gebouw[]> {
  const rijen = check(
    await db().from("bouw_gebouwen").select("*").order("volgorde").order("naam"),
    "Gebouwen lezen",
  ) as Record<string, unknown>[];
  return rijen.map((rij) => ({ id: Number(rij.id), naam: String(rij.naam), volgorde: Number(rij.volgorde ?? 0) }));
}

/**
 * Het gebouw met die naam, of een nieuw achteraan. Hoofdletters en witruimte
 * tellen niet mee, zodat "woning" uit een bladcode de bestaande Woning vindt.
 */
export async function zoekOfMaakGebouw(naam: string): Promise<number> {
  const gebouwen = await lijstGebouwen();
  const bestaand = gebouwen.find((gebouw) => sleutelVan(gebouw.naam) === sleutelVan(naam));
  if (bestaand) return bestaand.id;
  const volgorde = gebouwen.reduce((hoogste, gebouw) => Math.max(hoogste, gebouw.volgorde + 1), 0);
  const rij = check(
    await db().from("bouw_gebouwen").insert({ naam: naam.trim(), volgorde }).select("id").single(),
    "Gebouw toevoegen",
    { uniek: `Er bestaat al een gebouw "${naam.trim()}".` },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigGebouw(id: number, gebouw: Omit<Gebouw, "id">): Promise<void> {
  check(await db().from("bouw_gebouwen").update(gebouw).eq("id", id), "Gebouw bewaren", {
    uniek: `Er bestaat al een gebouw "${gebouw.naam}".`,
  });
}

export async function verwijderGebouw(id: number): Promise<void> {
  check(await db().from("bouw_gebouwen").delete().eq("id", id), "Gebouw verwijderen", {
    inGebruik: "Aan dit gebouw hangen nog verdiepingen of plannen. Verwijder of verplaats die eerst.",
  });
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
    gebouw_id: Number(rij.gebouw_id),
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

export async function leesVerdieping(id: number): Promise<Verdieping | null> {
  const rij = check(
    await db().from("bouw_verdiepingen").select("*").eq("id", id).maybeSingle(),
    "Verdieping lezen",
  ) as Record<string, unknown> | null;
  return rij ? alsVerdieping(rij) : null;
}

export async function voegVerdiepingToe(verdieping: NieuweVerdieping): Promise<number> {
  const rij = check(
    await db().from("bouw_verdiepingen").insert(verdieping).select("id").single(),
    "Verdieping toevoegen",
    { uniek: `Er bestaat al een verdieping "${verdieping.naam}" in dit gebouw.`, inGebruik: "Dat gebouw bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigVerdieping(id: number, verdieping: Partial<NieuweVerdieping>): Promise<void> {
  check(await db().from("bouw_verdiepingen").update(verdieping).eq("id", id), "Verdieping bewaren", {
    uniek: `Er bestaat al een verdieping "${verdieping.naam ?? ""}" in dit gebouw.`,
    inGebruik: "Dat gebouw bestaat niet meer.",
  });
  // Een grondplan volgt het gebouw van zijn verdieping.
  if (verdieping.gebouw_id !== undefined) {
    check(
      await db().from("bouw_plannen").update({ gebouw_id: verdieping.gebouw_id }).eq("verdieping_id", id),
      "Plannen van de verdieping bijwerken",
    );
  }
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
  gebouw_id: number | null;
  verdieping_id: number | null;
  opmerking: string | null;
  /** Enkel het dossier vult dit in; wie het weglaat, laat de bladcode ongemoeid. */
  bladcode?: string | null;
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

/** Een plan op een verdieping hoort bij het gebouw van die verdieping, wat er ook gekozen werd. */
async function metGebouwVanVerdieping(plan: NieuwPlan): Promise<NieuwPlan> {
  if (!plan.verdieping_id) return plan;
  const verdieping = await leesVerdieping(plan.verdieping_id);
  if (!verdieping) throw new Bouwfout("Die verdieping bestaat niet meer.");
  return { ...plan, gebouw_id: verdieping.gebouw_id };
}

function planmeldingen(plan: NieuwPlan): Meldingen {
  return {
    inGebruik: "Die verdieping of dat gebouw bestaat niet meer.",
    uniek: plan.bladcode ? `Er is al een plan met bladcode ${plan.bladcode}.` : undefined,
  };
}

export async function voegPlanToe(plan: NieuwPlan): Promise<number> {
  const volledig = await metGebouwVanVerdieping(plan);
  const rij = check(
    await db().from("bouw_plannen").insert(volledig).select("id").single(),
    "Plan toevoegen",
    planmeldingen(volledig),
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigPlan(id: number, plan: NieuwPlan): Promise<void> {
  const volledig = await metGebouwVanVerdieping(plan);
  check(await db().from("bouw_plannen").update(volledig).eq("id", id), "Plan bewaren", planmeldingen(volledig));
}

/** Zet de bladcode van een plan dat er al was, bv. als het dossier het herkent op zijn titel. */
export async function zetBladcode(id: number, bladcode: string): Promise<void> {
  check(await db().from("bouw_plannen").update({ bladcode }).eq("id", id), "Bladcode bewaren", {
    uniek: `Er is al een plan met bladcode ${bladcode}.`,
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

/** Legt een versie in het assenstelsel van haar gebouw; zie omzetting/geometrie.ts. */
export async function zetKalibratie(versieId: number, kalibratie: Record<string, unknown>): Promise<void> {
  check(await db().from("bouw_planversies").update({ kalibratie }).eq("id", versieId), "Kalibratie bewaren");
}

// ---------------------------------------------------------------------------
// Omzettingen en ruimtes
// ---------------------------------------------------------------------------

function alsOmzetting(rij: Record<string, unknown>): Omzetting {
  return {
    id: Number(rij.id),
    planversie_id: Number(rij.planversie_id),
    werkwijze: Number(rij.werkwijze ?? 1),
    bevestigd_door: (rij.bevestigd_door as string | null) ?? null,
    bevestigd_op: String(rij.bevestigd_op),
  };
}

/** De bevestigde omzettingen van deze versies. */
export async function lijstOmzettingen(versieIds: number[]): Promise<Omzetting[]> {
  if (versieIds.length === 0) return [];
  const rijen = check(
    await db()
      .from("bouw_omzettingen")
      .select("id, planversie_id, werkwijze, bevestigd_door, bevestigd_op")
      .in("planversie_id", versieIds),
    "Omzettingen lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsOmzetting);
}

/** Bewaart de bevestigde omzetting van een versie; een tweede keer bevestigen vervangt de eerste. */
export async function bewaarOmzetting(omzetting: {
  planversie_id: number;
  werkwijze: number;
  voorstel: Record<string, unknown>;
  bevestigd_door: string;
}): Promise<number> {
  check(
    await db()
      .from("bouw_omzettingen")
      .upsert({ ...omzetting, bevestigd_op: new Date().toISOString() }, { onConflict: "planversie_id" }),
    "Omzetting bewaren",
  );
  const rij = check(
    await db().from("bouw_omzettingen").select("id").eq("planversie_id", omzetting.planversie_id).single(),
    "Omzetting lezen",
  ) as { id: number };
  return Number(rij.id);
}

function alsRuimte(rij: Record<string, unknown>): Ruimte {
  const getal = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
  return {
    id: Number(rij.id),
    verdieping_id: Number(rij.verdieping_id),
    naam: String(rij.naam),
    soort: rij.soort as SoortRuimte,
    veelhoek: (rij.veelhoek as [number, number][][]) ?? [],
    oppervlakte_m2: Number(rij.oppervlakte_m2),
    oppervlakte_plan_m2: getal(rij.oppervlakte_plan_m2),
    plafondhoogte_m: getal(rij.plafondhoogte_m),
    vloerpeil_m: getal(rij.vloerpeil_m),
    omzetting_id: getal(rij.omzetting_id),
  };
}

/** De ruimtes, van één verdieping of van alle. */
export async function lijstRuimtes(verdiepingId?: number): Promise<Ruimte[]> {
  let vraag = db().from("bouw_ruimtes").select("*");
  if (verdiepingId !== undefined) vraag = vraag.eq("verdieping_id", verdiepingId);
  const rijen = check(await vraag.order("naam"), "Ruimtes lezen") as Record<string, unknown>[];
  return rijen.map(alsRuimte);
}

/**
 * Zet de ruimtes van een verdieping zoals de bevestigde omzetting ze geeft:
 * een ruimte met een id wordt bijgewerkt en houdt dat id, een ruimte zonder
 * id is nieuw, en wat er niet meer bij is, verdwijnt.
 */
export async function schrijfRuimtes(
  verdiepingId: number,
  omzettingId: number,
  rijen: Ruimterij[],
): Promise<{ bijgewerkt: number; nieuw: number; verwijderd: number }> {
  const bestaand = await lijstRuimtes(verdiepingId);
  const ids = new Set(bestaand.map((ruimte) => ruimte.id));
  for (const rij of rijen) {
    if (rij.id !== null && !ids.has(rij.id)) throw new Bouwfout("Een ruimte hoort niet (meer) bij deze verdieping.");
  }
  const velden = (rij: Ruimterij) => ({
    naam: rij.naam,
    soort: rij.soort,
    veelhoek: rij.veelhoek,
    oppervlakte_m2: rij.oppervlakte_m2,
    oppervlakte_plan_m2: rij.oppervlakte_plan_m2,
    plafondhoogte_m: rij.plafondhoogte_m,
    vloerpeil_m: rij.vloerpeil_m,
    omzetting_id: omzettingId,
  });

  let bijgewerkt = 0;
  let nieuw = 0;
  for (const rij of rijen) {
    if (rij.id !== null) {
      check(await db().from("bouw_ruimtes").update(velden(rij)).eq("id", rij.id), "Ruimte bewaren");
      bijgewerkt++;
    } else {
      check(await db().from("bouw_ruimtes").insert({ ...velden(rij), verdieping_id: verdiepingId }), "Ruimte toevoegen");
      nieuw++;
    }
  }
  const blijven = new Set(rijen.map((rij) => rij.id).filter((id): id is number => id !== null));
  const weg = bestaand.filter((ruimte) => !blijven.has(ruimte.id)).map((ruimte) => ruimte.id);
  if (weg.length > 0) check(await db().from("bouw_ruimtes").delete().in("id", weg), "Ruimtes verwijderen");
  return { bijgewerkt, nieuw, verwijderd: weg.length };
}

// ---------------------------------------------------------------------------
// Punten op het plan
// ---------------------------------------------------------------------------

function alsPunt(rij: Record<string, unknown>): Punt {
  return {
    id: Number(rij.id),
    verdieping_id: Number(rij.verdieping_id),
    soort: String(rij.soort),
    x_m: Number(rij.x_m),
    y_m: Number(rij.y_m),
    hoogte_m: rij.hoogte_m === null || rij.hoogte_m === undefined ? null : Number(rij.hoogte_m),
    aantal: Number(rij.aantal ?? 1),
    label: (rij.label as string | null) ?? null,
    opmerking: (rij.opmerking as string | null) ?? null,
    status: (rij.status as StatusPunt) ?? "gewenst",
  };
}

/** De punten, van één verdieping of van alle. */
export async function lijstPunten(verdiepingId?: number): Promise<Punt[]> {
  let vraag = db().from("bouw_punten").select("*");
  if (verdiepingId !== undefined) vraag = vraag.eq("verdieping_id", verdiepingId);
  const rijen = check(await vraag.order("id"), "Punten lezen") as Record<string, unknown>[];
  return rijen.map(alsPunt);
}

export async function voegPuntToe(verdiepingId: number, punt: Nieuwpunt): Promise<Punt> {
  const rij = check(
    await db().from("bouw_punten").insert({ ...punt, verdieping_id: verdiepingId }).select("*").single(),
    "Punt toevoegen",
    { inGebruik: "Deze verdieping bestaat niet meer." },
  ) as Record<string, unknown>;
  return alsPunt(rij);
}

export async function wijzigPunt(id: number, punt: Nieuwpunt): Promise<Punt | null> {
  const rijen = check(
    await db().from("bouw_punten").update(punt).eq("id", id).select("*"),
    "Punt bewaren",
  ) as Record<string, unknown>[];
  return rijen[0] ? alsPunt(rijen[0]) : null;
}

export async function verwijderPunt(id: number): Promise<void> {
  check(await db().from("bouw_punten").delete().eq("id", id), "Punt verwijderen");
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
  plannen: { id: number; titel: string; versies: number; soort: SoortPlan; omgezet: "geen" | "oud" | "laatste" }[];
  partijen: { soort: SoortPartij }[];
  bytes: number;
  ruimtes: { aantal: number; oppervlakte: number };
}

export async function leesBouwstand(): Promise<Bouwstand> {
  const [project, verdiepingen, plannen, partijen, bestanden, ruimtes, omzettingen] = await Promise.all([
    leesProject(),
    db().from("bouw_verdiepingen").select("id"),
    lijstPlannen(),
    db().from("bouw_partijen").select("soort"),
    db().from("bouw_bestanden").select("grootte_bytes").eq("status", "klaar"),
    db().from("bouw_ruimtes").select("oppervlakte_m2"),
    db().from("bouw_omzettingen").select("planversie_id"),
  ]);
  const grootten = check(bestanden, "Bestanden tellen") as { grootte_bytes: number | null }[];
  const oppervlaktes = check(ruimtes, "Ruimtes tellen") as { oppervlakte_m2: number | string }[];
  const omgezet = new Set(
    (check(omzettingen, "Omzettingen lezen") as { planversie_id: number }[]).map((o) => Number(o.planversie_id)),
  );
  return {
    project,
    verdiepingen: (check(verdiepingen, "Verdiepingen tellen") as unknown[]).length,
    plannen: plannen.map((plan) => {
      const laatste = plan.versies.at(-1);
      return {
        id: plan.id,
        titel: plan.titel,
        versies: plan.versies.length,
        soort: plan.soort,
        omgezet:
          laatste && omgezet.has(laatste.id)
            ? ("laatste" as const)
            : plan.versies.some((versie) => omgezet.has(versie.id))
              ? ("oud" as const)
              : ("geen" as const),
      };
    }),
    partijen: check(partijen, "Partijen lezen") as { soort: SoortPartij }[],
    bytes: grootten.reduce((som, rij) => som + Number(rij.grootte_bytes ?? 0), 0),
    ruimtes: {
      aantal: oppervlaktes.length,
      oppervlakte: oppervlaktes.reduce((som, rij) => som + Number(rij.oppervlakte_m2), 0),
    },
  };
}
