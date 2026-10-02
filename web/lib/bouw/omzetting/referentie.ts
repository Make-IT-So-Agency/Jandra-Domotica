import type { Kalibratie } from "./geometrie";

/**
 * Waarop een nieuwe omzetting uitgelijnd wordt. Een gebouw heeft één
 * assenstelsel: de eerste bevestigde verdieping legt het vast, en al de rest
 * wordt daarop gelegd.
 *
 * - Een nieuwe versie van een grondplan: op de vorige bevestigde versie van
 *   hetzelfde plan.
 * - De eerste versie van een andere verdieping: op een bevestigde verdieping
 *   van hetzelfde gebouw, liefst die er net onder.
 *
 * Puur: de pagina geeft de plannen, deze functie kiest.
 */

export interface Referentie {
  versieId: number;
  bestandId: number;
  pagina: number;
  kalibratie: Kalibratie;
  planTitel: string;
  label: string;
  soort: "versie" | "verdieping";
  verdieping: string;
}

export interface Planinfo {
  id: number;
  titel: string;
  soort: string;
  gebouw_id: number | null;
  verdieping_id: number | null;
  versies: {
    id: number;
    bestand_id: number;
    pagina: number;
    label: string;
    created_at: string;
    kalibratie: Record<string, unknown> | null;
  }[];
}

/** Een bewaarde kalibratie, als ze volledig is. */
export function leesKalibratie(ruw: Record<string, unknown> | null | undefined): Kalibratie | null {
  if (!ruw) return null;
  const { meterPerPunt, kwartslagen, dx, dy } = ruw as Record<string, unknown>;
  const getal = (w: unknown): w is number => typeof w === "number" && Number.isFinite(w);
  if (!getal(meterPerPunt) || meterPerPunt <= 0 || !getal(dx) || !getal(dy)) return null;
  return { meterPerPunt, kwartslagen: getal(kwartslagen) ? Math.round(kwartslagen) : 0, dx, dy };
}

export function kiesReferentie(
  huidig: { planId: number; versieId: number; verdiepingId: number },
  plannen: Planinfo[],
  verdiepingen: { id: number; naam: string; gebouw_id: number; vloerpeil_m: number | null; volgorde: number }[],
  bevestigd: Set<number>,
): Referentie | null {
  const verdiepingVan = new Map(verdiepingen.map((v) => [v.id, v]));
  const nieuwste = (plan: Planinfo) =>
    [...plan.versies]
      .filter((versie) => versie.id !== huidig.versieId && bevestigd.has(versie.id) && leesKalibratie(versie.kalibratie))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const alsReferentie = (plan: Planinfo, versie: Planinfo["versies"][number], soort: Referentie["soort"]): Referentie => ({
    versieId: versie.id,
    bestandId: versie.bestand_id,
    pagina: versie.pagina,
    kalibratie: leesKalibratie(versie.kalibratie)!,
    planTitel: plan.titel,
    label: versie.label,
    soort,
    verdieping: verdiepingVan.get(plan.verdieping_id ?? -1)?.naam ?? "",
  });

  // 1. Een vorige versie van hetzelfde plan.
  const eigen = plannen.find((plan) => plan.id === huidig.planId);
  const vorige = eigen ? nieuwste(eigen) : undefined;
  if (eigen && vorige) return alsReferentie(eigen, vorige, "versie");

  // 2. Een andere verdieping van hetzelfde gebouw, liefst die er net onder.
  const hier = verdiepingVan.get(huidig.verdiepingId);
  const peil = (id: number | null) => {
    const v = verdiepingVan.get(id ?? -1);
    return v ? (v.vloerpeil_m ?? v.volgorde * 3) : 0;
  };
  const hoogteHier = hier ? (hier.vloerpeil_m ?? hier.volgorde * 3) : 0;
  const kandidaten = plannen
    .filter(
      (plan) =>
        plan.id !== huidig.planId &&
        plan.soort === "grondplan" &&
        plan.verdieping_id !== null &&
        verdiepingVan.get(plan.verdieping_id)?.gebouw_id === hier?.gebouw_id,
    )
    .map((plan) => ({ plan, versie: nieuwste(plan) }))
    .filter((k): k is { plan: Planinfo; versie: Planinfo["versies"][number] } => k.versie !== undefined)
    .sort((a, b) => {
      const da = hoogteHier - peil(a.plan.verdieping_id);
      const db = hoogteHier - peil(b.plan.verdieping_id);
      // Eerst wat eronder ligt (positief verschil), het dichtst eerst; dan wat erboven ligt.
      if (da > 0 !== db > 0) return da > 0 ? -1 : 1;
      return Math.abs(da) - Math.abs(db);
    });
  return kandidaten[0] ? alsReferentie(kandidaten[0].plan, kandidaten[0].versie, "verdieping") : null;
}

/**
 * De bevestigde versie van het grondplan van een verdieping: daarop staan de
 * ruimtes, en daarop komen de punten. De nieuwste als er meer zijn.
 */
export function bevestigdGrondplan(
  plannen: Planinfo[],
  verdiepingId: number,
  bevestigd: Set<number>,
): { plan: Planinfo; versie: Planinfo["versies"][number]; kalibratie: Kalibratie } | null {
  let beste: { plan: Planinfo; versie: Planinfo["versies"][number]; kalibratie: Kalibratie } | null = null;
  for (const plan of plannen) {
    if (plan.soort !== "grondplan" || plan.verdieping_id !== verdiepingId) continue;
    for (const versie of plan.versies) {
      const kalibratie = leesKalibratie(versie.kalibratie);
      if (!bevestigd.has(versie.id) || !kalibratie) continue;
      if (!beste || versie.created_at > beste.versie.created_at) beste = { plan, versie, kalibratie };
    }
  }
  return beste;
}
