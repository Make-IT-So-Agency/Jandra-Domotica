import { beforeEach, describe, expect, it, vi } from "vitest";

import { TESTHUIS, metHuis, nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { bewaarProject, leesHuis, standaardHuis } from "@/lib/bouw/huizen";
import {
  leesBouwstand,
  leesPlan,
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
      bouw_huizen: [TESTHUIS, { ...TESTHUIS, id: 2, naam: "Tweede huis", volgorde: 1 }],
      bouw_gebouwen: metHuis([
        { id: 5, naam: "Woning", volgorde: 0 },
        { id: 6, naam: "Bijgebouw", volgorde: 1 },
      ]),
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 5, naam: "Verdieping", volgorde: 1, vloerpeil_m: "2.950", verdiepingshoogte_m: "2.800", plafondhoogte_m: null },
        { id: 2, gebouw_id: 5, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: "0.000", verdiepingshoogte_m: "2.950", plafondhoogte_m: "2.600" },
        { id: 3, gebouw_id: 6, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null },
      ],
      bouw_plannen: metHuis([
        { id: 10, titel: "Grondplan gelijkvloers", soort: "grondplan", gebouw_id: 5, verdieping_id: 2, bladcode: null, opmerking: null },
        { id: 11, titel: "Gevels", soort: "gevel", gebouw_id: 5, verdieping_id: null, bladcode: null, opmerking: null },
      ]),
      bouw_planversies: [
        { id: 20, plan_id: 10, bestand_id: 30, label: "v1", pagina: 1, created_at: "2026-09-01T10:00:00Z" },
        { id: 21, plan_id: 10, bestand_id: 31, label: "v2", pagina: 1, created_at: "2026-09-20T10:00:00Z" },
        { id: 22, plan_id: 11, bestand_id: 31, label: "v2", pagina: 3, created_at: "2026-09-20T10:00:00Z" },
      ],
      bouw_bestanden: metHuis([
        { id: 30, pad: "plannen/a.pdf", status: "klaar", grootte_bytes: 1000, created_at: "2026-09-01T09:00:00Z" },
        { id: 31, pad: "plannen/b.pdf", status: "klaar", grootte_bytes: 2500, created_at: "2026-09-20T09:00:00Z" },
        { id: 32, pad: "plannen/c.pdf", status: "wacht", grootte_bytes: 99, created_at: "2026-10-01T06:00:00Z" },
        { id: 33, pad: "plannen/d.pdf", status: "wacht", grootte_bytes: 99, created_at: "2026-10-02T09:00:00Z" },
      ]),
      bouw_partijen: metHuis([{ id: 40, soort: "architect", naam: "Architect" }]),
      bouw_omzettingen: [{ id: 50, planversie_id: 20 }],
      bouw_ruimtes: [
        { id: 60, verdieping_id: 2, oppervlakte_m2: "25.250" },
        { id: 61, verdieping_id: 2, oppervlakte_m2: "12.250" },
      ],
    },
    fouten,
  );
  nep.client = db.client;
}

beforeEach(() => begin());

describe("het project", () => {
  it("bewaart naam en adres bij het huis, en wist wat leeg is", async () => {
    await bewaarProject(1, { projectnaam: "Ons huis", adres: "Ergens 1" });
    expect(await leesHuis(1)).toMatchObject({ projectnaam: "Ons huis", adres: "Ergens 1" });

    await bewaarProject(1, { projectnaam: "Ons nieuwe huis", adres: null });
    expect(await leesHuis(1)).toMatchObject({ projectnaam: "Ons nieuwe huis", adres: null });
    // Het andere huis blijft ongemoeid.
    expect(db.tabellen.bouw_huizen.map((huis) => [huis.id, huis.projectnaam, huis.adres])).toEqual([
      [1, "Ons nieuwe huis", null],
      [2, null, null],
    ]);
  });
});

describe("gebouwen", () => {
  it("vindt een gebouw los van hoofdletters en witruimte", async () => {
    expect(await zoekOfMaakGebouw(1, "  woning ")).toBe(5);
    expect(await zoekOfMaakGebouw(1, "BIJGEBOUW")).toBe(6);
    expect(db.tabellen.bouw_gebouwen).toHaveLength(2);
  });

  it("maakt een nieuw gebouw achteraan", async () => {
    const id = await zoekOfMaakGebouw(1, "Carport");
    expect((await lijstGebouwen(1)).map((g) => [g.id, g.naam, g.volgorde])).toEqual([
      [5, "Woning", 0],
      [6, "Bijgebouw", 1],
      [id, "Carport", 2],
    ]);
  });

  it("weigert een gebouw te verwijderen waar nog iets aan hangt", async () => {
    begin({ "bouw_gebouwen:delete": { code: "23503", message: "violates foreign key constraint" } });
    await expect(verwijderGebouw(1, 5)).rejects.toThrow("Aan dit gebouw hangen nog verdiepingen of plannen");
  });
});

