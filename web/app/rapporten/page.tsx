import Link from "next/link";

import { datum, datumTijd, euro, kwh, tariefPerKwh } from "@/lib/format";
import { periodeKeuzes } from "@/lib/periods";
import { bereidRapportVoor, type RapportVoorbereiding } from "@/lib/reports";
import {
  magRapportenMaken,
  magVennootschapZien,
  zichtbareVennootschappen,
} from "@/lib/rollen";
import { db } from "@/lib/supabase";
import { vereistGebruiker } from "@/lib/toegang";
import type { Vennootschap } from "@/lib/types";

import { maakRapport, verwijderRapport } from "./acties";
import { PeriodeKiezer } from "./periode-kiezer";
import { periodeUitFormulier } from "./periode";

export const dynamic = "force-dynamic";

interface BewaardRapportRij {
  id: string;
  reference: string;
  period_start: string;
  period_end: string;
  session_count: number;
  total_kwh: number;
  total_incl_vat: number;
  generated_at: string;
  companies: { name: string } | null;
}

export default async function Rapportenpagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ik = await vereistGebruiker();
  const params = await searchParams;
  const nu = new Date();

  const magMaken = magRapportenMaken(ik);
  const beperking = zichtbareVennootschappen(ik);

  let vennQuery = db().from("companies").select("*").eq("is_active", true).order("name");
  let archiefQuery = db()
    .from("reports")
    .select(
      "id, reference, period_start, period_end, session_count, total_kwh, total_incl_vat, generated_at, companies(name)",
    )
    .order("generated_at", { ascending: false })
    .limit(50);

  // Wie geen hoofdbeheerder is, ziet enkel de eigen vennootschap. De filtering
  // gebeurt in de databankvraag zelf, niet pas bij het tonen.
  if (beperking !== null) {
    if (beperking.length === 0) {
      return (
        <>
          <h1>Rapporten</h1>
          <div className="melding let-op">
            Je bent nog aan geen vennootschap gekoppeld. Vraag dat aan de hoofdbeheerder.
          </div>
        </>
      );
    }
    vennQuery = vennQuery.in("id", beperking);
    archiefQuery = archiefQuery.in("company_id", beperking);
  }

  const [vennResultaat, archiefResultaat] = await Promise.all([vennQuery, archiefQuery]);

  const vennootschappen = (vennResultaat.data ?? []) as Vennootschap[];
  const archief = (archiefResultaat.data ?? []) as unknown as BewaardRapportRij[];

  const gekozenVennootschap = params.vennootschap ?? "";
  const keuzes = periodeKeuzes(nu);
  const vorigKwartaal = keuzes.filter((keuze) => keuze.groep === "Kwartaal")[1];
  const gekozenPeriode = params.periode ?? vorigKwartaal.waarde;

  let voorbeeld: RapportVoorbereiding | null = null;
  let voorbeeldFout: string | null = null;

  if (magMaken && gekozenVennootschap) {
    if (!magVennootschapZien(ik, gekozenVennootschap)) {
      voorbeeldFout = "Je hebt geen toegang tot deze vennootschap.";
    } else {
      try {
        const periode = periodeUitFormulier({
          periode: params.periode ?? (params.periodesoort ? "" : gekozenPeriode),
          soort: params.periodesoort,
          jaar: params.jaar,
          maand: params.maand,
          kwartaal: params.kwartaal,
          van: params.van ?? "",
          tot: params.tot ?? "",
        });
        voorbeeld = await bereidRapportVoor(gekozenVennootschap, periode);
      } catch (fout) {
        voorbeeldFout = fout instanceof Error ? fout.message : "Voorbeeld maken mislukt.";
      }
    }
  }

  return (
    <>
      <h1>Rapporten</h1>
      <p className="inleiding">
        {magMaken
          ? "Kies een vennootschap en een periode. Je ziet meteen wat er doorgerekend wordt; pas als je op bewaren klikt, wordt het rapport definitief vastgelegd met PDF en Excel."
          : "De rapporten van je vennootschap, met de PDF en de Excel om te downloaden. Nieuwe rapporten worden door de hoofdbeheerder opgemaakt."}
      </p>

      {params.melding ? (
        <div
          className={`melding ${
            params.soort === "fout" ? "fout" : params.soort === "goed" ? "goed" : "info"
          }`}
        >
          {params.melding}
        </div>
      ) : null}

      {magMaken && vennootschappen.length === 0 ? (
        <div className="melding let-op">
          Voeg eerst een vennootschap toe bij{" "}
          <Link href="/vennootschappen">Vennootschappen</Link>.
        </div>
      ) : null}

      {magMaken ? (
        /* Een gewoon GET-formulier: de keuze staat in het adres, dus je kan een
           voorbeeld gerust delen of opslaan als favoriet. */
        <form method="get" className="kaart">
          <div className="veldenrij">
            <div>
              <label htmlFor="vennootschap">Vennootschap</label>
              <select
                id="vennootschap"
                name="vennootschap"
                defaultValue={gekozenVennootschap}
              >
                <option value="">— kies —</option>
                {vennootschappen.map((vennootschap) => (
                  <option key={vennootschap.id} value={vennootschap.id}>
                    {vennootschap.name}
                  </option>
                ))}
              </select>
            </div>
            <PeriodeKiezer
              opties={keuzes}
              gekozen={gekozenPeriode}
              van={params.van ?? ""}
              tot={params.tot ?? ""}
            />
          </div>

          <button type="submit" style={{ marginTop: 12 }}>
            Voorbeeld tonen
          </button>
        </form>
      ) : null}

      {voorbeeldFout ? <div className="melding fout">{voorbeeldFout}</div> : null}

      {voorbeeld ? <Voorbeeld voorbereiding={voorbeeld} params={params} /> : null}

      {magMaken ? <hr className="scheiding" /> : null}

      <h2>Bewaarde rapporten</h2>
      {archief.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen rapporten bewaard.</p>
        </div>
      ) : (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Referentie</th>
                <th>Vennootschap</th>
                <th>Periode</th>
                <th className="getal">Sessies</th>
                <th className="getal">kWh</th>
                <th className="getal">Totaal</th>
                <th>Downloaden</th>
                {magMaken ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {archief.map((rapport) => (
                <tr key={rapport.id}>
                  <td data-label="Referentie">
                    <strong>{rapport.reference}</strong>
                    <div className="hulp">{datumTijd(rapport.generated_at)}</div>
                  </td>
                  <td data-label="Vennootschap">{rapport.companies?.name ?? "—"}</td>
                  <td data-label="Periode">
                    {datum(rapport.period_start)} – {datum(rapport.period_end)}
                  </td>
                  <td data-label="Sessies" className="getal">{rapport.session_count}</td>
                  <td data-label="kWh" className="getal">{kwh(rapport.total_kwh)}</td>
                  <td data-label="Totaal" className="getal">{euro(rapport.total_incl_vat)}</td>
                  <td data-label="Downloaden">
                    <div className="knoppenrij">
                      <a className="knop stil" href={`/api/rapporten/${rapport.id}/pdf`}>
                        PDF
                      </a>
                      <a className="knop stil" href={`/api/rapporten/${rapport.id}/excel`}>
                        Excel
                      </a>
                    </div>
                  </td>
                  {magMaken ? (
                    <td>
                      <form action={verwijderRapport}>
                        <input type="hidden" name="id" value={rapport.id} />
                        <button className="gevaar" type="submit">
                          Verwijderen
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Voorbeeld({
  voorbereiding,
  params,
}: {
  voorbereiding: RapportVoorbereiding;
  params: Record<string, string | undefined>;
}) {
  const klaar = voorbereiding.blokkades.length === 0;

  return (
    <section>
      <h2>
        Voorbeeld · {voorbereiding.vennootschap.name} · {voorbereiding.periode.label}
      </h2>

      {voorbereiding.blokkades.length > 0 ? (
        <div className="melding fout">
          <p>
            <strong>Dit rapport kan nog niet gemaakt worden</strong>
          </p>
          <ul>
            {voorbereiding.blokkades.map((blokkade) => (
              <li key={blokkade}>{blokkade}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {voorbereiding.waarschuwingen.length > 0 ? (
        <div className="melding let-op">
          <p>
            <strong>Even nakijken</strong>
          </p>
          <ul>
            {voorbereiding.waarschuwingen.map((waarschuwing) => (
              <li key={waarschuwing}>{waarschuwing}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tegels">
        <div className="tegel">
          <div className="label">Sessies</div>
          <div className="waarde">{voorbereiding.totalen.aantal_sessies}</div>
        </div>
        <div className="tegel">
          <div className="label">Geladen</div>
          <div className="waarde">{kwh(voorbereiding.totalen.kwh)}</div>
        </div>
        <div className="tegel">
          <div className="label">Excl. btw</div>
          <div className="waarde">{euro(voorbereiding.totalen.excl_btw)}</div>
          <div className="bij">btw {euro(voorbereiding.totalen.btw)}</div>
        </div>
        <div className="tegel">
          <div className="label">Terug te betalen</div>
          <div className="waarde">{euro(voorbereiding.totalen.incl_btw)}</div>
        </div>
      </div>

      {voorbereiding.regels.length > 0 ? (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Gestart</th>
                <th>Laadpaal</th>
                <th className="getal">kWh</th>
                <th className="getal">Tarief</th>
                <th className="getal">Excl. btw</th>
                <th className="getal">Btw</th>
                <th className="getal">Incl. btw</th>
              </tr>
            </thead>
            <tbody>
              {voorbereiding.regels.map((regel) => (
                <tr key={regel.sessie_id}>
                  <td data-label="Gestart">{datumTijd(regel.gestart)}</td>
                  <td data-label="Laadpaal">{regel.laadpaal}</td>
                  <td data-label="kWh" className="getal">{kwh(regel.kwh)}</td>
                  <td data-label="Tarief" className="getal">{tariefPerKwh(regel.tarief_per_kwh)}</td>
                  <td data-label="Excl. btw" className="getal">{euro(regel.bedrag_excl_btw)}</td>
                  <td data-label="Btw" className="getal">{euro(regel.btw_bedrag)}</td>
                  <td data-label="Incl. btw" className="getal">{euro(regel.bedrag_incl_btw)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totaal</td>
                <td data-label="kWh" className="getal">
                  {kwh(voorbereiding.totalen.kwh)}
                </td>
                <td />
                <td data-label="Excl. btw" className="getal">
                  {euro(voorbereiding.totalen.excl_btw)}
                </td>
                <td data-label="Btw" className="getal">
                  {euro(voorbereiding.totalen.btw)}
                </td>
                <td data-label="Incl. btw" className="getal">
                  {euro(voorbereiding.totalen.incl_btw)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {voorbereiding.overgeslagen.length > 0 ? (
        <details className="kaart" style={{ marginTop: 16 }}>
          <summary>
            {voorbereiding.overgeslagen.length} sessie(s) niet meegeteld — waarom?
          </summary>
          <ul>
            {voorbereiding.overgeslagen.map((item) => (
              <li key={item.omschrijving + item.reden}>
                {item.omschrijving}: {item.reden}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {voorbereiding.meterstanden.length > 0 ? (
        <>
          <h2>Meterstanden ter controle</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Laadpaal</th>
                  <th className="getal">Begin</th>
                  <th className="getal">Einde</th>
                  <th className="getal">Verschil</th>
                  <th className="getal">Som sessies</th>
                  <th className="getal">Afwijking</th>
                </tr>
              </thead>
              <tbody>
                {voorbereiding.meterstanden.map((stand) => (
                  <tr key={stand.laadpaal}>
                    <td data-label="Laadpaal">{stand.laadpaal}</td>
                    <td data-label="Begin" className="getal">{kwh(stand.begin_kwh)}</td>
                    <td data-label="Einde" className="getal">{kwh(stand.eind_kwh)}</td>
                    <td data-label="Verschil" className="getal">{kwh(stand.verschil_kwh)}</td>
                    <td data-label="Som sessies" className="getal">{kwh(stand.sessies_kwh)}</td>
                    <td data-label="Afwijking" className="getal">{kwh(stand.afwijking_kwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {klaar ? (
        <form action={maakRapport} style={{ marginTop: 20 }}>
          <input type="hidden" name="vennootschap" value={voorbereiding.vennootschap.id} />
          <input type="hidden" name="periode" value={params.periode ?? ""} />
          <input type="hidden" name="periodesoort" value={params.periodesoort ?? ""} />
          <input type="hidden" name="jaar" value={params.jaar ?? ""} />
          <input type="hidden" name="maand" value={params.maand ?? ""} />
          <input type="hidden" name="kwartaal" value={params.kwartaal ?? ""} />
          <input type="hidden" name="van" value={params.van ?? ""} />
          <input type="hidden" name="tot" value={params.tot ?? ""} />
          <button type="submit">Rapport bewaren</button>
        </form>
      ) : null}
    </section>
  );
}
