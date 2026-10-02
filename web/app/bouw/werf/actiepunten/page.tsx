import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { dagenTekst, dagenTussen, korteDatum, vandaag } from "@/lib/bouw/kalender";
import { dringendheid } from "@/lib/bouw/keuzes";
import { lijstPartijen } from "@/lib/bouw/opslag";
import type { Actiepunt } from "@/lib/bouw/werf";
import { lijstActiepunten } from "@/lib/bouw/werf-opslag";
import type { Partij } from "@/lib/bouw/types";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Partijkeuze } from "../../keuzes/velden";
import { Melding } from "../../melding";
import { verwijderActiepuntActie, voegActiepuntToeActie, wijzigActiepuntActie, zetActiepuntActie } from "../acties";
import { Werfmenu } from "../werfmenu";

export const dynamic = "force-dynamic";

const VLAG = { te_laat: "fout", week: "let-op", maand: "", later: "" } as const;

function Puntvelden({ punt, partijen, voorvoegsel }: { punt?: Actiepunt; partijen: Partij[]; voorvoegsel: string }) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-titel`}>Wat</label>
          <input id={`${voorvoegsel}-titel`} name="titel" defaultValue={punt?.titel ?? ""} required placeholder="Stelling afbreken" />
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Wie" partijen={partijen} gekozen={punt?.partij_id} />
        <div>
          <label htmlFor={`${voorvoegsel}-deadline`}>Tegen</label>
          <input id={`${voorvoegsel}-deadline`} name="deadline" type="date" defaultValue={punt?.deadline ?? ""} />
        </div>
      </div>
      <div>
        <label htmlFor={`${voorvoegsel}-omschrijving`}>Meer uitleg</label>
        <input id={`${voorvoegsel}-omschrijving`} name="omschrijving" defaultValue={punt?.omschrijving ?? ""} />
      </div>
    </>
  );
}

export default async function Actiepuntenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; punt?: string }>;
}) {
  const { melding, soort, punt: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const [punten, partijen] = await Promise.all([lijstActiepunten(), lijstPartijen()]);
  const nu = vandaag();
  const partijnaam = (partijId: number | null) => partijen.find((p) => p.id === partijId)?.naam ?? null;
  const open = punten
    .filter((punt) => punt.status === "open")
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.id - b.id);
  const klaar = punten.filter((punt) => punt.status === "klaar").sort((a, b) => (b.klaar_op ?? "").localeCompare(a.klaar_op ?? ""));
  const teWijzigen = punten.find((punt) => punt.id === leesId(gevraagd ?? ""));

  return (
    <>
      <h1>Actiepunten</h1>
      <p className="inleiding">
        Wat er moet gebeuren, door wie en tegen wanneer: uit de werfvergadering, of wat je zelf opmerkt. De bot van Bouw
        herinnert de dag ervoor.
      </p>

      <Werfmenu actief="/bouw/werf/actiepunten" />
      <Melding soort={soort} melding={melding} />

      {teWijzigen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{teWijzigen.titel}</h2>
          <form action={wijzigActiepuntActie}>
            <input type="hidden" name="punt_id" value={teWijzigen.id} />
            <Puntvelden punt={teWijzigen} partijen={partijen} voorvoegsel="wijzig" />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop vraag={`"${teWijzigen.titel}" verwijderen?`} formAction={verwijderActiepuntActie}>
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href="/bouw/werf/actiepunten">
                Sluiten
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      <h2>Open</h2>
      {open.length === 0 ? (
        <p className="hulp">Niets open.</p>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Wat</th>
                <th>Wie</th>
                <th>Tegen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((punt) => {
                const dagen = punt.deadline ? dagenTussen(nu, punt.deadline) : null;
                const vlag = dagen === null ? "" : VLAG[dringendheid(dagen)];
                return (
                  <tr key={punt.id}>
                    <td data-label="Wat">
                      {punt.titel}
                      {punt.omschrijving ? <div className="hulp">{punt.omschrijving}</div> : null}
                    </td>
                    <td data-label="Wie">{partijnaam(punt.partij_id) ?? "—"}</td>
                    <td data-label="Tegen">
                      {punt.deadline && dagen !== null ? (
                        <span>
                          {korteDatum(punt.deadline, nu)} <span className={vlag ? `label-vlag ${vlag}` : "hulp"}>{dagenTekst(dagen)}</span>
                        </span>
                      ) : (
                        <span className="hulp">geen datum</span>
                      )}
                    </td>
                    <td>
                      <form action={zetActiepuntActie} className="knoppenrij">
                        <input type="hidden" name="punt_id" value={punt.id} />
                        <input type="hidden" name="klaar" value="ja" />
                        <button type="submit">Klaar</button>
                        <Link className="knop stil" href={`/bouw/werf/actiepunten?punt=${punt.id}#wijzigen`}>
                          Wijzigen
                        </Link>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Actiepunt toevoegen</h2>
      <form action={voegActiepuntToeActie} className="kaart">
        <Puntvelden partijen={partijen} voorvoegsel="nieuw" />
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      {klaar.length > 0 ? (
        <details style={{ marginTop: 18 }}>
          <summary>
            <strong>Klaar</strong> <span className="hulp">({klaar.length})</span>
          </summary>
          <ul className="wijzigingen">
            {klaar.map((punt) => (
              <li key={punt.id}>
                <form action={zetActiepuntActie} className="regelformulier">
                  <input type="hidden" name="punt_id" value={punt.id} />
                  <input type="hidden" name="klaar" value="nee" />
                  {punt.titel}
                  {partijnaam(punt.partij_id) ? <span className="hulp"> · {partijnaam(punt.partij_id)}</span> : null}
                  {punt.klaar_op ? <span className="hulp"> · klaar {datumTijd(punt.klaar_op)}</span> : null}{" "}
                  <button type="submit" className="link">
                    terug open
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
