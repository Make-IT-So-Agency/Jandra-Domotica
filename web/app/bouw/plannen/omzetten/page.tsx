import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { teDoen } from "@/lib/bouw/omzetting/reeks";
import type { Oudruimte } from "@/lib/bouw/omzetting/ruimtediff";
import { lijstGebouwen, lijstOmzettingen, lijstPlannen, lijstRuimtes, lijstVerdiepingen } from "@/lib/bouw/opslag";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { ReeksLader } from "./reeks-lader";

export const dynamic = "force-dynamic";

/**
 * Alle grondplannen in één keer omzetten. De server zoekt uit welke plannen
 * meedoen; de browser leest de PDF's, lijnt ze uit en bevestigt ze, elk via
 * dezelfde actie als het nakijkscherm.
 */
export default async function AllesOmzetten() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const terugLink = (
    <p className="hulp" style={{ marginBottom: 4 }}>
      <Link href="/bouw/plannen">← Plannen</Link>
    </p>
  );

  let gegevens;
  try {
    const [plannen, verdiepingen, gebouwen, ruimtes] = await Promise.all([
      lijstPlannen(),
      lijstVerdiepingen(),
      lijstGebouwen(),
      lijstRuimtes(),
    ]);
    const omzettingen = await lijstOmzettingen(plannen.flatMap((plan) => plan.versies.map((versie) => versie.id)));
    gegevens = { plannen, verdiepingen, gebouwen, ruimtes, bevestigd: new Set(omzettingen.map((o) => o.planversie_id)) };
  } catch (fout) {
    return (
      <>
        {terugLink}
        <h1>Alle grondplannen omzetten</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const { plannen, verdiepingen, gebouwen, ruimtes, bevestigd } = gegevens;
  const { reeks, overgeslagen, omgezet } = teDoen(plannen, verdiepingen, gebouwen, bevestigd);
  const bestaand: Record<number, Oudruimte[]> = {};
  for (const ruimte of ruimtes) {
    (bestaand[ruimte.verdieping_id] ??= []).push({
      id: ruimte.id,
      naam: ruimte.naam,
      ringen: ruimte.veelhoek,
      oppervlakte: ruimte.oppervlakte_m2,
    });
  }

  return (
    <>
      {terugLink}
      <h1>Alle grondplannen omzetten</h1>
      <p className="inleiding">
        De app leest de grondplannen die nog niet omgezet zijn, legt ze per gebouw op elkaar (eerst het
        gelijkvloers, dan naar boven en naar beneden) en houdt de namen van de ruimtes die er al waren. Wat
        zeker is, staat aangevinkt: dat bevestig je in één keer. Een plan met ⚠ kijk je na in het gewone
        omzetscherm.
      </p>

      {reeks.length === 0 ? (
        <div className="melding goed">
          {omgezet > 0 ? "Alle grondplannen zijn omgezet." : "Er zijn nog geen grondplannen om om te zetten."}{" "}
          <Link href="/bouw/ruimtes">Naar Ruimtes</Link>
        </div>
      ) : (
        <ReeksLader
          gegevens={{
            reeks: reeks.map((r) => ({
              planId: r.plan.id,
              titel: r.plan.titel,
              versie: { id: r.versie.id, label: r.versie.label, bestandId: r.versie.bestand_id, pagina: r.versie.pagina },
              verdieping: { id: r.verdieping.id, naam: r.verdieping.naam },
              gebouw: gebouwen.length > 1 ? (r.gebouw?.naam ?? null) : null,
              dubbel: r.dubbel,
            })),
            plannen: plannen.map((plan) => ({
              id: plan.id,
              titel: plan.titel,
              soort: plan.soort,
              gebouw_id: plan.gebouw_id,
              verdieping_id: plan.verdieping_id,
              versies: plan.versies.map((v) => ({
                id: v.id,
                bestand_id: v.bestand_id,
                pagina: v.pagina,
                label: v.label,
                created_at: v.created_at,
                kalibratie: v.kalibratie,
              })),
            })),
            verdiepingen: verdiepingen.map((v) => ({
              id: v.id,
              naam: v.naam,
              gebouw_id: v.gebouw_id,
              vloerpeil_m: v.vloerpeil_m,
              volgorde: v.volgorde,
            })),
            bevestigd: [...bevestigd],
            bestaand,
          }}
        />
      )}

      {overgeslagen.length > 0 ? (
        <section aria-labelledby="overgeslagen">
          <h2 id="overgeslagen">Niet in deze reeks</h2>
          <ul className="overgeslagen">
            {overgeslagen.map(({ plan, reden }) => (
              <li key={plan.id}>
                <Link href={`/bouw/plannen/${plan.id}`}>{plan.titel}</Link>: {reden}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reeks.length > 0 && omgezet > 0 ? (
        <p className="hulp">
          {omgezet === 1 ? "1 grondplan was al omgezet" : `${omgezet} grondplannen waren al omgezet`}; die blijven zoals ze zijn.
        </p>
      ) : null}
    </>
  );
}
