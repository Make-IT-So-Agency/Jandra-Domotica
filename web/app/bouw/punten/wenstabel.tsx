import { CATEGORIEKLEUREN, type Wensenlijst } from "@/lib/bouw/punten";

/** De wensenlijst als tabel per ruimte: voor het puntenscherm en de wensenlijst zelf. */
export function Wenstabel({ lijst, metVerdieping = false }: { lijst: Wensenlijst; metVerdieping?: boolean }) {
  return (
    <>
      {lijst.verdiepingen.map((verdieping) => (
        <section key={verdieping.verdiepingId} aria-label={verdieping.naam}>
          {metVerdieping ? (
            <h2>
              {verdieping.naam} <span className="hulp">· {verdieping.aantal} punten</span>
            </h2>
          ) : null}
          {verdieping.ruimtes.map((ruimte) => (
            <div key={ruimte.ruimteId ?? "zonder"} className="kaart">
              <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
                {ruimte.naam} <span className="hulp">· {ruimte.aantal}</span>
              </h3>
              <div className="tabel-omhulsel">
                <table>
                  <thead>
                    <tr>
                      <th>Wat</th>
                      <th className="getal">Aantal</th>
                      <th>Hoogte</th>
                      <th>Opmerking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruimte.regels.map((regel) => (
                      <tr key={regel.soort}>
                        <td data-label="Wat">
                          <span className="palet-code" style={{ background: CATEGORIEKLEUREN[regel.categorie] }}>
                            {regel.code}
                          </span>{" "}
                          {regel.naam}
                        </td>
                        <td data-label="Aantal" className="getal">
                          {regel.aantal}
                        </td>
                        <td data-label="Hoogte">{regel.hoogtes.join(", ")}</td>
                        <td data-label="Opmerking">{regel.opmerkingen.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
