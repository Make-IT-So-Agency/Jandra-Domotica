import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { leesDossierIn } from "@/lib/bouw/dossier-inlezen";
import { controleerAanvraag, koppelBladen, type Dossieraanvraag } from "@/lib/bouw/dossierregels";

let db: ReturnType<typeof nepSupabase>;

beforeEach(() => {
  db = nepSupabase({
    bouw_gebouwen: [{ id: 5, naam: "Woning", volgorde: 0 }],
    bouw_verdiepingen: [
      { id: 1, gebouw_id: 5, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: "2.700" },
    ],
    bouw_plannen: [
      { id: 10, titel: "Gelijkvloers", soort: "grondplan", gebouw_id: 5, verdieping_id: 1, bladcode: "BA_woning_P_N_1", opmerking: null },
      { id: 11, titel: "Voorgevel", soort: "gevel", gebouw_id: 5, verdieping_id: null, bladcode: null, opmerking: null },
    ],
    bouw_planversies: [{ id: 20, plan_id: 10, bestand_id: 30, label: "v1", pagina: 14, created_at: "2026-09-01T10:00:00Z" }],
    bouw_bestanden: [
      { id: 30, pad: "plannen/a.pdf", doel: "plan", status: "klaar", grootte_bytes: 1000 },
      { id: 31, pad: "plannen/b.pdf", doel: "plan", status: "klaar", grootte_bytes: 2000 },
    ],
  });
  nep.client = db.client;
});

function aanvraag(label = "v2"): Dossieraanvraag {
  return {
    label,
    datum: "2026-10-01",
    bladen: [
      { pagina: 4, titel: "Gelijkvloers", soort: "grondplan", gebouw: "Woning", verdieping: "Gelijkvloers", bladcode: "BA_woning_P_N_1" },
      { pagina: 5, titel: "Verdieping", soort: "grondplan", gebouw: "Woning", verdieping: "Verdieping", bladcode: "BA_woning_P_N_2" },
      { pagina: 3, titel: "Voorgevel", soort: "gevel", gebouw: "woning", verdieping: null, bladcode: "BA_woning_G_N_1" },
      { pagina: 2, titel: "Grondplan", soort: "grondplan", gebouw: "Bijgebouw", verdieping: "Gelijkvloers", bladcode: "BA_bijgebouw_P_N_1" },
      { pagina: 9, titel: "Inplantingsplan", soort: "inplanting", gebouw: null, verdieping: null, bladcode: "BA_woning_I_N_1" },
    ],
    verdiepingen: [
      { gebouw: "Bijgebouw", naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: 0, plafondhoogte_m: 2.4, verdiepingshoogte_m: null },
      { gebouw: "Woning", naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: 0, plafondhoogte_m: 2.8, verdiepingshoogte_m: 3.2 },
      { gebouw: "Woning", naam: "Verdieping", volgorde: 1, vloerpeil_m: 3.2, plafondhoogte_m: 2.6, verdiepingshoogte_m: null },
    ],
  };
}

describe("wat de browser mag sturen", () => {
  it("aanvaardt een gewoon dossier", () => {
    expect(controleerAanvraag(aanvraag())).toEqual({ ok: true, data: aanvraag() });
  });

  it("weigert wat niet klopt, met een melding in mensentaal", () => {
    const geval = (wijziging: Record<string, unknown>) => {
      const uitkomst = controleerAanvraag({ ...aanvraag(), ...wijziging });
      return uitkomst.ok ? "aanvaard" : uitkomst.melding;
    };
    expect(geval({ label: "" })).toContain("label");
    expect(geval({ bladen: [] })).toBe("Vink minstens één blad aan.");
    expect(geval({ bladen: [{ ...aanvraag().bladen[0], soort: "onzin" }] })).toContain("kies wat voor plan");
    expect(geval({ bladen: [{ ...aanvraag().bladen[0], gebouw: null }] })).toContain("hoort bij een gebouw");
    expect(geval({ bladen: [aanvraag().bladen[0], { ...aanvraag().bladen[1], bladcode: "ba_woning_p_n_1" }] })).toBe(
      "Twee bladen hebben dezelfde bladcode.",
    );
    expect(geval({ bladen: [aanvraag().bladen[0], { ...aanvraag().bladen[1], pagina: 4 }] })).toContain("ongeldig nummer");
    expect(geval({ verdiepingen: [{ ...aanvraag().verdiepingen[0], plafondhoogte_m: 40 }] })).toContain("klopt niet");
    expect(geval({ bladen: [{ ...aanvraag().bladen[0], bladcode: "BA woning <x>" }] })).toContain("bladcode is ongeldig");
  });
});

