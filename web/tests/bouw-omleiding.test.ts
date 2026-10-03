import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Gebruiker } from "@/lib/rollen";

const nep = vi.hoisted(() => ({
  gebruiker: null as Gebruiker | null,
  oudste: 1 as number | null,
}));
vi.mock("@/lib/toegang", () => ({ huidigeGebruiker: async () => nep.gebruiker }));
vi.mock("@/lib/bouw/huizen", () => ({ oudsteHuisId: async () => nep.oudste }));

import { GET } from "@/app/bouw/[[...pad]]/route";

const HOOFD: Gebruiker = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder", vennootschap_id: null, vasteBeheerder: false };

async function naar(pad: string): Promise<string> {
  const antwoord = await GET(new Request(`https://jandra.voorbeeld.be${pad}`));
  expect(antwoord.status).toBe(307);
  const doel = new URL(antwoord.headers.get("location") ?? "");
  expect(doel.origin).toBe("https://jandra.voorbeeld.be");
  return `${doel.pathname}${doel.search}`;
}

beforeEach(() => {
  nep.gebruiker = HOOFD;
  nep.oudste = 1;
});

describe("de oude adressen van Bouw", () => {
  it("stuurt een pagina door naar dezelfde pagina van het eerste huis, met de vraag erbij", async () => {
    expect(await naar("/bouw")).toBe("/vastgoed/1");
    expect(await naar("/bouw/keuzes/7")).toBe("/vastgoed/1/keuzes/7");
    expect(await naar("/bouw/geld/facturen?factuur=3")).toBe("/vastgoed/1/geld/facturen?factuur=3");
    nep.oudste = 4;
    expect(await naar("/bouw/plannen/12/omzetten")).toBe("/vastgoed/4/plannen/12/omzetten");
  });

  it("stuurt de bot naar Vastgoed, los van de huizen", async () => {
    expect(await naar("/bouw/telegram")).toBe("/vastgoed/telegram");
    expect(await naar("/bouw/telegram?soort=goed")).toBe("/vastgoed/telegram?soort=goed");
  });

  it("blijft op dezelfde site, ook met een vreemd pad", async () => {
    expect(await naar("/bouw//voorbeeld.org")).toBe("/vastgoed/1//voorbeeld.org");
  });

  it("stuurt wie Vastgoed niet mag zien naar de start", async () => {
    nep.gebruiker = { ...HOOFD, rol: "kijker", vennootschap_id: "v1" };
    expect(await naar("/bouw/geld")).toBe("/");
    nep.gebruiker = null;
    expect(await naar("/bouw")).toBe("/");
  });

  it("toont de lijst van de huizen als er nog geen huis is", async () => {
    nep.oudste = null;
    expect(await naar("/bouw/geld")).toBe("/vastgoed");
  });
});
