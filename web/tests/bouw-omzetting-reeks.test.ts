import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { naarHuis, type Kalibratie } from "@/lib/bouw/omzetting/geometrie";
import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import { zetOm } from "@/lib/bouw/omzetting/pijplijn";
import {
  afhankelijk,
  beoordeelRuimte,
  bevestigingVoor,
  lijnBladUit,
  meegaand,
  neemNamenOver,
  omzetstand,
  opnieuwBeoordeeld,
  opnieuwOmgezet,
  planstatus,
  teDoen,
  verschilVoor,
  type Verdiepinginfo,
} from "@/lib/bouw/omzetting/reeks";
import type { Planinfo } from "@/lib/bouw/omzetting/referentie";
import type { Blad, Ruimtevoorstel, Schaal, Voorstel, Xy } from "@/lib/bouw/omzetting/types";
import { inHuis, muurlijnen } from "@/lib/bouw/omzetting/uitlijnen";

import { gelijkvloers, testplanPdf, verdieping as verdiepingsplan, type Testgrondplan } from "./fixtures/bouw/testplan";

const kalibratie: Kalibratie = { meterPerPunt: 0.0176, kwartslagen: 0, dx: 0, dy: 0 };

function versie(id: number, created_at = "2026-10-01T10:00:00Z", metKalibratie = false): Planinfo["versies"][number] {
  return { id, bestand_id: 1, pagina: 1, label: `v${id}`, created_at, kalibratie: metKalibratie ? { ...kalibratie } : null };
}

function plan(id: number, verdieping_id: number | null, versies: Planinfo["versies"], soort = "grondplan"): Planinfo {
  return { id, titel: `Plan ${id}`, soort, gebouw_id: null, verdieping_id, versies };
}

const verdiepingen: Verdiepinginfo[] = [
  { id: 1, naam: "Kelder", gebouw_id: 5, vloerpeil_m: -2.8, volgorde: -1 },
  { id: 2, naam: "Gelijkvloers", gebouw_id: 5, vloerpeil_m: 0, volgorde: 0 },
  { id: 3, naam: "Verdieping", gebouw_id: 5, vloerpeil_m: 3.2, volgorde: 1 },
  { id: 4, naam: "Zolder", gebouw_id: 5, vloerpeil_m: null, volgorde: 2 },
  { id: 6, naam: "Gelijkvloers", gebouw_id: 7, vloerpeil_m: 0, volgorde: 0 },
];
const gebouwen = [
  { id: 5, naam: "Woning" },
  { id: 7, naam: "Bijgebouw" },
];

function ruimte(sleutel: string, naam: string, ringen: Xy[][], extra: Partial<Ruimtevoorstel> = {}): Ruimtevoorstel {
  return beoordeelRuimte({
    sleutel,
    naam,
    soort: "andere",
    ringen,
    oppervlakte: 10,
    oppervlaktePlan: 10,
    plafondhoogte: null,
    vloerpeil: null,
    status: "goed",
    redenen: [],
    mee: true,
    ruimteId: null,
    ...extra,
  });
}

const vierkant = (x: number, y: number, z = 100): Xy[][] => [[[x, y], [x + z, y], [x + z, y + z], [x, y + z]]];

const zekereSchaal: Schaal = {
  meterPerPunt: 0.0176,
  noemer: 50,
  bron: "beide",
  titelblok: 50,
  kloppend: 4,
  getoetst: 4,
  zeker: true,
};

