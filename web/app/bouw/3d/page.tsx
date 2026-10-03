import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { laadDrie, type Driegegevens } from "@/lib/bouw/drie/laden";
import { standaardHuis } from "@/lib/bouw/huizen";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

import { DrieLader } from "./drie-lader";

export const dynamic = "force-dynamic";

export default async function Driepagina() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Het bouwproject" />;

  const huis = await standaardHuis();
  let gegevens: Driegegevens;
  try {
    gegevens = await laadDrie(huis.id, ik.email);
  } catch (fout) {
    return (
      <>
        <h1>3D</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  const metRuimtes = gegevens.verdiepingen.filter((v) => v.ruimtes.length > 0);
  const zonderMuren = metRuimtes.filter((v) => !v.metMuren);

  return (
    <>
      <h1>3D</h1>
      <p className="inleiding">
        Het huis uit de omgezette grondplannen: de muren, ramen en deuren zoals de architect ze tekende, op de hoogte
        van elke verdieping, met de materialen uit de <Link href="/bouw/keuzes">keuzes</Link>.
      </p>

      {metRuimtes.length === 0 ? (
        <div className="kaart">
          <p className="leeg">
            Nog niets om te tonen. Zet eerst een grondplan om bij <Link href="/bouw/plannen">Plannen</Link>.
          </p>
        </div>
      ) : (
        <>
          {zonderMuren.length > 0 ? (
            <div className="melding let-op">
              {zonderMuren.map((v) => v.naam).join(", ")} {zonderMuren.length === 1 ? "heeft" : "hebben"} nog geen muren:
              die komen bij het omzetten mee sinds deze versie van de app. Zet{" "}
              {zonderMuren.map((v, i) => (
                <span key={v.id}>
                  {i > 0 ? ", " : ""}
                  {v.grondplanId ? <Link href={`/bouw/plannen/${v.grondplanId}/omzetten`}>{v.naam.toLowerCase()}</Link> : v.naam.toLowerCase()}
                </span>
              ))}{" "}
              opnieuw om en bevestig.
            </div>
          ) : null}
          <DrieLader huisId={huis.id} gegevens={gegevens} />
        </>
      )}
    </>
  );
}
