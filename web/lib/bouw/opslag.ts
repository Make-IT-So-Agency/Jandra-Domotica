import "server-only";

import { db } from "@/lib/supabase";

import { Bouwfout, check, geraakt, huisVanRij, idsVanHuis, verdiepingenVanHuis, zelfdeHuis, type Meldingen } from "./databank";
import { STANDAARDDAK, isDaktype, type Dakinstelling } from "./drie/dakregels";
import type { Gekendeopening } from "./drie/gaten";
import type { Georef } from "./drie/omgeving";
import type { Inplanting, Plaatsing } from "./drie/plaatsing";
import { schoneCorrecties, type Correctie } from "./drie/correcties";
import { schoneTrapstanden } from "./drie/trappen";
import { sleutelVan } from "./invoer";
import type { Ruimterij } from "./omzetting/bevestigen";
import type { Trapdeel, Trapvoorstel, Xy } from "./omzetting/types";
import type { Nieuwpunt, Punt, StatusPunt } from "./punten";
import type {
  Bestand,
  Gebouw,
  Huis,
  Omzetting,
  Partij,
  Plan,
  Planversie,
  Ruimte,
  SoortPartij,
  SoortPlan,
  SoortRuimte,
  Trapstand,
  Verdieping,
} from "./types";

/**
 * Alles wat de module Bouw in de databank leest en schrijft. De tabellen staan
 * in supabase/migrations/20261002202500_bouw.sql en de migraties van Bouw
 * erna. De planning, de keuzes en het beslissingslog staan apart in
 * regie-opslag.ts. De bestanden zelf staan in Storage; zie opslagruimte.ts.
 *
 * Alles hoort bij een huis (huizen.ts): elke functie krijgt het huis als
 * eerste parameter, en leest of wijzigt niets van een ander huis. Zie
 * databank.ts voor hoe een rij bij een huis hoort.
 */

export { Bouwfout, check, type Meldingen };

// ---------------------------------------------------------------------------
// Het project: naam en adres staan bij het huis. Enkel in de databank, nooit
// in de repository.
// ---------------------------------------------------------------------------

export interface Project {
  projectnaam: string | null;
  adres: string | null;
}

export function projectVan(huis: Huis): Project {
  return { projectnaam: huis.projectnaam, adres: huis.adres };
}

// ---------------------------------------------------------------------------
// Gebouwen
// ---------------------------------------------------------------------------

export async function lijstGebouwen(huisId: number): Promise<Gebouw[]> {
  const rijen = check(
    await db().from("bouw_gebouwen").select("*").eq("huis_id", huisId).order("volgorde").order("naam"),
    "Gebouwen lezen",
  ) as Record<string, unknown>[];
  return rijen.map((rij) => ({ id: Number(rij.id), naam: String(rij.naam), volgorde: Number(rij.volgorde ?? 0) }));
}

/** Het dak van elk gebouw, voor het 3D-model. */
export async function lijstDaken(huisId: number): Promise<Map<number, Dakinstelling>> {
  const rijen = check(
    await db().from("bouw_gebouwen").select("id, dak_type, dak_helling, dak_nok, dak_overstek").eq("huis_id", huisId),
    "Daken lezen",
  ) as Record<string, unknown>[];
  return new Map(
    rijen.map((rij) => [
      Number(rij.id),
      {
        type: isDaktype(String(rij.dak_type)) ? (String(rij.dak_type) as Dakinstelling["type"]) : STANDAARDDAK.type,
        helling: Number(rij.dak_helling ?? STANDAARDDAK.helling),
        nok: rij.dak_nok === "y" ? "y" : "x",
        overstek: Number(rij.dak_overstek ?? STANDAARDDAK.overstek),
      },
    ]),
  );
}

export async function bewaarDak(huisId: number, gebouwId: number, dak: Dakinstelling): Promise<void> {
  geraakt(
    check(
      await db()
        .from("bouw_gebouwen")
        .update({ dak_type: dak.type, dak_helling: dak.helling, dak_nok: dak.nok, dak_overstek: dak.overstek })
        .eq("id", gebouwId)
        .eq("huis_id", huisId)
        .select("id"),
      "Dak bewaren",
    ),
  );
}

