import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import {
  STANDAARDPOSTEN,
  CATEGORIEEN_POST,
  bedragUitInstelling,
  factuurherinneringen,
  factuurstand,
  kasplanning,
  kortBedrag,
  kredietstand,
  mooieGrens,
  openFacturen,
  postVoorstel,
  poststanden,
  totalen,
  vergelijkOffertes,
  vervaldagVan,
  type Factuur,
  type Meerwerk,
  type Offerte,
  type Post,
} from "@/lib/bouw/geld";
import {
  boekInzendingIn,
  kiesOfferte,
  lijstOffertes,
  lijstVennootschappen,
  verwijderPost,
  voegFactuurToe,
  voegOfferteToe,
  voegPostToe,
  zetBetaald,
  zetMeerwerkStatus,
  voegMeerwerkToe,
  lijstMeerwerken,
  lijstFacturen,
} from "@/lib/bouw/geld-opslag";
import { maakGeldExcel } from "@/lib/bouw/geld-excel";
import { leesInzending } from "@/lib/bouw/links";

const post = (id: number, raming: number | null, over: Partial<Post> = {}): Post => ({
  id, naam: `post ${id}`, categorie: "werken", raming, partij_id: null, planning_id: null, opmerking: null, ...over,
});
const offerte = (id: number, postId: number, bedrag: number, status: Offerte["status"] = "ontvangen"): Offerte => ({
  id, post_id: postId, partij_id: null, omschrijving: null, bedrag, datum: null, geldig_tot: null, bestand_id: null, status, opmerking: null,
});
const meerwerk = (id: number, postId: number, bedrag: number, status: Meerwerk["status"]): Meerwerk => ({
  id, post_id: postId, omschrijving: "iets", bedrag, datum: "2026-10-01", status,
});
const factuur = (id: number, postId: number | null, bedrag: number, over: Partial<Factuur> = {}): Factuur => ({
  id, post_id: postId, partij_id: null, nummer: null, omschrijving: null, bedrag, factuurdatum: "2026-09-01", vervaldag: null,
  betaald_op: null, bestand_id: null, vennootschap_id: null, opmerking: null, ...over,
});

describe("de stand per post", () => {
  it("telt de gekozen offerte, de aanvaarde meerwerken en de facturen", () => {
    const [ruwbouw] = poststanden(
      [post(1, 100_000)],
      [offerte(1, 1, 95_000, "gekozen"), offerte(2, 1, 110_000, "afgewezen")],
      [meerwerk(1, 1, 5_000, "aanvaard"), meerwerk(2, 1, -2_000, "aanvaard"), meerwerk(3, 1, 10_000, "voorgesteld")],
      [factuur(1, 1, 30_000, { betaald_op: "2026-09-20" }), factuur(2, 1, 20_000)],
    );
    expect(ruwbouw).toMatchObject({
      meerwerk: 3_000,
      toegekend: 98_000,
      verwacht: 98_000,
      gefactureerd: 50_000,
      betaald: 30_000,
      open: 20_000,
      nogTeFactureren: 48_000,
      afwijking: -2_000,
    });
  });

  it("zonder offerte telt de raming, en wat al gefactureerd is telt altijd", () => {
    const [zonder, meer] = poststanden(
      [post(1, 10_000), post(2, 1_000)],
      [],
      [meerwerk(1, 1, 1_000, "aanvaard")],
      [factuur(1, 2, 1_500)],
    );
    expect(zonder).toMatchObject({ toegekend: null, verwacht: 11_000, afwijking: null });
    expect(meer).toMatchObject({ verwacht: 1_500, nogTeFactureren: 0 });
  });

  it("telt alles samen, ook een factuur zonder post", () => {
    const standen = poststanden([post(1, 10_000)], [], [], [factuur(1, 1, 4_000, { betaald_op: "2026-09-02" })]);
    expect(totalen(standen, [factuur(1, 1, 4_000, { betaald_op: "2026-09-02" }), factuur(2, null, 500)])).toEqual({
      raming: 10_000,
      verwacht: 10_500,
      gefactureerd: 4_500,
      betaald: 4_000,
      open: 500,
      nogTeFactureren: 6_000,
    });
  });
});

