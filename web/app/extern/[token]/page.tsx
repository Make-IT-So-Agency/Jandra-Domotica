import { Wenstabel } from "@/app/bouw/punten/wenstabel";
import { Tijdlijn } from "@/app/bouw/planning/tijdlijn";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { euroBedrag } from "@/lib/bouw/geld";
import { betaaldOpVan } from "@/lib/bouw/geld-opslag";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import { CATEGORIENAMEN_KEUZE } from "@/lib/bouw/keuzes";
import { lijstInzendingen, leesLink, type Inzending } from "@/lib/bouw/links";
import { leesBestanden, leesProject, lijstGebouwen, lijstPartijen, lijstPlannen } from "@/lib/bouw/opslag";
import { lijstKeuzes, lijstOpties, lijstPlanning } from "@/lib/bouw/regie-opslag";
import { PLANNAMEN } from "@/lib/bouw/types";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { sorteerPlannen } from "@/lib/bouw/weergave";
import { datum, datumTijd } from "@/lib/format";

import { GeldInzenden } from "./geld-inzenden";
import { Inzenden } from "./inzenden";

export const dynamic = "force-dynamic";

const INZENDSTATUS = { nieuw: "ontvangen", verwerkt: "ingelezen", genegeerd: "niet gebruikt" } as const;

/**
 * Wat een partij via haar persoonlijke link ziet: enkel wat die link mag. Geen
 * prijzen, geen adres, geen opmerkingen uit de planning, geen beslissingslog
 * in vrije tekst.
 */
export default async function Externepagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const externe = await leesLink(token).catch(() => null);
  if (!externe) {
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
  const [project, partijen] = await Promise.all([leesProject(), lijstPartijen()]);
  const partijnamen = new Map(partijen.map((partij) => [partij.id, partij.naam]));
  const nu = vandaag();

  return (
    <>
      <h1>{project.projectnaam ?? "Ons bouwproject"}</h1>
      <p className="inleiding">
        Welkom, {externe.partijnaam}. Deze persoonlijke link werkt tot {datum(externe.vervaltOp)}. Deel hem niet: wie
        hem heeft, ziet wat jij hier ziet.
      </p>

      {mag("inzenden") ? <Insturen token={token} linkId={externe.linkId} /> : null}
      {mag("offertes") || mag("facturen") ? (
        <GeldInsturen
          token={token}
          linkId={externe.linkId}
          soorten={[...(mag("offertes") ? (["offerte"] as const) : []), ...(mag("facturen") ? (["factuur"] as const) : [])]}
          vandaag={nu}
        />
      ) : null}
      {mag("plannen") ? <Plannen token={token} /> : null}
      {mag("keuzes") ? <Keuzes partijnamen={partijnamen} /> : null}
      {mag("planning") ? <Planning partijnamen={partijnamen} vandaag={nu} /> : null}
      {mag("wensenlijst") ? <Wensenlijst token={token} /> : null}
    </>
  );
}

async function Insturen({ token, linkId }: { token: string; linkId: number }) {
  const eerder = await lijstInzendingen({ linkId, soorten: ["plan"] });
  const bestanden = new Map((await leesBestanden(eerder.map((inzending) => inzending.bestand_id))).map((b) => [b.id, b]));
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
  token,
  linkId,
  soorten,
  vandaag: nu,
}: {
  token: string;
  linkId: number;
  soorten: ("offerte" | "factuur")[];
  vandaag: string;
}) {
  const eerder = await lijstInzendingen({ linkId, soorten: ["offerte", "factuur"] });
  const betaald = await betaaldOpVan(eerder.flatMap((inzending) => (inzending.factuur_id ? [inzending.factuur_id] : [])));
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

async function Plannen({ token }: { token: string }) {
  const [plannen, gebouwen] = await Promise.all([lijstPlannen(), lijstGebouwen()]);
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

async function Keuzes({ partijnamen }: { partijnamen: Map<number, string> }) {
  const [keuzes, opties] = await Promise.all([lijstKeuzes(), lijstOpties()]);
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

async function Planning({ partijnamen, vandaag: nu }: { partijnamen: Map<number, string>; vandaag: string }) {
  const planning = await lijstPlanning();
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
            alleenLezen
          />
          <p className="hulp">Vandaag is {korteDatum(nu)}: de rode stippellijn.</p>
        </>
      )}
    </section>
  );
}

async function Wensenlijst({ token }: { token: string }) {
  const { lijst } = await laadWensenlijst();
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
