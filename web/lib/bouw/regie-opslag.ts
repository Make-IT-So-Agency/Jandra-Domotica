import "server-only";

import { db } from "@/lib/supabase";

import { binnenHuis, check, geraakt, huisVanRij, zelfdeHuis } from "./databank";
import type { CategorieKeuze, Eenheid, Keuze, Optie, Voorkeur } from "./keuzes";
import type { Planningsitem, SoortPlanning, StatusPlanning, Voorbeelditem } from "./planning";

/**
 * De planning, de keuzes met hun opties en voorkeuren, het beslissingslog en
 * wat de bot al gemeld heeft. De tabellen staan in
 * supabase/migrations/20261002202503_bouw_regie.sql.
 *
 * Alles hoort bij een huis: de planning, de keuzes en de beslissingen hebben
 * een eigen huis_id, opties en voorkeuren horen bij hun keuze. Wat de bot al
 * meldde en zijn instellingen gelden voor alle huizen.
 */

const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
const tekstOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : String(waarde));

// ---------------------------------------------------------------------------
// De planning
// ---------------------------------------------------------------------------

export type NieuwPlanningsitem = Omit<Planningsitem, "id">;

function alsPlanningsitem(rij: Record<string, unknown>): Planningsitem {
  return {
    id: Number(rij.id),
    soort: rij.soort as SoortPlanning,
    titel: String(rij.titel),
    begindatum: String(rij.begindatum),
    einddatum: tekstOfNull(rij.einddatum),
    fase_id: getalOfNull(rij.fase_id),
    partij_id: getalOfNull(rij.partij_id),
    status: (rij.status as StatusPlanning) ?? "gepland",
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstPlanning(huisId: number): Promise<Planningsitem[]> {
  const rijen = check(
    await db().from("bouw_planning").select("*").eq("huis_id", huisId).order("begindatum").order("id"),
    "Planning lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsPlanningsitem);
}

export async function leesPlanningsitem(huisId: number, id: number): Promise<Planningsitem | null> {
  const rij = check(
    await db().from("bouw_planning").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Planning lezen",
  ) as Record<string, unknown> | null;
  return rij ? alsPlanningsitem(rij) : null;
}

export async function voegPlanningToe(huisId: number, item: NieuwPlanningsitem): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_planning", item.fase_id], ["bouw_partijen", item.partij_id]);
  const rij = check(
    await db().from("bouw_planning").insert({ ...item, huis_id: huisId }).select("id").single(),
    "Toevoegen aan de planning",
    { inGebruik: "De fase of de partij bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigPlanning(huisId: number, id: number, item: NieuwPlanningsitem): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_planning", item.fase_id], ["bouw_partijen", item.partij_id]);
  geraakt(
    check(
      await db().from("bouw_planning").update(item).eq("id", id).eq("huis_id", huisId).select("id"),
      "Planning bewaren",
      { inGebruik: "De fase of de partij bestaat niet meer." },
    ),
  );
}

/** Een fase met taken blijft staan: die taken zouden anders zomaar los komen te hangen. */
export async function verwijderPlanning(huisId: number, id: number): Promise<void> {
  const taken = check(
    await db().from("bouw_planning").select("id").eq("fase_id", id).eq("huis_id", huisId),
    "Taken van de fase zoeken",
  ) as unknown[];
  if (taken.length > 0) {
    throw new Error(
      `Deze fase heeft nog ${taken.length === 1 ? "1 taak" : `${taken.length} taken`}. Verwijder die eerst, of hang ze aan een andere fase.`,
    );
  }
  check(await db().from("bouw_planning").delete().eq("id", id).eq("huis_id", huisId), "Uit de planning verwijderen");
}

/** De voorbeeldplanning: eerst elke fase, dan haar taken met het id van die fase. */
export async function voegPlanningenToe(huisId: number, items: Voorbeelditem[]): Promise<number> {
  const ids = new Map<number, number>();
  for (const [index, item] of items.entries()) {
    const nieuw = await voegPlanningToe(huisId, {
      soort: item.soort,
      titel: item.titel,
      begindatum: item.begindatum,
      einddatum: item.einddatum,
      fase_id: item.fase === null ? null : (ids.get(item.fase) ?? null),
      partij_id: null,
      status: "gepland",
      opmerking: null,
    });
    ids.set(index, nieuw);
  }
  return ids.size;
}

// ---------------------------------------------------------------------------
// Keuzes
// ---------------------------------------------------------------------------

export type NieuweKeuze = Omit<Keuze, "id" | "gekozen_optie_id" | "beslist_op" | "beslist_door" | "ruimte_ids">;

function alsKeuze(rij: Record<string, unknown>, ruimteIds: number[]): Keuze {
  return {
    id: Number(rij.id),
    titel: String(rij.titel),
    categorie: rij.categorie as CategorieKeuze,
    omschrijving: tekstOfNull(rij.omschrijving),
    deadline: tekstOfNull(rij.deadline),
    planning_id: getalOfNull(rij.planning_id),
    levertermijn_weken: getalOfNull(rij.levertermijn_weken),
    eenheid: rij.eenheid as Eenheid,
    hoeveelheid: getalOfNull(rij.hoeveelheid),
    partij_id: getalOfNull(rij.partij_id),
    gekozen_optie_id: getalOfNull(rij.gekozen_optie_id),
    beslist_op: tekstOfNull(rij.beslist_op),
    beslist_door: tekstOfNull(rij.beslist_door),
    ruimte_ids: ruimteIds,
  };
}

async function ruimtesPerKeuze(keuzeIds: number[]): Promise<Map<number, number[]>> {
  if (keuzeIds.length === 0) return new Map();
  const rijen = check(
    await db().from("bouw_keuze_ruimtes").select("keuze_id, ruimte_id").in("keuze_id", keuzeIds),
    "Ruimtes van de keuzes lezen",
  ) as { keuze_id: number; ruimte_id: number }[];
  const perKeuze = new Map<number, number[]>();
  for (const rij of rijen) {
    const lijst = perKeuze.get(Number(rij.keuze_id)) ?? [];
    lijst.push(Number(rij.ruimte_id));
    perKeuze.set(Number(rij.keuze_id), lijst);
  }
  return perKeuze;
}

export async function lijstKeuzes(huisId: number): Promise<Keuze[]> {
  const rijen = check(
    await db().from("bouw_keuzes").select("*").eq("huis_id", huisId).order("titel"),
    "Keuzes lezen",
  ) as Record<string, unknown>[];
  const ruimtes = await ruimtesPerKeuze(rijen.map((rij) => Number(rij.id)));
  return rijen.map((rij) => alsKeuze(rij, ruimtes.get(Number(rij.id)) ?? []));
}

export async function leesKeuze(huisId: number, id: number): Promise<Keuze | null> {
  const rij = check(
    await db().from("bouw_keuzes").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Keuze lezen",
  ) as Record<string, unknown> | null;
  if (!rij) return null;
  return alsKeuze(rij, (await ruimtesPerKeuze([id])).get(id) ?? []);
}

export async function voegKeuzeToe(huisId: number, keuze: NieuweKeuze, ruimteIds: number[] = []): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_planning", keuze.planning_id], ["bouw_partijen", keuze.partij_id]);
  const rij = check(
    await db().from("bouw_keuzes").insert({ ...keuze, huis_id: huisId }).select("id").single(),
    "Keuze toevoegen",
    { inGebruik: "De taak of de partij bestaat niet meer." },
  ) as { id: number };
  const id = Number(rij.id);
  if (ruimteIds.length > 0) await zetKeuzeRuimtes(huisId, id, ruimteIds);
  return id;
}

export async function wijzigKeuze(huisId: number, id: number, keuze: NieuweKeuze): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_planning", keuze.planning_id], ["bouw_partijen", keuze.partij_id]);
  geraakt(
    check(
      await db().from("bouw_keuzes").update(keuze).eq("id", id).eq("huis_id", huisId).select("id"),
      "Keuze bewaren",
      { inGebruik: "De taak of de partij bestaat niet meer." },
    ),
  );
}

