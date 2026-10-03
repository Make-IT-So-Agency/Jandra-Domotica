import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { kasplanning, poststanden } from "@/lib/bouw/geld";
import { laadGeld, type Geldgegevens } from "@/lib/bouw/geld-laden";
import { standaardHuis } from "@/lib/bouw/huizen";
import { maandnaam, vandaag } from "@/lib/bouw/kalender";
import { euroRond } from "@/lib/bouw/keuzes";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Geen } from "../factuurlabel";
import { Geldmenu } from "../geldmenu";
import { Kasgrafiek } from "./kasgrafiek";

export const dynamic = "force-dynamic";

const maandTekst = (maand: string) => `${maandnaam(`${maand}-01`)} ${maand.slice(0, 4)}`;

export default async function Kasplanningpagina() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  let g: Geldgegevens;
  try {
    g = await laadGeld(huis);
  } catch (fout) {
    return (
      <>
        <h1>Kasplanning</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const standen = poststanden(g.posten, g.offertes, g.meerwerken, g.facturen);
  const { maanden, ongepland } = kasplanning(standen, g.facturen, g.planning, nu, g.eigenInbreng);
  const zonderTaak = standen.filter(
    (stand) => stand.nogTeFactureren > 0 && !g.planning.some((item) => item.id === stand.post.planning_id),
  );
  const totaal = maanden.at(-1)?.cumulatief ?? 0;
  const nodig = totaal + ongepland;
  const middelen = (g.krediet ?? 0) + (g.eigenInbreng ?? 0);
  const kredietVol = g.krediet !== null ? maanden.find((maand) => maand.cumulatief - (g.eigenInbreng ?? 0) > g.krediet!) : undefined;

  return (
    <>
      <h1>Kasplanning</h1>
      <p className="inleiding">
        Wanneer het geld nodig is: per maand wat betaald is, wat vervalt, en wat volgens de planning nog komt. Wat nog
        gefactureerd moet worden, spreidt de app over de maanden van de taak van de post.
      </p>

      <Geldmenu huisId={huis.id} actief="kasplanning" />

      {maanden.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog niets te plannen.</p>
          <p className="hulp">
            Vul bij <Link href="/bouw/geld">de posten</Link> een raming in en koppel elke post aan een taak in de{" "}
            <Link href="/bouw/planning">planning</Link>. Facturen komen er vanzelf bij.
          </p>
        </div>
      ) : (
        <>
          <div className="tegels">
            <div className="tegel">
              <div className="label">Nog nodig</div>
              <div className="waarde">{euroRond(nodig - maanden.reduce((som, maand) => som + maand.betaald, 0))}</div>
              <div className="bij">te betalen en gepland</div>
            </div>
            <div className="tegel">
              <div className="label">Alles samen</div>
              <div className="waarde">{euroRond(nodig)}</div>
              <div className="bij">
                {middelen > 0
                  ? nodig > middelen
                    ? `${euroRond(nodig - middelen)} meer dan krediet en eigen inbreng`
                    : `binnen krediet en eigen inbreng (${euroRond(middelen)})`
                  : "krediet en eigen inbreng nog niet ingevuld"}
              </div>
            </div>
            <div className="tegel">
              <div className="label">Zonder datum</div>
              <div className="waarde">{euroRond(ongepland)}</div>
              <div className="bij">{zonderTaak.length === 1 ? "1 post zonder taak" : `${zonderTaak.length} posten zonder taak`}</div>
            </div>
          </div>

          {kredietVol ? (
            <div className="melding let-op">
              Volgens deze planning is het krediet op in {maandTekst(kredietVol.maand)}.
            </div>
          ) : null}

          <Kasgrafiek maanden={maanden} vandaag={nu} />

          <div className="tabel-omhulsel" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Maand</th>
                  <th className="getal">Betaald</th>
                  <th className="getal">Te betalen</th>
                  <th className="getal">Gepland</th>
                  <th className="getal">Samen tot dan</th>
                  <th className="getal">Uit het krediet</th>
                </tr>
              </thead>
              <tbody>
                {maanden.map((maand) => (
                  <tr key={maand.maand} className={maand.maand === nu.slice(0, 7) ? "deze-maand" : undefined}>
                    <td data-label="Maand">{maandTekst(maand.maand)}</td>
                    <td data-label="Betaald" className="getal">
                      {maand.betaald === 0 ? <Geen /> : euroRond(maand.betaald)}
                    </td>
                    <td data-label="Te betalen" className="getal">
                      {maand.teBetalen === 0 ? <Geen /> : euroRond(maand.teBetalen)}
                    </td>
                    <td data-label="Gepland" className="getal">
                      {maand.gepland === 0 ? <Geen /> : euroRond(maand.gepland)}
                    </td>
                    <td data-label="Samen tot dan" className="getal">
                      {euroRond(maand.cumulatief)}
                    </td>
                    <td data-label="Uit het krediet" className="getal">
                      {maand.uitKrediet === 0 ? <Geen /> : euroRond(maand.uitKrediet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hulp">
            Uit het krediet: wat overblijft als eerst de eigen inbreng opgaat
            {g.eigenInbreng === null ? (
              <>
                {" "}
                (nog niet ingevuld bij <Link href="/bouw/geld#financiering">Financiering</Link>)
              </>
            ) : (
              ` (${euroRond(g.eigenInbreng)})`
            )}
            . Een vervallen factuur die nog open staat, telt bij deze maand.
          </p>
        </>
      )}

      {zonderTaak.length > 0 ? (
        <>
          <h2>Posten zonder taak in de planning</h2>
          <p className="hulp">Daarvan weet de app niet wanneer het geld nodig is. Koppel ze aan een taak.</p>
          <ul className="wijzigingen">
            {zonderTaak.map((stand) => (
              <li key={stand.post.id}>
                <Link href={`/bouw/geld/${stand.post.id}`}>{stand.post.naam}</Link>: nog {euroRond(stand.nogTeFactureren)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