describe("welke grondplannen meedoen, en in welke volgorde", () => {
  it("per gebouw: eerst het gelijkvloers, dan naar boven, dan naar beneden", () => {
    const plannen = [
      plan(10, 1, [versie(1)]),
      plan(11, 3, [versie(2)]),
      plan(12, 6, [versie(3)]),
      plan(13, 2, [versie(4)]),
      plan(14, 4, [versie(5)]),
    ];
    const { reeks } = teDoen(plannen, verdiepingen, gebouwen, new Set());
    expect(reeks.map((r) => `${r.gebouw?.naam} ${r.verdieping.naam}`)).toEqual([
      "Woning Gelijkvloers",
      "Woning Verdieping",
      "Woning Zolder",
      "Woning Kelder",
      "Bijgebouw Gelijkvloers",
    ]);
  });

  it("laat een plan weg waarvan de nieuwste versie al bevestigd is, maar niet een nieuwe versie", () => {
    const plannen = [
      plan(10, 2, [versie(1, "2026-09-01T10:00:00Z", true)]),
      plan(11, 3, [versie(2, "2026-09-01T10:00:00Z", true), versie(3, "2026-10-01T10:00:00Z")]),
    ];
    const { reeks, omgezet, open } = teDoen(plannen, verdiepingen, gebouwen, new Set([1, 2]));
    expect(reeks.map((r) => r.versie.id)).toEqual([3]);
    expect(omgezet).toBe(1);
    expect(open).toBe(1);
  });

  it("slaat over wat niet kan: zonder verdieping, zonder versie; andere soorten plannen tellen niet mee", () => {
    const plannen = [plan(10, null, [versie(1)]), plan(11, 2, []), plan(12, 2, [versie(2)], "gevel")];
    const { reeks, overgeslagen, open } = teDoen(plannen, verdiepingen, gebouwen, new Set());
    expect(reeks).toEqual([]);
    // Zonder verdieping is het plan wel nog niet omgezet, zoals de taak op het overzicht zegt.
    expect(open).toBe(1);
    expect(overgeslagen.map((o) => [o.plan.id, o.reden])).toEqual([
      [10, "Dit grondplan hangt nog niet aan een verdieping."],
      [11, "Dit plan heeft nog geen versie."],
    ]);
  });

  it("neemt bij opnieuw omzetten enkel wat met oudere regels omgezet werd, met de bewaarde plaats", () => {
    const k = { meterPerPunt: 0.0176, kwartslagen: 1, dx: 2.5, dy: -1, bron: "hand", referentieVersieId: 7 };
    const plannen = [
      plan(10, 2, [{ ...versie(1), kalibratie: k }]),
      plan(11, 3, [{ ...versie(2), kalibratie: k }]),
      plan(12, 6, [versie(3)]),
      // Bevestigd maar zonder volledige kalibratie: dat kan opnieuw omzetten niet.
      plan(13, 4, [{ ...versie(4), kalibratie: { meterPerPunt: 0.0176 } }]),
    ];
    const { bevestigd, oud } = omzetstand([
      { planversie_id: 1, werkwijze: 4 },
      { planversie_id: 2, werkwijze: 5 },
      { planversie_id: 4, werkwijze: 2 },
    ]);
    expect([...oud]).toEqual([1, 4]);
    const gewoon = teDoen(plannen, verdiepingen, gebouwen, bevestigd, oud);
    expect(gewoon.reeks.map((r) => r.versie.id)).toEqual([3]);
    expect(gewoon.verouderd).toBe(2);
    expect(gewoon.reeks[0].bewaard).toBeNull();

    const opnieuw = teDoen(plannen, verdiepingen, gebouwen, bevestigd, oud, true);
    expect(opnieuw.reeks.map((r) => r.versie.id)).toEqual([1]);
    expect(opnieuw.reeks[0].bewaard).toEqual({ kalibratie: { meterPerPunt: 0.0176, kwartslagen: 1, dx: 2.5, dy: -1 }, referentieVersieId: 7 });
    expect(opnieuw.overgeslagen.map((o) => [o.plan.id, o.reden])).toEqual([[13, "Waar dit plan ligt, is niet volledig bewaard. Zet het apart om."]]);
    expect([opnieuw.open, opnieuw.verouderd]).toEqual([1, 2]);
  });

  it("merkt twee grondplannen op dezelfde verdieping, ook als het ene al omgezet is", () => {
    const plannen = [plan(10, 2, [versie(1, "2026-09-01T10:00:00Z", true)]), plan(11, 2, [versie(2)]), plan(12, 3, [versie(3)])];
    const { reeks } = teDoen(plannen, verdiepingen, gebouwen, new Set([1]));
    expect(reeks.map((r) => [r.plan.id, r.dubbel])).toEqual([
      [11, true],
      [12, false],
    ]);
  });
});

