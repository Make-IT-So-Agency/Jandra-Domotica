import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { factuurWat, openFacturen, poststanden, totalen } from "@/lib/bouw/geld";
import { lijstFacturen, lijstMeerwerken, lijstOffertes, lijstPosten } from "@/lib/bouw/geld-opslag";
import { lijstInzendingen } from "@/lib/bouw/links";
import { lijstActiepunten, lijstOpleverpunten, lijstWerffotos } from "@/lib/bouw/werf-opslag";
import { dagMetWeekdag, dagenTekst, dagenTussen, vandaag } from "@/lib/bouw/kalender";
import { euroRond, openDeadlines } from "@/lib/bouw/keuzes";
import { nazorgstand } from "@/lib/bouw/nazorg";
import { heeftOnderdeel } from "@/lib/bouw/onderdelen";
import { lijstDocumenten, lijstGaranties, lijstOnderhoud } from "@/lib/bouw/nazorg-opslag";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { leesBouwstand } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import { tweeWeken } from "@/lib/bouw/planning";
import { lijstKeuzes, lijstPlanning } from "@/lib/bouw/regie-opslag";
import { takenVoorBouw } from "@/lib/bouw/taken";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { bewaarProjectActie } from "./acties";
import { Melding } from "@/components/bouw/melding";

export const dynamic = "force-dynamic";

const WEEKSOORTEN = { loopt: "loopt nog:", begint: "begint:", eindigt: "eindigt:", mijlpaal: "◆", deadline: "beslissen:" } as const;