describe("facturen en krediet", () => {
  it("kent de stand van een factuur, met 30 dagen als er geen vervaldag is", () => {
    expect(vervaldagVan({ factuurdatum: "2026-09-01", vervaldag: null })).toBe("2026-10-01");
    expect(factuurstand(factuur(1, null, 10, { betaald_op: "2026-09-05" }), "2026-12-01")).toBe("betaald");
    expect(factuurstand(factuur(1, null, 10), "2026-10-02")).toBe("te_laat");
    expect(factuurstand(factuur(1, null, 10), "2026-09-28")).toBe("binnenkort");
    expect(factuurstand(factuur(1, null, 10), "2026-09-10")).toBe("open");
  });

  it("weet wat er van het krediet opgenomen is, en wat uit eigen middelen kwam", () => {
    expect(kredietstand([{ bedrag: 50_000 }, { bedrag: 25_000 }], [factuur(1, null, 90_000, { betaald_op: "2026-09-01" })], 300_000, 80_000)).toEqual({
      krediet: 300_000,
      opgenomen: 75_000,
      beschikbaar: 225_000,
      eigenInbreng: 80_000,
      eigenBetaald: 15_000,
    });
  });

  it("herinnert drie dagen ervoor, op de dag zelf en de dag erna", () => {
    const naam = (id: number | null) => (id === 4 ? "Architectenbureau Voorbeeld" : null);
    const f = factuur(7, null, 2_420, { nummer: "2026-031", partij_id: 4, vervaldag: "2026-10-05" });
    expect(factuurherinneringen([f], naam, "2026-10-02").map((h) => h.tekst)).toEqual([
      "💶 Factuur 2026-031 van Architectenbureau Voorbeeld (€ 2.420,00): betalen over 3 dagen (tegen 5 okt).",
    ]);
    expect(factuurherinneringen([f], naam, "2026-10-03")).toEqual([]);
    expect(factuurherinneringen([f], naam, "2026-10-05")[0].tekst).toContain("betalen vandaag.");
    expect(factuurherinneringen([f], naam, "2026-10-06")[0]).toMatchObject({ sleutel: "factuur:7:2026-10-05:-1" });
    expect(factuurherinneringen([{ ...f, betaald_op: "2026-10-01" }], naam, "2026-10-02")).toEqual([]);
    expect(factuurherinneringen([{ ...f, bedrag: -100 }], naam, "2026-10-02")).toEqual([]);
  });
});

