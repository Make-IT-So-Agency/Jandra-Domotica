import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { leesBouwstand } from "@/lib/bouw/opslag";
import { takenVoorBouw } from "@/lib/bouw/taken";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { bewaarProjectActie } from "./acties";
import { Melding } from "./melding";

export const dynamic = "force-dynamic";

export default async function Bouwoverzicht({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let stand;
  try {
    stand = await leesBouwstand();
  } catch (fout) {
    return (
      <>
        <h1>Bouw</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const taken = takenVoorBouw({
    projectnaam: stand.project.projectnaam,
    verdiepingen: stand.verdiepingen,
    plannen: stand.plannen,
    partijen: stand.partijen,
  });
  const versies = stand.plannen.reduce((som, plan) => som + plan.versies, 0);

  return (
    <>
      <h1>{stand.project.projectnaam ?? "Bouw"}</h1>
      <p className="inleiding">
        Ons bouwproject: de plannen van de architect, de verdiepingen en iedereen met wie we te
        maken hebben. Hier komt later ook het omzetten van de plannen naar een digitaal plan bij.
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
          <div className="label">Verdiepingen</div>
          <div className="waarde">{stand.verdiepingen}</div>
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
