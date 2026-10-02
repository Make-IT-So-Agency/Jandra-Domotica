import { describe, expect, it } from "vitest";

import { datum, getal, id, tekst } from "@/lib/bouw/invoer";
import { takenVoorBouw } from "@/lib/bouw/taken";

describe("invoer", () => {
  it("maakt van lege tekst null", () => {
    expect(tekst("  ")).toBeNull();
    expect(tekst(null)).toBeNull();
    expect(tekst("  Architect  ")).toBe("Architect");
  });

  it("leest getallen met komma of punt", () => {
    expect(getal("2,7", "Hoogte")).toEqual({ ok: true, waarde: 2.7 });
    expect(getal(" 3.05 ", "Hoogte")).toEqual({ ok: true, waarde: 3.05 });
    expect(getal("-0,45", "Peil")).toEqual({ ok: true, waarde: -0.45 });
    expect(getal("", "Hoogte")).toEqual({ ok: true, waarde: null });
  });

  it("weigert wat geen getal is, met de naam van het veld", () => {
    const uitkomst = getal("2,7 m", "Hoogte");
    expect(uitkomst.ok).toBe(false);
    if (!uitkomst.ok) expect(uitkomst.melding).toContain("Hoogte");
    expect(getal("1.234,5", "Peil").ok).toBe(false);
  });

  it("leest enkel positieve gehele id's", () => {
    expect(id("12")).toBe(12);
    expect(id("0")).toBeNull();
    expect(id("-3")).toBeNull();
    expect(id("1e3")).toBeNull();
    expect(id("12abc")).toBeNull();
    expect(id(null)).toBeNull();
  });

  it("leest enkel bestaande datums", () => {
    expect(datum("2026-10-02")).toBe("2026-10-02");
    expect(datum("2026-02-30")).toBeNull();
    expect(datum("02/10/2026")).toBeNull();
    expect(datum("")).toBeNull();
  });
});

describe("takenVoorBouw", () => {
  it("noemt alles wat ontbreekt bij een leeg project", () => {
    const taken = takenVoorBouw({ projectnaam: null, verdiepingen: 0, plannen: [], partijen: [] });
    expect(taken.map((t) => t.link)).toEqual(["/bouw#project", "/bouw/verdiepingen", "/bouw/plannen", "/bouw/partijen"]);
  });

  it("wijst een plan zonder versie aan", () => {
    const taken = takenVoorBouw({
      projectnaam: "Ons huis",
      verdiepingen: 2,
      plannen: [
        { id: 3, titel: "Grondplan gelijkvloers", versies: 0 },
        { id: 4, titel: "Grondplan verdieping", versies: 2 },
      ],
      partijen: [{ soort: "architect" }],
    });
    expect(taken).toEqual([
      { tekst: '"Grondplan gelijkvloers" heeft nog geen versie.', link: "/bouw/plannen/3", knop: "Versie opladen" },
    ]);
  });

  it("is leeg als alles klaarstaat", () => {
    expect(
      takenVoorBouw({
        projectnaam: "Ons huis",
        verdiepingen: 1,
        plannen: [{ id: 1, titel: "Grondplan", versies: 1 }],
        partijen: [{ soort: "aannemer" }, { soort: "architect" }],
      }),
    ).toEqual([]);
  });
});