describe("open facturen en offertes vergelijken", () => {
  it("zet de open facturen op vervaldag, zonder betaalde facturen of creditnota's", () => {
    const facturen = [
      factuur(1, null, 500, { vervaldag: "2026-10-20" }),
      factuur(2, null, 300, { factuurdatum: "2026-08-15" }), // vervalt 14 sep
      factuur(3, null, 900, { betaald_op: "2026-09-01" }),
      factuur(4, null, -200),
    ];
    expect(openFacturen(facturen, "2026-10-02").map((o) => [o.factuur.id, o.vervaldag, o.dagen])).toEqual([
      [2, "2026-09-14", -18],
      [1, "2026-10-20", 18],
    ]);
  });

  it("vergelijkt elke offerte met de goedkoopste en met de raming", () => {
    const vergeleken = vergelijkOffertes([offerte(1, 1, 95_000), offerte(2, 1, 110_000)], 100_000);
    expect(vergeleken.get(1)).toEqual({ tovGoedkoopste: 0, tovRaming: -5 });
    expect(vergeleken.get(2)).toEqual({ tovGoedkoopste: 15_000, tovRaming: 10 });
    expect(vergelijkOffertes([offerte(1, 1, 95_000)], null).get(1)).toEqual({ tovGoedkoopste: 0, tovRaming: null });
  });

  it("stelt de post voor van de partij die een offerte of factuur instuurt", () => {
    const posten = [post(1, null, { partij_id: 4 }), post(2, null), post(3, null, { partij_id: 5 }), post(6, null, { partij_id: 5 })];
    const offertes = [offerte(1, 2, 1000, "gekozen"), offerte(2, 3, 900, "afgewezen")].map((o, i) => ({ ...o, partij_id: [4, 5][i] }));
    // Een factuur hoort bij de post waarvoor we die partij kozen.
    expect(postVoorstel(4, "factuur", posten, offertes)).toBe(2);
    // Een offerte bij de enige post van die partij.
    expect(postVoorstel(4, "offerte", posten, offertes)).toBe(1);
    // Twee posten van dezelfde partij en geen keuze: wij kiezen zelf.
    expect(postVoorstel(5, "factuur", posten, offertes)).toBeNull();
    expect(postVoorstel(null, "offerte", posten, offertes)).toBeNull();
  });

  it("leest het krediet uit de instellingen", () => {
    expect(bedragUitInstelling("300000")).toBe(300_000);
    expect(bedragUitInstelling("")).toBeNull();
    expect(bedragUitInstelling(null)).toBeNull();
    expect(bedragUitInstelling("onzin")).toBeNull();
  });

  it("kiest een ronde grens en een korte tekst voor de as van de grafiek", () => {
    expect([0, 7, 18_000, 25_000, 41_000, 100_000].map(mooieGrens)).toEqual([1, 10, 20_000, 25_000, 50_000, 100_000]);
    expect([0, 800, 1_500, 25_000].map(kortBedrag)).toEqual(["0", "800", "1,5k", "25k"]);
  });
});

describe("de kasplanning", () => {
  it("zet betaald, te betalen en gepland per maand, met wat het krediet moet dragen", () => {
    const planning = [{ id: 9, begindatum: "2026-11-10", einddatum: "2027-01-20" }];
    const standen = poststanden(
      [post(1, 90_000, { planning_id: 9 }), post(2, 5_000)],
      [],
      [],
      [factuur(1, 1, 10_000, { betaald_op: "2026-09-15" }), factuur(2, 1, 20_000, { vervaldag: "2026-09-30" })],
    );
    const { maanden, ongepland } = kasplanning(standen, [factuur(1, 1, 10_000, { betaald_op: "2026-09-15" }), factuur(2, 1, 20_000, { vervaldag: "2026-09-30" })], planning, "2026-10-02", 25_000);
    expect(ongepland).toBe(5_000);
    expect(maanden.map((m) => [m.maand, m.betaald, m.teBetalen, m.gepland])).toEqual([
      ["2026-09", 10_000, 0, 0],
      // De vervallen factuur staat bij deze maand.
      ["2026-10", 0, 20_000, 0],
      ["2026-11", 0, 0, 20_000],
      ["2026-12", 0, 0, 20_000],
      ["2027-01", 0, 0, 20_000],
    ]);
    expect(maanden.at(-1)!.cumulatief).toBe(90_000);
    // Eerst 25.000 eigen inbreng, dan het krediet.
    expect(maanden.map((m) => m.uitKrediet)).toEqual([0, 5_000, 20_000, 20_000, 20_000]);
  });
});

describe("de gewone posten", () => {
  it("zijn uniek en hebben een gekende categorie", () => {
    expect(new Set(STANDAARDPOSTEN.map((p) => p.naam)).size).toBe(STANDAARDPOSTEN.length);
    for (const p of STANDAARDPOSTEN) expect(CATEGORIEEN_POST).toContain(p.categorie);
  });
});

