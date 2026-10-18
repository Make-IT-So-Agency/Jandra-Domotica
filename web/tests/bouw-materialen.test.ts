import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown, ik: null as unknown, huis: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/bouw/huistoegang", () => ({
  huisgebruiker: async () => (nep.ik && nep.huis ? { ik: nep.ik, huis: nep.huis } : null),
}));

import { bewaarMateriaalActie } from "@/app/vastgoed/[huis]/3d/acties";

import {
  STANDAARDKLEUREN,
  bewaardAls,
  keuzeVan,
  keuzeVoorPlek,
  materiaalVan,
  materiaalkeuzes,
  proefsleutel,
  schoneMateriaalvraag,
  vloertitel,
  vrijeNaam,
  type Proef,
} from "@/lib/bouw/drie/materialen";
import { BAKSTEEN, PATROONMATEN, STALEN, eigenNaam, tint, willekeur } from "@/lib/bouw/drie/stalen";
import { MET_VOEG, PATRONEN, type Keuze, type Optie } from "@/lib/bouw/keuzes";
import { lijstKeuzes, lijstOpties } from "@/lib/bouw/regie-opslag";

const keuze = (id: number, titel: string, categorie: Keuze["categorie"], ruimte_ids: number[] = [], gekozen: number | null = null): Keuze => ({
  id,
  titel,
  categorie,
  omschrijving: null,
  deadline: null,
  planning_id: null,
  levertermijn_weken: null,
  eenheid: "m2",
  hoeveelheid: null,
  partij_id: null,
  gekozen_optie_id: gekozen,
  beslist_op: null,
  beslist_door: null,
  ruimte_ids,
});

const optie = (id: number, keuze_id: number, naam: string, velden: Partial<Optie> = {}): Optie => ({
  id,
  keuze_id,
  naam,
  leverancier_id: null,
  prijs: null,
  basis: false,
  kleur: null,
  patroon: null,
  voegkleur: null,
  url: null,
  foto_bestand_id: null,
  referentie_bestand_id: null,
  staal: null,
  opmerking: null,
  volgorde: 0,
  ...velden,
});

describe("de keuze van een plek", () => {
  const keuzes = [
    keuze(1, "Voegwerk", "gevel"),
    keuze(2, "Gevelsteen en voeg", "gevel"),
    keuze(3, "Dakgoten en regenpijpen", "dak"),
    keuze(4, "Vloer leefruimte en keuken", "vloeren", [10, 11]),
    keuze(5, "Tegels keuken", "sanitair", [11]),
  ];

  it("kiest de keuze met de titel van het slot, ook zonder opties", () => {
    expect(keuzeVoorPlek("gevel", null, keuzes, () => false)?.id).toBe(2);
    // Zonder Gevelsteen: de eerste met opties, maar niet het voegwerk.
    const zonder = keuzes.filter((k) => k.id !== 2);
    expect(keuzeVoorPlek("gevel", null, [...zonder, keuze(8, "Gevelbekleding", "gevel")], () => true)?.id).toBe(8);
    expect(keuzeVoorPlek("gevel", null, zonder, (id) => id === 1)).toBeNull();
    expect(keuzeVoorPlek("gevel", null, [...zonder, keuze(8, "Gevelbekleding", "gevel")], () => false)).toBeNull();
    // Dakgoten is geen dakbedekking: zonder opties is er nog geen keuze voor het dak.
    expect(keuzeVoorPlek("dak", null, keuzes, () => false)).toBeNull();
  });

  it("geeft een vloer de keuze van haar ruimte, met voorrang voor een met opties", () => {
    expect(keuzeVoorPlek("vloer", 10, keuzes, () => false)?.id).toBe(4);
    expect(keuzeVoorPlek("vloer", 11, keuzes, () => false)?.id).toBe(4);
    expect(keuzeVoorPlek("vloer", 11, keuzes, (id) => id === 5)?.id).toBe(5);
    expect(keuzeVoorPlek("vloer", 12, keuzes, () => true)).toBeNull();
    expect(keuzeVoorPlek("vloer", null, keuzes, () => true)).toBeNull();
  });

  it("noemt een nieuwe vloerkeuze naar de ruimte", () => {
    expect(vloertitel("Badkamer")).toBe("Vloer badkamer");
    expect(vloertitel("BADKAMER 2")).toBe("Vloer badkamer 2");
    expect(vloertitel("Bureau  Jan")).toBe("Vloer bureau Jan");
    expect(vloertitel("  ")).toBe("Vloer");
  });
});

