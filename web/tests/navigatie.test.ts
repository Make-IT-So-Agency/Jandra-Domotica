import { describe, expect, it } from "vitest";

import { BOUWPAGINAS, actievePagina, zichtbarePaginas } from "@/lib/navigatie";
import type { Gebruiker } from "@/lib/rollen";

const HOOFD: Gebruiker = {
  id: "h",
  email: "jan@voorbeeld.be",
  naam: null,
  rol: "hoofdbeheerder",
  vennootschap_id: null,
  vasteBeheerder: false,
};

const KIJKER: Gebruiker = { ...HOOFD, id: "k", rol: "kijker", vennootschap_id: "v1" };

describe("zichtbarePaginas", () => {
  it("toont Bouw aan de hoofdbeheerder", () => {
    expect(zichtbarePaginas(HOOFD).map((p) => p.pad)).toContain("/bouw");
  });

  it("toont Bouw niet aan een kijker van een vennootschap", () => {
    expect(zichtbarePaginas(KIJKER).map((p) => p.pad)).not.toContain("/bouw");
  });
});

describe("actievePagina", () => {
  const hoofdmenu = zichtbarePaginas(HOOFD).map((p) => p.pad);
  const submenu = BOUWPAGINAS.map((p) => p.pad);

  it("licht Overzicht enkel op de startpagina op", () => {
    expect(actievePagina("/", hoofdmenu)).toBe("/");
    expect(actievePagina("/rapporten", hoofdmenu)).toBe("/rapporten");
  });

  it("licht Bouw op voor elke pagina van de module", () => {
    expect(actievePagina("/bouw", hoofdmenu)).toBe("/bouw");
    expect(actievePagina("/bouw/plannen/12", hoofdmenu)).toBe("/bouw");
  });

  it("kiest in het submenu de langste link die past", () => {
    expect(actievePagina("/bouw", submenu)).toBe("/bouw");
    expect(actievePagina("/bouw/plannen", submenu)).toBe("/bouw/plannen");
    expect(actievePagina("/bouw/plannen/12", submenu)).toBe("/bouw/plannen");
  });

  it("past enkel op de grens van een padstuk", () => {
    expect(actievePagina("/bouwwerf", ["/bouw"])).toBeNull();
    expect(actievePagina("/onbekend", hoofdmenu)).toBeNull();
  });
});