export async function zetKeuzeRuimtes(huisId: number, keuzeId: number, ruimteIds: number[]): Promise<void> {
  const uniek = [...new Set(ruimteIds)];
  await zelfdeHuis(huisId, ["bouw_keuzes", keuzeId], ...uniek.map((ruimteId) => ["bouw_ruimtes", ruimteId] as const));
  check(await db().from("bouw_keuze_ruimtes").delete().eq("keuze_id", keuzeId), "Ruimtes van de keuze bewaren");
  if (uniek.length === 0) return;
  check(
    await db()
      .from("bouw_keuze_ruimtes")
      .insert(uniek.map((ruimte_id) => ({ keuze_id: keuzeId, ruimte_id }))),
    "Ruimtes van de keuze bewaren",
    { inGebruik: "Een van die ruimtes bestaat niet meer." },
  );
}

/** Geeft de foto's van de opties terug, zodat die ook uit Storage kunnen. */
export async function verwijderKeuze(huisId: number, id: number): Promise<number[]> {
  await zelfdeHuis(huisId, ["bouw_keuzes", id]);
  const fotos = (await lijstOpties(huisId, [id])).flatMap((optie) => (optie.foto_bestand_id ? [optie.foto_bestand_id] : []));
  // Eerst de verwijzing naar de gekozen optie los, dan alles in één keer.
  check(
    await db().from("bouw_keuzes").update({ gekozen_optie_id: null }).eq("id", id).eq("huis_id", huisId),
    "Keuze verwijderen",
  );
  check(await db().from("bouw_keuzes").delete().eq("id", id).eq("huis_id", huisId), "Keuze verwijderen");
  return fotos;
}

