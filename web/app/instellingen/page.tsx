import { datumTijd } from "@/lib/format";
import { leesInstellingen } from "@/lib/settings";
import { db } from "@/lib/supabase";

import { bewaarInstellingenActie } from "./acties";

export const dynamic = "force-dynamic";

export default async function Instellingenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const instellingen = await leesInstellingen();

  const { data: laatste } = await db()
    .from("ingest_log")
    .select("received_at, session_count, error")
    .order("received_at", { ascending: false })
    .limit(5);

  const sleutelIngesteld = Boolean(process.env.INGEST_API_KEY);

  return (
    <>
      <h1>Instellingen</h1>
      <p className="inleiding">
        Deze gegevens komen op elk rapport terecht als de partij aan wie terugbetaald wordt.
      </p>

      {melding ? (
        <div className={`melding ${soort === "fout" ? "fout" : "goed"}`}>{melding}</div>
      ) : null}

      <form action={bewaarInstellingenActie} className="kaart">
        <h2 style={{ marginTop: 0 }}>Terug te betalen aan</h2>
        <div className="veldenrij">
          <div>
            <label htmlFor="naam">Naam</label>
            <input id="naam" name="naam" defaultValue={instellingen.begunstigde.naam} />
          </div>
          <div>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={instellingen.begunstigde.email}
            />
          </div>
          <div>
            <label htmlFor="btw_nummer">Btw-nummer (indien van toepassing)</label>
            <input
              id="btw_nummer"
              name="btw_nummer"
              defaultValue={instellingen.begunstigde.btw_nummer}
            />
          </div>
        </div>
        <div className="veldenrij">
          <div>
            <label htmlFor="adres">Adres</label>
            <input id="adres" name="adres" defaultValue={instellingen.begunstigde.adres} />
          </div>
          <div>
            <label htmlFor="rekeningnummer">Rekeningnummer</label>
            <input
              id="rekeningnummer"
              name="rekeningnummer"
              placeholder="BE00 0000 0000 0000"
              defaultValue={instellingen.begunstigde.rekeningnummer}
            />
          </div>
        </div>

        <h2>Tarieven</h2>
        <div className="veldenrij">
          <div>
            <label htmlFor="regio">Gewest</label>
            <select id="regio" name="regio" defaultValue={instellingen.regio}>
              <option value="vlaanderen">Vlaanderen</option>
              <option value="brussel">Brussel</option>
              <option value="wallonie">Wallonië</option>
            </select>
            <p className="hulp">Bepaalt welk maximumtarief van toepassing is.</p>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label htmlFor="tarief_bron_url">Bronpagina voor het automatische tarief</label>
            <input
              id="tarief_bron_url"
              name="tarief_bron_url"
              defaultValue={instellingen.tarief_bron_url}
            />
            <p className="hulp">
              De overheid publiceert dit cijfer als tekst op een webpagina, niet als
              gegevensbron. Verhuist die pagina, dan pas je hier het adres aan.
            </p>
          </div>
        </div>

        <button type="submit">Bewaren</button>
      </form>

      <h2>Koppeling met Home Assistant</h2>
      <div className="kaart">
        <p style={{ marginTop: 0 }}>
          In Home Assistant vul je bij de integratie <strong>Laadkosten rapportage</strong>{" "}
          het adres van deze app in, samen met de API-sleutel.
        </p>
        <p>
          API-sleutel op de server:{" "}
          {sleutelIngesteld ? (
            <span className="label-vlag goed">ingesteld</span>
          ) : (
            <span className="label-vlag let-op">ontbreekt</span>
          )}
        </p>
        {!sleutelIngesteld ? (
          <p className="hulp">
            Zet <code>INGEST_API_KEY</code> bij de omgevingsvariabelen van je Vercel-project
            en start een nieuwe implementatie.
          </p>
        ) : null}

        <h2 style={{ fontSize: 15 }}>Laatste synchronisaties</h2>
        {(laatste ?? []).length === 0 ? (
          <p className="hulp">Er is nog niets binnengekomen.</p>
        ) : (
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Wanneer</th>
                  <th className="getal">Sessies</th>
                  <th>Resultaat</th>
                </tr>
              </thead>
              <tbody>
                {(laatste ?? []).map((rij) => (
                  <tr key={String(rij.received_at)}>
                    <td>{datumTijd(String(rij.received_at))}</td>
                    <td className="getal">{rij.session_count}</td>
                    <td>
                      {rij.error ? (
                        <span className="label-vlag let-op">{rij.error}</span>
                      ) : (
                        <span className="label-vlag goed">gelukt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
