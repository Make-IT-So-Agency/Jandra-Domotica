import "server-only";

import { db } from "@/lib/supabase";

import { binnenHuis, check, geraakt, huisVanRij, zelfdeHuis } from "./databank";
import type { Dossierdocument, Garantie, Onderhoud, SoortDocument } from "./nazorg";

/**
 * Het woningdossier en de nazorg van een huis in de databank. De tabellen
 * staan in supabase/migrations/20261002202509_bouw_dossier.sql. Documenten,
 * garanties en onderhoud hebben een eigen huis_id; een beurt hoort bij haar
 * onderhoud.
 */

const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
const tekstOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : String(waarde));

// ---------------------------------------------------------------------------
// Documenten
// ---------------------------------------------------------------------------

export type NieuwDocument = Omit<Dossierdocument, "id" | "created_at">;

function alsDocument(rij: Record<string, unknown>): Dossierdocument {
  return {
    id: Number(rij.id),
    bestand_id: Number(rij.bestand_id),
    soort: ((rij.soort as SoortDocument | undefined) ?? "andere") as SoortDocument,
    titel: String(rij.titel),
    partij_id: getalOfNull(rij.partij_id),
    datum: tekstOfNull(rij.datum),
    opmerking: tekstOfNull(rij.opmerking),
    door: tekstOfNull(rij.door),
    created_at: String(rij.created_at ?? ""),
  };
}

export async function lijstDocumenten(huisId: number): Promise<Dossierdocument[]> {
  const rijen = check(
    await db().from("bouw_documenten").select("*").eq("huis_id", huisId).order("soort").order("titel"),
    "Documenten lezen",
  ) as Record<
    string,
    unknown
  >[];
  return rijen.map(alsDocument);
}

export async function leesDocument(huisId: number, id: number): Promise<Dossierdocument | null> {
  const rij = check(
    await db().from("bouw_documenten").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Document lezen",
  ) as Record<
    string,
    unknown
  > | null;
  return rij ? alsDocument(rij) : null;
}

export async function voegDocumentToe(huisId: number, document: NieuwDocument): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_bestanden", document.bestand_id], ["bouw_partijen", document.partij_id]);
  const rij = check(
    await db().from("bouw_documenten").insert({ ...document, huis_id: huisId }).select("id").single(),
    "Document bewaren",
    { inGebruik: "De partij bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigDocument(
  huisId: number,
  id: number,
  document: Pick<Dossierdocument, "soort" | "titel" | "partij_id" | "datum" | "opmerking">,
): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_partijen", document.partij_id]);
  geraakt(
    check(await db().from("bouw_documenten").update(document).eq("id", id).eq("huis_id", huisId).select("id"), "Document bewaren", {
      inGebruik: "De partij bestaat niet meer.",
    }),
  );
}

/** Geeft het bestand terug, zodat het uit Storage kan. Een garantie die ernaar verwees, houdt geen document. */
export async function verwijderDocument(huisId: number, id: number): Promise<number | null> {
  const document = await leesDocument(huisId, id);
  if (!document) return null;
  check(await db().from("bouw_documenten").delete().eq("id", id).eq("huis_id", huisId), "Document verwijderen");
  return document.bestand_id;
}

// ---------------------------------------------------------------------------
// Garanties
// ---------------------------------------------------------------------------

export type NieuweGarantie = Omit<Garantie, "id">;

