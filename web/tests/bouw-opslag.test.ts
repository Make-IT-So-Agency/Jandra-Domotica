import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import {
  bewaarProject,
  leesBouwstand,
  leesPlan,
  leesProject,
  lijstGebouwen,
  lijstPlannen,
  lijstVerdiepingen,
  verlatenUploads,
  verwijderGebouw,
  verwijderPlan,
  verwijderVerdieping,
  voegPlanToe,
  voegVerdiepingToe,
  voegVersieToe,
  wijzigPlan,
  wijzigVerdieping,
  wordtGebruikt,
  zoekOfMaakGebouw,
} from "@/lib/bouw/opslag";

let db: ReturnType<typeof nepSupabase>;

function begin(fouten = {}) {
  db = nepSupabase(
    {
      bouw_gebouwen: [
        { id: 5, naam: "Woning", volgorde: 0 },
        { id: 6, naam: "Bijgebouw", volgorde: 1 },
      ],
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 5, naam: "Verdieping", volgorde: 1, vloerpeil_m: "2.950", verdiepingshoogte_m: "2.800", plafondhoogte_m: null },
        { id: 2, gebouw_id: 5, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: "0.000", verdiepingshoogte_m: "2.950", plafondhoogte_m: "2.600" },
        { id: 3, gebouw_id: 6, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null },
      ],
      bouw_plannen: [
        { id: 10, titel: "Grondplan gelijkvloers", soort: "grondplan", gebouw_id: 5, verdieping_id: 2, bladcode: null, opmerking: null },
        { id: 11, titel: "Gevels", soort: "gevel", gebouw_id: 5, verdieping_id: null, bladcode: null, opmerking: null },
      ],
      bouw_planversies: [
        { id: 20, plan_id: 10, bestand_id: 30, label: "v1", pagina: 1, created_at: "2026-09-01T10:00:00Z" },
        { id: 21, plan_id: 10, bestand_id: 31, label: "v2", pagina: 1, created_at: "2026-09-20T10:00:00Z" },
        { id: 22, plan_id: 11, bestand_id: 31, label: "v2", pagina: 3, created_at: "2026-09-20T10:00:00Z" },
      ],
      bouw_bestanden: [
        { id: 30, pad: "plannen/a.pdf", status: "klaar", grootte_bytes: 1000, created_at: "2026-09-01T09:00:00Z" },
        { id: 31, pad: "plannen/b.pdf", status: "klaar", grootte_bytes: 2500, created_at: "2026-09-20T09:00:00Z" },
        { id: 32, pad: "plannen/c.pdf", status: "wacht", grootte_bytes: 99, created_at: "2026-10-01T06:00:00Z" },
        { id: 33, pad: "plannen/d.pdf", status: "wacht", grootte_bytes: 99, created_at: "2026-10-02T09:00:00Z" },
      ],
      bouw_partijen: [{ id: 40, soort: "architect", naam: "Architect" }],
    },
    fouten,
  );
  nep.client = db.client;
}

beforeEach(() => begin());

describe("het project", () => {
  it("bewaart naam en adres, en wist wat leeg is", async () => {
    await bewaarProject({ projectnaam: "Ons huis", adres: "Ergens 1" });
    expect(await leesProject()).toEqual({ projectnaam: "Ons huis", adres: "Ergens 1" });

    await bewaarProject({ projectnaam: "Ons nieuwe huis", adres: null });
    expect(await leesProject()).toEqual({ projectnaam: "Ons nieuwe huis", adres: null });
    expect(db.tabellen.bouw_instellingen.map((rij) => rij.sleutel)).toEqual(["projectnaam"]);
  });
});

describe("gebouwen", () => {
  it("vindt een gebouw los van hoofdletters en witruimte", async () => {
    expect(await zoekOfMaakGebouw("  woning ")).toBe(5);
    expect(await zoekOfMaakGebouw("BIJGEBOUW")).toBe(6);
    expect(db.tabellen.bouw_gebouwen).toHaveLength(2);
  });

  it("maakt een nieuw gebouw achteraan", async () => {
    const id = await zoekOfMaakGebouw("Carport");
    expect((await lijstGebouwen()).map((g) => [g.id, g.naam, g.volgorde])).toEqual([
      [5, "Woning", 0],
      [6, "Bijgebouw", 1],
      [id, "Carport", 2],
    ]);
  });

  it("weigert een gebouw te verwijderen waar nog iets aan hangt", async () => {
    begin({ "bouw_gebouwen:delete": { code: "23503", message: "violates foreign key constraint" } });
    await expect(verwijderGebouw(5)).rejects.toThrow("Aan dit gebouw hangen nog verdiepingen of plannen");
  });
});

