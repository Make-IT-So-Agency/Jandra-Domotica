import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * De pagina's van een huis staan onder /vastgoed/<nummer>. Een vast pad
 * "/bouw/..." in de code wijst naar de omleiding, en zo altijd naar het eerste
 * huis: elke link moet via huispad() van het huis zelf.
 */

const WEB = path.join(__dirname, "..");
/** Enkel de omleiding zelf kent de oude adressen. */
const UITZONDERINGEN = new Set([path.join("app", "bouw", "[[...pad]]", "route.ts")]);

function bronbestanden(map: string): string[] {
  return readdirSync(path.join(WEB, map), { withFileTypes: true }).flatMap((kind) => {
    const relatief = path.join(map, kind.name);
    if (kind.isDirectory()) return bronbestanden(relatief);
    return /\.(ts|tsx)$/.test(kind.name) ? [relatief] : [];
  });
}

describe("de adressen van Vastgoed", () => {
  it("heeft geen vast pad naar /bouw meer, buiten de omleiding", () => {
    // Een pad tussen aanhalingstekens of in een template: "/bouw", '/bouw/...', `/bouw...`.
    // De API (/api/bouw/...) en de cache van de browser (/bouw-cache) horen er niet bij.
    const oud = /["'`]\/bouw(?=["'`/?#])/;
    const gevonden = ["app", "lib", "components"]
      .flatMap(bronbestanden)
      .filter((bestand) => !UITZONDERINGEN.has(bestand))
      .flatMap((bestand) =>
        readFileSync(path.join(WEB, bestand), "utf8")
          .split("\n")
          .flatMap((regel, index) => (oud.test(regel) ? [`${bestand}:${index + 1}: ${regel.trim()}`] : [])),
      );
    expect(gevonden).toEqual([]);
  });
});
