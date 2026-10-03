import Link from "next/link";
import { notFound } from "next/navigation";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { kiesReferentie, leesKalibratie } from "@/lib/bouw/omzetting/referentie";
import {
  leesPlan,
  lijstGebouwen,
  lijstOmzettingen,
  lijstPlannen,
  lijstRuimtes,
  lijstVerdiepingen,
} from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { PLANNAMEN } from "@/lib/bouw/types";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { NakijkenLader } from "./nakijken-lader";

export const dynamic = "force-dynamic";

export default async function Omzettenpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string; id: string }>;
  searchParams: Promise<{ versie?: string }>;
}) {
  const [{ id }, { versie: gekozen }] = await Promise.all([params, searchParams]);
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  const planId = leesId(id);
  if (!planId) notFound();
  const plan = await leesPlan(huis.id, planId);
  if (!plan) notFound();
  const versie = plan.versies.find((v) => String(v.id) === gekozen) ?? plan.versies.at(-1);

  const terugLink = (
    <p className="hulp" style={{ marginBottom: 4 }}>
      <Link href={huispad(huis.id, `/plannen/${plan.id}${versie ? `?versie=${versie.id}` : ""}`)}>← {plan.titel}</Link>
    </p>
  );
  const zonder = (tekst: string) => (
    <>
      {terugLink}
      <h1>Omzetten</h1>
      <div className="melding let-op">{tekst}</div>
    </>
  );

  if (!versie) return zonder("Dit plan heeft nog geen versie. Laad eerst de PDF op.");
  if (plan.soort !== "grondplan") {
    return zonder(
      `Enkel een grondplan zet de app om naar ruimtes. Dit plan is een ${PLANNAMEN[plan.soort].toLowerCase()}; pas dat aan bij «Plan wijzigen» als het niet klopt.`,
    );
  }
  if (!plan.verdieping_id) return zonder("Hang dit grondplan eerst aan een verdieping, bij «Plan wijzigen».");

  const [verdiepingen, gebouwen, plannen, ruimtes] = await Promise.all([
    lijstVerdiepingen(huis.id),
    lijstGebouwen(huis.id),
    lijstPlannen(huis.id),
    lijstRuimtes(huis.id, plan.verdieping_id),
  ]);
  const omzettingen = await lijstOmzettingen(plannen.flatMap((p) => p.versies.map((v) => v.id)));
  const verdieping = verdiepingen.find((v) => v.id === plan.verdieping_id);
  if (!verdieping) return zonder("De verdieping van dit grondplan bestaat niet meer.");
  const gebouw = gebouwen.find((g) => g.id === verdieping.gebouw_id);
  const eigen = omzettingen.find((o) => o.planversie_id === versie.id) ?? null;

  const referentie = kiesReferentie(
    { planId: plan.id, versieId: versie.id, verdiepingId: verdieping.id },
    plannen,
    verdiepingen,
    new Set(omzettingen.map((o) => o.planversie_id)),
  );

  return (
    <>
      {terugLink}
      <h1>Omzetten: {plan.titel}</h1>
      <p className="inleiding">
        {gebouw && gebouwen.length > 1 ? `${gebouw.naam} · ` : ""}
        {verdieping.naam} · versie {versie.label}
        {eigen ? ` · bevestigd op ${datumTijd(eigen.bevestigd_op)}` : ""}. De app leest de ruimtes uit de PDF;
        kijk ze na en bevestig. Wat bevestigd is, komt bij Ruimtes.
      </p>

      <NakijkenLader
        gegevens={{
          huisId: huis.id,
          planId: plan.id,
          versie: {
            id: versie.id,
            label: versie.label,
            bestandId: versie.bestand_id,
            pagina: versie.pagina,
            kalibratie: eigen ? leesKalibratie(versie.kalibratie) : null,
          },
          verdieping: {
            id: verdieping.id,
            naam: verdieping.naam,
            vloerpeil_m: verdieping.vloerpeil_m,
            plafondhoogte_m: verdieping.plafondhoogte_m,
          },
          bestaand: ruimtes.map((ruimte) => ({
            id: ruimte.id,
            naam: ruimte.naam,
            ringen: ruimte.veelhoek,
            oppervlakte: ruimte.oppervlakte_m2,
          })),
          bevestigd: eigen !== null,
          referentie,
        }}
      />
    </>
  );
}