describe("de materialen uit de keuzes", () => {
  const keuzes = [
    keuze(1, "Voegwerk", "gevel"),
    keuze(2, "Gevelsteen", "gevel", [], 21),
    keuze(4, "Vloer leefruimte", "vloeren", [10]),
    keuze(6, "Vloer zolder", "vloeren"),
    keuze(7, "Keuken", "keuken"),
  ];
  const opties = [
    optie(11, 1, "Grijze voeg", { kleur: "#888888" }),
    optie(20, 2, "Rood", { kleur: "#9b4a33" }),
    optie(21, 2, "Geel", { kleur: "#c8a46e", patroon: "baksteen", voegkleur: "#eeeeee" }),
    optie(22, 2, "Foto zonder link", { foto_bestand_id: 99 }),
    optie(40, 4, "Eik", { patroon: "parket" }),
    optie(41, 4, "Foto", { foto_bestand_id: 5 }),
  ];
  const fotos = new Map([[5, "https://opslag.voorbeeld/eik.jpg"]]);

  it("houdt per slot één keuze, en elke vloer met ruimtes", () => {
    const materialen = materiaalkeuzes(keuzes, opties, [], fotos, "jan@voorbeeld.be");
    expect(materialen.map((m) => [m.keuzeId, m.slot])).toEqual([
      [2, "gevel"],
      [4, "vloer"],
    ]);
    // Een optie met enkel een patroon telt mee; een foto zonder link niet.
    expect(materialen[0].opties.map((o) => o.id)).toEqual([20, 21]);
    expect(materialen[0].standaard).toBe(21);
    expect(materialen[1].opties.map((o) => [o.id, o.foto])).toEqual([
      [40, null],
      [41, "https://opslag.voorbeeld/eik.jpg"],
    ]);
  });

  it("toont de gekozen optie, anders mijn voorkeur, anders de eerste", () => {
    const voorkeur = [{ keuze_id: 4, wie: "jan@voorbeeld.be", naam: "Jan", optie_id: 41 }];
    expect(materiaalkeuzes(keuzes, opties, voorkeur, fotos, "jan@voorbeeld.be")[1].standaard).toBe(41);
    expect(materiaalkeuzes(keuzes, opties, voorkeur, fotos, "sandra@voorbeeld.be")[1].standaard).toBe(40);
  });

  it("geeft een keuze zonder opties mee: daar komt een bewaard materiaal", () => {
    const zonder = materiaalkeuzes([keuze(2, "Gevelsteen", "gevel")], [], [], fotos, "jan@voorbeeld.be");
    expect(zonder).toEqual([{ keuzeId: 2, titel: "Gevelsteen", slot: "gevel", ruimteIds: [], opties: [], standaard: null }]);
  });
});