describe("of een plan zonder nakijken mag", () => {
  const goed = [ruimte("r1", "leefruimte", vierkant(0, 0)), ruimte("r2", "keuken", vierkant(200, 0))];
  const basis = {
    dubbel: false,
    voorstel: { schaal: zekereSchaal, meldingen: [] },
    ruimtes: goed,
    uitlijning: { zekerheid: 0.6, gedraaid: false, op: "Gelijkvloers" },
    verdwenen: [] as string[],
  };

  it("klaar als alles zeker is, ook zonder referentie", () => {
    expect(planstatus(basis)).toEqual({ oordeel: "klaar", redenen: [] });
    expect(planstatus({ ...basis, uitlijning: null }).oordeel).toBe("klaar");
  });

  it("kan niet: een tweede grondplan, geen schaal, geen ruimtes, of geen enkele met een naam", () => {
    expect(planstatus({ ...basis, dubbel: true }).oordeel).toBe("kan-niet");
    const zonderSchaal = planstatus({ ...basis, voorstel: { schaal: null, meldingen: ["Er staat geen schaal op dit blad."] } });
    expect(zonderSchaal).toEqual({ oordeel: "kan-niet", redenen: ["Er staat geen schaal op dit blad."] });
    expect(planstatus({ ...basis, ruimtes: [] }).oordeel).toBe("kan-niet");
    expect(planstatus({ ...basis, ruimtes: [ruimte("r1", "", vierkant(0, 0), { mee: false })] }).oordeel).toBe("kan-niet");
  });

  it("nakijken, met de reden: schaal, uitlijning, draaiing, naamloze en afwijkende ruimtes, wat verdwijnt", () => {
    const reden = (invoer: Partial<typeof basis>) => planstatus({ ...basis, ...invoer });
    expect(reden({ voorstel: { schaal: { ...zekereSchaal, zeker: false, bron: "titelblok", kloppend: 1 }, meldingen: [] } }).redenen[0]).toMatch(
      /^De schaal is niet zeker: 1:50 volgens het titelblok/,
    );
    expect(reden({ uitlijning: { zekerheid: 0.1, gedraaid: false, op: "Gelijkvloers" } }).redenen).toEqual([
      "De uitlijning op Gelijkvloers is niet zeker.",
    ]);
    expect(reden({ uitlijning: { zekerheid: 0.9, gedraaid: true, op: "Gelijkvloers" } }).redenen).toEqual([
      "De tekening staat gedraaid tegenover Gelijkvloers.",
    ]);
    const naamloos = ruimte("r3", "", vierkant(400, 0), { mee: false });
    const afwijkend = ruimte("r4", "berging", vierkant(600, 0), { oppervlakte: 11, mee: false });
    expect(afwijkend.status).toBe("nakijken");
    expect(reden({ ruimtes: [...goed, naamloos, afwijkend] })).toEqual({
      oordeel: "nakijken",
      redenen: ["1 ruimte heeft geen naam en gaat niet mee.", "berging gaat niet mee: de oppervlakte wijkt af van het plan."],
    });
    expect(reden({ verdwenen: ["wc", "berging"] }).redenen).toEqual(["Verdwijnt van de verdieping: wc en berging."]);
  });
});

