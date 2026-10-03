"use server";

import { revalidatePath } from "next/cache";

import { huisgebruiker } from "@/lib/bouw/huistoegang";
import { controleerBevestiging, naarRuimterijen, omzettingsvoorstel } from "@/lib/bouw/omzetting/bevestigen";
import { WERKWIJZE } from "@/lib/bouw/omzetting/pijplijn";
import {
  bewaarOmzetting,
  leesPlan,
  leesVersie,
  schrijfRuimtes,
  wijzigVerdieping,
  zetKalibratie,
  type NieuweVerdieping,
} from "@/lib/bouw/opslag";
import { VASTGOED } from "@/lib/bouw/paden";
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";

const GEEN_TOEGANG = "Het bouwproject is voorbehouden aan de hoofdbeheerder.";

export interface Bevestigd {
  verdiepingId: number;
  bijgewerkt: number;
  nieuw: number;
  verwijderd: number;
}

/**
 * Een nagekeken omzetting bevestigen: de ruimtes van de verdieping worden
 * die van dit grondplan. De server rekent zelf de meters en oppervlaktes uit
 * en kijkt na of elke koppeling met een bestaande ruimte bij deze verdieping
 * hoort.
 */
export async function bevestigOmzettingActie(huisId: unknown, ruw: unknown): Promise<Uitkomst<Bevestigd>> {
  const toegang = await huisgebruiker(huisId);
  if (!toegang) return mislukt(GEEN_TOEGANG);

  const bevestiging = controleerBevestiging(ruw);
  if (!bevestiging.ok) return bevestiging;
  const rijen = naarRuimterijen(bevestiging.data);
  if (!rijen.ok) return rijen;

  try {
    const versie = await leesVersie(toegang.huis.id, bevestiging.data.versieId);
    const plan = versie ? await leesPlan(toegang.huis.id, versie.plan_id) : null;
    if (!versie || !plan) return mislukt("Deze versie bestaat niet meer.");
    if (plan.soort !== "grondplan") return mislukt("Enkel een grondplan wordt omgezet naar ruimtes.");
    if (!plan.verdieping_id) return mislukt("Hang dit grondplan eerst aan een verdieping.");

    const omzettingId = await bewaarOmzetting(toegang.huis.id, {
      planversie_id: versie.id,
      werkwijze: WERKWIJZE,
      voorstel: omzettingsvoorstel(bevestiging.data, rijen.data),
      bevestigd_door: toegang.ik.email,
    });
    const telling = await schrijfRuimtes(toegang.huis.id, plan.verdieping_id, omzettingId, rijen.data);
    await zetKalibratie(toegang.huis.id, versie.id, { ...bevestiging.data.kalibratie, bevestigdOp: new Date().toISOString() });

    const { bijwerken, vloerpeil, plafondhoogte } = bevestiging.data.verdieping;
    if (bijwerken) {
      const velden: Partial<NieuweVerdieping> = {};
      if (vloerpeil !== null) velden.vloerpeil_m = vloerpeil;
      if (plafondhoogte !== null) velden.plafondhoogte_m = plafondhoogte;
      if (Object.keys(velden).length > 0) await wijzigVerdieping(toegang.huis.id, plan.verdieping_id, velden);
    }

    // Heel Vastgoed, zoals terug(). Met het nummer van het huis erin treft "layout"
    // niets: Next kent die layout als /vastgoed/[huis], niet als /vastgoed/12.
    revalidatePath(VASTGOED, "layout");
    return gelukt({ verdiepingId: plan.verdieping_id, ...telling });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bevestigen mislukt."));
  }
}
