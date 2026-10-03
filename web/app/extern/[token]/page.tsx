import { Wenstabel } from "@/components/bouw/wenstabel";
import { Tijdlijn } from "@/components/bouw/tijdlijn";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { euroBedrag } from "@/lib/bouw/geld";
import { betaaldOpVan } from "@/lib/bouw/geld-opslag";
import { leesHuis } from "@/lib/bouw/huizen";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import { CATEGORIENAMEN_KEUZE } from "@/lib/bouw/keuzes";
import { lijstInzendingen, leesLink, type Inzending } from "@/lib/bouw/links";
import { leesBestanden, lijstGebouwen, lijstPartijen, lijstPlannen } from "@/lib/bouw/opslag";
import { lijstKeuzes, lijstOpties, lijstPlanning } from "@/lib/bouw/regie-opslag";
import { PLANNAMEN, type Huis } from "@/lib/bouw/types";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { sorteerPlannen } from "@/lib/bouw/weergave";
import { STATUSNAMEN_OPLEVERPUNT, RONDENAMEN } from "@/lib/bouw/werf";
import { fotoUrls, laadPlaatsen, ruimtenaamIn } from "@/lib/bouw/werf-laden";
import { lijstOpleverpunten, lijstWerffotos } from "@/lib/bouw/werf-opslag";
import { datum, datumTijd } from "@/lib/format";

import { Melding } from "@/components/bouw/melding";

import { meldHersteldActie } from "./acties";
import { GeldInzenden } from "./geld-inzenden";
import { Inzenden } from "./inzenden";

export const dynamic = "force-dynamic";

const INZENDSTATUS = { nieuw: "ontvangen", verwerkt: "ingelezen", genegeerd: "niet gebruikt" } as const;

/**
 * Wat een partij via haar persoonlijke link ziet: enkel wat die link mag, en
 * enkel van het huis van haar partij. Geen prijzen, geen adres, geen
 * opmerkingen uit de planning, geen beslissingslog in vrije tekst.
 */
