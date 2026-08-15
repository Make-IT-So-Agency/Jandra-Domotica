import Link from "next/link";

import { datum, datumTijd, euro, kwh, tariefPerKwh } from "@/lib/format";
import { lokaleOnderdelen } from "@/lib/periods";
import { bereidRapportVoor, type RapportVoorbereiding } from "@/lib/reports";
import { db } from "@/lib/supabase";
import type { Vennootschap } from "@/lib/types";

import { maakRapport, verwijderRapport } from "./acties";
import { periodeUitFormulier } from "./periode";

export const dynamic = "force-dynamic";

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

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
  const params = await searchParams;
  const nu = new Date();
  const vandaag = lokaleOnderdelen(nu);

  const [vennResultaat, archiefResultaat] = await Promise.all([
    db().from("companies").select("*").eq("is_active", true).order("name"),
    db()
      .from("reports")
      .select(
        "id, reference, period_start, period_end, session_count, total_kwh, total_incl_vat, generated_at, companies(name)",
      )
      .order("generated_at", { ascending: false })
      .limit(50),
  ]);

  const vennootschappen = (vennResultaat.data ?? []) as Vennootschap[];
  const archief = (archiefResultaat.data ?? []) as unknown as BewaardRapportRij[];

  const gekozenVennootschap = params.vennootschap ?? "";
  const periodesoort = params.periodesoort ?? "month";

  // Voorbeeld tonen zodra er een vennootschap gekozen is.
  let voorbeeld: RapportVoorbereiding | null = null;
  let voorbeeldFout: string | null = null;

  if (gekozenVennootschap) {
    try {
      const periode = periodeUitFormulier({
        soort: periodesoort,
        jaar: params.jaar ?? String(vandaag.jaar),
        maand: params.maand ?? String(vandaag.maand),
        kwartaal: params.kwartaal ?? String(Math.floor((vandaag.maand - 1) / 3) + 1),
        van: params.van ?? "",
        tot: params.tot ?? "",
      });
      voorbeeld = await bereidRapportVoor(gekozenVennootschap, periode);
    } catch (fout) {
      voorbeeldFout = fout instanceof Error ? fout.message : "Voorbeeld maken mislukt.";
    }
  }

  return (
    <>
      <h1>Rapporten</h1>
      <p className="inleiding">
        Kies een vennootschap en een periode. Je ziet meteen wat er doorgerekend wordt; pas
        als je op bewaren klikt, wordt het rapport definitief vastgelegd met PDF en Excel.
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

      {vennootschappen.length === 0 ? (
        <div className="melding let-op">
          Voeg eerst een vennootschap toe bij{" "}
          <Link href="/vennootschappen">Vennootschappen</Link>.
        </div>
      ) : null}

      {/* Een gewoon GET-formulier: de keuze staat in het adres, dus je kan een
          voorbeeld gerust delen of opslaan als favoriet. */}
      <form method="get" className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="vennootschap">Vennootschap</label>
            <select id="vennootschap" name="vennootschap" defaultValue={gekozenVennootschap}>
              <option value="">— kies —</option>
              {vennootschappen.map((vennootschap) => (
                <option key={vennootschap.id} value={vennootschap.id}>
                  {vennootschap.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="periodesoort">Periode</label>
            <select id="periodesoort" name="periodesoort" defaultValue={periodesoort}>
              <option value="month">Maand</option>
              <option value="quarter">Kwartaal</option>
              <option value="vrij">Zelf kiezen</option>
            </select>
          </div>
          <div>
            <label htmlFor="jaar">Jaar</label>
            <input
              id="jaar"
              name="jaar"
              type="number"
              min={2020}
              max={2100}
              defaultValue={params.jaar ?? vandaag.jaar}
            />
          </div>
          <div>
            <label htmlFor="maand">Maand</label>
            <select id="maand" name="maand" defaultValue={params.maand ?? vandaag.maand}>
              {MAANDEN.map((naam, index) => (
                <option key={naam} value={index + 1}>
                  {naam}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kwartaal">Kwartaal</label>
            <select
              id="kwartaal"
              name="kwartaal"
              defaultValue={params.kwartaal ?? Math.floor((vandaag.maand - 1) / 3) + 1}
            >
              {[1, 2, 3, 4].map((nummer) => (
                <option key={nummer} value={nummer}>
                  Q{nummer}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="veldenrij">
          <div>
            <label htmlFor="van">Zelf gekozen: van</label>
            <input id="van" name="van" type="date" defaultValue={params.van ?? ""} />
          </div>
          <div>
            <label htmlFor="tot">tot en met</label>
            <input id="tot" name="tot" type="date" defaultValue={params.tot ?? ""} />
          </div>
        </div>

        <p className="hulp" style={{ marginBottom: 12 }}>
          De velden Maand, Kwartaal en de vrije datums worden enkel gebruikt door de
          periodesoort die je hierboven kiest.
        </p>
        <button type="submit">Voorbeeld tonen</button>
      </form>

      {voorbeeldFout ? <div className="melding fout">{voorbeeldFout}</div> : null}

      {voorbeeld ? <Voorbeeld voorbereiding={voorbeeld} params={params} /> : null}

      <hr className="scheiding" />

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
                <th />
              </tr>
            </thead>
            <tbody>
              {archief.map((rapport) => (
                <tr key={rapport.id}>
                  <td>
                    <strong>{rapport.reference}</strong>
                    <div className="hulp">{datumTijd(rapport.generated_at)}</div>
                  </td>
                  <td>{rapport.companies?.name ?? "—"}</td>
                  <td>
                    {datum(rapport.period_start)} – {datum(rapport.period_end)}
                  </td>
                  <td className="getal">{rapport.session_count}</td>
                  <td className="getal">{kwh(rapport.total_kwh)}</td>
                  <td className="getal">{euro(rapport.total_incl_vat)}</td>
                  <td>
                    <div className="knoppenrij">
                      <a className="knop stil" href={`/api/rapporten/${rapport.id}/pdf`}>
                        PDF
                      </a>
                      <a className="knop stil" href={`/api/rapporten/${rapport.id}/excel`}>
                        Excel
                      </a>
                    </div>
                  </td>
                  <td>
                    <form action={verwijderRapport}>
                      <input type="hidden" name="id" value={rapport.id} />
                      <button className="gevaar" type="submit">
                        Verwijderen
                      </button>
                    </form>
                  </td>
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
                <th>Voertuig</th>
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
                  <td>{datumTijd(regel.gestart)}</td>
                  <td>{regel.laadpaal}</td>
                  <td>{regel.voertuig ?? "—"}</td>
                  <td className="getal">{kwh(regel.kwh)}</td>
                  <td className="getal">{tariefPerKwh(regel.tarief_per_kwh)}</td>
                  <td className="getal">{euro(regel.bedrag_excl_btw)}</td>
                  <td className="getal">{euro(regel.btw_bedrag)}</td>
                  <td className="getal">{euro(regel.bedrag_incl_btw)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totaal</td>
                <td className="getal">{kwh(voorbereiding.totalen.kwh)}</td>
                <td />
                <td className="getal">{euro(voorbereiding.totalen.excl_btw)}</td>
                <td className="getal">{euro(voorbereiding.totalen.btw)}</td>
                <td className="getal">{euro(voorbereiding.totalen.incl_btw)}</td>
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
                    <td>{stand.laadpaal}</td>
                    <td className="getal">{kwh(stand.begin_kwh)}</td>
                    <td className="getal">{kwh(stand.eind_kwh)}</td>
                    <td className="getal">{kwh(stand.verschil_kwh)}</td>
                    <td className="getal">{kwh(stand.sessies_kwh)}</td>
                    <td className="getal">{kwh(stand.afwijking_kwh)}</td>
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
          <input type="hidden" name="periodesoort" value={params.periodesoort ?? "month"} />
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
