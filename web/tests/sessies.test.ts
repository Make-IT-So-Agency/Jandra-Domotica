import { describe, expect, it } from "vitest";

import { isLopend, sessieToestand, TOESTANDEN, LIVE_VOORVOEGSEL } from "@/lib/sessies";
import type { Laadsessie } from "@/lib/types";

function sessie(overschrijf: Partial<Laadsessie> = {}): Laadsessie {
  return {
    id: "s1",
    external_id: "evcc:1",
    loadpoint_name: "Garage",
    vehicle: null,
    started_at: "2026-09-09T08:00:00Z",
    finished_at: "2026-09-09T10:00:00Z",
    energy_kwh: 10,
    meter_start_kwh: null,
    meter_stop_kwh: null,
    duration_seconds: null,
    solar_percentage: null,
    odometer_km: null,
    evcc_price_eur: null,
    evcc_price_per_kwh: null,
    is_complete: true,
    ...overschrijf,
  };
}

describe("sessieToestand", () => {
  it("noemt een afgeronde sessie afgerond", () => {
    expect(sessieToestand(sessie())).toBe("afgerond");
  });

  it("noemt een rij uit de status van evcc bezig", () => {
    const bezig = sessie({
      external_id: `${LIVE_VOORVOEGSEL}Garage`,
      finished_at: null,
      is_complete: false,
    });

    expect(sessieToestand(bezig)).toBe("bezig");
    expect(isLopend(bezig)).toBe(true);
  });

  it("noemt een sessie die evcc onvolledig afsloot onafgewerkt", () => {
    // Wel een eindtijd, maar geen verbruik: die wordt nooit meer vanzelf
    // compleet en is dus iets anders dan een sessie die nu loopt.
    const onaf = sessie({ energy_kwh: null, is_complete: false });

    expect(sessieToestand(onaf)).toBe("onafgewerkt");
    expect(isLopend(onaf)).toBe(false);
  });

  it("laat een afgeronde sessie afgerond ook al draagt ze het live-voorvoegsel", () => {
    // De opruiming kan achterlopen; de vlag is dan doorslaggevend.
    const raar = sessie({ external_id: `${LIVE_VOORVOEGSEL}Garage`, is_complete: true });
    expect(sessieToestand(raar)).toBe("afgerond");
  });

  it("geeft elke toestand een eigen icoon en kleur", () => {
    const iconen = Object.values(TOESTANDEN).map((toestand) => toestand.icoon);
    const klassen = Object.values(TOESTANDEN).map((toestand) => toestand.klasse);

    expect(new Set(iconen).size).toBe(3);
    expect(new Set(klassen).size).toBe(3);
  });
});
