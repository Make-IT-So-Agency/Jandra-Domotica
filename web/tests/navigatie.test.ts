import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deelVan, huisUitPad, huispad } from "@/lib/bouw/paden";
import {
  HUISPAGINAS,
  VASTGOEDPAGINAS,
  actievePagina,
  allePaden,
  huisVan,
  huismenu,
  menuVoor,
  paginasVan,
  wisselPad,
} from "@/lib/navigatie";
import type { Gebruiker } from "@/lib/rollen";

const HOOFD: Gebruiker = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder", vennootschap_id: null, vasteBeheerder: false };
const BEHEERDER: Gebruiker = { ...HOOFD, id: "b", rol: "vennootschapsbeheerder", vennootschap_id: "v1" };
const KIJKER: Gebruiker = { ...HOOFD, id: "k", rol: "kijker", vennootschap_id: "v1" };

const HUIZEN = [
  { id: 1, naam: "Nieuwbouw" },
  { id: 12, naam: "Testhuis" },
];

/** Het menu als tekst: groepen met hun pagina's, om in één oogopslag te vergelijken. */
const alsTekst = (gebruiker: Gebruiker, huizen = HUIZEN) =>
  menuVoor(gebruiker, huizen).map((onderdeel) =>
    onderdeel.soort === "pagina" ? onderdeel.pagina.naam : `${onderdeel.naam}: ${paginasVan(onderdeel).map((p) => p.naam).join(", ")}`,
  );

describe("de adressen van Vastgoed", () => {
  it("zet een huis onder zijn nummer", () => {
    expect(huispad(1)).toBe("/vastgoed/1");
    expect(huispad(12, "/geld/facturen")).toBe("/vastgoed/12/geld/facturen");
    expect(huispad(1, "#project")).toBe("/vastgoed/1#project");
  });

  it("leest het huis uit een pad, op de grens van een padstuk", () => {
    expect(huisUitPad("/vastgoed/1")).toBe(1);
    expect(huisUitPad("/vastgoed/12/geld")).toBe(12);
    expect(huisUitPad("/vastgoed/1?soort=goed")).toBe(1);
    expect(huisUitPad("/vastgoed/telegram")).toBeNull();
    expect(huisUitPad("/vastgoed")).toBeNull();
    expect(huisUitPad("/bouw/geld")).toBeNull();
  });

  it("geeft het deel na het huis, zonder vraag of anker", () => {
    expect(deelVan("/vastgoed/1")).toBe("");
    expect(deelVan("/vastgoed/1/geld/facturen?factuur=3#factuur")).toBe("/geld/facturen");
    expect(deelVan("/vastgoed/12/plannen/")).toBe("/plannen");
  });
});

describe("het menu per rol", () => {
  it("toont de hoofdbeheerder alles: Laadpalen, Vastgoed met elk huis, en Gebruikers", () => {
    const paginas = HUISPAGINAS.map((p) => p.naam).join(", ");
    expect(alsTekst(HOOFD)).toEqual([
      "Laadpalen: Overzicht, Rapporten, Laadpunten, Vennootschappen, Tarieven, Instellingen",
      `Vastgoed: ${paginas}, ${paginas}, Huizen, Telegram`,
      "Gebruikers",
    ]);
  });

  it("toont Huizen en Telegram ook zonder huizen", () => {
    expect(alsTekst(HOOFD, [])[1]).toBe("Vastgoed: Huizen, Telegram");
  });

  it("toont een beheerder van een vennootschap enkel het laden en de gebruikers", () => {
    expect(alsTekst(BEHEERDER)).toEqual(["Laadpalen: Overzicht, Rapporten", "Gebruikers"]);
  });

  it("toont een kijker enkel het overzicht en de rapporten, en geen vastgoed", () => {
    expect(alsTekst(KIJKER)).toEqual(["Laadpalen: Overzicht, Rapporten"]);
    expect(allePaden(menuVoor(KIJKER, HUIZEN)).some((pad) => pad.startsWith("/vastgoed"))).toBe(false);
  });

  it("zet de huizen onder Vastgoed, elk met zijn eigen adressen", () => {
    const vastgoed = menuVoor(HOOFD, HUIZEN).find((onderdeel) => onderdeel.soort === "vastgoed");
    if (!vastgoed || vastgoed.soort !== "vastgoed") throw new Error("geen Vastgoed");
    expect(vastgoed.huizen.map((huis) => huis.naam)).toEqual(["Nieuwbouw", "Testhuis"]);
    expect(vastgoed.huizen[1].paginas.slice(0, 2)).toEqual([
      { pad: "/vastgoed/12", naam: "Overzicht" },
      { pad: "/vastgoed/12/plannen", naam: "Plannen" },
    ]);
    expect(vastgoed.los).toEqual(VASTGOEDPAGINAS);
  });
});

