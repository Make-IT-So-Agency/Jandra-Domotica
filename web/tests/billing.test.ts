import { describe, expect, it } from "vitest";

import {
  afrondenCent,
  berekenSessieKost,
  rekenSessiesDoor,
  tariefVoorDatum,
  zonneKwh,
} from "@/lib/billing";
import type { Laadsessie, Tarief } from "@/lib/types";

const TARIEF_Q1: Tarief = {
  id: "t1",
  region: "vlaanderen",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  eur_per_kwh: 0.28,
  includes_vat: true,
  vat_rate: 0.06,
  source: "manual",
  source_url: null,
  note: null,
  confirmed_at: "2026-01-05T00:00:00Z",
};

const TARIEF_Q2: Tarief = {
  ...TARIEF_Q1,
  id: "t2",
  period_start: "2026-04-01",
  period_end: "2026-06-30",
  eur_per_kwh: 0.3,
};

function sessie(overschrijf: Partial<Laadsessie> = {}): Laadsessie {
  return {
    id: "s1",
    external_id: "evcc:1",
    loadpoint_name: "Garage",
    vehicle: "Auto",
    started_at: "2026-01-10T08:00:00Z",
    finished_at: "2026-01-10T10:00:00Z",
    energy_kwh: 10,
    meter_start_kwh: 100,
    meter_stop_kwh: 110,
    duration_seconds: 7200,
    solar_percentage: 0,
    odometer_km: null,
    evcc_price_eur: null,
    evcc_price_per_kwh: null,
    is_complete: true,
    ...overschrijf,
  };
}

const CONTEXT = {
  tarieven: [TARIEF_Q1, TARIEF_Q2],
  regioPerLaadpaal: new Map([["garage", "vlaanderen"]]),
};

describe("afrondenCent", () => {
  it("rondt een halve cent naar boven af", () => {
    expect(afrondenCent(1.005)).toBe(1.01);
    expect(afrondenCent(1.004)).toBe(1.0);
    expect(afrondenCent(1.0049)).toBe(1.0);
  });

  it("vangt drijvendekommaruis op", () => {
    // Dit is de binaire buur van 4,295 en hoort dus als 4,295 te tellen.
    expect(afrondenCent(4.294999999999999)).toBe(4.3);
    // Duidelijk onder de helft: gewoon naar beneden.
    expect(afrondenCent(4.2949)).toBe(4.29);
    expect(afrondenCent(0.1 + 0.2)).toBe(0.3);
  });
});

describe("berekenSessieKost", () => {
  it("splitst een tarief inclusief btw correct", () => {
    const kost = berekenSessieKost(10, TARIEF_Q1);

    expect(kost.bedrag_incl_btw).toBe(2.8);
    expect(kost.bedrag_excl_btw).toBe(2.64);
    expect(kost.btw_bedrag).toBe(0.16);
  });

  it("telt btw bij een tarief exclusief btw", () => {
    const kost = berekenSessieKost(10, { ...TARIEF_Q1, includes_vat: false });

    expect(kost.bedrag_excl_btw).toBe(2.8);
    expect(kost.bedrag_incl_btw).toBe(2.97);
    expect(kost.btw_bedrag).toBe(0.17);
  });

  it("houdt excl + btw altijd exact gelijk aan incl", () => {
    for (const kwh of [0.001, 0.37, 3.333, 12.5, 47.891, 100]) {
      const kost = berekenSessieKost(kwh, TARIEF_Q1);
      expect(afrondenCent(kost.bedrag_excl_btw + kost.btw_bedrag)).toBe(
        kost.bedrag_incl_btw,
      );
    }
  });

  it("weigert een negatief verbruik", () => {
    expect(() => berekenSessieKost(-1, TARIEF_Q1)).toThrow();
  });
});

describe("tariefVoorDatum", () => {
  it("vindt het tarief van het juiste kwartaal", () => {
    expect(tariefVoorDatum([TARIEF_Q1, TARIEF_Q2], "2026-02-15T10:00:00Z", "vlaanderen")?.id).toBe(
      "t1",
    );
    expect(tariefVoorDatum([TARIEF_Q1, TARIEF_Q2], "2026-05-01T10:00:00Z", "vlaanderen")?.id).toBe(
      "t2",
    );
  });

  it("werkt op de grensdagen van een kwartaal", () => {
    expect(tariefVoorDatum([TARIEF_Q1], "2026-01-01T00:00:00Z", "vlaanderen")).not.toBeNull();
    expect(tariefVoorDatum([TARIEF_Q1], "2026-03-31T23:00:00Z", "vlaanderen")).not.toBeNull();
    expect(tariefVoorDatum([TARIEF_Q1], "2026-04-01T00:00:00Z", "vlaanderen")).toBeNull();
  });

  it("geeft niets terug voor een andere regio", () => {
    expect(tariefVoorDatum([TARIEF_Q1], "2026-02-15T10:00:00Z", "brussel")).toBeNull();
  });
});

