import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { bevestigdGrondplan } from "@/lib/bouw/omzetting/referentie";
import {
  lijstGebouwen,
  lijstLeidingen,
  lijstOmzettingen,
  lijstPlannen,
  lijstPunten,
  lijstRuimtes,
  lijstVerdiepingen,
} from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { LeidingenLader } from "./leidingen-lader";

export const dynamic = "force-dynamic";

export default async function Leidingenpagina({
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
  const verdieping = verdiepingen.find((v) => v.id === gekozenId) ?? metPlan[0] ?? verdiepingen[0] ?? null;

  if (!verdieping) {
    return (
      <>
        <h1>Leidingen</h1>
        <div className="kaart">
          <p className="leeg">
            Nog geen verdiepingen. Lees eerst het dossier in bij <Link href={huispad(huis.id, "/plannen")}>Plannen</Link>.
          </p>
        </div>
      </>
    );
  }

  const grondplan = bevestigdGrondplan(plannen, verdieping.id, bevestigd);
  const [ruimtes, punten, leidingen] = await Promise.all([
    lijstRuimtes(huis.id, verdieping.id),
    lijstPunten(huis.id, verdieping.id),
    lijstLeidingen(huis.id, verdieping.id),
  ]);
  const naam = verdiepingNaam(verdieping, gebouwen);

  return (
    <>
      <h1>Leidingen</h1>
      <p className="inleiding">
        Water, afvoer, regenwater, ventilatie, elektriciteit, data en vloerverwarming, op het plan. In{" "}
        <Link href={huispad(huis.id, "/3d")}>3D</Link> zie je ze in de vloer, de muren en aan het plafond. De{" "}
        <Link href={huispad(huis.id, `/punten?verdieping=${verdieping.id}`)}>punten</Link> staan erbij, om aan te kleven.
      </p>

      <nav className="tabs" aria-label="Verdiepingen">
        {verdiepingen.map((v) => (
          <Link
            key={v.id}
            href={huispad(huis.id, `/punten/leidingen?verdieping=${v.id}`)}
            className={v.id === verdieping.id ? "actief" : undefined}
            aria-current={v.id === verdieping.id ? "page" : undefined}
          >
            {verdiepingNaam(v, gebouwen)}
          </Link>
        ))}
      </nav>

      {grondplan ? (
        <LeidingenLader
          huisId={huis.id}
          gegevens={{
            verdieping: { id: verdieping.id, naam },
            versie: {
              id: grondplan.versie.id,
              bestandId: grondplan.versie.bestand_id,
              pagina: grondplan.versie.pagina,
              kalibratie: grondplan.kalibratie,
            },
            ruimtes: ruimtes.map((r) => ({ id: r.id, naam: r.naam, veelhoek: r.veelhoek })),
            punten: punten.map((p) => ({ id: p.id, soort: p.soort, x: p.x_m, y: p.y_m })),
            leidingen,
            // Waar een stijgleiding naartoe kan: de andere verdiepingen van hetzelfde gebouw.
            andere: verdiepingen
              .filter((v) => v.id !== verdieping.id && v.gebouw_id === verdieping.gebouw_id)
              .map((v) => ({ id: v.id, naam: verdiepingNaam(v, gebouwen), volgorde: v.volgorde })),
            volgorde: verdieping.volgorde,
          }}
        />
      ) : (
        <div className="melding let-op">
          {naam} heeft nog geen omgezet grondplan. Zet het eerst om bij <Link href={huispad(huis.id, "/plannen")}>Plannen</Link>:
          de leidingen komen op dat plan.
        </div>
      )}
    </>
  );
}
