import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { omzetstand, teDoen } from "@/lib/bouw/omzetting/reeks";
import type { Oudruimte } from "@/lib/bouw/omzetting/ruimtediff";
import { lijstGebouwen, lijstOmzettingen, lijstPlannen, lijstRuimtes, lijstVerdiepingen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { ReeksLader } from "./reeks-lader";

export const dynamic = "force-dynamic";

/**
 * Alle grondplannen in één keer omzetten. De server zoekt uit welke plannen
 * meedoen; de browser leest de PDF's, lijnt ze uit en bevestigt ze, elk via
 * dezelfde actie als het nakijkscherm.
 *
 * Met ?opnieuw=1: de grondplannen die met oudere regels omgezet werden,
 * opnieuw, elk op de plaats waar het al lag.
 */
export default async function AllesOmzetten({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ opnieuw?: string }>;
}) {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  const opnieuw = (await searchParams).opnieuw === "1";
  const titel = opnieuw ? "Grondplannen opnieuw omzetten" : "Alle grondplannen omzetten";
  const terugLink = (
    <p className="hulp" style={{ marginBottom: 4 }}>
      <Link href={huispad(huis.id, "/plannen")}>← Plannen</Link>
    </p>
  );

  let gegevens;
  try {
    const [plannen, verdiepingen, gebouwen, ruimtes] = await Promise.all([
      lijstPlannen(huis.id),
      lijstVerdiepingen(huis.id),
      lijstGebouwen(huis.id),
      lijstRuimtes(huis.id),
    ]);
    const omzettingen = await lijstOmzettingen(plannen.flatMap((plan) => plan.versies.map((versie) => versie.id)));
    gegevens = { plannen, verdiepingen, gebouwen, ruimtes, ...omzetstand(omzettingen) };
  } catch (fout) {
    return (
      <>
        {terugLink}
        <h1>{titel}</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const { plannen, verdiepingen, gebouwen, ruimtes, bevestigd, oud } = gegevens;
  const { reeks, overgeslagen, omgezet, verouderd } = teDoen(plannen, verdiepingen, gebouwen, bevestigd, oud, opnieuw);
  const bestaand: Record<number, Oudruimte[]> = {};
  for (const ruimte of ruimtes) {
    (bestaand[ruimte.verdieping_id] ??= []).push({
      id: ruimte.id,
      naam: ruimte.naam,
      soort: ruimte.soort,
      ringen: ruimte.veelhoek,
      oppervlakte: ruimte.oppervlakte_m2,
    });
  }
  const opnieuwLink = (
    <Link className="knop" href={huispad(huis.id, "/plannen/omzetten?opnieuw=1")}>
      Opnieuw omzetten
    </Link>
  );

  return (
    <>
      {terugLink}
      <h1>{titel}</h1>
      {opnieuw ? (
        <p className="inleiding">
          De app leest de grondplannen die met oudere regels omgezet werden opnieuw, met wat ze nu kan: de
          ramen met hun borstwering, de deuren en de luifels. Elk plan blijft liggen waar het lag, dus de
          punten, meubels, leidingen en verbeteringen blijven op hun plaats. De ruimtes houden hun naam en
          hun soort. Wat zeker is, staat aangevinkt; een plan met ⚠ kijk je na in het gewone omzetscherm.
        </p>
      ) : (
        <p className="inleiding">
          De app leest de grondplannen die nog niet omgezet zijn, legt ze per gebouw op elkaar (eerst het
          gelijkvloers, dan naar boven en naar beneden) en houdt de namen van de ruimtes die er al waren. Wat
          zeker is, staat aangevinkt: dat bevestig je in één keer. Een plan met ⚠ kijk je na in het gewone
          omzetscherm.
        </p>
      )}

      {reeks.length === 0 ? (
        opnieuw ? (
          <div className="melding goed">
            Alle grondplannen zijn omgezet met de nieuwste regels. <Link href={huispad(huis.id, "/plannen")}>Naar Plannen</Link>
          </div>
        ) : (
          <div className="melding goed omzetoproep">
            <span>
              {omgezet > 0 ? "Alle grondplannen zijn omgezet." : "Er zijn nog geen grondplannen om om te zetten."}{" "}
              {verouderd > 0
                ? `${verouderd === 1 ? "Eén ervan werd" : `${verouderd} ervan werden`} omgezet met oudere regels.`
                : null}{" "}
              <Link href={huispad(huis.id, "/ruimtes")}>Naar Ruimtes</Link>
            </span>
            {verouderd > 0 ? opnieuwLink : null}
          </div>
        )
      ) : (
        <ReeksLader
          gegevens={{
            huisId: huis.id,
            reeks: reeks.map((r) => ({
              planId: r.plan.id,
              titel: r.plan.titel,
              versie: { id: r.versie.id, label: r.versie.label, bestandId: r.versie.bestand_id, pagina: r.versie.pagina },
              verdieping: { id: r.verdieping.id, naam: r.verdieping.naam },
              gebouw: gebouwen.length > 1 ? (r.gebouw?.naam ?? null) : null,
              dubbel: r.dubbel,
              bewaard: r.bewaard,
            })),
            opnieuw,
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
                <Link href={huispad(huis.id, `/plannen/${plan.id}`)}>{plan.titel}</Link>: {reden}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reeks.length > 0 && omgezet > 0 && !opnieuw ? (
        <p className="hulp">
          {omgezet === 1 ? "1 grondplan was al omgezet" : `${omgezet} grondplannen waren al omgezet`}; die blijven zoals ze zijn.
          {verouderd > 0 ? " Met oudere regels omgezet? Zet ze daarna opnieuw om." : null}
        </p>
      ) : null}
    </>
  );
}
