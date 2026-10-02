"use server";

import { revalidatePath } from "next/cache";

import { isDaktype, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import { id } from "@/lib/bouw/invoer";
import { bewaarDak } from "@/lib/bouw/opslag";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { bouwgebruiker } from "@/lib/toegang";

/** Het dak van een gebouw, zoals in het 3D-scherm ingesteld. */
export async function bewaarDakActie(vraag: { gebouwId: number; dak: Dakinstelling }): Promise<Uitkomst<null>> {
  if (!(await bouwgebruiker())) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const gebouwId = id(String(vraag?.gebouwId));
  const dak = vraag?.dak;
  if (!gebouwId || !dak || !isDaktype(String(dak.type))) return mislukt("Onbekend gebouw of dak.");
  const helling = Number(dak.helling);
  const overstek = Number(dak.overstek);
  if (!Number.isFinite(helling) || helling < 5 || helling > 60) return mislukt("De helling ligt tussen 5 en 60 graden.");
  if (!Number.isFinite(overstek) || overstek < 0 || overstek > 1.5) return mislukt("Het overstek ligt tussen 0 en 1,5 m.");
  try {
    await bewaarDak(gebouwId, { type: dak.type, helling: Math.round(helling * 10) / 10, nok: dak.nok === "y" ? "y" : "x", overstek });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath("/bouw/3d");
  return gelukt(null);
}
