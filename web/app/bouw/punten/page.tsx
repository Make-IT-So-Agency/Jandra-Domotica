import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { id as leesId } from "@/lib/bouw/invoer";
import { bevestigdGrondplan } from "@/lib/bouw/omzetting/referentie";
import {
  lijstGebouwen,
  lijstOmzettingen,
  lijstPlannen,
  lijstPunten,
  lijstRuimtes,
  lijstVerdiepingen,
} from "@/lib/bouw/opslag";
import { maakWensenlijst } from "@/lib/bouw/punten";
import { sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { PuntenLader } from "./punten-lader";
import { Wenstabel } from "./wenstabel";

export const dynamic = "force-dynamic";

export default async function Puntenpagina({
  searchParams,
}: {
  searchParams: Promise<{ verdieping?: string; melding?: string; soort?: string }>;
}) {
  const { verdieping: gevraagd, melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const [gebouwen, alleVerdiepingen, plannen] = await Promise.all([
    lijstGebouwen(huis.id),
    lijstVerdiepingen(huis.id),
    lijstPlannen(huis.id),
  ]);
  const verdiepingen = sorteerVerdiepingen(alleVerdiepingen, gebouwen);
  const omzettingen = await lijstOmzettingen(plannen.flatMap((p) => p.versies.map((v) => v.id)));
  const bevestigd = new Set(omzettingen.map((o) => o.planversie_id));
  const metPlan = verdiepingen.filter((v) => bevestigdGrondplan(plannen, v.id, bevestigd));

  const gekozenId = leesId(gevraagd ?? "");
  const verdieping =
    verdiepingen.find((v) => v.id === gekozenId) ?? metPlan[0] ?? verdiepingen[0] ?? null;

  if (!verdieping) {
    return (
      <>
        <h1>Punten</h1>
        <div className="kaart">
          <p className="leeg">
            Nog geen verdiepingen. Lees eerst het dossier in bij <Link href="/bouw/plannen">Plannen</Link>.
          </p>
        </div>
      </>
    );
  }

  const grondplan = bevestigdGrondplan(plannen, verdieping.id, bevestigd);
  const [ruimtes, punten] = await Promise.all([lijstRuimtes(huis.id, verdieping.id), lijstPunten(huis.id, verdieping.id)]);
  const naam = verdiepingNaam(verdieping, gebouwen);
  const lijst = maakWensenlijst(
    [{ id: verdieping.id, naam, plafondhoogte_m: verdieping.plafondhoogte_m }],
    ruimtes.map((r) => ({ id: r.id, naam: r.naam, veelhoek: r.veelhoek, verdieping_id: r.verdieping_id, plafondhoogte_m: r.plafondhoogte_m })),
    punten,
  );

  return (
    <>
      <h1>Punten</h1>
      <p className="inleiding">
        Lichtpunten, schakelaars, stopcontacten, netwerk, sensoren en zo verder, op het plan. Daaruit volgt de{" "}
        <Link href="/bouw/punten/wensenlijst">wensenlijst</Link> voor de elektricien en de domotica-installateur.
      </p>

      <Melding soort={soort} melding={melding} />

      <nav className="tabs" aria-label="Verdiepingen">
        {verdiepingen.map((v) => (
          <Link
            key={v.id}
            href={`/bouw/punten?verdieping=${v.id}`}
            className={v.id === verdieping.id ? "actief" : undefined}
            aria-current={v.id === verdieping.id ? "page" : undefined}
          >
            {verdiepingNaam(v, gebouwen)}
          </Link>
        ))}
      </nav>

      {grondplan ? (
        <PuntenLader
          huisId={huis.id}
          gegevens={{
            verdieping: { id: verdieping.id, naam, plafondhoogte_m: verdieping.plafondhoogte_m },
            versie: {
              id: grondplan.versie.id,
              bestandId: grondplan.versie.bestand_id,
              pagina: grondplan.versie.pagina,
              kalibratie: grondplan.kalibratie,
            },
            ruimtes: ruimtes.map((r) => ({ id: r.id, naam: r.naam, veelhoek: r.veelhoek })),
            punten,
          }}
        />
      ) : (
        <div className="melding let-op">
          {naam} heeft nog geen omgezet grondplan. Zet het eerst om bij <Link href="/bouw/plannen">Plannen</Link>:
          de punten komen op dat plan, en de ruimtes zeggen waar ze liggen.
        </div>
      )}

      <h2>Op {naam.toLowerCase()}</h2>
      {lijst.verdiepingen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen punten.</p>
        </div>
      ) : (
        <Wenstabel lijst={lijst} />
      )}
    </>
  );
}
