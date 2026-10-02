import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/supabase";

import { TOKENVORM, standVanLink, type Inzendgegevens, type RechtLink, type SoortInzending } from "./linkregels";
import { check } from "./opslag";
import type { SoortPartij } from "./types";

/**
 * Persoonlijke links voor een partij, en wat die partij via haar link
 * instuurt. De tabellen staan in
 * supabase/migrations/20261002500000_bouw_links.sql.
 *
 * Het token zelf wordt nergens bewaard, enkel de SHA-256 ervan. Wie de link
 * kwijt is, krijgt een nieuwe.
 */

export function hashVan(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function maakToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashVan(token) };
}

export interface Link {
  id: number;
  partij_id: number;
  rechten: RechtLink[];
  vervalt_op: string;
  ingetrokken_op: string | null;
  laatst_gebruikt_op: string | null;
  gemaakt_door: string | null;
  created_at: string;
}

function alsLink(rij: Record<string, unknown>): Link {
  return {
    id: Number(rij.id),
    partij_id: Number(rij.partij_id),
    rechten: ((rij.rechten as string[] | null) ?? []) as RechtLink[],
    vervalt_op: String(rij.vervalt_op),
    ingetrokken_op: (rij.ingetrokken_op as string | null) ?? null,
    laatst_gebruikt_op: (rij.laatst_gebruikt_op as string | null) ?? null,
    gemaakt_door: (rij.gemaakt_door as string | null) ?? null,
    created_at: String(rij.created_at ?? ""),
  };
}

/** Maakt een link en geeft het token terug: dit is de enige keer dat het bestaat. */
export async function maakLink(link: {
  partijId: number;
  rechten: RechtLink[];
  vervaltOp: Date;
  door: string;
}): Promise<{ id: number; token: string }> {
  const { token, hash } = maakToken();
  const rij = check(
    await db()
      .from("bouw_links")
      .insert({
        partij_id: link.partijId,
        token_hash: hash,
        rechten: link.rechten,
        vervalt_op: link.vervaltOp.toISOString(),
        gemaakt_door: link.door,
      })
      .select("id")
      .single(),
    "Link maken",
    { inGebruik: "Deze partij bestaat niet meer." },
  ) as { id: number };
  return { id: Number(rij.id), token };
}

export async function lijstLinks(): Promise<Link[]> {
  const rijen = check(
    await db().from("bouw_links").select("*").order("created_at", { ascending: false }),
    "Links lezen",
  ) as Record<string, unknown>[];
  return rijen.map(alsLink);
}

export async function trekLinkIn(id: number): Promise<void> {
  check(
    await db().from("bouw_links").update({ ingetrokken_op: new Date().toISOString() }).eq("id", id).is("ingetrokken_op", null),
    "Link intrekken",
  );
}

/** Wie er met een geldige link binnenkomt. */
export interface Externe {
  linkId: number;
  partijId: number;
  partijnaam: string;
  partijsoort: SoortPartij;
  rechten: RechtLink[];
  vervaltOp: string;
}

/** Hoe vaak "laatst gebruikt" bijgewerkt wordt: niet bij elke klik een schrijfactie. */
const GEBRUIK_BIJWERKEN_NA_MS = 60 * 60 * 1000;

/**
 * Het token uit een URL nakijken. Null bij een onbekend, verlopen of
 * ingetrokken token: wie de link heeft, hoeft niet te weten welke van de drie.
 */
export async function leesLink(token: string, nu = new Date()): Promise<Externe | null> {
  if (!TOKENVORM.test(token)) return null;
  const rij = check(
    await db().from("bouw_links").select("*").eq("token_hash", hashVan(token)).maybeSingle(),
    "Link nakijken",
  ) as Record<string, unknown> | null;
  if (!rij) return null;
  const link = alsLink(rij);
  if (standVanLink(link, nu) !== "actief") return null;

  const partij = check(
    await db().from("bouw_partijen").select("id, naam, soort").eq("id", link.partij_id).maybeSingle(),
    "Partij lezen",
  ) as { id: number; naam: string; soort: SoortPartij } | null;
  if (!partij) return null;

  const laatst = link.laatst_gebruikt_op ? new Date(link.laatst_gebruikt_op).getTime() : 0;
  if (nu.getTime() - laatst > GEBRUIK_BIJWERKEN_NA_MS) {
    await db().from("bouw_links").update({ laatst_gebruikt_op: nu.toISOString() }).eq("id", link.id);
  }

  return {
    linkId: link.id,
    partijId: Number(partij.id),
    partijnaam: partij.naam,
    partijsoort: partij.soort,
    rechten: link.rechten,
    vervaltOp: link.vervalt_op,
  };
}