/**
 * Het gebouw met die naam, of een nieuw achteraan. Hoofdletters en witruimte
 * tellen niet mee, zodat "woning" uit een bladcode de bestaande Woning vindt.
 */
export async function zoekOfMaakGebouw(huisId: number, naam: string): Promise<number> {
  const gebouwen = await lijstGebouwen(huisId);
  const bestaand = gebouwen.find((gebouw) => sleutelVan(gebouw.naam) === sleutelVan(naam));
  if (bestaand) return bestaand.id;
  const volgorde = gebouwen.reduce((hoogste, gebouw) => Math.max(hoogste, gebouw.volgorde + 1), 0);
  const rij = check(
    await db().from("bouw_gebouwen").insert({ naam: naam.trim(), volgorde, huis_id: huisId }).select("id").single(),
    "Gebouw toevoegen",
    { uniek: `Er bestaat al een gebouw "${naam.trim()}".` },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigGebouw(huisId: number, id: number, gebouw: Omit<Gebouw, "id">): Promise<void> {
  geraakt(
    check(await db().from("bouw_gebouwen").update(gebouw).eq("id", id).eq("huis_id", huisId).select("id"), "Gebouw bewaren", {
      uniek: `Er bestaat al een gebouw "${gebouw.naam}".`,
    }),
  );
}

export async function verwijderGebouw(huisId: number, id: number): Promise<void> {
  check(await db().from("bouw_gebouwen").delete().eq("id", id).eq("huis_id", huisId), "Gebouw verwijderen", {
    inGebruik: "Aan dit gebouw hangen nog verdiepingen of plannen. Verwijder of verplaats die eerst.",
  });
}

// ---------------------------------------------------------------------------
// De inplanting: waar elk gebouw op het terrein staat, op welk plan en op
// welke schaal. Zie drie/plaatsing.ts en 20261003210000_bouw_inplanting.sql.
// ---------------------------------------------------------------------------

export interface BewaardeInplanting {
  planId: number | null;
  schaal: number | null;
  /** Enkel de gebouwen met een bewaarde plaats. */
  plaatsen: Map<number, Plaatsing>;
  /** Waar het terrein op de kaart ligt (zie drie/omgeving.ts), als iemand het bewaarde. */
  georef: Georef | null;
}

export async function leesInplanting(huisId: number): Promise<BewaardeInplanting> {
  const [huis, gebouwen] = await Promise.all([
    db().from("bouw_huizen").select("inplanting_plan_id, inplanting_schaal, lambert_x, lambert_y, lambert_hoek").eq("id", huisId).maybeSingle(),
    db().from("bouw_gebouwen").select("id, plaats_x_m, plaats_y_m, plaats_hoek").eq("huis_id", huisId),
  ]);
  const rij = check(huis, "Inplanting lezen") as Record<string, unknown> | null;
  const getal = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
  const plaatsen = new Map<number, Plaatsing>();
  for (const gebouw of check(gebouwen, "Plaatsen lezen") as Record<string, unknown>[]) {
    const [x, y, hoek] = [getal(gebouw.plaats_x_m), getal(gebouw.plaats_y_m), getal(gebouw.plaats_hoek)];
    if (x !== null && y !== null && hoek !== null) plaatsen.set(Number(gebouw.id), { x, y, hoek });
  }
  const [lx, ly, lhoek] = [getal(rij?.lambert_x), getal(rij?.lambert_y), getal(rij?.lambert_hoek)];
  return {
    planId: getal(rij?.inplanting_plan_id),
    schaal: getal(rij?.inplanting_schaal),
    plaatsen,
    georef: lx !== null && ly !== null && lhoek !== null ? { x: lx, y: ly, hoek: lhoek } : null,
  };
}

/** Bewaart waar het terrein op de kaart ligt (nagekeken met schoneGeoref), of wist het. */
export async function bewaarGeoref(huisId: number, georef: Georef | null): Promise<void> {
  geraakt(
    check(
      await db()
        .from("bouw_huizen")
        .update({ lambert_x: georef?.x ?? null, lambert_y: georef?.y ?? null, lambert_hoek: georef?.hoek ?? null })
        .eq("id", huisId)
        .select("id"),
      "Omgeving bewaren",
    ),
  );
}

/** Bewaart een nagekeken inplanting (zie schoneInplanting): enkel met een plan en gebouwen van dit huis. */
export async function bewaarInplanting(huisId: number, inplanting: Inplanting): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_plannen", inplanting.planId]);
  const eigen = new Set(await idsVanHuis("bouw_gebouwen", huisId));
  if (inplanting.plaatsen.some(({ gebouwId }) => !eigen.has(gebouwId))) {
    throw new Bouwfout("Dat gebouw hoort niet bij dit huis, of het bestaat niet meer.");
  }
  for (const { gebouwId, plaats } of inplanting.plaatsen) {
    geraakt(
      check(
        await db()
          .from("bouw_gebouwen")
          .update({ plaats_x_m: plaats?.x ?? null, plaats_y_m: plaats?.y ?? null, plaats_hoek: plaats?.hoek ?? null })
          .eq("id", gebouwId)
          .eq("huis_id", huisId)
          .select("id"),
        "Plaats bewaren",
      ),
    );
  }
  geraakt(
    check(
      await db()
        .from("bouw_huizen")
        .update({ inplanting_plan_id: inplanting.planId, inplanting_schaal: inplanting.schaal })
        .eq("id", huisId)
        .select("id"),
      "Inplanting bewaren",
      { inGebruik: "Dat plan bestaat niet meer." },
    ),
  );
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
    trapstanden: schoneTrapstanden(rij.trappen),
    correcties: schoneCorrecties(rij.correcties),
  };
}

