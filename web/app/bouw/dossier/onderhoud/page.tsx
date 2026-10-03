import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { sleutelVan, id as leesId } from "@/lib/bouw/invoer";
import { dagenTekst, korteDatum, vandaag } from "@/lib/bouw/kalender";
import { STANDAARDONDERHOUD, intervalTekst, onderhoudsstand, type Onderhoud } from "@/lib/bouw/nazorg";
import { lijstBeurten, lijstOnderhoud } from "@/lib/bouw/nazorg-opslag";
import { lijstPartijen } from "@/lib/bouw/opslag";
import type { Partij } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "../../bevestig-knop";
import { Partijkeuze } from "../../keuzes/velden";
import { Melding } from "../../melding";
import {
  beurtActie,
  verwijderBeurtActie,
  verwijderOnderhoudActie,
  voegOnderhoudToeActie,
  voegStandaardonderhoudToeActie,
  wijzigOnderhoudActie,
} from "../acties";
import { Dossiermenu } from "../dossiermenu";

export const dynamic = "force-dynamic";

const VLAG = { te_laat: "fout", binnenkort: "let-op", later: "" } as const;

function Onderhoudvelden({ onderhoud, partijen, voorvoegsel }: { onderhoud?: Onderhoud; partijen: Partij[]; voorvoegsel: string }) {
  return (
    <div className="veldenrij">
      <div>
        <label htmlFor={`${voorvoegsel}-wat`}>Wat</label>
        <input id={`${voorvoegsel}-wat`} name="wat" defaultValue={onderhoud?.wat ?? ""} required maxLength={200} placeholder="Filters van de ventilatie vervangen" />
      </div>
      <div>
        <label htmlFor={`${voorvoegsel}-interval`}>Om de hoeveel maanden</label>
        <input
          id={`${voorvoegsel}-interval`}
          name="interval_maanden"
          type="number"
          min={1}
          max={240}
          defaultValue={onderhoud?.interval_maanden ?? 12}
          required
        />
      </div>
      <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Door" partijen={partijen} gekozen={onderhoud?.partij_id} />
    </div>
  );
}

