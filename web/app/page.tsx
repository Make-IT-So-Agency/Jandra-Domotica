import Link from "next/link";

import { richtprijsVoorSessie, verdeelKwh, type DoorrekenContext } from "@/lib/billing";
import { datumTijd, euro, kwh } from "@/lib/format";
import { kwartaalPeriode, kwartaalVan, lokaleOnderdelen, maandPeriode } from "@/lib/periods";
import {
  isHoofdbeheerder,
  magInstellingenBeheren,
  zichtbareVennootschappen,
  type Gebruiker,
} from "@/lib/rollen";
import { sessieToestand, TOESTANDEN, type SessieToestand } from "@/lib/sessies";
import { leesInstellingen } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { leesTarieven } from "@/lib/tariffs";
import { vereistGebruiker } from "@/lib/toegang";
import type { Laadpaal, Laadsessie, Vennootschap } from "@/lib/types";

import { MeldingAllesKlaar } from "./melding-klaar";
import { VerdelingPerLaadpaal } from "./verdeling-laadpalen";

export const dynamic = "force-dynamic";

interface Overzicht {
  laatsteSynchronisatie: string | null;
  sessiesDezeMaand: Laadsessie[];
  laatsteSessies: Laadsessie[];
  eigenLaadpalen: Laadpaal[];
  vennootschappen: Vennootschap[];
  nietGekoppeld: string[];
  tariefOntbreekt: string | null;
  tariefOnbevestigd: string | null;
  /** Alles wat nodig is om een sessie een prijs te geven in de lijst. */
  prijscontext: DoorrekenContext;
}