describe("verdiepingen", () => {
  it("leest ze in volgorde, met getallen in plaats van tekst", async () => {
    const verdiepingen = await lijstVerdiepingen();
    expect(verdiepingen.map((v) => [v.gebouw_id, v.naam])).toEqual([
      [5, "Gelijkvloers"],
      [6, "Gelijkvloers"],
      [5, "Verdieping"],
    ]);
    expect(verdiepingen[2].vloerpeil_m).toBe(2.95);
    expect(verdiepingen[2].plafondhoogte_m).toBeNull();
  });

  it("zegt in mensentaal dat een naam al bestaat in dat gebouw", async () => {
    const nieuw = { naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null };
    await expect(voegVerdiepingToe({ ...nieuw, gebouw_id: 5 })).rejects.toThrow(
      'Er bestaat al een verdieping "Gelijkvloers" in dit gebouw.',
    );
    // In een ander gebouw mag dezelfde naam wel.
    expect(await voegVerdiepingToe({ ...nieuw, naam: "Zolder", gebouw_id: 6 })).toBeGreaterThan(0);
  });

  it("neemt de grondplannen mee naar een ander gebouw", async () => {
    await wijzigVerdieping(2, { gebouw_id: 6, naam: "Kelder" });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === 10)?.gebouw_id).toBe(6);
    expect(db.tabellen.bouw_plannen.find((p) => p.id === 11)?.gebouw_id).toBe(5);
  });

  it("weigert een verdieping te verwijderen waar nog een plan aan hangt", async () => {
    begin({ "bouw_verdiepingen:delete": { code: "23503", message: "violates foreign key constraint" } });
    await expect(verwijderVerdieping(2)).rejects.toThrow("Aan deze verdieping hangt nog een plan");
  });
});

describe("plannen en versies", () => {
  it("geeft elk plan zijn eigen versies, oudste eerst", async () => {
    const plannen = await lijstPlannen();
    expect(plannen.map((p) => p.titel)).toEqual(["Gevels", "Grondplan gelijkvloers"]);
    expect(plannen[1].versies.map((v) => v.label)).toEqual(["v1", "v2"]);
    expect((await leesPlan(10))?.versies).toHaveLength(2);
    expect(await leesPlan(999)).toBeNull();
  });

  it("hangt een plan op een verdieping aan het gebouw van die verdieping", async () => {
    const id = await voegPlanToe({
      titel: "Grondplan",
      soort: "grondplan",
      gebouw_id: 5,
      verdieping_id: 3,
      opmerking: null,
      bladcode: "BA_bijgebouw_P_N_1",
    });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === id)).toMatchObject({ gebouw_id: 6, bladcode: "BA_bijgebouw_P_N_1" });

    // Wie het plan wijzigt zonder bladcode, laat die staan.
    await wijzigPlan(id, { titel: "Grondplan bijgebouw", soort: "grondplan", gebouw_id: null, verdieping_id: 3, opmerking: null });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === id)).toMatchObject({ gebouw_id: 6, bladcode: "BA_bijgebouw_P_N_1" });

    await expect(
      voegPlanToe({ titel: "X", soort: "grondplan", gebouw_id: null, verdieping_id: 99, opmerking: null }),
    ).rejects.toThrow("Die verdieping bestaat niet meer.");
  });

  it("weigert een tweede versie met hetzelfde label", async () => {
    await expect(
      voegVersieToe({ plan_id: 10, bestand_id: 30, label: "v2", pagina: 1, datum: null, opmerking: null }),
    ).rejects.toThrow('Dit plan heeft al een versie "v2".');
  });

  it("geeft bij het verwijderen van een plan zijn bestanden terug, om op te ruimen", async () => {
    expect(await verwijderPlan(10)).toEqual([30, 31]);
    expect(db.tabellen.bouw_plannen.map((p) => p.id)).toEqual([11]);
  });

  it("weet of een bestand nog gebruikt wordt", async () => {
    expect(await wordtGebruikt(31)).toBe(true);
    expect(await wordtGebruikt(32)).toBe(false);
  });
});

describe("bestanden", () => {
  it("vindt enkel uploads die te lang op wacht staan", async () => {
    const verlaten = await verlatenUploads(new Date("2026-10-02T06:00:00Z"));
    expect(verlaten.map((b) => b.id)).toEqual([32]);
  });
});

describe("de stand voor het overzicht", () => {
  it("telt plannen, versies en de gebruikte opslag", async () => {
    const stand = await leesBouwstand();
    expect(stand.verdiepingen).toBe(3);
    expect(stand.plannen).toEqual([
      { id: 11, titel: "Gevels", versies: 1 },
      { id: 10, titel: "Grondplan gelijkvloers", versies: 2 },
    ]);
    expect(stand.partijen.map((partij) => partij.soort)).toEqual(["architect"]);
    // Enkel bestanden die klaar zijn tellen mee.
    expect(stand.bytes).toBe(3500);
  });
});
