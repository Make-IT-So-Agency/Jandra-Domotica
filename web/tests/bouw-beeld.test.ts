import { describe, expect, it } from "vitest";

import {
  basisSchaal,
  knijp,
  paginaNaarScherm,
  passendBeeld,
  schermNaarPagina,
  verschuif,
  zichtbaarStuk,
  zoomRond,
  type Beeld,
} from "@/lib/bouw/beeld";

const GRENZEN = { min: 0.1, max: 20 };

function dichtbij(a: number, b: number) {
  expect(a).toBeCloseTo(b, 9);
}

describe("omrekenen", () => {
  it("scherm en pagina zijn elkaars omgekeerde", () => {
    const beeld: Beeld = { x: 30, y: -12, zoom: 2.5 };
    const p = { x: 123.4, y: 56.7 };
    const terug = schermNaarPagina(beeld, paginaNaarScherm(beeld, p));
    dichtbij(terug.x, p.x);
    dichtbij(terug.y, p.y);
  });
});

describe("zoomRond", () => {
  it("houdt het punt onder de muis op zijn plaats", () => {
    const beeld: Beeld = { x: 10, y: 20, zoom: 1 };
    const anker = { x: 200, y: 150 };
    const onder = schermNaarPagina(beeld, anker);
    const nieuw = zoomRond(beeld, anker, 2, GRENZEN);
    expect(nieuw.zoom).toBe(2);
    const opnieuw = paginaNaarScherm(nieuw, onder);
    dichtbij(opnieuw.x, anker.x);
    dichtbij(opnieuw.y, anker.y);
  });

  it("blijft binnen de grenzen", () => {
    expect(zoomRond({ x: 0, y: 0, zoom: 15 }, { x: 0, y: 0 }, 4, GRENZEN).zoom).toBe(20);
    expect(zoomRond({ x: 0, y: 0, zoom: 0.2 }, { x: 0, y: 0 }, 0.1, GRENZEN).zoom).toBe(0.1);
  });
});

describe("knijp", () => {
  it("zoomt met de afstand tussen de vingers en volgt het midden", () => {
    const begin = { beeld: { x: 0, y: 0, zoom: 1 }, a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
    // Vingers twee keer zo ver uit elkaar, en samen 50 px naar rechts.
    const nieuw = knijp(begin, { x: 100, y: 100 }, { x: 300, y: 100 }, GRENZEN);
    expect(nieuw.zoom).toBe(2);
    // Wat onder het begin-midden (150, 100) lag, ligt nu onder (200, 100).
    const p = paginaNaarScherm(nieuw, { x: 150, y: 100 });
    dichtbij(p.x, 200);
    dichtbij(p.y, 100);
  });

  it("negeert vingers die op elkaar liggen", () => {
    const begin = { beeld: { x: 5, y: 5, zoom: 1 }, a: { x: 1, y: 1 }, b: { x: 1, y: 1 } };
    expect(knijp(begin, { x: 0, y: 0 }, { x: 50, y: 50 }, GRENZEN)).toEqual(begin.beeld);
  });
});

describe("passendBeeld", () => {
  it("past een A1 liggend in een breed vak, gecentreerd", () => {
    const vak = { breedte: 1000, hoogte: 600 };
    const pagina = { breedte: 2384, hoogte: 1684 };
    const beeld = passendBeeld(vak, pagina, 0);
    dichtbij(beeld.zoom, 600 / 1684);
    dichtbij(beeld.y, 0);
    dichtbij(beeld.x * 2 + pagina.breedte * beeld.zoom, 1000);
  });
});

describe("basisSchaal", () => {
  it("blijft onder het maximum aantal pixels", () => {
    const pagina = { breedte: 2384, hoogte: 1684 }; // A1 in punten
    const schaal = basisSchaal(pagina, 4);
    expect(pagina.breedte * pagina.hoogte * schaal * schaal).toBeLessThanOrEqual(8_000_000 + 1);
    expect(basisSchaal({ breedte: 100, hoogte: 100 }, 2)).toBe(2);
  });
});

describe("zichtbaarStuk", () => {
  it("geeft het deel van de pagina dat in beeld is", () => {
    const stuk = zichtbaarStuk({ x: -100, y: -50, zoom: 2 }, { breedte: 400, hoogte: 300 }, { breedte: 1000, hoogte: 800 });
    expect(stuk).toEqual({ x: 50, y: 25, breedte: 200, hoogte: 150 });
  });

  it("geeft null als de pagina buiten beeld ligt", () => {
    expect(zichtbaarStuk(verschuif({ x: 0, y: 0, zoom: 1 }, 5000, 0), { breedte: 400, hoogte: 300 }, { breedte: 100, hoogte: 100 })).toBeNull();
  });
});
