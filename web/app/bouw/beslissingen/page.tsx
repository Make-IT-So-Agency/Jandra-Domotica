import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vandaag } from "@/lib/bouw/kalender";
import { lijstBeslissingen, type Bouwbeslissing } from "@/lib/bouw/regie-opslag";
import { datum } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../bevestig-knop";
import { Melding } from "../melding";
import { verwijderBeslissingActie, voegBeslissingToeActie } from "./acties";

export const dynamic = "force-dynamic";

export default async function Beslissingenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let beslissingen: Bouwbeslissing[];
  try {
    beslissingen = await lijstBeslissingen();
  } catch (fout) {
    return (
      <>
        <h1>Beslissingen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  return (
    <>
      <h1>Beslissingen</h1>
      <p className="inleiding">
        Wat we wanneer beslist hebben. Een definitieve <Link href="/bouw/keuzes">keuze</Link> schrijft hier zelf een
        regel bij; andere beslissingen, zoals geen kelder of systeem D, zet je er met de hand bij.
      </p>

      <Melding soort={soort} melding={melding} />

      {beslissingen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen beslissingen.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Onderwerp</th>
                <th>Beslissing</th>
                <th>Door</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {beslissingen.map((beslissing) => (
                <tr key={beslissing.id}>
                  <td data-label="Datum">{datum(beslissing.datum)}</td>
                  <td data-label="Onderwerp">
                    {beslissing.keuze_id ? (
                      <Link href={`/bouw/keuzes/${beslissing.keuze_id}`}>{beslissing.onderwerp}</Link>
                    ) : (
                      beslissing.onderwerp
                    )}
                  </td>
                  <td data-label="Beslissing">{beslissing.beslissing}</td>
                  <td data-label="Door">{beslissing.door ?? "—"}</td>
                  <td>
                    {beslissing.keuze_id === null ? (
                      <form action={verwijderBeslissingActie}>
                        <input type="hidden" name="id" value={beslissing.id} />
                        <BevestigKnop vraag="Deze beslissing uit het log halen?" className="stil">
                          Verwijderen
                        </BevestigKnop>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Beslissing toevoegen</h2>
      <form action={voegBeslissingToeActie} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="beslissing-datum">Datum</label>
            <input id="beslissing-datum" name="datum" type="date" defaultValue={vandaag()} />
          </div>
          <div>
            <label htmlFor="beslissing-onderwerp">Onderwerp</label>
            <input id="beslissing-onderwerp" name="onderwerp" required placeholder="Kelder" />
          </div>
          <div>
            <label htmlFor="beslissing-tekst">Beslissing</label>
            <input id="beslissing-tekst" name="beslissing" required placeholder="Geen kelder, wel een berging naast de garage" />
          </div>
        </div>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>
    </>
  );
}