export default async function Bouwoverzicht({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  // Een bestaand huis heeft geen keuzes, planning en werf: geen tegels, geen taken.
  const met = {
    keuzes: heeftOnderdeel(huis.soort, "keuzes"),
    planning: heeftOnderdeel(huis.soort, "planning"),
    werf: heeftOnderdeel(huis.soort, "werf"),
  };
  let stand;
  let keuzes;
  let planning;
  let cijfers;
  try {
    let posten, offertes, meerwerken, facturen, inzendingen, actiepunten, fotos, opleverpunten, documenten, onderhoud, garanties;
    [
      stand,
      keuzes,
      planning,
      posten,
      offertes,
      meerwerken,
      facturen,
      inzendingen,
      actiepunten,
      fotos,
      opleverpunten,
      documenten,
      onderhoud,
      garanties,
    ] = await Promise.all([
      leesBouwstand(huis),
      met.keuzes ? lijstKeuzes(huis.id) : [],
      met.planning ? lijstPlanning(huis.id) : [],
      lijstPosten(huis.id),
      lijstOffertes(huis.id),
      lijstMeerwerken(huis.id),
      lijstFacturen(huis.id),
      lijstInzendingen(huis.id, { status: "nieuw" }),
      met.werf ? lijstActiepunten(huis.id) : [],
      met.werf ? lijstWerffotos(huis.id) : [],
      met.werf ? lijstOpleverpunten(huis.id) : [],
      lijstDocumenten(huis.id),
      lijstOnderhoud(huis.id),
      lijstGaranties(huis.id),
    ]);
    cijfers = {
      posten,
      facturen,
      totaal: totalen(poststanden(posten, offertes, meerwerken, facturen), facturen),
      inzendingen: {
        plannen: inzendingen.filter((inzending) => inzending.soort === "plan").length,
        geld: inzendingen.filter((inzending) => inzending.soort !== "plan").length,
      },
      actiepunten: actiepunten.filter((punt) => punt.status === "open"),
      fotos: fotos.length,
      nakijken: opleverpunten.filter((punt) => punt.status === "hersteld").length,
      documenten: documenten.length,
      onderhoud,
      garanties,
    };
  } catch (fout) {
    return (
      <>
        <h1>{huis.naam}</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const nazorg = nazorgstand(cijfers.onderhoud, cijfers.garanties, nu);
  const deadlines = openDeadlines(keuzes, planning, nu);
  const teBetalen = openFacturen(cijfers.facturen, nu);
  const partijnaam = (partijId: number | null) =>
    partijId === null ? null : (stand.partijen.find((partij) => partij.id === partijId)?.naam ?? null);
  const taken = takenVoorBouw({
    projectnaam: stand.project.projectnaam,
    bestaand: huis.soort === "bestaand",
    verdiepingen: stand.verdiepingen,
    plannen: stand.plannen,
    partijen: stand.partijen,
    deadlines: deadlines.map(({ keuze, dagen }) => ({ keuzeId: keuze.id, titel: keuze.titel, dagen })),
    facturen: teBetalen.map(({ factuur, dagen }) => ({
      factuurId: factuur.id,
      wat: factuurWat(factuur, partijnaam(factuur.partij_id)),
      dagen,
    })),
    inzendingen: cijfers.inzendingen,
    actiepunten: cijfers.actiepunten.flatMap((punt) =>
      punt.deadline
        ? [{ puntId: punt.id, titel: punt.titel, wie: partijnaam(punt.partij_id), dagen: dagenTussen(nu, punt.deadline) }]
        : [],
    ),
    nakijken: cijfers.nakijken,
    ...nazorg,
  }, huispad(huis.id));
  const versies = stand.plannen.reduce((som, plan) => som + plan.versies, 0);
  const onderhoudTeLaat = nazorg.onderhoud.filter((item) => item.dagen < 0).length;
  const volgendOnderhoud = Math.min(...nazorg.onderhoud.map((item) => item.dagen));
  const beslist = keuzes.filter((keuze) => keuze.gekozen_optie_id !== null).length;
  const mijlpaal = planning.find((item) => item.soort === "mijlpaal" && item.begindatum >= nu && item.status !== "klaar");
  const week = tweeWeken(
    planning,
    deadlines.map(({ keuze, deadline }) => ({ titel: keuze.titel, datum: deadline.datum })),
    nu,
  );

  return (
    <>
      <h1>{stand.project.projectnaam ?? huis.naam}</h1>
      <p className="inleiding">
        {met.planning
          ? "Ons bouwproject: de plannen van de architect, omgezet naar ruimtes per verdieping, de keuzes en de planning, en iedereen met wie we te maken hebben."
          : "Het huis: de plannen en de ruimtes, het geld, het dossier met het onderhoud, en iedereen met wie we te maken hebben."}
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
        {met.keuzes ? (
          <div className="tegel">
            <div className="label">Keuzes</div>
            <div className="waarde">{keuzes.length - beslist}</div>
            <div className="bij">
              {keuzes.length === 0 ? "nog geen" : `te beslissen, ${beslist} beslist`}
            </div>
          </div>
        ) : null}
        {met.planning ? (
          <div className="tegel">
            <div className="label">Planning</div>
            <div className="waarde">{mijlpaal ? dagenTekst(dagenTussen(nu, mijlpaal.begindatum)) : "—"}</div>
            <div className="bij">{mijlpaal ? mijlpaal.titel : planning.length === 0 ? "nog geen planning" : "geen mijlpaal meer"}</div>
          </div>
        ) : null}
        <div className="tegel">
          <div className="label">Geld</div>
          <div className="waarde">{cijfers.posten.length === 0 ? "—" : euroRond(cijfers.totaal.verwacht)}</div>
          <div className="bij">
            {cijfers.posten.length === 0
              ? "nog geen posten"
              : teBetalen.length > 0
                ? `verwacht, ${euroRond(cijfers.totaal.open)} te betalen`
                : `verwacht, ${euroRond(cijfers.totaal.betaald)} betaald`}
          </div>
        </div>
        {met.werf ? (
          <div className="tegel">
            <div className="label">Werf</div>
            <div className="waarde">{cijfers.fotos === 1 ? "1 foto" : `${cijfers.fotos} foto's`}</div>
            <div className="bij">
              {cijfers.actiepunten.length === 0
                ? "geen actiepunten open"
                : cijfers.actiepunten.length === 1
                  ? "1 actiepunt open"
                  : `${cijfers.actiepunten.length} actiepunten open`}
            </div>
          </div>
        ) : null}
        <div className="tegel">
          <div className="label">Dossier</div>
          <div className="waarde">{cijfers.documenten === 1 ? "1 document" : `${cijfers.documenten} documenten`}</div>
          <div className="bij">
            {cijfers.onderhoud.length === 0
              ? "nog geen onderhoud gepland"
              : onderhoudTeLaat > 0
                ? `${onderhoudTeLaat === 1 ? "1 onderhoudsbeurt" : `${onderhoudTeLaat} onderhoudsbeurten`} te laat`
                : nazorg.onderhoud.length > 0
                  ? `volgend onderhoud ${dagenTekst(volgendOnderhoud)}`
                  : "onderhoud: nog niets genoteerd"}
          </div>
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
              <Link href={huispad(huis.id, "/planning")}>Naar de planning</Link>
            </p>
          </div>
        </>
      ) : null}

      <h2 id="project">Project</h2>
      <form action={bewaarProjectActie.bind(null, huis.id)} className="kaart">
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
          <div>
            <label htmlFor="perceel">Perceelnummer</label>
            <input id="perceel" name="perceel" defaultValue={stand.project.perceel ?? ""} placeholder="12345A0678/00B000" />
          </div>
        </div>
        <p className="hulp">
          Kent Digitaal Vlaanderen het adres nog niet, zoals bij nieuwbouw, vul dan het perceelnummer in: de CaPaKey die Geopunt
          toont als je het perceel aantikt, of die op de omgevingsvergunning staat. Dan zoekt 3D de omgeving bij het perceel. Naam,
          adres en perceel staan enkel in de databank, nooit in de code: de repository is publiek.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Bewaren</button>
        </div>
      </form>
    </>
  );
}
