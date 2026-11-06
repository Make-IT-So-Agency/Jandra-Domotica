import { describe, expect, it } from "vitest";

import type { Claim, Invoer, Kaart, Persoon } from "@/lib/huishouden/balans";
import { begrens, biedenAf, biedingenVoorVoorstel, botsendeKaarten, verdeeld } from "@/lib/huishouden/bieden";
import { toewijzing } from "@/lib/huishouden/voorstel";

const kaart = (id: number, verdeling: Kaart["verdeling"] = "spel", geschrapt = false) => ({ id, verdeling, geschrapt });

const claims = (rijen: [number, Claim | null, Claim | null][]): Record<Persoon, Map<number, Pick<Invoer, "claim">>> => ({
  jan: new Map(rijen.map(([id, jan]) => [id, { claim: jan }])),
  sandra: new Map(rijen.map(([id, , sandra]) => [id, { claim: sandra }])),
});

describe("welke kaarten botsen", () => {
  it("enkel actieve kaarten via het spel waar jullie allebei 'Wil ik' zeiden", () => {
    const kaarten = [kaart(1), kaart(2), kaart(3, "jan"), kaart(4, "spel", true), kaart(5)];
    const invoer = claims([
      [1, "wil", "wil"],
      [2, "wil", "mag"],
      [3, "wil", "wil"],
      [4, "wil", "wil"],
      [5, "wil", null],
    ]);
    expect(botsendeKaarten(kaarten, invoer).map((k) => k.id)).toEqual([1]);
  });
});

describe("het budget (R18, R21)", () => {
  it("stopt een bod aan wat er nog over is", () => {
    // Jan heeft 70 geboden en schuift een andere kaart naar 50: die stopt op 30.
    expect(begrens(50, 70)).toBe(30);
    expect(begrens(50, 0)).toBe(50);
    expect(begrens(100, 100)).toBe(0);
  });

  it("rondt af op stappen van 5 en blijft tussen 0 en 100", () => {
    expect(begrens(42, 0)).toBe(40);
    expect(begrens(43, 0)).toBe(45);
    expect(begrens(-10, 0)).toBe(0);
    expect(begrens(250, 0)).toBe(100);
    expect(begrens(Number.NaN, 0)).toBe(0);
    expect(begrens(50, 73)).toBe(25);
  });

  it("telt enkel biedingen op kaarten die nu botsen", () => {
    const biedingen = new Map([
      [1, 40],
      [2, 30],
      [3, 20],
    ]);
    const botsend = new Set([1, 3]);
    expect(verdeeld(biedingen, botsend)).toBe(60);
    // Zonder de kaart die je net aanpast.
    expect(verdeeld(biedingen, botsend, 1)).toBe(20);
  });
});

describe("biedingen in het voorstel (R19 tot R21)", () => {
  it("geeft elke botsende kaart een bod van allebei, 0 als iemand niets bood", () => {
    const biedingen = {
      jan: new Map([
        [1, 40],
        [2, 60],
      ]),
      sandra: new Map([[1, 60]]),
    };
    expect([...biedingenVoorVoorstel(biedingen, new Set([1, 3]))]).toEqual([
      [1, { jan: 40, sandra: 60 }],
      [3, { jan: 0, sandra: 0 }],
    ]);
  });

  it("geeft de kaart aan het hoogste bod, nipt bij 10 of minder verschil", () => {
    expect(toewijzing("wil", "wil", { jan: 45, sandra: 55 })).toMatchObject({ naar: "sandra", nipt: true });
    expect(toewijzing("wil", "wil", { jan: 40, sandra: 55 })).toMatchObject({ naar: "sandra", nipt: false });
    expect(toewijzing("wil", "wil", { jan: 50, sandra: 50 }).naar).toBe("evenwicht");
    expect(toewijzing("wil", "wil", { jan: 0, sandra: 0 }).naar).toBe("evenwicht");
  });
});

describe("wanneer stap 3 af is (R22)", () => {
  it("meteen zonder botsende kaarten, anders als allebei klaar zijn", () => {
    expect(biedenAf(0, { jan: false, sandra: false })).toBe(true);
    expect(biedenAf(2, { jan: true, sandra: false })).toBe(false);
    expect(biedenAf(2, { jan: true, sandra: true })).toBe(true);
  });
});
