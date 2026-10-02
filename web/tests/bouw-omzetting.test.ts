import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import { isScan, zetOm } from "@/lib/bouw/omzetting/pijplijn";
import { METER_PER_PUNT, bewijs } from "@/lib/bouw/omzetting/schaal";
import type { Blad, Voorstel } from "@/lib/bouw/omzetting/types";

import { maakPdf } from "./fixtures/bouw/pdf-schrijver";
import { gelijkvloers, grondplanblad, testplanPdf, verdieping, type Testgrondplan } from "./fixtures/bouw/testplan";

/** Leest één blad uit een PDF zoals de browser het doet, maar in Node. */
async function lees(bytes: Uint8Array, pagina = 1): Promise<Blad> {
  const taak = getDocument({ data: bytes, verbosity: 0 });
  try {
    const document = await taak.promise;
    return await leesBlad(await document.getPage(pagina));
  } finally {
    await taak.destroy();
  }
}

async function omgezet(plan: Testgrondplan, opties = {}): Promise<Voorstel> {
  return zetOm(await lees(testplanPdf(plan)), opties);
}

function ruimte(voorstel: Voorstel, naam: string) {
  const gevonden = voorstel.ruimtes.find((r) => r.naam === naam);
  if (!gevonden) throw new Error(`Geen ruimte "${naam}" in ${voorstel.ruimtes.map((r) => r.naam).join(", ")}`);
  return gevonden;
}

describe("een blad lezen", () => {
  it("volgt de transformatie: de muren zijn 0,72 pt dik op het blad, de arcering 0,07 pt", async () => {
    const blad = await lees(testplanPdf(gelijkvloers()));
    const diktes = new Set(blad.paden.filter((p) => p.lijn).map((p) => Math.round(p.dikte * 100) / 100));
    expect(diktes).toContain(0.72);
    expect(diktes).toContain(0.07);
    // Een muur van 10 m op 1:50 is 567 punten lang op het blad.
    const grijs = blad.paden.filter((p) => p.vul === "#c8c8c8");
    const breedste = Math.max(...grijs.map((p) => Math.max(...p.delen[0].punten.map((q) => q[0])) - Math.min(...p.delen[0].punten.map((q) => q[0]))));
    expect(breedste).toBeCloseTo(10 / (50 * METER_PER_PUNT), 0);
  });

  it("geeft elke tekst zijn middelpunt, met y naar beneden", async () => {
    const blad = await lees(testplanPdf(gelijkvloers()));
    const titel = blad.teksten.find((t) => t.tekst === "GELIJKVLOERS");
    expect(titel?.grootte).toBeCloseTo(19.9, 1);
    // Het titelblok staat onderaan het blad.
    expect(titel!.y).toBeGreaterThan(blad.hoogte - 200);
    expect(blad.teksten.map((t) => t.tekst)).toEqual(expect.arrayContaining(["leefruimte", "33,12m2", "PH = 280", "1:50"]));
  });

  it("vlakt een boog af, zodat een vlak met een boog toch de juiste oppervlakte heeft", async () => {
    const blad = await lees(testplanPdf(gelijkvloers()));
    const deuren = blad.paden.flatMap((p) => p.bogen);
    expect(deuren).toHaveLength(4);
    const boogpad = blad.paden.find((p) => p.bogen.length > 0)!;
    expect(boogpad.delen[0].punten.length).toBeGreaterThan(3);
  });
});