describe("welke link oplicht", () => {
  const paden = allePaden(menuVoor(HOOFD, HUIZEN));

  it("licht Overzicht enkel op de startpagina op", () => {
    expect(actievePagina("/", paden)).toBe("/");
    expect(actievePagina("/rapporten", paden)).toBe("/rapporten");
    expect(actievePagina("/laadpalen", paden)).toBe("/laadpalen");
  });

  it("kiest de langste link die past, ook diep in een huis", () => {
    expect(actievePagina("/vastgoed/1", paden)).toBe("/vastgoed/1");
    expect(actievePagina("/vastgoed/1/plannen", paden)).toBe("/vastgoed/1/plannen");
    expect(actievePagina("/vastgoed/1/plannen/12/omzetten", paden)).toBe("/vastgoed/1/plannen");
    expect(actievePagina("/vastgoed/12/geld/facturen", paden)).toBe("/vastgoed/12/geld");
    expect(actievePagina("/vastgoed", paden)).toBe("/vastgoed");
    expect(actievePagina("/vastgoed/telegram", paden)).toBe("/vastgoed/telegram");
  });

  it("haalt huis 1 en huis 12 niet door elkaar", () => {
    expect(actievePagina("/vastgoed/12", paden)).toBe("/vastgoed/12");
    expect(actievePagina("/vastgoed/12/keuzes", paden)).toBe("/vastgoed/12/keuzes");
    expect(actievePagina("/vastgoed/1/keuzes", paden)).toBe("/vastgoed/1/keuzes");
  });

  it("past enkel op de grens van een padstuk", () => {
    expect(actievePagina("/vastgoedwerf", ["/vastgoed"])).toBeNull();
    expect(actievePagina("/onbekend", paden)).toBeNull();
  });
});

describe("het keuzemenu van het huis", () => {
  const menu = HUIZEN.map(huismenu);

  it("kiest het huis van de pagina, anders het eerste", () => {
    expect(huisVan("/vastgoed/12/geld", menu)?.id).toBe(12);
    expect(huisVan("/vastgoed/1", menu)?.id).toBe(1);
    expect(huisVan("/vastgoed/telegram", menu)?.id).toBe(1);
    expect(huisVan("/", menu)?.id).toBe(1);
    expect(huisVan("/vastgoed/1", [])).toBeNull();
  });

  it("blijft in hetzelfde onderdeel bij een ander huis, maar nooit dieper", () => {
    const [nieuwbouw, testhuis] = menu;
    expect(wisselPad("/vastgoed/1/geld/facturen", nieuwbouw, testhuis)).toBe("/vastgoed/12/geld");
    expect(wisselPad("/vastgoed/1/plannen/12/omzetten", nieuwbouw, testhuis)).toBe("/vastgoed/12/plannen");
    expect(wisselPad("/vastgoed/12/keuzes/9", testhuis, nieuwbouw)).toBe("/vastgoed/1/keuzes");
    expect(wisselPad("/vastgoed/12", testhuis, nieuwbouw)).toBe("/vastgoed/1");
  });

  it("gaat naar het overzicht van het huis als het onderdeel er niet is, of buiten een huis", () => {
    const [nieuwbouw, testhuis] = menu;
    const zonderGeld = { ...testhuis, paginas: testhuis.paginas.filter((pagina) => pagina.naam !== "Geld") };
    expect(wisselPad("/vastgoed/1/geld", nieuwbouw, zonderGeld)).toBe("/vastgoed/12");
    expect(wisselPad("/vastgoed/telegram", nieuwbouw, testhuis)).toBe("/vastgoed/12");
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
      if (["api", "login", "extern", "bouw"].includes(kind.name)) continue;
      gevonden.push(...paginamappen(path.join(map, kind.name), `${pad}/${kind.name}`, diepte - 1));
    }
    return gevonden;
  }

  it("zet elke pagina van het eerste niveau, van Vastgoed en van een huis in het menu van de hoofdbeheerder", () => {
    const paden = allePaden(menuVoor(HOOFD, [{ id: 1, naam: "Nieuwbouw" }]));
    const eersteNiveau = paginamappen(app, "", 1);
    const vastgoed = paginamappen(path.join(app, "vastgoed"), "/vastgoed", 1);
    const huis = paginamappen(path.join(app, "vastgoed", "[huis]"), "/vastgoed/1", 1);
    expect(eersteNiveau.filter((pad) => !paden.includes(pad))).toEqual([]);
    expect(vastgoed.filter((pad) => !paden.includes(pad))).toEqual([]);
    expect(huis.filter((pad) => !paden.includes(pad))).toEqual([]);
  });

  it("verwijst enkel naar pagina's die bestaan", () => {
    const naarMap = (pad: string) => pad.replace(/^\/vastgoed\/\d+/, "/vastgoed/[huis]");
    expect(allePaden(menuVoor(HOOFD, HUIZEN)).filter((pad) => !heeftPagina(naarMap(pad)))).toEqual([]);
  });
});
