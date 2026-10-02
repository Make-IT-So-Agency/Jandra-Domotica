"use server";

import { revalidatePath } from "next/cache";

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
import { foutmelding } from "@/lib/bouw/terug";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { bouwgebruiker } from "@/lib/toegang";

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
export async function bevestigOmzettingActie(ruw: unknown): Promise<Uitkomst<Bevestigd>> {
  const ik = await bouwgebruiker();
  if (!ik) return mislukt(GEEN_TOEGANG);

  const bevestiging = controleerBevestiging(ruw);
  if (!bevestiging.ok) return bevestiging;
  const rijen = naarRuimterijen(bevestiging.data);
  if (!rijen.ok) return rijen;

  try {
    const versie = await leesVersie(bevestiging.data.versieId);
    const plan = versie ? await leesPlan(versie.plan_id) : null;
    if (!versie || !plan) return mislukt("Deze versie bestaat niet meer.");
    if (plan.soort !== "grondplan") return mislukt("Enkel een grondplan wordt omgezet naar ruimtes.");
    if (!plan.verdieping_id) return mislukt("Hang dit grondplan eerst aan een verdieping.");

    const omzettingId = await bewaarOmzetting({
      planversie_id: versie.id,
      werkwijze: WERKWIJZE,
      voorstel: omzettingsvoorstel(bevestiging.data, rijen.data),
      bevestigd_door: ik.email,
    });
    const telling = await schrijfRuimtes(plan.verdieping_id, omzettingId, rijen.data);
    await zetKalibratie(versie.id, { ...bevestiging.data.kalibratie, bevestigdOp: new Date().toISOString() });

    const { bijwerken, vloerpeil, plafondhoogte } = bevestiging.data.verdieping;
    if (bijwerken) {
      const velden: Partial<NieuweVerdieping> = {};
      if (vloerpeil !== null) velden.vloerpeil_m = vloerpeil;
      if (plafondhoogte !== null) velden.plafondhoogte_m = plafondhoogte;
      if (Object.keys(velden).length > 0) await wijzigVerdieping(plan.verdieping_id, velden);
    }

    revalidatePath("/bouw", "layout");
    return gelukt({ verdiepingId: plan.verdieping_id, ...telling });
  } catch (fout) {
    return mislukt(foutmelding(fout, "Bevestigen mislukt."));
  }
}
