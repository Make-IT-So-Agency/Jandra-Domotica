import { binnen, kaderVan, nettoOppervlakte, oppervlakte, vereenvoudig } from "./geometrie";
import type { Blad, Kader, Xy } from "./types";

/**
 * De witte vlakken van een blad. Een tekenpakket als Vectorworks vult elke
 * ruimte met wit, met precies de oppervlakte die het label erin vermeldt.
 * Ook muurstukken, meubels, tekstmaskers en het titelblok zijn witte vlakken;
 * welke een ruimte is, beslist ruimtes.ts.
 */

export interface Vlak {
  /** De buitenrand, en daarna de gaten. */
  ringen: Xy[][];
  /** De netto-oppervlakte in vierkante punten. */
  oppervlakte: number;
  kader: Kader;
}

/** Wit, of zo goed als: sommige pakketten schrijven #fefefe. */
export function isWit(kleur: string | null): boolean {
  if (!kleur || !/^#[0-9a-f]{6}$/.test(kleur)) return false;
  return [1, 3, 5].every((i) => parseInt(kleur.slice(i, i + 2), 16) >= 250);
}

export function witteVlakken(blad: Blad): Vlak[] {
  const vlakken: Vlak[] = [];
  for (const pad of blad.paden) {
    if (!isWit(pad.vul)) continue;
    const ringen = pad.delen
      .map((deel) => vereenvoudig(deel.punten, 0.01))
      .filter((ring) => ring.length >= 3 && Math.abs(oppervlakte(ring)) > 0.01);
    // Een deelpad dat binnen een ander deelpad van hetzelfde pad ligt, is een
    // gat: een kolom of een schacht in de ruimte.
    const gesorteerd = [...ringen].sort((a, b) => Math.abs(oppervlakte(b)) - Math.abs(oppervlakte(a)));
    const buitenranden: Xy[][][] = [];
    for (const ring of gesorteerd) {
      const ouder = buitenranden.find((vlak) => binnen(ring[0], vlak[0]) && !vlak.slice(1).some((gat) => binnen(ring[0], gat)));
      if (ouder) ouder.push(ring);
      else buitenranden.push([ring]);
    }
    for (const vlak of buitenranden) {
      vlakken.push({ ringen: vlak, oppervlakte: nettoOppervlakte(vlak), kader: kaderVan(vlak[0]) });
    }
  }
  return vlakken;
}
