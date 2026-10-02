import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { dagenTekst, dagenTussen, korteDatum, vandaag } from "@/lib/bouw/kalender";
import {
  CATEGORIEEN_KEUZE,
  CATEGORIENAMEN_KEUZE,
  EENHEDEN,
  EENHEIDNAMEN,
  STANDAARDKEUZES,
  deadlineVan,
  dringendheid,
  euroRond,
  hoeveelheidVan,
  meerprijzen,
  type Keuze,
  type Optie,
  type Voorkeur,
} from "@/lib/bouw/keuzes";
import { sleutelVan } from "@/lib/bouw/invoer";
import { lijstRuimtes } from "@/lib/bouw/opslag";
import { lijstKeuzes, lijstOpties, lijstPlanning, lijstVoorkeuren } from "@/lib/bouw/regie-opslag";
import type { Planningsitem } from "@/lib/bouw/planning";
import type { Ruimte } from "@/lib/bouw/types";
import { datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Melding } from "../melding";
import { voegKeuzeToeActie, voegStandaardkeuzesToeActie } from "./acties";
import { Planningskeuze } from "./velden";

export const dynamic = "force-dynamic";

const VLAG = { te_laat: "fout", week: "let-op", maand: "", later: "" } as const;

/** "€ 3.080 – € 3.600", of één bedrag, of niets. */
function prijsbereik(kosten: (number | null)[]): string {
  const bekend = kosten.filter((kost): kost is number => kost !== null);
  if (bekend.length === 0) return "";
  const laagste = Math.min(...bekend);
  const hoogste = Math.max(...bekend);
  return laagste === hoogste ? euroRond(laagste) : `${euroRond(laagste)} – ${euroRond(hoogste)}`;
}

