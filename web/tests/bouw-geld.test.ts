import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import {
  STANDAARDPOSTEN,
  CATEGORIEEN_POST,
  factuurherinneringen,
  factuurstand,
  kasplanning,
  kredietstand,
  poststanden,
  totalen,
  vervaldagVan,
  type Factuur,
  type Meerwerk,
  type Offerte,
  type Post,
} from "@/lib/bouw/geld";
import {
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

  it("toont enkel de actieve vennootschappen", async () => {
    expect(await lijstVennootschappen()).toEqual([{ id: "a1", naam: "Voorbeeld BV" }]);
  });
});
