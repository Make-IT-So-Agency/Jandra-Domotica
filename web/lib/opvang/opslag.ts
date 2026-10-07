import "server-only";

import { db } from "@/lib/supabase";

import type { RondeStatus, Slot } from "./keuzemenu";

/**
 * Alles wat de opvang-bot in Supabase leest en schrijft. De tabellen staan in
 * supabase/migrations/20260929080000_opvang.sql.
 */

export interface Kind {
  id: number;
  naam: string;
  plannen: boolean;
}

export interface Ronde {
  id: number;
  maand: string;
  ronde: string;
  opent: string;
  status: RondeStatus;
  definitief_door: string | null;
  definitief_op: string | null;
  stop_gevraagd: boolean;
  kalender_gelezen_op: string | null;
  gevraagd_op: string | null;
  herinnerd_op: string | null;
  bezig_sinds: string | null;
}

/** Wat de workflow per gekozen slot deed, zoals i-Active het nadien toonde. */
export type Uitkomst = "ingeschreven" | "reservelijst" | "al_ingeschreven" | "mislukt" | "gestopt";

export interface MenuRij {
  ronde_id: number;
  kind_id: number;
  chat_id: number;
  bericht_id: number;
  week: number;
}

function check<T>(r: { data: T; error: { message: string } | null }, wat: string): T {
  if (r.error) throw new Error(`${wat}: ${r.error.message}`);
  return r.data;
}

/** De kalendermaanden van een opvangmaand: "2026-12" → ["2026-12"], "zomer-2027" → juli en augustus. */
export function kalenderMaanden(maand: string): string[] {
  const zomer = maand.match(/^zomer-(\d{4})$/);
  return zomer ? [`${zomer[1]}-07`, `${zomer[1]}-08`] : [maand];
}

export async function leesInstelling(sleutel: string): Promise<string | null> {
  const r = await db().from("opvang_instellingen").select("waarde").eq("sleutel", sleutel).maybeSingle();
  return check(r, "instelling lezen")?.waarde ?? null;
}

export async function zetInstelling(sleutel: string, waarde: string): Promise<void> {
  check(
    await db().from("opvang_instellingen").upsert({ sleutel, waarde, updated_at: new Date().toISOString() }),
    "instelling bewaren",
  );
}

/** De Telegram-chat waarin de bot uit zichzelf praat (in te stellen met /hier). */
export async function leesChat(): Promise<number | null> {
  const w = await leesInstelling("telegram_chat_id");
  return w && Number.isSafeInteger(Number(w)) ? Number(w) : null;
}

export async function kinderen(): Promise<Kind[]> {
  return check(await db().from("opvang_kinderen").select("id, naam, plannen").order("id"), "kinderen lezen") as Kind[];
}

export async function zetPlannen(kindId: number, plannen: boolean): Promise<void> {
  check(await db().from("opvang_kinderen").update({ plannen }).eq("id", kindId), "kind bijwerken");
}

export async function ronde(id: number): Promise<Ronde | null> {
  return check(await db().from("opvang_rondes").select("*").eq("id", id).maybeSingle(), "ronde lezen") as Ronde | null;
}

/** De rondes die nog niet voorbij zijn: open, definitief of bezig. */
export async function lopendeRondes(): Promise<Ronde[]> {
  return check(
    await db().from("opvang_rondes").select("*").in("status", ["open", "definitief", "bezig"]).order("opent"),
    "rondes lezen",
  ) as Ronde[];
}

/** Maakt de ronde aan als ze nog niet bestaat. Een bestaande blijft ongemoeid. */
export async function zorgVoorRonde(maand: string, soort: string, opent: Date): Promise<Ronde> {
  check(
    await db()
      .from("opvang_rondes")
      .upsert({ maand, ronde: soort, opent: opent.toISOString() }, { onConflict: "maand,ronde", ignoreDuplicates: true }),
    "ronde aanmaken",
  );
  return check(
    await db().from("opvang_rondes").select("*").eq("maand", maand).eq("ronde", soort).single(),
    "ronde lezen",
  ) as Ronde;
}

/**
 * Zet de status van een ronde, maar enkel vanuit de verwachte status: twee
 * mensen die tegelijk op Definitief drukken, of een klik terwijl de workflow
 * al begonnen is, veranderen dan niets. Geeft terug of het lukte.
 */
export async function zetStatus(
  id: number,
  van: RondeStatus[],
  naar: RondeStatus,
  extra: Partial<Ronde> = {},
): Promise<boolean> {
  const r = await db().from("opvang_rondes").update({ status: naar, ...extra }).eq("id", id).in("status", van).select("id");
  return (check(r, "status bijwerken") ?? []).length > 0;
}

/** De laatste ronde waarvan de inschrijving al geopend is, wat haar status ook is. */
export async function laatstGeopend(nu = new Date()): Promise<Ronde | null> {
  return check(
    await db().from("opvang_rondes").select("*").lt("opent", nu.toISOString()).order("opent", { ascending: false }).limit(1).maybeSingle(),
    "ronde lezen",
  ) as Ronde | null;
}

export async function resultaten(rondeId: number): Promise<Uitkomst[]> {
  const rijen = check(await db().from("opvang_resultaten").select("uitkomst").eq("ronde_id", rondeId), "resultaten lezen") as {
    uitkomst: Uitkomst;
  }[];
  return rijen.map((r) => r.uitkomst);
}

export async function werkRondeBij(id: number, velden: Partial<Ronde>): Promise<void> {
  check(await db().from("opvang_rondes").update(velden).eq("id", id), "ronde bijwerken");
}

export async function slots(kindId: number, maand: string): Promise<Slot[]> {
  return check(
    await db()
      .from("opvang_slots")
      .select("id, datum, moment, locatie, staat")
      .eq("kind_id", kindId)
      .in("maand", kalenderMaanden(maand)),
    "slots lezen",
  ) as Slot[];
}

export async function gekozen(rondeId: number): Promise<Set<number>> {
  const rijen = check(await db().from("opvang_keuzes").select("slot_id").eq("ronde_id", rondeId), "keuzes lezen") as {
    slot_id: number;
  }[];
  return new Set(rijen.map((r) => r.slot_id));
}

export async function kies(rondeId: number, slotIds: number[], door: string): Promise<void> {
  if (!slotIds.length) return;
  check(
    await db()
      .from("opvang_keuzes")
      .upsert(slotIds.map((slot_id) => ({ ronde_id: rondeId, slot_id, gekozen_door: door })), { ignoreDuplicates: true }),
    "keuze bewaren",
  );
}

export async function ontkies(rondeId: number, slotIds: number[]): Promise<void> {
  if (!slotIds.length) return;
  check(await db().from("opvang_keuzes").delete().eq("ronde_id", rondeId).in("slot_id", slotIds), "keuze wissen");
}

export async function menus(rondeId: number): Promise<MenuRij[]> {
  return check(await db().from("opvang_menus").select("*").eq("ronde_id", rondeId), "menu's lezen") as MenuRij[];
}

export async function zetMenu(rij: MenuRij): Promise<void> {
  check(await db().from("opvang_menus").upsert(rij), "menu bewaren");
}
