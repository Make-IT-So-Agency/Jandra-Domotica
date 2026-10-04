import { describe, expect, it } from "vitest";

import { isAan, lagenVan, leesLagen, metWijziging } from "@/lib/bouw/drie/lagen";

describe("de lagen van het 3D-model", () => {
  const invoer = {
    verdiepingen: [
      { id: 7, naam: "Gelijkvloers" },
      { id: 8, naam: "Verdieping" },
    ],
    daken: true,
    inplantingsplan: false,
    omgeving: true,
    punten: [{ categorie: "verlichting", naam: "Verlichting", kleur: "#f59e0b" }],
    inrichting: [{ laag: "meubels", naam: "Meubels" }],
    leidingen: [{ soort: "afvoer", naam: "Afvoer", kleur: "#6b7280" }],
  };

  it("groepeert per gebouw, terrein, punten, inrichting, leidingen en hulp", () => {
    const groepen = lagenVan(invoer);
    expect(groepen.map((g) => g.naam)).toEqual(["Gebouw", "Terrein", "Punten", "Inrichting", "Leidingen", "Hulp"]);
    expect(groepen[0].lagen.map((l) => l.sleutel)).toEqual(["verdieping:7", "verdieping:8", "daken"]);
    expect(groepen[1].lagen.map((l) => l.sleutel)).toEqual(["terrein:luchtfoto", "terrein:grenzen", "terrein:buren", "terrein:opPerceel"]);
    expect(groepen[2].lagen[0]).toEqual({ sleutel: "punten:verlichting", naam: "Verlichting", kleur: "#f59e0b" });
    expect(groepen[3].lagen).toEqual([{ sleutel: "inrichting:meubels", naam: "Meubels" }]);
    expect(groepen[4].lagen).toEqual([{ sleutel: "leidingen:afvoer", naam: "Afvoer", kleur: "#6b7280" }]);
    // Met leidingen kan je ze ook door de muren zien.
    expect(groepen[5].lagen.map((l) => l.sleutel)).toEqual(["hulp:maten", "hulp:noorden", "hulp:doorzicht"]);
  });

  it("laat een lege groep weg", () => {
    const groepen = lagenVan({ ...invoer, omgeving: false, punten: [], inrichting: [], leidingen: [] });
    expect(groepen.map((g) => g.naam)).toEqual(["Gebouw", "Hulp"]);
    expect(lagenVan({ ...invoer, omgeving: false, inplantingsplan: true })[1].lagen.map((l) => l.sleutel)).toEqual(["terrein:plan"]);
  });

  it("zet alles standaard aan, behalve wat nu op ons perceel staat", () => {
    expect(isAan({}, "verdieping:7")).toBe(true);
    expect(isAan({}, "terrein:opPerceel")).toBe(false);
    expect(isAan({ "verdieping:7": false }, "verdieping:7")).toBe(false);
    expect(isAan({ "terrein:opPerceel": true }, "terrein:opPerceel")).toBe(true);
  });

  it("onthoudt enkel wat afwijkt van de standaard", () => {
    const stand = metWijziging({}, { "verdieping:7": false, "terrein:opPerceel": false, "punten:data": true });
    expect(stand).toEqual({ "verdieping:7": false });
    expect(metWijziging(stand, { "verdieping:7": true })).toEqual({});
    expect(metWijziging({}, { "Rare sleutel!": false })).toEqual({});
  });

  it("leest wat de browser bewaarde, en vergeet wat niet klopt", () => {
    expect(leesLagen(null)).toEqual({});
    expect(leesLagen("geen json")).toEqual({});
    expect(leesLagen("[1,2]")).toEqual({});
    expect(leesLagen('{"verdieping:7":false,"daken":"ja","<script>":true,"hulp:maten":false}')).toEqual({
      "verdieping:7": false,
      "hulp:maten": false,
    });
  });
});
