import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { korteDatum, maandagVan, plusDagen, vandaag } from "@/lib/bouw/kalender";
import { openDeadlines } from "@/lib/bouw/keuzes";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import {
  PLANNINGNAMEN,
  PLANNINGSTATUSNAMEN,
  SOORTEN_PLANNING,
  STATUSSEN_PLANNING,
  duurInDagen,
  groepeer,
  standVan,
  type Planningsitem,
} from "@/lib/bouw/planning";
import { lijstKeuzes, lijstPlanning } from "@/lib/bouw/regie-opslag";
import type { Partij } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import { Partijkeuze } from "../keuzes/velden";
import { Melding } from "@/components/bouw/melding";
import {
  schuifOpActie,
  verwijderPlanningActie,
  voegPlanningToeActie,
  voorbeeldplanningActie,
  wijzigPlanningActie,
} from "./acties";
import { Tijdlijn } from "@/components/bouw/tijdlijn";

export const dynamic = "force-dynamic";

const STANDKLASSE = { klaar: "goed", bezig: "", te_laat: "fout", gepland: "" } as const;
const STANDNAMEN = { klaar: "klaar", bezig: "bezig", te_laat: "te laat", gepland: "gepland" } as const;

function Itemvelden({
  item,
  fasen,
  partijen,
  voorvoegsel,
}: {
  item?: Planningsitem;
  fasen: Planningsitem[];
  partijen: Partij[];
  voorvoegsel: string;
}) {
  return (
    <>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-soort`}>Soort</label>
          <select id={`${voorvoegsel}-soort`} name="soort" defaultValue={item?.soort ?? "taak"}>
            {SOORTEN_PLANNING.map((soort) => (
              <option key={soort} value={soort}>
                {PLANNINGNAMEN[soort]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-titel`}>Titel</label>
          <input id={`${voorvoegsel}-titel`} name="titel" defaultValue={item?.titel ?? ""} required placeholder="Metselwerk" />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-fase`}>Hoort bij fase</label>
          <select id={`${voorvoegsel}-fase`} name="fase_id" defaultValue={item?.fase_id ?? ""}>
            <option value="">—</option>
            {fasen
              .filter((fase) => fase.id !== item?.id)
              .map((fase) => (
                <option key={fase.id} value={fase.id}>
                  {fase.titel}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-begin`}>Van</label>
          <input id={`${voorvoegsel}-begin`} name="begindatum" type="date" defaultValue={item?.begindatum ?? ""} required />
        </div>
        <div>
          <label htmlFor={`${voorvoegsel}-einde`}>Tot en met</label>
          <input id={`${voorvoegsel}-einde`} name="einddatum" type="date" defaultValue={item?.einddatum ?? ""} />
        </div>
        <Partijkeuze voorvoegsel={voorvoegsel} naam="partij_id" label="Wie" partijen={partijen} gekozen={item?.partij_id ?? null} />
      </div>
      <div className="veldenrij">
        <div>
          <label htmlFor={`${voorvoegsel}-status`}>Status</label>
          <select id={`${voorvoegsel}-status`} name="status" defaultValue={item?.status ?? "gepland"}>
            {STATUSSEN_PLANNING.map((status) => (
              <option key={status} value={status}>
                {PLANNINGSTATUSNAMEN[status]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label htmlFor={`${voorvoegsel}-opmerking`}>Opmerking</label>
          <input id={`${voorvoegsel}-opmerking`} name="opmerking" defaultValue={item?.opmerking ?? ""} />
        </div>
      </div>
    </>
  );
}

export default async function Planningspagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string; item?: string }>;
}) {
  const { melding, soort, item: gevraagd } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  let planning: Planningsitem[];
  let partijen: Partij[];
  let deadlines: ReturnType<typeof openDeadlines>;
  const nu = vandaag();
  try {
    const [items, p, keuzes] = await Promise.all([lijstPlanning(huis.id), lijstPartijen(huis.id), lijstKeuzes(huis.id)]);
    planning = items;
    partijen = p;
    deadlines = openDeadlines(keuzes, items, nu);
  } catch (fout) {
    return (
      <>
        <h1>Planning</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const partijnamen = new Map(partijen.map((partij) => [partij.id, partij.naam]));
  const fasen = planning.filter((item) => item.soort === "fase");
  const gekozenId = leesId(gevraagd ?? "");
  const gekozen = planning.find((item) => item.id === gekozenId) ?? null;
  // Een voorbeeld begint standaard de maandag over twee weken.
  const voorstel = plusDagen(maandagVan(nu), 14);

  return (
    <>
      <h1>Planning</h1>
      <p className="inleiding">
        De fasen, taken en mijlpalen van de bouw, per aannemer. De deadlines van de{" "}
        <Link href={huispad(huis.id, "/keuzes")}>keuzes</Link> staan erbij: hangt een keuze aan een taak, dan volgt haar deadline uit
        de begindatum van die taak en de levertermijn.
      </p>

      <Melding soort={soort} melding={melding} />

      {planning.length === 0 ? (
        <form action={voorbeeldplanningActie.bind(null, huis.id)} className="kaart">
          <p className="leeg">Nog geen planning.</p>
          <p>
            Begin met een voorbeeld voor een nieuwbouw met losse aannemers, van de vergunningsaanvraag tot de
            voorlopige oplevering: zo&apos;n 15 maanden, met de wachttermijn na de vergunning erin. Elke datum pas je
            daarna aan.
          </p>
          <div className="veldenrij">
            <div>
              <label htmlFor="voorbeeld-begin">De vergunningsaanvraag vertrekt op</label>
              <input id="voorbeeld-begin" name="begindatum" type="date" defaultValue={voorstel} required />
            </div>
          </div>
          <div className="knoppenrij" style={{ marginTop: 12 }}>
            <button type="submit">Maak een voorbeeldplanning</button>
          </div>
        </form>
      ) : (
        <Tijdlijn
          items={planning}
          partijnamen={partijnamen}
          deadlines={deadlines.map(({ keuze, deadline }) => ({
            id: keuze.id,
            titel: keuze.titel,
            datum: deadline.datum,
            href: huispad(huis.id, `/keuzes/${keuze.id}`),
          }))}
          vandaag={nu}
          planningpad={huispad(huis.id, "/planning")}
        />
      )}

      {gekozen ? (
        <section id="wijzigen" className="kaart">
          <h2 style={{ marginTop: 0 }}>{gekozen.titel}</h2>
          <form action={wijzigPlanningActie.bind(null, huis.id)}>
            <input type="hidden" name="id" value={gekozen.id} />
            <Itemvelden item={gekozen} fasen={fasen} partijen={partijen} voorvoegsel="wijzig" />
            <div className="knoppenrij" style={{ marginTop: 12 }}>
              <button type="submit">Bewaren</button>
              <BevestigKnop
                vraag={`${gekozen.titel} uit de planning halen?`}
                formAction={verwijderPlanningActie.bind(null, huis.id)}
              >
                Verwijderen
              </BevestigKnop>
              <Link className="knop stil" href={huispad(huis.id, "/planning")}>
                Sluiten
              </Link>
            </div>
          </form>
          <form action={schuifOpActie.bind(null, huis.id)} className="schuifop">
            <input type="hidden" name="id" value={gekozen.id} />
            <label htmlFor="schuif-dagen">Loopt het uit? Schuif op met</label>
            <input id="schuif-dagen" name="dagen" inputMode="numeric" placeholder="14" required />
            <span>dagen,</span>
            <select name="bereik" defaultValue="en_later" aria-label="Wat opschuift">
              <option value="en_later">samen met alles wat later begint</option>
              <option value="dit">enkel dit</option>
            </select>
            <button type="submit" className="stil">
              Opschuiven
            </button>
          </form>
        </section>
      ) : null}

      {planning.length > 0 ? (
        <>
          <h2>Per fase</h2>
          {groepeer(planning).map((groep) => (
            <div key={groep.fase?.id ?? "los"} className="kaart planningsgroep">
              <h3>
                {groep.fase ? (
                  <Link href={huispad(huis.id, `/planning?item=${groep.fase.id}#wijzigen`)}>{groep.fase.titel}</Link>
                ) : (
                  "Zonder fase"
                )}
                {groep.fase ? (
                  <span className="hulp">
                    {" "}
                    · {korteDatum(groep.fase.begindatum, nu)}
                    {groep.fase.einddatum ? ` – ${korteDatum(groep.fase.einddatum, nu)}` : ""}
                  </span>
                ) : null}
              </h3>
              {groep.items.length === 0 ? (
                <p className="leeg">Geen taken.</p>
              ) : (
                <div className="tabel-omhulsel">
                  <table>
                    <thead>
                      <tr>
                        <th>Wat</th>
                        <th>Wanneer</th>
                        <th>Wie</th>
                        <th>Stand</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groep.items.map((item) => {
                        const stand = standVan(item, nu);
                        return (
                          <tr key={item.id}>
                            <td data-label="Wat">
                              <Link href={huispad(huis.id, `/planning?item=${item.id}#wijzigen`)}>
                                {item.soort === "mijlpaal" ? "◆ " : ""}
                                {item.titel}
                              </Link>
                              {item.opmerking ? <div className="hulp">{item.opmerking}</div> : null}
                            </td>
                            <td data-label="Wanneer">
                              {korteDatum(item.begindatum, nu)}
                              {item.einddatum ? ` – ${korteDatum(item.einddatum, nu)}` : ""}
                              {item.soort !== "mijlpaal" ? <span className="hulp"> · {duurInDagen(item)} d</span> : null}
                            </td>
                            <td data-label="Wie">{item.partij_id ? partijnamen.get(item.partij_id) ?? "—" : "—"}</td>
                            <td data-label="Stand">
                              <span className={STANDKLASSE[stand] ? `label-vlag ${STANDKLASSE[stand]}` : "hulp"}>
                                {STANDNAMEN[stand]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      ) : null}

      <h2>Toevoegen</h2>
      <form action={voegPlanningToeActie.bind(null, huis.id)} className="kaart">
        <Itemvelden fasen={fasen} partijen={partijen} voorvoegsel="nieuw" />
        <p className="hulp">Een mijlpaal heeft enkel een begindatum. Een fase hoort bij geen andere fase.</p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <button type="submit">Toevoegen</button>
        </div>
      </form>
    </>
  );
}
