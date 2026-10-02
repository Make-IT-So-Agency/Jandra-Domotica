import { GeenToegang } from "@/components/geen-toegang";
import { lijstVerdiepingen } from "@/lib/bouw/opslag";
import type { Verdieping } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { verwijderVerdiepingActie, voegVerdiepingToeActie, wijzigVerdiepingActie } from "./acties";

export const dynamic = "force-dynamic";

/** Een getal in een invulveld, met een komma zoals iedereen het intikt. */
function veld(waarde: number | null): string {
  return waarde === null ? "" : String(waarde).replace(".", ",");
}

function Velden({ verdieping, voorvoegsel }: { verdieping?: Verdieping; voorvoegsel: string }) {
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

export default async function Verdiepingenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let verdiepingen: Verdieping[];
  try {
    verdiepingen = await lijstVerdiepingen();
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
        Elk grondplan hoort bij een verdieping. Het peil is de hoogte van de afgewerkte vloer
        tegenover het nulpunt van de architect; de hoogtes dienen later voor het 3D-model. Die mag
        je gerust leeg laten tot je ze kent.
      </p>

      <Melding soort={soort} melding={melding} />

      {verdiepingen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen verdiepingen. Voeg er hieronder een toe.</p>
        </div>
      ) : (
        verdiepingen.map((verdieping) => (
          <form key={verdieping.id} action={wijzigVerdiepingActie} className="kaart">
            <input type="hidden" name="id" value={verdieping.id} />
            <Velden verdieping={verdieping} voorvoegsel={`v${verdieping.id}`} />
            <div className="knoppenrij">
              <button type="submit">Bewaren</button>
              <button type="submit" className="gevaar" formAction={verwijderVerdiepingActie} formNoValidate>
                Verwijderen
              </button>
            </div>
          </form>
        ))
      )}

      <hr className="scheiding" />

      <h2>Verdieping toevoegen</h2>
      <form action={voegVerdiepingToeActie} className="kaart">
        <Velden voorvoegsel="nieuw" />
        <button type="submit">Toevoegen</button>
      </form>
    </>
  );
}
