import { describe, expect, it } from "vitest";

import type { Ronde } from "../src/rondes.ts";
import { besluit, WACHTEN } from "../src/startsein.ts";

const U = 3_600_000;
/** Di 3 november 2026, 18:00 Belgische tijd (wintertijd): de ronde voor januari. */
const OPENT = Date.parse("2026-11-03T17:00:00Z");

const ronde = (over: Partial<Ronde> = {}): Ronde => ({
  id: 7,
  maand: "2027-01",
  ronde: "inwoners",
  opent: new Date(OPENT).toISOString(),
  status: "definitief",
  stop_gevraagd: false,
  bezig_sinds: null,
  ...over,
});

describe("startsein van Opvang - inschrijven", () => {
  it("zonder opening binnen 30 uur: niets, en de run stopt meteen", () => {
    expect(besluit([], OPENT).soort).toBe("niets");
    expect(besluit([ronde()], OPENT - 31 * U).soort).toBe("niets");
  });

  it("binnen 30 uur: een estafette, in beurten van hoogstens 5 uur", () => {
    expect(besluit([ronde()], OPENT - 29 * U)).toMatchObject({ soort: "estafette", wachtMs: 5 * U });
    // Het laatste stuk wacht precies tot 2 uur vooraf.
    expect(besluit([ronde()], OPENT - 4 * U)).toMatchObject({ soort: "estafette", wachtMs: 2 * U });
  });

  it("binnen 2 uur: deze run schrijft zelf in", () => {
    expect(besluit([ronde()], OPENT - 2 * U)).toMatchObject({ soort: "inschrijven", laatMs: 0 });
    expect(besluit([ronde()], OPENT - 60_000)).toMatchObject({ soort: "inschrijven", laatMs: 0 });
  });

  it("de estafette komt uit bij een run die tussen 1 en 2 uur vooraf start", () => {
    let nu = OPENT - 29 * U;
    let beurten = 0;
    for (let b = besluit([ronde()], nu); b.soort === "estafette"; b = besluit([ronde()], nu)) {
      expect(b.wachtMs).toBeLessThanOrEqual(WACHTEN.beurtMs);
      nu += b.wachtMs + 60_000; // een nieuwe run heeft een minuut nodig om te starten
      beurten++;
    }
    expect(besluit([ronde()], nu).soort).toBe("inschrijven");
    expect(beurten).toBe(6);
    expect(OPENT - nu).toBeGreaterThan(U);
    expect(OPENT - nu).toBeLessThanOrEqual(2 * U);
  });

  it("6 oktober: de run die GitHub om 21:22 startte, schrijft december toch nog in", () => {
    const december = ronde({ maand: "2026-12", opent: "2026-10-06T16:00:00.000Z" });
    const b = besluit([december], Date.parse("2026-10-06T19:22:43Z"));
    expect(b).toMatchObject({ soort: "inschrijven", ronde: { maand: "2026-12" } });
    expect(b.soort === "inschrijven" && b.laatMs).toBe(3 * U + 22 * 60_000 + 43_000);
  });

  it("meer dan 24 uur te laat: niet meer vanzelf, wel met de hand (inhalen)", () => {
    const december = ronde({ maand: "2026-12", opent: "2026-10-06T16:00:00.000Z" });
    const nu = Date.parse("2026-10-07T17:00:00Z");
    expect(besluit([december], nu).soort).toBe("niets");
    expect(besluit([december], nu, true)).toMatchObject({ soort: "inschrijven", ronde: { maand: "2026-12" } });
  });

  it("inhalen neemt de laatste ronde die definitief is, nooit een die nog open stond", () => {
    const nu = Date.parse("2026-11-20T12:00:00Z");
    const december = ronde({ id: 5, maand: "2026-12", opent: "2026-10-06T16:00:00.000Z" });
    const januari = ronde({ id: 6, status: "open" });
    expect(besluit([december, januari], nu, true)).toMatchObject({ soort: "inschrijven", ronde: { id: 5 } });
    expect(besluit([januari], nu, true).soort).toBe("niets");
  });

  it("een oude ronde die bleef liggen, houdt de volgende niet tegen", () => {
    const december = ronde({ id: 5, maand: "2026-12", opent: "2026-10-06T16:00:00.000Z" });
    expect(besluit([december, ronde()], OPENT - 10 * U)).toMatchObject({ soort: "estafette", ronde: { id: 7 } });
  });

  it("een ronde die bij de opening nog open stond: de run sluit ze af, binnen de 24 uur", () => {
    expect(besluit([ronde({ status: "open" })], OPENT + U)).toMatchObject({ soort: "inschrijven", laatMs: U });
  });
});
