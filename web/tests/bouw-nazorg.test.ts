import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { sleutelVan } from "@/lib/bouw/invoer";
import { plusMaanden } from "@/lib/bouw/kalender";
import {
  STANDAARDONDERHOUD,
  eindeVan,
  garantiestand,
  intervalTekst,
  nazorgherinneringen,
  nazorgstand,
  onderhoudsstand,
  type Garantie,
  type Onderhoud,
} from "@/lib/bouw/nazorg";
import {
  leesOnderhoud,
  lijstBeurten,
  registreerBeurt,
  verwijderBeurt,
  verwijderDocument,
  voegDocumentToe,
  voegOnderhoudToe,
} from "@/lib/bouw/nazorg-opslag";
import { ruimOngebruikteBestandenOp } from "@/lib/bouw/opladen";
import { takenVoorBouw } from "@/lib/bouw/taken";

const onderhoud = (id: number, wat: string, interval_maanden: number, laatst_gedaan: string | null, partij_id: number | null = null): Onderhoud => ({
  id,
  wat,
  interval_maanden,
  laatst_gedaan,
  partij_id,
  opmerking: null,
});

const garantie = (id: number, wat: string, begin: string, duur_maanden: number, partij_id: number | null = null): Garantie => ({
  id,
  wat,
  partij_id,
  begin,
  duur_maanden,
  document_id: null,
  opmerking: null,
});