describe("wat er op een plek te zien is", () => {
  const materialen = materiaalkeuzes(
    [keuze(2, "Gevelsteen", "gevel"), keuze(4, "Vloer leefruimte", "vloeren", [10, 11]), keuze(5, "Vloer bureau", "vloeren", [12])],
    [optie(20, 2, "Geel", { kleur: "#c8a46e", patroon: "baksteen", voegkleur: "#eeeeee" }), optie(40, 4, "Eik", { kleur: "#c19a6b", patroon: "parket" })],
    [],
    new Map(),
    "jan@voorbeeld.be",
  );

  it("vindt de keuze van een slot en van een ruimte", () => {
    expect(keuzeVan("gevel", materialen)?.keuzeId).toBe(2);
    expect(keuzeVan("vloer", materialen, 11)?.keuzeId).toBe(4);
    expect(keuzeVan("vloer", materialen, 12)?.keuzeId).toBe(5);
    expect(keuzeVan("vloer", materialen, 13)).toBeNull();
    expect(keuzeVan("dak", materialen)).toBeNull();
  });

  it("toont wat er uitgeprobeerd wordt, anders de keuze, anders de standaardkleur", () => {
    const leeg = new Map<string, Proef>();
    expect(materiaalVan("gevel", materialen, leeg)).toMatchObject({
      materiaal: { kleur: "#c8a46e", patroon: "baksteen", voegkleur: "#eeeeee" },
      naam: "Geel",
      optieId: 20,
      bron: "keuze",
    });
    expect(materiaalVan("dak", materialen, leeg)).toMatchObject({ materiaal: { kleur: STANDAARDKLEUREN.dak, patroon: null }, bron: "standaard" });
    // Een vloer per ruimte: de ruimte zonder keuze-opties krijgt de standaard.
    expect(materiaalVan("vloer", materialen, leeg, 10).naam).toBe("Eik");
    expect(materiaalVan("vloer", materialen, leeg, 12).bron).toBe("standaard");

    const proef = new Map<string, Proef>([
      [proefsleutel("gevel"), { naam: "Witte crepi", materiaal: { kleur: "#f0ede5", foto: null, patroon: "crepi", voegkleur: null }, optieId: null }],
      [proefsleutel("vloer", 12), { naam: "Gietvloer", materiaal: { kleur: "#b1aea7", foto: null, patroon: "beton", voegkleur: null }, optieId: null }],
    ]);
    expect(materiaalVan("gevel", materialen, proef)).toMatchObject({ naam: "Witte crepi", bron: "proef", optieId: null });
    expect(materiaalVan("vloer", materialen, proef, 12).naam).toBe("Gietvloer");
    expect(materiaalVan("vloer", materialen, proef, 10).naam).toBe("Eik");
  });

  it("herkent een staal dat al een optie is", () => {
    const gevel = keuzeVan("gevel", materialen);
    expect(bewaardAls(gevel, { kleur: "#c8a46e", foto: null, patroon: "baksteen", voegkleur: "#eeeeee" })?.id).toBe(20);
    expect(bewaardAls(gevel, { kleur: "#c8a46e", foto: null, patroon: "baksteen", voegkleur: "#ffffff" })).toBeNull();
    expect(bewaardAls(null, { kleur: "#c8a46e", foto: null, patroon: null, voegkleur: null })).toBeNull();
  });
});