describe("geld in de databank", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_posten: [],
      bouw_offertes: [],
      bouw_meerwerken: [],
      bouw_facturen: [],
      bouw_inzendingen: [],
      companies: [
        { id: "a1", name: "Voorbeeld BV", is_active: true },
        { id: "b2", name: "Gestopt BV", is_active: false },
      ],
    });
    nep.client = db.client;
  });

  it("kiest één offerte per post, en wijst de andere af", async () => {
    const postId = await voegPostToe({ naam: "Ruwbouw", categorie: "werken", raming: 100_000, partij_id: null, planning_id: null, opmerking: null });
    const nieuw = (bedrag: number) =>
      voegOfferteToe({ post_id: postId, partij_id: null, omschrijving: null, bedrag, datum: null, geldig_tot: null, bestand_id: null, opmerking: null });
    const a = await nieuw(95_000);
    const b = await nieuw(110_000);
    await kiesOfferte(postId, b);
    await kiesOfferte(postId, a);
    expect((await lijstOffertes(postId)).map((o) => [o.id, o.status])).toEqual([
      [a, "gekozen"],
      [b, "afgewezen"],
    ]);
    await kiesOfferte(postId, null);
    expect((await lijstOffertes(postId)).every((o) => o.status === "ontvangen")).toBe(true);
  });

  it("meerwerk aanvaarden, factuur betalen, en een post met facturen blijft staan", async () => {
    const postId = await voegPostToe({ naam: "Elektriciteit", categorie: "werken", raming: 20_000, partij_id: null, planning_id: null, opmerking: null });
    await voegMeerwerkToe({ post_id: postId, omschrijving: "Extra stopcontacten", bedrag: 450, datum: "2026-10-01", status: "voorgesteld" });
    const [meer] = await lijstMeerwerken(postId);
    expect(await zetMeerwerkStatus(meer.id, "aanvaard")).toMatchObject({ status: "aanvaard" });

    const factuurId = await voegFactuurToe({
      post_id: postId, partij_id: null, nummer: "F-1", omschrijving: null, bedrag: 6_000, factuurdatum: "2026-10-01",
      vervaldag: "2026-10-31", betaald_op: null, bestand_id: null, vennootschap_id: null, opmerking: null,
    });
    await zetBetaald(factuurId, "2026-10-02");
    expect((await lijstFacturen(postId))[0]).toMatchObject({ betaald_op: "2026-10-02", bedrag: 6_000 });
    await expect(verwijderPost(postId)).rejects.toThrow("Deze post heeft facturen");
  });

  it("boekt een ingestuurde offerte en factuur in, met hun PDF", async () => {
    const postId = await voegPostToe({ naam: "Ruwbouw", categorie: "werken", raming: 100_000, partij_id: null, planning_id: null, opmerking: null });
    db.tabellen.bouw_inzendingen = [
      { id: 1, link_id: 9, partij_id: 4, bestand_id: 70, soort: "offerte", bedrag: 95_000, nummer: null, datum: "2026-09-30", vervaldag: null, opmerking: "Volgens lastenboek", status: "nieuw", created_at: "2026-10-01T09:00:00Z" },
      { id: 2, link_id: 9, partij_id: 4, bestand_id: 71, soort: "factuur", bedrag: 9_500, nummer: "V-1", datum: null, vervaldag: "2026-10-31", opmerking: "Voorschot", status: "nieuw", created_at: "2026-10-02T09:00:00Z" },
      { id: 3, link_id: 9, partij_id: 4, bestand_id: 72, soort: "plan", bedrag: null, status: "nieuw", created_at: "2026-10-02T09:00:00Z" },
    ];

    const offerte = await boekInzendingIn((await leesInzending(1))!, postId, "Jan");
    expect(offerte.soort).toBe("offerte");
    expect((await lijstOffertes(postId))[0]).toMatchObject({ id: offerte.id, partij_id: 4, bedrag: 95_000, datum: "2026-09-30", bestand_id: 70, omschrijving: "Volgens lastenboek" });
    expect(await leesInzending(1)).toMatchObject({ status: "verwerkt", offerte_id: offerte.id, verwerkt_door: "Jan" });
    await expect(boekInzendingIn((await leesInzending(1))!, postId, "Jan")).rejects.toThrow("al verwerkt");

    // Zonder factuurdatum telt de dag van insturen.
    const factuur = await boekInzendingIn((await leesInzending(2))!, null, "Jan");
    expect((await lijstFacturen())[0]).toMatchObject({ id: factuur.id, post_id: null, nummer: "V-1", bedrag: 9_500, factuurdatum: "2026-10-02", vervaldag: "2026-10-31", bestand_id: 71 });
    expect(await leesInzending(2)).toMatchObject({ status: "verwerkt", factuur_id: factuur.id });

    await expect(boekInzendingIn((await leesInzending(3))!, postId, "Jan")).rejects.toThrow("bij Plannen");
  });

  it("vraagt een post voor een ingestuurde offerte", async () => {
    db.tabellen.bouw_inzendingen = [
      { id: 1, partij_id: 4, bestand_id: 70, soort: "offerte", bedrag: 95_000, status: "nieuw", created_at: "2026-10-01T09:00:00Z" },
    ];
    await expect(boekInzendingIn((await leesInzending(1))!, null, "Jan")).rejects.toThrow("Kies de post");
    expect(await leesInzending(1)).toMatchObject({ status: "nieuw" });
  });

  it("toont enkel de actieve vennootschappen", async () => {
    expect(await lijstVennootschappen()).toEqual([{ id: "a1", naam: "Voorbeeld BV" }]);
  });
});