export async function beslisKeuze(huisId: number, id: number, optieId: number | null, door: string | null): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_opties", optieId]);
  geraakt(
    check(
      await db()
        .from("bouw_keuzes")
        .update({
          gekozen_optie_id: optieId,
          beslist_op: optieId === null ? null : new Date().toISOString(),
          beslist_door: optieId === null ? null : door,
        })
        .eq("id", id)
        .eq("huis_id", huisId)
        .select("id"),
      "Keuze bewaren",
      { inGebruik: "Deze optie bestaat niet meer." },
    ),
  );
}

// ---------------------------------------------------------------------------
// Opties
// ---------------------------------------------------------------------------

export type NieuweOptie = Omit<Optie, "id" | "foto_bestand_id" | "basis">;

function alsOptie(rij: Record<string, unknown>): Optie {
  return {
    id: Number(rij.id),
    keuze_id: Number(rij.keuze_id),
    naam: String(rij.naam),
    leverancier_id: getalOfNull(rij.leverancier_id),
    prijs: getalOfNull(rij.prijs),
    basis: rij.basis === true,
    kleur: tekstOfNull(rij.kleur),
    url: tekstOfNull(rij.url),
    foto_bestand_id: getalOfNull(rij.foto_bestand_id),
    opmerking: tekstOfNull(rij.opmerking),
    volgorde: Number(rij.volgorde ?? 0),
  };
}

/** De opties van de keuzes van het huis, of van enkele ervan. */
export async function lijstOpties(huisId: number, keuzeIds?: number[]): Promise<Optie[]> {
  const ids = await binnenHuis("bouw_keuzes", huisId, keuzeIds);
  if (ids.length === 0) return [];
  const rijen = check(
    await db().from("bouw_opties").select("*").in("keuze_id", ids).order("volgorde").order("id"),
    "Opties lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsOptie);
}

export async function leesOptie(huisId: number, id: number): Promise<Optie | null> {
  const rij = check(
    await db().from("bouw_opties").select("*").eq("id", id).maybeSingle(),
    "Optie lezen",
  ) as Record<string, unknown> | null;
  if (!rij || (await huisVanRij("bouw_keuzes", Number(rij.keuze_id))) !== huisId) return null;
  return alsOptie(rij);
}

export async function voegOptieToe(huisId: number, optie: NieuweOptie): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_keuzes", optie.keuze_id], ["bouw_partijen", optie.leverancier_id]);
  const rij = check(
    await db().from("bouw_opties").insert(optie).select("id").single(),
    "Optie toevoegen",
    { inGebruik: "De keuze of de leverancier bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigOptie(huisId: number, id: number, optie: Omit<NieuweOptie, "keuze_id">): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_opties", id], ["bouw_partijen", optie.leverancier_id]);
  check(await db().from("bouw_opties").update(optie).eq("id", id), "Optie bewaren", {
    inGebruik: "De leverancier bestaat niet meer.",
  });
}

/** Geeft de foto terug, zodat die ook uit Storage kan. Een gekozen optie maakt de keuze terug open. */
export async function verwijderOptie(huisId: number, id: number): Promise<number | null> {
  const optie = await leesOptie(huisId, id);
  if (!optie) return null;
  check(
    await db()
      .from("bouw_keuzes")
      .update({ gekozen_optie_id: null, beslist_op: null, beslist_door: null })
      .eq("gekozen_optie_id", id)
      .eq("huis_id", huisId),
    "Optie verwijderen",
  );
  check(await db().from("bouw_opties").delete().eq("id", id), "Optie verwijderen");
  return optie.foto_bestand_id;
}

/** Hoogstens één basis per keuze: eerst alle andere uit, dan deze aan. */
export async function zetBasis(huisId: number, keuzeId: number, optieId: number | null): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_keuzes", keuzeId]);
  check(
    await db().from("bouw_opties").update({ basis: false }).eq("keuze_id", keuzeId).eq("basis", true),
    "Basis bewaren",
  );
  if (optieId === null) return;
  check(
    await db().from("bouw_opties").update({ basis: true }).eq("id", optieId).eq("keuze_id", keuzeId),
    "Basis bewaren",
  );
}

/** Zet een nieuwe foto en geeft de vorige terug, zodat die uit Storage kan. */
export async function zetFoto(huisId: number, optieId: number, bestandId: number | null): Promise<number | null> {
  const optie = await leesOptie(huisId, optieId);
  if (!optie) throw new Error("Deze optie bestaat niet meer.");
  await zelfdeHuis(huisId, ["bouw_bestanden", bestandId]);
  check(await db().from("bouw_opties").update({ foto_bestand_id: bestandId }).eq("id", optieId), "Foto bewaren");
  return optie.foto_bestand_id;
}

