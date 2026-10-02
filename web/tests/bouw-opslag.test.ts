import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import {
  bewaarProject,
  leesBouwstand,
  leesPlan,
  leesProject,
  lijstPlannen,
  lijstVerdiepingen,
  verlatenUploads,
  verwijderPlan,
  verwijderVerdieping,
  voegVerdiepingToe,
  voegVersieToe,
  wordtGebruikt,
} from "@/lib/bouw/opslag";

let db: ReturnType<typeof nepSupabase>;

function begin(fouten = {}) {
  db = nepSupabase(
    {
      bouw_verdiepingen: [
        { id: 1, naam: "Verdieping", volgorde: 1, vloerpeil_m: "2.950", verdiepingshoogte_m: "2.800", plafondhoogte_m: null },
        { id: 2, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: "0.000", verdiepingshoogte_m: "2.950", plafondhoogte_m: "2.600" },
      ],
      bouw_plannen: [
        { id: 10, titel: "Grondplan gelijkvloers", soort: "grondplan", verdieping_id: 2, opmerking: null },
        { id: 11, titel: "Gevels", soort: "gevel", verdieping_id: null, opmerking: null },
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

describe("verdiepingen", () => {
  it("leest ze in volgorde, met getallen in plaats van tekst", async () => {
    const verdiepingen = await lijstVerdiepingen();
    expect(verdiepingen.map((v) => v.naam)).toEqual(["Gelijkvloers", "Verdieping"]);
    expect(verdiepingen[1].vloerpeil_m).toBe(2.95);
    expect(verdiepingen[1].plafondhoogte_m).toBeNull();
  });

  it("zegt in mensentaal dat een naam al bestaat", async () => {
    await expect(
      voegVerdiepingToe({ naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null }),
    ).rejects.toThrow('Er bestaat al een verdieping "Gelijkvloers".');
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
    expect(stand.verdiepingen).toBe(2);
    expect(stand.plannen).toEqual([
      { id: 11, titel: "Gevels", versies: 1 },
      { id: 10, titel: "Grondplan gelijkvloers", versies: 2 },
    ]);
    expect(stand.partijen.map((partij) => partij.soort)).toEqual(["architect"]);
    // Enkel bestanden die klaar zijn tellen mee.
    expect(stand.bytes).toBe(3500);
  });
});
