import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { dagMetWeekdag, dagenTekst, dagenTussen, vandaag } from "@/lib/bouw/kalender";
import { openDeadlines } from "@/lib/bouw/keuzes";
import { leesBouwstand } from "@/lib/bouw/opslag";
import { tweeWeken } from "@/lib/bouw/planning";
import { lijstKeuzes, lijstPlanning } from "@/lib/bouw/regie-opslag";
import { takenVoorBouw } from "@/lib/bouw/taken";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { bewaarProjectActie } from "./acties";
import { Melding } from "./melding";

export const dynamic = "force-dynamic";

const WEEKSOORTEN = { loopt: "loopt nog:", begint: "begint:", eindigt: "eindigt:", mijlpaal: "◆", deadline: "beslissen:" } as const;

export default async function Bouwoverzicht({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let stand;
  let keuzes;
  let planning;
  try {
    [stand, keuzes, planning] = await Promise.all([leesBouwstand(), lijstKeuzes(), lijstPlanning()]);
  } catch (fout) {
    return (
      <>
        <h1>Bouw</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const deadlines = openDeadlines(keuzes, planning, nu);
  const taken = takenVoorBouw({
    projectnaam: stand.project.projectnaam,
    verdiepingen: stand.verdiepingen,
    plannen: stand.plannen,
    partijen: stand.partijen,
    deadlines: deadlines.map(({ keuze, dagen }) => ({ keuzeId: keuze.id, titel: keuze.titel, dagen })),
  });
  const versies = stand.plannen.reduce((som, plan) => som + plan.versies, 0);
  const beslist = keuzes.filter((keuze) => keuze.gekozen_optie_id !== null).length;
  const mijlpaal = planning.find((item) => item.soort === "mijlpaal" && item.begindatum >= nu && item.status !== "klaar");
  const week = tweeWeken(
    planning,
    deadlines.map(({ keuze, deadline }) => ({ titel: keuze.titel, datum: deadline.datum })),
    nu,
  );

  return (
    <>
      <h1>{stand.project.projectnaam ?? "Bouw"}</h1>
      <p className="inleiding">
        Ons bouwproject: de plannen van de architect, omgezet naar ruimtes per verdieping, de keuzes en de
        planning, en iedereen met wie we te maken hebben.
      </p>

      <Melding soort={soort} melding={melding} />

      {taken.length > 0 ? (
        <div className="melding let-op">
          <p>
            <strong>Nog te doen</strong>
          </p>
          <ul>
            {taken.map((taak) => (
              <li key={taak.link + taak.tekst}>
                {taak.tekst} <Link href={taak.link}>{taak.knop}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tegels">
        <div className="tegel">
          <div className="label">Plannen</div>
          <div className="waarde">{stand.plannen.length}</div>
          <div className="bij">{versies === 1 ? "1 versie" : `${versies} versies`}</div>
        </div>
        <div className="tegel">
          <div className="label">Ruimtes</div>
          <div className="waarde">{stand.ruimtes.aantal}</div>
          <div className="bij">
            {stand.ruimtes.aantal > 0
              ? `samen ${stand.ruimtes.oppervlakte.toFixed(1).replace(".", ",")} m² netto`
              : `${stand.verdiepingen} ${stand.verdiepingen === 1 ? "verdieping" : "verdiepingen"}`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Keuzes</div>
          <div className="waarde">{keuzes.length - beslist}</div>
          <div className="bij">
            {keuzes.length === 0 ? "nog geen" : `te beslissen, ${beslist} beslist`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Planning</div>
          <div className="waarde">{mijlpaal ? dagenTekst(dagenTussen(nu, mijlpaal.begindatum)) : "—"}</div>
          <div className="bij">{mijlpaal ? mijlpaal.titel : planning.length === 0 ? "nog geen planning" : "geen mijlpaal meer"}</div>
        </div>
        <div className="tegel">
          <div className="label">Partijen</div>
          <div className="waarde">{stand.partijen.length}</div>
        </div>
        <div className="tegel">
          <div className="label">Opslag</div>
          <div className="waarde">{stand.bytes > 0 ? leesbareGrootte(stand.bytes) : "0 MB"}</div>
          {/* Het gratis niveau van Supabase, zie docs/UITROL.md. */}
          <div className="bij">van 1 GB</div>
        </div>
      </div>

      {week.regels.length > 0 ? (
        <>
          <h2>Deze en volgende week</h2>
          <div className="kaart">
            <ul className="weeklijst">
              {week.regels.map((regel) => (
                <li key={`${regel.datum}-${regel.soort}-${regel.tekst}`}>
                  <span className="hulp">{dagMetWeekdag(regel.datum)}</span> {WEEKSOORTEN[regel.soort]} {regel.tekst}
                </li>
              ))}
            </ul>
            <p className="hulp" style={{ marginTop: 8 }}>
              <Link href="/bouw/planning">Naar de planning</Link>
            </p>
          </div>
        </>
      ) : null}

      <h2 id="project">Project</h2>
      <form action={bewaarProjectActie} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="projectnaam">Naam</label>
            <input
              id="projectnaam"
              name="projectnaam"
              defaultValue={stand.project.projectnaam ?? ""}
              placeholder="Ons nieuwe huis"
            />
          </div>
          <div>
            <label htmlFor="adres">Adres</label>
            <input id="adres" name="adres" defaultValue={stand.project.adres ?? ""} />
          </div>
        </div>
        <p className="hulp">
          Naam en adres staan enkel in de databank, nooit in de code: de repository is publiek.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Bewaren</button>
        </div>
      </form>
    </>
  );
}
