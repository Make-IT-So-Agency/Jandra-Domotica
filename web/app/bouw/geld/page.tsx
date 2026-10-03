import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import {
  CATEGORIEEN_POST,
  CATEGORIENAMEN_POST,
  STANDAARDPOSTEN,
  euroBedrag,
  factuurWat,
  hoofdletter,
  kredietstand,
  openFacturen,
  postVoorstel,
  poststanden,
  totalen,
  type Offerte,
  type Poststand,
} from "@/lib/bouw/geld";
import { laadGeld, type Geldgegevens } from "@/lib/bouw/geld-laden";
import { standaardHuis } from "@/lib/bouw/huizen";
import { sleutelVan } from "@/lib/bouw/invoer";
import { dagenTekst, korteDatum, vandaag } from "@/lib/bouw/kalender";
import { euroRond, meerprijsTekst } from "@/lib/bouw/keuzes";
import { lijstInzendingen, type Inzending } from "@/lib/bouw/links";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Melding } from "../melding";
import {
  bewaarFinancieringActie,
  boekInzendingInActie,
  negeerGeldinzendingActie,
  voegPostToeActie,
  voegStandaardpostenToeActie,
} from "./acties";
import { Geen } from "./factuurlabel";
import { Geldmenu } from "./geldmenu";
import { Postvelden, bedragVeld } from "./velden";

export const dynamic = "force-dynamic";

const meervoud = (aantal: number, een: string, meer: string) => `${aantal} ${aantal === 1 ? een : meer}`;

