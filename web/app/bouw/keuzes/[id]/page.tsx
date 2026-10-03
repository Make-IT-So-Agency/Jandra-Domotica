import Link from "next/link";
import { notFound } from "next/navigation";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { id as leesId } from "@/lib/bouw/invoer";
import { dagenTekst, dagenTussen, korteDatum, vandaag } from "@/lib/bouw/kalender";
import {
  CATEGORIENAMEN_KEUZE,
  EENHEIDKORT,
  EENHEIDNAMEN,
  deadlineVan,
  dringendheid,
  hoeveelheidVan,
  korteNaam,
  meerprijzen,
} from "@/lib/bouw/keuzes";
import { leesBestanden, lijstGebouwen, lijstPartijen, lijstRuimtes, lijstVerdiepingen } from "@/lib/bouw/opslag";
import { tijdelijkeUrl } from "@/lib/bouw/opslagruimte";
import { leesKeuze, lijstBeslissingen, lijstOpties, lijstPlanning, lijstVoorkeuren } from "@/lib/bouw/regie-opslag";
import { sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";
import { datum, datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Melding } from "../../melding";
import { heropenActie, verwijderKeuzeActie, voegOptieToeActie, wijzigKeuzeActie } from "../acties";
import { Keuzevelden, Optievelden } from "../velden";
import { Optiekaart } from "./optiekaart";

export const dynamic = "force-dynamic";

const getal = (waarde: number) => waarde.toLocaleString("nl-BE", { maximumFractionDigits: 2 });

export default async function Keuzepagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const [{ id }, { melding, soort }] = await Promise.all([params, searchParams]);
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const keuzeId = leesId(id);
  const keuze = keuzeId ? await leesKeuze(huis.id, keuzeId) : null;
  if (!keuze) notFound();

  const [opties, voorkeuren, planning, partijen, ruimtes, verdiepingen, gebouwen, beslissingen] = await Promise.all([
    lijstOpties(huis.id, [keuze.id]),
    lijstVoorkeuren(huis.id, [keuze.id]),
    lijstPlanning(huis.id),
    lijstPartijen(huis.id),
    lijstRuimtes(huis.id),
    lijstVerdiepingen(huis.id),
    lijstGebouwen(huis.id),
    lijstBeslissingen(huis.id),
  ]);

  // Een foto toont de browser via een ondertekende URL van een uur.
  const bestanden = await leesBestanden(
    huis.id,
    opties.flatMap((optie) => (optie.foto_bestand_id ? [optie.foto_bestand_id] : [])),
  );
  const fotos = new Map(
    await Promise.all(
      bestanden.map(async (bestand) => [bestand.id, await tijdelijkeUrl(bestand.pad, 3600).catch(() => null)] as const),
    ),
  );

  const nu = vandaag();
  const gekoppeld = ruimtes.filter((ruimte) => keuze.ruimte_ids.includes(ruimte.id));
  const hoeveelheid = hoeveelheidVan(keuze, gekoppeld.map((ruimte) => ruimte.oppervlakte_m2));
  const prijzen = meerprijzen(opties, hoeveelheid.waarde);
  const deadline = deadlineVan(keuze, planning);
  const gekozen = opties.find((optie) => optie.id === keuze.gekozen_optie_id);
  const mijnVoorkeur = voorkeuren.find((voorkeur) => voorkeur.wie === ik.email)?.optie_id ?? null;
  const partijnaam = (partijId: number | null) => partijen.find((partij) => partij.id === partijId)?.naam ?? null;
  const geschiedenis = beslissingen.filter((beslissing) => beslissing.keuze_id === keuze.id);
  const heeftBasis = opties.some((optie) => optie.basis);
  const geordend = sorteerVerdiepingen(verdiepingen, gebouwen);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href="/bouw/keuzes">← Keuzes</Link>
      </p>
      <h1>{keuze.titel}</h1>
      <p className="inleiding">
        {CATEGORIENAMEN_KEUZE[keuze.categorie]}
        {keuze.omschrijving ? ` · ${keuze.omschrijving}` : ""}
        {keuze.partij_id ? ` · ${partijnaam(keuze.partij_id)}` : ""}
      </p>

      <Melding soort={soort} melding={melding} />

      {gekozen ? (
        <div className="melding goed">
          <p>
            <strong>Beslist: {gekozen.naam}</strong>
            {keuze.beslist_op ? ` op ${datumTijd(keuze.beslist_op)}` : ""}
            {keuze.beslist_door ? ` door ${keuze.beslist_door}` : ""}.
          </p>
          <form action={heropenActie.bind(null, huis.id)}>
            <input type="hidden" name="id" value={keuze.id} />
            <BevestigKnop vraag={`${keuze.titel} terug open zetten?`} className="stil">
              Terug open zetten
            </BevestigKnop>
          </form>
        </div>
      ) : deadline ? (
        <div className={`melding ${dringendheid(dagenTussen(nu, deadline.datum)) === "later" ? "info" : "let-op"}`}>
          <strong>
            Beslissen tegen {korteDatum(deadline.datum, nu)} ({dagenTekst(dagenTussen(nu, deadline.datum))})
          </strong>
          {deadline.uitleg ? <p className="hulp">Dat volgt uit de planning: {deadline.uitleg}.</p> : null}
        </div>
      ) : null}

      <p className="hulp">
        {keuze.eenheid === "totaal"
          ? "De prijzen van de opties zijn bedragen in totaal."
          : hoeveelheid.waarde === null
            ? `De prijzen zijn ${EENHEIDNAMEN[keuze.eenheid]}. Vul een hoeveelheid in${keuze.eenheid === "m2" ? " of koppel ruimtes" : ""}, dan volgen de totalen.`
            : `Hoeveelheid: ${getal(hoeveelheid.waarde)} ${EENHEIDKORT[keuze.eenheid]}${
                hoeveelheid.bron === "ruimtes"
                  ? `, uit ${gekoppeld.length === 1 ? "1 ruimte" : `${gekoppeld.length} ruimtes`} (${gekoppeld.map((ruimte) => ruimte.naam).join(", ")})`
                  : ", met de hand"
              }. Prijzen incl. btw.`}
      </p>

      <h2>Opties</h2>
      {opties.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen opties. Zet er hieronder een of meer bij.</p>
        </div>
      ) : (
        <div className="opties">
          {opties.map((optie) => (
            <Optiekaart
              key={optie.id}
              huisId={huis.id}
              optie={optie}
              keuze={keuze}
              prijs={prijzen.get(optie.id)}
              fans={voorkeuren.filter((voorkeur) => voorkeur.optie_id === optie.id)}
              foto={optie.foto_bestand_id ? (fotos.get(optie.foto_bestand_id) ?? null) : null}
              mijnVoorkeur={mijnVoorkeur}
              leverancier={partijnaam(optie.leverancier_id)}
              heeftBasis={heeftBasis}
              aantalOpties={opties.length}
              partijen={partijen}
            />
          ))}
        </div>
      )}

      <h2>Optie toevoegen</h2>
      <form action={voegOptieToeActie.bind(null, huis.id)} className="kaart">
        <input type="hidden" name="keuze_id" value={keuze.id} />
        <Optievelden eenheid={keuze.eenheid} partijen={partijen} voorvoegsel="nieuw" />
        <p className="hulp">Een foto zet je erbij zodra de optie bestaat.</p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      <h2>Keuze</h2>
      <details className="kaart">
        <summary>Titel, deadline, hoeveelheid en ruimtes wijzigen</summary>
        <form action={wijzigKeuzeActie.bind(null, huis.id)} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={keuze.id} />
          <Keuzevelden keuze={keuze} planning={planning} partijen={partijen} voorvoegsel="keuze" />
          {ruimtes.length > 0 ? (
            <fieldset className="keuzerij">
              <legend>Op welke ruimtes slaat dit?</legend>
              {geordend.map((verdieping) => {
                const eigen = ruimtes.filter((ruimte) => ruimte.verdieping_id === verdieping.id);
                if (eigen.length === 0) return null;
                return (
                  <div key={verdieping.id} className="ruimtekeuze">
                    <div className="hulp">{verdiepingNaam(verdieping, gebouwen)}</div>
                    {eigen.map((ruimte) => (
                      <label key={ruimte.id} className="keuzevak">
                        <input type="checkbox" name="ruimte" value={ruimte.id} defaultChecked={keuze.ruimte_ids.includes(ruimte.id)} />
                        {ruimte.naam} <span className="hulp">{getal(ruimte.oppervlakte_m2)} m²</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Bewaren</button>
            <BevestigKnop
              vraag={`${keuze.titel} verwijderen, met alle opties en foto's?`}
              formAction={verwijderKeuzeActie.bind(null, huis.id)}
            >
              Keuze verwijderen
            </BevestigKnop>
          </div>
        </form>
      </details>

      {geschiedenis.length > 0 ? (
        <>
          <h2>Geschiedenis</h2>
          <ul className="wijzigingen">
            {geschiedenis.map((beslissing) => (
              <li key={beslissing.id}>
                {datum(beslissing.datum)}: {beslissing.beslissing}
                {beslissing.door ? <span className="hulp"> · {beslissing.door}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="hulp" style={{ marginTop: 18 }}>
        Jouw voorkeur telt als {korteNaam(ik.naam, ik.email)}.
      </p>
    </>
  );
}