// ---------------------------------------------------------------------------
// Voorkeuren
// ---------------------------------------------------------------------------

/** De voorkeuren voor de keuzes van het huis, of voor enkele ervan. */
export async function lijstVoorkeuren(huisId: number, keuzeIds?: number[]): Promise<Voorkeur[]> {
  const ids = await binnenHuis("bouw_keuzes", huisId, keuzeIds);
  if (ids.length === 0) return [];
  const rijen = check(
    await db().from("bouw_voorkeuren").select("keuze_id, wie, naam, optie_id").in("keuze_id", ids),
    "Voorkeuren lezen",
  ) as Record<string, unknown>[];
  return rijen.map((rij) => ({
    keuze_id: Number(rij.keuze_id),
    wie: String(rij.wie),
    naam: String(rij.naam),
    optie_id: Number(rij.optie_id),
  }));
}

/** Eén voorkeur per persoon per keuze; null haalt ze weg. */
export async function zetVoorkeur(
  huisId: number,
  keuzeId: number,
  wie: string,
  naam: string,
  optieId: number | null,
): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_keuzes", keuzeId], ["bouw_opties", optieId]);
  check(
    await db().from("bouw_voorkeuren").delete().eq("keuze_id", keuzeId).eq("wie", wie),
    "Voorkeur bewaren",
  );
  if (optieId === null) return;
  check(
    await db()
      .from("bouw_voorkeuren")
      .insert({ keuze_id: keuzeId, wie, naam, optie_id: optieId, updated_at: new Date().toISOString() }),
    "Voorkeur bewaren",
    { inGebruik: "Deze optie bestaat niet meer." },
  );
}

// ---------------------------------------------------------------------------
// Het beslissingslog
// ---------------------------------------------------------------------------

export interface Bouwbeslissing {
  id: number;
  datum: string;
  onderwerp: string;
  beslissing: string;
  keuze_id: number | null;
  door: string | null;
}

export type NieuweBeslissing = Omit<Bouwbeslissing, "id">;

export async function lijstBeslissingen(huisId: number): Promise<Bouwbeslissing[]> {
  const rijen = check(
    await db()
      .from("bouw_beslissingen")
      .select("*")
      .eq("huis_id", huisId)
      .order("datum", { ascending: false })
      .order("id", { ascending: false }),
    "Beslissingen lezen",
  ) as Record<string, unknown>[];
  return rijen.map((rij) => ({
    id: Number(rij.id),
    datum: String(rij.datum),
    onderwerp: String(rij.onderwerp),
    beslissing: String(rij.beslissing),
    keuze_id: getalOfNull(rij.keuze_id),
    door: tekstOfNull(rij.door),
  }));
}

export async function voegBeslissingToe(huisId: number, beslissing: NieuweBeslissing): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_keuzes", beslissing.keuze_id]);
  check(await db().from("bouw_beslissingen").insert({ ...beslissing, huis_id: huisId }), "Beslissing bewaren");
}

export async function verwijderBeslissing(huisId: number, id: number): Promise<void> {
  check(await db().from("bouw_beslissingen").delete().eq("id", id).eq("huis_id", huisId), "Beslissing verwijderen");
}

// ---------------------------------------------------------------------------
// Wat de bot al meldde, en de instellingen van de bot: voor alle huizen
// ---------------------------------------------------------------------------

/**
 * Onthoudt dat deze melding vertrekt. Geeft false als dat al eerder gebeurde:
 * de sleutel is uniek, dus ook twee rondes tegelijk sturen ze maar één keer.
 */
export async function meldEenKeer(sleutel: string): Promise<boolean> {
  const { error } = await db().from("bouw_meldingen").insert({ sleutel });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Melding onthouden mislukt: ${error.message}`);
}

/** Als het versturen mislukte: de volgende ronde mag het opnieuw proberen. */
export async function vergeetMelding(sleutel: string): Promise<void> {
  check(await db().from("bouw_meldingen").delete().eq("sleutel", sleutel), "Melding vergeten");
}

export async function leesInstelling(sleutel: string): Promise<string | null> {
  const rij = check(
    await db().from("bouw_instellingen").select("waarde").eq("sleutel", sleutel).maybeSingle(),
    "Instelling lezen",
  ) as { waarde: string } | null;
  return rij?.waarde ?? null;
}

export async function zetInstelling(sleutel: string, waarde: string): Promise<void> {
  check(
    await db().from("bouw_instellingen").upsert({ sleutel, waarde, updated_at: new Date().toISOString() }),
    "Instelling bewaren",
  );
}

export async function verwijderInstelling(sleutel: string): Promise<void> {
  check(await db().from("bouw_instellingen").delete().eq("sleutel", sleutel), "Instelling verwijderen");
}
