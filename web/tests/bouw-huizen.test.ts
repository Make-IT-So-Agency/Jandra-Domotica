import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import {
  archiveerHuis,
  heeftGegevens,
  lijstHuizen,
  schoneHuisnaam,
  verwijderHuis,
  voegHuisToe,
  wijzigHuis,
} from "@/lib/bouw/huizen";
import { heeftOnderdeel, nietVoorSoort, onderdeelVan, rechtenBinnenSoort, rechtenVoorSoort } from "@/lib/bouw/onderdelen";
import { zoekOfMaakGebouw } from "@/lib/bouw/opslag";

let db: ReturnType<typeof nepSupabase>;

beforeEach(() => {
  db = nepSupabase({
    bouw_huizen: [{ ...TESTHUIS }],
    bouw_gebouwen: metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]),
    bouw_partijen: [],
    bouw_bestanden: [],
    bouw_inzendingen: [],
  });
  nep.client = db.client;
});

describe("de naam van een huis", () => {
  it("houdt een naam van 1 tot 60 tekens, zonder spaties te veel", () => {
    expect(schoneHuisnaam("  Huidig   huis ")).toBe("Huidig huis");
    expect(schoneHuisnaam("")).toBeNull();
    expect(schoneHuisnaam("   ")).toBeNull();
    expect(schoneHuisnaam("x".repeat(60))).toHaveLength(60);
    expect(schoneHuisnaam("x".repeat(61))).toBeNull();
    expect(schoneHuisnaam(null)).toBeNull();
  });
});

describe("huizen beheren", () => {
  it("zet een nieuw huis achteraan, zonder gebouw vooraf", async () => {
    const id = await voegHuisToe({ naam: "Huidig huis", soort: "bestaand" });
    expect(db.tabellen.bouw_huizen.find((huis) => huis.id === id)).toMatchObject({ naam: "Huidig huis", soort: "bestaand", volgorde: 1 });
    expect(db.tabellen.bouw_gebouwen.filter((gebouw) => gebouw.huis_id === id)).toEqual([]);
    // De Woning komt er pas als ze nodig is, en dan in dat huis.
    const woning = await zoekOfMaakGebouw(id, "Woning");
    expect(db.tabellen.bouw_gebouwen.find((gebouw) => gebouw.id === woning)).toMatchObject({ huis_id: id, naam: "Woning" });
  });

  it("wijzigt de naam, het soort en de volgorde", async () => {
    await wijzigHuis(1, { naam: "De nieuwbouw", soort: "verbouwing", volgorde: 5 });
    expect(db.tabellen.bouw_huizen[0]).toMatchObject({ naam: "De nieuwbouw", soort: "verbouwing", volgorde: 5 });
    await expect(wijzigHuis(99, { naam: "Weg", soort: "bestaand", volgorde: 0 })).rejects.toThrow("bestaat niet meer");
  });

  it("archiveert en zet terug: een gearchiveerd huis valt uit de lijst", async () => {
    await voegHuisToe({ naam: "Huidig huis", soort: "bestaand" });
    await archiveerHuis(1, true);
    expect((await lijstHuizen()).map((huis) => huis.naam)).toEqual(["Huidig huis"]);
    expect((await lijstHuizen({ ookGearchiveerd: true })).map((huis) => huis.naam)).toEqual(["Nieuwbouw", "Huidig huis"]);
    await archiveerHuis(1, false);
    expect((await lijstHuizen()).map((huis) => huis.naam)).toEqual(["Nieuwbouw", "Huidig huis"]);
  });

  it("verwijdert enkel een leeg huis, en ruimt eerst zijn bestanden op", async () => {
    // Huis 1 heeft een gebouw: niet leeg.
    expect(await heeftGegevens(1)).toBe(true);
    await expect(verwijderHuis(1)).rejects.toThrow("Archiveer het");
    expect(db.tabellen.bouw_huizen).toHaveLength(1);

    // Een nieuw huis met enkel een upload die nooit afgerond werd: dat is leeg.
    const id = await voegHuisToe({ naam: "Vergissing", soort: "bestaand" });
    db.tabellen.bouw_bestanden.push({ id: 70, huis_id: id, pad: "plannen/half.pdf", status: "wacht", opgeladen_door: "jan" });
    expect(await heeftGegevens(id)).toBe(false);
    await verwijderHuis(id);
    expect(db.tabellen.bouw_huizen.map((huis) => huis.id)).toEqual([1]);
    expect(db.tabellen.bouw_bestanden).toEqual([]);
    expect(db.verwijderd).toEqual(["plannen/half.pdf"]);
  });

  it("vindt ook gegevens die niet bij een gebouw horen, zoals een partij", async () => {
    const id = await voegHuisToe({ naam: "Huidig huis", soort: "bestaand" });
    db.tabellen.bouw_partijen.push(...metHuis([{ id: 5, soort: "aannemer", naam: "Loodgieter" }], id));
    expect(await heeftGegevens(id)).toBe(true);
    await expect(verwijderHuis(id)).rejects.toThrow("Archiveer het");
  });
});

describe("wat elk soort huis heeft", () => {
  it("geeft een bestaand huis geen keuzes, planning of werf", () => {
    expect(heeftOnderdeel("nieuwbouw", "werf")).toBe(true);
    expect(heeftOnderdeel("verbouwing", "planning")).toBe(true);
    expect(heeftOnderdeel("bestaand", "keuzes")).toBe(false);
    expect(heeftOnderdeel("bestaand", "werf")).toBe(false);
    expect(nietVoorSoort({ naam: "Huidig huis", soort: "nieuwbouw" }, "werf")).toBeNull();
    expect(nietVoorSoort({ naam: "Huidig huis", soort: "bestaand" }, "werf")).toContain("Huidig huis is een bestaand huis");
  });

  it("weet bij welk onderdeel een adres hoort", () => {
    expect(onderdeelVan("/werf/dagboek")).toBe("werf");
    expect(onderdeelVan("/keuzes")).toBe("keuzes");
    expect(onderdeelVan("/planning?item=3#wijzigen")).toBe("planning");
    expect(onderdeelVan("/geld")).toBeNull();
    expect(onderdeelVan("")).toBeNull();
  });

  it("geeft een link enkel de rechten die bij het soort passen", () => {
    expect(rechtenVoorSoort("bestaand")).toEqual(["plannen", "inzenden", "offertes", "facturen", "wensenlijst"]);
    expect(rechtenVoorSoort("verbouwing")).toContain("oplevering");
    expect(rechtenBinnenSoort(["planning", "plannen", "oplevering"], "bestaand")).toEqual(["plannen"]);
  });
});
