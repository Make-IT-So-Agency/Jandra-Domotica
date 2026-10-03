import { dagenTekst, dagenTussen, korteDatum } from "@/lib/bouw/kalender";
import { factuurstand, vervaldagVan, type Factuur } from "@/lib/bouw/geld";

/** Hoe het met een factuur staat: betaald, te laat, binnenkort of later te betalen. */
export function Factuurlabel({ factuur, vandaag }: { factuur: Factuur; vandaag: string }) {
  if (factuur.bedrag < 0) {
    return factuur.betaald_op ? (
      <span className="label-vlag goed">verrekend {korteDatum(factuur.betaald_op, vandaag)}</span>
    ) : (
      <span className="label-vlag">creditnota</span>
    );
  }
  const stand = factuurstand(factuur, vandaag);
  if (stand === "betaald") return <span className="label-vlag goed">betaald {korteDatum(factuur.betaald_op!, vandaag)}</span>;
  const dagen = dagenTussen(vandaag, vervaldagVan(factuur));
  return (
    <span className={`label-vlag${stand === "te_laat" ? " fout" : stand === "binnenkort" ? " let-op" : ""}`}>
      {stand === "te_laat" ? dagenTekst(dagen) : `betalen ${dagenTekst(dagen)}`}
    </span>
  );
}

/**
 * Een streepje waar geen bedrag of bestand is. Op een gsm valt een cel met
 * enkel dit streepje weg, zodat een kaartje enkel toont wat er is.
 */
export function Geen() {
  return <span className="geen">—</span>;
}

/** Een link naar de PDF van een offerte of factuur, in een nieuw tabblad. */
export function Pdflink({ huisId, bestandId }: { huisId: number; bestandId: number | null }) {
  if (!bestandId) return <Geen />;
  return (
    <a href={`/api/bouw/document/${bestandId}?huis=${huisId}`} target="_blank" rel="noopener noreferrer">
      PDF
    </a>
  );
}