function alsGarantie(rij: Record<string, unknown>): Garantie {
  return {
    id: Number(rij.id),
    wat: String(rij.wat),
    partij_id: getalOfNull(rij.partij_id),
    begin: String(rij.begin),
    duur_maanden: Number(rij.duur_maanden),
    document_id: getalOfNull(rij.document_id),
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstGaranties(huisId: number): Promise<Garantie[]> {
  const rijen = check(
    await db().from("bouw_garanties").select("*").eq("huis_id", huisId).order("begin").order("id"),
    "Garanties lezen",
  ) as Record<
    string,
    unknown
  >[];
  return rijen.map(alsGarantie);
}

export async function voegGarantieToe(huisId: number, garantie: NieuweGarantie): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_partijen", garantie.partij_id], ["bouw_documenten", garantie.document_id]);
  const rij = check(
    await db().from("bouw_garanties").insert({ ...garantie, huis_id: huisId }).select("id").single(),
    "Garantie bewaren",
    { inGebruik: "De partij of het document bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigGarantie(huisId: number, id: number, garantie: NieuweGarantie): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_partijen", garantie.partij_id], ["bouw_documenten", garantie.document_id]);
  geraakt(
    check(await db().from("bouw_garanties").update(garantie).eq("id", id).eq("huis_id", huisId).select("id"), "Garantie bewaren", {
      inGebruik: "De partij of het document bestaat niet meer.",
    }),
  );
}

export async function verwijderGarantie(huisId: number, id: number): Promise<void> {
  check(await db().from("bouw_garanties").delete().eq("id", id).eq("huis_id", huisId), "Garantie verwijderen");
}

// ---------------------------------------------------------------------------
// Onderhoud
// ---------------------------------------------------------------------------

export type NieuwOnderhoud = Omit<Onderhoud, "id">;

function alsOnderhoud(rij: Record<string, unknown>): Onderhoud {
  return {
    id: Number(rij.id),
    wat: String(rij.wat),
    interval_maanden: Number(rij.interval_maanden),
    laatst_gedaan: tekstOfNull(rij.laatst_gedaan),
    partij_id: getalOfNull(rij.partij_id),
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstOnderhoud(huisId: number): Promise<Onderhoud[]> {
  const rijen = check(
    await db().from("bouw_onderhoud").select("*").eq("huis_id", huisId).order("wat"),
    "Onderhoud lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsOnderhoud);
}

export async function leesOnderhoud(huisId: number, id: number): Promise<Onderhoud | null> {
  const rij = check(
    await db().from("bouw_onderhoud").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(),
    "Onderhoud lezen",
  ) as Record<
    string,
    unknown
  > | null;
  return rij ? alsOnderhoud(rij) : null;
}

/** Wat al eens gebeurde, krijgt meteen die eerste beurt: laatst_gedaan is altijd de laatste beurt. */
export async function voegOnderhoudToe(huisId: number, onderhoud: NieuwOnderhoud, door: string | null = null): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_partijen", onderhoud.partij_id]);
  const rij = check(
    await db().from("bouw_onderhoud").insert({ ...onderhoud, huis_id: huisId }).select("id").single(),
    "Onderhoud bewaren",
    { inGebruik: "De partij bestaat niet meer." },
  ) as { id: number };
  const id = Number(rij.id);
  if (onderhoud.laatst_gedaan) {
    check(
      await db().from("bouw_onderhoudsbeurten").insert({ onderhoud_id: id, datum: onderhoud.laatst_gedaan, door, opmerking: null }),
      "Beurt bewaren",
    );
  }
  return id;
}

export async function wijzigOnderhoud(huisId: number, id: number, onderhoud: Omit<NieuwOnderhoud, "laatst_gedaan">): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_partijen", onderhoud.partij_id]);
  geraakt(
    check(await db().from("bouw_onderhoud").update(onderhoud).eq("id", id).eq("huis_id", huisId).select("id"), "Onderhoud bewaren", {
      inGebruik: "De partij bestaat niet meer.",
    }),
  );
}

export async function verwijderOnderhoud(huisId: number, id: number): Promise<void> {
  check(await db().from("bouw_onderhoud").delete().eq("id", id).eq("huis_id", huisId), "Onderhoud verwijderen");
}

export interface Beurt {
  id: number;
  onderhoud_id: number;
  datum: string;
  opmerking: string | null;
  door: string | null;
}

/** De beurten van het onderhoud van het huis. */
export async function lijstBeurten(huisId: number): Promise<Beurt[]> {
  const onderhoud = await binnenHuis("bouw_onderhoud", huisId);
  if (onderhoud.length === 0) return [];
  const rijen = check(
    await db()
      .from("bouw_onderhoudsbeurten")
      .select("*")
      .in("onderhoud_id", onderhoud)
      .order("datum", { ascending: false })
      .order("id", { ascending: false }),
    "Beurten lezen",
  ) as Record<string, unknown>[];
  return rijen.map((rij) => ({
    id: Number(rij.id),
    onderhoud_id: Number(rij.onderhoud_id),
    datum: String(rij.datum),
    opmerking: tekstOfNull(rij.opmerking),
    door: tekstOfNull(rij.door),
  }));
}

/**
 * Een beurt noteren, één keer per dag: een dubbele tik telt één keer.
 * "Laatst gedaan" schuift enkel vooruit: wie een oude beurt nog invult, zet
 * de volgende niet terug in de tijd.
 */
export async function registreerBeurt(
  huisId: number,
  onderhoud: Onderhoud,
  datum: string,
  door: string,
  opmerking: string | null,
): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_onderhoud", onderhoud.id]);
  check(
    await db()
      .from("bouw_onderhoudsbeurten")
      .upsert({ onderhoud_id: onderhoud.id, datum, door, opmerking }, { onConflict: "onderhoud_id,datum", ignoreDuplicates: true }),
    "Beurt bewaren",
    { inGebruik: "Dit onderhoud bestaat niet meer." },
  );
  if (!onderhoud.laatst_gedaan || datum > onderhoud.laatst_gedaan) {
    check(await db().from("bouw_onderhoud").update({ laatst_gedaan: datum }).eq("id", onderhoud.id), "Onderhoud bewaren");
  }
}

/**
 * Een beurt schrappen, bv. als ze bij het verkeerde onderhoud genoteerd werd.
 * "Laatst gedaan" wordt weer de laatste beurt die overblijft, of leeg.
 * Geeft het onderhoud terug.
 */
export async function verwijderBeurt(huisId: number, beurtId: number): Promise<number | null> {
  if ((await huisVanRij("bouw_onderhoudsbeurten", beurtId)) !== huisId) return null;
  const beurt = check(
    await db().from("bouw_onderhoudsbeurten").select("onderhoud_id").eq("id", beurtId).maybeSingle(),
    "Beurt lezen",
  ) as { onderhoud_id: number } | null;
  if (!beurt) return null;
  const onderhoudId = Number(beurt.onderhoud_id);
  check(await db().from("bouw_onderhoudsbeurten").delete().eq("id", beurtId), "Beurt verwijderen");
  const laatste = check(
    await db().from("bouw_onderhoudsbeurten").select("datum").eq("onderhoud_id", onderhoudId).order("datum", { ascending: false }).limit(1),
    "Beurten lezen",
  ) as { datum: string }[];
  check(
    await db().from("bouw_onderhoud").update({ laatst_gedaan: laatste[0]?.datum ?? null }).eq("id", onderhoudId),
    "Onderhoud bewaren",
  );
  return onderhoudId;
}
