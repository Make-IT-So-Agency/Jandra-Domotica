import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { controleerBevestiging, naarRuimterijen, omzettingsvoorstel } from "@/lib/bouw/omzetting/bevestigen";
import { vergelijkRuimtes } from "@/lib/bouw/omzetting/ruimtediff";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { bewaarOmzetting, lijstOmzettingen, lijstRuimtes, schrijfRuimtes } from "@/lib/bouw/opslag";

const vierkant = (x: number, y: number, b: number, h = b): Xy[][] => [
  [
    [x, y],
    [x + b, y],
    [x + b, y + h],
    [x, y + h],
  ],
];

describe("een nieuwe versie tegenover de ruimtes die er al zijn", () => {
  const oud = [
    { id: 1, naam: "leefruimte", ringen: vierkant(0, 0, 6), oppervlakte: 36 },
    { id: 2, naam: "keuken", ringen: vierkant(6.14, 0, 3), oppervlakte: 9 },
    { id: 3, naam: "berging", ringen: vierkant(0, 6.14, 2), oppervlakte: 4 },
  ];

  it("houdt een ruimte op dezelfde plaats met dezelfde naam, ook als ze wat groter werd", () => {
    const verschil = vergelijkRuimtes(oud, [
      { sleutel: "r1", naam: "Leefruimte", ringen: vierkant(0, 0, 5.5) },
      { sleutel: "r2", naam: "keuken", ringen: vierkant(5.64, 0, 3.5) },
    ]);
    expect(verschil.koppelingen.map((k) => [k.sleutel, k.ruimteId])).toEqual([
      ["r1", 1],
      ["r2", 2],
    ]);
    expect(verschil.verdwenen.map((r) => r.id)).toEqual([3]);
  });

  it("ziet een hernoemde ruimte op dezelfde plaats, en een nieuwe", () => {
    const verschil = vergelijkRuimtes(oud, [
      { sleutel: "r1", naam: "living", ringen: vierkant(0, 0, 6) },
      { sleutel: "r2", naam: "bureau", ringen: vierkant(10, 10, 3) },
    ]);
    expect(verschil.koppelingen).toEqual([
      { sleutel: "r1", ruimteId: 1, oudeNaam: "leefruimte", oudeOppervlakte: 36 },
      { sleutel: "r2", ruimteId: null, oudeNaam: null, oudeOppervlakte: null },
    ]);
  });

  it("vindt een verschoven ruimte terug op haar naam, maar koppelt elke oude ruimte maar één keer", () => {
    const verschil = vergelijkRuimtes(oud, [
      { sleutel: "r1", naam: "berging", ringen: vierkant(20, 20, 2) },
      { sleutel: "r2", naam: "berging", ringen: vierkant(30, 30, 2) },
    ]);
    expect(verschil.koppelingen.map((k) => k.ruimteId)).toEqual([3, null]);
  });
});

function bevestiging(over: Record<string, unknown> = {}) {
  return {
    versieId: 21,
    kalibratie: { meterPerPunt: 0.5, kwartslagen: 0, dx: 1, dy: 2, bron: "beide", bewijs: "1:50", referentieVersieId: null },
    ruimtes: [
      { ruimteId: 7, naam: " leefruimte ", soort: "leefruimte", ringen: vierkant(0, 0, 10), oppervlaktePlan: 25, plafondhoogte: null, vloerpeil: null },
      { ruimteId: null, naam: "trapbordes", soort: "trap", ringen: vierkant(20, 0, 2, 4), oppervlaktePlan: null, plafondhoogte: 4.3, vloerpeil: null },
    ],
    openingen: [{ soort: "deur", x: 10, y: 10, punten: [[12, 10], [10, 12]], breedte: 0.9, hoogte: null, ruimte: "r1" }],
    verdieping: { bijwerken: true, vloerpeil: 0, plafondhoogte: 2.8 },
    schaal: { noemer: 50, bron: "beide", titelblok: 50, kloppend: 5, getoetst: 5 },
    ...over,
  };
}

