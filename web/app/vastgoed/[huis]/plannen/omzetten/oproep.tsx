import Link from "next/link";

import { huispad } from "@/lib/bouw/paden";

/** Zolang er grondplannen niet omgezet zijn: een melding met de knop om ze in één keer om te zetten. */
export function Omzetoproep({ huisId, aantal }: { huisId: number; aantal: number }) {
  if (aantal === 0) return null;
  return (
    <div className="melding info omzetoproep">
      <span>
        {aantal === 1 ? "1 grondplan is nog niet omgezet naar ruimtes." : `${aantal} grondplannen zijn nog niet omgezet naar ruimtes.`}
      </span>
      <Link className="knop" href={huispad(huisId, "/plannen/omzetten")}>
        Alle grondplannen omzetten
      </Link>
    </div>
  );
}