function Posttabel({
  standen,
  offertes,
  partijnaam,
}: {
  standen: Poststand[];
  offertes: Offerte[];
  partijnaam: (id: number | null) => string | null;
}) {
  const som = totalen(standen, []);
  const open = standen.reduce((totaal, stand) => totaal + stand.open, 0);
  return (
    <div className="tabel-omhulsel">
      <table className="geldtabel">
        <thead>
          <tr>
            <th>Post</th>
            <th className="getal">Raming</th>
            <th className="getal">Verwacht</th>
            <th className="getal">Gefactureerd</th>
            <th className="getal">Betaald</th>
            <th className="getal">Te betalen</th>
          </tr>
        </thead>
        <tbody>
          {standen.map((stand) => {
            const eigen = offertes.filter((offerte) => offerte.post_id === stand.post.id);
            const wie = partijnaam(stand.gekozen?.partij_id ?? stand.post.partij_id);
            return (
              <tr key={stand.post.id}>
                <td data-label="Post">
                  <Link href={`/bouw/geld/${stand.post.id}`}>{stand.post.naam}</Link>
                  <div className="hulp">
                    {stand.gekozen
                      ? `offerte gekozen${wie ? `: ${wie}` : ""}`
                      : eigen.length > 0
                        ? `${meervoud(eigen.length, "offerte", "offertes")}, nog niet gekozen`
                        : wie ?? "nog geen offerte"}
                  </div>
                </td>
                <td data-label="Raming" className="getal">
                  {stand.post.raming === null ? <Geen /> : euroRond(stand.post.raming)}
                </td>
                <td data-label="Verwacht" className="getal">
                  {stand.verwacht === 0 && stand.post.raming === null ? <Geen /> : euroRond(stand.verwacht)}
                  {stand.afwijking ? (
                    <div>
                      <span className={`label-vlag ${stand.afwijking > 0 ? "let-op" : "goed"}`}>
                        {meerprijsTekst(stand.afwijking)}
                      </span>
                    </div>
                  ) : null}
                </td>
                <td data-label="Gefactureerd" className="getal">
                  {stand.gefactureerd === 0 ? <Geen /> : euroRond(stand.gefactureerd)}
                </td>
                <td data-label="Betaald" className="getal">
                  {stand.betaald === 0 ? <Geen /> : euroRond(stand.betaald)}
                </td>
                <td data-label="Te betalen" className="getal">
                  {stand.open === 0 ? <Geen /> : euroRond(stand.open)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {standen.length > 1 ? (
          <tfoot>
            <tr>
              <td data-label="">
                <strong>Samen</strong>
              </td>
              <td data-label="Raming" className="getal">
                {euroRond(som.raming)}
              </td>
              <td data-label="Verwacht" className="getal">
                {euroRond(som.verwacht)}
              </td>
              <td data-label="Gefactureerd" className="getal">
                {euroRond(som.gefactureerd)}
              </td>
              <td data-label="Betaald" className="getal">
                {euroRond(som.betaald)}
              </td>
              <td data-label="Te betalen" className="getal">
                {euroRond(open)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export default async function Geldpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  let g: Geldgegevens;
  let inzendingen: Inzending[];
  try {
    [g, inzendingen] = await Promise.all([
      laadGeld(huis),
      lijstInzendingen(huis.id, { status: "nieuw", soorten: ["offerte", "factuur"] }),
    ]);
  } catch (fout) {
    return (
      <>
        <h1>Geld</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const standen = poststanden(g.posten, g.offertes, g.meerwerken, g.facturen);
  const totaal = totalen(standen, g.facturen);
  const krediet = kredietstand(g.opnames, g.facturen, g.krediet, g.eigenInbreng);
  const open = openFacturen(g.facturen, nu);
  const teLaat = open.filter((item) => item.dagen < 0);
  const dringend = open.filter((item) => item.dagen <= 7);
  const partijnaam = (partijId: number | null) =>
    partijId === null ? null : (g.partijen.find((partij) => partij.id === partijId)?.naam ?? null);
  const ontbrekend = STANDAARDPOSTEN.filter((standaard) => !g.posten.some((post) => sleutelVan(post.naam) === sleutelVan(standaard.naam)));
  const groepen = CATEGORIEEN_POST.map((categorie) => ({
    categorie,
    standen: standen.filter((stand) => stand.post.categorie === categorie),
  })).filter((groep) => groep.standen.length > 0);
  const zonderPost = g.facturen.filter((factuur) => factuur.post_id === null);
  const verschil = totaal.verwacht - totaal.raming;

  return (
    <>
      <h1>Geld</h1>
      <p className="inleiding">
        Wat het huis kost: per post de raming, de offertes, de meer- en minwerken en de facturen. Alle bedragen zijn
        inclusief btw.
      </p>

      <Geldmenu huisId={huis.id} actief="posten" />
      <Melding soort={soort} melding={melding} />

      {inzendingen.length > 0 ? (
        <section id="inzendingen" className="melding info">
          <p>
            <strong>Ingestuurd via een link</strong>
          </p>
          <ul className="inzendingen">
            {inzendingen.map((inzending) => {
              const soort = inzending.soort === "offerte" ? "offerte" : "factuur";
              const voorstel = postVoorstel(inzending.partij_id, soort, g.posten, g.offertes);
              return (
                <li key={inzending.id}>
                  <div>
                    {partijnaam(inzending.partij_id) ?? "Een partij"}:{" "}
                    <strong>
                      {soort === "offerte" ? "offerte" : `factuur${inzending.nummer ? ` ${inzending.nummer}` : ""}`}
                      {inzending.bedrag !== null ? ` van ${euroBedrag(inzending.bedrag)}` : ""}
                    </strong>
                    <span className="hulp">
                      {inzending.datum ? ` · ${korteDatum(inzending.datum, nu)}` : ""}
                      {inzending.vervaldag ? ` · te betalen tegen ${korteDatum(inzending.vervaldag, nu)}` : ""} · ingestuurd{" "}
                      {datumTijd(inzending.created_at)}
                    </span>
                  </div>
                  {inzending.opmerking ? <div className="hulp">&quot;{inzending.opmerking}&quot;</div> : null}
                  <form action={boekInzendingInActie.bind(null, huis.id)} className="knoppenrij">
                    <input type="hidden" name="inzending_id" value={inzending.id} />
                    <select name="post_id" aria-label="Post" defaultValue={voorstel ?? ""} required={soort === "offerte"}>
                      <option value="">{soort === "offerte" ? "— kies de post —" : "— geen post —"}</option>
                      {g.posten.map((post) => (
                        <option key={post.id} value={post.id}>
                          {post.naam}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Inboeken als {soort}</button>
                    <a
                      className="knop stil"
                      href={`/api/bouw/document/${inzending.bestand_id}?huis=${huis.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PDF
                    </a>
                    <BevestigKnop
                      vraag="Deze inzending negeren? Het bestand wordt verwijderd."
                      formAction={negeerGeldinzendingActie.bind(null, huis.id)}
                      className="stil"
                    >
                      Negeren
                    </BevestigKnop>
                  </form>
                </li>
              );
            })}
          </ul>
          {g.posten.length === 0 ? <p className="hulp">Maak eerst de posten aan: een offerte hoort altijd bij een post.</p> : null}
        </section>
      ) : null}

      {dringend.length > 0 ? (
        <div className={`melding ${teLaat.length > 0 ? "fout" : "let-op"}`}>
          <p>
            <strong>Te betalen</strong>
          </p>
          <ul>
            {dringend.map(({ factuur, vervaldag, dagen }) => (
              <li key={factuur.id}>
                {hoofdletter(factuurWat(factuur, partijnaam(factuur.partij_id)))}:{" "}
                {dagen < 0 ? dagenTekst(dagen) : `betalen ${dagenTekst(dagen)}`} ({korteDatum(vervaldag, nu)})
              </li>
            ))}
          </ul>
          <p>
            <Link href="/bouw/geld/facturen">Naar de facturen</Link>
          </p>
        </div>
      ) : null}

      <div className="tegels">
        <div className="tegel">
          <div className="label">Raming</div>
          <div className="waarde">{euroRond(totaal.raming)}</div>
          <div className="bij">{g.posten.length === 0 ? "nog geen posten" : meervoud(g.posten.length, "post", "posten")}</div>
        </div>
        <div className="tegel">
          <div className="label">Verwacht</div>
          <div className="waarde">{euroRond(totaal.verwacht)}</div>
          <div className="bij">
            {totaal.raming === 0
              ? "uit offertes en facturen"
              : Math.round(verschil) === 0
                ? "zoals geraamd"
                : `${euroRond(Math.abs(verschil))} ${verschil > 0 ? "boven" : "onder"} de raming`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Gefactureerd</div>
          <div className="waarde">{euroRond(totaal.gefactureerd)}</div>
          <div className="bij">waarvan {euroRond(totaal.betaald)} betaald</div>
        </div>
        <div className="tegel">
          <div className="label">Te betalen</div>
          <div className="waarde">{euroRond(totaal.open)}</div>
          <div className="bij">
            {open.length === 0
              ? "niets open"
              : `${meervoud(open.length, "factuur", "facturen")}${teLaat.length > 0 ? `, ${teLaat.length} te laat` : ""}`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Nog te factureren</div>
          <div className="waarde">{euroRond(totaal.nogTeFactureren)}</div>
        </div>
        <div className="tegel">
          <div className="label">Krediet</div>
          <div className="waarde">{krediet.beschikbaar === null ? "—" : euroRond(krediet.beschikbaar)}</div>
          <div className="bij">
            {krediet.krediet === null ? "nog niet ingevuld" : `beschikbaar, van ${euroRond(krediet.krediet)}`}
          </div>
        </div>
      </div>

      {g.posten.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen posten.</p>
          <form action={voegStandaardpostenToeActie.bind(null, huis.id)}>
            <button type="submit">Begin met de gewone posten</button>
          </form>
          <p className="hulp" style={{ marginTop: 8 }}>
            De architect, de studies, de vergunning, de ruwbouw, de technieken, de afwerking en de aansluitingen (
            {STANDAARDPOSTEN.length} in totaal). Daarna vul je per post een raming in. Wat je niet nodig hebt,
            verwijder je gewoon.
          </p>
        </div>
      ) : (
        groepen.map((groep) => (
          <section key={groep.categorie}>
            <h2>{CATEGORIENAMEN_POST[groep.categorie]}</h2>
            <Posttabel standen={groep.standen} offertes={g.offertes} partijnaam={partijnaam} />
          </section>
        ))
      )}

      {zonderPost.length > 0 ? (
        <p className="hulp">
          Daarnaast {meervoud(zonderPost.length, "factuur", "facturen")} zonder post (
          {euroRond(zonderPost.reduce((totaal, factuur) => totaal + factuur.bedrag, 0))}). Die tellen mee in de tegels.{" "}
          <Link href="/bouw/geld/facturen">Naar de facturen</Link>
        </p>
      ) : null}

      <p className="hulp">
        Verwacht is de gekozen offerte met de aanvaarde meer- en minwerken, of zolang er niets gekozen is de raming.
        Wat al gefactureerd is, telt altijd.
      </p>

      <hr className="scheiding" />

      <h2>Post toevoegen</h2>
      <form action={voegPostToeActie.bind(null, huis.id)} className="kaart">
        <Postvelden partijen={g.partijen} planning={g.planning} voorvoegsel="nieuw" />
        <p className="hulp">
          Met een taak in de planning weet de kasplanning wanneer het geld nodig is.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      {g.posten.length > 0 && ontbrekend.length > 0 ? (
        <form action={voegStandaardpostenToeActie.bind(null, huis.id)} className="hulp" style={{ marginTop: 12 }}>
          Nog niet in de lijst: {ontbrekend.map((standaard) => standaard.naam).join(", ")}.{" "}
          <button type="submit" className="link">
            Zet ze erbij
          </button>
        </form>
      ) : null}

      <h2 id="financiering">Financiering</h2>
      <form action={bewaarFinancieringActie.bind(null, huis.id)} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="krediet">Bouwkrediet (€)</label>
            <input id="krediet" name="krediet" inputMode="decimal" defaultValue={bedragVeld(g.krediet)} placeholder="300.000" />
          </div>
          <div>
            <label htmlFor="eigen-inbreng">Eigen inbreng (€)</label>
            <input
              id="eigen-inbreng"
              name="eigen_inbreng"
              inputMode="decimal"
              defaultValue={bedragVeld(g.eigenInbreng)}
              placeholder="80.000"
            />
          </div>
        </div>
        <p className="hulp">
          De kasplanning laat eerst de eigen inbreng opgaan, dan het krediet. Wat je van het krediet opneemt, noteer je
          bij <Link href="/bouw/geld/facturen#krediet">Facturen</Link>.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Bewaren</button>
        </div>
      </form>
    </>
  );
}