export default async function Keuzespagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  let keuzes: Keuze[];
  let opties: Optie[];
  let voorkeuren: Voorkeur[];
  let planning: Planningsitem[];
  let ruimtes: Ruimte[];
  try {
    [keuzes, opties, voorkeuren, planning, ruimtes] = await Promise.all([
      lijstKeuzes(),
      lijstOpties(),
      lijstVoorkeuren(),
      lijstPlanning(),
      lijstRuimtes(),
    ]);
  } catch (fout) {
    return (
      <>
        <h1>Keuzes</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = vandaag();
  const oppervlakte = new Map(ruimtes.map((ruimte) => [ruimte.id, ruimte.oppervlakte_m2]));
  const perKeuze = (keuze: Keuze) => {
    const eigen = opties.filter((optie) => optie.keuze_id === keuze.id);
    const hoeveelheid = hoeveelheidVan(
      keuze,
      keuze.ruimte_ids.flatMap((ruimteId) => (oppervlakte.has(ruimteId) ? [oppervlakte.get(ruimteId)!] : [])),
    );
    return { eigen, prijzen: meerprijzen(eigen, hoeveelheid.waarde) };
  };

  const open = keuzes
    .filter((keuze) => keuze.gekozen_optie_id === null)
    .map((keuze) => ({ keuze, deadline: deadlineVan(keuze, planning) }))
    .sort(
      (a, b) =>
        (a.deadline?.datum ?? "9999").localeCompare(b.deadline?.datum ?? "9999") ||
        a.keuze.titel.localeCompare(b.keuze.titel, "nl-BE"),
    );
  const beslist = keuzes
    .filter((keuze) => keuze.gekozen_optie_id !== null)
    .sort((a, b) => (b.beslist_op ?? "").localeCompare(a.beslist_op ?? ""));
  const ontbrekend = STANDAARDKEUZES.filter(
    (standaard) => !keuzes.some((keuze) => sleutelVan(keuze.titel) === sleutelVan(standaard.titel)),
  );

  return (
    <>
      <h1>Keuzes</h1>
      <p className="inleiding">
        Wat we nog moeten kiezen, met de opties, onze voorkeur en de meerprijs. Een definitieve keuze komt in het{" "}
        <Link href="/bouw/beslissingen">beslissingslog</Link>.
      </p>

      <Melding soort={soort} melding={melding} />

      {keuzes.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen keuzes.</p>
          <form action={voegStandaardkeuzesToeActie}>
            <button type="submit">Begin met de gewone keuzes</button>
          </form>
          <p className="hulp" style={{ marginTop: 8 }}>
            Gevelsteen, dakbedekking, ramen, vloeren, keuken, warmtepomp en zo verder ({STANDAARDKEUZES.length} in
            totaal). Wat je niet nodig hebt, verwijder je gewoon.
          </p>
        </div>
      ) : null}

      {open.length > 0 ? (
        <>
          <h2>Te beslissen</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Keuze</th>
                  <th>Beslissen tegen</th>
                  <th>Opties</th>
                  <th>Voorkeur</th>
                </tr>
              </thead>
              <tbody>
                {open.map(({ keuze, deadline }) => {
                  const { eigen, prijzen } = perKeuze(keuze);
                  const resterend = deadline ? dagenTussen(nu, deadline.datum) : null;
                  const vlag = resterend === null ? "" : VLAG[dringendheid(resterend)];
                  const keuzeVoorkeuren = voorkeuren.filter((voorkeur) => voorkeur.keuze_id === keuze.id);
                  return (
                    <tr key={keuze.id}>
                      <td data-label="Keuze">
                        <Link href={`/bouw/keuzes/${keuze.id}`}>{keuze.titel}</Link>
                        <div className="hulp">{CATEGORIENAMEN_KEUZE[keuze.categorie]}</div>
                      </td>
                      <td data-label="Beslissen tegen">
                        {deadline && resterend !== null ? (
                          <>
                            {korteDatum(deadline.datum, nu)}{" "}
                            <span className={vlag ? `label-vlag ${vlag}` : "hulp"}>{dagenTekst(resterend)}</span>
                            {deadline.bron === "planning" ? <div className="hulp">volgt uit de planning</div> : null}
                          </>
                        ) : (
                          <span className="hulp">geen deadline</span>
                        )}
                      </td>
                      <td data-label="Opties">
                        {eigen.length === 0 ? (
                          <span className="hulp">nog geen</span>
                        ) : (
                          <>
                            {eigen.length}
                            <span className="hulp"> · {prijsbereik(eigen.map((optie) => prijzen.get(optie.id)?.kost ?? null))}</span>
                          </>
                        )}
                      </td>
                      <td data-label="Voorkeur">
                        {keuzeVoorkeuren.length === 0
                          ? "—"
                          : keuzeVoorkeuren
                              .map((voorkeur) => `${voorkeur.naam}: ${eigen.find((optie) => optie.id === voorkeur.optie_id)?.naam ?? "?"}`)
                              .join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {beslist.length > 0 ? (
        <>
          <h2>Beslist</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Keuze</th>
                  <th>Gekozen</th>
                  <th className="getal">Kost</th>
                  <th>Beslist</th>
                </tr>
              </thead>
              <tbody>
                {beslist.map((keuze) => {
                  const { eigen, prijzen } = perKeuze(keuze);
                  const gekozen = eigen.find((optie) => optie.id === keuze.gekozen_optie_id);
                  const prijs = gekozen ? prijzen.get(gekozen.id) : undefined;
                  return (
                    <tr key={keuze.id}>
                      <td data-label="Keuze">
                        <Link href={`/bouw/keuzes/${keuze.id}`}>{keuze.titel}</Link>
                      </td>
                      <td data-label="Gekozen">{gekozen?.naam ?? "—"}</td>
                      <td data-label="Kost" className="getal">
                        {prijs?.kost !== null && prijs?.kost !== undefined ? euroRond(prijs.kost) : "—"}
                      </td>
                      <td data-label="Beslist">
                        {datumTijd(keuze.beslist_op)}
                        {keuze.beslist_door ? <span className="hulp"> · {keuze.beslist_door}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <hr className="scheiding" />

      <h2>Keuze toevoegen</h2>
      <form action={voegKeuzeToeActie} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="nieuw-titel">Titel</label>
            <input id="nieuw-titel" name="titel" required placeholder="Gevelsteen" />
          </div>
          <div>
            <label htmlFor="nieuw-categorie">Categorie</label>
            <select id="nieuw-categorie" name="categorie" defaultValue="andere">
              {CATEGORIEEN_KEUZE.map((categorie) => (
                <option key={categorie} value={categorie}>
                  {CATEGORIENAMEN_KEUZE[categorie]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nieuw-eenheid">Prijs van een optie</label>
            <select id="nieuw-eenheid" name="eenheid" defaultValue="totaal">
              {EENHEDEN.map((eenheid) => (
                <option key={eenheid} value={eenheid}>
                  {EENHEIDNAMEN[eenheid]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="veldenrij">
          <div>
            <label htmlFor="nieuw-deadline">Beslissen tegen</label>
            <input id="nieuw-deadline" name="deadline" type="date" />
          </div>
          <Planningskeuze voorvoegsel="nieuw" planning={planning} />
          <div>
            <label htmlFor="nieuw-levertermijn">Levertermijn (weken)</label>
            <input id="nieuw-levertermijn" name="levertermijn_weken" inputMode="numeric" placeholder="12" />
          </div>
        </div>
        <p className="hulp">
          Zonder datum volgt de deadline uit de taak die het nodig heeft: haar begin, min de levertermijn en een week om
          te bestellen.
        </p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      {keuzes.length > 0 && ontbrekend.length > 0 ? (
        <form action={voegStandaardkeuzesToeActie} className="hulp" style={{ marginTop: 12 }}>
          Nog niet in de lijst: {ontbrekend.map((standaard) => standaard.titel).join(", ")}.{" "}
          <button type="submit" className="link">
            Zet ze erbij
          </button>
        </form>
      ) : null}
    </>
  );
}
