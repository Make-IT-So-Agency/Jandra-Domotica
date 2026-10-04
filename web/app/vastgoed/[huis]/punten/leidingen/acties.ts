"use server";

import { revalidatePath } from "next/cache";

import { huisgebruiker } from "@/lib/bouw/huistoegang";
import { id } from "@/lib/bouw/invoer";
import { controleerLeiding, type Leiding } from "@/lib/bouw/leidingen";
import { leesVerdieping, verwijderLeiding, voegLeidingToe, wijzigLeiding } from "@/lib/bouw/opslag";
import { VASTGOED } from "@/lib/bouw/paden";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

// Na een wijziging heel Vastgoed opnieuw, zoals bij de punten: ook 3D toont de leidingen.

/** Een leiding bewaren die op het plan getekend werd. Geeft de leiding terug, met haar id. */
export async function voegLeidingToeActie(huisId: unknown, vraag: { verdiepingId: number; leiding: unknown }): Promise<Uitkomst<Leiding>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  const leiding = controleerLeiding(vraag?.leiding);
  if (!leiding.ok) return leiding;
  try {
    if (!(await leesVerdieping(toegang.huis.id, verdiepingId))) return mislukt("Deze verdieping bestaat niet meer.");
    const nieuw = await voegLeidingToe(toegang.huis.id, verdiepingId, leiding.data);
    revalidatePath(VASTGOED, "layout");
    return gelukt(nieuw);
  } catch (fout) {
    return mislukt(foutmelding(fout, "De leiding bewaren is mislukt."));
  }
}

export async function wijzigLeidingActie(huisId: unknown, vraag: { id: number; leiding: unknown }): Promise<Uitkomst<Leiding>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const leidingId = id(String(vraag?.id));
  if (!leidingId) return mislukt("Onbekende leiding.");
  const leiding = controleerLeiding(vraag?.leiding);
  if (!leiding.ok) return leiding;
  try {
    const gewijzigd = await wijzigLeiding(toegang.huis.id, leidingId, leiding.data);
    if (!gewijzigd) return mislukt("Deze leiding bestaat niet meer.");
    revalidatePath(VASTGOED, "layout");
    return gelukt(gewijzigd);
  } catch (fout) {
    return mislukt(foutmelding(fout, "De leiding bewaren is mislukt."));
  }
}

export async function verwijderLeidingActie(huisId: unknown, leidingId: number): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const geldig = id(String(leidingId));
  if (!geldig) return mislukt("Onbekende leiding.");
  try {
    await verwijderLeiding(toegang.huis.id, geldig);
    revalidatePath(VASTGOED, "layout");
    return gelukt(null);
  } catch (fout) {
    return mislukt(foutmelding(fout, "De leiding verwijderen is mislukt."));
  }
}
