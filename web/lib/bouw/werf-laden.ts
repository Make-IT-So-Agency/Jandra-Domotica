import "server-only";

import { kaderVan } from "./omzetting/geometrie";
import type { Kader, Xy } from "./omzetting/types";
import { leesBestanden, lijstGebouwen, lijstRuimtes, lijstVerdiepingen } from "./opslag";
import { tijdelijkeUrls } from "./opslagruimte";
import type { SoortRuimte } from "./types";
import { sorteerVerdiepingen, verdiepingNaam } from "./weergave";
import type { Werffoto } from "./werf-opslag";

/** Een verdieping met haar ruimtes, om een foto of opleverpunt op te plaatsen. */
export interface Plaatsverdieping {
  id: number;
  naam: string;
  /** Het kader van de ruimtes, in meter; null als de verdieping nog geen ruimtes heeft. */
  kader: Kader | null;
  ruimtes: { id: number; naam: string; soort: SoortRuimte; veelhoek: Xy[][] }[];
}

/** Alle verdiepingen, in volgorde, met de naam van hun gebouw erbij als er meer dan één is. */
export async function laadPlaatsen(): Promise<Plaatsverdieping[]> {
  const [gebouwen, verdiepingen, ruimtes] = await Promise.all([lijstGebouwen(), lijstVerdiepingen(), lijstRuimtes()]);
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
export async function fotoUrls(fotos: Werffoto[], groot = false): Promise<Map<number, string>> {
  const bestandVan = (foto: Werffoto) => (groot ? foto.bestand_id : (foto.duim_bestand_id ?? foto.bestand_id));
  const bestanden = await leesBestanden([...new Set(fotos.map(bestandVan))]);
  const pad = new Map(bestanden.filter((b) => b.status === "klaar").map((b) => [b.id, b.pad]));
  const urls = await tijdelijkeUrls([...new Set(pad.values())], 3600).catch(() => new Map<string, string>());
  const uit = new Map<number, string>();
  for (const foto of fotos) {
    const url = urls.get(pad.get(bestandVan(foto)) ?? "");
    if (url) uit.set(foto.id, url);
  }
  return uit;
}