describe("de Excel van het geld", () => {
  it("heeft een blad per onderdeel, met bedragen en datums als echte waarden", async () => {
    const excel = await maakGeldExcel(
      {
        posten: [post(1, 100_000, { naam: "Ruwbouw", partij_id: 4 }), post(2, 20_000, { naam: "Elektriciteit", categorie: "werken" })],
        offertes: [offerte(1, 1, 95_000, "gekozen")],
        meerwerken: [meerwerk(1, 1, 2_500, "aanvaard")],
        facturen: [factuur(1, 1, 30_000, { nummer: "F-1", partij_id: 4, betaald_op: "2026-09-20" }), factuur(2, null, -500)],
        opnames: [{ id: 1, datum: "2026-09-19", bedrag: 30_000, factuur_id: 1, opmerking: "Schijf 1" }],
        partijen: [{ id: 4, soort: "aannemer", naam: "Bouwbedrijf Voorbeeld", vak: null, contactpersoon: null, email: null, telefoon: null, adres: null, website: null, btw_nummer: null, opmerking: null }],
        planning: [],
        vennootschappen: [],
        krediet: 250_000,
        eigenInbreng: 50_000,
      },
      "2026-10-02",
      new Date("2026-10-02T12:00:00Z"),
    );
    const werkmap = new ExcelJS.Workbook();
    await werkmap.xlsx.load(excel as unknown as ArrayBuffer);
    expect(werkmap.worksheets.map((w) => w.name)).toEqual(["Posten", "Offertes", "Meer- en minwerken", "Facturen", "Kasplanning", "Krediet"]);

    const posten = werkmap.getWorksheet("Posten")!;
    expect(posten.getRow(2).values).toEqual(
      expect.arrayContaining(["Werken", "Ruwbouw", "Bouwbedrijf Voorbeeld", 100_000, 95_000, 2_500, 97_500, 30_000, 30_000]),
    );
    expect(posten.getRow(4).getCell(4).value).toMatchObject({ formula: "SUM(D2:D3)" });

    const facturen = werkmap.getWorksheet("Facturen")!;
    expect(facturen.getRow(2).getCell(1).value).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(facturen.getRow(2).getCell(10).value).toBe("betaald");
    expect(facturen.getRow(3).getCell(10).value).toBe("creditnota");

    const krediet = werkmap.getWorksheet("Krediet")!;
    expect([krediet.getRow(3).getCell(1).value, krediet.getRow(3).getCell(2).value]).toEqual(["Nog beschikbaar", 220_000]);
  });
});