export default async function Onderhoudspagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string; onderhoud?: string }>;
}) {
  const { melding, soort, onderhoud: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const [onderhoud, beurten, partijen] = await Promise.all([
    lijstOnderhoud(huis.id),
    lijstBeurten(huis.id),
    lijstPartijen(huis.id),
  ]);
  const nu = vandaag();
  const partijnaam = (partijId: number | null) => partijen.find((p) => p.id === partijId)?.naam ?? null;
  const metStand = onderhoud
    .map((item) => ({ item, ...onderhoudsstand(item, nu) }))
    .sort((a, b) => Number(!a.item.laatst_gedaan) - Number(!b.item.laatst_gedaan) || a.volgende.localeCompare(b.volgende));
  const ontbrekend = STANDAARDONDERHOUD.filter((s) => !onderhoud.some((o) => sleutelVan(o.wat) === sleutelVan(s.wat)));
  const teWijzigen = onderhoud.find((o) => o.id === leesId(gevraagd ?? ""));
  const beurtenVan = (onderhoudId: number) => beurten.filter((beurt) => beurt.onderhoud_id === onderhoudId);

  return (
    <>
      <h1>Onderhoud</h1>
      <p className="inleiding">
        Wat regelmatig moet gebeuren, en wanneer het weer aan de beurt is. Noteer een beurt met één tik; de bot van
        Bouw herinnert een week vooraf en op de dag zelf.
      </p>

      <Dossiermenu actief="/bouw/dossier/onderhoud" />
      <Melding soort={soort} melding={melding} />

      {teWijzigen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{teWijzigen.wat}</h2>
          <form action={wijzigOnderhoudActie.bind(null, huis.id)}>
            <input type="hidden" name="onderhoud_id" value={teWijzigen.id} />
            <Onderhoudvelden onderhoud={teWijzigen} partijen={partijen} voorvoegsel="wijzig" />
            <div>
              <label htmlFor="wijzig-opmerking">Opmerking</label>
              <input id="wijzig-opmerking" name="opmerking" defaultValue={teWijzigen.opmerking ?? ""} />
            </div>
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop
                vraag={`${teWijzigen.wat} verwijderen, met alle beurten?`}
                formAction={verwijderOnderhoudActie.bind(null, huis.id)}
              >
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href="/bouw/dossier/onderhoud">
                Sluiten
              </Link>
            </div>
          </form>
          {beurtenVan(teWijzigen.id).length > 0 ? (
            <>
              <h3>Beurten</h3>
              <ul className="beurtenlijst">
                {beurtenVan(teWijzigen.id).map((beurt) => (
                  <li key={beurt.id}>
                    <form action={verwijderBeurtActie.bind(null, huis.id)}>
                      <input type="hidden" name="beurt_id" value={beurt.id} />
                      <span>
                        {korteDatum(beurt.datum, nu)}
                        <span className="hulp">{[beurt.door, beurt.opmerking].filter(Boolean).map((x) => ` · ${x}`)}</span>
                      </span>
                      <BevestigKnop vraag={`De beurt van ${korteDatum(beurt.datum, nu)} schrappen?`} className="stil">
                        Schrappen
                      </BevestigKnop>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="hulp">Een beurt die bij het verkeerde onderhoud staat, schrap je hier. Laatst gedaan wordt dan weer de vorige beurt.</p>
            </>
          ) : null}
        </section>
      ) : null}

      {onderhoud.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog niets gepland.</p>
          <form action={voegStandaardonderhoudToeActie.bind(null, huis.id)}>
            <button type="submit">Begin met het gewone onderhoud</button>
          </form>
          <p className="hulp" style={{ marginTop: 8 }}>
            Ventilatiefilters, warmtepomp, rookmelders, dakgoten, sifons, siliconevoegen en zo verder (
            {STANDAARDONDERHOUD.length} in totaal). Wat je niet hebt, verwijder je.
          </p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Wat</th>
                <th>Hoe vaak</th>
                <th>Laatst</th>
                <th>Volgende keer</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metStand.map(({ item, volgende, dagen, stand }) => {
                const eigen = beurtenVan(item.id);
                return (
                  <tr key={item.id}>
                    <td data-label="Wat">
                      {item.wat}
                      {partijnaam(item.partij_id) || item.opmerking ? (
                        <div className="hulp">{[partijnaam(item.partij_id), item.opmerking].filter(Boolean).join(" · ")}</div>
                      ) : null}
                    </td>
                    <td data-label="Hoe vaak">{intervalTekst(item.interval_maanden)}</td>
                    <td data-label="Laatst">
                      {item.laatst_gedaan ? korteDatum(item.laatst_gedaan, nu) : <span className="hulp">nog nooit</span>}
                      {eigen.length > 1 ? <div className="hulp">{eigen.length} keer</div> : null}
                    </td>
                    <td data-label="Volgende keer">
                      {item.laatst_gedaan ? (
                        <span>
                          {korteDatum(volgende, nu)} <span className={`label-vlag ${VLAG[stand]}`}>{dagenTekst(dagen)}</span>
                        </span>
                      ) : (
                        <span className="hulp">na de eerste beurt</span>
                      )}
                    </td>
                    <td>
                      <form action={beurtActie.bind(null, huis.id)} className="knoppenrij">
                        <input type="hidden" name="onderhoud_id" value={item.id} />
                        <button type="submit">Vandaag gedaan</button>
                        <Link className="knop stil" href={`/bouw/dossier/onderhoud?onderhoud=${item.id}#wijzigen`}>
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

      {onderhoud.length > 0 ? (
        <details className="kaart" style={{ marginTop: 16 }}>
          <summary>Een beurt van een andere dag noteren</summary>
          <form action={beurtActie.bind(null, huis.id)} style={{ marginTop: 12 }}>
            <div className="veldenrij">
              <div>
                <label htmlFor="beurt-onderhoud">Wat</label>
                <select id="beurt-onderhoud" name="onderhoud_id" required>
                  {onderhoud.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.wat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="beurt-datum">Op</label>
                <input id="beurt-datum" name="datum" type="date" max={nu} defaultValue={nu} required />
              </div>
              <div>
                <label htmlFor="beurt-opmerking">Opmerking</label>
                <input id="beurt-opmerking" name="opmerking" placeholder="Filter G4 en F7" />
              </div>
            </div>
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Noteren</button>
            </div>
          </form>
        </details>
      ) : null}

      <h2>Onderhoud toevoegen</h2>
      <form action={voegOnderhoudToeActie.bind(null, huis.id)} className="kaart">
        <Onderhoudvelden partijen={partijen} voorvoegsel="nieuw" />
        <div className="veldenrij">
          <div>
            <label htmlFor="nieuw-laatst">Laatst gedaan</label>
            <input id="nieuw-laatst" name="laatst_gedaan" type="date" max={nu} />
          </div>
        </div>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>

      {onderhoud.length > 0 && ontbrekend.length > 0 ? (
        <form action={voegStandaardonderhoudToeActie.bind(null, huis.id)} className="hulp" style={{ marginTop: 12 }}>
          Nog niet in de lijst: {ontbrekend.map((s) => s.wat).join(", ")}.{" "}
          <button type="submit" className="link">
            Zet ze erbij
          </button>
        </form>
      ) : null}
    </>
  );
}
