import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { lijstPartijen } from "@/lib/bouw/opslag";
import {
  RONDES,
  RONDENAMEN,
  STAPNAMEN,
  STATUSNAMEN_OPLEVERPUNT,
  isRonde,
  opleverstand,
  stappenVoor,
  type Opleverpunt,
  type StatusOpleverpunt,
} from "@/lib/bouw/werf";
import { fotoUrls, laadPlaatsen, ruimtenaamIn } from "@/lib/bouw/werf-laden";
import { lijstOpleverpunten, lijstWerffotos } from "@/lib/bouw/werf-opslag";
import type { Partij } from "@/lib/bouw/types";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Partijkeuze } from "../../keuzes/velden";
import { Melding } from "../../melding";
import {
  meldAllesActie,
  verwijderOpleverpuntActie,
  voegOpleverpuntToeActie,
  wijzigOpleverpuntActie,
  zetOpleverstapActie,
} from "../acties";
import { Galerij } from "../galerij";
import { Plaatskeuze } from "../plaatskeuze";
import { Werffotoknop } from "../werffotoknop";
import { Werfmenu } from "../werfmenu";

export const dynamic = "force-dynamic";

const VLAG: Record<StatusOpleverpunt, string> = { open: "", gemeld: "", hersteld: "let-op", gecontroleerd: "goed" };
/** Wat eerst nagekeken moet worden, eerst. */
const VOLGORDE: Record<StatusOpleverpunt, number> = { hersteld: 0, open: 1, gemeld: 2, gecontroleerd: 3 };

function Puntvelden({ punt, partijen, voorvoegsel }: { punt?: Opleverpunt; partijen: Partij[]; voorvoegsel: string }) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-titel`}>Wat is er niet in orde</label>
          <input id={`${voorvoegsel}-titel`} name="titel" defaultValue={punt?.titel ?? ""} required maxLength={200} placeholder="Barst in de voeg naast de deur" />
        </div>
        <Partijkeuze
          voorvoegsel={voorvoegsel}
          naam="partij_id"
          label="Aannemer"
          partijen={partijen.filter((p) => p.soort === "aannemer" || p.soort === "leverancier" || p.id === punt?.partij_id)}
          gekozen={punt?.partij_id}
        />
        <div>
          <label htmlFor={`${voorvoegsel}-ronde`}>Ronde</label>
          <select id={`${voorvoegsel}-ronde`} name="ronde" defaultValue={punt?.ronde ?? "voorlopig"}>
            {RONDES.map((ronde) => (
              <option key={ronde} value={ronde}>
                {RONDENAMEN[ronde]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${voorvoegsel}-omschrijving`}>Meer uitleg</label>
        <input id={`${voorvoegsel}-omschrijving`} name="omschrijving" defaultValue={punt?.omschrijving ?? ""} />
      </div>
    </>
  );
}

