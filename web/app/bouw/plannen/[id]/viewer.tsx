"use client";

import { usePlanblad } from "./planblad";
import { Planvlak } from "./planvlak";

/**
 * De planviewer: het blad ophalen en tonen, om te verschuiven en te zoomen.
 * Het nakijkscherm van de omzetting gebruikt dezelfde onderdelen, met een
 * laag met de ruimtes erover.
 */
export default function Viewer({ versieId, bestandId, pagina }: { versieId: number; bestandId: number; pagina: number }) {
  const { blad, fout } = usePlanblad(versieId, bestandId, pagina);

  if (fout) return <div className="viewer viewer-leeg melding fout">{fout}</div>;
  if (!blad) {
    return (
      <div className="viewer">
        <div className="viewer-leeg">Plan laden…</div>
      </div>
    );
  }
  return <Planvlak blad={blad} info={blad.aantal > 1 ? `blad ${pagina} van ${blad.aantal}` : null} />;
}
