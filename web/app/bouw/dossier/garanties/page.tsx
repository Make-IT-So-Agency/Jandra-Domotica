import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { id as leesId } from "@/lib/bouw/invoer";
import { dagenTekst, korteDatum, vandaag } from "@/lib/bouw/kalender";
import { GARANTIEDUREN, garantiestand, type Dossierdocument, type Garantie } from "@/lib/bouw/nazorg";
import { lijstDocumenten, lijstGaranties } from "@/lib/bouw/nazorg-opslag";
import { lijstPartijen } from "@/lib/bouw/opslag";
import type { Partij } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Partijkeuze } from "../../keuzes/velden";
import { Melding } from "../../melding";
import { verwijderGarantieActie, voegGarantieToeActie, wijzigGarantieActie } from "../acties";
import { Dossiermenu } from "../dossiermenu";

export const dynamic = "force-dynamic";

const VLAG = { loopt: "goed", vervalt: "let-op", vervallen: "" } as const;

function Garantievelden({
  garantie,
  partijen,
  documenten,
  voorvoegsel,
}: {
  garantie?: Garantie;
  partijen: Partij[];
  documenten: Dossierdocument[];
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-wat`}>Waarop</label>
          <input id={`${voorvoegsel}-wat`} name="wat" defaultValue={garantie?.wat ?? ""} required maxLength={200} placeholder="Warmtepomp" />
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Van" partijen={partijen} gekozen={garantie?.partij_id} />
        <div>
          <label htmlFor={`${voorvoegsel}-begin`}>Vanaf</label>
          <input id={`${voorvoegsel}-begin`} name="begin" type="date" defaultValue={garantie?.begin ?? ""} required />
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-duur`}>Hoe lang (maanden)</label>
          <input
            id={`${voorvoegsel}-duur`}
            name="duur_maanden"
            type="number"
            min={1}
            max={600}
            list="garantieduren"
            defaultValue={garantie?.duur_maanden ?? 24}
            required
          />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-document`}>Garantiebewijs</label>
          <select id={`${voorvoegsel}-document`} name="document_id" defaultValue={garantie?.document_id ?? ""}>
            <option value="">—</option>
            {documenten.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titel}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={garantie?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}

export default async function Garantiepagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; garantie?: string }>;
}) {
  const { melding, soort, garantie: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const [garanties, partijen, documenten] = await Promise.all([
    lijstGaranties(huis.id),
    lijstPartijen(huis.id),
    lijstDocumenten(huis.id),
  ]);
  const nu = vandaag();
  const partijnaam = (partijId: number | null) => partijen.find((p) => p.id === partijId)?.naam ?? null;
  const metStand = garanties
    .map((garantie) => ({ garantie, ...garantiestand(garantie, nu) }))
    .sort((a, b) => a.einde.localeCompare(b.einde));
  const teWijzigen = garanties.find((g) => g.id === leesId(gevraagd ?? ""));

  return (
    <>
      <h1>Garanties</h1>
      <p className="inleiding">
        Tot wanneer wie garantie geeft. De bot van Bouw verwittigt twee maanden, een maand en een week voor een
        garantie afloopt: dan kan je nog melden wat niet in orde is.
      </p>

      <Dossiermenu actief="/bouw/dossier/garanties" />
      <Melding soort={soort} melding={melding} />

      <datalist id="garantieduren">
        {GARANTIEDUREN.map((duur) => (
          <option key={duur.maanden} value={duur.maanden}>
            {duur.naam}
          </option>
        ))}
      </datalist>

      {teWijzigen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{teWijzigen.wat}</h2>
          <form action={wijzigGarantieActie.bind(null, huis.id)}>
            <input type="hidden" name="garantie_id" value={teWijzigen.id} />
            <Garantievelden garantie={teWijzigen} partijen={partijen} documenten={documenten} voorvoegsel="wijzig" />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop
                vraag={`De garantie op ${teWijzigen.wat} verwijderen?`}
                formAction={verwijderGarantieActie.bind(null, huis.id)}
              >
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href="/bouw/dossier/garanties">
                Sluiten
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      {metStand.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen garanties.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Waarop</th>
                <th>Van</th>
                <th>Tot</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metStand.map(({ garantie, einde, dagen, stand }) => {
                const bewijs = documenten.find((d) => d.id === garantie.document_id);
                return (
                  <tr key={garantie.id}>
                    <td data-label="Waarop">
                      {garantie.wat}
                      {garantie.opmerking ? <div className="hulp">{garantie.opmerking}</div> : null}
                    </td>
                    <td data-label="Van">{partijnaam(garantie.partij_id) ?? "—"}</td>
                    <td data-label="Tot">
                      <span>
                        {korteDatum(einde, nu)}{" "}
                        <span className={`label-vlag ${VLAG[stand]}`}>{stand === "vervallen" ? "afgelopen" : dagenTekst(dagen)}</span>
                      </span>
                    </td>
                    <td>
                      <div className="knoppenrij">
                        {bewijs ? (
                          <a
                            className="knop stil"
                            href={`/api/bouw/document/${bewijs.bestand_id}?huis=${huis.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Bewijs
                          </a>
                        ) : null}
                        <Link className="knop stil" href={`/bouw/dossier/garanties?garantie=${garantie.id}#wijzigen`}>
                          Wijzigen
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Garantie toevoegen</h2>
      <form action={voegGarantieToeActie.bind(null, huis.id)} className="kaart">
        <Garantievelden partijen={partijen} documenten={documenten} voorvoegsel="nieuw" />
        <p className="hulp">
          Een product heeft wettelijk 2 jaar garantie (24 maanden); voor de ruwbouw geldt de tienjarige
          aansprakelijkheid van aannemer en architect (120 maanden), vanaf de aanvaarding.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>
    </>
  );
}
