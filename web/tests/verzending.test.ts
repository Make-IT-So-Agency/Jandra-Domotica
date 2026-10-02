import { describe, expect, it } from "vitest";

import { verzendKnop } from "@/lib/verzending";

const BASIS = { mailStaatAan: true, adres: "boekhouder@kantoor.be", verstuurdOp: null };

describe("verzendKnop", () => {
  it("staat aan voor een rapport dat nog niet vertrokken is", () => {
    const knop = verzendKnop(BASIS);

    expect(knop.label).toBe("Versturen");
    expect(knop.uit).toBe(false);
    expect(knop.reden).toContain("boekhouder@kantoor.be");
  });

  it("houdt hetzelfde label als het al eens vertrokken is", () => {
    // Het label blijft kort; dat het om een herhaling gaat, blijkt uit de
    // statusregel in diezelfde rij en uit de bevestiging.
    const knop = verzendKnop({ ...BASIS, verstuurdOp: "2026-10-01T07:00:00Z" });

    expect(knop.label).toBe("Versturen");
    expect(knop.uit).toBe(false);
    expect(knop.reden).toContain("nog eens");
  });

  it("staat uit zonder mailsleutel op de server", () => {
    const knop = verzendKnop({ ...BASIS, mailStaatAan: false });

    expect(knop.uit).toBe(true);
    expect(knop.reden).toMatch(/sleutel/i);
  });

  it("staat uit zonder e-mailadres bij de vennootschap", () => {
    for (const adres of [null, "", "   "]) {
      const knop = verzendKnop({ ...BASIS, adres });
      expect(knop.uit).toBe(true);
      expect(knop.reden).toMatch(/e-mailadres/i);
    }
  });

  it("noemt de ontbrekende sleutel eerst, ook als er ook geen adres is", () => {
    // Allebei oplossen is nodig, maar de sleutel is iets van de server en het
    // adres iets van deze ene vennootschap. Het heeft geen zin om naar een
    // adresveld te wijzen zolang er sowieso niets kan vertrekken.
    const knop = verzendKnop({ mailStaatAan: false, adres: null, verstuurdOp: null });
    expect(knop.reden).toMatch(/sleutel/i);
  });
});
