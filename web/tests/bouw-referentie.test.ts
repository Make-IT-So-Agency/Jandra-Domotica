import { describe, expect, it } from "vitest";

import { kiesReferentie, leesKalibratie, type Planinfo } from "@/lib/bouw/omzetting/referentie";

const kalibratie = { meterPerPunt: 0.0176, kwartslagen: 0, dx: 0, dy: 0 };

function versie(id: number, created_at: string, metKalibratie = true) {
  return { id, bestand_id: 1, pagina: id, label: `v${id}`, created_at, kalibratie: metKalibratie ? kalibratie : null };
}

const verdiepingen = [
  { id: 1, naam: "Gelijkvloers", gebouw_id: 5, vloerpeil_m: 0, volgorde: 0 },
  { id: 2, naam: "Verdieping", gebouw_id: 5, vloerpeil_m: 3.2, volgorde: 1 },
  { id: 3, naam: "Zolder", gebouw_id: 5, vloerpeil_m: 6, volgorde: 2 },
  { id: 4, naam: "Gelijkvloers", gebouw_id: 6, vloerpeil_m: 0, volgorde: 0 },
];

const plan = (id: number, verdieping_id: number, versies: Planinfo["versies"]): Planinfo => ({
  id,
  titel: `Plan ${id}`,
  soort: "grondplan",
  gebouw_id: verdieping_id === 4 ? 6 : 5,
  verdieping_id,
  versies,
});

describe("waarop een omzetting uitgelijnd wordt", () => {
  it("een nieuwe versie: op de laatste bevestigde versie van hetzelfde plan", () => {
    const plannen = [plan(10, 1, [versie(1, "2026-09-01"), versie(2, "2026-09-15"), versie(3, "2026-10-01")])];
    const referentie = kiesReferentie({ planId: 10, versieId: 3, verdiepingId: 1 }, plannen, verdiepingen, new Set([1, 2]));
    expect(referentie).toMatchObject({ versieId: 2, soort: "versie", verdieping: "Gelijkvloers" });
  });

  it("een andere verdieping: liefst die er net onder, in hetzelfde gebouw", () => {
    const plannen = [
      plan(10, 1, [versie(1, "2026-09-01")]),
      plan(11, 2, [versie(2, "2026-09-01")]),
      plan(12, 3, [versie(3, "2026-09-01")]),
      plan(13, 4, [versie(4, "2026-09-01")]),
    ];
    const bevestigd = new Set([1, 2, 4]);
    expect(kiesReferentie({ planId: 12, versieId: 3, verdiepingId: 3 }, plannen, verdiepingen, bevestigd)).toMatchObject({
      versieId: 2,
      soort: "verdieping",
      verdieping: "Verdieping",
    });
    // Het gelijkvloers heeft niets eronder: dan wat er net boven ligt.
    expect(kiesReferentie({ planId: 10, versieId: 1, verdiepingId: 1 }, plannen, verdiepingen, new Set([2, 4]))).toMatchObject({
      versieId: 2,
    });
    // Het bijgebouw heeft zijn eigen assenstelsel.
    expect(kiesReferentie({ planId: 13, versieId: 4, verdiepingId: 4 }, plannen, verdiepingen, bevestigd)).toBeNull();
  });

  it("niets bevestigd: dan is dit blad de referentie", () => {
    const plannen = [plan(10, 1, [versie(1, "2026-09-01", false)]), plan(11, 2, [versie(2, "2026-09-01")])];
    expect(kiesReferentie({ planId: 11, versieId: 2, verdiepingId: 2 }, plannen, verdiepingen, new Set([1]))).toBeNull();
  });

  it("leest enkel een volledige kalibratie", () => {
    expect(leesKalibratie({ meterPerPunt: 0.02, kwartslagen: 1, dx: 1, dy: 2 })).toEqual({ meterPerPunt: 0.02, kwartslagen: 1, dx: 1, dy: 2 });
    expect(leesKalibratie({ meterPerPunt: 0.02 })).toBeNull();
    expect(leesKalibratie(null)).toBeNull();
  });
});
