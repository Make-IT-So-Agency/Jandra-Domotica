import { describe, expect, it } from "vitest";

import {
  kwartaalPeriode,
  kwartaalVan,
  lokaleDatumNaarUtc,
  lokaleOnderdelen,
  maandPeriode,
  vorigePeriode,
  vrijePeriode,
} from "@/lib/periods";

describe("lokaleDatumNaarUtc", () => {
  it("houdt rekening met de wintertijd (UTC+1)", () => {
    expect(lokaleDatumNaarUtc(2026, 1, 1).toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("houdt rekening met de zomertijd (UTC+2)", () => {
    expect(lokaleDatumNaarUtc(2026, 7, 1).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("klopt ook op de dag van de uurwissel", () => {
    // Laatste zondag van maart 2026 is 29 maart.
    expect(lokaleDatumNaarUtc(2026, 3, 29).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(lokaleDatumNaarUtc(2026, 3, 30).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});

describe("maandPeriode", () => {
  it("loopt van de eerste tot de laatste dag", () => {
    const januari = maandPeriode(2026, 1);

    expect(januari.start).toBe("2026-01-01");
    expect(januari.eind).toBe("2026-01-31");
    expect(januari.label).toBe("januari 2026");
  });

  it("kent de lengte van februari in een schrikkeljaar", () => {
    expect(maandPeriode(2024, 2).eind).toBe("2024-02-29");
    expect(maandPeriode(2026, 2).eind).toBe("2026-02-28");
  });

  it("loopt bij december door naar het volgende jaar", () => {
    const december = maandPeriode(2026, 12);

    expect(december.tot.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("weigert een onbestaande maand", () => {
    expect(() => maandPeriode(2026, 13)).toThrow();
  });

  it("gebruikt lokale middernacht als grens, niet UTC-middernacht", () => {
    const juli = maandPeriode(2026, 7);

    expect(juli.vanaf.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(juli.tot.toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });
});

describe("kwartaalPeriode", () => {
  it("beslaat drie maanden", () => {
    const tweede = kwartaalPeriode(2026, 2);

    expect(tweede.start).toBe("2026-04-01");
    expect(tweede.eind).toBe("2026-06-30");
    expect(tweede.label).toBe("Q2 2026");
  });

  it("loopt bij het vierde kwartaal door naar het volgende jaar", () => {
    expect(kwartaalPeriode(2026, 4).eind).toBe("2026-12-31");
  });

  it("weigert een onbestaand kwartaal", () => {
    expect(() => kwartaalPeriode(2026, 5)).toThrow();
  });
});

describe("kwartaalVan", () => {
  it("plaatst een datum in het juiste kwartaal", () => {
    expect(kwartaalVan("2026-01-15")).toEqual({ jaar: 2026, kwartaal: 1 });
    expect(kwartaalVan("2026-04-01")).toEqual({ jaar: 2026, kwartaal: 2 });
    expect(kwartaalVan("2026-12-31")).toEqual({ jaar: 2026, kwartaal: 4 });
  });

  it("rekent een tijdstip om naar Belgische tijd", () => {
    // 31 december 23:30 UTC is in België al 1 januari.
    expect(kwartaalVan(new Date("2025-12-31T23:30:00Z"))).toEqual({
      jaar: 2026,
      kwartaal: 1,
    });
  });
});

describe("vorigePeriode", () => {
  it("geeft de vorige maand", () => {
    expect(vorigePeriode("month", new Date("2026-08-05T10:00:00Z")).label).toBe("juli 2026");
  });

  it("springt in januari terug naar december", () => {
    expect(vorigePeriode("month", new Date("2026-01-03T10:00:00Z")).label).toBe(
      "december 2025",
    );
  });

  it("geeft het vorige kwartaal", () => {
    expect(vorigePeriode("quarter", new Date("2026-07-01T10:00:00Z")).label).toBe("Q2 2026");
    expect(vorigePeriode("quarter", new Date("2026-01-01T10:00:00Z")).label).toBe("Q4 2025");
  });
});

describe("vrijePeriode", () => {
  it("neemt de einddag mee", () => {
    const periode = vrijePeriode("2026-03-01", "2026-03-15");

    expect(periode.vanaf.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(periode.tot.toISOString()).toBe("2026-03-15T23:00:00.000Z");
  });

  it("weigert een einddatum voor de begindatum", () => {
    expect(() => vrijePeriode("2026-03-15", "2026-03-01")).toThrow();
  });
});

describe("lokaleOnderdelen", () => {
  it("laat een kale datum ongemoeid", () => {
    expect(lokaleOnderdelen("2026-07-01")).toEqual({ jaar: 2026, maand: 7, dag: 1 });
  });

  it("zet een tijdstip om naar de Belgische kalenderdag", () => {
    expect(lokaleOnderdelen(new Date("2026-06-30T22:30:00Z"))).toEqual({
      jaar: 2026,
      maand: 7,
      dag: 1,
    });
  });
});
