import Link from "next/link";

import { GeenToegang } from "@/components/geen-toegang";
import { lijstHuizen } from "@/lib/bouw/huizen";
import { huispad } from "@/lib/bouw/paden";
import { HUISSOORTNAMEN, type Huis } from "@/lib/bouw/types";
import { magBouwZien } from "@/lib/rollen";
import { vereistGebruiker } from "@/lib/toegang";

export const dynamic = "force-dynamic";

/** De huizen onder Vastgoed. */
export default async function Huizenpagina() {
  const ik = await vereistGebruiker();
  if (!magBouwZien(ik)) return <GeenToegang wat="Vastgoed" />;

  let huizen: Huis[];
  try {
    huizen = await lijstHuizen({ ookGearchiveerd: true });
  } catch (fout) {
    return (
      <>
        <h1>Huizen</h1>
        <div className="melding fout">{fout instanceof Error ? fout.message : "Lezen mislukt."}</div>
      </>
    );
  }

  return (
    <>
      <h1>Huizen</h1>
      <p className="inleiding">Elk huis heeft zijn eigen plannen, partijen, geld en onderhoud.</p>
      {huizen.length === 0 ? (
        <div className="kaart">
          <p className="leeg">Nog geen huizen.</p>
        </div>
      ) : (
        <ul className="wijzigingen">
          {huizen.map((huis) => (
            <li key={huis.id}>
              <Link href={huispad(huis.id)}>{huis.naam}</Link>
              <span className="hulp">
                {" "}
                · {HUISSOORTNAMEN[huis.soort]}
                {huis.gearchiveerd_op ? " · gearchiveerd" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
