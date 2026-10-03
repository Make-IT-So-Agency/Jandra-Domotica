import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BOUWPAGINAS, HUIZEN, actievePagina, allePaden, huisVan, menuVoor, paginasVan } from "@/lib/navigatie";
import type { Gebruiker } from "@/lib/rollen";

const HOOFD: Gebruiker = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder", vennootschap_id: null, vasteBeheerder: false };
const BEHEERDER: Gebruiker = { ...HOOFD, id: "b", rol: "vennootschapsbeheerder", vennootschap_id: "v1" };
const KIJKER: Gebruiker = { ...HOOFD, id: "k", rol: "kijker", vennootschap_id: "v1" };

/** Het menu als tekst: groepen met hun pagina's, om in één oogopslag te vergelijken. */
const alsTekst = (gebruiker: Gebruiker) =>
  menuVoor(gebruiker).map((onderdeel) =>
    onderdeel.soort === "pagina" ? onderdeel.pagina.naam : `${onderdeel.naam}: ${paginasVan(onderdeel).map((p) => p.naam).join(", ")}`,
  );

describe("het menu per rol", () => {
  it("toont de hoofdbeheerder alles: Laadpalen, Vastgoed en Gebruikers", () => {
    expect(alsTekst(HOOFD)).toEqual([
      "Laadpalen: Overzicht, Rapporten, Laadpunten, Vennootschappen, Tarieven, Instellingen",
      `Vastgoed: ${BOUWPAGINAS.map((p) => p.naam).join(", ")}`,
      "Gebruikers",
    ]);
  });

  it("toont een beheerder van een vennootschap enkel het laden en de gebruikers", () => {
    expect(alsTekst(BEHEERDER)).toEqual(["Laadpalen: Overzicht, Rapporten", "Gebruikers"]);
  });

  it("toont een kijker enkel het overzicht en de rapporten, en geen vastgoed", () => {
    expect(alsTekst(KIJKER)).toEqual(["Laadpalen: Overzicht, Rapporten"]);
    expect(allePaden(menuVoor(KIJKER))).not.toContain("/bouw");
  });

  it("zet de nieuwbouw als huis onder Vastgoed", () => {
    const vastgoed = menuVoor(HOOFD).find((onderdeel) => onderdeel.soort === "vastgoed");
    expect(vastgoed && vastgoed.soort === "vastgoed" ? vastgoed.huizen.map((huis) => huis.naam) : []).toEqual(["Nieuwbouw"]);
  });
});

describe("welke link oplicht", () => {
  const paden = allePaden(menuVoor(HOOFD));

  it("licht Overzicht enkel op de startpagina op", () => {
    expect(actievePagina("/", paden)).toBe("/");
    expect(actievePagina("/rapporten", paden)).toBe("/rapporten");
    expect(actievePagina("/laadpalen", paden)).toBe("/laadpalen");
  });

  it("kiest de langste link die past, ook diep in Vastgoed", () => {
    expect(actievePagina("/bouw", paden)).toBe("/bouw");
    expect(actievePagina("/bouw/plannen", paden)).toBe("/bouw/plannen");
    expect(actievePagina("/bouw/plannen/12/omzetten", paden)).toBe("/bouw/plannen");
    expect(actievePagina("/bouw/geld/facturen", paden)).toBe("/bouw/geld");
  });

  it("past enkel op de grens van een padstuk", () => {
    expect(actievePagina("/bouwwerf", ["/bouw"])).toBeNull();
    expect(actievePagina("/onbekend", paden)).toBeNull();
  });
});

describe("het keuzemenu van het huis", () => {
  it("kiest het huis van de pagina, anders het eerste", () => {
    expect(huisVan("/bouw/geld", HUIZEN).sleutel).toBe("nieuwbouw");
    expect(huisVan("/", HUIZEN)).toBe(HUIZEN[0]);
  });
});

describe("geen pagina raakt zoek", () => {
  const app = path.join(__dirname, "..", "app");
  const heeftPagina = (pad: string) => existsSync(path.join(app, ...pad.split("/").filter(Boolean), "page.tsx"));

  /** Elke map met een page.tsx, behalve wat niet in het menu hoort; dynamische mappen ([id]) en de tabs binnen een pagina niet meegerekend. */
  function paginamappen(map: string, pad: string, diepte: number): string[] {
    const gevonden = existsSync(path.join(map, "page.tsx")) ? [pad || "/"] : [];
    if (diepte === 0) return gevonden;
    for (const kind of readdirSync(map, { withFileTypes: true })) {
      if (!kind.isDirectory() || kind.name.startsWith("[") || kind.name.startsWith("(")) continue;
      if (["api", "login", "extern"].includes(kind.name)) continue;
      gevonden.push(...paginamappen(path.join(map, kind.name), `${pad}/${kind.name}`, diepte - 1));
    }
    return gevonden;
  }

  it("zet elke pagina van het eerste niveau, en elke pagina van Bouw, in het menu van de hoofdbeheerder", () => {
    const paden = allePaden(menuVoor(HOOFD));
    const eersteNiveau = paginamappen(app, "", 1).filter((pad) => pad !== "/bouw");
    const bouw = paginamappen(path.join(app, "bouw"), "/bouw", 1);
    expect(eersteNiveau.filter((pad) => !paden.includes(pad))).toEqual([]);
    expect(bouw.filter((pad) => !paden.includes(pad))).toEqual([]);
  });

  it("verwijst enkel naar pagina's die bestaan", () => {
    expect(allePaden(menuVoor(HOOFD)).filter((pad) => !heeftPagina(pad))).toEqual([]);
  });
});
