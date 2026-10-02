import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import { DOCUMENTNAMEN, DOCUMENTUITLEG, SOORTEN_DOCUMENT, type Dossierdocument } from "@/lib/bouw/nazorg";
import { lijstDocumenten } from "@/lib/bouw/nazorg-opslag";
import { lijstPartijen } from "@/lib/bouw/opslag";
import type { Partij } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Documentveld } from "../geld/documentveld";
import { Partijkeuze } from "../keuzes/velden";
import { Melding } from "../melding";
import { verwijderDocumentActie, voegDocumentToeActie, wijzigDocumentActie } from "./acties";
import { Dossiermenu } from "./dossiermenu";

export const dynamic = "force-dynamic";

/** Wat in elk woningdossier hoort; ontbreekt het, dan staat het bovenaan. */
const VERWACHT = ["as_built", "arei", "epb", "pid"] as const;

function Documentvelden({ document, partijen, voorvoegsel }: { document?: Dossierdocument; partijen: Partij[]; voorvoegsel: string }) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-soort`}>Wat</label>
          <select id={`${voorvoegsel}-soort`} name="soort" defaultValue={document?.soort ?? "handleiding"}>
            {SOORTEN_DOCUMENT.map((soort) => (
              <option key={soort} value={soort}>
                {DOCUMENTNAMEN[soort]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-titel`}>Titel</label>
          <input id={`${voorvoegsel}-titel`} name="titel" defaultValue={document?.titel ?? ""} required maxLength={200} placeholder="Handleiding warmtepomp" />
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Van" partijen={partijen} gekozen={document?.partij_id} />
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-datum`}>Datum</label>
          <input id={`${voorvoegsel}-datum`} name="datum" type="date" defaultValue={document?.datum ?? ""} />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={document?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}

export default async function Dossierpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; document?: string }>;
}) {
  const { melding, soort, document: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const [documenten, partijen] = await Promise.all([lijstDocumenten(), lijstPartijen()]);
  const nu = vandaag();
  const partijnaam = (partijId: number | null) => partijen.find((p) => p.id === partijId)?.naam ?? null;
  const ontbreekt = VERWACHT.filter((verwacht) => !documenten.some((d) => d.soort === verwacht));
  const teWijzigen = documenten.find((d) => d.id === leesId(gevraagd ?? ""));

  return (
    <>
      <h1>Woningdossier</h1>
      <p className="inleiding">
        Alles wat bij het huis hoort, voor nu en voor later: de plannen zoals er gebouwd is, de keuring van de
        elektriciteit, de EPB, het postinterventiedossier, handleidingen en garantiebewijzen.
      </p>

      <Dossiermenu actief="/bouw/dossier" />
      <Melding soort={soort} melding={melding} />

      {ontbreekt.length > 0 ? (
        <div className="melding info">
          <p>
            <strong>Nog niet in het dossier</strong>
          </p>
          <ul>
            {ontbreekt.map((soortDocument) => (
              <li key={soortDocument}>
                {DOCUMENTNAMEN[soortDocument]}
                {DOCUMENTUITLEG[soortDocument] ? <span className="hulp">: {DOCUMENTUITLEG[soortDocument]}</span> : null}
              </li>
            ))}
          </ul>
          <p className="hulp">Die krijg je bij en na de oplevering, van de architect, de elektricien, de EPB-verslaggever en de veiligheidscoördinator.</p>
        </div>
      ) : null}

      {teWijzigen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{teWijzigen.titel}</h2>
          <form action={wijzigDocumentActie}>
            <input type="hidden" name="document_id" value={teWijzigen.id} />
            <Documentvelden document={teWijzigen} partijen={partijen} voorvoegsel="wijzig" />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop vraag={`${teWijzigen.titel} uit het dossier halen, met de PDF?`} formAction={verwijderDocumentActie}>
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href="/bouw/dossier">
                Sluiten
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      {documenten.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Het dossier is nog leeg.</p>
        </div>
      ) : (
        SOORTEN_DOCUMENT.filter((s) => documenten.some((d) => d.soort === s)).map((soortDocument) => (
          <section key={soortDocument}>
            <h2>{DOCUMENTNAMEN[soortDocument]}</h2>
            <ul className="documentenlijst">
              {documenten
                .filter((d) => d.soort === soortDocument)
                .map((d) => (
                  <li key={d.id}>
                    <a href={`/api/bouw/document/${d.bestand_id}`} target="_blank" rel="noopener noreferrer">
                      {d.titel}
                    </a>
                    <span className="hulp">
                      {[partijnaam(d.partij_id), d.datum ? korteDatum(d.datum, nu) : null, d.opmerking].filter(Boolean).map((x) => ` · ${x}`)}
                    </span>{" "}
                    <Link className="hulp" href={`/bouw/dossier?document=${d.id}#wijzigen`}>
                      wijzigen
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      <h2>Document toevoegen</h2>
      <form action={voegDocumentToeActie} className="kaart">
        <Documentvelden partijen={partijen} voorvoegsel="nieuw" />
        <div className="veldenrij">
          <Documentveld id="nieuw-pdf" label="PDF (tot 20 MB)" />
        </div>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>
      <p className="hulp">
        Een plan zoals er gebouwd is, zet je best ook bij <Link href="/bouw/plannen">Plannen</Link> als nieuwe versie:
        dan kan je het omzetten en vergelijken.
      </p>
    </>
  );
}
