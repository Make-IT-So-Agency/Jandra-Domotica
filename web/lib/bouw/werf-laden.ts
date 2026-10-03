import "server-only";

import { standVanLink } from "./linkregels";
import { lijstLinks } from "./links";
import { kaderVan } from "./omzetting/geometrie";
import type { Kader, Xy } from "./omzetting/types";
import type { Opleverregel } from "./oplevering-pdf";
import { leesBestanden, lijstGebouwen, lijstPartijen, lijstRuimtes, lijstVerdiepingen } from "./opslag";
import { tijdelijkeUrls } from "./opslagruimte";
import type { Huis, SoortRuimte } from "./types";
import { sorteerVerdiepingen, verdiepingNaam } from "./weergave";
import { RONDENAMEN, type StatusOpleverpunt } from "./werf";
import { lijstOpleverpunten, lijstWerffotos, type Werffoto } from "./werf-opslag";

/** Een verdieping met haar ruimtes, om een foto of opleverpunt op te plaatsen. */
export interface Plaatsverdieping {
  id: number;
  naam: string;
  /** Het kader van de ruimtes, in meter; null als de verdieping nog geen ruimtes heeft. */
  kader: Kader | null;
  ruimtes: { id: number; naam: string; soort: SoortRuimte; veelhoek: Xy[][] }[];
}

/** Alle verdiepingen van het huis, in volgorde, met de naam van hun gebouw erbij als er meer dan één is. */
export async function laadPlaatsen(huisId: number): Promise<Plaatsverdieping[]> {
  const [gebouwen, verdiepingen, ruimtes] = await Promise.all([
    lijstGebouwen(huisId),
    lijstVerdiepingen(huisId),
    lijstRuimtes(huisId),
  ]);
  return sorteerVerdiepingen(verdiepingen, gebouwen).map((verdieping) => {
    const eigen = ruimtes.filter((ruimte) => ruimte.verdieping_id === verdieping.id);
    const punten = eigen.flatMap((ruimte) => ruimte.veelhoek[0] ?? []);
    return {
      id: verdieping.id,
      naam: verdiepingNaam(verdieping, gebouwen),
      kader: punten.length > 0 ? kaderVan(punten) : null,
      ruimtes: eigen.map((ruimte) => ({ id: ruimte.id, naam: ruimte.naam, soort: ruimte.soort, veelhoek: ruimte.veelhoek })),
    };
  });
}

/** De naam van een ruimte met haar verdieping: "Keuken (gelijkvloers)". */
export function ruimtenaamIn(plaatsen: Plaatsverdieping[]): (ruimteId: number | null) => string | null {
  const namen = new Map<number, string>();
  for (const verdieping of plaatsen) {
    for (const ruimte of verdieping.ruimtes) {
      namen.set(ruimte.id, plaatsen.length > 1 ? `${ruimte.naam} (${verdieping.naam.toLowerCase()})` : ruimte.naam);
    }
  }
  return (ruimteId) => (ruimteId === null ? null : (namen.get(ruimteId) ?? null));
}

/**
 * Ondertekende URL's van een uur voor een reeks foto's, in één vraag aan
 * Storage. Standaard de kleine versie; met groot de foto zelf.
 */
export async function fotoUrls(huisId: number, fotos: Werffoto[], groot = false): Promise<Map<number, string>> {
  const bestandVan = (foto: Werffoto) => (groot ? foto.bestand_id : (foto.duim_bestand_id ?? foto.bestand_id));
  const bestanden = await leesBestanden(huisId, [...new Set(fotos.map(bestandVan))]);
  const pad = new Map(bestanden.filter((b) => b.status === "klaar").map((b) => [b.id, b.pad]));
  const urls = await tijdelijkeUrls([...new Set(pad.values())], 3600).catch(() => new Map<string, string>());
  const uit = new Map<number, string>();
  for (const foto of fotos) {
    const url = urls.get(pad.get(bestandVan(foto)) ?? "");
    if (url) uit.set(foto.id, url);
  }
  return uit;
}

/** Wat de aannemer bij elk punt leest: voor hem is open of gemeld hetzelfde. */
const VOOR_DE_AANNEMER: Record<StatusOpleverpunt, string> = {
  open: "te herstellen",
  gemeld: "te herstellen",
  hersteld: "hersteld, wij kijken het na",
  gecontroleerd: "in orde",
};

/** Zoveel foto's samen mogen in de PDF: een functie op Vercel geeft hoogstens 4,5 MB terug. */
const MAX_FOTOBYTES = 3 * 1024 * 1024;

/** De opleverpunten van één aannemer van het huis die nog niet in orde zijn, klaar voor de PDF. */
export async function laadOpleverlijst(
  huis: Huis,
  partijId: number,
): Promise<{
  partij: string;
  project: string | null;
  regels: Opleverregel[];
  metLink: boolean;
} | null> {
  const [partijen, punten, plaatsen, links] = await Promise.all([
    lijstPartijen(huis.id),
    lijstOpleverpunten(huis.id, { partijId }),
    laadPlaatsen(huis.id),
    lijstLinks(huis.id),
  ]);
  const partij = partijen.find((p) => p.id === partijId);
  if (!partij) return null;
  const open = punten.filter((punt) => punt.status !== "gecontroleerd");
  const fotos = await lijstWerffotos(huis.id, { opleverpuntIds: open.map((punt) => punt.id) });
  // Per punt de eerste foto: die toont meestal wat er mis is.
  const eerste = new Map<number, Werffoto>();
  for (const foto of [...fotos].sort((a, b) => a.genomen_op.localeCompare(b.genomen_op))) {
    if (foto.opleverpunt_id !== null && !eerste.has(foto.opleverpunt_id)) eerste.set(foto.opleverpunt_id, foto);
  }
  const urls = await fotoUrls(huis.id, [...eerste.values()]);
  const ruimtenaam = ruimtenaamIn(plaatsen);

  let bytes = 0;
  const regels: Opleverregel[] = [];
  for (const [index, punt] of open.entries()) {
    const foto = eerste.get(punt.id);
    const url = foto ? urls.get(foto.id) : undefined;
    let inhoud: Buffer | null = null;
    if (url && bytes < MAX_FOTOBYTES) {
      inhoud = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        .then(async (antwoord) => (antwoord.ok ? Buffer.from(await antwoord.arrayBuffer()) : null))
        .catch(() => null);
      bytes += inhoud?.length ?? 0;
    }
    regels.push({
      nummer: index + 1,
      titel: punt.titel,
      omschrijving: punt.omschrijving,
      waar: ruimtenaam(punt.ruimte_id),
      ronde: RONDENAMEN[punt.ronde],
      status: VOOR_DE_AANNEMER[punt.status],
      opmerking: punt.herstelopmerking,
      foto: inhoud,
    });
  }
  const nu = new Date();
  const metLink = links.some(
    (link) => link.partij_id === partijId && link.rechten.includes("oplevering") && standVanLink(link, nu) === "actief",
  );
  return { partij: partij.naam, project: huis.projectnaam, regels, metLink };
}
