"use server";

import { revalidatePath } from "next/cache";

import { isDaktype, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import { schoneTrapstanden } from "@/lib/bouw/drie/trappen";
import { huisgebruiker } from "@/lib/bouw/huistoegang";
import { id } from "@/lib/bouw/invoer";
import { bewaarDak, bewaarTrapstanden } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

/** Het dak van een gebouw, zoals in het 3D-scherm ingesteld. */
export async function bewaarDakActie(huisId: unknown, vraag: { gebouwId: number; dak: Dakinstelling }): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const gebouwId = id(String(vraag?.gebouwId));
  const dak = vraag?.dak;
  if (!gebouwId || !dak || !isDaktype(String(dak.type))) return mislukt("Onbekend gebouw of dak.");
  const helling = Number(dak.helling);
  const overstek = Number(dak.overstek);
  if (!Number.isFinite(helling) || helling < 5 || helling > 60) return mislukt("De helling ligt tussen 5 en 60 graden.");
  if (!Number.isFinite(overstek) || overstek < 0 || overstek > 1.5) return mislukt("Het overstek ligt tussen 0 en 1,5 m.");
  try {
    await bewaarDak(toegang.huis.id, gebouwId, {
      type: dak.type,
      helling: Math.round(helling * 10) / 10,
      nok: dak.nok === "y" ? "y" : "x",
      overstek,
    });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}

/** Hoe de trappen van een verdieping gekozen werden: omgedraaid, een andere vorm, of geen trap. */
export async function bewaarTrappenActie(huisId: unknown, vraag: { verdiepingId: number; standen: unknown }): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt("Het bouwproject is voorbehouden aan de hoofdbeheerder.");
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  try {
    await bewaarTrapstanden(toegang.huis.id, verdiepingId, schoneTrapstanden(vraag?.standen));
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bewaren mislukt."));
  }
  revalidatePath(huispad(toegang.huis.id, "/3d"));
  return gelukt(null);
}