export default async function Opleveringpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; partij?: string; ronde?: string; alles?: string; punt?: string }>;
}) {
  const { melding, soort, partij, ronde, alles, punt: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const [punten, partijen, plaatsen] = await Promise.all([lijstOpleverpunten(), lijstPartijen(), laadPlaatsen()]);
  const partijId = leesId(partij ?? "");
  const gekozenRonde = ronde && isRonde(ronde) ? ronde : null;
  const metAfgewerkt = alles === "ja";
  const getoond = punten
    .filter((p) => (partijId ? p.partij_id === partijId : true))
    .filter((p) => (gekozenRonde ? p.ronde === gekozenRonde : true))
    .filter((p) => metAfgewerkt || p.status !== "gecontroleerd")
    .sort((a, b) => VOLGORDE[a.status] - VOLGORDE[b.status] || a.id - b.id);
  const fotos = await lijstWerffotos({ opleverpuntIds: getoond.map((p) => p.id) });
  const urls = await fotoUrls(fotos);
  const ruimtenaam = ruimtenaamIn(plaatsen);
  const partijnaam = (id: number | null) => partijen.find((p) => p.id === id)?.naam ?? null;
  const stand = [...opleverstand(punten).entries()].sort(([a], [b]) => (partijnaam(a) ?? "~").localeCompare(partijnaam(b) ?? "~", "nl-BE"));
  const teWijzigen = punten.find((p) => p.id === leesId(gevraagd ?? ""));
  const query = [partijId ? `partij=${partijId}` : "", gekozenRonde ? `ronde=${gekozenRonde}` : "", metAfgewerkt ? "alles=ja" : ""]
    .filter(Boolean)
    .join("&");
  const hier = `/bouw/werf/oplevering${query ? `?${query}` : ""}`;

  return (
    <>
      <h1>Oplevering</h1>
      <p className="inleiding">
        Wat een aannemer nog moet herstellen, per aannemer. Een punt is pas in orde als jullie het nagekeken hebben, niet
        als de aannemer zegt dat het hersteld is.
      </p>

      <Werfmenu actief="/bouw/werf/oplevering" />
      <Melding soort={soort} melding={melding} />

      {teWijzigen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{teWijzigen.titel}</h2>
          <form action={wijzigOpleverpuntActie}>
            <input type="hidden" name="punt_id" value={teWijzigen.id} />
            <Puntvelden punt={teWijzigen} partijen={partijen} voorvoegsel="wijzig" />
            <Plaatskeuze
              plaatsen={plaatsen}
              start={{ verdieping_id: teWijzigen.verdieping_id, ruimte_id: teWijzigen.ruimte_id, x_m: teWijzigen.x_m, y_m: teWijzigen.y_m }}
              voorvoegsel="wijzig-plaats"
            />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop vraag={`"${teWijzigen.titel}" verwijderen?`} formAction={verwijderOpleverpuntActie}>
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href="/bouw/werf/oplevering">
                Sluiten
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      {stand.length > 0 ? (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Aannemer</th>
                <th className="getal">Open</th>
                <th className="getal">Gemeld</th>
                <th className="getal">Na te kijken</th>
                <th className="getal">In orde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stand.map(([id, cijfers]) => (
                <tr key={id ?? "geen"}>
                  <td data-label="Aannemer">
                    {id ? <Link href={`/bouw/werf/oplevering?partij=${id}`}>{partijnaam(id) ?? "?"}</Link> : "Zonder aannemer"}
                  </td>
                  <td data-label="Open" className="getal">
                    {cijfers.open}
                  </td>
                  <td data-label="Gemeld" className="getal">
                    {cijfers.gemeld}
                  </td>
                  <td data-label="Na te kijken" className="getal">
                    {cijfers.hersteld > 0 ? <span className="label-vlag let-op">{cijfers.hersteld}</span> : 0}
                  </td>
                  <td data-label="In orde" className="getal">
                    {cijfers.gecontroleerd}
                  </td>
                  <td>
                    {id ? (
                      <form action={meldAllesActie} className="knoppenrij">
                        <input type="hidden" name="partij_id" value={id} />
                        <input type="hidden" name="terug" value={hier} />
                        <a className="knop stil" href={`/api/bouw/oplevering/${id}/pdf`}>
                          PDF
                        </a>
                        {cijfers.open > 0 ? (
                          <button type="submit" className="stil" title="Als je de aannemer de lijst bezorgd hebt">
                            Alles gemeld
                          </button>
                        ) : null}
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form method="get" className="knoppenrij filter" style={{ margin: "16px 0" }}>
        <select name="partij" defaultValue={partijId ?? ""} aria-label="Aannemer">
          <option value="">alle aannemers</option>
          {partijen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.naam}
            </option>
          ))}
        </select>
        <select name="ronde" defaultValue={gekozenRonde ?? ""} aria-label="Ronde">
          <option value="">alle rondes</option>
          {RONDES.map((r) => (
            <option key={r} value={r}>
              {RONDENAMEN[r]}
            </option>
          ))}
        </select>
        <label className="keuzevak">
          <input type="checkbox" name="alles" value="ja" defaultChecked={metAfgewerkt} /> ook wat in orde is
        </label>
        <button type="submit" className="stil">
          Toon
        </button>
      </form>

      {getoond.length === 0 ? (
        <div className="kaart">
          <p className="leeg">{punten.length === 0 ? "Nog geen opleverpunten." : "Niets dat hier past."}</p>
        </div>
      ) : (
        <ol className="opleverpunten">
          {getoond.map((punt) => {
            const eigen = fotos.filter((f) => f.opleverpunt_id === punt.id);
            const stappen = stappenVoor(punt.status, "wij");
            return (
              <li key={punt.id} className="kaart">
                <div className="opleverpunt-kop">
                  <strong>{punt.titel}</strong>{" "}
                  <span className={`label-vlag ${VLAG[punt.status]}`}>{STATUSNAMEN_OPLEVERPUNT[punt.status]}</span>
                </div>
                <p className="hulp">
                  {[partijnaam(punt.partij_id), ruimtenaam(punt.ruimte_id), RONDENAMEN[punt.ronde]].filter(Boolean).join(" · ")}
                </p>
                {punt.omschrijving ? <p>{punt.omschrijving}</p> : null}
                {punt.herstelopmerking ? (
                  <p className="hulp">
                    {punt.status === "hersteld" ? `${punt.hersteld_door ?? "De aannemer"}: ` : ""}&quot;{punt.herstelopmerking}&quot;
                  </p>
                ) : null}
                <p className="hulp">
                  {[
                    punt.gemeld_op ? `gemeld ${datumTijd(punt.gemeld_op)}` : null,
                    punt.hersteld_op ? `hersteld ${datumTijd(punt.hersteld_op)}` : null,
                    punt.gecontroleerd_op ? `in orde ${datumTijd(punt.gecontroleerd_op)}${punt.gecontroleerd_door ? ` (${punt.gecontroleerd_door})` : ""}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {eigen.length > 0 ? <Galerij fotos={eigen} urls={urls} ruimtenaam={ruimtenaam} /> : null}
                <form action={zetOpleverstapActie} className="knoppenrij" style={{ marginTop: 8 }}>
                  <input type="hidden" name="punt_id" value={punt.id} />
                  <input type="hidden" name="terug" value={hier} />
                  {stappen.includes("afkeuren") ? (
                    <input name="opmerking" aria-label="Wat is er niet in orde" placeholder="Wat is er nog niet in orde?" />
                  ) : null}
                  {stappen.map((stap) => (
                    <button
                      key={stap}
                      type="submit"
                      name="stap"
                      value={stap}
                      className={stap === "goedkeuren" || (stap === "melden" && punt.status === "open") ? undefined : "stil"}
                    >
                      {STAPNAMEN[stap]}
                    </button>
                  ))}
                  <Link className="knop stil" href={`/bouw/werf/oplevering?punt=${punt.id}#wijzigen`}>
                    Wijzigen
                  </Link>
                </form>
                <div style={{ marginTop: 8 }}>
                  <Werffotoknop opleverpuntId={punt.id} standaardRuimte={punt.ruimte_id} compact label="📷 Foto erbij" />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <h2>Opleverpunt toevoegen</h2>
      <form action={voegOpleverpuntToeActie} className="kaart">
        <input type="hidden" name="terug" value={hier} />
        <Puntvelden partijen={partijen} voorvoegsel="nieuw" />
        <Plaatskeuze plaatsen={plaatsen} start={{ verdieping_id: null, ruimte_id: null, x_m: null, y_m: null }} voorvoegsel="nieuw-plaats" />
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>
    </>
  );
}