describe("maanden bijtellen", () => {
  it("houdt dezelfde dag, of de laatste dag van een kortere maand", () => {
    expect(plusMaanden("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMaanden("2028-01-31", 1)).toBe("2028-02-29");
    expect(plusMaanden("2024-02-29", 12)).toBe("2025-02-28");
    expect(plusMaanden("2026-11-15", 3)).toBe("2027-02-15");
    expect(plusMaanden("2026-03-31", -1)).toBe("2026-02-28");
    expect(plusMaanden("2026-10-02", 120)).toBe("2036-10-02");
  });
});

describe("garanties", () => {
  it("rekent het einde uit en valt op in de laatste 90 dagen", () => {
    const jaar = { begin: "2026-01-01", duur_maanden: 12 };
    expect(eindeVan(jaar)).toBe("2027-01-01");
    expect(garantiestand(jaar, "2026-10-02")).toEqual({ einde: "2027-01-01", dagen: 91, stand: "loopt" });
    expect(garantiestand(jaar, "2026-10-03")).toMatchObject({ dagen: 90, stand: "vervalt" });
    expect(garantiestand(jaar, "2027-01-01")).toMatchObject({ dagen: 0, stand: "vervalt" });
    expect(garantiestand(jaar, "2027-01-02")).toMatchObject({ dagen: -1, stand: "vervallen" });
    expect(eindeVan({ begin: "2026-10-02", duur_maanden: 120 })).toBe("2036-10-02");
  });
});

describe("onderhoud", () => {
  it("weet wanneer het weer aan de beurt is", () => {
    const filters = { interval_maanden: 6, laatst_gedaan: "2026-04-02" };
    expect(onderhoudsstand(filters, "2026-09-01")).toEqual({ volgende: "2026-10-02", dagen: 31, stand: "later" });
    expect(onderhoudsstand(filters, "2026-09-02")).toMatchObject({ dagen: 30, stand: "binnenkort" });
    expect(onderhoudsstand(filters, "2026-10-02")).toMatchObject({ dagen: 0, stand: "binnenkort" });
    expect(onderhoudsstand(filters, "2026-10-03")).toMatchObject({ dagen: -1, stand: "te_laat" });
    // Wat nog nooit gebeurde, moet nu.
    expect(onderhoudsstand({ interval_maanden: 12, laatst_gedaan: null }, "2026-10-02")).toEqual({
      volgende: "2026-10-02",
      dagen: 0,
      stand: "binnenkort",
    });
  });

  it("zegt hoe vaak in gewone woorden", () => {
    expect(intervalTekst(1)).toBe("elke maand");
    expect(intervalTekst(3)).toBe("om de 3 maanden");
    expect(intervalTekst(6)).toBe("elk half jaar");
    expect(intervalTekst(12)).toBe("elk jaar");
    expect(intervalTekst(18)).toBe("om de 18 maanden");
    expect(intervalTekst(24)).toBe("om de 2 jaar");
  });

  it("heeft een standaardlijst zonder dubbels, binnen wat de databank toelaat", () => {
    expect(new Set(STANDAARDONDERHOUD.map((item) => sleutelVan(item.wat))).size).toBe(STANDAARDONDERHOUD.length);
    for (const item of STANDAARDONDERHOUD) {
      expect(item.interval_maanden).toBeGreaterThanOrEqual(1);
      expect(item.interval_maanden).toBeLessThanOrEqual(240);
    }
  });
});

describe("de herinneringen van de bot", () => {
  const partijnaam = (partijId: number | null) => (partijId === 7 ? "Installateur Voorbeeld" : null);
  const filters = onderhoud(1, "Filters van de ventilatie vervangen", 6, "2026-04-09");
  const nooit = onderhoud(2, "Warmtepomp: onderhoud", 12, null, 7);
  const warmtepomp = onderhoud(3, "Warmtepomp: onderhoud", 12, "2025-10-09", 7);
  const opDeWarmtepomp = garantie(5, "de warmtepomp", "2024-12-01", 24, 7);

  it("herinnert een week vooraf, en een garantie twee maanden vooraf", () => {
    expect(nazorgherinneringen([filters, nooit, warmtepomp], [opDeWarmtepomp], partijnaam, "2026-10-02")).toEqual([
      {
        sleutel: "onderhoud:1:2026-10-09:7",
        tekst: "🧰 Filters van de ventilatie vervangen: over 7 dagen (9 okt).",
        pad: "/bouw/dossier/onderhoud",
      },
      {
        sleutel: "onderhoud:3:2026-10-09:7",
        tekst: "🧰 Warmtepomp: onderhoud (Installateur Voorbeeld): over 7 dagen (9 okt).",
        pad: "/bouw/dossier/onderhoud",
      },
      {
        sleutel: "garantie:5:2026-12-01:60",
        tekst: "🛡️ De garantie op de warmtepomp (Installateur Voorbeeld) loopt af over 2 maanden (1 dec). Is er nog iets te melden?",
        pad: "/bouw/dossier/garanties",
      },
    ]);
  });

  it("herinnert op de dag zelf, en daarna elke dertig dagen", () => {
    const tekst = (dag: string) => nazorgherinneringen([filters], [], partijnaam, dag).map((h) => h.tekst);
    expect(tekst("2026-10-08")).toEqual([]);
    expect(tekst("2026-10-09")).toEqual(["🧰 Vandaag: Filters van de ventilatie vervangen."]);
    expect(tekst("2026-10-10")).toEqual([]);
    expect(tekst("2026-11-08")).toEqual(["🧰 Filters van de ventilatie vervangen moest 9 okt gebeuren, 30 dagen te laat."]);
    expect(tekst("2026-12-08")).toHaveLength(1);
  });

  it("verwittigt een garantie een maand en een week vooraf, en niet daartussen", () => {
    const dagen = (dag: string) => nazorgherinneringen([], [opDeWarmtepomp], partijnaam, dag).map((h) => h.sleutel);
    expect(dagen("2026-11-01")).toEqual(["garantie:5:2026-12-01:30"]);
    expect(dagen("2026-11-24")).toEqual(["garantie:5:2026-12-01:7"]);
    expect(dagen("2026-11-25")).toEqual([]);
    expect(dagen("2026-12-02")).toEqual([]);
  });

  it("zwijgt over onderhoud dat nog nooit gebeurde", () => {
    expect(nazorgherinneringen([nooit], [], partijnaam, "2026-10-02")).toEqual([]);
  });
});

describe("nog te doen", () => {
  const klaar = {
    projectnaam: "Ons huis",
    verdiepingen: 2,
    plannen: [{ id: 1, titel: "Gelijkvloers", versies: 1, soort: "grondplan" as const, omgezet: "laatste" as const }],
    partijen: [{ soort: "architect" as const }],
  };

  it("toont het onderhoud van deze week en de garanties van deze maand", () => {
    const nazorg = nazorgstand(
      [
        onderhoud(1, "Rookmelders testen", 6, "2026-04-05"),
        onderhoud(2, "Dakgoten en afvoeren reinigen", 12, "2025-09-22"),
        onderhoud(3, "Sifons reinigen", 6, "2026-04-22"),
        onderhoud(4, "Warmtepomp: onderhoud", 12, null),
      ],
      [
        garantie(1, "de dakwerken", "2016-10-22", 120),
        garantie(2, "de ramen", "2024-11-16", 24),
        garantie(3, "de keuken", "2024-09-27", 24),
      ],
      "2026-10-02",
    );
    expect(nazorg.onderhoud.map((item) => [item.onderhoudId, item.dagen])).toEqual([
      [1, 3],
      [2, -10],
      [3, 20],
    ]);
    expect(nazorg.garanties.map((item) => [item.garantieId, item.dagen])).toEqual([
      [1, 20],
      [2, 45],
      [3, -5],
    ]);
    expect(takenVoorBouw({ ...klaar, ...nazorg })).toEqual([
      { tekst: "Dakgoten en afvoeren reinigen: 10 dagen te laat.", link: "/bouw/dossier/onderhoud", knop: "Noteren" },
      { tekst: "Rookmelders testen: over 3 dagen.", link: "/bouw/dossier/onderhoud", knop: "Noteren" },
      {
        tekst: "De garantie op de dakwerken loopt af over 3 weken: meld nog wat niet in orde is.",
        link: "/bouw/dossier/garanties",
        knop: "Bekijken",
      },
    ]);
  });
});

describe("het dossier in de databank", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_onderhoud: [],
      bouw_onderhoudsbeurten: [],
      bouw_documenten: [],
      bouw_bestanden: metHuis([
        { id: 90, pad: "documenten/keuring.pdf", doel: "document", status: "klaar", oorspronkelijke_naam: "keuring.pdf" },
      ]),
    });
    nep.client = db.client;
  });

  it("schuift laatst gedaan enkel vooruit, en bewaart elke beurt", async () => {
    const id = await voegOnderhoudToe(
      1,
      { wat: "Rookmelders testen", interval_maanden: 6, laatst_gedaan: "2026-09-01", partij_id: null, opmerking: null },
      "Jan",
    );
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-08-01", "Jan", "vergeten te noteren");
    expect(await leesOnderhoud(1, id)).toMatchObject({ laatst_gedaan: "2026-09-01" });
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-10-02", "Sandra", null);
    expect(await leesOnderhoud(1, id)).toMatchObject({ laatst_gedaan: "2026-10-02" });
    // De datum van bij het toevoegen is ook een beurt.
    expect((await lijstBeurten(1)).map((beurt) => [beurt.datum, beurt.door, beurt.opmerking])).toEqual([
      ["2026-10-02", "Sandra", null],
      ["2026-09-01", "Jan", null],
      ["2026-08-01", "Jan", "vergeten te noteren"],
    ]);
  });

  it("telt een dubbele tik één keer", async () => {
    const id = await voegOnderhoudToe(1, { wat: "Sifons reinigen", interval_maanden: 6, laatst_gedaan: null, partij_id: null, opmerking: null });
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-10-02", "Jan", "met soda");
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-10-02", "Jan", null);
    expect((await lijstBeurten(1)).map((beurt) => [beurt.datum, beurt.opmerking])).toEqual([["2026-10-02", "met soda"]]);
  });

  it("schrapt een verkeerde beurt, en laatst gedaan wordt weer de vorige", async () => {
    const id = await voegOnderhoudToe(1, { wat: "Dakgoten reinigen", interval_maanden: 12, laatst_gedaan: "2025-10-01", partij_id: null, opmerking: null });
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-10-02", "Jan", null);
    const [verkeerd, eerste] = await lijstBeurten(1);
    expect(await verwijderBeurt(1, verkeerd.id)).toBe(id);
    expect(await leesOnderhoud(1, id)).toMatchObject({ laatst_gedaan: "2025-10-01" });
    await verwijderBeurt(1, eerste.id);
    expect(await leesOnderhoud(1, id)).toMatchObject({ laatst_gedaan: null });
    expect(await verwijderBeurt(1, eerste.id)).toBeNull();
  });

  it("maakt van de eerste beurt de laatste", async () => {
    const id = await voegOnderhoudToe(1, { wat: "Sifons reinigen", interval_maanden: 6, laatst_gedaan: null, partij_id: null, opmerking: null });
    await registreerBeurt(1, (await leesOnderhoud(1, id))!, "2026-09-15", "Jan", null);
    expect(await leesOnderhoud(1, id)).toMatchObject({ laatst_gedaan: "2026-09-15" });
  });

  it("houdt een PDF in de opslag zolang het dossier ze gebruikt", async () => {
    const id = await voegDocumentToe(1, {
      bestand_id: 90, soort: "arei", titel: "Keuringsverslag", partij_id: null, datum: "2026-09-30", opmerking: null, door: "Jan",
    });
    await ruimOngebruikteBestandenOp(1, [90]);
    expect(db.verwijderd).toEqual([]);
    expect(await verwijderDocument(1, id)).toBe(90);
    await ruimOngebruikteBestandenOp(1, [90]);
    expect(db.verwijderd).toEqual(["documenten/keuring.pdf"]);
  });
});