describe("de keten van uitlijningen", () => {
  const reeks = [
    { versieId: 1, referentieVersieId: null },
    { versieId: 2, referentieVersieId: 1 },
    { versieId: 3, referentieVersieId: 2 },
    { versieId: 4, referentieVersieId: 99 },
  ];

  it("wie een plan afvinkt, vinkt ook alles af dat erop ligt, verder in de keten", () => {
    expect([...afhankelijk(reeks, new Set([1]))].sort()).toEqual([2, 3]);
    expect([...afhankelijk(reeks, new Set([2]))]).toEqual([3]);
    expect([...afhankelijk(reeks, new Set([3]))]).toEqual([]);
  });

  it("een referentie die al bevestigd was, hangt van niets in de reeks af", () => {
    expect([...afhankelijk(reeks, new Set([1, 2, 3]))].includes(4)).toBe(false);
  });
});

describe("namen en bevestigen", () => {
  const bestaand = [
    { id: 70, naam: "living", ringen: [[[0, 0], [1.76, 0], [1.76, 1.76], [0, 1.76]] as Xy[]], oppervlakte: 3.1 },
    { id: 71, naam: "wc", ringen: [[[10, 10], [11, 10], [11, 11], [10, 11]] as Xy[]], oppervlakte: 1 },
  ];

  it("een ruimte op dezelfde plaats houdt haar naam, en gaat dan mee", () => {
    const zonderNaam = ruimte("r1", "", vierkant(0, 0), { mee: false });
    expect(zonderNaam.status).toBe("nakijken");
    const [overgenomen] = neemNamenOver([zonderNaam], bestaand, kalibratie);
    expect(overgenomen).toMatchObject({ naam: "living", status: "goed", mee: true });
    expect(neemNamenOver([zonderNaam], [], kalibratie)).toEqual([zonderNaam]);
  });

  it("stelt samen wat de server krijgt: enkel ruimtes met een naam, met het id dat ze voortzetten", () => {
    const ruimtes = [ruimte("r1", "leefruimte", vierkant(0, 0)), ruimte("r2", "", vierkant(300, 300), { mee: false })];
    const verschil = verschilVoor(ruimtes, bestaand, kalibratie);
    expect(verschil.verdwenen.map((r) => r.naam)).toEqual(["wc"]);
    const voorstel = {
      schaal: zekereSchaal,
      openingen: [],
      muren: [],
      trappen: [],
      luifels: [],
      verdieping: { vloerpeil: 0, plafondhoogte: 2.8 },
    };
    const bevestiging = bevestigingVoor({ versieId: 9, voorstel, kalibratie, referentieVersieId: 4, ruimtes, verschil });
    expect(bevestiging).toMatchObject({
      versieId: 9,
      kalibratie: { meterPerPunt: 0.0176, kwartslagen: 0, dx: 0, dy: 0, bron: "beide", referentieVersieId: 4 },
      ruimtes: [{ ruimteId: 70, naam: "leefruimte", soort: "andere", oppervlaktePlan: 10 }],
      verdieping: { bijwerken: true, vloerpeil: 0, plafondhoogte: 2.8 },
    });
    expect(bevestiging?.kalibratie.bewijs).toMatch(/^1:50 volgens het titelblok/);
    expect(meegaand(ruimtes)).toHaveLength(1);
    expect(bevestigingVoor({ versieId: 9, voorstel: { ...voorstel, schaal: null }, kalibratie, referentieVersieId: null, ruimtes, verschil })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Van PDF tot bevestiging, met de testplannen
// ---------------------------------------------------------------------------

async function lees(testplan: Testgrondplan): Promise<Blad> {
  const taak = getDocument({ data: testplanPdf(testplan), verbosity: 0 });
  try {
    return await leesBlad(await (await taak.promise).getPage(1));
  } finally {
    await taak.destroy();
  }
}

/** Het gelijkvloers als eerste plan van de reeks: het legt het assenstelsel vast. */
async function eerste() {
  const blad = await lees(gelijkvloers());
  const voorstel: Voorstel = zetOm(blad);
  const meterPerPunt = voorstel.schaal!.meterPerPunt;
  const eigen: Kalibratie = { meterPerPunt, kwartslagen: 0, dx: 0, dy: 0 };
  return { blad, voorstel, kalibratie: eigen, lijnen: inHuis(muurlijnen(blad, meterPerPunt, voorstel.gebied), eigen) };
}

describe("een reeks van twee verdiepingen", () => {
  it("het gelijkvloers is klaar zonder referentie, de verdieping ligt er zeker op", async () => {
    const ref = await eerste();
    expect(planstatus({ dubbel: false, voorstel: ref.voorstel, ruimtes: ref.voorstel.ruimtes, uitlijning: null, verdwenen: [] })).toEqual({
      oordeel: "klaar",
      redenen: [],
    });

    const blad = await lees(verdiepingsplan());
    const voorstel = zetOm(blad);
    const uit = lijnBladUit({
      blad,
      voorstel,
      meterPerPunt: voorstel.schaal!.meterPerPunt,
      referentie: { soort: "verdieping", kalibratie: ref.kalibratie },
      referentielijnen: ref.lijnen,
      bestaand: [],
    });
    // Zoals in de test van het uitlijnen: 0,37 m verder naar rechts en 0,21 m hoger op haar blad.
    expect(uit.gedraaid).toBe(false);
    expect(uit.zekerheid).toBeGreaterThanOrEqual(0.15);
    expect(uit.kalibratie.dx).toBeCloseTo(-0.37, 1);
    expect(uit.kalibratie.dy).toBeCloseTo(0.21, 1);
    expect(
      planstatus({
        dubbel: false,
        voorstel,
        ruimtes: voorstel.ruimtes,
        uitlijning: { ...uit, op: "Gelijkvloers" },
        verdwenen: [],
      }).oordeel,
    ).toBe("klaar");

    // Na het uitlijnen ligt de hoek van de slaapkamer in het huis op die van de
    // leefruimte eronder: beide liggen tegen dezelfde buitenmuren.
    const hoek = (ringen: Xy[][], k: Kalibratie) => {
      const punten = ringen[0].map((p) => naarHuis(p, k));
      return [Math.min(...punten.map((p) => p[0])), Math.min(...punten.map((p) => p[1]))];
    };
    const [sx, sy] = hoek(voorstel.ruimtes.find((r) => r.naam === "slaapkamer 1")!.ringen, uit.kalibratie);
    const [lx, ly] = hoek(ref.voorstel.ruimtes.find((r) => r.naam === "leefruimte")!.ringen, ref.kalibratie);
    expect(Math.abs(sx - lx)).toBeLessThan(0.05);
    expect(Math.abs(sy - ly)).toBeLessThan(0.05);
  });

  it("een tekening die een kwartslag gedraaid staat: gevonden, maar na te kijken", async () => {
    const ref = await eerste();
    const blad = await lees({ ...gelijkvloers(), draai: 90 });
    const voorstel = zetOm(blad);
    const uit = lijnBladUit({
      blad,
      voorstel,
      meterPerPunt: voorstel.schaal!.meterPerPunt,
      referentie: { soort: "verdieping", kalibratie: ref.kalibratie },
      referentielijnen: ref.lijnen,
      bestaand: [],
    });
    expect(uit.gedraaid).toBe(true);
    expect(uit.kalibratie.kwartslagen).toBe(3);
    expect(
      planstatus({ dubbel: false, voorstel, ruimtes: voorstel.ruimtes, uitlijning: { ...uit, op: "Gelijkvloers" }, verdwenen: [] }),
    ).toEqual({ oordeel: "nakijken", redenen: ["De tekening staat gedraaid tegenover Gelijkvloers."] });
  });
});

describe("opnieuw omzetten", () => {
  it("houdt het plan op zijn bewaarde plaats, met de namen, de soorten en de ids", async () => {
    const blad = await lees(gelijkvloers());
    // Ergens anders in het gebouw gelegd dan nul, en een kwartslag gedraaid.
    const k: Kalibratie = { meterPerPunt: zetOm(blad).schaal!.meterPerPunt, kwartslagen: 1, dx: 12.5, dy: -3.2 };
    const eerst = zetOm(blad);
    const bestaand = eerst.ruimtes
      .filter((r) => r.naam)
      .map((r, i) => ({
        id: 100 + i,
        naam: r.naam === "leefruimte" ? "living" : r.naam,
        soort: r.naam === "keuken" ? ("berging" as const) : r.soort,
        ringen: r.ringen.map((ring) => ring.map((p) => naarHuis(p, k))),
        oppervlakte: r.oppervlakte,
      }));

    const voorstel = opnieuwOmgezet(blad, k);
    const { ruimtes, verschil, status } = opnieuwBeoordeeld(voorstel, bestaand, k);
    expect(status).toEqual({ oordeel: "klaar", redenen: [] });
    // Een naam en een soort die iemand zelf koos, blijven.
    expect(ruimtes.find((r) => r.naam === "living")).toBeTruthy();
    expect(ruimtes.find((r) => r.naam === "keuken")?.soort).toBe("berging");
    expect(verschil.verdwenen).toEqual([]);
    expect(meegaand(ruimtes).map((r) => verschil.koppelingen.find((koppeling) => koppeling.sleutel === r.sleutel)?.ruimteId).sort()).toEqual(
      bestaand.map((r) => r.id).sort(),
    );

    const bevestiging = bevestigingVoor({
      versieId: 1,
      voorstel,
      kalibratie: k,
      referentieVersieId: null,
      ruimtes,
      verschil,
      verdiepingBijwerken: false,
    })!;
    expect(bevestiging.kalibratie).toMatchObject(k);
    expect(bevestiging.verdieping.bijwerken).toBe(false);
  });

  it("kijkt na als er een ruimte bij komt of verdwijnt", async () => {
    const blad = await lees(gelijkvloers());
    const k: Kalibratie = { meterPerPunt: zetOm(blad).schaal!.meterPerPunt, kwartslagen: 0, dx: 0, dy: 0 };
    const alle = zetOm(blad).ruimtes.filter((r) => r.naam);
    const alsOud = (r: Ruimtevoorstel, i: number) => ({ id: 100 + i, naam: r.naam, ringen: r.ringen.map((ring) => ring.map((p) => naarHuis(p, k))), oppervlakte: r.oppervlakte });
    const zonderKeuken = alle.filter((r) => r.naam !== "keuken").map(alsOud);
    const erbij = opnieuwBeoordeeld(opnieuwOmgezet(blad, k), zonderKeuken, k).status;
    expect(erbij.oordeel).toBe("nakijken");
    expect(erbij.redenen).toContain("Komt er nieuw bij: keuken.");
    const metExtra = [...alle.map(alsOud), { id: 999, naam: "kelder", ringen: [[[50, 50], [52, 50], [52, 52], [50, 52]] as Xy[]], oppervlakte: 4 }];
    const weg = opnieuwBeoordeeld(opnieuwOmgezet(blad, k), metExtra, k).status;
    expect(weg.redenen).toContain("Verdwijnt van de verdieping: kelder.");
  });

  it("gebruikt de bewaarde schaal als ze anders is dan wat het blad zegt", async () => {
    const blad = await lees(gelijkvloers());
    const gelezen = zetOm(blad).schaal!.meterPerPunt;
    expect(opnieuwOmgezet(blad, { meterPerPunt: gelezen, kwartslagen: 0, dx: 0, dy: 0 }).schaal!.bron).not.toBe("hand");
    const zelf = opnieuwOmgezet(blad, { meterPerPunt: gelezen * 1.02, kwartslagen: 0, dx: 0, dy: 0 });
    expect(zelf.schaal).toMatchObject({ bron: "hand" });
    expect(zelf.schaal!.meterPerPunt).toBeCloseTo(gelezen * 1.02, 9);
  });
});

