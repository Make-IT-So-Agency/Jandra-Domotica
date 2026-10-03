import Link from "next/link";
import { notFound } from "next/navigation";

import { GeenToegang } from "@/components/geen-toegang";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { standaardHuis } from "@/lib/bouw/huizen";
import { id as leesId } from "@/lib/bouw/invoer";
import {
  leesBestanden,
  leesPlan,
  lijstGebouwen,
  lijstOmzettingen,
  lijstPlanbestanden,
  lijstVerdiepingen,
} from "@/lib/bouw/opslag";
import { PLANNAMEN, SOORTEN_PLAN, hoortBijVerdieping } from "@/lib/bouw/types";
import { sorteerVerdiepingen, verdiepingNaam, volgendLabel } from "@/lib/bouw/weergave";
import { datum, datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Melding } from "../../melding";
import { downloadVersieActie, verwijderPlanActie, verwijderVersieActie, wijzigPlanActie } from "../acties";
import { NieuweVersie } from "./nieuwe-versie";
import { ViewerLader } from "./viewer-lader";

export const dynamic = "force-dynamic";

export default async function Plandetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ versie?: string; melding?: string; soort?: string }>;
}) {
  const [{ id }, { versie: gekozen, melding, soort }] = await Promise.all([params, searchParams]);
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const planId = leesId(id);
  if (!planId) notFound();
  const plan = await leesPlan(huis.id, planId);
  if (!plan) notFound();

  const [verdiepingen, gebouwen, bestanden, allePdfs, omzettingen] = await Promise.all([
    lijstVerdiepingen(huis.id),
    lijstGebouwen(huis.id),
    leesBestanden(huis.id, [...new Set(plan.versies.map((v) => v.bestand_id))]),
    lijstPlanbestanden(huis.id),
    lijstOmzettingen(plan.versies.map((v) => v.id)),
  ]);
  const omzettingVan = new Map(omzettingen.map((o) => [o.planversie_id, o]));
  const bestandVan = new Map(bestanden.map((b) => [b.id, b]));
  const verdieping = verdiepingen.find((v) => v.id === plan.verdieping_id);
  const gebouw = gebouwen.find((g) => g.id === plan.gebouw_id);

  const getoond = plan.versies.find((v) => String(v.id) === gekozen) ?? plan.versies.at(-1);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href="/bouw/plannen">← Plannen</Link>
      </p>
      <h1>{plan.titel}</h1>
      <p className="inleiding">
        {PLANNAMEN[plan.soort]}
        {gebouw && gebouwen.length > 1 ? ` · ${gebouw.naam}` : ""}
        {verdieping ? ` · ${verdieping.naam}` : ""}
        {plan.bladcode ? ` · ${plan.bladcode}` : ""}
        {plan.opmerking ? ` · ${plan.opmerking}` : ""}
      </p>

      <Melding soort={soort} melding={melding} />

      {hoortBijVerdieping(plan.soort) && !plan.verdieping_id ? (
        <div className="melding let-op">
          Dit {PLANNAMEN[plan.soort].toLowerCase()} hangt nog aan geen verdieping. Kies er een hieronder bij
          &laquo;Plan wijzigen&raquo;.
        </div>
      ) : null}

      {getoond ? (
        <section aria-label="Plan bekijken">
          <div className="viewer-kop">
            <strong>{getoond.label}</strong>
            <span className="hulp">
              {getoond.datum ? `${datum(getoond.datum)} · ` : ""}blad {getoond.pagina}
              {omzettingVan.has(getoond.id) ? ` · ruimtes bevestigd op ${datumTijd(omzettingVan.get(getoond.id)!.bevestigd_op)}` : ""}
            </span>
            {plan.soort === "grondplan" ? (
              <Link className="knop omzetknop" href={`/bouw/plannen/${plan.id}/omzetten?versie=${getoond.id}`}>
                {omzettingVan.has(getoond.id) ? "Ruimtes nakijken" : "Omzetten naar ruimtes"}
              </Link>
            ) : null}
          </div>
          <ViewerLader
            key={getoond.id}
            huisId={huis.id}
            versieId={getoond.id}
            bestandId={getoond.bestand_id}
            pagina={getoond.pagina}
          />
        </section>
      ) : (
        <div className="kaart">
          <p className="leeg">Dit plan heeft nog geen versie. Laad hieronder de PDF van de architect op.</p>
        </div>
      )}

      {plan.versies.length > 0 ? (
        <>
          <h2>Versies</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Versie</th>
                  <th>Datum</th>
                  <th className="getal">Blad</th>
                  <th>Bestand</th>
                  <th>Opgeladen</th>
                  {plan.soort === "grondplan" ? <th>Ruimtes</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...plan.versies].reverse().map((versie) => {
                  const bestand = bestandVan.get(versie.bestand_id);
                  return (
                    <tr key={versie.id}>
                      <td data-label="Versie">
                        {versie.id === getoond?.id ? (
                          <strong>{versie.label}</strong>
                        ) : (
                          <Link href={`/bouw/plannen/${plan.id}?versie=${versie.id}`}>{versie.label}</Link>
                        )}
                      </td>
                      <td data-label="Datum">{versie.datum ? datum(versie.datum) : "—"}</td>
                      <td data-label="Blad" className="getal">
                        {versie.pagina}
                      </td>
                      <td data-label="Bestand">
                        {bestand
                          ? `${bestand.oorspronkelijke_naam}${bestand.grootte_bytes ? ` · ${leesbareGrootte(bestand.grootte_bytes)}` : ""}`
                          : "—"}
                      </td>
                      <td data-label="Opgeladen">{datumTijd(versie.created_at)}</td>
                      {plan.soort === "grondplan" ? (
                        <td data-label="Ruimtes">
                          <Link href={`/bouw/plannen/${plan.id}/omzetten?versie=${versie.id}`}>
                            {omzettingVan.has(versie.id) ? "bevestigd" : "omzetten"}
                          </Link>
                        </td>
                      ) : null}
                      <td>
                        <div className="knoppenrij">
                          <form action={downloadVersieActie.bind(null, huis.id)}>
                            <input type="hidden" name="versie_id" value={versie.id} />
                            <button type="submit" className="stil">
                              Downloaden
                            </button>
                          </form>
                          <form action={verwijderVersieActie.bind(null, huis.id)}>
                            <input type="hidden" name="versie_id" value={versie.id} />
                            <input type="hidden" name="plan_id" value={plan.id} />
                            <BevestigKnop vraag={`Versie ${versie.label} verwijderen?`}>Verwijderen</BevestigKnop>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2>Nieuwe versie</h2>
      <NieuweVersie
        huisId={huis.id}
        planId={plan.id}
        voorstelLabel={volgendLabel(plan.versies.map((v) => v.label))}
        bestaandePdfs={allePdfs.map((b) => ({
          id: b.id,
          naam: b.oorspronkelijke_naam,
          opgeladen: datumTijd(b.created_at),
        }))}
      />

      <details className="kaart" style={{ marginTop: 28 }}>
        <summary>
          <strong>Plan wijzigen of verwijderen</strong>
        </summary>
        <form action={wijzigPlanActie.bind(null, huis.id)} style={{ marginTop: 14 }}>
          <input type="hidden" name="id" value={plan.id} />
          <div className="veldenrij">
            <div>
              <label htmlFor="titel">Titel</label>
              <input id="titel" name="titel" defaultValue={plan.titel} required />
            </div>
            <div>
              <label htmlFor="soort">Soort</label>
              <select id="soort" name="soort" defaultValue={plan.soort}>
                {SOORTEN_PLAN.map((s) => (
                  <option key={s} value={s}>
                    {PLANNAMEN[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gebouw_id">Gebouw</label>
              <select id="gebouw_id" name="gebouw_id" defaultValue={plan.gebouw_id ?? ""}>
                {gebouwen.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.naam}
                  </option>
                ))}
                <option value="">Hele project</option>
              </select>
            </div>
            <div>
              <label htmlFor="verdieping_id">Verdieping</label>
              <select id="verdieping_id" name="verdieping_id" defaultValue={plan.verdieping_id ?? ""}>
                <option value="">Geen</option>
                {sorteerVerdiepingen(verdiepingen, gebouwen).map((v) => (
                  <option key={v.id} value={v.id}>
                    {verdiepingNaam(v, gebouwen)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="veldenrij">
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="opmerking">Opmerking</label>
              <input id="opmerking" name="opmerking" defaultValue={plan.opmerking ?? ""} />
            </div>
          </div>
          <div className="knoppenrij">
            <button type="submit">Bewaren</button>
            <BevestigKnop
              vraag={`"${plan.titel}" en alle versies verwijderen? Dat kan niet ongedaan gemaakt worden.`}
              formAction={verwijderPlanActie.bind(null, huis.id)}
            >
              Plan en alle versies verwijderen
            </BevestigKnop>
          </div>
        </form>
      </details>
    </>
  );
}
