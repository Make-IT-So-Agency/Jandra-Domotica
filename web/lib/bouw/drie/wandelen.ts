import type { Xy } from "../omzetting/types";
import { opTrap, type Trap3d } from "./trappen";
import { binnenVeelhoeken, type Veelhoek } from "./vlak";

/**
 * Rondwandelen in het huis, met de trap op en af. Puur, met tests.
 *
 * Je loopt op een verdieping, zonder door een muur of een meubel, en niet in
 * een gat. Een trap stap je op aan zijn voet, of van boven waar hij aankomt;
 * langs de zijkant of eronder kan niet. Op een vlucht stijg je mee; op een
 * bordes blijf je op dezelfde hoogte, en van een vlucht naar de volgende gaat
 * het enkel via het bordes. Boven aan de trap loop je verder op de verdieping
 * erboven, onderaan op die eronder.
 *
 * Alles in meter, in het assenstelsel van het gebouw.
 */

export const OOGHOOGTE = 1.6;
/** Hoe breed je bent: zo ver blijf je van een muur. */
export const STRAAL = 0.2;
/** Tot hoever in een vlucht je op- of afstapt (deel van de lengte). */
const STAPRAND = 0.2;

export interface Wandelverdieping {
  id: number;
  gebouwId: number;
  z0: number;
  muren: Veelhoek[];
  /** De gaten in de vloer: een trapgat, een vide. */
  gaten: Veelhoek[];
  /** De trappen die hier beginnen. */
  trappen: Trap3d[];
  /** Meubels en toestellen die je tegenhouden (zie inrichten.ts). */
  obstakels?: Veelhoek[];
}

export interface Wandelstand {
  /** Op welke verdieping, of bij een trap: de verdieping waar hij begint. */
  verdieping: number;
  x: number;
  y: number;
  /** Op een trap: welke (de verdieping waar hij begint, en zijn plaats daar) en op welk deel. */
  trap: { van: number; index: number; deel: number } | null;
}

function trapVan(wereld: readonly Wandelverdieping[], trap: Wandelstand["trap"]): Trap3d | null {
  if (!trap) return null;
  return wereld.find((v) => v.id === trap.van)?.trappen[trap.index] ?? null;
}

/** Je midden en acht punten rond je, met je breedte erbij. */
function rondom(p: Xy): Xy[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) =>
    k === 8 ? p : [p[0] + Math.cos((k * Math.PI) / 4) * STRAAL, p[1] + Math.sin((k * Math.PI) / 4) * STRAAL],
  );
}

/**
 * Vrij op deze verdieping: niet in een muur, met je breedte erbij, en niet in
 * een meubel. Sta je al in een meubel (je begon er middenin, of het werd rond
 * je gezet), dan mag je eruit stappen, maar niet dieper erin.
 */
function vrij(verdieping: Wandelverdieping, p: Xy, van?: Xy): boolean {
  const hier = rondom(p);
  if (hier.some((q) => binnenVeelhoeken(q, verdieping.muren))) return false;
  const daar = van ? rondom(van) : null;
  return (verdieping.obstakels ?? []).every((obstakel) => {
    const nu = hier.filter((q) => binnenVeelhoeken(q, [obstakel])).length;
    return nu === 0 || (daar !== null && nu <= daar.filter((q) => binnenVeelhoeken(q, [obstakel])).length);
  });
}

/** Een stap van (dx, dy); kan het niet, dan blijf je staan. */
function probeer(wereld: readonly Wandelverdieping[], stand: Wandelstand, q: Xy): Wandelstand | null {
  const hier = wereld.find((v) => v.id === stand.verdieping);
  if (!hier) return null;
  const trap = trapVan(wereld, stand.trap);

  if (trap && stand.trap) {
    const op = opTrap(trap, q);
    // Op de trap blijven: enkel naar hetzelfde deel of een deel ernaast.
    if (op) return Math.abs(op.deel - stand.trap.deel) <= 1 ? { ...stand, x: q[0], y: q[1], trap: { ...stand.trap, deel: op.deel } } : null;
    // Van de trap af: onderaan op de verdieping eronder, bovenaan op die erboven.
    const was = opTrap(trap, [stand.x, stand.y]);
    const laatste = trap.delen.length - 1;
    if (stand.trap.deel === 0 && (was?.t ?? 0) <= STAPRAND) {
      const onder = wereld.find((v) => v.id === trap.van);
      return onder && vrij(onder, q) && !binnenVeelhoeken(q, onder.gaten) ? { verdieping: onder.id, x: q[0], y: q[1], trap: null } : null;
    }
    if (stand.trap.deel === laatste && (trap.delen[laatste].soort === "bordes" || (was?.t ?? 1) >= 1 - STAPRAND)) {
      const boven = wereld.find((v) => v.id === trap.naar);
      return boven && vrij(boven, q) && !binnenVeelhoeken(q, boven.gaten) ? { verdieping: boven.id, x: q[0], y: q[1], trap: null } : null;
    }
    return null;
  }

  // Een trap op aan zijn voet.
  for (const [index, omhoog] of hier.trappen.entries()) {
    const op = opTrap(omhoog, q);
    if (!op) continue;
    return op.deel === 0 && op.t <= STAPRAND ? { verdieping: hier.id, x: q[0], y: q[1], trap: { van: hier.id, index, deel: 0 } } : null;
  }
  // Een trap af van boven, waar hij aankomt.
  for (const onder of wereld) {
    for (const [index, omlaag] of onder.trappen.entries()) {
      if (omlaag.naar !== hier.id) continue;
      const op = opTrap(omlaag, q);
      if (!op) continue;
      const laatste = omlaag.delen.length - 1;
      return op.deel === laatste && (omlaag.delen[laatste].soort === "bordes" || op.t >= 1 - STAPRAND)
        ? { verdieping: onder.id, x: q[0], y: q[1], trap: { van: onder.id, index, deel: laatste } }
        : null;
    }
  }
  // Gewoon lopen: niet door een muur of een meubel, niet in een gat.
  if (binnenVeelhoeken(q, hier.gaten) || !vrij(hier, q, [stand.x, stand.y])) return null;
  return { ...stand, x: q[0], y: q[1] };
}

/**
 * Een stap: eerst recht, en lukt dat niet, langs de muur (enkel x of enkel
 * y), zoals je langs een muur schuift.
 */
export function wandel(wereld: readonly Wandelverdieping[], stand: Wandelstand, dx: number, dy: number): Wandelstand {
  if (dx === 0 && dy === 0) return stand;
  return (
    probeer(wereld, stand, [stand.x + dx, stand.y + dy]) ??
    probeer(wereld, stand, [stand.x + dx, stand.y]) ??
    probeer(wereld, stand, [stand.x, stand.y + dy]) ??
    stand
  );
}

/** Waar je ogen zijn: op een trap boven de trede, anders boven de vloer. */
export function ooghoogte(wereld: readonly Wandelverdieping[], stand: Wandelstand): number {
  const trap = trapVan(wereld, stand.trap);
  if (trap && stand.trap) {
    const op = opTrap(trap, [stand.x, stand.y]);
    const deel = trap.delen[op?.deel ?? stand.trap.deel];
    return (op?.z ?? deel.z0) + OOGHOOGTE;
  }
  return (wereld.find((v) => v.id === stand.verdieping)?.z0 ?? 0) + OOGHOOGTE;
}
