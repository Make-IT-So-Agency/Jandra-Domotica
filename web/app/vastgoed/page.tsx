import Link from "next/link";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import { Melding } from "@/components/bouw/melding";
import { GeenToegang } from "@/components/geen-toegang";
import { heeftGegevens, lijstHuizen } from "@/lib/bouw/huizen";
import { huispad } from "@/lib/bouw/paden";
import { HUISSOORTNAMEN, SOORTEN_HUIS, type Huis } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { archiveerHuisActie, verwijderHuisActie, voegHuisToeActie, wijzigHuisActie, zetHuisTerugActie } from "./acties";

export const dynamic = "force-dynamic";

/** Wat het soort voor de pagina's betekent, naast de keuze. */
const SOORTUITLEG = "Een bestaand huis heeft geen keuzes, planning en werf. Het soort kan later nog wijzigen; wat er al was, blijft bewaard.";

function Soortkeuze({ id, huis }: { id: string; huis?: Huis }) {
  return (
    <select id={id} name="soort" defaultValue={huis?.soort ?? "bestaand"}>
      {SOORTEN_HUIS.map((soort) => (
        <option key={soort} value={soort}>
          {HUISSOORTNAMEN[soort]}
        </option>
      ))}
    </select>
  );
}

function Huisbeheer({ huis, leeg }: { huis: Huis; leeg: boolean }) {
  const gearchiveerd = huis.gearchiveerd_op !== null;
  return (
    <details className="kaart">
      <summary>
        <strong>{huis.naam}</strong>
        <span className="hulp">
          {" "}
          · {HUISSOORTNAMEN[huis.soort]}
          {gearchiveerd ? " · gearchiveerd" : ""}
        </span>
      </summary>
      <p style={{ marginTop: 10 }}>
        <Link href={huispad(huis.id)}>Naar {huis.naam}</Link>
      </p>
      <form action={wijzigHuisActie} style={{ marginTop: 14 }}>
        <input type="hidden" name="id" value={huis.id} />
        <div className="veldenrij">
          <div>
            <label htmlFor={`h${huis.id}-naam`}>Naam in het menu</label>
            <input id={`h${huis.id}-naam`} name="naam" defaultValue={huis.naam} maxLength={60} required />
          </div>
          <div>
            <label htmlFor={`h${huis.id}-soort`}>Soort</label>
            <Soortkeuze id={`h${huis.id}-soort`} huis={huis} />
          </div>
          <div>
            <label htmlFor={`h${huis.id}-volgorde`}>Volgorde</label>
            <input id={`h${huis.id}-volgorde`} name="volgorde" inputMode="numeric" defaultValue={String(huis.volgorde)} />
          </div>
        </div>
        <div className="knoppenrij">
          <button type="submit">Bewaren</button>
          {gearchiveerd ? (
            <button type="submit" className="stil" formAction={zetHuisTerugActie} formNoValidate>
              Terugzetten
            </button>
          ) : (
            <BevestigKnop
              vraag={`${huis.naam} archiveren? Het verdwijnt uit het menu en uit de bot, en zijn links werken niet meer. Alles blijft bewaard.`}
              formAction={archiveerHuisActie}
              className="stil"
            >
              Archiveren
            </BevestigKnop>
          )}
          {leeg ? (
            <BevestigKnop vraag={`${huis.naam} verwijderen? Het huis is leeg.`} formAction={verwijderHuisActie}>
              Verwijderen
            </BevestigKnop>
          ) : null}
        </div>
      </form>
      {leeg ? null : (
        <p className="hulp">Verwijderen kan enkel met een leeg huis. Een huis met gegevens archiveer je.</p>
      )}
    </details>
  );
}

/** De huizen onder Vastgoed: toevoegen, wijzigen, archiveren, en een leeg huis verwijderen. */
export default async function Huizenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Vastgoed" />;

  let huizen: Huis[];
  let leeg: Map<number, boolean>;
  try {
    huizen = await lijstHuizen({ ookGearchiveerd: true });
    leeg = new Map(await Promise.all(huizen.map(async (huis) => [huis.id, !(await heeftGegevens(huis.id))] as const)));
  } catch (fout) {
    return (
      <>
        <h1>Huizen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }
  const actief = huizen.filter((huis) => huis.gearchiveerd_op === null);
  const gearchiveerd = huizen.filter((huis) => huis.gearchiveerd_op !== null);

  return (
    <>
      <h1>Huizen</h1>
      <p className="inleiding">
        Elk huis heeft zijn eigen plannen, partijen, geld, werf en onderhoud. Het menu toont de actieve huizen, in
        deze volgorde; de bot volgt ze allemaal.
      </p>

      <Melding soort={soort} melding={melding} />

      {actief.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Geen actieve huizen.</p>
        </div>
      ) : (
        actief.map((huis) => <Huisbeheer key={huis.id} huis={huis} leeg={leeg.get(huis.id) ?? false} />)
      )}

      {gearchiveerd.length > 0 ? (
        <>
          <h2>Gearchiveerd</h2>
          <p className="hulp">
            Niet in het menu en niet bij de bot, en hun links werken niet. Alles is nog te bekijken, en terugzetten
            kan altijd.
          </p>
          {gearchiveerd.map((huis) => (
            <Huisbeheer key={huis.id} huis={huis} leeg={leeg.get(huis.id) ?? false} />
          ))}
        </>
      ) : null}

      <hr className="scheiding" />

      <h2>Huis toevoegen</h2>
      <form action={voegHuisToeActie} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="nieuw-naam">Naam in het menu</label>
            <input id="nieuw-naam" name="naam" maxLength={60} placeholder="Huidig huis" required />
          </div>
          <div>
            <label htmlFor="nieuw-soort">Soort</label>
            <Soortkeuze id="nieuw-soort" />
          </div>
        </div>
        <p className="hulp">
          {SOORTUITLEG} De naam staat enkel in de databank; het adres en de projectnaam vul je in op het overzicht
          van het huis.
        </p>
        <div className="knoppenrij">
          <button type="submit">Toevoegen</button>
        </div>
      </form>
    </>
  );
}
