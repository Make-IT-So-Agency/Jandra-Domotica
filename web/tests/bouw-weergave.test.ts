import { describe, expect, it } from "vitest";

import { sleutelVan } from "@/lib/bouw/invoer";
import type { Gebouw, Verdieping } from "@/lib/bouw/types";
import { sorteerPlannen, sorteerVerdiepingen, verdiepingNaam } from "@/lib/bouw/weergave";

const woning: Gebouw = { id: 1, naam: "Woning", volgorde: 0 };
const bijgebouw: Gebouw = { id: 2, naam: "Bijgebouw", volgorde: 1 };

function verdieping(id: number, gebouw_id: number, naam: string, volgorde: number): Verdieping {
  return { id, gebouw_id, naam, volgorde, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null };
}

describe("namen vergelijken", () => {
  it("negeert hoofdletters en witruimte", () => {
    expect(sleutelVan("  Woning ")).toBe(sleutelVan("woning"));
    expect(sleutelVan("Berging  /  technieken")).toBe("berging / technieken");
  });
});

describe("verdiepingen tonen", () => {
  it("noemt het gebouw pas als er meer dan één is", () => {
    const gelijkvloers = verdieping(10, 2, "Gelijkvloers", 0);
    expect(verdiepingNaam(gelijkvloers, [woning])).toBe("Gelijkvloers");
    expect(verdiepingNaam(gelijkvloers, [woning, bijgebouw])).toBe("Bijgebouw · Gelijkvloers");
  });

  it("zet ze per gebouw en dan op volgorde", () => {
    const lijst = [
      verdieping(1, 2, "Gelijkvloers", 0),
      verdieping(2, 1, "Verdieping", 1),
      verdieping(3, 1, "Gelijkvloers", 0),
    ];
    expect(sorteerVerdiepingen(lijst, [woning, bijgebouw]).map((v) => v.id)).toEqual([3, 2, 1]);
  });
});

describe("plannen tonen", () => {
  it("volgt de bladcode van de architect, met het hele project achteraan", () => {
    const plannen = [
      { id: 1, gebouw_id: null, bladcode: "BA_woning_I_N_1", titel: "Inplantingsplan" },
      { id: 2, gebouw_id: 1, bladcode: "BA_woning_P_N_10", titel: "Detail" },
      { id: 3, gebouw_id: 1, bladcode: "BA_woning_P_N_2", titel: "Verdieping" },
      { id: 4, gebouw_id: 2, bladcode: "BA_bijgebouw_P_N_1", titel: "Grondplan" },
      { id: 5, gebouw_id: 1, bladcode: null, titel: "Eigen schets" },
      { id: 6, gebouw_id: 1, bladcode: "BA_woning_G_N_1", titel: "Voorgevel" },
    ];
    expect(sorteerPlannen(plannen, [woning, bijgebouw]).map((p) => p.id)).toEqual([6, 3, 2, 5, 4, 1]);
  });
});
