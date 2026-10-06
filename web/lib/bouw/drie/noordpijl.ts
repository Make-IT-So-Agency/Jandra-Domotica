import type { Blad, Tekst, Xy } from "../omzetting/types";

/**
 * De noordpijl op een inplantingsplan. Een architect tekent ze als een
 * windroos met de letters N, Z, O en W rond de pijlen (in het Frans N, S, E,
 * O; in het Engels N, S, E, W). Uit waar die letters op het blad staan, volgt
 * waar het noorden ligt: niet altijd boven, want een plan ligt meestal met de
 * straat onderaan.
 *
 * Het 3D-scherm legt het inplantingsplan rechtop op de grond, dus de hoek op
 * het blad is ook de hoek van het noorden op het terrein (zie zon.ts). Zo
 * staat de zon juist, ook zonder de omgeving van Digitaal Vlaanderen.
 *
 * Een pijl met enkel een N leest de app (nog) niet: daar ligt de richting in
 * de tekening, niet in de letters.
 *
 * Puur, in paginapunten (y naar beneden).
 */

export interface Noordpijl {
  /** Waar het noorden op het blad ligt: met de klok mee vanaf boven, in graden. */
  hoek: number;
  /** Het midden van de windroos, op het blad. */
  midden: Xy;
  /** De letters die meetelden, bv. "NZOW". */
  letters: string;
}

type Soort = "noord" | "zuid" | "oost" | "west" | "o";

/** "O" is oost in het Nederlands en west in het Frans: dat beslist de kant waar ze staat. */
const SOORTEN: Record<string, Soort> = {
  N: "noord",
  NOORD: "noord",
  NOORDEN: "noord",
  NORD: "noord",
  NORTH: "noord",
  Z: "zuid",
  ZUID: "zuid",
  ZUIDEN: "zuid",
  S: "zuid",
  SUD: "zuid",
  SOUTH: "zuid",
  E: "oost",
  EST: "oost",
  EAST: "oost",
  OOST: "oost",
  OOSTEN: "oost",
  W: "west",
  WEST: "west",
  WESTEN: "west",
  OUEST: "west",
  O: "o",
};

/** Zo ver uit elkaar staan de letters van een windroos hoogstens: zo'n 10 cm op het blad. */
const MAX_AFSTAND = 300;

interface Letter {
  soort: Soort;
  tekst: string;
  p: Xy;
  grootte: number;
}

const afstand = (a: Xy, b: Xy) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const graden = (r: number) => (((r * 180) / Math.PI) % 360 + 360) % 360;

/** De hoek van een richting op het blad, met de klok mee vanaf boven. */
function hoekVan([dx, dy]: Xy): number {
  return graden(Math.atan2(dx, -dy));
}

function letterVan(tekst: Tekst): Letter | null {
  const woord = tekst.tekst.trim().toUpperCase().replace(/[.:]$/, "");
  const soort = SOORTEN[woord];
  return soort ? { soort, tekst: woord.charAt(0), p: [tekst.x, tekst.y], grootte: Math.max(tekst.grootte, 1) } : null;
}

/**
 * Kijkt de letters op de zijkanten na: het oosten moet rechts van het noorden
 * liggen, het westen links, op ongeveer dezelfde afstand van het midden. Geeft
 * de letters die kloppen, of null als er een aan de verkeerde kant staat: dan
 * is het geen windroos.
 */
function zijkanten(letters: readonly Letter[], midden: Xy, noord: Xy, straal: number, grootte: number): Letter[] | null {
  const oost: Xy = [-noord[1], noord[0]];
  const kloppend: Letter[] = [];
  for (const letter of letters) {
    if (letter.soort === "noord" || letter.soort === "zuid") continue;
    if (letter.grootte > grootte * 2.5 || letter.grootte < grootte / 2.5) continue;
    const r = afstand(letter.p, midden);
    if (Math.abs(r - straal) > straal * 0.35 + grootte) continue;
    const kant = ((letter.p[0] - midden[0]) * oost[0] + (letter.p[1] - midden[1]) * oost[1]) / (r || 1);
    if (Math.abs(kant) < 0.8) continue;
    // "O" mag aan beide kanten: oost in het Nederlands, west in het Frans.
    if (letter.soort === "o" || (letter.soort === "oost") === kant > 0) kloppend.push(letter);
    else return null;
  }
  return kloppend;
}

/** De noordpijl op het blad, of null als er geen windroos met letters staat. */
export function noordpijlOpBlad(blad: Pick<Blad, "teksten">): Noordpijl | null {
  const letters = blad.teksten.flatMap((tekst) => letterVan(tekst) ?? []);
  // Elke windroos die kan: meer kloppende letters gaat voor, dan de kleinste.
  const kandidaten: (Noordpijl & { score: number; d: number })[] = [];
  const kies = (kandidaat: Noordpijl & { score: number; d: number }) => kandidaten.push(kandidaat);

  for (const n of letters.filter((l) => l.soort === "noord")) {
    // Het noorden tegenover het zuiden: de as van de windroos.
    for (const z of letters.filter((l) => l.soort === "zuid")) {
      const d = afstand(n.p, z.p);
      const grootte = Math.max(n.grootte, z.grootte);
      if (d < 1.5 * grootte || d > MAX_AFSTAND || n.grootte > z.grootte * 2.5 || z.grootte > n.grootte * 2.5) continue;
      const noord: Xy = [(n.p[0] - z.p[0]) / d, (n.p[1] - z.p[1]) / d];
      const midden: Xy = [(n.p[0] + z.p[0]) / 2, (n.p[1] + z.p[1]) / 2];
      const zij = zijkanten(letters, midden, noord, d / 2, grootte);
      if (!zij) continue;
      kies({ hoek: hoekVan(noord), midden, letters: [n, z, ...zij].map((l) => l.tekst).join(""), score: 2 + zij.length, d });
    }
    // Zonder zuiden: het noorden haaks op de lijn van oost naar west.
    const zijletters = letters.filter((l) => l.soort === "oost" || l.soort === "west" || l.soort === "o");
    for (let i = 0; i < zijletters.length; i++) {
      for (let j = i + 1; j < zijletters.length; j++) {
        const [a, b] = [zijletters[i], zijletters[j]];
        const d = afstand(a.p, b.p);
        const grootte = Math.max(n.grootte, a.grootte, b.grootte);
        if (d < 1.5 * grootte || d > MAX_AFSTAND) continue;
        const midden: Xy = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2];
        const r = afstand(n.p, midden);
        if (r < grootte || Math.abs(r - d / 2) > d * 0.2 + grootte) continue;
        const noord: Xy = [(n.p[0] - midden[0]) / r, (n.p[1] - midden[1]) / r];
        // Haaks: de N staat op de middelloodlijn van de twee andere.
        if (Math.abs((noord[0] * (b.p[0] - a.p[0]) + noord[1] * (b.p[1] - a.p[1])) / d) > 0.2) continue;
        const zij = zijkanten([a, b], midden, noord, d / 2, grootte);
        if (!zij || zij.length < 2) continue;
        // Twee keer "O", of oost en oost: dat is geen windroos.
        const soorten = new Set(zij.map((l) => l.soort));
        if (soorten.size < 2) continue;
        kies({ hoek: hoekVan(noord), midden, letters: [n, ...zij].map((l) => l.tekst).join(""), score: 3, d });
      }
    }
  }
  const beste = kandidaten.sort((a, b) => b.score - a.score || a.d - b.d)[0];
  if (!beste) return null;
  return { hoek: Math.round(beste.hoek * 10) / 10, midden: beste.midden, letters: beste.letters };
}
