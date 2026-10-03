"use server";

import { revalidatePath } from "next/cache";

import { huisgebruiker } from "@/lib/bouw/huistoegang";
import { id } from "@/lib/bouw/invoer";
import { leesVerdieping, verwijderPunt, voegPuntToe, wijzigPunt } from "@/lib/bouw/opslag";
import { controleerPunt, type Punt } from "@/lib/bouw/punten";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

/** Een punt zetten, vanuit het plan. Geeft het punt terug, met zijn id. */
export async function voegPuntToeActie(huisId: unknown, vraag: { verdiepingId: number; punt: unknown }): Promise<Uitkomst<Punt>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const verdiepingId = id(String(vraag?.verdiepingId));
  if (!verdiepingId) return mislukt("Onbekende verdieping.");
  const punt = controleerPunt(vraag?.punt);
  if (!punt.ok) return punt;
  try {
    if (!(await leesVerdieping(toegang.huis.id, verdiepingId))) return mislukt("Deze verdieping bestaat niet meer.");
    const nieuw = await voegPuntToe(toegang.huis.id, verdiepingId, punt.data);
    revalidatePath("/bouw", "layout");
    return gelukt(nieuw);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Het punt bewaren is mislukt."));
  }
}

export async function wijzigPuntActie(huisId: unknown, vraag: { id: number; punt: unknown }): Promise<Uitkomst<Punt>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const puntId = id(String(vraag?.id));
  if (!puntId) return mislukt("Onbekend punt.");
  const punt = controleerPunt(vraag?.punt);
  if (!punt.ok) return punt;
  try {
    const gewijzigd = await wijzigPunt(toegang.huis.id, puntId, punt.data);
    if (!gewijzigd) return mislukt("Dit punt bestaat niet meer.");
    revalidatePath("/bouw", "layout");
    return gelukt(gewijzigd);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Het punt bewaren is mislukt."));
  }
}

export async function verwijderPuntActie(huisId: unknown, puntId: number): Promise<Uitkomst<null>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);
  const geldig = id(String(puntId));
  if (!geldig) return mislukt("Onbekend punt.");
  try {
    await verwijderPunt(toegang.huis.id, geldig);
    revalidatePath("/bouw", "layout");
    return gelukt(null);
  } catch (fout) {
    return mislukt(foutmelding(fout, "Het punt verwijderen is mislukt."));
  }
}
