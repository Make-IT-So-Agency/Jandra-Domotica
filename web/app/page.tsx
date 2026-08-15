import Link from "next/link";

import { datumTijd, kwh } from "@/lib/format";
import { kwartaalPeriode, kwartaalVan, maandPeriode, lokaleOnderdelen } from "@/lib/periods";
import { leesInstellingen } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { leesTarieven } from "@/lib/tariffs";
import type { Laadpaal, Laadsessie, Vennootschap } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Overzicht {
  laatsteSynchronisatie: string | null;
  sessiesDezeMaand: Laadsessie[];
  laatsteSessies: Laadsessie[];
  laadpalen: Laadpaal[];
  vennootschappen: Vennootschap[];
  nietGekoppeld: string[];
  tariefOntbreekt: string | null;
  tariefOnbevestigd: string | null;
}

async function haalOverzicht(): Promise<Overzicht> {
  const nu = new Date();
  const { jaar, maand } = lokaleOnderdelen(nu);
  const maandPeriodeNu = maandPeriode(jaar, maand);
  const supabase = db();

  const [logResultaat, maandResultaat, recentResultaat, palenResultaat, vennResultaat] =
    await Promise.all([
      supabase
        .from("ingest_log")
        .select("received_at")
        .is("error", null)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("*")
        .gte("finished_at", maandPeriodeNu.vanaf.toISOString())
        .lt("finished_at", maandPeriodeNu.tot.toISOString()),
      supabase
        .from("sessions")
        .select("*")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(15),
      supabase.from("loadpoints").select("*").order("name"),
      supabase.from("companies").select("*").order("name"),
    ]);

  const laadpalen = (palenResultaat.data ?? []) as Laadpaal[];
  const instellingen = await leesInstellingen();

  const { jaar: kJaar, kwartaal } = kwartaalVan(nu);
  const kwartaalStart = kwartaalPeriode(kJaar, kwartaal).start;
  const tarieven = await leesTarieven(instellingen.regio);
  const huidigTarief = tarieven.find((tarief) => tarief.period_start === kwartaalStart);

  return {
    laatsteSynchronisatie: logResultaat.data?.received_at ?? null,
    sessiesDezeMaand: (maandResultaat.data ?? []) as Laadsessie[],
    laatsteSessies: (recentResultaat.data ?? []) as Laadsessie[],
    laadpalen,
    vennootschappen: (vennResultaat.data ?? []) as Vennootschap[],
    nietGekoppeld: laadpalen
      .filter((laadpaal) => !laadpaal.company_id)
      .map((laadpaal) => laadpaal.name),
    tariefOntbreekt: huidigTarief ? null : `Q${kwartaal} ${kJaar}`,
    tariefOnbevestigd:
      huidigTarief && !huidigTarief.confirmed_at ? `Q${kwartaal} ${kJaar}` : null,
  };
}

export default async function Overzichtspagina() {
  let overzicht: Overzicht;
  try {
    overzicht = await haalOverzicht();
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

  const kwhDezeMaand = overzicht.sessiesDezeMaand
    .filter((sessie) => sessie.is_complete)
    .reduce((som, sessie) => som + Number(sessie.energy_kwh ?? 0), 0);

  const takenTeDoen: Array<{ tekst: string; link: string; knop: string }> = [];

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

  return (
    <>
      <h1>Overzicht</h1>
      <p className="inleiding">
        Alle laadsessies die evcc kent, klaar om per vennootschap door te rekenen.
      </p>

      {takenTeDoen.length > 0 ? (
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
      )}

      <div className="tegels">
        <div className="tegel">
          <div className="label">Laatste synchronisatie</div>
          <div className="waarde" style={{ fontSize: 17 }}>
            {overzicht.laatsteSynchronisatie
              ? datumTijd(overzicht.laatsteSynchronisatie)
              : "nog nooit"}
          </div>
          <div className="bij">vanuit Home Assistant</div>
        </div>
        <div className="tegel">
          <div className="label">Deze maand geladen</div>
          <div className="waarde">{kwh(kwhDezeMaand)}</div>
          <div className="bij">
            {overzicht.sessiesDezeMaand.filter((sessie) => sessie.is_complete).length} sessies
          </div>
        </div>
        <div className="tegel">
          <div className="label">Laadpalen</div>
          <div className="waarde">{overzicht.laadpalen.length}</div>
          <div className="bij">
            {overzicht.nietGekoppeld.length === 0
              ? "allemaal gekoppeld"
              : `${overzicht.nietGekoppeld.length} nog te koppelen`}
          </div>
        </div>
        <div className="tegel">
          <div className="label">Vennootschappen</div>
          <div className="waarde">{overzicht.vennootschappen.length}</div>
          <div className="bij">die kosten terugbetalen</div>
        </div>
      </div>

      <h2>Laatste laadsessies</h2>
      {overzicht.laatsteSessies.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen sessies ontvangen. Druk in Home Assistant op de knop
            &laquo;Nu synchroniseren&raquo;.
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overzicht.laatsteSessies.map((sessie) => (
                <tr key={sessie.id}>
                  <td>{datumTijd(sessie.started_at)}</td>
                  <td>{sessie.loadpoint_name ?? "—"}</td>
                  <td>{sessie.vehicle ?? "—"}</td>
                  <td className="getal">{kwh(sessie.energy_kwh)}</td>
                  <td className="getal">
                    {sessie.solar_percentage === null
                      ? "—"
                      : `${Math.round(Number(sessie.solar_percentage))} %`}
                  </td>
                  <td>
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
