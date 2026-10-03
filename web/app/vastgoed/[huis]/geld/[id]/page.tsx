import Link from "next/link";
import { notFound } from "next/navigation";

import { GeenToegang } from "@/components/geen-toegang";
import {
  CATEGORIENAMEN_POST,
  euroBedrag,
  poststanden,
  vergelijkOffertes,
  vervaldagVan,
} from "@/lib/bouw/geld";
import { leesPost, lijstFacturen, lijstMeerwerken, lijstOffertes, lijstVennootschappen } from "@/lib/bouw/geld-opslag";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import { euroRond, meerprijsTekst } from "@/lib/bouw/keuzes";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { lijstPlanning } from "@/lib/bouw/regie-opslag";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import { Melding } from "@/components/bouw/melding";
import {
  betaalActie,
  kiesOfferteActie,
  verwijderOfferteActie,
  verwijderPostActie,
  voegFactuurToeActie,
  voegMeerwerkToeActie,
  voegOfferteToeActie,
  wijzigOfferteActie,
  wijzigPostActie,
  zetDocumentActie,
  zetMeerwerkActie,
} from "../acties";
import { Documentveld } from "../documentveld";
import { Factuurlabel, Pdflink } from "../factuurlabel";
import { Factuurvelden, Offertevelden, Postvelden } from "../velden";

export const dynamic = "force-dynamic";

const MEERWERKSTATUS = { voorgesteld: "voorgesteld", aanvaard: "aanvaard", geweigerd: "geweigerd" } as const;

