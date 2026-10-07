/** De inschrijfrondes in Supabase, zoals de workflows ze lezen. */

import { rest } from "./supabase.ts";

export interface Ronde {
  id: number;
  maand: string;
  ronde: string;
  opent: string;
  status: "open" | "definitief" | "bezig" | "klaar" | "gemist";
  stop_gevraagd: boolean;
  bezig_sinds: string | null;
}

/** "2026-12" → ["2026-12"], "zomer-2027" → ["2027-07", "2027-08"]. */
export function kalenderMaanden(maand: string): string[] {
  const zomer = maand.match(/^zomer-(\d{4})$/);
  return zomer ? [`${zomer[1]}-07`, `${zomer[1]}-08`] : [maand];
}

export function lopendeRondes(): Promise<Ronde[]> {
  return rest<Ronde[]>("GET", "opvang_rondes?status=in.(open,definitief,bezig)&order=opent");
}

/**
 * Rondes waarvan de opvang nog komt, wat hun status ook is: ook na het
 * inschrijven kan een tegel nog wijzigen (reservelijst, annulering, zelf
 * ingeschreven), en /ingeschreven toont wat de kalender het laatst zag.
 */
export async function rondesMetOpvangVanaf(maand: string): Promise<Ronde[]> {
  return (await rest<Ronde[]>("GET", "opvang_rondes?order=opent")).filter((r) => kalenderMaanden(r.maand).some((m) => m >= maand));
}

export async function ronde(id: number): Promise<Ronde | null> {
  const [r] = await rest<Ronde[]>("GET", `opvang_rondes?id=eq.${id}`);
  return r ?? null;
}

/** Zet de status enkel vanuit de verwachte status. Geeft terug of het lukte. */
export async function zetStatus(id: number, van: Ronde["status"][], naar: Ronde["status"], extra: Record<string, unknown> = {}): Promise<boolean> {
  const rijen = await rest<unknown[]>("PATCH", `opvang_rondes?id=eq.${id}&status=in.(${van.join(",")})`, { status: naar, ...extra });
  return rijen.length > 0;
}