describe("een bevestiging nakijken", () => {
  it("aanvaardt een gewone bevestiging, met de namen opgekuist", () => {
    const uitkomst = controleerBevestiging(bevestiging());
    expect(uitkomst.ok).toBe(true);
    if (uitkomst.ok) expect(uitkomst.data.ruimtes.map((r) => r.naam)).toEqual(["leefruimte", "trapbordes"]);
  });

  it("weigert wat niet klopt", () => {
    const melding = (over: Record<string, unknown>) => {
      const uitkomst = controleerBevestiging(bevestiging(over));
      return uitkomst.ok ? "aanvaard" : uitkomst.melding;
    };
    const ruimte = bevestiging().ruimtes[0];
    expect(melding({ versieId: "x" })).toBe("Onbekende versie.");
    expect(melding({ ruimtes: [] })).toBe("Er gaat geen enkele ruimte mee.");
    expect(melding({ ruimtes: [{ ...ruimte, naam: "" }] })).toContain("Geef elke ruimte een naam");
    expect(melding({ ruimtes: [{ ...ruimte, soort: "zwembad" }] })).toContain("kies wat voor ruimte");
    expect(melding({ ruimtes: [{ ...ruimte, ringen: [[[0, 0], [1, 1]]] }] })).toContain("de vorm klopt niet");
    expect(melding({ ruimtes: [{ ...ruimte, ringen: [[[0, 0], [1, Number.NaN], [2, 2]]] }] })).toContain("de vorm klopt niet");
    expect(melding({ ruimtes: [ruimte, { ...ruimte, naam: "dubbel" }] })).toContain("ongeldige koppeling");
    expect(melding({ ruimtes: [{ ...ruimte, plafondhoogte: 50 }] })).toContain("klopt niet");
    expect(melding({ kalibratie: { ...bevestiging().kalibratie, meterPerPunt: 0 } })).toBe("De schaal klopt niet.");
    expect(melding({ kalibratie: { ...bevestiging().kalibratie, kwartslagen: 5 } })).toBe("De draaiing klopt niet.");
  });

  it("rekent de ruimtes om naar meter, met de oppervlakte van de server", () => {
    const uitkomst = controleerBevestiging(bevestiging());
    if (!uitkomst.ok) throw new Error(uitkomst.melding);
    const rijen = naarRuimterijen(uitkomst.data);
    if (!rijen.ok) throw new Error(rijen.melding);
    expect(rijen.data[0]).toMatchObject({
      id: 7,
      naam: "leefruimte",
      oppervlakte_m2: 25,
      oppervlakte_plan_m2: 25,
      veelhoek: [
        [
          [1, 2],
          [6, 2],
          [6, 7],
          [1, 7],
        ],
      ],
    });
    expect(rijen.data[1]).toMatchObject({ id: null, oppervlakte_m2: 2, plafondhoogte_m: 4.3 });

    const voorstel = omzettingsvoorstel(uitkomst.data, rijen.data);
    expect(voorstel.openingen).toEqual([{ soort: "deur", x: 6, y: 7, punten: [[7, 7], [6, 8]], breedte: 0.9, hoogte: null }]);
    expect(voorstel.ruimtes).toEqual([
      { naam: "leefruimte", soort: "leefruimte", oppervlakte: 25, oppervlaktePlan: 25 },
      { naam: "trapbordes", soort: "trap", oppervlakte: 2, oppervlaktePlan: null },
    ]);
  });

  it("weigert een ruimte die te klein is om een ruimte te zijn", () => {
    const uitkomst = controleerBevestiging(
      bevestiging({ ruimtes: [{ ...bevestiging().ruimtes[0], ringen: vierkant(0, 0, 0.5) }] }),
    );
    if (!uitkomst.ok) throw new Error(uitkomst.melding);
    expect(naarRuimterijen(uitkomst.data)).toEqual({ ok: false, melding: "leefruimte is te klein om een ruimte te zijn." });
  });
});

describe("ruimtes wegschrijven", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_ruimtes: [
        { id: 7, verdieping_id: 1, naam: "leefruimte", soort: "leefruimte", veelhoek: [], oppervlakte_m2: "24.000" },
        { id: 8, verdieping_id: 1, naam: "berging", soort: "berging", veelhoek: [], oppervlakte_m2: "4.000" },
        { id: 9, verdieping_id: 2, naam: "slaapkamer", soort: "slaapkamer", veelhoek: [], oppervlakte_m2: "12.000" },
      ],
    });
    nep.client = db.client;
  });

  const rij = (id: number | null, naam: string) => ({
    id,
    naam,
    soort: "andere" as const,
    veelhoek: vierkant(0, 0, 2),
    oppervlakte_m2: 4,
    oppervlakte_plan_m2: null,
    plafondhoogte_m: null,
    vloerpeil_m: null,
  });

  it("werkt bij wat blijft, voegt toe wat nieuw is, en haalt weg wat verdwijnt", async () => {
    const uitkomst = await schrijfRuimtes(1, 50, [rij(7, "leefruimte"), rij(null, "trapbordes")]);
    expect(uitkomst).toEqual({ bijgewerkt: 1, nieuw: 1, verwijderd: 1 });
    expect((await lijstRuimtes(1)).map((r) => [r.naam, r.omzetting_id])).toEqual([
      ["leefruimte", 50],
      ["trapbordes", 50],
    ]);
    // Een andere verdieping blijft ongemoeid.
    expect((await lijstRuimtes(2)).map((r) => r.id)).toEqual([9]);
  });

  it("weigert een ruimte van een andere verdieping", async () => {
    await expect(schrijfRuimtes(1, 50, [rij(9, "slaapkamer")])).rejects.toThrow("hoort niet (meer) bij deze verdieping");
  });

  it("bewaart een omzetting één keer per versie", async () => {
    const eerste = await bewaarOmzetting({ planversie_id: 21, werkwijze: 1, voorstel: { a: 1 }, bevestigd_door: "jan@example.be" });
    const tweede = await bewaarOmzetting({ planversie_id: 21, werkwijze: 1, voorstel: { a: 2 }, bevestigd_door: "jan@example.be" });
    expect(tweede).toBe(eerste);
    expect(db.tabellen.bouw_omzettingen).toHaveLength(1);
    expect(db.tabellen.bouw_omzettingen[0].voorstel).toEqual({ a: 2 });
    expect((await lijstOmzettingen([21, 22])).map((o) => o.planversie_id)).toEqual([21]);
  });
});