describe("verdiepingen", () => {
  it("leest ze in volgorde, met getallen in plaats van tekst", async () => {
    const verdiepingen = await lijstVerdiepingen(1);
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
    await expect(voegVerdiepingToe(1, { ...nieuw, gebouw_id: 5 })).rejects.toThrow(
      'Er bestaat al een verdieping "Gelijkvloers" in dit gebouw.',
    );
    // In een ander gebouw mag dezelfde naam wel.
    expect(await voegVerdiepingToe(1, { ...nieuw, naam: "Zolder", gebouw_id: 6 })).toBeGreaterThan(0);
  });

  it("neemt de grondplannen mee naar een ander gebouw", async () => {
    await wijzigVerdieping(1, 2, { gebouw_id: 6, naam: "Kelder" });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === 10)?.gebouw_id).toBe(6);
    expect(db.tabellen.bouw_plannen.find((p) => p.id === 11)?.gebouw_id).toBe(5);
  });

  it("weigert een verdieping te verwijderen waar nog een plan aan hangt", async () => {
    begin({ "bouw_verdiepingen:delete": { code: "23503", message: "violates foreign key constraint" } });
    await expect(verwijderVerdieping(1, 2)).rejects.toThrow("Aan deze verdieping hangt nog een plan");
  });
});

describe("plannen en versies", () => {
  it("geeft elk plan zijn eigen versies, oudste eerst", async () => {
    const plannen = await lijstPlannen(1);
    expect(plannen.map((p) => p.titel)).toEqual(["Gevels", "Grondplan gelijkvloers"]);
    expect(plannen[1].versies.map((v) => v.label)).toEqual(["v1", "v2"]);
    expect((await leesPlan(1, 10))?.versies).toHaveLength(2);
    expect(await leesPlan(1, 999)).toBeNull();
  });

  it("hangt een plan op een verdieping aan het gebouw van die verdieping", async () => {
    const id = await voegPlanToe(1, {
      titel: "Grondplan",
      soort: "grondplan",
      gebouw_id: 5,
      verdieping_id: 3,
      opmerking: null,
      bladcode: "BA_bijgebouw_P_N_1",
    });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === id)).toMatchObject({ gebouw_id: 6, bladcode: "BA_bijgebouw_P_N_1" });

    // Wie het plan wijzigt zonder bladcode, laat die staan.
    await wijzigPlan(1, id, { titel: "Grondplan bijgebouw", soort: "grondplan", gebouw_id: null, verdieping_id: 3, opmerking: null });
    expect(db.tabellen.bouw_plannen.find((p) => p.id === id)).toMatchObject({ gebouw_id: 6, bladcode: "BA_bijgebouw_P_N_1" });

    await expect(
      voegPlanToe(1, { titel: "X", soort: "grondplan", gebouw_id: null, verdieping_id: 99, opmerking: null }),
    ).rejects.toThrow("Die verdieping bestaat niet meer.");
  });

  it("weigert een tweede versie met hetzelfde label", async () => {
    await expect(
      voegVersieToe(1, { plan_id: 10, bestand_id: 30, label: "v2", pagina: 1, datum: null, opmerking: null }),
    ).rejects.toThrow('Dit plan heeft al een versie "v2".');
  });

  it("geeft bij het verwijderen van een plan zijn bestanden terug, om op te ruimen", async () => {
    expect(await verwijderPlan(1, 10)).toEqual([30, 31]);
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
    const stand = await leesBouwstand(await standaardHuis());
    expect(stand.verdiepingen).toBe(3);
    expect(stand.plannen).toEqual([
      { id: 11, titel: "Gevels", versies: 1, soort: "gevel", omgezet: "geen" },
      { id: 10, titel: "Grondplan gelijkvloers", versies: 2, soort: "grondplan", omgezet: "oud" },
    ]);
    expect(stand.ruimtes).toEqual({ aantal: 2, oppervlakte: 37.5 });
    expect(stand.partijen.map((partij) => partij.soort)).toEqual(["architect"]);
    // Enkel bestanden die klaar zijn tellen mee.
    expect(stand.bytes).toBe(3500);
  });
});