export default async function Postpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string; id: string }>;
  searchParams: Promise<{ melding?: string; soort?: string; offerte?: string }>;
}) {
  const [{ id }, { melding, soort, offerte: gekozenOfferte }] = await Promise.all([params, searchParams]);
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  const postId = leesId(id);
  const post = postId ? await leesPost(huis.id, postId) : null;
  if (!post) notFound();

  const [offertes, meerwerken, facturen, partijen, planning, vennootschappen] = await Promise.all([
    lijstOffertes(huis.id, post.id),
    lijstMeerwerken(huis.id, post.id),
    lijstFacturen(huis.id, post.id),
    lijstPartijen(huis.id),
    lijstPlanning(huis.id),
    lijstVennootschappen(),
  ]);

  const nu = vandaag();
  const [stand] = poststanden([post], offertes, meerwerken, facturen);
  const vergelijking = vergelijkOffertes(offertes, post.raming);
  const partijnaam = (partijId: number | null) =>
    partijId === null ? null : (partijen.find((partij) => partij.id === partijId)?.naam ?? null);
  const taak = planning.find((item) => item.id === post.planning_id);
  const teWijzigen = offertes.find((offerte) => offerte.id === leesId(gekozenOfferte ?? ""));
  const pagina = huispad(huis.id, `/geld/${post.id}`);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href={huispad(huis.id, "/geld")}>← Geld</Link>
      </p>
      <h1>{post.naam}</h1>
      <p className="inleiding">
        {CATEGORIENAMEN_POST[post.categorie]}
        {post.partij_id ? ` · ${partijnaam(post.partij_id)}` : ""}
        {taak ? ` · ${taak.titel}, vanaf ${korteDatum(taak.begindatum, nu)}` : ""}
        {post.opmerking ? ` · ${post.opmerking}` : ""}
      </p>

      <Melding soort={soort} melding={melding} />

      <div className="tegels">
        <div className="tegel">
          <div className="label">Raming</div>
          <div className="waarde">{post.raming === null ? "—" : euroRond(post.raming)}</div>
        </div>
        <div className="tegel">
          <div className="label">Gekozen offerte</div>
          <div className="waarde">{stand.gekozen ? euroRond(stand.gekozen.bedrag) : "—"}</div>
          <div className="bij">
            {stand.gekozen
              ? (partijnaam(stand.gekozen.partij_id) ?? "")
              : offertes.length === 0
                ? "nog geen offerte"
                : "nog niet gekozen"}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Meer- en minwerk</div>
          <div className="waarde">{meerprijsTekst(stand.meerwerk)}</div>
          <div className="bij">aanvaard</div>
        </div>
        <div className="tegel">
          <div className="label">Verwacht</div>
          <div className="waarde">{euroRond(stand.verwacht)}</div>
          <div className="bij">
            {stand.afwijking === null
              ? stand.toegekend === null
                ? "volgens de raming"
                : ""
              : Math.round(stand.afwijking) === 0
                ? "zoals geraamd"
                : `${meerprijsTekst(stand.afwijking)} tegenover de raming`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Gefactureerd</div>
          <div className="waarde">{euroRond(stand.gefactureerd)}</div>
          <div className="bij">{stand.open > 0 ? `${euroRond(stand.open)} nog te betalen` : `nog ${euroRond(stand.nogTeFactureren)} te komen`}</div>
        </div>
      </div>

      <h2>Offertes</h2>
      {offertes.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen offertes. Zet ze hieronder erbij, met de PDF.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Van</th>
                <th className="getal">Bedrag</th>
                <th>Datum</th>
                <th>PDF</th>
                <th>Stand</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offertes.map((offerte) => {
                const vergeleken = vergelijking.get(offerte.id);
                const verlopen = offerte.geldig_tot !== null && offerte.geldig_tot < nu && offerte.status !== "gekozen";
                return (
                  <tr key={offerte.id}>
                    <td data-label="Van">
                      {partijnaam(offerte.partij_id) ?? "Onbekend"}
                      {offerte.omschrijving ? <div className="hulp">{offerte.omschrijving}</div> : null}
                    </td>
                    <td data-label="Bedrag" className="getal">
                      {euroBedrag(offerte.bedrag)}
                      {vergeleken && offertes.length > 1 ? (
                        <div className="hulp">
                          {vergeleken.tovGoedkoopste === 0 ? "de goedkoopste" : `${meerprijsTekst(vergeleken.tovGoedkoopste)} duurder`}
                        </div>
                      ) : null}
                      {vergeleken?.tovRaming !== null && vergeleken?.tovRaming !== undefined ? (
                        <div className="hulp">
                          {vergeleken.tovRaming === 0
                            ? "zoals geraamd"
                            : `${Math.abs(vergeleken.tovRaming).toLocaleString("nl-BE")} % ${vergeleken.tovRaming > 0 ? "boven" : "onder"} de raming`}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Datum">
                      {offerte.datum ? korteDatum(offerte.datum, nu) : "—"}
                      {offerte.geldig_tot ? (
                        <div className="hulp">
                          {verlopen ? <span className="label-vlag fout">verlopen</span> : `geldig tot ${korteDatum(offerte.geldig_tot, nu)}`}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="PDF">
                      <Pdflink huisId={huis.id} bestandId={offerte.bestand_id} />
                    </td>
                    <td data-label="Stand">
                      {offerte.status === "gekozen" ? (
                        <span className="label-vlag goed">gekozen</span>
                      ) : offerte.status === "afgewezen" ? (
                        <span className="hulp">afgewezen</span>
                      ) : (
                        <span className="hulp">ontvangen</span>
                      )}
                    </td>
                    <td>
                      <form action={kiesOfferteActie.bind(null, huis.id)} className="knoppenrij">
                        <input type="hidden" name="id" value={offerte.id} />
                        {offerte.status === "gekozen" ? (
                          <BevestigKnop vraag="Deze offerte niet meer kiezen?" className="stil">
                            Niet meer kiezen
                          </BevestigKnop>
                        ) : (
                          <button type="submit">Kiezen</button>
                        )}
                        <Link className="knop stil" href={`${pagina}?offerte=${offerte.id}#offerte`}>
                          Wijzigen
                        </Link>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {offertes.length > 0 ? (
        <p className="hulp">
          Kies je een offerte, dan worden de andere afgewezen en komt het in het{" "}
          <Link href={huispad(huis.id, "/beslissingen")}>beslissingslog</Link>.
        </p>
      ) : null}

      {teWijzigen ? (
        <section id="offerte" className="kaart">
          <h3 style={{ marginTop: 0 }}>Offerte van {partijnaam(teWijzigen.partij_id) ?? euroBedrag(teWijzigen.bedrag)}</h3>
          <form action={wijzigOfferteActie.bind(null, huis.id)}>
            <input type="hidden" name="id" value={teWijzigen.id} />
            <Offertevelden huisId={huis.id} offerte={teWijzigen} partijen={partijen} voorvoegsel="wijzig" />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop vraag="Deze offerte verwijderen, met haar PDF?" formAction={verwijderOfferteActie.bind(null, huis.id)}>
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href={pagina}>
                Sluiten
              </Link>
            </div>
          </form>
          <form action={zetDocumentActie.bind(null, huis.id)} style={{ marginTop: 16 }}>
            <input type="hidden" name="soort" value="offerte" />
            <input type="hidden" name="id" value={teWijzigen.id} />
            <input type="hidden" name="terug" value={pagina} />
            <div className="veldenrij">
              <Documentveld
                huisId={huis.id}
                id="wijzig-pdf"
                label={teWijzigen.bestand_id ? "Een andere PDF" : "PDF van de offerte"}
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

      <h3>Offerte toevoegen</h3>
      <form action={voegOfferteToeActie.bind(null, huis.id)} className="kaart">
        <input type="hidden" name="post_id" value={post.id} />
        <Offertevelden huisId={huis.id} partijen={partijen} voorvoegsel="nieuw" metDocument />
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      <h2>Meer- en minwerken</h2>
      {meerwerken.length === 0 ? (
        <p className="hulp">Nog geen. Een meer- of minwerk telt pas mee als het aanvaard is.</p>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Wat</th>
                <th className="getal">Bedrag</th>
                <th>Stand</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {meerwerken.map((meerwerk) => (
                <tr key={meerwerk.id}>
                  <td data-label="Datum">{korteDatum(meerwerk.datum, nu)}</td>
                  <td data-label="Wat">{meerwerk.omschrijving}</td>
                  <td data-label="Bedrag" className="getal">
                    {meerprijsTekst(meerwerk.bedrag)}
                  </td>
                  <td data-label="Stand">
                    <span
                      className={
                        meerwerk.status === "aanvaard" ? "label-vlag goed" : meerwerk.status === "geweigerd" ? "hulp" : "label-vlag let-op"
                      }
                    >
                      {MEERWERKSTATUS[meerwerk.status]}
                    </span>
                  </td>
                  <td>
                    <form action={zetMeerwerkActie.bind(null, huis.id)} className="knoppenrij">
                      {/* Niet "id": een veld met die naam overschaduwt form.id, en dan
                          stuurt React de waarde van de aangeklikte knop niet mee. */}
                      <input type="hidden" name="meerwerk_id" value={meerwerk.id} />
                      <input type="hidden" name="post_id" value={post.id} />
                      {meerwerk.status === "voorgesteld" ? (
                        <>
                          <button type="submit" name="status" value="aanvaard">
                            Aanvaarden
                          </button>
                          <button type="submit" name="status" value="geweigerd" className="stil">
                            Weigeren
                          </button>
                        </>
                      ) : (
                        <button type="submit" name="status" value="voorgesteld" className="stil">
                          Terug naar voorgesteld
                        </button>
                      )}
                      <button
                        type="submit"
                        name="status"
                        value="weg"
                        className="stil"
                        formNoValidate
                        title="Verwijderen"
                        aria-label={`${meerwerk.omschrijving} verwijderen`}
                      >
                        ✕
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={voegMeerwerkToeActie.bind(null, huis.id)} className="kaart" style={{ marginTop: 12 }}>
        <input type="hidden" name="post_id" value={post.id} />
        <div className="veldenrij">
          <div>
            <label htmlFor="meerwerk-omschrijving">Wat</label>
            <input id="meerwerk-omschrijving" name="omschrijving" required placeholder="Extra stopcontacten in de garage" />
          </div>
          <div>
            <label htmlFor="meerwerk-bedrag">Bedrag (€, incl. btw)</label>
            <input id="meerwerk-bedrag" name="bedrag" inputMode="decimal" required placeholder="450" />
          </div>
          <div>
            <label htmlFor="meerwerk-soort">Soort</label>
            <select id="meerwerk-soort" name="soort" defaultValue="meer">
              <option value="meer">meerwerk (duurder)</option>
              <option value="min">minwerk (goedkoper)</option>
            </select>
          </div>
          <div>
            <label htmlFor="meerwerk-datum">Datum</label>
            <input id="meerwerk-datum" name="datum" type="date" defaultValue={nu} />
          </div>
        </div>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      <h2>Facturen</h2>
      {facturen.length === 0 ? (
        <p className="hulp">Nog geen facturen voor deze post.</p>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Factuur</th>
                <th className="getal">Bedrag</th>
                <th>Vervalt</th>
                <th>PDF</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {facturen.map((factuur) => (
                <tr key={factuur.id}>
                  <td data-label="Datum">{korteDatum(factuur.factuurdatum, nu)}</td>
                  <td data-label="Factuur">
                    {factuur.nummer ?? "—"}
                    {factuur.omschrijving ? <div className="hulp">{factuur.omschrijving}</div> : null}
                  </td>
                  <td data-label="Bedrag" className="getal">
                    {euroBedrag(factuur.bedrag)}
                  </td>
                  <td data-label="Vervalt">
                    {factuur.bedrag > 0 ? `${korteDatum(vervaldagVan(factuur), nu)} ` : null}
                    <Factuurlabel factuur={factuur} vandaag={nu} />
                  </td>
                  <td data-label="PDF">
                    <Pdflink huisId={huis.id} bestandId={factuur.bestand_id} />
                  </td>
                  <td>
                    <form action={betaalActie.bind(null, huis.id)} className="knoppenrij">
                      <input type="hidden" name="id" value={factuur.id} />
                      <input type="hidden" name="terug" value={pagina} />
                      <button type="submit" className={factuur.betaald_op ? "stil" : undefined}>
                        {factuur.betaald_op ? "Toch niet betaald" : factuur.bedrag < 0 ? "Verrekend" : "Betaald"}
                      </button>
                      <Link className="knop stil" href={huispad(huis.id, `/geld/facturen?factuur=${factuur.id}#factuur`)}>
                        Wijzigen
                      </Link>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Factuur toevoegen</h3>
      <form action={voegFactuurToeActie.bind(null, huis.id)} className="kaart">
        <input type="hidden" name="terug" value={pagina} />
        <Factuurvelden
          huisId={huis.id}
          posten={[post]}
          partijen={partijen}
          vennootschappen={vennootschappen}
          voorvoegsel="factuur"
          vastePost={{ ...post, partij_id: post.partij_id ?? stand.gekozen?.partij_id ?? null }}
        />
        <p className="hulp">Zonder vervaldag rekent de app 30 dagen na de factuurdatum.</p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      <h2>Post</h2>
      <details className="kaart">
        <summary>Naam, categorie, raming en taak wijzigen</summary>
        <form action={wijzigPostActie.bind(null, huis.id)} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={post.id} />
          <Postvelden post={post} partijen={partijen} planning={planning} voorvoegsel="post" />
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Bewaren</button>
            <BevestigKnop
              vraag={`${post.naam} verwijderen, met de offertes en meerwerken?`}
              formAction={verwijderPostActie.bind(null, huis.id)}
            >
              Post verwijderen
            </BevestigKnop>
          </div>
        </form>
      </details>
    </>
  );
}