describe("een materiaal bewaren: wat de browser stuurt", () => {
  const goed = { slot: "gevel", ruimteId: null, keuzeId: 2, naam: "  Rode   baksteen ", kleur: "#9B4A33", patroon: "baksteen", voegkleur: "#C9C2B8" };

  it("neemt een goede vraag over, opgekuist", () => {
    expect(schoneMateriaalvraag(goed)).toEqual({
      slot: "gevel",
      ruimteId: null,
      keuzeId: 2,
      naam: "Rode baksteen",
      kleur: "#9b4a33",
      patroon: "baksteen",
      voegkleur: "#c9c2b8",
      fotos: null,
      url: null,
    });
    expect(schoneMateriaalvraag({ ...goed, slot: "vloer", ruimteId: 12, keuzeId: null, patroon: "parket" })).toMatchObject({
      ruimteId: 12,
      keuzeId: null,
      voegkleur: null,
    });
    expect(schoneMateriaalvraag({ ...goed, patroon: null, voegkleur: null })).toMatchObject({ patroon: null, voegkleur: null });
  });

  it("neemt de foto's van een site of foto mee, met hoe 3D ze gebruikt", () => {
    const staal = { bron: "staal", uitsnede: [0.2, 0.35, 0.8, 0.65], breedte: null };
    const metFotos = schoneMateriaalvraag({ ...goed, fotos: { foto: 501, referentie: 502, staal }, url: "www.voorbeeld.be/steen" });
    expect(metFotos).toMatchObject({ fotos: { foto: 501, referentie: 502, staal }, url: "https://www.voorbeeld.be/steen" });
    // Enkel een referentie: de kleuren komen uit de foto, 3D tekent het patroon.
    expect(schoneMateriaalvraag({ ...goed, fotos: { foto: null, referentie: 502, staal: null } })?.fotos).toEqual({ foto: null, referentie: 502, staal: null });
    // Meubels en kasten hebben hun eigen keuze.
    expect(schoneMateriaalvraag({ ...goed, slot: "meubel", keuzeId: null })?.slot).toBe("meubel");
    for (const fout of [
      { fotos: { foto: null, referentie: 502, staal } },
      { fotos: { foto: -1, referentie: null, staal: null } },
      { fotos: { foto: null, referentie: null, staal: null } },
      { fotos: { foto: 501, referentie: null, staal: { bron: "vlak", uitsnede: [0, 0, 1, 1], breedte: null } } },
      { fotos: "ja" },
      { url: "javascript:alert(1)" },
    ]) {
      expect(schoneMateriaalvraag({ ...goed, ...fout }), JSON.stringify(fout)).toBeNull();
    }
  });

  it("weigert wat niet klopt", () => {
    for (const fout of [
      null,
      "gevel",
      { ...goed, slot: "kelder" },
      { ...goed, slot: "vloer" },
      { ...goed, ruimteId: 12 },
      { ...goed, keuzeId: -1 },
      { ...goed, keuzeId: "2" },
      { ...goed, naam: " " },
      { ...goed, naam: "x".repeat(81) },
      { ...goed, kleur: "rood" },
      { ...goed, kleur: "#fff" },
      { ...goed, patroon: "marmer" },
      { ...goed, voegkleur: "grijs" },
    ]) {
      expect(schoneMateriaalvraag(fout)).toBeNull();
    }
  });
});

