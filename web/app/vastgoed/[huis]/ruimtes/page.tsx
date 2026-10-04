import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { kaderVan } from "@/lib/bouw/omzetting/geometrie";
import { omzetstand, teDoen } from "@/lib/bouw/omzetting/reeks";
import { lijstGebouwen, lijstOmzettingen, lijstPlannen, lijstPunten, lijstRuimtes, lijstVerdiepingen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { CATEGORIEKLEUREN, ruimteVan, soortVan, type Punt } from "@/lib/bouw/punten";
import { RUIMTENAMEN, type Gebouw, type Ruimte, type Verdieping } from "@/lib/bouw/types";
import { sorteerVerdiepingen } from "@/lib/bouw/weergave";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "@/components/bouw/melding";
import { Omzetoproep } from "../plannen/omzetten/oproep";
import { Ruimteplan } from "./ruimteplan";

export const dynamic = "force-dynamic";

const m2 = (waarde: number) => `${waarde.toFixed(2).replace(".", ",")} m²`;
const meter = (waarde: number | null) => (waarde === null ? "—" : `${waarde.toFixed(2).replace(".", ",")} m`);

export default async function Ruimtespagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  let gebouwen: Gebouw[];
  let verdiepingen: Verdieping[];
  let ruimtes: Ruimte[];
  let grondplannen: { id: number; verdieping_id: number | null }[];
  let punten: Punt[];
  let nogOmTeZetten: number;
  let verouderd: number;
  try {
    const [g, v, r, p, pt] = await Promise.all([
      lijstGebouwen(huis.id),
      lijstVerdiepingen(huis.id),
      lijstRuimtes(huis.id),
      lijstPlannen(huis.id),
      lijstPunten(huis.id),
    ]);
    gebouwen = g;
    verdiepingen = sorteerVerdiepingen(v, g);
    ruimtes = r;
    grondplannen = p.filter((plan) => plan.soort === "grondplan" && plan.versies.length > 0);
    punten = pt;
    const omzettingen = await lijstOmzettingen(p.flatMap((plan) => plan.versies.map((versie) => versie.id)));
    const { bevestigd, oud } = omzetstand(omzettingen);
    ({ open: nogOmTeZetten, verouderd } = teDoen(p, v, g, bevestigd, oud));
  } catch (fout) {
    return (
      <>
        <h1>Ruimtes</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  return (
    <>
      <h1>Ruimtes</h1>
      <p className="inleiding">
        De ruimtes per verdieping, zoals ze uit de grondplannen van de architect omgezet en bevestigd zijn. De
        oppervlakte is netto, binnen de muren. Een ruimte verbeteren doe je bij het omzetten van het grondplan.
      </p>

      <Melding soort={soort} melding={melding} />
      <Omzetoproep huisId={huis.id} aantal={nogOmTeZetten} verouderd={verouderd} />

      {verdiepingen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen verdiepingen. Lees het dossier van de architect in bij <Link href={huispad(huis.id, "/plannen")}>Plannen</Link>.
          </p>
        </div>
      ) : null}

      {gebouwen.map((gebouw) => {
        const eigen = verdiepingen.filter((v) => v.gebouw_id === gebouw.id);
        if (eigen.length === 0) return null;
        const vanGebouw = ruimtes.filter((r) => eigen.some((v) => v.id === r.verdieping_id));
        const kader = vanGebouw.length > 0 ? kaderVan(vanGebouw.flatMap((r) => r.veelhoek[0] ?? [])) : null;
        return (
          <section key={gebouw.id} aria-label={gebouw.naam}>
            {gebouwen.length > 1 ? <h2>{gebouw.naam}</h2> : null}
            {eigen.map((verdieping) => {
              const lijst = vanGebouw
                .filter((r) => r.verdieping_id === verdieping.id)
                .sort((a, b) => b.oppervlakte_m2 - a.oppervlakte_m2);
              const totaal = lijst.reduce((som, r) => som + r.oppervlakte_m2, 0);
              const grondplan = grondplannen.find((plan) => plan.verdieping_id === verdieping.id);
              const eigenPunten = punten.filter((p) => p.verdieping_id === verdieping.id);
              const puntenPerRuimte = new Map<number | null, number>();
              for (const punt of eigenPunten) {
                const ruimte = ruimteVan(punt, lijst);
                puntenPerRuimte.set(ruimte, (puntenPerRuimte.get(ruimte) ?? 0) + punt.aantal);
              }
              return (
                <div key={verdieping.id} id={`verdieping-${verdieping.id}`} className="kaart verdiepingkaart">
                  <h3>
                    {verdieping.naam}{" "}
                    <span className="hulp">
                      · {lijst.length === 1 ? "1 ruimte" : `${lijst.length} ruimtes`}
                      {lijst.length > 0 ? `, samen ${m2(totaal)}` : ""}
                      {verdieping.vloerpeil_m !== null ? ` · peil ${meter(verdieping.vloerpeil_m)}` : ""}
                      {verdieping.plafondhoogte_m !== null ? ` · plafond ${meter(verdieping.plafondhoogte_m)}` : ""}
                    </span>
                  </h3>
                  {lijst.length === 0 ? (
                    <p className="leeg">
                      Nog geen ruimtes.{" "}
                      {grondplan ? (
                        <Link href={huispad(huis.id, `/plannen/${grondplan.id}/omzetten`)}>Zet het grondplan om</Link>
                      ) : (
                        "Hang eerst een grondplan aan deze verdieping."
                      )}
                    </p>
                  ) : (
                    <>
                      {kader ? (
                        <Ruimteplan
                          ruimtes={lijst}
                          kader={kader}
                          punten={eigenPunten.map((punt) => {
                            const soort = soortVan(punt.soort);
                            return {
                              id: punt.id,
                              x_m: punt.x_m,
                              y_m: punt.y_m,
                              kleur: CATEGORIEKLEUREN[soort?.categorie ?? "andere"],
                              naam: soort?.naam ?? punt.soort,
                            };
                          })}
                        />
                      ) : null}
                      <div className="tabel-omhulsel">
                        <table>
                          <thead>
                            <tr>
                              <th>Ruimte</th>
                              <th>Soort</th>
                              <th className="getal">Oppervlakte</th>
                              <th className="getal">Volgens plan</th>
                              <th className="getal">Plafondhoogte</th>
                              <th className="getal">Punten</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lijst.map((ruimte) => (
                              <tr key={ruimte.id} id={`ruimte-${ruimte.id}`}>
                                <td data-label="Ruimte">{ruimte.naam}</td>
                                <td data-label="Soort">{RUIMTENAMEN[ruimte.soort] ?? ruimte.soort}</td>
                                <td data-label="Oppervlakte" className="getal">
                                  {m2(ruimte.oppervlakte_m2)}
                                </td>
                                <td data-label="Volgens plan" className="getal">
                                  {ruimte.oppervlakte_plan_m2 === null ? "—" : m2(ruimte.oppervlakte_plan_m2)}
                                </td>
                                <td data-label="Plafondhoogte" className="getal">
                                  {meter(ruimte.plafondhoogte_m ?? verdieping.plafondhoogte_m)}
                                </td>
                                <td data-label="Punten" className="getal">
                                  {puntenPerRuimte.get(ruimte.id) ?? 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td data-label="Totaal">Totaal</td>
                              <td />
                              <td data-label="Oppervlakte" className="getal">
                                {m2(totaal)}
                              </td>
                              <td />
                              <td />
                              <td data-label="Punten" className="getal">
                                {eigenPunten.reduce((som, p) => som + p.aantal, 0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <p className="hulp" style={{ marginTop: 8 }}>
                        <Link href={huispad(huis.id, `/punten?verdieping=${verdieping.id}`)}>Punten zetten</Link>
                        {grondplan ? (
                          <>
                            {" · "}
                            <Link href={huispad(huis.id, `/plannen/${grondplan.id}/omzetten`)}>Ruimtes verbeteren bij het grondplan</Link>
                          </>
                        ) : null}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
