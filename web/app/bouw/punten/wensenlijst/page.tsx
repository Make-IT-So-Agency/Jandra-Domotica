import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { standaardHuis } from "@/lib/bouw/huizen";
import { CATEGORIEKLEUREN, CATEGORIENAMEN } from "@/lib/bouw/punten";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Wenstabel } from "../wenstabel";

export const dynamic = "force-dynamic";

export default async function Wensenlijstpagina() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  const { lijst } = await laadWensenlijst(huis);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href="/bouw/punten">← Punten</Link>
      </p>
      <h1>Wensenlijst</h1>
      <p className="inleiding">
        Wat er per ruimte moet komen, voor de elektricien en de domotica-installateur. Een download is een
        momentopname: de datum staat erop. Later dient dezelfde lijst om hun offertes te vergelijken.
      </p>

      {lijst.aantal === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen punten. Zet ze op het plan bij <Link href="/bouw/punten">Punten</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="knoppenrij" style={{ marginBottom: 18 }}>
            <a className="knop" href={`/api/bouw/wensenlijst/pdf?huis=${huis.id}`}>
              PDF downloaden
            </a>
            <a className="knop stil" href={`/api/bouw/wensenlijst/excel?huis=${huis.id}`}>
              Excel downloaden
            </a>
          </div>

          <h2>Totaal per soort</h2>
          <div className="tabel-omhulsel">
            <table>
              <thead>
                <tr>
                  <th>Wat</th>
                  <th>Categorie</th>
                  <th className="getal">Aantal</th>
                </tr>
              </thead>
              <tbody>
                {lijst.totalen.map((regel) => (
                  <tr key={regel.soort}>
                    <td data-label="Wat">
                      <span className="palet-code" style={{ background: CATEGORIEKLEUREN[regel.categorie] }}>
                        {regel.code}
                      </span>{" "}
                      {regel.naam}
                    </td>
                    <td data-label="Categorie">{CATEGORIENAMEN[regel.categorie]}</td>
                    <td data-label="Aantal" className="getal">
                      {regel.aantal}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="Totaal">Totaal</td>
                  <td />
                  <td data-label="Aantal" className="getal">
                    {lijst.aantal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <Wenstabel lijst={lijst} metVerdieping />
        </>
      )}
    </>
  );
}
