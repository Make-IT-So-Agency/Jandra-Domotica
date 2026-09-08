import { describe, expect, it } from "vitest";

import { periodeUitFormulier } from "@/app/rapporten/periode";

const LEEG = { van: "", tot: "" };

describe("periodeUitFormulier met de keuzelijst", () => {
  it("leest een kwartaal uit één waarde", () => {
    const periode = periodeUitFormulier({ ...LEEG, periode: "quarter:2026-3" });

    expect(periode.soort).toBe("quarter");
    expect(periode.start).toBe("2026-07-01");
    expect(periode.eind).toBe("2026-09-30");
    expect(periode.label).toBe("Q3 2026");
  });

  it("leest een maand uit één waarde", () => {
    const periode = periodeUitFormulier({ ...LEEG, periode: "month:2026-7" });

    expect(periode.start).toBe("2026-07-01");
    expect(periode.eind).toBe("2026-07-31");
  });

  it("gebruikt de vrije datums bij Zelf gekozen", () => {
    const periode = periodeUitFormulier({
      periode: "vrij",
      van: "2026-08-10",
      tot: "2026-08-20",
    });

    expect(periode.start).toBe("2026-08-10");
    expect(periode.eind).toBe("2026-08-20");
  });

  it("vraagt de datums als Zelf gekozen leeg blijft", () => {
    expect(() => periodeUitFormulier({ ...LEEG, periode: "vrij" })).toThrow(/einddatum/);
  });

  it("weigert een waarde die niet uit de lijst komt", () => {
    expect(() => periodeUitFormulier({ ...LEEG, periode: "quarter:2026-9" })).toThrow(/lijst/);
    expect(() => periodeUitFormulier({ ...LEEG, periode: "onzin" })).toThrow(/lijst/);
  });
});

describe("periodeUitFormulier met de oude losse velden", () => {
  // Bladwijzers en gedeelde links van voor de keuzelijst er was.
  it("blijft een kwartaal begrijpen", () => {
    const periode = periodeUitFormulier({
      ...LEEG,
      soort: "quarter",
      jaar: "2025",
      kwartaal: "4",
    });

    expect(periode.start).toBe("2025-10-01");
    expect(periode.eind).toBe("2025-12-31");
  });

  it("blijft een maand begrijpen", () => {
    const periode = periodeUitFormulier({ ...LEEG, soort: "month", jaar: "2026", maand: "7" });

    expect(periode.start).toBe("2026-07-01");
  });

  it("blijft vrije datums begrijpen", () => {
    const periode = periodeUitFormulier({
      soort: "vrij",
      van: "2026-01-05",
      tot: "2026-01-09",
    });

    expect(periode.start).toBe("2026-01-05");
  });

  it("klaagt over een onmogelijk jaar", () => {
    expect(() =>
      periodeUitFormulier({ ...LEEG, soort: "month", jaar: "1899", maand: "3" }),
    ).toThrow(/jaar/);
  });
});
