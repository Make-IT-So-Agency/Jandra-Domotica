import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { lijstGebouwen, lijstPlannen, lijstVerdiepingen, type PlanMetVersies } from "@/lib/bouw/opslag";
import { PLANNAMEN, SOORTEN_PLAN, type Gebouw, type Verdieping } from "@/lib/bouw/types";
import { sorteerPlannen, sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { datum } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { voegPlanToeActie } from "./acties";

export const dynamic = "force-dynamic";

export default async function Plannenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let plannen: PlanMetVersies[];
  let verdiepingen: Verdieping[];
  let gebouwen: Gebouw[];
  try {
    [plannen, verdiepingen, gebouwen] = await Promise.all([lijstPlannen(), lijstVerdiepingen(), lijstGebouwen()]);
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

  return (
    <>
      <h1>Plannen</h1>
      <p className="inleiding">
        De plannen van de architect, elk met zijn versies. Een PDF met alle bladen kan je één keer
        opladen en dan per blad als versie gebruiken.
      </p>

      <Melding soort={soort} melding={melding} />

      {plannen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen plannen. Maak er hieronder een aan, en laad dan de PDF op.</p>
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

      <hr className="scheiding" />

      <h2>Plan toevoegen</h2>
      <form action={voegPlanToeActie} className="kaart">
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