describe("de stalen", () => {
  it("zijn elk te bewaren, met een voeg enkel bij baksteen en tegels", () => {
    for (const [slot, stalen] of Object.entries(STALEN)) {
      expect(new Set(stalen.map((s) => s.naam)).size).toBe(stalen.length);
      for (const { naam, materiaal } of stalen) {
        expect(materiaal.kleur).toMatch(/^#[0-9a-f]{6}$/);
        if (materiaal.patroon) expect(PATRONEN).toContain(materiaal.patroon);
        expect(materiaal.voegkleur !== null).toBe(materiaal.patroon !== null && MET_VOEG.includes(materiaal.patroon));
        const vraag = schoneMateriaalvraag({ slot, ruimteId: slot === "vloer" ? 1 : null, keuzeId: null, naam, ...materiaal });
        expect(vraag?.naam).toBe(naam);
      }
    }
  });

  it("liggen op echte schaal", () => {
    expect(PATROONMATEN.baksteen.breedte).toBeCloseTo(0.888);
    expect(PATROONMATEN.baksteen.hoogte).toBeCloseTo(0.496);
    expect(PATROONMATEN.baksteen.breedte / PATROONMATEN.baksteen.kolommen - BAKSTEEN.voeg).toBeCloseTo(BAKSTEEN.lengte);
    for (const patroon of PATRONEN) expect(PATROONMATEN[patroon].breedte).toBeGreaterThan(0.3);
  });

  it("geven een eigen kleur een naam, en altijd dezelfde tinten", () => {
    expect(eigenNaam({ kleur: "#a65a3a", patroon: "baksteen" })).toBe("Baksteen #a65a3a");
    expect(eigenNaam({ kleur: "#a65a3a", patroon: null })).toBe("Kleur #a65a3a");
    const a = willekeur("baksteen#a65a3a");
    const b = willekeur("baksteen#a65a3a");
    const reeks = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(reeks);
    for (const getal of reeks) expect(getal).toBeGreaterThanOrEqual(0);
    expect(willekeur("leien")()).not.toBe(reeks[0]);
    expect(tint("#804020", 1.5)).toBe("#c06030");
    expect(tint("#ffffff", 2)).toBe("#ffffff");
  });
});

describe("een vrije naam bij de keuze", () => {
  it("houdt de naam, of zet er (2), (3)… achter, binnen de 80 tekens", () => {
    expect(vrijeNaam("Eik fineer", ["Notelaar"])).toBe("Eik fineer");
    expect(vrijeNaam("Eik fineer", ["eik fineer "])).toBe("Eik fineer (2)");
    expect(vrijeNaam("Eik fineer", ["Eik fineer", "Eik fineer (2)"])).toBe("Eik fineer (3)");
    const lang = "x".repeat(80);
    expect(vrijeNaam(lang, [lang])).toBe(`${"x".repeat(76)} (2)`);
  });
});

describe("een materiaal uit 3D bewaren als optie", () => {
  const ik = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder" };
  let db: ReturnType<typeof nepSupabase>;

  beforeEach(() => {
    nep.huis = { ...TESTHUIS };
    db = nepSupabase({
      bouw_huizen: [{ ...TESTHUIS }],
      bouw_gebouwen: metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]),
      bouw_verdiepingen: [{ id: 1, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0 }],
      bouw_ruimtes: [
        { id: 11, verdieping_id: 1, naam: "Leefruimte" },
        { id: 12, verdieping_id: 1, naam: "Badkamer" },
      ],
      bouw_keuzes: metHuis([
        { id: 1, titel: "Voegwerk", categorie: "gevel", eenheid: "totaal" },
        { id: 2, titel: "Vloer leefruimte", categorie: "vloeren", eenheid: "m2" },
      ]),
      bouw_opties: [{ id: 30, keuze_id: 1, naam: "Grijze voeg", kleur: "#888888", volgorde: 0 }],
      bouw_keuze_ruimtes: [{ keuze_id: 2, ruimte_id: 11 }],
      bouw_planning: [],
      bouw_partijen: [],
      bouw_voorkeuren: [],
    });
    nep.client = db.client;
  });

  const vraag = (velden: Record<string, unknown> = {}) => ({
    slot: "gevel",
    ruimteId: null,
    keuzeId: null,
    naam: "Rode baksteen",
    kleur: "#9b4a33",
    patroon: "baksteen",
    voegkleur: "#c9c2b8",
    ...velden,
  });

  it("maakt de keuze Gevelsteen, en bewaart dezelfde optie maar één keer", async () => {
    nep.ik = ik;
    const eerste = await bewaarMateriaalActie(1, vraag());
    expect(eerste).toMatchObject({ ok: true, data: { titel: "Gevelsteen", nieuweKeuze: true, bestond: false } });
    const keuzes = await lijstKeuzes(1);
    const gevelsteen = keuzes.find((k) => k.titel === "Gevelsteen")!;
    expect(gevelsteen).toMatchObject({ categorie: "gevel", eenheid: "m2", levertermijn_weken: 8 });
    expect(await lijstOpties(1, [gevelsteen.id])).toEqual([
      expect.objectContaining({ naam: "Rode baksteen", kleur: "#9b4a33", patroon: "baksteen", voegkleur: "#c9c2b8", prijs: null }),
    ]);
    // Nog eens: niets nieuws, ook niet als 3D de nieuwe keuze nog niet kende.
    const tweede = await bewaarMateriaalActie(1, vraag({ naam: "Nog eens" }));
    expect(tweede).toMatchObject({ ok: true, data: { keuzeId: gevelsteen.id, bestond: true, nieuweKeuze: false } });
    expect(await lijstOpties(1, [gevelsteen.id])).toHaveLength(1);
  });

  it("legt een vloer bij de keuze van de ruimte, of maakt er een voor die ruimte", async () => {
    nep.ik = ik;
    const leefruimte = await bewaarMateriaalActie(1, vraag({ slot: "vloer", ruimteId: 11, naam: "Eik", kleur: "#c19a6b", patroon: "parket", voegkleur: null }));
    expect(leefruimte).toMatchObject({ ok: true, data: { keuzeId: 2, nieuweKeuze: false } });
    const badkamer = await bewaarMateriaalActie(1, vraag({ slot: "vloer", ruimteId: 12, naam: "Grijze tegels", kleur: "#cfcac2", patroon: "tegels", voegkleur: "#bdb7ad" }));
    expect(badkamer).toMatchObject({ ok: true, data: { titel: "Vloer badkamer", nieuweKeuze: true } });
    const nieuw = (await lijstKeuzes(1)).find((k) => k.titel === "Vloer badkamer")!;
    expect(nieuw).toMatchObject({ categorie: "vloeren", ruimte_ids: [12] });
    // Een keuze die niet bij de plek past, telt niet: dan de keuze van de ruimte.
    const verkeerd = await bewaarMateriaalActie(1, vraag({ slot: "vloer", ruimteId: 11, keuzeId: 1, naam: "Beton", kleur: "#b1aea7", patroon: "beton", voegkleur: null }));
    expect(verkeerd).toMatchObject({ ok: true, data: { keuzeId: 2 } });
  });

  it("bewaart een materiaal van een foto bij Maatwerk en meubels, met een vrije naam", async () => {
    nep.ik = ik;
    const bestand = (id: number, doel: string) => ({ id, huis_id: 1, doel, status: "klaar", pad: `1/${id}.jpg`, mime_type: "image/jpeg", naam: `${id}.jpg`, grootte_bytes: 1000 });
    db.tabellen.bouw_bestanden = [bestand(70, "foto"), bestand(71, "foto"), bestand(72, "plan")];
    const staal = { bron: "vlak", uitsnede: [0.1, 0.15, 0.85, 0.8], breedte: 0.6 };
    const eik = (foto: number) => vraag({ slot: "meubel", naam: "Eik fineer", kleur: "#b48759", patroon: null, voegkleur: null, fotos: { foto, referentie: null, staal }, url: "https://www.voorbeeld.be/eik" });
    const eerste = await bewaarMateriaalActie(1, eik(70));
    expect(eerste).toMatchObject({ ok: true, data: { titel: "Maatwerk en meubels", naam: "Eik fineer", nieuweKeuze: true, bestond: false } });
    const meubels = (await lijstKeuzes(1)).find((k) => k.titel === "Maatwerk en meubels")!;
    expect(meubels.categorie).toBe("binnenschrijnwerk");
    // Met foto's altijd een nieuwe optie, met (2) achter dezelfde naam.
    const tweede = await bewaarMateriaalActie(1, eik(71));
    expect(tweede).toMatchObject({ ok: true, data: { keuzeId: meubels.id, naam: "Eik fineer (2)", bestond: false } });
    expect(await lijstOpties(1, [meubels.id])).toEqual([
      expect.objectContaining({ naam: "Eik fineer", foto_bestand_id: 70, referentie_bestand_id: null, staal, url: "https://www.voorbeeld.be/eik" }),
      expect.objectContaining({ naam: "Eik fineer (2)", foto_bestand_id: 71 }),
    ]);
    // Een plan is geen foto.
    expect(await bewaarMateriaalActie(1, eik(72))).toMatchObject({ ok: false, melding: expect.stringContaining("geen foto") });
  });

  it("weigert wie geen toegang heeft, een bestaand huis, en een onbekende ruimte", async () => {
    nep.ik = null;
    expect(await bewaarMateriaalActie(1, vraag())).toMatchObject({ ok: false });
    nep.ik = ik;
    expect(await bewaarMateriaalActie(1, vraag({ kleur: "rood" }))).toMatchObject({ ok: false, melding: expect.stringContaining("klopt niet") });
    expect(await bewaarMateriaalActie(1, vraag({ slot: "vloer", ruimteId: 99 }))).toMatchObject({ ok: false, melding: expect.stringContaining("ruimte") });
    nep.huis = { ...TESTHUIS, soort: "bestaand" };
    expect(await bewaarMateriaalActie(1, vraag())).toMatchObject({ ok: false, melding: expect.stringContaining("bestaand huis") });
    expect(await lijstKeuzes(1)).toHaveLength(2);
  });
});