/** Hoe de trappen van een verdieping gekozen werden, zoals het 3D-scherm ze bewaart. */
export async function bewaarTrapstanden(huisId: number, verdiepingId: number, standen: Trapstand[]): Promise<void> {
  if (!(await leesVerdieping(huisId, verdiepingId))) throw new Bouwfout("Deze verdieping bestaat niet meer.");
  geraakt(
    check(
      await db().from("bouw_verdiepingen").update({ trappen: schoneTrapstanden(standen) }).eq("id", verdiepingId).select("id"),
      "Trappen bewaren",
    ),
  );
}

/** Wat op het plan verbeterd werd aan de muren, ramen en deuren van een verdieping. */
export async function bewaarCorrecties(huisId: number, verdiepingId: number, correcties: Correctie[]): Promise<void> {
  if (!(await leesVerdieping(huisId, verdiepingId))) throw new Bouwfout("Deze verdieping bestaat niet meer.");
  geraakt(
    check(
      await db().from("bouw_verdiepingen").update({ correcties: schoneCorrecties(correcties) }).eq("id", verdiepingId).select("id"),
      "Correcties bewaren",
    ),
  );
}

export async function lijstVerdiepingen(huisId: number): Promise<Verdieping[]> {
  const gebouwen = await idsVanHuis("bouw_gebouwen", huisId);
  if (gebouwen.length === 0) return [];
  const rijen = check(
    await db().from("bouw_verdiepingen").select("*").in("gebouw_id", gebouwen).order("volgorde").order("naam"),
    "Verdiepingen lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsVerdieping);
}

export async function leesVerdieping(huisId: number, id: number): Promise<Verdieping | null> {
  const rij = check(
    await db().from("bouw_verdiepingen").select("*").eq("id", id).maybeSingle(),
    "Verdieping lezen",
  ) as Record<string, unknown> | null;
  if (!rij || (await huisVanRij("bouw_gebouwen", Number(rij.gebouw_id))) !== huisId) return null;
  return alsVerdieping(rij);
}

export async function voegVerdiepingToe(huisId: number, verdieping: NieuweVerdieping): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_gebouwen", verdieping.gebouw_id]);
  const rij = check(
    await db().from("bouw_verdiepingen").insert(verdieping).select("id").single(),
    "Verdieping toevoegen",
    { uniek: `Er bestaat al een verdieping "${verdieping.naam}" in dit gebouw.`, inGebruik: "Dat gebouw bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigVerdieping(huisId: number, id: number, verdieping: Partial<NieuweVerdieping>): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_verdiepingen", id], ["bouw_gebouwen", verdieping.gebouw_id]);
  check(await db().from("bouw_verdiepingen").update(verdieping).eq("id", id), "Verdieping bewaren", {
    uniek: `Er bestaat al een verdieping "${verdieping.naam ?? ""}" in dit gebouw.`,
    inGebruik: "Dat gebouw bestaat niet meer.",
  });
  // Een grondplan volgt het gebouw van zijn verdieping.
  if (verdieping.gebouw_id !== undefined) {
    check(
      await db().from("bouw_plannen").update({ gebouw_id: verdieping.gebouw_id }).eq("verdieping_id", id).eq("huis_id", huisId),
      "Plannen van de verdieping bijwerken",
    );
  }
}

