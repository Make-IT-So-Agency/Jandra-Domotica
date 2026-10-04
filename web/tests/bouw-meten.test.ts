import { describe, expect, it } from "vitest";

import { kleef, maattekst, meter, uniekePunten } from "@/lib/bouw/drie/meten";

describe("het meetlint", () => {
  it("schrijft een maat met een komma", () => {
    expect(meter(3.4249)).toBe("3,42 m");
    expect(meter(0.005)).toBe("0,01 m");
  });

  it("zegt bij een schuine lijn wat waterpas en wat in de hoogte ligt", () => {
    expect(maattekst([0, 0, 0], [3, 0, 4])).toEqual({ lengte: "5,00 m", detail: null });
    expect(maattekst([0, 1, 0], [0, 3.6, 0])).toEqual({ lengte: "2,60 m", detail: null });
    expect(maattekst([0, 0, 0], [3.4, 0.35, 0])).toEqual({ lengte: "3,42 m", detail: "waterpas 3,40 · hoogte 0,35" });
  });

  it("kleeft aan de dichtste hoek op het scherm, binnen 12 pixels", () => {
    const kandidaten = [
      { scherm: [100, 100] as [number, number], diepte: 10 },
      { scherm: [108, 100] as [number, number], diepte: 10 },
      { scherm: [200, 100] as [number, number], diepte: 10 },
    ];
    expect(kleef([106, 101], kandidaten, 10)).toBe(1);
    expect(kleef([150, 100], kandidaten, 10)).toBe(-1);
    expect(kleef([160, 100], kandidaten, 10, 60)).toBe(2);
  });

  it("kleeft niet aan een hoek die achter wat je raakt ligt", () => {
    const kandidaten = [
      { scherm: [100, 100] as [number, number], diepte: 14 },
      { scherm: [104, 100] as [number, number], diepte: 10.1 },
    ];
    expect(kleef([100, 100], kandidaten, 10)).toBe(1);
    expect(kleef([100, 100], kandidaten, null)).toBe(0);
    expect(kleef([100, 100], kandidaten.slice(0, 1), 10)).toBe(-1);
  });

  it("neemt elke hoek één keer", () => {
    const punten = uniekePunten([0, 0, 0, 1, 0, 0, 0.001, 0, 0.001, 1, 2.6, 0, 1, 0, 0]);
    expect(punten).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 2.6, 0],
    ]);
  });
});
