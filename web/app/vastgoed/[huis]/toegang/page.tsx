import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { vereistHuis } from "@/lib/bouw/huistoegang";
import { plusDagen, vandaag } from "@/lib/bouw/kalender";
import { korteNaam } from "@/lib/bouw/keuzes";
import { RECHTNAMEN, STANDAARD_GELDIG_DAGEN, standVanLink } from "@/lib/bouw/linkregels";
import { lijstInzendingen, lijstLinks, type Inzending, type Link as Toegangslink } from "@/lib/bouw/links";
import { rechtenBinnenSoort, rechtenVoorSoort } from "@/lib/bouw/onderdelen";
import { lijstPartijen } from "@/lib/bouw/opslag";
import { huispad } from "@/lib/bouw/paden";
import type { Partij } from "@/lib/bouw/types";
import { datum, datumTijd } from "@/lib/format";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { BevestigKnop } from "@/components/bouw/bevestig-knop";
import { Melding } from "@/components/bouw/melding";
import { trekLinkInActie } from "./acties";
import { NieuweLink } from "./nieuwe-link";

export const dynamic = "force-dynamic";

const STANDNAMEN = { actief: "actief", verlopen: "verlopen", ingetrokken: "ingetrokken" } as const;

export default async function Toegangspagina({
  params,
  searchParams,
}: {
  params: Promise<{ huis: string }>;
  searchParams: Promise<{ melding?: string; soort?: string }>;
}) {
  const { melding, soort } = await searchParams;
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await vereistHuis(params);
  let links: Toegangslink[];
  let partijen: Partij[];
  let inzendingen: Inzending[];
  try {
    [links, partijen, inzendingen] = await Promise.all([
      lijstLinks(huis.id),
      lijstPartijen(huis.id),
      lijstInzendingen(huis.id),
    ]);
  } catch (fout) {
    return (
      <>
        <h1>Toegang</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const nu = new Date();
  const naam = (partijId: number) => partijen.find((partij) => partij.id === partijId)?.naam ?? "Verwijderde partij";

  return (
    <>
      <h1>Toegang</h1>
      <p className="inleiding">
        Een persoonlijke link voor de architect, de aannemers en de leveranciers: zonder account, met een vervaldatum,
        en enkel wat je aanvinkt. Wat ze insturen, wacht tot jullie het verwerken: een dossier bij{" "}
        <Link href={huispad(huis.id, "/plannen#inzendingen")}>Plannen</Link>, een offerte of factuur bij{" "}
        <Link href={huispad(huis.id, "/geld#inzendingen")}>Geld</Link>.
      </p>

      <Melding soort={soort} melding={melding} />

      {links.length > 0 ? (
        <div className="tabel-omhulsel">
          <table>
            <thead>
              <tr>
                <th>Voor</th>
                <th>Mag</th>
                <th>Werkt tot</th>
                <th>Laatst gebruikt</th>
                <th>Ingestuurd</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const stand = standVanLink(link, nu);
                return (
                  <tr key={link.id}>
                    <td data-label="Voor">
                      {naam(link.partij_id)}{" "}
                      <span className={`label-vlag${stand === "actief" ? " goed" : ""}`}>{STANDNAMEN[stand]}</span>
                    </td>
                    <td data-label="Mag">{rechtenBinnenSoort(link.rechten, huis.soort).map((recht) => RECHTNAMEN[recht]).join("; ")}</td>
                    <td data-label="Werkt tot">{stand === "ingetrokken" ? `ingetrokken op ${datum(link.ingetrokken_op)}` : datum(link.vervalt_op)}</td>
                    <td data-label="Laatst gebruikt">{link.laatst_gebruikt_op ? datumTijd(link.laatst_gebruikt_op) : "nog niet"}</td>
                    <td data-label="Ingestuurd">{inzendingen.filter((inzending) => inzending.link_id === link.id).length}</td>
                    <td>
                      {stand === "actief" ? (
                        <form action={trekLinkInActie.bind(null, huis.id)}>
                          <input type="hidden" name="id" value={link.id} />
                          <BevestigKnop vraag={`De link van ${naam(link.partij_id)} intrekken? Hij werkt dan meteen niet meer.`}>
                            Intrekken
                          </BevestigKnop>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kaart">
          <p className="leeg">Nog geen links.</p>
        </div>
      )}

      <h2>Nieuwe link</h2>
      <NieuweLink
        huisId={huis.id}
        mogelijk={rechtenVoorSoort(huis.soort)}
        partijen={partijen.map((partij) => ({
          id: partij.id,
          naam: partij.naam,
          soort: partij.soort,
          email: partij.email,
          contactpersoon: partij.contactpersoon,
        }))}
        vervaldatum={plusDagen(vandaag(), STANDAARD_GELDIG_DAGEN)}
        afzender={korteNaam(ik.naam, ik.email)}
      />

      <p className="hulp" style={{ marginTop: 12 }}>
        De app bewaart van een link enkel een vingerafdruk (SHA-256), nooit de link zelf. Een link toont nooit prijzen,
        het adres of de opmerkingen in de planning.
      </p>
    </>
  );
}
