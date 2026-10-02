import { sleutelVan } from "../invoer";
import { binnenRuimte, middenVan } from "./geometrie";
import type { Xy } from "./types";

/**
 * Een nieuwe versie van een grondplan tegenover de ruimtes die er al zijn.
 * Een ruimte die op dezelfde plaats ligt, zet de oude voort en houdt haar
 * id; zo blijven de punten, keuzes en foto's die er later aan hangen, mee.
 * Puur: de browser toont het verschil, de server schrijft het weg.
 *
 * Alles in meter, in het assenstelsel van het gebouw.
 */

export interface Oudruimte {
  id: number;
  naam: string;
  ringen: Xy[][];
  oppervlakte: number;
}

export interface Nieuweruimte {
  sleutel: string;
  naam: string;
  ringen: Xy[][];
}

export interface Koppeling {
  sleutel: string;
  ruimteId: number | null;
  oudeNaam: string | null;
  oudeOppervlakte: number | null;
}

export interface Ruimteverschil {
  koppelingen: Koppeling[];
  verdwenen: Oudruimte[];
}

/** Liggen twee ruimtes op dezelfde plaats: het midden van de ene in de andere? */
function zelfdePlaats(a: Xy[][], b: Xy[][]): boolean {
  return binnenRuimte(middenVan(a), b) || binnenRuimte(middenVan(b), a);
}

export function vergelijkRuimtes(oud: Oudruimte[], nieuw: Nieuweruimte[]): Ruimteverschil {
  const gekoppeld = new Map<string, Oudruimte>();
  const bezet = new Set<number>();
  const koppel = (past: (o: Oudruimte, n: Nieuweruimte) => boolean) => {
    for (const n of nieuw) {
      if (gekoppeld.has(n.sleutel)) continue;
      const o = oud.find((kandidaat) => !bezet.has(kandidaat.id) && past(kandidaat, n));
      if (o) {
        gekoppeld.set(n.sleutel, o);
        bezet.add(o.id);
      }
    }
  };

  // Eerst wat op dezelfde plaats ligt en zo heet, dan wat op dezelfde plaats
  // ligt (hernoemd), en tot slot wat zo heet maar verschoven is.
  koppel((o, n) => sleutelVan(o.naam) === sleutelVan(n.naam) && zelfdePlaats(o.ringen, n.ringen));
  koppel((o, n) => zelfdePlaats(o.ringen, n.ringen));
  koppel((o, n) => sleutelVan(o.naam) === sleutelVan(n.naam) && n.naam.trim() !== "");

  return {
    koppelingen: nieuw.map((n) => {
      const o = gekoppeld.get(n.sleutel);
      return { sleutel: n.sleutel, ruimteId: o?.id ?? null, oudeNaam: o?.naam ?? null, oudeOppervlakte: o?.oppervlakte ?? null };
    }),
    verdwenen: oud.filter((o) => !bezet.has(o.id)),
  };
}
