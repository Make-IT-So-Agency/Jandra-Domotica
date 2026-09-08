import Link from "next/link";

import { zonneKwh } from "@/lib/billing";
import { datumTijd, kwh } from "@/lib/format";
import { kwartaalPeriode, kwartaalVan, lokaleOnderdelen, maandPeriode } from "@/lib/periods";
import {
  isHoofdbeheerder,
  magInstellingenBeheren,
  zichtbareVennootschappen,
  type Gebruiker,
} from "@/lib/rollen";
import { leesInstellingen } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { leesTarieven } from "@/lib/tariffs";
import { vereistGebruiker } from "@/lib/toegang";
import type { Laadpaal, Laadsessie, Vennootschap } from "@/lib/types";

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
      };
    }
    maandVraag = maandVraag.in("loadpoint_name", eigenNamen);
    recentVraag = recentVraag.in("loadpoint_name", eigenNamen);
  }

  const [maandResultaat, recentResultaat] = await Promise.all([maandVraag, recentVraag]);

  const vennootschappen = ((vennResultaat.data ?? []) as Vennootschap[]).filter(
    (vennootschap) => beperking === null || beperking.includes(vennootschap.id),
  );

  // Tariefmeldingen zijn enkel zinvol voor wie ze kan oplossen.
  let tariefOntbreekt: string | null = null;
  let tariefOnbevestigd: string | null = null;

  if (magInstellingenBeheren(gebruiker)) {
    const instellingen = await leesInstellingen();
    const { jaar: kJaar, kwartaal } = kwartaalVan(nu);
    const kwartaalStart = kwartaalPeriode(kJaar, kwartaal).start;
    const tarieven = await leesTarieven(instellingen.regio);
    const huidigTarief = tarieven.find((tarief) => tarief.period_start === kwartaalStart);

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
  const kwhDezeMaand = overzicht.sessiesDezeMaand
    .filter((sessie) => sessie.is_complete)
    .reduce((som, sessie) => som + Number(sessie.energy_kwh ?? 0), 0);

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
          <div className="melding goed">
            Alles staat klaar. Je kan meteen een rapport maken bij{" "}
            <Link href="/rapporten">Rapporten</Link>.
          </div>
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
          <div className="waarde">{kwh(kwhDezeMaand)}</div>
          <div className="bij">
            {overzicht.sessiesDezeMaand.filter((sessie) => sessie.is_complete).length} sessies
          </div>
        </div>
        <div className="tegel">
          <div className="label">Laadpalen</div>
          <div className="waarde">{overzicht.eigenLaadpalen.length}</div>
          <div className="bij">
            {!beheerder
              ? "van jouw vennootschap"
              : overzicht.nietGekoppeld.length === 0
                ? "allemaal gekoppeld"
                : `${overzicht.nietGekoppeld.length} nog te koppelen`}
          </div>
        </div>
        {beheerder ? (
          <div className="tegel">
            <div className="label">Vennootschappen</div>
            <div className="waarde">{overzicht.vennootschappen.length}</div>
            <div className="bij">die kosten terugbetalen</div>
          </div>
        ) : null}
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
                <th>Voertuig</th>
                <th className="getal">kWh</th>
                <th className="getal">Zon</th>
                <th className="getal">Zon (kWh)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overzicht.laatsteSessies.map((sessie) => (
                <tr key={sessie.id}>
                  <td data-label="Gestart">{datumTijd(sessie.started_at)}</td>
                  <td data-label="Laadpaal">{sessie.loadpoint_name ?? "—"}</td>
                  <td data-label="Voertuig">{sessie.vehicle ?? "—"}</td>
                  <td data-label="kWh" className="getal">{kwh(sessie.energy_kwh)}</td>
                  <td data-label="Zon" className="getal">
                    {sessie.solar_percentage === null
                      ? "—"
                      : `${Math.round(Number(sessie.solar_percentage))} %`}
                  </td>
                  <td data-label="Zon (kWh)" className="getal">
                    {kwh(zonneKwh(sessie.energy_kwh, sessie.solar_percentage))}
                  </td>
                  <td data-label="Status">
                    <span
                      className={`label-vlag ${sessie.is_complete ? "goed" : "let-op"}`}
                    >
                      {sessie.is_complete ? "afgerond" : "loopt nog"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hulp" style={{ marginTop: 12 }}>
        Bedragen staan hier bewust niet bij: die worden pas berekend in een rapport, met het
        bevestigde tarief van het kwartaal waarin de sessie viel.
      </p>
    </>
  );
}
