import "server-only";

import { db } from "@/lib/supabase";

import type {
  CategoriePost,
  Factuur,
  Kredietopname,
  Meerwerk,
  Offerte,
  Post,
  StatusMeerwerk,
  StatusOfferte,
} from "./geld";
import { zetInzendingStatus, type Inzending } from "./links";
import { check } from "./opslag";

/**
 * Het geld van de bouw in de databank. De tabellen staan in
 * supabase/migrations/20261002700000_bouw_geld.sql; het krediet en de eigen
 * inbreng in bouw_instellingen.
 */

const getal = (waarde: unknown) => Number(waarde);
const getalOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : Number(waarde));
const tekstOfNull = (waarde: unknown) => (waarde === null || waarde === undefined ? null : String(waarde));

// ---------------------------------------------------------------------------
// Posten
// ---------------------------------------------------------------------------

export type NieuwePost = Omit<Post, "id">;

function alsPost(rij: Record<string, unknown>): Post {
  return {
    id: getal(rij.id),
    naam: String(rij.naam),
    categorie: rij.categorie as CategoriePost,
    raming: getalOfNull(rij.raming),
    partij_id: getalOfNull(rij.partij_id),
    planning_id: getalOfNull(rij.planning_id),
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstPosten(): Promise<Post[]> {
  const rijen = check(await db().from("bouw_posten").select("*").order("categorie").order("naam"), "Posten lezen") as Record<string, unknown>[];
  return rijen.map(alsPost);
}

export async function leesPost(id: number): Promise<Post | null> {
  const rij = check(await db().from("bouw_posten").select("*").eq("id", id).maybeSingle(), "Post lezen") as Record<string, unknown> | null;
  return rij ? alsPost(rij) : null;
}

export async function voegPostToe(post: NieuwePost): Promise<number> {
  const rij = check(await db().from("bouw_posten").insert(post).select("id").single(), "Post toevoegen", {
    inGebruik: "De partij of de taak bestaat niet meer.",
  }) as { id: number };
  return getal(rij.id);
}

export async function wijzigPost(id: number, post: NieuwePost): Promise<void> {
  check(await db().from("bouw_posten").update(post).eq("id", id), "Post bewaren", {
    inGebruik: "De partij of de taak bestaat niet meer.",
  });
}

/** Een post met facturen blijft staan: die facturen horen bij de boekhouding. */
export async function verwijderPost(id: number): Promise<number[]> {
  const facturen = check(await db().from("bouw_facturen").select("id").eq("post_id", id), "Facturen zoeken") as unknown[];
  if (facturen.length > 0) throw new Error("Deze post heeft facturen. Hang die eerst aan een andere post, of verwijder ze.");
  const bestanden = (await lijstOffertes(id)).flatMap((offerte) => (offerte.bestand_id ? [offerte.bestand_id] : []));
  check(await db().from("bouw_posten").delete().eq("id", id), "Post verwijderen");
  return bestanden;
}

// ---------------------------------------------------------------------------
// Offertes
// ---------------------------------------------------------------------------

export type NieuweOfferte = Omit<Offerte, "id" | "status">;

function alsOfferte(rij: Record<string, unknown>): Offerte {
  return {
    id: getal(rij.id),
    post_id: getal(rij.post_id),
    partij_id: getalOfNull(rij.partij_id),
    omschrijving: tekstOfNull(rij.omschrijving),
    bedrag: getal(rij.bedrag),
    datum: tekstOfNull(rij.datum),
    geldig_tot: tekstOfNull(rij.geldig_tot),
    bestand_id: getalOfNull(rij.bestand_id),
    status: (rij.status as StatusOfferte) ?? "ontvangen",
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstOffertes(postId?: number): Promise<Offerte[]> {
  let vraag = db().from("bouw_offertes").select("*");
  if (postId !== undefined) vraag = vraag.eq("post_id", postId);
  const rijen = check(await vraag.order("bedrag"), "Offertes lezen") as Record<string, unknown>[];
  return rijen.map(alsOfferte);
}

export async function leesOfferte(id: number): Promise<Offerte | null> {
  const rij = check(await db().from("bouw_offertes").select("*").eq("id", id).maybeSingle(), "Offerte lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsOfferte(rij) : null;
}

export async function voegOfferteToe(offerte: NieuweOfferte): Promise<number> {
  const rij = check(await db().from("bouw_offertes").insert(offerte).select("id").single(), "Offerte toevoegen", {
    inGebruik: "De post of de partij bestaat niet meer.",
  }) as { id: number };
  return getal(rij.id);
}

export async function wijzigOfferte(id: number, offerte: Omit<NieuweOfferte, "post_id" | "bestand_id">): Promise<void> {
  check(await db().from("bouw_offertes").update(offerte).eq("id", id), "Offerte bewaren");
}

/** Een PDF bij een bestaande offerte; geeft het vorige bestand terug, zodat het uit Storage kan. */
export async function zetBestandVanOfferte(id: number, bestandId: number): Promise<number | null> {
  const offerte = await leesOfferte(id);
  if (!offerte) throw new Error("Deze offerte bestaat niet meer.");
  check(await db().from("bouw_offertes").update({ bestand_id: bestandId }).eq("id", id), "Offerte bewaren");
  return offerte.bestand_id !== bestandId ? offerte.bestand_id : null;
}

/** Geeft het bestand terug, zodat het uit Storage kan. */
export async function verwijderOfferte(id: number): Promise<number | null> {
  const offerte = await leesOfferte(id);
  if (!offerte) return null;
  check(await db().from("bouw_offertes").delete().eq("id", id), "Offerte verwijderen");
  return offerte.bestand_id;
}

/**
 * Kiest een offerte voor haar post: de andere worden afgewezen. Null zet
 * alles van die post terug op ontvangen.
 */
export async function kiesOfferte(postId: number, offerteId: number | null): Promise<void> {
  check(
    await db().from("bouw_offertes").update({ status: offerteId === null ? "ontvangen" : "afgewezen" }).eq("post_id", postId),
    "Offerte kiezen",
  );
  if (offerteId === null) return;
  check(
    await db().from("bouw_offertes").update({ status: "gekozen" }).eq("id", offerteId).eq("post_id", postId),
    "Offerte kiezen",
  );
}

// ---------------------------------------------------------------------------
// Meer- en minwerken
// ---------------------------------------------------------------------------

function alsMeerwerk(rij: Record<string, unknown>): Meerwerk {
  return {
    id: getal(rij.id),
    post_id: getal(rij.post_id),
    omschrijving: String(rij.omschrijving),
    bedrag: getal(rij.bedrag),
    datum: String(rij.datum),
    status: (rij.status as StatusMeerwerk) ?? "voorgesteld",
  };
}

export async function lijstMeerwerken(postId?: number): Promise<Meerwerk[]> {
  let vraag = db().from("bouw_meerwerken").select("*");
  if (postId !== undefined) vraag = vraag.eq("post_id", postId);
  const rijen = check(await vraag.order("datum").order("id"), "Meerwerken lezen") as Record<string, unknown>[];
  return rijen.map(alsMeerwerk);
}

export async function voegMeerwerkToe(meerwerk: Omit<Meerwerk, "id">): Promise<void> {
  check(await db().from("bouw_meerwerken").insert(meerwerk), "Meerwerk toevoegen", { inGebruik: "Deze post bestaat niet meer." });
}

export async function zetMeerwerkStatus(id: number, status: StatusMeerwerk): Promise<Meerwerk | null> {
  const rijen = check(await db().from("bouw_meerwerken").update({ status }).eq("id", id).select("*"), "Meerwerk bewaren") as Record<
    string,
    unknown
  >[];
  return rijen[0] ? alsMeerwerk(rijen[0]) : null;
}

export async function verwijderMeerwerk(id: number): Promise<void> {
  check(await db().from("bouw_meerwerken").delete().eq("id", id), "Meerwerk verwijderen");
}

// ---------------------------------------------------------------------------
// Facturen
// ---------------------------------------------------------------------------

export type NieuweFactuur = Omit<Factuur, "id">;

function alsFactuur(rij: Record<string, unknown>): Factuur {
  return {
    id: getal(rij.id),
    post_id: getalOfNull(rij.post_id),
    partij_id: getalOfNull(rij.partij_id),
    nummer: tekstOfNull(rij.nummer),
    omschrijving: tekstOfNull(rij.omschrijving),
    bedrag: getal(rij.bedrag),
    factuurdatum: String(rij.factuurdatum),
    vervaldag: tekstOfNull(rij.vervaldag),
    betaald_op: tekstOfNull(rij.betaald_op),
    bestand_id: getalOfNull(rij.bestand_id),
    vennootschap_id: tekstOfNull(rij.vennootschap_id),
    opmerking: tekstOfNull(rij.opmerking),
  };
}

export async function lijstFacturen(postId?: number): Promise<Factuur[]> {
  let vraag = db().from("bouw_facturen").select("*");
  if (postId !== undefined) vraag = vraag.eq("post_id", postId);
  const rijen = check(await vraag.order("factuurdatum", { ascending: false }).order("id", { ascending: false }), "Facturen lezen") as Record<
    string,
    unknown
  >[];
  return rijen.map(alsFactuur);
}

export async function leesFactuur(id: number): Promise<Factuur | null> {
  const rij = check(await db().from("bouw_facturen").select("*").eq("id", id).maybeSingle(), "Factuur lezen") as Record<
    string,
    unknown
  > | null;
  return rij ? alsFactuur(rij) : null;
}

/** Wanneer deze facturen betaald zijn, en verder niets: voor wat een partij via haar link ziet. */
export async function betaaldOpVan(ids: number[]): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map();
  const rijen = check(await db().from("bouw_facturen").select("id, betaald_op").in("id", ids), "Facturen lezen") as {
    id: number;
    betaald_op: string | null;
  }[];
  return new Map(rijen.map((rij) => [getal(rij.id), tekstOfNull(rij.betaald_op)]));
}

export async function voegFactuurToe(factuur: NieuweFactuur): Promise<number> {
  const rij = check(await db().from("bouw_facturen").insert(factuur).select("id").single(), "Factuur toevoegen", {
    inGebruik: "De post, de partij of de vennootschap bestaat niet meer.",
  }) as { id: number };
  return getal(rij.id);
}

export async function wijzigFactuur(id: number, factuur: Omit<NieuweFactuur, "bestand_id">): Promise<void> {
  check(await db().from("bouw_facturen").update(factuur).eq("id", id), "Factuur bewaren", {
    inGebruik: "De post, de partij of de vennootschap bestaat niet meer.",
  });
}

export async function zetBetaald(id: number, betaaldOp: string | null): Promise<void> {
  check(await db().from("bouw_facturen").update({ betaald_op: betaaldOp }).eq("id", id), "Betaling bewaren");
}

/** Een PDF bij een bestaande factuur; geeft het vorige bestand terug, zodat het uit Storage kan. */
export async function zetBestandVanFactuur(id: number, bestandId: number): Promise<number | null> {
  const factuur = await leesFactuur(id);
  if (!factuur) throw new Error("Deze factuur bestaat niet meer.");
  check(await db().from("bouw_facturen").update({ bestand_id: bestandId }).eq("id", id), "Factuur bewaren");
  return factuur.bestand_id !== bestandId ? factuur.bestand_id : null;
}

/** Geeft het bestand terug, zodat het uit Storage kan. */
export async function verwijderFactuur(id: number): Promise<number | null> {
  const factuur = await leesFactuur(id);
  if (!factuur) return null;
  check(await db().from("bouw_facturen").delete().eq("id", id), "Factuur verwijderen");
  return factuur.bestand_id;
}

// ---------------------------------------------------------------------------
// Het bouwkrediet
// ---------------------------------------------------------------------------

export async function lijstKredietopnames(): Promise<Kredietopname[]> {
  const rijen = check(await db().from("bouw_kredietopnames").select("*").order("datum").order("id"), "Kredietopnames lezen") as Record<
    string,
    unknown
  >[];
  return rijen.map((rij) => ({
    id: getal(rij.id),
    datum: String(rij.datum),
    bedrag: getal(rij.bedrag),
    factuur_id: getalOfNull(rij.factuur_id),
    opmerking: tekstOfNull(rij.opmerking),
  }));
}

export async function voegKredietopnameToe(opname: Omit<Kredietopname, "id">): Promise<void> {
  check(await db().from("bouw_kredietopnames").insert(opname), "Opname bewaren");
}

export async function verwijderKredietopname(id: number): Promise<void> {
  check(await db().from("bouw_kredietopnames").delete().eq("id", id), "Opname verwijderen");
}

// ---------------------------------------------------------------------------
// Vennootschappen, om een kost aan toe te wijzen
// ---------------------------------------------------------------------------

export async function lijstVennootschappen(): Promise<{ id: string; naam: string }[]> {
  const rijen = check(
    await db().from("companies").select("id, name").eq("is_active", true).order("name"),
    "Vennootschappen lezen",
  ) as { id: string; name: string }[];
  return rijen.map((rij) => ({ id: String(rij.id), naam: String(rij.name) }));
}

// ---------------------------------------------------------------------------
// Wat een partij via haar link instuurde
// ---------------------------------------------------------------------------

/**
 * Een ingestuurde offerte of factuur inboeken: ze wordt een gewone offerte of
 * factuur, met de PDF en wat de partij erbij invulde. Haar omschrijving wordt
 * die van de offerte of factuur.
 */
export async function boekInzendingIn(
  inzending: Inzending,
  postId: number | null,
  door: string,
): Promise<{ soort: "offerte" | "factuur"; id: number }> {
  if (inzending.status !== "nieuw") throw new Error("Deze inzending is al verwerkt.");
  if (inzending.soort === "plan") throw new Error("Een plan lees je in bij Plannen.");
  if (inzending.bedrag === null || inzending.bedrag <= 0) throw new Error("Deze inzending heeft geen bedrag.");

  if (inzending.soort === "offerte") {
    if (!postId) throw new Error("Kies de post waar de offerte bij hoort.");
    const offerteId = await voegOfferteToe({
      post_id: postId,
      partij_id: inzending.partij_id,
      omschrijving: inzending.opmerking,
      bedrag: inzending.bedrag,
      datum: inzending.datum,
      geldig_tot: null,
      bestand_id: inzending.bestand_id,
      opmerking: null,
    });
    await zetInzendingStatus(inzending.id, "verwerkt", door, { offerte_id: offerteId });
    return { soort: "offerte", id: offerteId };
  }

  const factuurdatum = inzending.datum ?? inzending.created_at.slice(0, 10);
  const factuurId = await voegFactuurToe({
    post_id: postId,
    partij_id: inzending.partij_id,
    nummer: inzending.nummer,
    omschrijving: inzending.opmerking,
    bedrag: inzending.bedrag,
    factuurdatum,
    vervaldag: inzending.vervaldag && inzending.vervaldag >= factuurdatum ? inzending.vervaldag : null,
    betaald_op: null,
    bestand_id: inzending.bestand_id,
    vennootschap_id: null,
    opmerking: null,
  });
  await zetInzendingStatus(inzending.id, "verwerkt", door, { factuur_id: factuurId });
  return { soort: "factuur", id: factuurId };
}
