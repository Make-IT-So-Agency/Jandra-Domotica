import "server-only";

import { db } from "@/lib/supabase";

import { check } from "./opslag";
import type { Actiepunt, Opleverpunt, Ronde, StatusOpleverpunt, Stapwijziging } from "./werf";

/**
 * De werf in de databank: het dagboek, de foto's, de actiepunten, de
 * opleverpunten en de checklist. De tabellen staan in
 * supabase/migrations/20261002900000_bouw_werf.sql.
 */

const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
const tekstOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : String(waarde));

// ---------------------------------------------------------------------------
// Het dagboek
// ---------------------------------------------------------------------------

export interface Dagboekdag {
  id: number;
  datum: string;
  tekst: string;
  aanwezig: string | null;
  weer: string | null;
  door: string | null;
}

export type NieuweDagboekdag = Omit<Dagboekdag, "id">;

function alsDag(rij: Record<string, unknown>): Dagboekdag {
  return {
    id: Number(rij.id),
    datum: String(rij.datum),
    tekst: String(rij.tekst),
    aanwezig: tekstOfNull(rij.aanwezig),
    weer: tekstOfNull(rij.weer),
    door: tekstOfNull(rij.door),
  };
}

export async function lijstDagboek(): Promise<Dagboekdag[]> {
  const rijen = check(
    await db().from("bouw_dagboek").select("*").order("datum", { ascending: false }).order("id", { ascending: false }),
    "Dagboek lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsDag);
}

export async function leesDagboekdag(id: number): Promise<Dagboekdag | null> {
  const rij = check(await db().from("bouw_dagboek").select("*").eq("id", id).maybeSingle(), "Dagboek lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsDag(rij) : null;
}

export async function voegDagboekdagToe(dag: NieuweDagboekdag): Promise<number> {
  const rij = check(await db().from("bouw_dagboek").insert(dag).select("id").single(), "Dagboek bewaren") as { id: number };
  return Number(rij.id);
}

export async function wijzigDagboekdag(id: number, dag: Omit<NieuweDagboekdag, "door">): Promise<void> {
  check(await db().from("bouw_dagboek").update(dag).eq("id", id), "Dagboek bewaren");
}

/** De foto's van die dag blijven, zonder dagboek. */
export async function verwijderDagboekdag(id: number): Promise<void> {
  check(await db().from("bouw_dagboek").delete().eq("id", id), "Dagboek verwijderen");
}

// ---------------------------------------------------------------------------
// Foto's
// ---------------------------------------------------------------------------

export interface Werffoto {
  id: number;
  bestand_id: number;
  genomen_op: string;
  onderschrift: string | null;
  verdieping_id: number | null;
  ruimte_id: number | null;
  x_m: number | null;
  y_m: number | null;
  dagboek_id: number | null;
  opleverpunt_id: number | null;
  door: string | null;
  created_at: string;
}

export type NieuweWerffoto = Omit<Werffoto, "id" | "created_at">;

function alsFoto(rij: Record<string, unknown>): Werffoto {
  return {
    id: Number(rij.id),
    bestand_id: Number(rij.bestand_id),
    genomen_op: String(rij.genomen_op),
    onderschrift: tekstOfNull(rij.onderschrift),
    verdieping_id: getalOfNull(rij.verdieping_id),
    ruimte_id: getalOfNull(rij.ruimte_id),
    x_m: getalOfNull(rij.x_m),
    y_m: getalOfNull(rij.y_m),
    dagboek_id: getalOfNull(rij.dagboek_id),
    opleverpunt_id: getalOfNull(rij.opleverpunt_id),
    door: tekstOfNull(rij.door),
    created_at: String(rij.created_at ?? ""),
  };
}

export async function lijstWerffotos(
  filter: { ruimteId?: number; dagboekId?: number; opleverpuntIds?: number[] } = {},
): Promise<Werffoto[]> {
  let vraag = db().from("bouw_werffotos").select("*");
  if (filter.ruimteId !== undefined) vraag = vraag.eq("ruimte_id", filter.ruimteId);
  if (filter.dagboekId !== undefined) vraag = vraag.eq("dagboek_id", filter.dagboekId);
  if (filter.opleverpuntIds) {
    if (filter.opleverpuntIds.length === 0) return [];
    vraag = vraag.in("opleverpunt_id", filter.opleverpuntIds);
  }
  const rijen = check(await vraag.order("genomen_op", { ascending: false }).order("id", { ascending: false }), "Foto's lezen") as Record<
    string,
    unknown
  >[];
  return rijen.map(alsFoto);
}

export async function leesWerffoto(id: number): Promise<Werffoto | null> {
  const rij = check(await db().from("bouw_werffotos").select("*").eq("id", id).maybeSingle(), "Foto lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsFoto(rij) : null;
}

export async function voegWerffotoToe(foto: NieuweWerffoto): Promise<number> {
  const rij = check(await db().from("bouw_werffotos").insert(foto).select("id").single(), "Foto bewaren", {
    inGebruik: "De ruimte, de dag of het opleverpunt bestaat niet meer.",
  }) as { id: number };
  return Number(rij.id);
}

export async function wijzigWerffoto(
  id: number,
  foto: Pick<Werffoto, "onderschrift" | "verdieping_id" | "ruimte_id" | "x_m" | "y_m">,
): Promise<void> {
  check(await db().from("bouw_werffotos").update(foto).eq("id", id), "Foto bewaren", {
    inGebruik: "De ruimte of de verdieping bestaat niet meer.",
  });
}

/** Geeft het bestand terug, zodat het uit Storage kan. */
export async function verwijderWerffoto(id: number): Promise<number | null> {
  const foto = await leesWerffoto(id);
  if (!foto) return null;
  check(await db().from("bouw_werffotos").delete().eq("id", id), "Foto verwijderen");
  return foto.bestand_id;
}

// ---------------------------------------------------------------------------
// Actiepunten
// ---------------------------------------------------------------------------

export type NieuwActiepunt = Pick<Actiepunt, "titel" | "omschrijving" | "partij_id" | "deadline" | "door">;

function alsActiepunt(rij: Record<string, unknown>): Actiepunt {
  return {
    id: Number(rij.id),
    titel: String(rij.titel),
    omschrijving: tekstOfNull(rij.omschrijving),
    partij_id: getalOfNull(rij.partij_id),
    deadline: tekstOfNull(rij.deadline),
    status: rij.status === "klaar" ? "klaar" : "open",
    klaar_op: tekstOfNull(rij.klaar_op),
    door: tekstOfNull(rij.door),
    created_at: String(rij.created_at ?? ""),
  };
}

export async function lijstActiepunten(): Promise<Actiepunt[]> {
  const rijen = check(await db().from("bouw_actiepunten").select("*").order("created_at", { ascending: false }), "Actiepunten lezen") as Record<
    string,
    unknown
  >[];
  return rijen.map(alsActiepunt);
}

export async function leesActiepunt(id: number): Promise<Actiepunt | null> {
  const rij = check(await db().from("bouw_actiepunten").select("*").eq("id", id).maybeSingle(), "Actiepunt lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsActiepunt(rij) : null;
}

export async function voegActiepuntToe(punt: NieuwActiepunt): Promise<number> {
  const rij = check(await db().from("bouw_actiepunten").insert(punt).select("id").single(), "Actiepunt bewaren", {
    inGebruik: "Deze partij bestaat niet meer.",
  }) as { id: number };
  return Number(rij.id);
}

export async function wijzigActiepunt(id: number, punt: Omit<NieuwActiepunt, "door">): Promise<void> {
  check(await db().from("bouw_actiepunten").update(punt).eq("id", id), "Actiepunt bewaren", {
    inGebruik: "Deze partij bestaat niet meer.",
  });
}

export async function zetActiepuntKlaar(id: number, klaar: boolean, nu = new Date()): Promise<void> {
  check(
    await db()
      .from("bouw_actiepunten")
      .update({ status: klaar ? "klaar" : "open", klaar_op: klaar ? nu.toISOString() : null })
      .eq("id", id),
    "Actiepunt bewaren",
  );
}

export async function verwijderActiepunt(id: number): Promise<void> {
  check(await db().from("bouw_actiepunten").delete().eq("id", id), "Actiepunt verwijderen");
}

// ---------------------------------------------------------------------------
// Opleverpunten
// ---------------------------------------------------------------------------

export type NieuwOpleverpunt = Pick<
  Opleverpunt,
  "titel" | "omschrijving" | "partij_id" | "verdieping_id" | "ruimte_id" | "x_m" | "y_m" | "ronde" | "door"
>;

function alsOpleverpunt(rij: Record<string, unknown>): Opleverpunt {
  return {
    id: Number(rij.id),
    titel: String(rij.titel),
    omschrijving: tekstOfNull(rij.omschrijving),
    partij_id: getalOfNull(rij.partij_id),
    verdieping_id: getalOfNull(rij.verdieping_id),
    ruimte_id: getalOfNull(rij.ruimte_id),
    x_m: getalOfNull(rij.x_m),
    y_m: getalOfNull(rij.y_m),
    ronde: ((rij.ronde as Ronde | undefined) ?? "voorlopig") as Ronde,
    status: ((rij.status as StatusOpleverpunt | undefined) ?? "open") as StatusOpleverpunt,
    gemeld_op: tekstOfNull(rij.gemeld_op),
    hersteld_op: tekstOfNull(rij.hersteld_op),
    hersteld_door: tekstOfNull(rij.hersteld_door),
    herstelopmerking: tekstOfNull(rij.herstelopmerking),
    gecontroleerd_op: tekstOfNull(rij.gecontroleerd_op),
    gecontroleerd_door: tekstOfNull(rij.gecontroleerd_door),
    door: tekstOfNull(rij.door),
    created_at: String(rij.created_at ?? ""),
  };
}

export async function lijstOpleverpunten(filter: { partijId?: number } = {}): Promise<Opleverpunt[]> {
  let vraag = db().from("bouw_opleverpunten").select("*");
  if (filter.partijId !== undefined) vraag = vraag.eq("partij_id", filter.partijId);
  const rijen = check(await vraag.order("created_at").order("id"), "Opleverpunten lezen") as Record<string, unknown>[];
  return rijen.map(alsOpleverpunt);
}

export async function leesOpleverpunt(id: number): Promise<Opleverpunt | null> {
  const rij = check(await db().from("bouw_opleverpunten").select("*").eq("id", id).maybeSingle(), "Opleverpunt lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsOpleverpunt(rij) : null;
}

export async function voegOpleverpuntToe(punt: NieuwOpleverpunt): Promise<number> {
  const rij = check(await db().from("bouw_opleverpunten").insert(punt).select("id").single(), "Opleverpunt bewaren", {
    inGebruik: "De partij, de verdieping of de ruimte bestaat niet meer.",
  }) as { id: number };
  return Number(rij.id);
}

export async function wijzigOpleverpunt(id: number, punt: Omit<NieuwOpleverpunt, "door">): Promise<void> {
  check(await db().from("bouw_opleverpunten").update(punt).eq("id", id), "Opleverpunt bewaren", {
    inGebruik: "De partij, de verdieping of de ruimte bestaat niet meer.",
  });
}

/**
 * Een stap bewaren, enkel als het punt nog in de stand staat waarvan de stap
 * vertrok: twee mensen die tegelijk op een knop drukken, overschrijven
 * elkaar zo niet.
 */
export async function zetOpleverstap(id: number, van: StatusOpleverpunt, wijziging: Stapwijziging): Promise<boolean> {
  const rijen = check(
    await db().from("bouw_opleverpunten").update(wijziging).eq("id", id).eq("status", van).select("id"),
    "Opleverpunt bewaren",
  ) as unknown[];
  return rijen.length > 0;
}

/** De foto's blijven bij de werf, zonder opleverpunt. */
export async function verwijderOpleverpunt(id: number): Promise<void> {
  check(await db().from("bouw_opleverpunten").delete().eq("id", id), "Opleverpunt verwijderen");
}

// ---------------------------------------------------------------------------
// De checklist vóór alles dichtgaat
// ---------------------------------------------------------------------------

export interface Vinkje {
  ruimte_id: number;
  sleutel: string;
  gedaan_op: string;
  door: string | null;
}

export async function lijstVinkjes(): Promise<Vinkje[]> {
  const rijen = check(await db().from("bouw_checklist").select("ruimte_id, sleutel, gedaan_op, door"), "Checklist lezen") as Record<
    string,
    unknown
  >[];
  return rijen.map((rij) => ({
    ruimte_id: Number(rij.ruimte_id),
    sleutel: String(rij.sleutel),
    gedaan_op: String(rij.gedaan_op),
    door: tekstOfNull(rij.door),
  }));
}

export async function zetVinkje(ruimteId: number, sleutel: string, aan: boolean, door: string): Promise<void> {
  if (aan) {
    check(
      await db()
        .from("bouw_checklist")
        .upsert({ ruimte_id: ruimteId, sleutel, gedaan_op: new Date().toISOString(), door }, { onConflict: "ruimte_id,sleutel" }),
      "Checklist bewaren",
      { inGebruik: "Deze ruimte bestaat niet meer." },
    );
  } else {
    check(await db().from("bouw_checklist").delete().eq("ruimte_id", ruimteId).eq("sleutel", sleutel), "Checklist bewaren");
  }
}