/** Hoeveel bestanden deze link sinds `sinds` begon op te laden, ook wat nooit afgerond werd. */
export async function telUploadsVanLink(linkId: number, sinds: Date): Promise<number> {
  const rijen = check(
    await db().from("bouw_bestanden").select("created_at").eq("opgeladen_door", doorLink(linkId)),
    "Uploads tellen",
  ) as { created_at: string }[];
  return rijen.filter((rij) => new Date(rij.created_at).getTime() >= sinds.getTime()).length;
}

/** Wat er bij een bestand van een link als "opgeladen door" staat. */
export function doorLink(linkId: number): string {
  return `link:${linkId}`;
}

// ---------------------------------------------------------------------------
// Inzendingen
// ---------------------------------------------------------------------------

export type StatusInzending = "nieuw" | "verwerkt" | "genegeerd";

export interface Inzending extends Inzendgegevens {
  id: number;
  link_id: number | null;
  partij_id: number | null;
  bestand_id: number;
  soort: SoortInzending;
  opmerking: string | null;
  status: StatusInzending;
  verwerkt_op: string | null;
  verwerkt_door: string | null;
  /** Waar ze terechtkwam, bij Geld. */
  offerte_id: number | null;
  factuur_id: number | null;
  created_at: string;
}

const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
const tekstOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : String(waarde));

function alsInzending(rij: Record<string, unknown>): Inzending {
  return {
    id: Number(rij.id),
    link_id: getalOfNull(rij.link_id),
    partij_id: getalOfNull(rij.partij_id),
    bestand_id: Number(rij.bestand_id),
    soort: (rij.soort as SoortInzending | undefined) ?? "plan",
    opmerking: tekstOfNull(rij.opmerking),
    bedrag: getalOfNull(rij.bedrag),
    nummer: tekstOfNull(rij.nummer),
    datum: tekstOfNull(rij.datum),
    vervaldag: tekstOfNull(rij.vervaldag),
    status: (rij.status as StatusInzending) ?? "nieuw",
    verwerkt_op: tekstOfNull(rij.verwerkt_op),
    verwerkt_door: tekstOfNull(rij.verwerkt_door),
    offerte_id: getalOfNull(rij.offerte_id),
    factuur_id: getalOfNull(rij.factuur_id),
    created_at: String(rij.created_at ?? ""),
  };
}

export async function voegInzendingToe(
  inzending: {
    linkId: number;
    partijId: number;
    bestandId: number;
    opmerking: string | null;
    soort?: SoortInzending;
  } & Partial<Inzendgegevens>,
): Promise<number> {
  const rij = check(
    await db()
      .from("bouw_inzendingen")
      .insert({
        link_id: inzending.linkId,
        partij_id: inzending.partijId,
        bestand_id: inzending.bestandId,
        opmerking: inzending.opmerking,
        soort: inzending.soort ?? "plan",
        bedrag: inzending.bedrag ?? null,
        nummer: inzending.nummer ?? null,
        datum: inzending.datum ?? null,
        vervaldag: inzending.vervaldag ?? null,
      })
      .select("id")
      .single(),
    "Inzending bewaren",
  ) as { id: number };
  return Number(rij.id);
}

export async function lijstInzendingen(
  filter: { status?: StatusInzending; linkId?: number; soorten?: SoortInzending[] } = {},
): Promise<Inzending[]> {
  let vraag = db().from("bouw_inzendingen").select("*");
  if (filter.status) vraag = vraag.eq("status", filter.status);
  if (filter.linkId !== undefined) vraag = vraag.eq("link_id", filter.linkId);
  if (filter.soorten) vraag = vraag.in("soort", filter.soorten);
  const rijen = check(await vraag.order("created_at", { ascending: false }), "Inzendingen lezen") as Record<string, unknown>[];
  return rijen.map(alsInzending);
}

export async function leesInzending(id: number): Promise<Inzending | null> {
  const rij = check(
    await db().from("bouw_inzendingen").select("*").eq("id", id).maybeSingle(),
    "Inzending lezen",
  ) as Record<string, unknown> | null;
  return rij ? alsInzending(rij) : null;
}

export async function zetInzendingStatus(
  id: number,
  status: StatusInzending,
  door: string,
  koppeling: { offerte_id?: number; factuur_id?: number } = {},
): Promise<void> {
  check(
    await db()
      .from("bouw_inzendingen")
      .update({ status, verwerkt_op: new Date().toISOString(), verwerkt_door: door, ...koppeling })
      .eq("id", id),
    "Inzending bijwerken",
  );
}
