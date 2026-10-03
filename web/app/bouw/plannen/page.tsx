import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { alsBestaand } from "@/lib/bouw/dossier-inlezen";
import { standaardHuis } from "@/lib/bouw/huizen";
import { id as leesId } from "@/lib/bouw/invoer";
import { lijstInzendingen, type Inzending } from "@/lib/bouw/links";
import { teDoen } from "@/lib/bouw/omzetting/reeks";
import {
  leesBestanden,
  lijstGebouwen,
  lijstOmzettingen,
  lijstPartijen,
  lijstPlannen,
  lijstVerdiepingen,
  type PlanMetVersies,
} from "@/lib/bouw/opslag";
import { PLANNAMEN, SOORTEN_PLAN, type Bestand, type Gebouw, type Partij, type Verdieping } from "@/lib/bouw/types";
import { sorteerPlannen, sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { datum, datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Melding } from "../melding";
import { downloadInzendingActie, negeerInzendingActie, voegPlanToeActie } from "./acties";
import { DossierLader } from "./dossier-lader";
import { Omzetoproep } from "./omzetten/oproep";

export const dynamic = "force-dynamic";

export default async function Plannenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; inzending?: string }>;
}) {
  const { melding, soort, inzending: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  let plannen: PlanMetVersies[];
  let verdiepingen: Verdieping[];
  let gebouwen: Gebouw[];
  let inzendingen: Inzending[];
  let partijen: Partij[];
  let bestanden: Bestand[];
  let omgezet: Set<number>;
  try {
    [plannen, verdiepingen, gebouwen, inzendingen, partijen] = await Promise.all([
      lijstPlannen(huis.id),
      lijstVerdiepingen(huis.id),
      lijstGebouwen(huis.id),
      lijstInzendingen(huis.id, { status: "nieuw", soorten: ["plan"] }),
      lijstPartijen(huis.id),
    ]);
    const [b, omzettingen] = await Promise.all([
      leesBestanden(huis.id, inzendingen.map((inzending) => inzending.bestand_id)),
      lijstOmzettingen(plannen.flatMap((plan) => plan.versies.map((versie) => versie.id))),
    ]);
    bestanden = b;
    omgezet = new Set(omzettingen.map((omzetting) => omzetting.planversie_id));
  } catch (fout) {
    return (
      <>
        <h1>Plannen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }
  const verdiepingVan = new Map(verdiepingen.map((v) => [v.id, v]));
  const gebouwVan = new Map(gebouwen.map((g) => [g.id, g.naam]));
  const gesorteerd = sorteerPlannen(plannen, gebouwen);
  const partijnaam = (partijId: number | null) => partijen.find((partij) => partij.id === partijId)?.naam ?? "Een partij";
  const bestandVan = new Map(bestanden.map((bestand) => [bestand.id, bestand]));
  const gekozen = inzendingen.find((inzending) => inzending.id === leesId(gevraagd ?? ""));

  return (
    <>
      <h1>Plannen</h1>
      <p className="inleiding">
        De plannen van de architect, elk met zijn versies. Het dossier met alle bladen lees je in
        één keer in: de app stelt per blad een plan voor, en een volgend dossier wordt een nieuwe
        versie van dezelfde plannen.
      </p>

      <Melding soort={soort} melding={melding} />
      <Omzetoproep aantal={teDoen(plannen, verdiepingen, gebouwen, omgezet).open} />

      {inzendingen.length > 0 ? (
        <section id="inzendingen" className="melding info">
          <p>
            <strong>Ingestuurd via een link</strong>
          </p>
          <ul className="inzendingen">
            {inzendingen.map((inzending) => {
              const bestand = bestandVan.get(inzending.bestand_id);
              return (
                <li key={inzending.id}>
                  <div>
                    {partijnaam(inzending.partij_id)}: <strong>{bestand?.oorspronkelijke_naam ?? "bestand"}</strong>
                    <span className="hulp">
                      {" "}
                      · {datumTijd(inzending.created_at)}
                      {bestand?.grootte_bytes ? ` · ${leesbareGrootte(bestand.grootte_bytes)}` : ""}
                    </span>
                  </div>
                  {inzending.opmerking ? <div className="hulp">"{inzending.opmerking}"</div> : null}
                  <form className="knoppenrij">
                    <input type="hidden" name="id" value={inzending.id} />
                    <Link className="knop" href={`/bouw/plannen?inzending=${inzending.id}#dossier`}>
                      Inlezen
                    </Link>
                    <button type="submit" className="stil" formAction={downloadInzendingActie.bind(null, huis.id)} formNoValidate>
                      Downloaden
                    </button>
                    <BevestigKnop
                      vraag="Deze inzending negeren? Het bestand wordt verwijderd."
                      formAction={negeerInzendingActie.bind(null, huis.id)}
                      className="stil"
                    >
                      Negeren
                    </BevestigKnop>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {plannen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen plannen. Lees hieronder het dossier van de architect in.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Soort</th>
                <th>Gebouw</th>
                <th>Verdieping</th>
                <th>Laatste versie</th>
                <th className="getal">Versies</th>
              </tr>
            </thead>
            <tbody>
              {gesorteerd.map((plan) => {
                const laatste = plan.versies.at(-1);
                return (
                  <tr key={plan.id}>
                    <td data-label="Plan">
                      <Link href={`/bouw/plannen/${plan.id}`}>{plan.titel}</Link>
                    </td>
                    <td data-label="Soort">{PLANNAMEN[plan.soort]}</td>
                    <td data-label="Gebouw">
                      {plan.gebouw_id ? (gebouwVan.get(plan.gebouw_id) ?? "—") : "hele project"}
                    </td>
                    <td data-label="Verdieping">
                      {plan.verdieping_id ? (verdiepingVan.get(plan.verdieping_id)?.naam ?? "—") : "—"}
                    </td>
                    <td data-label="Laatste versie">
                      {laatste ? `${laatste.label}${laatste.datum ? ` · ${datum(laatste.datum)}` : ""}` : "nog geen"}
                    </td>
                    <td data-label="Versies" className="getal">
                      {plan.versies.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 id="dossier">Dossier inlezen</h2>
      <DossierLader
        key={gekozen?.id ?? "eigen"}
        huisId={huis.id}
        inzending={
          gekozen
            ? {
                id: gekozen.id,
                naam: bestandVan.get(gekozen.bestand_id)?.oorspronkelijke_naam ?? "dossier.pdf",
                door: partijnaam(gekozen.partij_id),
              }
            : undefined
        }
        bestaand={{
          plannen: alsBestaand(plannen, gebouwen),
          gebouwen: gebouwen.map((g) => g.naam),
          verdiepingen: verdiepingen.map((v) => ({ gebouw: gebouwVan.get(v.gebouw_id) ?? "", naam: v.naam })),
        }}
      />

      <hr className="scheiding" />

      <h2>Eén plan toevoegen</h2>
      <form action={voegPlanToeActie.bind(null, huis.id)} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="titel">Titel</label>
            <input id="titel" name="titel" required placeholder="Grondplan gelijkvloers" />
          </div>
          <div>
            <label htmlFor="soort">Soort</label>
            <select id="soort" name="soort" defaultValue="grondplan">
              {SOORTEN_PLAN.map((s) => (
                <option key={s} value={s}>
                  {PLANNAMEN[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gebouw_id">Gebouw</label>
            <select id="gebouw_id" name="gebouw_id" defaultValue={gebouwen[0]?.id ?? ""}>
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
            <select id="verdieping_id" name="verdieping_id" defaultValue="">
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
            <input id="opmerking" name="opmerking" />
          </div>
        </div>
        <p className="hulp" style={{ marginBottom: 12 }}>
          {verdiepingen.length === 0 ? (
            <>
              Een grondplan hoort bij een verdieping. Maak die eerst aan bij{" "}
              <Link href="/bouw/verdiepingen">Verdiepingen</Link>.
            </>
          ) : (
            "Bij een plan op een verdieping volgt het gebouw uit de verdieping."
          )}
        </p>
        <button type="submit">Plan aanmaken</button>
      </form>
    </>
  );
}
