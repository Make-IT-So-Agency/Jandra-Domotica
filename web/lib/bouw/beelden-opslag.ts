import "server-only";

import { db } from "@/lib/supabase";

import { check, geraakt, zelfdeHuis } from "./databank";
import { schoonStandpunt, type Standpunt } from "./drie/beelden";

/**
 * De beelden van een huis in de databank, zoals de renders van de
 * keukenbouwer of de schrijnwerker: de foto, een titel, de ruimte die het
 * toont, en het standpunt van de camera (zie drie/beelden.ts). De tabel staat
 * in supabase/migrations/20261018110000_bouw_beelden.sql.
 */

export interface Beeldrij {
  id: number;
  bestand_id: number;
  titel: string;
  ruimte_id: number | null;
  verdieping_id: number | null;
  standpunt: Standpunt | null;
  volgorde: number;
}

const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));

function alsBeeld(rij: Record<string, unknown>): Beeldrij {
  // Een standpunt zonder verdieping valt weg: dan is niet te zeggen in welk gebouw het staat.
  const verdieping = getalOfNull(rij.verdieping_id);
  return {
    id: Number(rij.id),
    bestand_id: Number(rij.bestand_id),
    titel: String(rij.titel ?? ""),
    ruimte_id: getalOfNull(rij.ruimte_id),
    verdieping_id: verdieping,
    standpunt: verdieping === null ? null : schoonStandpunt(rij.standpunt),
    volgorde: Number(rij.volgorde ?? 0),
  };
}

export async function lijstBeelden(huisId: number): Promise<Beeldrij[]> {
  const rijen = check(
    await db().from("bouw_beelden").select("*").eq("huis_id", huisId).order("volgorde", { ascending: true }).order("id", { ascending: true }),
    "Beelden lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsBeeld);
}

export async function leesBeeld(huisId: number, id: number): Promise<Beeldrij | null> {
  const rij = check(await db().from("bouw_beelden").select("*").eq("id", id).eq("huis_id", huisId).maybeSingle(), "Beeld lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsBeeld(rij) : null;
}

export async function voegBeeldToe(huisId: number, beeld: { bestand_id: number; titel: string; ruimte_id: number | null }): Promise<number> {
  await zelfdeHuis(huisId, ["bouw_bestanden", beeld.bestand_id], ["bouw_ruimtes", beeld.ruimte_id]);
  const rij = check(
    await db()
      .from("bouw_beelden")
      .insert({ ...beeld, huis_id: huisId, verdieping_id: null, standpunt: null })
      .select("id")
      .single(),
    "Beeld bewaren",
    { inGebruik: "De ruimte bestaat niet meer." },
  ) as { id: number };
  return Number(rij.id);
}

export async function wijzigBeeld(huisId: number, id: number, beeld: { titel: string; ruimte_id: number | null }): Promise<void> {
  await zelfdeHuis(huisId, ["bouw_ruimtes", beeld.ruimte_id]);
  geraakt(
    check(await db().from("bouw_beelden").update(beeld).eq("id", id).eq("huis_id", huisId).select("id"), "Beeld bewaren", {
      inGebruik: "De ruimte bestaat niet meer.",
    }),
  );
}

/** Het standpunt van de camera, met de verdieping waar het oog staat; null wist het. */
export async function zetStandpunt(huisId: number, id: number, verdiepingId: number | null, standpunt: Standpunt | null): Promise<void> {
  if ((verdiepingId === null) !== (standpunt === null)) throw new Error("Een standpunt hoort bij een verdieping.");
  await zelfdeHuis(huisId, ["bouw_verdiepingen", verdiepingId]);
  geraakt(
    check(
      await db().from("bouw_beelden").update({ verdieping_id: verdiepingId, standpunt }).eq("id", id).eq("huis_id", huisId).select("id"),
      "Standpunt bewaren",
      { inGebruik: "De verdieping bestaat niet meer." },
    ),
  );
}

/** Geeft het bestand terug, zodat het uit Storage kan; null als het beeld er niet (meer) is. */
export async function verwijderBeeld(huisId: number, id: number): Promise<number | null> {
  const beeld = await leesBeeld(huisId, id);
  if (!beeld) return null;
  check(await db().from("bouw_beelden").delete().eq("id", id).eq("huis_id", huisId), "Beeld verwijderen");
  return beeld.bestand_id;
}

export async function aantalBeelden(huisId: number): Promise<number> {
  const rijen = check(await db().from("bouw_beelden").select("id").eq("huis_id", huisId), "Beelden tellen") as unknown[];
  return rijen.length;
}