export default async function Externepagina({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const [{ token }, { melding, soort }] = await Promise.all([params, searchParams]);
  const externe = await leesLink(token).catch(() => null);
  // leesLink las het huis al; React onthoudt het voor deze weergave.
  const huis = externe ? await leesHuis(externe.huisId).catch(() => null) : null;
  if (!externe || !huis) {
    return (
      <>
        <h1>Deze link werkt niet</h1>
        <div className="kaart">
          <p>Deze link is verlopen, ingetrokken of onvolledig. Vraag een nieuwe aan bij wie hem stuurde.</p>
        </div>
      </>
    );
  }

  const mag = (recht: (typeof externe.rechten)[number]) => externe.rechten.includes(recht);
  const partijen = await lijstPartijen(huis.id);
  const partijnamen = new Map(partijen.map((partij) => [partij.id, partij.naam]));
  const nu = vandaag();

  return (
    <>
      <h1>{externe.projectnaam ?? "Ons bouwproject"}</h1>
      <p className="inleiding">
        Welkom, {externe.partijnaam}. Deze persoonlijke link werkt tot {datum(externe.vervaltOp)}. Deel hem niet: wie
        hem heeft, ziet wat jij hier ziet.
      </p>

      <Melding soort={soort} melding={melding} />

      {mag("oplevering") ? <Oplevering huisId={huis.id} token={token} partijId={externe.partijId} /> : null}
      {mag("inzenden") ? <Insturen huisId={huis.id} token={token} linkId={externe.linkId} /> : null}
      {mag("offertes") || mag("facturen") ? (
        <GeldInsturen
          huisId={huis.id}
          token={token}
          linkId={externe.linkId}
          soorten={[...(mag("offertes") ? (["offerte"] as const) : []), ...(mag("facturen") ? (["factuur"] as const) : [])]}
          vandaag={nu}
        />
      ) : null}
      {mag("plannen") ? <Plannen huisId={huis.id} token={token} /> : null}
      {mag("keuzes") ? <Keuzes huisId={huis.id} partijnamen={partijnamen} /> : null}
      {mag("planning") ? <Planning huisId={huis.id} partijnamen={partijnamen} vandaag={nu} /> : null}
      {mag("wensenlijst") ? <Wensenlijst huis={huis} token={token} /> : null}
    </>
  );
}

async function Insturen({ huisId, token, linkId }: { huisId: number; token: string; linkId: number }) {
  const eerder = await lijstInzendingen(huisId, { linkId, soorten: ["plan"] });
  const bestanden = new Map(
    (await leesBestanden(huisId, eerder.map((inzending) => inzending.bestand_id))).map((b) => [b.id, b]),
  );
  return (
    <section>
      <h2>Insturen</h2>
      <p className="hulp">
        Een nieuw dossier of een plan, als PDF tot 50 MB. Het komt bij ons binnen; wij lezen het in.
      </p>
      <Inzenden token={token} />
      {eerder.length > 0 ? (
        <ul className="wijzigingen">
          {eerder.map((inzending) => {
            const bestand = bestanden.get(inzending.bestand_id);
            return (
              <li key={inzending.id}>
                {datumTijd(inzending.created_at)}: {bestand?.oorspronkelijke_naam ?? "bestand"}
                {bestand?.grootte_bytes ? ` (${leesbareGrootte(bestand.grootte_bytes)})` : ""}
                <span className="hulp"> · {INZENDSTATUS[inzending.status]}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** Wat de partij over haar eigen offertes en facturen te zien krijgt: aangekomen, ingeboekt, betaald. Niet of een offerte gekozen werd. */
function geldstand(inzending: Inzending, betaald: Map<number, string | null>): string {
  if (inzending.status === "nieuw") return "ontvangen";
  if (inzending.status === "genegeerd") return "niet gebruikt";
  const betaaldOp = inzending.factuur_id ? betaald.get(inzending.factuur_id) : null;
  return betaaldOp ? `betaald op ${datum(betaaldOp)}` : "ingeboekt";
}

async function GeldInsturen({
  huisId,
  token,
  linkId,
  soorten,
  vandaag: nu,
}: {
  huisId: number;
  token: string;
  linkId: number;
  soorten: ("offerte" | "factuur")[];
  vandaag: string;
}) {
  const eerder = await lijstInzendingen(huisId, { linkId, soorten: ["offerte", "factuur"] });
  const betaald = await betaaldOpVan(
    huisId,
    eerder.flatMap((inzending) => (inzending.factuur_id ? [inzending.factuur_id] : [])),
  );
  const welke = soorten.length === 2 ? "Een offerte of factuur" : soorten[0] === "offerte" ? "Een offerte" : "Een factuur";
  return (
    <section>
      <h2>{soorten.length === 2 ? "Offertes en facturen" : soorten[0] === "offerte" ? "Offertes" : "Facturen"}</h2>
      <p className="hulp">
        {welke} als PDF tot 20 MB, met het bedrag inclusief btw. Het komt bij ons binnen; wij boeken het in.
        {soorten.includes("factuur") ? " Zonder vervaldag rekenen we 30 dagen na de factuurdatum." : ""}
      </p>
      <GeldInzenden token={token} soorten={soorten} vandaag={nu} />
      {eerder.length > 0 ? (
        <ul className="wijzigingen">
          {eerder.map((inzending) => (
            <li key={inzending.id}>
              {datumTijd(inzending.created_at)}: {inzending.soort === "offerte" ? "offerte" : `factuur${inzending.nummer ? ` ${inzending.nummer}` : ""}`}
              {inzending.bedrag !== null ? ` van ${euroBedrag(inzending.bedrag)}` : ""}
              <span className="hulp"> · {geldstand(inzending, betaald)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * De opleverpunten van deze partij, met hun foto's: wat nog te herstellen is,
 * wat wij nog moeten nakijken, en wat in orde is. Niets van andere partijen.
 */
async function Oplevering({ huisId, token, partijId }: { huisId: number; token: string; partijId: number }) {
  const [punten, plaatsen] = await Promise.all([lijstOpleverpunten(huisId, { partijId }), laadPlaatsen(huisId)]);
  if (punten.length === 0) return null;
  const fotos = await lijstWerffotos(huisId, { opleverpuntIds: punten.map((punt) => punt.id) });
  const [klein, groot] = await Promise.all([fotoUrls(huisId, fotos), fotoUrls(huisId, fotos, true)]);
  const ruimtenaam = ruimtenaamIn(plaatsen);
  const teDoen = punten.filter((punt) => punt.status === "open" || punt.status === "gemeld");
  const nakijken = punten.filter((punt) => punt.status === "hersteld");
  const inOrde = punten.filter((punt) => punt.status === "gecontroleerd");
  const actie = meldHersteldActie.bind(null, token);

  const Fotos = ({ puntId }: { puntId: number }) => {
    const eigen = fotos.filter((foto) => foto.opleverpunt_id === puntId);
    if (eigen.length === 0) return null;
    return (
      <ul className="galerij">
        {eigen.map((foto) => (
          <li key={foto.id}>
            <a href={groot.get(foto.id) ?? klein.get(foto.id)} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={klein.get(foto.id)} alt={foto.onderschrift ?? "Foto van het punt"} loading="lazy" />
            </a>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section id="oplevering">
      <h2>Opleverpunten</h2>
      <p className="hulp">
        Wat nog hersteld moet worden. Meld het als het in orde is; wij kijken het daarna na.
      </p>
      {teDoen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Niets meer te herstellen. Dank je!</p>
        </div>
      ) : (
        <ol className="opleverpunten">
          {teDoen.map((punt) => (
            <li key={punt.id} className="kaart">
              <strong>{punt.titel}</strong>
              <p className="hulp">{[ruimtenaam(punt.ruimte_id), RONDENAMEN[punt.ronde]].filter(Boolean).join(" · ")}</p>
              {punt.omschrijving ? <p>{punt.omschrijving}</p> : null}
              {punt.herstelopmerking ? <p className="hulp">&quot;{punt.herstelopmerking}&quot;</p> : null}
              <Fotos puntId={punt.id} />
              <form action={actie} className="knoppenrij" style={{ marginTop: 8 }}>
                <input type="hidden" name="punt_id" value={punt.id} />
                <input name="opmerking" aria-label="Wat heb je gedaan" placeholder="Wat heb je gedaan? (mag leeg)" maxLength={1000} />
                <button type="submit">Hersteld</button>
              </form>
            </li>
          ))}
        </ol>
      )}
      {nakijken.length > 0 ? (
        <>
          <h3>Wij kijken het na</h3>
          <ul className="wijzigingen">
            {nakijken.map((punt) => (
              <li key={punt.id}>
                {punt.titel}
                {punt.hersteld_op ? <span className="hulp"> · hersteld gemeld {datumTijd(punt.hersteld_op)}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {inOrde.length > 0 ? (
        <details>
          <summary className="hulp">
            {STATUSNAMEN_OPLEVERPUNT.gecontroleerd}: {inOrde.length}
          </summary>
          <ul className="wijzigingen">
            {inOrde.map((punt) => (
              <li key={punt.id}>{punt.titel}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

async function Plannen({ huisId, token }: { huisId: number; token: string }) {
  const [plannen, gebouwen] = await Promise.all([lijstPlannen(huisId), lijstGebouwen(huisId)]);
  const metVersie = sorteerPlannen(
    plannen.filter((plan) => plan.versies.length > 0),
    gebouwen,
  );
  // Elk opgeladen bestand is een dossier met één of meer bladen.
  const dossiers = new Map<number, { labels: Set<string>; datum: string | null; bladen: number }>();
  for (const plan of metVersie) {
    for (const versie of plan.versies) {
      const dossier = dossiers.get(versie.bestand_id) ?? { labels: new Set<string>(), datum: null, bladen: 0 };
      dossier.labels.add(versie.label);
      dossier.datum = dossier.datum ?? versie.datum;
      dossier.bladen++;
      dossiers.set(versie.bestand_id, dossier);
    }
  }
  const gebouwnaam = (gebouwId: number | null) => gebouwen.find((gebouw) => gebouw.id === gebouwId)?.naam ?? "Hele project";

  return (
    <section>
      <h2>Plannen</h2>
      {metVersie.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen plannen.</p>
        </div>
      ) : (
        <>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Gebouw</th>
                  <th>Laatste versie</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {metVersie.map((plan) => {
                  const laatste = plan.versies.at(-1)!;
                  return (
                    <tr key={plan.id}>
                      <td data-label="Plan">
                        {plan.titel}
                        <div className="hulp">{PLANNAMEN[plan.soort]}</div>
                      </td>
                      <td data-label="Gebouw">{gebouwnaam(plan.gebouw_id)}</td>
                      <td data-label="Laatste versie">
                        {laatste.label}
                        {laatste.datum ? <span className="hulp"> · {datum(laatste.datum)}</span> : null}
                      </td>
                      <td>
                        <a href={`/extern/${token}/bestand/${laatste.bestand_id}`} target="_blank" rel="noreferrer">
                          Openen
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hulp">
            Openen toont het hele dossier waar dat blad in zit
            {dossiers.size > 1 ? ` (${dossiers.size} dossiers in totaal)` : ""}.
          </p>
        </>
      )}
    </section>
  );
}

async function Keuzes({ huisId, partijnamen }: { huisId: number; partijnamen: Map<number, string> }) {
  const [keuzes, opties] = await Promise.all([lijstKeuzes(huisId), lijstOpties(huisId)]);
  const beslist = keuzes.filter((keuze) => keuze.gekozen_optie_id !== null);
  const open = keuzes.filter((keuze) => keuze.gekozen_optie_id === null);
  return (
    <section>
      <h2>Keuzes</h2>
      {beslist.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog niets definitief gekozen.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Wat</th>
                <th>Gekozen</th>
                <th>Leverancier</th>
              </tr>
            </thead>
            <tbody>
              {beslist.map((keuze) => {
                const optie = opties.find((o) => o.id === keuze.gekozen_optie_id);
                return (
                  <tr key={keuze.id}>
                    <td data-label="Wat">
                      {keuze.titel}
                      <div className="hulp">{CATEGORIENAMEN_KEUZE[keuze.categorie]}</div>
                    </td>
                    <td data-label="Gekozen">
                      {optie?.kleur ? <span className="kleurbolletje" style={{ background: optie.kleur }} aria-hidden="true" /> : null}
                      {optie?.naam ?? "—"}
                    </td>
                    <td data-label="Leverancier">{optie?.leverancier_id ? (partijnamen.get(optie.leverancier_id) ?? "—") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open.length > 0 ? (
        <p className="hulp">Nog te kiezen: {open.map((keuze) => keuze.titel).join(", ")}.</p>
      ) : null}
    </section>
  );
}

async function Planning({
  huisId,
  partijnamen,
  vandaag: nu,
}: {
  huisId: number;
  partijnamen: Map<number, string>;
  vandaag: string;
}) {
  const planning = await lijstPlanning(huisId);
  return (
    <section>
      <h2>Planning</h2>
      {planning.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen planning.</p>
        </div>
      ) : (
        <>
          <Tijdlijn
            items={planning.map((item) => ({ ...item, opmerking: null }))}
            partijnamen={partijnamen}
            deadlines={[]}
            vandaag={nu}
          />
          <p className="hulp">Vandaag is {korteDatum(nu)}: de rode stippellijn.</p>
        </>
      )}
    </section>
  );
}

async function Wensenlijst({ huis, token }: { huis: Huis; token: string }) {
  const { lijst } = await laadWensenlijst(huis);
  return (
    <section>
      <h2>Wensenlijst elektriciteit en domotica</h2>
      {lijst.aantal === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen punten.</p>
        </div>
      ) : (
        <>
          <div className="knoppenrij" style={{ marginBottom: 12 }}>
            <a className="knop" href={`/extern/${token}/wensenlijst/pdf`}>
              PDF downloaden
            </a>
            <a className="knop stil" href={`/extern/${token}/wensenlijst/excel`}>
              Excel downloaden
            </a>
          </div>
          <Wenstabel lijst={lijst} metVerdieping />
        </>
      )}
    </section>
  );
}
