import { datum, procent, tariefPerKwh } from "@/lib/format";
import { kwartaalPeriode, kwartaalVan } from "@/lib/periods";
import { leesInstellingen } from "@/lib/settings";
import { leesTarieven } from "@/lib/tariffs";
import type { Tarief } from "@/lib/types";

import { bevestigTariefActie, bewaarHandmatigTarief, haalTariefAutomatischOp } from "./acties";

export const dynamic = "force-dynamic";

/** De laatste acht kwartalen, nieuwste eerst. */
function recenteKwartalen(nu: Date): Array<{ jaar: number; kwartaal: number }> {
  const { jaar, kwartaal } = kwartaalVan(nu);
  const reeks: Array<{ jaar: number; kwartaal: number }> = [];

  let lopendJaar = jaar;
  let lopendKwartaal = kwartaal;
  for (let index = 0; index < 8; index += 1) {
    reeks.push({ jaar: lopendJaar, kwartaal: lopendKwartaal });
    lopendKwartaal -= 1;
    if (lopendKwartaal === 0) {
      lopendKwartaal = 4;
      lopendJaar -= 1;
    }
  }
  return reeks;
}

export default async function Tarievenpagina({
  searchParams,
}: {
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const instellingen = await leesInstellingen();
  const tarieven = await leesTarieven(instellingen.regio);

  const nu = new Date();
  const kwartalen = recenteKwartalen(nu);
  const huidig = kwartaalVan(nu);

  const perStart = new Map<string, Tarief>();
  for (const tarief of tarieven) perStart.set(tarief.period_start, tarief);

  return (
    <>
      <h1>Tarieven</h1>
      <p className="inleiding">
        Het maximumbedrag per kWh waaraan thuisladen terugbetaald mag worden. Dat bedrag
        wijzigt elk kwartaal. De app probeert het zelf op te halen, maar rekent er pas mee
        nadat jij het bevestigd hebt — zo factureer je nooit met een verkeerd cijfer.
      </p>

      {melding ? (
        <div className={`melding ${soort === "fout" ? "fout" : soort === "goed" ? "goed" : "info"}`}>
          {melding}
        </div>
      ) : null}

      <div className="tabel-omhulsel">
        <table>
          <thead>
            <tr>
              <th>Kwartaal</th>
              <th>Periode</th>
              <th className="getal">Tarief</th>
              <th>Btw</th>
              <th>Herkomst</th>
              <th>Status</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody>
            {kwartalen.map(({ jaar, kwartaal }) => {
              const periode = kwartaalPeriode(jaar, kwartaal);
              const tarief = perStart.get(periode.start);
              const isHuidig = jaar === huidig.jaar && kwartaal === huidig.kwartaal;

              return (
                <tr key={periode.start}>
                  <td>
                    <strong>
                      Q{kwartaal} {jaar}
                    </strong>
                    {isHuidig ? (
                      <span className="label-vlag goed" style={{ marginLeft: 8 }}>
                        nu
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {datum(periode.start)} – {datum(periode.eind)}
                  </td>
                  <td className="getal">
                    {tarief ? tariefPerKwh(Number(tarief.eur_per_kwh)) : "—"}
                  </td>
                  <td>
                    {tarief
                      ? `${procent(Number(tarief.vat_rate))} ${
                          tarief.includes_vat ? "inbegrepen" : "erbij"
                        }`
                      : "—"}
                  </td>
                  <td>
                    {tarief
                      ? tarief.source === "auto"
                        ? "automatisch"
                        : "handmatig"
                      : "—"}
                  </td>
                  <td>
                    {!tarief ? (
                      <span className="label-vlag let-op">ontbreekt</span>
                    ) : tarief.confirmed_at ? (
                      <span className="label-vlag goed">bevestigd</span>
                    ) : (
                      <span className="label-vlag let-op">nakijken</span>
                    )}
                  </td>
                  <td>
                    {!tarief ? (
                      <form action={haalTariefAutomatischOp}>
                        <input type="hidden" name="jaar" value={jaar} />
                        <input type="hidden" name="kwartaal" value={kwartaal} />
                        <button className="stil" type="submit">
                          Automatisch zoeken
                        </button>
                      </form>
                    ) : tarief.confirmed_at ? (
                      <span className="hulp">{datum(tarief.confirmed_at)}</span>
                    ) : (
                      <form action={bevestigTariefActie}>
                        <input type="hidden" name="id" value={tarief.id} />
                        <button type="submit">Bevestigen</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tarieven.some((tarief) => !tarief.confirmed_at && tarief.note) ? (
        <div className="kaart" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Wat de app gevonden heeft</h2>
          <p className="hulp">
            Lees de zin na waaruit het bedrag gehaald is. Klopt het niet? Vul het dan
            hieronder handmatig in; dat overschrijft de automatische vondst.
          </p>
          {tarieven
            .filter((tarief) => !tarief.confirmed_at && tarief.note)
            .map((tarief) => (
              <blockquote
                key={tarief.id}
                style={{
                  margin: "12px 0 0",
                  paddingLeft: 12,
                  borderLeft: "3px solid var(--lijn)",
                  fontSize: 14,
                }}
              >
                <strong>{tarief.period_start.slice(0, 7)}</strong> — {tarief.note}
                {tarief.source_url ? (
                  <div className="hulp">
                    <a href={tarief.source_url} target="_blank" rel="noreferrer">
                      Bron openen
                    </a>
                  </div>
                ) : null}
              </blockquote>
            ))}
        </div>
      ) : null}

      <hr className="scheiding" />

      <h2>Tarief zelf invullen</h2>
      <form action={bewaarHandmatigTarief} className="kaart">
        <div className="veldenrij">
          <div>
            <label htmlFor="jaar">Jaar</label>
            <input
              id="jaar"
              name="jaar"
              type="number"
              min={2020}
              max={2100}
              defaultValue={huidig.jaar}
              required
            />
          </div>
          <div>
            <label htmlFor="kwartaal">Kwartaal</label>
            <select id="kwartaal" name="kwartaal" defaultValue={huidig.kwartaal}>
              {[1, 2, 3, 4].map((nummer) => (
                <option key={nummer} value={nummer}>
                  Q{nummer}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="eur_per_kwh">Bedrag per kWh</label>
            <input id="eur_per_kwh" name="eur_per_kwh" placeholder="0,2809" required />
          </div>
          <div>
            <label htmlFor="btw_voet">Btw-percentage</label>
            <input id="btw_voet" name="btw_voet" defaultValue="6" />
          </div>
        </div>
        <div className="veldenrij">
          <div className="keuzevak">
            <input
              id="inclusief_btw"
              name="inclusief_btw"
              type="checkbox"
              value="ja"
              defaultChecked
            />
            <label htmlFor="inclusief_btw" style={{ margin: 0 }}>
              Het bedrag hierboven is inclusief btw
            </label>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="notitie">Notitie (optioneel)</label>
            <input
              id="notitie"
              name="notitie"
              placeholder="Bijvoorbeeld: overgenomen uit de circulaire van 12 juni"
            />
          </div>
        </div>
        <p className="hulp" style={{ marginBottom: 12 }}>
          Het gepubliceerde maximumtarief is een consumentenprijs en dus doorgaans inclusief
          btw. Vink het vakje uit als jouw bedrag exclusief btw is.
        </p>
        <button type="submit">Bewaren en bevestigen</button>
      </form>
    </>
  );
}
