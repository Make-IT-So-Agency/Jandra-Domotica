import Link from "next/link";
import type { ReactNode } from "react";

import { vereistHuis } from "@/lib/bouw/huistoegang";
import { VASTGOED } from "@/lib/bouw/paden";

/**
 * De pagina's van één huis. Een onbekend nummer geeft 404; een gearchiveerd
 * huis blijft te bekijken, met een strook bovenaan.
 */
export default async function Huislayout({ children, params }: { children: ReactNode; params: Promise<{ huis: string }> }) {
  const huis = await vereistHuis(params);
  return (
    <>
      {huis.gearchiveerd_op ? (
        <div className="melding let-op">
          {huis.naam} is gearchiveerd: het staat niet meer in het menu en de bot volgt het niet meer. Zet het terug bij{" "}
          <Link href={VASTGOED}>Huizen</Link>.
        </div>
      ) : null}
      {children}
    </>
  );
}
