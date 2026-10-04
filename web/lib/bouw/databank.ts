import "server-only";

import { db } from "@/lib/supabase";

/**
 * Wat elke opslagmodule van Bouw deelt: fouten van de databank omzetten naar
 * een leesbare melding, en nakijken bij welk huis een rij hoort.
 *
 * Elk huis heeft zijn eigen gegevens (zie 20261003114500_bouw_huizen.sql). De
 * tabellen in HUISTABELLEN hebben een eigen huis_id; de rest hoort via zijn
 * ouder bij een huis, zoals een ruimte via haar verdieping en die via haar
 * gebouw.
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
// Bij welk huis hoort het?
// ---------------------------------------------------------------------------

/** De tabellen met een eigen huis_id. */
export const HUISTABELLEN = [
  "bouw_gebouwen",
  "bouw_partijen",
  "bouw_plannen",
  "bouw_planning",
  "bouw_keuzes",
  "bouw_beslissingen",
  "bouw_posten",
  "bouw_facturen",
  "bouw_kredietopnames",
  "bouw_dagboek",
  "bouw_opleverpunten",
  "bouw_actiepunten",
  "bouw_garanties",
  "bouw_onderhoud",
  "bouw_documenten",
  "bouw_werffotos",
  "bouw_inzendingen",
  "bouw_bestanden",
] as const;

export type Huistabel = (typeof HUISTABELLEN)[number];

/** Hoe een rij zonder eigen huis_id bij een huis hoort: via welke kolom, naar welke tabel. */
const OUDERS = {
  bouw_verdiepingen: { kolom: "gebouw_id", tabel: "bouw_gebouwen" },
  bouw_ruimtes: { kolom: "verdieping_id", tabel: "bouw_verdiepingen" },
  bouw_punten: { kolom: "verdieping_id", tabel: "bouw_verdiepingen" },
  bouw_objecten: { kolom: "verdieping_id", tabel: "bouw_verdiepingen" },
  bouw_leidingen: { kolom: "verdieping_id", tabel: "bouw_verdiepingen" },
  bouw_planversies: { kolom: "plan_id", tabel: "bouw_plannen" },
  bouw_omzettingen: { kolom: "planversie_id", tabel: "bouw_planversies" },
  bouw_opties: { kolom: "keuze_id", tabel: "bouw_keuzes" },
  bouw_links: { kolom: "partij_id", tabel: "bouw_partijen" },
  bouw_offertes: { kolom: "post_id", tabel: "bouw_posten" },
  bouw_meerwerken: { kolom: "post_id", tabel: "bouw_posten" },
  bouw_onderhoudsbeurten: { kolom: "onderhoud_id", tabel: "bouw_onderhoud" },
} as const;

export type Kindtabel = keyof typeof OUDERS;

const isHuistabel = (tabel: string): tabel is Huistabel => (HUISTABELLEN as readonly string[]).includes(tabel);

/** Bij welk huis een rij hoort, of null als ze er niet (meer) is. */
export async function huisVanRij(tabel: Huistabel | Kindtabel, id: number): Promise<number | null> {
  if (isHuistabel(tabel)) {
    const rij = check(
      await db().from(tabel).select("huis_id").eq("id", id).maybeSingle(),
      "Het huis opzoeken",
    ) as { huis_id: number | string } | null;
    return rij ? Number(rij.huis_id) : null;
  }
  const ouder = OUDERS[tabel];
  const rij = check(
    await db().from(tabel).select(ouder.kolom).eq("id", id).maybeSingle(),
    "Het huis opzoeken",
  ) as Record<string, unknown> | null;
  const ouderId = rij?.[ouder.kolom];
  return ouderId === null || ouderId === undefined ? null : huisVanRij(ouder.tabel, Number(ouderId));
}

export type Verwijzing = readonly [tabel: Huistabel | Kindtabel, id: number | null | undefined];

/**
 * Weigert een verwijzing naar iets van een ander huis, of naar iets wat er
 * niet (meer) is. Een lege verwijzing (null) mag altijd.
 */
export async function zelfdeHuis(huisId: number, ...verwijzingen: Verwijzing[]): Promise<void> {
  for (const [tabel, id] of verwijzingen) {
    if (id === null || id === undefined) continue;
    const huis = await huisVanRij(tabel, id);
    if (huis !== huisId) throw new Bouwfout("Dat hoort niet bij dit huis, of het bestaat niet meer.");
  }
}

/** De ids van de rijen van een huis, in een tabel met een eigen huis_id. */
export async function idsVanHuis(tabel: Huistabel, huisId: number): Promise<number[]> {
  const rijen = check(await db().from(tabel).select("id").eq("huis_id", huisId), "Lezen") as { id: number | string }[];
  return rijen.map((rij) => Number(rij.id));
}

/** De verdiepingen van een huis, via zijn gebouwen. */
export async function verdiepingenVanHuis(huisId: number): Promise<number[]> {
  const gebouwen = await idsVanHuis("bouw_gebouwen", huisId);
  if (gebouwen.length === 0) return [];
  const rijen = check(
    await db().from("bouw_verdiepingen").select("id").in("gebouw_id", gebouwen),
    "Verdiepingen lezen",
  ) as { id: number | string }[];
  return rijen.map((rij) => Number(rij.id));
}

/** Een wijziging die niets raakte, hoort bij een ander huis of bestaat niet meer. */
export function geraakt(rijen: unknown[] | null | undefined): void {
  if (!rijen || rijen.length === 0) throw new Bouwfout("Dat hoort niet bij dit huis, of het bestaat niet meer.");
}

/**
 * De ids die je vroeg, voor zover ze bij het huis horen; zonder vraag alle
 * ids van het huis. Een ouder-id uit een formulier of uit de browser filtert
 * zo nooit buiten het huis.
 */
export async function binnenHuis(tabel: Huistabel, huisId: number, gevraagd?: number[]): Promise<number[]> {
  const eigen = await idsVanHuis(tabel, huisId);
  if (!gevraagd) return eigen;
  const set = new Set(eigen);
  return gevraagd.filter((id) => set.has(id));
}

/** De ruimtes van een huis, via zijn verdiepingen. */
export async function ruimtesVanHuis(huisId: number): Promise<number[]> {
  const verdiepingen = await verdiepingenVanHuis(huisId);
  if (verdiepingen.length === 0) return [];
  const rijen = check(
    await db().from("bouw_ruimtes").select("id").in("verdieping_id", verdiepingen),
    "Ruimtes lezen",
  ) as { id: number | string }[];
  return rijen.map((rij) => Number(rij.id));
}