describe("het gelijkvloers omzetten", () => {
  it("vindt de schaal in het titelblok en bevestigt ze met de oppervlaktes", async () => {
    const voorstel = await omgezet(gelijkvloers());
    expect(voorstel.schaal).toMatchObject({ noemer: 50, bron: "beide", titelblok: 50, kloppend: 4, getoetst: 4, zeker: true });
    expect(bewijs(voorstel.schaal!)).toBe("1:50 volgens het titelblok, en 4 van de 4 oppervlaktes kloppen.");
  });

  it("vindt elke ruimte met haar naam, soort en oppervlakte", async () => {
    const voorstel = await omgezet(gelijkvloers());
    expect(voorstel.ruimtes.map((r) => [r.naam, r.soort, r.oppervlaktePlan, r.status])).toEqual([
      ["leefruimte", "leefruimte", 33.12, "goed"],
      ["keuken", "keuken", 12.46, "goed"],
      ["inkom", "inkom", 10.03, "goed"],
      ["berging/technieken", "technieken", 6.78, "goed"],
    ]);
    expect(ruimte(voorstel, "leefruimte").oppervlakte).toBeCloseTo(33.12, 1);
    expect(ruimte(voorstel, "keuken").oppervlakte).toBeCloseTo(12.456, 1);
    expect(voorstel.ruimtes.every((r) => r.mee && r.ruimteId === null)).toBe(true);
    expect(voorstel.ruimtes.map((r) => r.sleutel)).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("houdt een opschrift als wasmachine niet voor (een deel van) de naam", async () => {
    expect(ruimte(await omgezet(gelijkvloers()), "berging/technieken")).toBeTruthy();
  });

  it("leest de plafondhoogte en het peil van de verdieping", async () => {
    const voorstel = await omgezet(gelijkvloers());
    expect(voorstel.verdieping).toEqual({ plafondhoogte: 2.8, vloerpeil: 0 });
    // Een ruimte die de hoogte van de verdieping heeft, krijgt er geen eigen.
    expect(ruimte(voorstel, "leefruimte").plafondhoogte).toBeNull();
  });

  it("stelt het trapbordes zonder label voor als kandidaat, met zijn eigen plafondhoogte", async () => {
    const voorstel = await omgezet(gelijkvloers());
    expect(voorstel.kandidaten).toHaveLength(1);
    expect(voorstel.kandidaten[0]).toMatchObject({ oppervlakte: 1.6, plafondhoogte: 4.3, vloerpeil: null });
  });

  it("telt de deuren en ramen, elk bij hun ruimte", async () => {
    const voorstel = await omgezet(gelijkvloers());
    const sleutel = (naam: string) => ruimte(voorstel, naam).sleutel;
    const deuren = voorstel.openingen.filter((o) => o.soort === "deur");
    expect(deuren.map((d) => [d.breedte, d.ruimte])).toEqual([
      [0.9, sleutel("inkom")],
      [0.9, sleutel("keuken")],
      [0.8, sleutel("berging/technieken")],
      [1.0, sleutel("inkom")],
    ]);
    const ramen = voorstel.openingen.filter((o) => o.soort === "raam");
    expect(ramen.map((r) => [r.breedte, r.hoogte, r.ruimte])).toEqual([
      [2.05, 2.75, sleutel("leefruimte")],
      [1.2, 2.75, sleutel("keuken")],
    ]);
  });

  it("legt het gebied rond het gebouw, met marge", async () => {
    const voorstel = await omgezet(gelijkvloers());
    const perMeter = 1 / (50 * METER_PER_PUNT);
    // Het huis begint 2 m in het tekenvak, dat 60 punten van de rand ligt; de ruimtes 0,4 m verder.
    expect(voorstel.gebied!.x0).toBeCloseTo(60 + (2 + 0.4 - 1.5) * perMeter, 0);
    expect(voorstel.meldingen).toEqual([]);
  });

  it("de verdieping: andere ruimtes, ander peil", async () => {
    const voorstel = await omgezet(verdieping());
    expect(voorstel.ruimtes.map((r) => [r.naam, r.soort])).toEqual([
      ["slaapkamer 1", "slaapkamer"],
      ["badk 1", "badkamer"],
      ["nachthal", "nachthal"],
    ]);
    expect(voorstel.verdieping).toEqual({ plafondhoogte: 2.6, vloerpeil: 3.2 });
  });
});

describe("lastige bladen", () => {
  it("een gedraaid blad geeft dezelfde ruimtes", async () => {
    const voorstel = await omgezet({ ...gelijkvloers(), draai: 90 });
    expect(voorstel.blad).toEqual({ breedte: 1191, hoogte: 842 });
    expect(voorstel.schaal?.noemer).toBe(50);
    // Gedraaid staan de ruimtes in een andere volgorde op het blad, maar ze zijn er allemaal.
    expect(voorstel.ruimtes.map((r) => [r.naam, r.status])).toEqual(
      expect.arrayContaining([
        ["leefruimte", "goed"],
        ["keuken", "goed"],
        ["inkom", "goed"],
        ["berging/technieken", "goed"],
      ]),
    );
    expect(voorstel.ruimtes).toHaveLength(4);
    expect(ruimte(voorstel, "leefruimte").oppervlakte).toBeCloseTo(33.12, 1);
  });

  it("zonder schaal op het blad volgt de schaal uit de oppervlaktes", async () => {
    const voorstel = await omgezet({ ...gelijkvloers(), schaaltekst: null });
    expect(voorstel.schaal).toMatchObject({ noemer: 50, bron: "oppervlaktes", titelblok: null, kloppend: 4, zeker: true });
    expect(bewijs(voorstel.schaal!)).toContain("Er staat geen schaal op het blad.");
    expect(voorstel.ruimtes).toHaveLength(4);
  });

  it("een plan op een ander formaat afgedrukt: het titelblok zegt 1:50, de oppervlaktes 1:100", async () => {
    const voorstel = await omgezet({ ...gelijkvloers(), tekenschaal: 100 });
    expect(voorstel.schaal).toMatchObject({ noemer: 100, bron: "oppervlaktes", titelblok: 50 });
    expect(bewijs(voorstel.schaal!)).toContain("Het titelblok zegt 1:50");
    expect(voorstel.ruimtes.map((r) => r.status)).toEqual(["goed", "goed", "goed", "goed"]);
  });

  it("zonder labels: de schaal van het titelblok met een waarschuwing, en de vlakken als kandidaat", async () => {
    const plan = gelijkvloers();
    const voorstel = await omgezet({ ...plan, ruimtes: plan.ruimtes.map((r) => ({ ...r, label: null })) });
    expect(voorstel.schaal).toMatchObject({ noemer: 50, bron: "titelblok", getoetst: 0, zeker: false });
    expect(voorstel.ruimtes).toEqual([]);
    expect(voorstel.meldingen.join(" ")).toContain("Geen ruimtes gevonden");
    // De vijf witte vlakken, plus het titelblok: zonder ruimtes is er geen gebied om op te beperken.
    expect(voorstel.kandidaten.map((k) => k.oppervlakte)).toEqual(expect.arrayContaining([33.12, 1.6]));
  });

  it("zonder schaal en zonder labels vraagt de app de schaal", async () => {
    const plan = gelijkvloers();
    const voorstel = await omgezet({ ...plan, schaaltekst: null, ruimtes: plan.ruimtes.map((r) => ({ ...r, label: null })) });
    expect(voorstel.schaal).toBeNull();
    expect(voorstel.meldingen[0]).toContain("Duid ze zelf aan");
  });

  it("een schaal die iemand zelf aanduidde, gaat voor", async () => {
    const voorstel = await omgezet(gelijkvloers(), { meterPerPunt: 50 * METER_PER_PUNT });
    expect(voorstel.schaal).toMatchObject({ noemer: 50, bron: "hand", kloppend: 4 });
    expect(voorstel.ruimtes).toHaveLength(4);
  });

  it("een label zonder passend vlak wordt gemeld, en een afwijkend label staat op nakijken", async () => {
    const plan = gelijkvloers();
    plan.ruimtes[1] = { ...plan.ruimtes[1], label: "12,90m2" }; // 3,6 % te groot
    plan.ruimtes[2] = { ...plan.ruimtes[2], label: "99,00m2" };
    const voorstel = await omgezet(plan);
    expect(ruimte(voorstel, "keuken")).toMatchObject({ status: "nakijken", mee: false });
    expect(ruimte(voorstel, "keuken").redenen[0]).toMatch(/wijkt 3,\d % af/);
    expect(voorstel.meldingen).toContain("Bij het label 99,00m2 vond ik geen vlak met die oppervlakte.");
  });

  it("herkent een scan", () => {
    const scan: Blad = { breedte: 842, hoogte: 1191, paden: [], teksten: [], beeldvlak: 0.98 };
    expect(isScan(scan)).toBe(true);
    expect(zetOm(scan).meldingen[0]).toContain("scan");
  });

  it("leest elk blad van een PDF met meerdere bladen apart", async () => {
    const bytes = maakPdf([grondplanblad(gelijkvloers()), grondplanblad(verdieping())]);
    expect(zetOm(await lees(bytes, 2)).ruimtes.map((r) => r.naam)).toEqual(["slaapkamer 1", "badk 1", "nachthal"]);
  });
});