describe("bladen koppelen aan wat er al is", () => {
  const bestaand = [
    { id: 10, titel: "Gelijkvloers", bladcode: "BA_woning_P_N_1", gebouw: "Woning", labels: ["v1"] },
    { id: 11, titel: "Voorgevel", bladcode: null, gebouw: "Woning", labels: [] },
  ];

  it("vindt een plan op bladcode, of zonder bladcode op titel in hetzelfde gebouw", () => {
    const { bladen, fouten } = koppelBladen(aanvraag(), bestaand);
    expect(bladen.map((b) => b.plan?.id ?? null)).toEqual([10, null, 11, null, null]);
    expect(fouten).toEqual([]);
  });

  it("zegt welk label al bestaat", () => {
    expect(koppelBladen(aanvraag("v1"), bestaand).fouten).toEqual([
      '"Gelijkvloers" heeft al een versie "v1". Kies een ander label.',
    ]);
  });
});

describe("een dossier wegschrijven", () => {
  it("maakt de gebouwen, verdiepingen, plannen en versies, en hergebruikt wat er al is", async () => {
    const uitkomst = await leesDossierIn(aanvraag(), 31);
    expect(uitkomst).toEqual({ ok: true, data: { plannen: 5, nieuwePlannen: 3, verdiepingen: 2, gebouwen: 1 } });

    expect(db.tabellen.bouw_gebouwen.map((g) => g.naam)).toEqual(["Woning", "Bijgebouw"]);
    const bijgebouw = db.tabellen.bouw_gebouwen.find((g) => g.naam === "Bijgebouw")!.id;

    // De bestaande verdieping krijgt enkel wat leeg was; de plafondhoogte die er stond, blijft.
    expect(db.tabellen.bouw_verdiepingen.find((v) => v.id === 1)).toMatchObject({
      vloerpeil_m: 0,
      verdiepingshoogte_m: 3.2,
      plafondhoogte_m: "2.700",
    });
    expect(db.tabellen.bouw_verdiepingen.map((v) => [v.gebouw_id, v.naam])).toEqual([
      [5, "Gelijkvloers"],
      [bijgebouw, "Gelijkvloers"],
      [5, "Verdieping"],
    ]);

    // Bestaande plannen krijgen een versie; de voorgevel ook zijn bladcode.
    const versies = db.tabellen.bouw_planversies.filter((v) => v.label === "v2");
    expect(versies.map((v) => [v.plan_id, v.pagina, v.bestand_id, v.datum])).toEqual(
      expect.arrayContaining([
        [10, 4, 31, "2026-10-01"],
        [11, 3, 31, "2026-10-01"],
      ]),
    );
    expect(versies).toHaveLength(5);
    expect(db.tabellen.bouw_plannen.find((p) => p.id === 11)?.bladcode).toBe("BA_woning_G_N_1");

    const inplanting = db.tabellen.bouw_plannen.find((p) => p.bladcode === "BA_woning_I_N_1");
    expect(inplanting).toMatchObject({ gebouw_id: null, verdieping_id: null, soort: "inplanting" });
    const verdieping = db.tabellen.bouw_plannen.find((p) => p.bladcode === "BA_woning_P_N_2");
    const nieuweVerdieping = db.tabellen.bouw_verdiepingen.find((v) => v.naam === "Verdieping")!;
    expect(verdieping).toMatchObject({ gebouw_id: 5, verdieping_id: nieuweVerdieping.id, soort: "grondplan" });
    expect(db.tabellen.bouw_plannen.find((p) => p.bladcode === "BA_bijgebouw_P_N_1")).toMatchObject({ gebouw_id: bijgebouw });
  });

  it("schrijft niets als een label al bestaat", async () => {
    const uitkomst = await leesDossierIn(aanvraag("v1"), 31);
    expect(uitkomst.ok).toBe(false);
    expect(db.tabellen.bouw_planversies).toHaveLength(1);
    expect(db.tabellen.bouw_gebouwen).toHaveLength(1);
  });

  it("een tweede dossier wordt een nieuwe versie van dezelfde plannen", async () => {
    await leesDossierIn(aanvraag("v2"), 31);
    const plannen = db.tabellen.bouw_plannen.length;
    const uitkomst = await leesDossierIn(aanvraag("v3"), 31);
    expect(uitkomst).toEqual({ ok: true, data: { plannen: 5, nieuwePlannen: 0, verdiepingen: 0, gebouwen: 0 } });
    expect(db.tabellen.bouw_plannen).toHaveLength(plannen);
  });
});
