import Link from "next/link";

import { huispad } from "@/lib/bouw/paden";

/**
 * Zolang er grondplannen niet omgezet zijn: een melding met de knop om ze in
 * één keer om te zetten. En zijn er omgezet met oudere regels: een melding
 * met de knop om ze opnieuw om te zetten, met wat de app nu kan.
 */
export function Omzetoproep({ huisId, aantal, verouderd = 0 }: { huisId: number; aantal: number; verouderd?: number }) {
  if (aantal === 0 && verouderd === 0) return null;
  return (
    <>
      {aantal > 0 ? (
        <div className="melding info omzetoproep">
          <span>
            {aantal === 1 ? "1 grondplan is nog niet omgezet naar ruimtes." : `${aantal} grondplannen zijn nog niet omgezet naar ruimtes.`}
          </span>
          <Link className="knop" href={huispad(huisId, "/plannen/omzetten")}>
            Alle grondplannen omzetten
          </Link>
        </div>
      ) : null}
      {verouderd > 0 ? (
        <div className="melding info omzetoproep">
          <span>
            {verouderd === 1 ? "1 grondplan werd omgezet met oudere regels." : `${verouderd} grondplannen werden omgezet met oudere regels.`}{" "}
            Opnieuw omzetten geeft de ramen met hun borstwering, de deuren en de luifels. Alles blijft op zijn plaats.
          </span>
          <Link className="knop" href={huispad(huisId, "/plannen/omzetten?opnieuw=1")}>
            Opnieuw omzetten
          </Link>
        </div>
      ) : null}
    </>
  );
}