export async function verwijderVerdieping(huisId: number, id: number): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_verdiepingen", id]);
  check(await db().from("bouw_verdiepingen").delete().eq("id", id), "Verdieping verwijderen", {
    inGebruik: "Aan deze verdieping hangt nog een plan. Verwijder of verplaats dat plan eerst.",
  });
}

// ---------------------------------------------------------------------------
// Partijen
// ---------------------------------------------------------------------------

export type NieuwePartij = Omit<Partij, "id">;

/** Een rij uit de databank als Partij, zonder het huis. */
function alsPartij(rij: Record<string, unknown>): Partij {
  const { huis_id: _huis, created_at: _gemaakt, updated_at: _gewijzigd, ...partij } = rij;
  return { ...(partij as unknown as Partij), id: Number(rij.id) };
}

export async function lijstPartijen(huisId: number): Promise<Partij[]> {
  const rijen = check(
    await db().from("bouw_partijen").select("*").eq("huis_id", huisId).order("soort").order("naam"),
    "Partijen lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsPartij);
}

export async function voegPartijToe(huisId: number, partij: NieuwePartij): Promise<void> {
  check(await db().from("bouw_partijen").insert({ ...partij, huis_id: huisId }), "Partij toevoegen");
}

export async function wijzigPartij(huisId: number, id: number, partij: NieuwePartij): Promise<void> {
  geraakt(check(await db().from("bouw_partijen").update(partij).eq("id", id).eq("huis_id", huisId).select("id"), "Partij bewaren"));
}

export async function verwijderPartij(huisId: number, id: number): Promise<void> {
  check(await db().from("bouw_partijen").delete().eq("id", id).eq("huis_id", huisId), "Partij verwijderen");
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

/** Een rij uit de databank als Plan, zonder het huis. */
function alsPlan(rij: Record<string, unknown>): Plan {
  const { huis_id: _huis, ...plan } = rij;
  return plan as unknown as Plan;
}

export async function lijstPlannen(huisId: number): Promise<PlanMetVersies[]> {
  const plannen = (
    check(await db().from("bouw_plannen").select("*").eq("huis_id", huisId).order("titel"), "Plannen lezen") as Record<
      string,
      unknown
    >[]
  ).map(alsPlan);
  if (plannen.length === 0) return [];
  const alleVersies = check(
    await db()
      .from("bouw_planversies")
      .select("*")
      .in(
        "plan_id",
        plannen.map((plan) => plan.id),
      )
      .order("created_at"),
    "Planversies lezen",
  ) as Planversie[];
  return plannen.map((plan) => ({
    ...plan,
    versies: alleVersies.filter((versie) => versie.plan_id === plan.id),
  }));
}

export async function leesPlan(huisId: number, id: number): Promise<PlanMetVersies | null> {
  const rij = check(
    await db().from("bouw_plannen").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Plan lezen",
  ) as Record<string, unknown> | null;
  const plan = rij ? alsPlan(rij) : null;
  if (!plan) return null;
  const versies = check(
    await db().from("bouw_planversies").select("*").eq("plan_id", id).order("created_at"),
    "Planversies lezen",
  ) as Planversie[];
  return { ...plan, versies };
}

/** Een plan op een verdieping hoort bij het gebouw van die verdieping, wat er ook gekozen werd. */
async function metGebouwVanVerdieping(huisId: number, plan: NieuwPlan): Promise<NieuwPlan> {
  await zelfdeHuis(huisId, ["bouw_gebouwen", plan.gebouw_id]);
  if (!plan.verdieping_id) return plan;
  const verdieping = await leesVerdieping(huisId, plan.verdieping_id);
  if (!verdieping) throw new Bouwfout("Die verdieping bestaat niet meer.");
  return { ...plan, gebouw_id: verdieping.gebouw_id };
}

function planmeldingen(plan: NieuwPlan): Meldingen {
  return {
    inGebruik: "Die verdieping of dat gebouw bestaat niet meer.",
    uniek: plan.bladcode ? `Er is al een plan met bladcode ${plan.bladcode}.` : undefined,
  };
}

export async function voegPlanToe(huisId: number, plan: NieuwPlan): Promise<number> {
  const volledig = await metGebouwVanVerdieping(huisId, plan);
  const rij = check(
    await db().from("bouw_plannen").insert({ ...volledig, huis_id: huisId }).select("id").single(),
    "Plan toevoegen",
    planmeldingen(volledig),
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigPlan(huisId: number, id: number, plan: NieuwPlan): Promise<void> {
  const volledig = await metGebouwVanVerdieping(huisId, plan);
  geraakt(
    check(
      await db().from("bouw_plannen").update(volledig).eq("id", id).eq("huis_id", huisId).select("id"),
      "Plan bewaren",
      planmeldingen(volledig),
    ),
  );
}

/** Zet de bladcode van een plan dat er al was, bv. als het dossier het herkent op zijn titel. */
export async function zetBladcode(huisId: number, id: number, bladcode: string): Promise<void> {
  geraakt(
    check(await db().from("bouw_plannen").update({ bladcode }).eq("id", id).eq("huis_id", huisId).select("id"), "Bladcode bewaren", {
      uniek: `Er is al een plan met bladcode ${bladcode}.`,
    }),
  );
}

/** Verwijdert het plan en, via de databank, al zijn versies. De bestanden ruimt opladen.ts op. */
export async function verwijderPlan(huisId: number, id: number): Promise<number[]> {
  await zelfdeHuis(huisId, ["bouw_plannen", id]);
  const versies = check(
    await db().from("bouw_planversies").select("bestand_id").eq("plan_id", id),
    "Planversies lezen",
  ) as { bestand_id: number }[];
  check(await db().from("bouw_plannen").delete().eq("id", id).eq("huis_id", huisId), "Plan verwijderen");
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

export async function voegVersieToe(huisId: number, versie: NieuweVersie): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_plannen", versie.plan_id], ["bouw_bestanden", versie.bestand_id]);
  const rij = check(
    await db().from("bouw_planversies").insert(versie).select("id").single(),
    "Versie toevoegen",
    { uniek: `Dit plan heeft al een versie "${versie.label}".` },
  ) as { id: number };
  return rij.id;
}

export async function leesVersie(huisId: number, id: number): Promise<Planversie | null> {
  const versie = check(
    await db().from("bouw_planversies").select("*").eq("id", id).maybeSingle(),
    "Versie lezen",
  ) as Planversie | null;
  if (!versie || (await huisVanRij("bouw_plannen", Number(versie.plan_id))) !== huisId) return null;
  return versie;
}

/** Verwijdert de versie en geeft het bestand terug, om op te ruimen als niets anders het nog gebruikt. */
export async function verwijderVersie(huisId: number, id: number): Promise<number | null> {
  const versie = await leesVersie(huisId, id);
  if (!versie) return null;
  check(await db().from("bouw_planversies").delete().eq("id", id), "Versie verwijderen");
  return versie.bestand_id;
}

/** Legt een versie in het assenstelsel van haar gebouw; zie omzetting/geometrie.ts. */
export async function zetKalibratie(huisId: number, versieId: number, kalibratie: Record<string, unknown>): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_planversies", versieId]);
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

const isGetal = (waarde: unknown): waarde is number => typeof waarde === "number" && Number.isFinite(waarde);

/**
 * De muren en openingen die bij het bevestigen bewaard werden, in meter, per
 * planversie. Wat er niet in staat of niet klopt, valt weg: een omzetting van
 * vóór de muren (werkwijze 1) heeft er geen.
 */
export async function leesMurenEnOpeningen(
  versieIds: number[],
): Promise<Map<number, { muren: Xy[][]; openingen: Gekendeopening[]; trappen: Trapvoorstel[]; werkwijze: number }>> {
  if (versieIds.length === 0) return new Map();
  const rijen = check(
    await db().from("bouw_omzettingen").select("planversie_id, voorstel, werkwijze").in("planversie_id", versieIds),
    "Omzettingen lezen",
  ) as { planversie_id: number; voorstel: Record<string, unknown> | null; werkwijze: number | null }[];
  const punt = (p: unknown): p is Xy => Array.isArray(p) && p.length === 2 && isGetal(p[0]) && isGetal(p[1]);
  return new Map(
    rijen.map((rij) => {
      const voorstel = rij.voorstel ?? {};
      const muren = (Array.isArray(voorstel.muren) ? voorstel.muren : []).filter(
        (ring): ring is Xy[] => Array.isArray(ring) && ring.length >= 3 && ring.every(punt),
      );
      const openingen = (Array.isArray(voorstel.openingen) ? voorstel.openingen : []).flatMap((o: Record<string, unknown>) =>
        (o?.soort === "deur" || o?.soort === "raam") && isGetal(o.x) && isGetal(o.y) && isGetal(o.breedte)
          ? [{ soort: o.soort, x: o.x, y: o.y, breedte: o.breedte, hoogte: isGetal(o.hoogte) ? o.hoogte : null } as Gekendeopening]
          : [],
      );
      // Een omzetting van vóór de trappen (werkwijze 1 en 2) heeft er geen.
      const trappen = (Array.isArray(voorstel.trappen) ? voorstel.trappen : []).flatMap((t: Record<string, unknown>) => {
        const delen = (Array.isArray(t?.delen) ? t.delen : []).flatMap((d: Record<string, unknown>) =>
          (d?.soort === "vlucht" || d?.soort === "bordes") &&
          Array.isArray(d.hoeken) &&
          d.hoeken.length === 4 &&
          d.hoeken.every(punt) &&
          Number.isInteger(d.treden)
            ? [{ soort: d.soort, hoeken: d.hoeken as Trapdeel["hoeken"], treden: Number(d.treden) } as Trapdeel]
            : [],
        );
        return delen.length > 0 ? [{ delen, richting: t.richting === "pijl" ? "pijl" : "geraden" } as Trapvoorstel] : [];
      });
      return [Number(rij.planversie_id), { muren, openingen, trappen, werkwijze: Number(rij.werkwijze ?? 1) }];
    }),
  );
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
export async function bewaarOmzetting(
  huisId: number,
  omzetting: {
    planversie_id: number;
    werkwijze: number;
    voorstel: Record<string, unknown>;
    bevestigd_door: string;
  },
): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_planversies", omzetting.planversie_id]);
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

/** De ruimtes van het huis, of van één verdieping ervan. */
export async function lijstRuimtes(huisId: number, verdiepingId?: number): Promise<Ruimte[]> {
  const verdiepingen = await verdiepingenVanHuis(huisId);
  const gevraagd = verdiepingId === undefined ? verdiepingen : verdiepingen.filter((id) => id === verdiepingId);
  if (gevraagd.length === 0) return [];
  const rijen = check(
    await db().from("bouw_ruimtes").select("*").in("verdieping_id", gevraagd).order("naam"),
    "Ruimtes lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsRuimte);
}

/**
 * Zet de ruimtes van een verdieping zoals de bevestigde omzetting ze geeft:
 * een ruimte met een id wordt bijgewerkt en houdt dat id, een ruimte zonder
 * id is nieuw, en wat er niet meer bij is, verdwijnt.
 */
export async function schrijfRuimtes(
  huisId: number,
  verdiepingId: number,
  omzettingId: number,
  rijen: Ruimterij[],
): Promise<{ bijgewerkt: number; nieuw: number; verwijderd: number }> {
  await zelfdeHuis(huisId, ["bouw_verdiepingen", verdiepingId], ["bouw_omzettingen", omzettingId]);
  const bestaand = await lijstRuimtes(huisId, verdiepingId);
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

/** De punten van het huis, of van één verdieping ervan. */
export async function lijstPunten(huisId: number, verdiepingId?: number): Promise<Punt[]> {
  const verdiepingen = await verdiepingenVanHuis(huisId);
  const gevraagd = verdiepingId === undefined ? verdiepingen : verdiepingen.filter((id) => id === verdiepingId);
  if (gevraagd.length === 0) return [];
  const rijen = check(
    await db().from("bouw_punten").select("*").in("verdieping_id", gevraagd).order("id"),
    "Punten lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsPunt);
}

export async function voegPuntToe(huisId: number, verdiepingId: number, punt: Nieuwpunt): Promise<Punt> {
  await zelfdeHuis(huisId, ["bouw_verdiepingen", verdiepingId]);
  const rij = check(
    await db().from("bouw_punten").insert({ ...punt, verdieping_id: verdiepingId }).select("*").single(),
    "Punt toevoegen",
    { inGebruik: "Deze verdieping bestaat niet meer." },
  ) as Record<string, unknown>;
  return alsPunt(rij);
}

export async function wijzigPunt(huisId: number, id: number, punt: Nieuwpunt): Promise<Punt | null> {
  if ((await huisVanRij("bouw_punten", id)) !== huisId) return null;
  const rijen = check(
    await db().from("bouw_punten").update(punt).eq("id", id).select("*"),
    "Punt bewaren",
  ) as Record<string, unknown>[];
  return rijen[0] ? alsPunt(rijen[0]) : null;
}

export async function verwijderPunt(huisId: number, id: number): Promise<void> {
  if ((await huisVanRij("bouw_punten", id)) !== huisId) return;
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

/** Een rij uit de databank als Bestand, zonder het huis. */
function alsBestand(rij: Record<string, unknown>): Bestand {
  const { huis_id: _huis, ...bestand } = rij;
  return bestand as unknown as Bestand;
}

export async function registreerBestand(huisId: number, bestand: NieuwBestand): Promise<Bestand> {
  return alsBestand(
    check(
      await db().from("bouw_bestanden").insert({ ...bestand, status: "wacht", huis_id: huisId }).select("*").single(),
      "Bestand registreren",
    ) as Record<string, unknown>,
  );
}

export async function leesBestand(huisId: number, id: number): Promise<Bestand | null> {
  const rij = check(
    await db().from("bouw_bestanden").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Bestand lezen",
  ) as Record<string, unknown> | null;
  return rij ? alsBestand(rij) : null;
}

export async function leesBestanden(huisId: number, ids: number[]): Promise<Bestand[]> {
  if (ids.length === 0) return [];
  const rijen = check(
    await db().from("bouw_bestanden").select("*").in("id", ids).eq("huis_id", huisId),
    "Bestanden lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsBestand);
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

/**
 * Gebruikt nog iets dit bestand: een planversie, een optie van een keuze (als
 * foto), een offerte, een factuur, of een inzending die nog niet ingelezen of
 * genegeerd is?
 */
export async function wordtGebruikt(bestandId: number): Promise<boolean> {
  const antwoorden = await Promise.all([
    db().from("bouw_planversies").select("id").eq("bestand_id", bestandId).limit(1),
    db().from("bouw_opties").select("id").eq("foto_bestand_id", bestandId).limit(1),
    db().from("bouw_offertes").select("id").eq("bestand_id", bestandId).limit(1),
    db().from("bouw_facturen").select("id").eq("bestand_id", bestandId).limit(1),
    db().from("bouw_inzendingen").select("id").eq("bestand_id", bestandId).eq("status", "nieuw").limit(1),
    db().from("bouw_werffotos").select("id").eq("bestand_id", bestandId).limit(1),
    db().from("bouw_werffotos").select("id").eq("duim_bestand_id", bestandId).limit(1),
    db().from("bouw_documenten").select("id").eq("bestand_id", bestandId).limit(1),
  ]);
  return antwoorden.some((antwoord) => (check(antwoord, "Gebruik van een bestand nakijken") as unknown[]).length > 0);
}

/** Uploads die al lang op "wacht" staan, in alle huizen: de browser heeft ze nooit afgerond. */
export async function verlatenUploads(voor: Date): Promise<Bestand[]> {
  const rijen = check(
    await db().from("bouw_bestanden").select("*").eq("status", "wacht").lt("created_at", voor.toISOString()),
    "Verlaten uploads zoeken",
  ) as Record<string, unknown>[];
  return rijen.map(alsBestand);
}

export async function verwijderBestandRij(id: number): Promise<void> {
  check(await db().from("bouw_bestanden").delete().eq("id", id), "Bestand uit het register halen", {
    inGebruik: "Dit bestand wordt nog gebruikt door een planversie.",
  });
}

/** De PDF's die er al staan, om een ander blad uit dezelfde PDF als versie te kiezen. */
export async function lijstPlanbestanden(huisId: number): Promise<Bestand[]> {
  const rijen = check(
    await db()
      .from("bouw_bestanden")
      .select("*")
      .eq("huis_id", huisId)
      .eq("doel", "plan")
      .eq("status", "klaar")
      .order("created_at", { ascending: false }),
    "Bestanden lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsBestand);
}

// ---------------------------------------------------------------------------
// De stand, voor het overzicht
// ---------------------------------------------------------------------------

export interface Bouwstand {
  project: Project;
  verdiepingen: number;
  plannen: { id: number; titel: string; versies: number; soort: SoortPlan; omgezet: "geen" | "oud" | "laatste" }[];
  partijen: { id: number; naam: string; soort: SoortPartij }[];
  bytes: number;
  ruimtes: { aantal: number; oppervlakte: number };
}

/**
 * De stand van een huis. Het totaal aan bestanden telt voor alle huizen samen:
 * het gaat om de opslag van het gratis niveau van Supabase.
 */
export async function leesBouwstand(huis: Huis): Promise<Bouwstand> {
  const [verdiepingen, plannen, partijen, bestanden, ruimtes] = await Promise.all([
    verdiepingenVanHuis(huis.id),
    lijstPlannen(huis.id),
    db().from("bouw_partijen").select("id, naam, soort").eq("huis_id", huis.id),
    db().from("bouw_bestanden").select("grootte_bytes").eq("status", "klaar"),
    lijstRuimtes(huis.id),
  ]);
  const grootten = check(bestanden, "Bestanden tellen") as { grootte_bytes: number | null }[];
  const omzettingen = await lijstOmzettingen(plannen.flatMap((plan) => plan.versies.map((versie) => versie.id)));
  const omgezet = new Set(omzettingen.map((o) => o.planversie_id));
  return {
    project: projectVan(huis),
    verdiepingen: verdiepingen.length,
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
    partijen: (check(partijen, "Partijen lezen") as { id: number; naam: string; soort: SoortPartij }[]).map((partij) => ({
      id: Number(partij.id),
      naam: String(partij.naam),
      soort: partij.soort,
    })),
    bytes: grootten.reduce((som, rij) => som + Number(rij.grootte_bytes ?? 0), 0),
    ruimtes: {
      aantal: ruimtes.length,
      oppervlakte: ruimtes.reduce((som, ruimte) => som + ruimte.oppervlakte_m2, 0),
    },
  };
}
