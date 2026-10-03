import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { euroBedrag, kredietstand, openFacturen, vervaldagVan, type Factuur } from "@/lib/bouw/geld";
import { laadGeld, type Geldgegevens } from "@/lib/bouw/geld-laden";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import { euroRond } from "@/lib/bouw/keuzes";
import { huispad } from "@/lib/bouw/paden";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import { Melding } from "@/components/bouw/melding";
import {
  betaalActie,
  verwijderFactuurActie,
  verwijderKredietopnameActie,
  voegFactuurToeActie,
  voegKredietopnameToeActie,
  wijzigFactuurActie,
  zetDocumentActie,
} from "../acties";
import { Documentveld } from "../documentveld";
import { Factuurlabel, Pdflink } from "../factuurlabel";
import { Geldmenu } from "../geldmenu";
import { Factuurvelden } from "../velden";

export const dynamic = "force-dynamic";

const pad = (huisId: number) => huispad(huisId, "/geld/facturen");

function Factuurtabel({
  huisId,
  facturen,
  g,
  nu,
}: {
  huisId: number;
  facturen: Factuur[];
  g: Geldgegevens;
  nu: string;
}) {
  const partijnaam = (partijId: number | null) =>
    partijId === null ? null : (g.partijen.find((partij) => partij.id === partijId)?.naam ?? null);
  const postnaam = (postId: number | null) => (postId === null ? null : (g.posten.find((post) => post.id === postId)?.naam ?? null));
  const vennootschap = (vennootschapId: string | null) =>
    vennootschapId === null ? null : (g.vennootschappen.find((v) => v.id === vennootschapId)?.naam ?? "een vennootschap");
  return (
    <div className="tabel-omhulsel">
      <table>
        <thead>
          <tr>
            <th>Van</th>
            <th>Post</th>
            <th className="getal">Bedrag</th>
            <th>Vervalt</th>
            <th>PDF</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {facturen.map((factuur) => (
            <tr key={factuur.id}>
              <td data-label="Van">
                {partijnaam(factuur.partij_id) ?? "Onbekend"}
                <div className="hulp">
                  {[factuur.nummer ? `nr. ${factuur.nummer}` : null, korteDatum(factuur.factuurdatum, nu), factuur.omschrijving]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td data-label="Post">
                {factuur.post_id ? <Link href={huispad(huisId, `/geld/${factuur.post_id}`)}>{postnaam(factuur.post_id)}</Link> : <span className="hulp">geen post</span>}
                {factuur.vennootschap_id ? <div className="hulp">ten laste van {vennootschap(factuur.vennootschap_id)}</div> : null}
              </td>
              <td data-label="Bedrag" className="getal">
                {euroBedrag(factuur.bedrag)}
              </td>
              <td data-label="Vervalt">
                {factuur.bedrag > 0 ? `${korteDatum(vervaldagVan(factuur), nu)} ` : null}
                <Factuurlabel factuur={factuur} vandaag={nu} />
              </td>
              <td data-label="PDF">
                <Pdflink huisId={huisId} bestandId={factuur.bestand_id} />
              </td>
              <td>
                <form action={betaalActie.bind(null, huisId)} className="knoppenrij">
                  <input type="hidden" name="id" value={factuur.id} />
                  <input type="hidden" name="terug" value={pad(huisId)} />
                  <button type="submit" className={factuur.betaald_op ? "stil" : undefined}>
                    {factuur.betaald_op ? "Toch niet betaald" : factuur.bedrag < 0 ? "Verrekend" : "Betaald"}
                  </button>
                  <Link className="knop stil" href={`${pad(huisId)}?factuur=${factuur.id}#factuur`}>
                    Wijzigen
                  </Link>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Facturenpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string; factuur?: string }>;
}) {
  const { melding, soort, factuur: gekozen } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  let g: Geldgegevens;
  try {
    g = await laadGeld(huis);
  } catch (fout) {
    return (
      <>
        <h1>Facturen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const open = openFacturen(g.facturen, nu);
  const teBetalen = g.facturen
    .filter((factuur) => !factuur.betaald_op)
    .sort((a, b) => vervaldagVan(a).localeCompare(vervaldagVan(b)) || a.id - b.id);
  const betaald = g.facturen
    .filter((factuur) => factuur.betaald_op)
    .sort((a, b) => b.betaald_op!.localeCompare(a.betaald_op!) || b.id - a.id);
  const teLaat = open.filter((item) => item.dagen < 0);
  const creditnotas = teBetalen.filter((factuur) => factuur.bedrag < 0);
  const krediet = kredietstand(g.opnames, g.facturen, g.krediet, g.eigenInbreng);
  const teWijzigen = g.facturen.find((factuur) => factuur.id === leesId(gekozen ?? ""));
  const som = (facturen: { bedrag: number }[]) => facturen.reduce((totaal, factuur) => totaal + factuur.bedrag, 0);
  const factuurnaam = (factuur: Factuur) =>
    [factuur.nummer ? `nr. ${factuur.nummer}` : null, g.partijen.find((partij) => partij.id === factuur.partij_id)?.naam, euroBedrag(factuur.bedrag)]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <h1>Facturen</h1>
      <p className="inleiding">
        Alle facturen van de bouw, met hun vervaldag. De bot van Bouw herinnert drie dagen ervoor, op de dag zelf en
        de dag erna.
      </p>

      <Geldmenu huisId={huis.id} actief="facturen" />
      <Melding soort={soort} melding={melding} />

      <div className="tegels">
        <div className="tegel">
          <div className="label">Te betalen</div>
          <div className="waarde">{euroRond(som(teBetalen))}</div>
          <div className="bij">
            {open.length === 1 ? "1 factuur" : `${open.length} facturen`}
            {creditnotas.length > 0 ? `, min ${creditnotas.length === 1 ? "een creditnota" : `${creditnotas.length} creditnota's`}` : ""}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Te laat</div>
          <div className="waarde">{teLaat.length}</div>
          <div className="bij">{teLaat.length > 0 ? euroRond(som(teLaat.map((item) => item.factuur))) : "niets"}</div>
        </div>
        <div className="tegel">
          <div className="label">Betaald</div>
          <div className="waarde">{euroRond(som(betaald))}</div>
          <div className="bij">{betaald.length === 1 ? "1 factuur" : `${betaald.length} facturen`}</div>
        </div>
        <div className="tegel">
          <div className="label">Krediet opgenomen</div>
          <div className="waarde">{euroRond(krediet.opgenomen)}</div>
          <div className="bij">
            {krediet.beschikbaar === null ? "krediet nog niet ingevuld" : `nog ${euroRond(krediet.beschikbaar)} beschikbaar`}
          </div>
        </div>
      </div>

      {teWijzigen ? (
        <section id="factuur" className="kaart">
          <h2 style={{ marginTop: 0 }}>Factuur {factuurnaam(teWijzigen)}</h2>
          <form action={wijzigFactuurActie.bind(null, huis.id)}>
            <input type="hidden" name="id" value={teWijzigen.id} />
            <Factuurvelden
              huisId={huis.id}
              factuur={teWijzigen}
              posten={g.posten}
              partijen={g.partijen}
              vennootschappen={g.vennootschappen}
              voorvoegsel="wijzig"
            />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop vraag="Deze factuur verwijderen, met haar PDF?" formAction={verwijderFactuurActie.bind(null, huis.id)}>
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href={pad(huis.id)}>
                Sluiten
              </Link>
            </div>
          </form>
          <form action={zetDocumentActie.bind(null, huis.id)} style={{ marginTop: 16 }}>
            <input type="hidden" name="soort" value="factuur" />
            <input type="hidden" name="id" value={teWijzigen.id} />
            <input type="hidden" name="terug" value={pad(huis.id)} />
            <div className="veldenrij">
              <Documentveld
                huisId={huis.id}
                id="wijzig-pdf"
                label={teWijzigen.bestand_id ? "Een andere PDF" : "PDF van de factuur"}
              />
            </div>
            <div className="knoppenrij" style={{ marginTop: 8 }}>
              <button type="submit" className="stil">
                PDF bewaren
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <h2>Te betalen</h2>
      {teBetalen.length === 0 ? (
        <p className="hulp">Niets open.</p>
      ) : (
        <Factuurtabel huisId={huis.id} facturen={teBetalen} g={g} nu={nu} />
      )}

      <h2>Factuur toevoegen</h2>
      <form action={voegFactuurToeActie.bind(null, huis.id)} className="kaart">
        <input type="hidden" name="terug" value={pad(huis.id)} />
        <Factuurvelden
          huisId={huis.id}
          posten={g.posten}
          partijen={g.partijen}
          vennootschappen={g.vennootschappen}
          voorvoegsel="nieuw"
        />
        <p className="hulp">
          Zonder vervaldag rekent de app 30 dagen na de factuurdatum. Een creditnota telt af van de post.
          {g.vennootschappen.length > 0 ? " Wat ten laste van een vennootschap valt, bv. een laadpaal, duid je aan bij Ten laste van." : ""}
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      {betaald.length > 0 ? (
        <>
          <h2>Betaald</h2>
          <Factuurtabel huisId={huis.id} facturen={betaald} g={g} nu={nu} />
        </>
      ) : null}

      <h2 id="krediet">Bouwkrediet</h2>
      <div className="kaart">
        <dl className="kredietstand">
          <dt>Krediet</dt>
          <dd>{krediet.krediet === null ? <Link href={huispad(huis.id, "/geld#financiering")}>invullen</Link> : euroBedrag(krediet.krediet)}</dd>
          <dt>Opgenomen</dt>
          <dd>{euroBedrag(krediet.opgenomen)}</dd>
          <dt>Nog beschikbaar</dt>
          <dd>{krediet.beschikbaar === null ? "—" : euroBedrag(krediet.beschikbaar)}</dd>
          <dt>Uit eigen middelen betaald</dt>
          <dd>
            {euroBedrag(krediet.eigenBetaald)}
            {krediet.eigenInbreng !== null ? <span className="hulp"> van {euroBedrag(krediet.eigenInbreng)} eigen inbreng</span> : null}
          </dd>
        </dl>

        {g.opnames.length > 0 ? (
          <div className="tabel-omhulsel" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th className="getal">Bedrag</th>
                  <th>Voor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.opnames.map((opname) => {
                  const factuur = g.facturen.find((f) => f.id === opname.factuur_id);
                  return (
                    <tr key={opname.id}>
                      <td data-label="Datum">{korteDatum(opname.datum, nu)}</td>
                      <td data-label="Bedrag" className="getal">
                        {euroBedrag(opname.bedrag)}
                      </td>
                      <td data-label="Voor">
                        {factuur ? factuurnaam(factuur) : "—"}
                        {opname.opmerking ? <div className="hulp">{opname.opmerking}</div> : null}
                      </td>
                      <td>
                        <form action={verwijderKredietopnameActie.bind(null, huis.id)} className="knoppenrij">
                          <input type="hidden" name="id" value={opname.id} />
                          <BevestigKnop vraag="Deze opname verwijderen?" className="stil">
                            Verwijderen
                          </BevestigKnop>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <form action={voegKredietopnameToeActie.bind(null, huis.id)} style={{ marginTop: 12 }}>
          <div className="veldenrij">
            <div>
              <label htmlFor="opname-datum">Opgenomen op</label>
              <input id="opname-datum" name="datum" type="date" defaultValue={nu} required />
            </div>
            <div>
              <label htmlFor="opname-bedrag">Bedrag (€)</label>
              <input id="opname-bedrag" name="bedrag" inputMode="decimal" required placeholder="25.000" />
            </div>
            <div>
              <label htmlFor="opname-factuur">Voor factuur</label>
              <select id="opname-factuur" name="factuur_id" defaultValue="">
                <option value="">—</option>
                {g.facturen
                  .filter((factuur) => factuur.bedrag > 0)
                  .map((factuur) => (
                    <option key={factuur.id} value={factuur.id}>
                      {factuurnaam(factuur)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="veldenrij">
            <div>
              <label htmlFor="opname-opmerking">Opmerking</label>
              <input id="opname-opmerking" name="opmerking" placeholder="Schijf 3" />
            </div>
          </div>
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Opname noteren</button>
          </div>
        </form>
      </div>
    </>
  );
}
