import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { bevestigdGrondplan } from "@/lib/bouw/omzetting/referentie";
import { leesMurenEnOpeningen, lijstGebouwen, lijstOmzettingen, lijstPlannen, lijstRuimtes, lijstVerdiepingen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { STANDAARD_PLAFOND } from "@/lib/bouw/drie/model";

import { VerbeterLader } from "./verbeter-lader";

export const dynamic = "force-dynamic";

/**
 * Muren, ramen en deuren verbeteren op het plan, per verdieping: het plan
 * wordt niet altijd perfect omgezet. Wat hier verbeterd wordt, bouwt het
 * 3D-model mee (zie lib/bouw/drie/correcties.ts).
 */
export default async function Verbeterpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ verdieping?: string }>;
}) {
  const { verdieping: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  const [gebouwen, alleVerdiepingen, plannen] = await Promise.all([lijstGebouwen(huis.id), lijstVerdiepingen(huis.id), lijstPlannen(huis.id)]);
  const omzettingen = await lijstOmzettingen(plannen.flatMap((p) => p.versies.map((v) => v.id)));
  const bevestigd = new Set(omzettingen.map((o) => o.planversie_id));
  // Enkel een verdieping met een bevestigd grondplan: daar komen de muren vandaan.
  const verdiepingen = sorteerVerdiepingen(alleVerdiepingen, gebouwen).filter((v) => bevestigdGrondplan(plannen, v.id, bevestigd));

  const kop = (
    <>
      <h1>Muren, ramen en deuren verbeteren</h1>
      <p className="inleiding">
        Het plan wordt niet altijd perfect omgezet. Wat je hier verbetert, bouwt het{" "}
        <Link href={huispad(huis.id, "/3d")}>3D-model</Link> mee, en het blijft staan bij een nieuwe versie van het plan.
      </p>
    </>
  );

  const gekozenId = leesId(gevraagd ?? "");
  const verdieping = verdiepingen.find((v) => v.id === gekozenId) ?? verdiepingen[0] ?? null;
  const grondplan = verdieping ? bevestigdGrondplan(plannen, verdieping.id, bevestigd) : null;
  if (!verdieping || !grondplan) {
    return (
      <>
        {kop}
        <div className="kaart">
          <p className="leeg">
            Nog geen omgezet grondplan. Zet eerst een grondplan om bij <Link href={huispad(huis.id, "/plannen")}>Plannen</Link>.
          </p>
        </div>
      </>
    );
  }

  const [ruimtes, bewaard] = await Promise.all([lijstRuimtes(huis.id, verdieping.id), leesMurenEnOpeningen([grondplan.versie.id])]);
  const omzetting = bewaard.get(grondplan.versie.id);
  const naam = verdiepingNaam(verdieping, gebouwen);

  return (
    <>
      {kop}

      <nav className="tabs" aria-label="Verdiepingen">
        {verdiepingen.map((v) => (
          <Link
            key={v.id}
            href={huispad(huis.id, `/3d/verbeteren?verdieping=${v.id}`)}
            className={v.id === verdieping.id ? "actief" : undefined}
            aria-current={v.id === verdieping.id ? "page" : undefined}
          >
            {verdiepingNaam(v, gebouwen)}
          </Link>
        ))}
      </nav>

      {!omzetting || omzetting.muren.length === 0 ? (
        <div className="melding let-op">
          {naam} werd omgezet voor de app muren las. Zet het{" "}
          <Link href={huispad(huis.id, `/plannen/${grondplan.plan.id}/omzetten`)}>opnieuw om</Link> en bevestig: dan komen de muren
          mee.
        </div>
      ) : (
        <VerbeterLader
          huisId={huis.id}
          gegevens={{
            verdieping: { id: verdieping.id, naam, plafond: verdieping.plafondhoogte_m ?? STANDAARD_PLAFOND },
            versie: {
              id: grondplan.versie.id,
              bestandId: grondplan.versie.bestand_id,
              pagina: grondplan.versie.pagina,
              kalibratie: grondplan.kalibratie,
            },
            ruimtes: ruimtes.map((r) => ({ id: r.id, naam: r.naam, ringen: r.veelhoek })),
            muren: omzetting.muren,
            openingen: omzetting.openingen,
            correcties: verdieping.correcties ?? [],
          }}
        />
      )}
    </>
  );
}
