import { GeenToegang } from "@/components/geen-toegang";
import { lijstGebouwen, lijstVerdiepingen } from "@/lib/bouw/opslag";
import type { Gebouw, Verdieping } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Melding } from "../melding";
import {
  verwijderGebouwActie,
  verwijderVerdiepingActie,
  voegVerdiepingToeActie,
  wijzigGebouwActie,
  wijzigVerdiepingActie,
} from "./acties";

export const dynamic = "force-dynamic";

/** Een getal in een invulveld, met een komma zoals iedereen het intikt. */
function veld(waarde: number | null): string {
  return waarde === null ? "" : String(waarde).replace(".", ",");
}

const GEBOUWLIJST = "gebouwnamen";

function Velden({
  verdieping,
  gebouw,
  voorvoegsel,
}: {
  verdieping?: Verdieping;
  gebouw: string;
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-naam`}>Naam</label>
          <input
            id={`${voorvoegsel}-naam`}
            name="naam"
            defaultValue={verdieping?.naam ?? ""}
            placeholder="Gelijkvloers"
            required
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-gebouw`}>Gebouw</label>
          <input
            id={`${voorvoegsel}-gebouw`}
            name="gebouw"
            list={GEBOUWLIJST}
            defaultValue={gebouw}
            placeholder="Woning"
            maxLength={60}
            required
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-volgorde`}>Volgorde</label>
          <input
            id={`${voorvoegsel}-volgorde`}
            name="volgorde"
            inputMode="numeric"
            defaultValue={veld(verdieping?.volgorde ?? null)}
            placeholder="0"
          />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-peil`}>Vloerpeil (m)</label>
          <input
            id={`${voorvoegsel}-peil`}
            name="vloerpeil_m"
            inputMode="decimal"
            defaultValue={veld(verdieping?.vloerpeil_m ?? null)}
            placeholder="0,00"
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-hoogte`}>Verdiepingshoogte (m)</label>
          <input
            id={`${voorvoegsel}-hoogte`}
            name="verdiepingshoogte_m"
            inputMode="decimal"
            defaultValue={veld(verdieping?.verdiepingshoogte_m ?? null)}
            placeholder="2,95"
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-plafond`}>Plafondhoogte (m)</label>
          <input
            id={`${voorvoegsel}-plafond`}
            name="plafondhoogte_m"
            inputMode="decimal"
            defaultValue={veld(verdieping?.plafondhoogte_m ?? null)}
            placeholder="2,60"
          />
        </div>
      </div>
    </>
  );
}

function Gebouwbeheer({ gebouw, leeg }: { gebouw: Gebouw; leeg: boolean }) {
  return (
    <details className="kaart">
      <summary>
        <strong>{gebouw.naam} wijzigen</strong>
      </summary>
      <form action={wijzigGebouwActie} style={{ marginTop: 14 }}>
        <input type="hidden" name="id" value={gebouw.id} />
        <div className="veldenrij">
          <div>
            <label htmlFor={`g${gebouw.id}-naam`}>Naam van het gebouw</label>
            <input id={`g${gebouw.id}-naam`} name="naam" defaultValue={gebouw.naam} maxLength={60} required />
          </div>
          <div>
            <label htmlFor={`g${gebouw.id}-volgorde`}>Volgorde</label>
            <input
              id={`g${gebouw.id}-volgorde`}
              name="volgorde"
              inputMode="numeric"
              defaultValue={veld(gebouw.volgorde)}
            />
          </div>
        </div>
        <div className="knoppenrij">
          <button type="submit">Bewaren</button>
          {leeg ? (
            <BevestigKnop vraag={`${gebouw.naam} verwijderen?`} formAction={verwijderGebouwActie}>
              Gebouw verwijderen
            </BevestigKnop>
          ) : null}
        </div>
      </form>
    </details>
  );
}

export default async function Verdiepingenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let verdiepingen: Verdieping[];
  let gebouwen: Gebouw[];
  try {
    [verdiepingen, gebouwen] = await Promise.all([lijstVerdiepingen(), lijstGebouwen()]);
  } catch (fout) {
    return (
      <>
        <h1>Verdiepingen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  return (
    <>
      <h1>Verdiepingen</h1>
      <p className="inleiding">
        Elk grondplan hoort bij een verdieping, en elke verdieping bij een gebouw: de woning, een
        bijgebouw. Het peil is de hoogte van de afgewerkte vloer tegenover het nulpunt van de
        architect; de hoogtes dienen later voor het 3D-model. Het dossier inlezen bij{" "}
        <a href="/bouw/plannen">Plannen</a> vult ze in uit de plannen.
      </p>

      <Melding soort={soort} melding={melding} />

      <datalist id={GEBOUWLIJST}>
        {gebouwen.map((gebouw) => (
          <option key={gebouw.id} value={gebouw.naam} />
        ))}
      </datalist>

      {gebouwen.map((gebouw) => {
        const eigen = verdiepingen.filter((verdieping) => verdieping.gebouw_id === gebouw.id);
        return (
          <section key={gebouw.id} aria-label={gebouw.naam}>
            <h2>{gebouw.naam}</h2>
            {eigen.length === 0 ? (
              <div className="kaart">
                <p className="leeg">Nog geen verdiepingen in {gebouw.naam.toLowerCase()}.</p>
              </div>
            ) : (
              eigen.map((verdieping) => (
                <form key={verdieping.id} action={wijzigVerdiepingActie} className="kaart">
                  <input type="hidden" name="id" value={verdieping.id} />
                  <Velden verdieping={verdieping} gebouw={gebouw.naam} voorvoegsel={`v${verdieping.id}`} />
                  <div className="knoppenrij">
                    <button type="submit">Bewaren</button>
                    <BevestigKnop
                      vraag={`${verdieping.naam} verwijderen? De ruimtes van deze verdieping verdwijnen mee.`}
                      formAction={verwijderVerdiepingActie}
                    >
                      Verwijderen
                    </BevestigKnop>
                  </div>
                </form>
              ))
            )}
            <Gebouwbeheer gebouw={gebouw} leeg={eigen.length === 0} />
          </section>
        );
      })}

      <hr className="scheiding" />

      <h2>Verdieping toevoegen</h2>
      <form action={voegVerdiepingToeActie} className="kaart">
        <Velden gebouw={gebouwen[0]?.naam ?? "Woning"} voorvoegsel="nieuw" />
        <p className="hulp" style={{ marginBottom: 12 }}>
          Een nieuwe naam bij Gebouw maakt dat gebouw aan, bv. Bijgebouw.
        </p>
        <button type="submit">Toevoegen</button>
      </form>
    </>
  );
}