describe("rekenSessiesDoor", () => {
  it("telt de regels exact op tot het totaal", () => {
    const resultaat = rekenSessiesDoor(
      [
        sessie({ id: "a", external_id: "evcc:1", energy_kwh: 12.345 }),
        sessie({ id: "b", external_id: "evcc:2", energy_kwh: 7.891 }),
        sessie({ id: "c", external_id: "evcc:3", energy_kwh: 0.333 }),
      ],
      CONTEXT,
    );

    const somExcl = resultaat.regels.reduce((som, regel) => som + regel.bedrag_excl_btw, 0);
    const somIncl = resultaat.regels.reduce((som, regel) => som + regel.bedrag_incl_btw, 0);

    expect(resultaat.totalen.aantal_sessies).toBe(3);
    expect(resultaat.totalen.excl_btw).toBe(afrondenCent(somExcl));
    expect(resultaat.totalen.incl_btw).toBe(afrondenCent(somIncl));
    expect(afrondenCent(resultaat.totalen.excl_btw + resultaat.totalen.btw)).toBe(
      resultaat.totalen.incl_btw,
    );
  });

  it("gebruikt per sessie het tarief van het juiste kwartaal", () => {
    const resultaat = rekenSessiesDoor(
      [
        sessie({ id: "a", external_id: "evcc:1", finished_at: "2026-02-10T10:00:00Z" }),
        sessie({
          id: "b",
          external_id: "evcc:2",
          started_at: "2026-05-10T08:00:00Z",
          finished_at: "2026-05-10T10:00:00Z",
        }),
      ],
      CONTEXT,
    );

    expect(resultaat.regels.map((regel) => regel.tarief_per_kwh)).toEqual([0.28, 0.3]);
    expect(resultaat.gebruikteTarieven).toHaveLength(2);
  });

  it("slaat lopende sessies over met een reden", () => {
    const resultaat = rekenSessiesDoor(
      [sessie({ is_complete: false, finished_at: null })],
      CONTEXT,
    );

    expect(resultaat.regels).toHaveLength(0);
    expect(resultaat.overgeslagen[0].reden).toContain("nog niet afgerond");
  });

  it("slaat sessies zonder verbruik over", () => {
    const resultaat = rekenSessiesDoor([sessie({ energy_kwh: 0 })], CONTEXT);

    expect(resultaat.regels).toHaveLength(0);
    expect(resultaat.overgeslagen[0].reden).toContain("geen geldig verbruik");
  });

  it("slaat sessies over waarvoor geen tarief gekend is", () => {
    const resultaat = rekenSessiesDoor(
      [
        sessie({
          started_at: "2030-01-01T08:00:00Z",
          finished_at: "2030-01-01T10:00:00Z",
        }),
      ],
      CONTEXT,
    );

    expect(resultaat.regels).toHaveLength(0);
    expect(resultaat.overgeslagen[0].reden).toContain("geen tarief gekend");
  });

  it("zet de regels chronologisch", () => {
    const resultaat = rekenSessiesDoor(
      [
        sessie({ id: "laat", external_id: "evcc:2", started_at: "2026-01-20T08:00:00Z" }),
        sessie({ id: "vroeg", external_id: "evcc:1", started_at: "2026-01-05T08:00:00Z" }),
      ],
      CONTEXT,
    );

    expect(resultaat.regels.map((regel) => regel.sessie_id)).toEqual(["vroeg", "laat"]);
  });
});

describe("zonneKwh", () => {
  it("rekent het percentage om naar kWh", () => {
    expect(zonneKwh(100, 30)).toBe(30);
    expect(zonneKwh(0.5, 90)).toBe(0.45);
    expect(zonneKwh(13.1, 94)).toBe(12.314);
  });

  it("laat zien waarom een percentage alleen niet volstaat", () => {
    // 90 % van een halve kWh is minder zon dan 30 % van honderd.
    expect(zonneKwh(0.5, 90)).toBeLessThan(zonneKwh(100, 30) as number);
  });

  it("geeft nul bij nul procent", () => {
    expect(zonneKwh(37.6, 0)).toBe(0);
  });

  it("geeft null zodra er iets ontbreekt", () => {
    expect(zonneKwh(null, 50)).toBeNull();
    expect(zonneKwh(10, null)).toBeNull();
    expect(zonneKwh(undefined, undefined)).toBeNull();
    expect(zonneKwh(Number.NaN, 50)).toBeNull();
  });

  it("verdraagt getallen die als tekst uit de databank komen", () => {
    // Postgres numeric komt soms als string terug; dat mag hier niet stukgaan.
    expect(zonneKwh("51.00" as unknown as number, "76" as unknown as number)).toBe(38.76);
  });

  it("rondt af op drie cijfers, zoals de kWh-kolommen", () => {
    expect(zonneKwh(1.9, 90)).toBe(1.71);
    expect(zonneKwh(98.6, 30)).toBe(29.58);
  });
});
