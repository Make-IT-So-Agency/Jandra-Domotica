import Link from "next/link";
import type { ReactNode } from "react";

import { vereistHuis } from "@/lib/bouw/huistoegang";
import { ONDERDEELNAMEN, nietVoorSoort, type Bouwonderdeel } from "@/lib/bouw/onderdelen";
import { VASTGOED, huispad } from "@/lib/bouw/paden";

/**
 * Voor de layout van keuzes, planning en werf: een bestaand huis heeft die
 * niet. Wie er toch belandt (een oude link, een bladwijzer), krijgt uitleg in
 * plaats van de pagina. De acties weigeren apart, zie vereistHuisrechten.
 */
export async function Onderdeelpoort({
  params,
  onderdeel,
  children,
}: {
  params: Promise<{ huis: string }>;
  onderdeel: Bouwonderdeel;
  children: ReactNode;
}) {
  const huis = await vereistHuis(params);
  const nee = nietVoorSoort(huis, onderdeel);
  if (!nee) return <>{children}</>;
  return (
    <>
      <h1>{ONDERDEELNAMEN[onderdeel]}</h1>
      <div className="kaart">
        <p>{nee}</p>
        <div className="knoppenrij" style={{ marginTop: 12 }}>
          <Link className="knop" href={huispad(huis.id)}>
            Naar het overzicht
          </Link>
          <Link className="knop stil" href={VASTGOED}>
            Huizen
          </Link>
        </div>
      </div>
    </>
  );
}
