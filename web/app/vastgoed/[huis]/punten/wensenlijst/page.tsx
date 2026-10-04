import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { huispad } from "@/lib/bouw/paden";
import { CATEGORIEKLEUREN, CATEGORIENAMEN, isVak, VAKKEN, VAKNAMEN, type Vak } from "@/lib/bouw/punten";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { Wenstabel } from "@/components/bouw/wenstabel";

export const dynamic = "force-dynamic";

/** Voor wie de lijst van elk vakgebied is. */
const VOOR: Record<Vak, string> = {
  elektriciteit: "de elektricien en de domotica-installateur",
  sanitair: "de loodgieter en de verwarmingsinstallateur",
};

export default async function Wensenlijstpagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ vak?: string }>;
}) {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  const gevraagd = (await searchParams).vak;
  const vak: Vak = isVak(gevraagd) ? gevraagd : "elektriciteit";
  const { lijst } = await laadWensenlijst(huis, vak);

  return (
    <>
      <p className="hulp" style={{ marginBottom: 4 }}>
        <Link href={huispad(huis.id, "/punten")}>← Punten</Link>
      </p>
      <h1>Wensenlijst</h1>
      <p className="inleiding">
        Wat er per ruimte moet komen, voor {VOOR[vak]}. Een download is een momentopname: de datum staat erop.
        Later dient dezelfde lijst om hun offertes te vergelijken.
      </p>

      <nav className="tabs" aria-label="Vakgebieden">
        {VAKKEN.map((v) => (
          <Link
            key={v}
            href={huispad(huis.id, `/punten/wensenlijst?vak=${v}`)}
            className={v === vak ? "actief" : undefined}
            aria-current={v === vak ? "page" : undefined}
          >
            {VAKNAMEN[v]}
          </Link>
        ))}
      </nav>

      {lijst.aantal === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog geen punten. Zet ze op het plan bij <Link href={huispad(huis.id, "/punten")}>Punten</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="knoppenrij" style={{ marginBottom: 18 }}>
            <a className="knop" href={`/api/bouw/wensenlijst/pdf?huis=${huis.id}&vak=${vak}`}>
              PDF downloaden
            </a>
            <a className="knop stil" href={`/api/bouw/wensenlijst/excel?huis=${huis.id}&vak=${vak}`}>
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