async function haalOverzicht(gebruiker: Gebruiker): Promise<Overzicht> {
  const nu = new Date();
  const { jaar, maand } = lokaleOnderdelen(nu);
  const maandPeriodeNu = maandPeriode(jaar, maand);
  const supabase = db();
  const beperking = zichtbareVennootschappen(gebruiker);

  const [logResultaat, palenResultaat, vennResultaat] = await Promise.all([
    supabase
      .from("ingest_log")
      .select("received_at")
      .is("error", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("loadpoints").select("*").order("name"),
    supabase.from("companies").select("*").order("name"),
  ]);

  const alleLaadpalen = (palenResultaat.data ?? []) as Laadpaal[];
  const eigenLaadpalen =
    beperking === null
      ? alleLaadpalen
      : alleLaadpalen.filter(
          (laadpaal) => laadpaal.company_id && beperking.includes(laadpaal.company_id),
        );

  // Sessies filteren op de laadpalen die deze gebruiker mag zien. Bij een
  // hoofdbeheerder blijft de vraag onbeperkt.
  const eigenNamen = eigenLaadpalen.map((laadpaal) => laadpaal.name);

  let maandVraag = supabase
    .from("sessions")
    .select("*")
    .gte("finished_at", maandPeriodeNu.vanaf.toISOString())
    .lt("finished_at", maandPeriodeNu.tot.toISOString());
  let recentVraag = supabase
    .from("sessions")
    .select("*")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(15);

  if (beperking !== null) {
    if (eigenNamen.length === 0) {
      return {
        laatsteSynchronisatie: logResultaat.data?.received_at ?? null,
        sessiesDezeMaand: [],
        laatsteSessies: [],
        eigenLaadpalen: [],
        vennootschappen: [],
        nietGekoppeld: [],
        tariefOntbreekt: null,
        tariefOnbevestigd: null,
        prijscontext: { tarieven: [], regioPerLaadpaal: new Map() },
      };
    }
    maandVraag = maandVraag.in("loadpoint_name", eigenNamen);
    recentVraag = recentVraag.in("loadpoint_name", eigenNamen);
  }

  const [maandResultaat, recentResultaat] = await Promise.all([maandVraag, recentVraag]);

  const vennootschappen = ((vennResultaat.data ?? []) as Vennootschap[]).filter(
    (vennootschap) => beperking === null || beperking.includes(vennootschap.id),
  );

  // Alle tarieven in één keer: de lijst met sessies gaat vijftien rijen terug
  // en kan dus over een kwartaalgrens heen lopen.
  const tarieven = await leesTarieven();
  const prijscontext: DoorrekenContext = {
    tarieven,
    regioPerLaadpaal: new Map(
      alleLaadpalen.map((laadpaal) => [laadpaal.name.toLowerCase(), laadpaal.region]),
    ),
  };

  // Tariefmeldingen zijn enkel zinvol voor wie ze kan oplossen.
  let tariefOntbreekt: string | null = null;
  let tariefOnbevestigd: string | null = null;

  if (magInstellingenBeheren(gebruiker)) {
    const instellingen = await leesInstellingen();
    const { jaar: kJaar, kwartaal } = kwartaalVan(nu);
    const kwartaalStart = kwartaalPeriode(kJaar, kwartaal).start;
    const huidigTarief = tarieven.find(
      (tarief) =>
        tarief.region === instellingen.regio && tarief.period_start === kwartaalStart,
    );

    tariefOntbreekt = huidigTarief ? null : `Q${kwartaal} ${kJaar}`;
    tariefOnbevestigd =
      huidigTarief && !huidigTarief.confirmed_at ? `Q${kwartaal} ${kJaar}` : null;
  }

  return {
    laatsteSynchronisatie: logResultaat.data?.received_at ?? null,
    sessiesDezeMaand: (maandResultaat.data ?? []) as Laadsessie[],
    laatsteSessies: (recentResultaat.data ?? []) as Laadsessie[],
    eigenLaadpalen,
    vennootschappen,
    nietGekoppeld: alleLaadpalen
      .filter((laadpaal) => !laadpaal.company_id)
      .map((laadpaal) => laadpaal.name),
    tariefOntbreekt,
    tariefOnbevestigd,
    prijscontext,
  };
}

export default async function Overzichtspagina() {
  const ik = await vereistGebruiker();

  let overzicht: Overzicht;
  try {
    overzicht = await haalOverzicht(ik);
  } catch (fout) {
    return (
      <>
        <h1>Overzicht</h1>
        <div className="melding fout">
          <p>De databank is niet bereikbaar.</p>
          <p>{fout instanceof Error ? fout.message : "Onbekende fout."}</p>
        </div>
      </>
    );
  }

  const beheerder = magInstellingenBeheren(ik);
  const afgerondDezeMaand = overzicht.sessiesDezeMaand.filter((sessie) => sessie.is_complete);
  const maandVerdeling = afgerondDezeMaand.reduce(
    (som, sessie) => {
      const deel = verdeelKwh(sessie.energy_kwh, sessie.solar_percentage);
      return {
        totaal: som.totaal + (deel.totaal ?? 0),
        zon: som.zon + (deel.zon ?? 0),
        // Ontbreekt het zonpercentage, dan telt die sessie enkel in het totaal
        // mee. Onbekend als "van het net" boeken zou het net te hoog zetten.
        net: som.net + (deel.net ?? 0),
      };
    },
    { totaal: 0, zon: 0, net: 0 },
  );

  const takenTeDoen: Array<{ tekst: string; link: string; knop: string }> = [];

  if (beheerder) {
    if (overzicht.vennootschappen.length === 0) {
      takenTeDoen.push({
        tekst: "Er zijn nog geen vennootschappen ingevuld.",
        link: "/vennootschappen",
        knop: "Vennootschap toevoegen",
      });
    }
    if (overzicht.nietGekoppeld.length > 0) {
      takenTeDoen.push({
        tekst: `Nog niet gekoppeld aan een vennootschap: ${overzicht.nietGekoppeld.join(", ")}.`,
        link: "/laadpalen",
        knop: "Laadpalen koppelen",
      });
    }
    if (overzicht.tariefOntbreekt) {
      takenTeDoen.push({
        tekst: `Het tarief voor ${overzicht.tariefOntbreekt} is nog niet ingevuld.`,
        link: "/tarieven",
        knop: "Tarief regelen",
      });
    }
    if (overzicht.tariefOnbevestigd) {
      takenTeDoen.push({
        tekst: `Het tarief voor ${overzicht.tariefOnbevestigd} is automatisch gevonden en wacht op je bevestiging.`,
        link: "/tarieven",
        knop: "Nakijken en bevestigen",
      });
    }
    if (overzicht.laatsteSynchronisatie === null) {
      takenTeDoen.push({
        tekst:
          "Er is nog nooit data binnengekomen uit Home Assistant. Controleer de HACS-integratie.",
        link: "/instellingen",
        knop: "Koppeling nakijken",
      });
    }
  }

  const eigenaarschap =
    isHoofdbeheerder(ik) || overzicht.vennootschappen.length === 0
      ? null
      : overzicht.vennootschappen[0].name;

  return (
    <>
      <h1>Overzicht</h1>
      <p className="inleiding">
        {eigenaarschap
          ? `De laadsessies op de laadpalen van ${eigenaarschap}.`
          : "Alle laadsessies die evcc kent, klaar om per vennootschap door te rekenen."}
      </p>

      {beheerder ? (
        takenTeDoen.length > 0 ? (
          <div className="melding let-op">
            <p>
              <strong>Nog te doen voor je een rapport kan maken</strong>
            </p>
            <ul>
              {takenTeDoen.map((taak) => (
                <li key={taak.link + taak.tekst}>
                  {taak.tekst} <Link href={taak.link}>{taak.knop}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <MeldingAllesKlaar />
        )
      ) : null}

      {!beheerder && overzicht.eigenLaadpalen.length === 0 ? (
        <div className="melding let-op">
          Er is nog geen laadpaal aan je vennootschap gekoppeld, dus er valt hier nog niets
          te zien. Vraag dat aan de hoofdbeheerder.
        </div>
      ) : null}

      <div className="tegels">
        {beheerder ? (
          <div className="tegel">
            <div className="label">Laatste synchronisatie</div>
            <div className="waarde" style={{ fontSize: 17 }}>
              {overzicht.laatsteSynchronisatie
                ? datumTijd(overzicht.laatsteSynchronisatie)
                : "nog nooit"}
            </div>
            <div className="bij">vanuit Home Assistant</div>
          </div>
        ) : null}
        <div className="tegel">
          <div className="label">Deze maand geladen</div>
          <div className="waarde">{kwh(maandVerdeling.totaal)}</div>
          <div className="tegel-onder">
            <dl className="tegel-metrics">
              <dt className="tegel-icoon net" title="Van het net" aria-label="Van het net" role="img">
                ⚡
              </dt>
              <dd>{kwh(maandVerdeling.net)}</dd>

              <dt className="tegel-icoon zon" title="Van de zon" aria-label="Van de zon" role="img">
                ☀
              </dt>
              <dd>{kwh(maandVerdeling.zon)}</dd>
            </dl>
            <div className="bij">{afgerondDezeMaand.length} sessies</div>
          </div>
        </div>
        <VerdelingPerLaadpaal sessies={overzicht.sessiesDezeMaand} />
      </div>

      <h2>Laatste laadsessies</h2>
      {overzicht.laatsteSessies.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            {beheerder
              ? "Nog geen sessies ontvangen. Druk in Home Assistant op de knop «Nu synchroniseren»."
              : "Nog geen sessies op jullie laadpalen."}
          </p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Gestart</th>
                <th>Laadpaal</th>
                <th className="getal">kWh (net)</th>
                <th className="getal">kWh (zon)</th>
                <th className="getal">kWh (totaal)</th>
                <th className="getal">Kostprijs incl. btw</th>
                <th className="smal">Status</th>
              </tr>
            </thead>
            <tbody>
              {overzicht.laatsteSessies.map((sessie) => {
                const deel = verdeelKwh(sessie.energy_kwh, sessie.solar_percentage);
                const prijs = richtprijsVoorSessie(sessie, overzicht.prijscontext);
                const toestand = TOESTANDEN[sessieToestand(sessie)];

                return (
                  <tr key={sessie.id}>
                    <td data-label="Gestart">{datumTijd(sessie.started_at)}</td>
                    <td data-label="Laadpaal">{sessie.loadpoint_name ?? "—"}</td>
                    <td data-label="kWh (net)" className="getal">{kwh(deel.net)}</td>
                    <td data-label="kWh (zon)" className="getal">{kwh(deel.zon)}</td>
                    <td data-label="kWh (totaal)" className="getal">{kwh(deel.totaal)}</td>
                    <td data-label="Kostprijs incl. btw" className="getal">
                      {prijs.bedrag_incl_btw === null ? (
                        <span className="ontbreekt" title={prijs.reden ?? undefined}>
                          —
                        </span>
                      ) : prijs.bevestigd ? (
                        euro(prijs.bedrag_incl_btw)
                      ) : (
                        <span title="Richtprijs: het tarief van dit kwartaal is nog niet bevestigd.">
                          {euro(prijs.bedrag_incl_btw)}
                          <span className="ster">*</span>
                        </span>
                      )}
                    </td>
                    <td data-label="Status" className="smal">
                      <span
                        className={`vlag-icoon ${toestand.klasse}`}
                        title={toestand.label}
                        aria-label={toestand.label}
                        role="img"
                      >
                        {toestand.icoon}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* De drie toestanden staan er alle drie bij, ook die niet in de lijst
          voorkomen: anders weet je niet dat ze bestaan tot je er een tegenkomt. */}
      <dl className="legende">
        {(Object.keys(TOESTANDEN) as SessieToestand[]).map((naam) => {
          const toestand = TOESTANDEN[naam];
          return (
            <div key={naam}>
              <dt>
                <span className={`vlag-icoon ${toestand.klasse}`} aria-hidden="true">
                  {toestand.icoon}
                </span>
                {toestand.label}
              </dt>
              <dd>{toestand.uitleg}</dd>
            </div>
          );
        })}
        <div>
          <dt>
            <span className="ster" aria-hidden="true">
              *
            </span>
            Richtprijs
          </dt>
          <dd>
            berekend met een tarief dat nog niet bevestigd is. Een rapport vertrekt pas
            met een bevestigd tarief, dus daar kan het bedrag nog van afwijken.
          </dd>
        </div>
      </dl>
    </>
  );
}
