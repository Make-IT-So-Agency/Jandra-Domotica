import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown, ik: null as unknown, huis: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/bouw/huistoegang", () => ({
  huisgebruiker: async () => (nep.ik && nep.huis ? { ik: nep.ik, huis: nep.huis } : null),
}));

import { bewaarDelenActie } from "@/app/vastgoed/[huis]/3d/acties";
import { leesVerdieping } from "@/lib/bouw/opslag";

import {
  deelnaam,
  deelsleutel,
  deelVanSleutel,
  grootteVan,
  hoekenVan,
  kleefOpMuur,
  knipGevel,
  knipVlak,
  knipWand,
  materiaalVanDeel,
  MAX_DELEN,
  muurvlakBij,
  ruimteVoor,
  scenedelen,
  schoneDelen,
  slotVanDeel,
  windrichting,
  zelfdeVorm,
  type Deel,
  type Muurknip,
  type Wand,
} from "@/lib/bouw/drie/delen";
import type { Materiaalkeuze } from "@/lib/bouw/drie/materialen";
import { maakModel, type Invoerverdieping } from "@/lib/bouw/drie/model";
import { nettoOppervlakte, oppervlakte } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

// Hetzelfde huis als in bouw-drie.test.ts: een leefruimte links, een keuken rechts, buitenmuren van 40 cm,
// een raam van 2 m in de linkermuur, een voordeur onderaan en een binnendeur van 90 cm.
const LINKS = { id: 1, naam: "Leefruimte", soort: "leefruimte" as const, ringen: [rechthoek(0.4, 0.4, 5, 7.6)], plafondhoogte: null };
const RECHTS = { id: 2, naam: "Keuken", soort: "keuken" as const, ringen: [rechthoek(5.14, 0.4, 9.6, 7.6)], plafondhoogte: null };
const MUREN: Xy[][] = [
  rechthoek(0, 0, 10, 0.4),
  rechthoek(9.6, 0.4, 10, 7.6),
  rechthoek(0, 7.6, 7, 8),
  rechthoek(8, 7.6, 10, 8),
  rechthoek(0, 0.4, 0.4, 2),
  rechthoek(0, 4, 0.4, 7.6),
  rechthoek(5, 0.4, 5.14, 3),
  rechthoek(5, 3.9, 5.14, 7.6),
];

const verdieping: Invoerverdieping = {
  id: 10,
  naam: "Gelijkvloers",
  gebouwId: 1,
  volgorde: 0,
  vloerpeil: 0,
  plafondhoogte: 2.8,
  verdiepingshoogte: 3.2,
  ruimtes: [LINKS, RECHTS],
  muren: MUREN,
  openingen: [
    { soort: "deur", x: 5.14, y: 3.9, breedte: 0.9, hoogte: null },
    { soort: "deur", x: 8, y: 7.6, breedte: 1, hoogte: null },
    { soort: "raam", x: -0.4, y: 3, breedte: 2, hoogte: 1.25 },
  ],
};

const model = maakModel([{ id: 1, dak: { type: "plat", helling: 35, nok: "x", overstek: 0.3 } }], [verdieping]);
const gelijkvloers = model.verdiepingen[0];

const materiaal = { naam: "Hout naturel", kleur: "#8b6845", patroon: "planken" as const, voegkleur: null, optieId: null };

describe("delen nakijken", () => {
  it("houdt wat klopt, afgerond, en zet een muur van links naar rechts", () => {
    const [muur, wanden, vloer] = schoneDelen([
      // Een gevel die naar links kijkt, met a en b verkeerd om: van buiten gezien loopt ze van boven naar onder.
      { id: "abc123", naam: "  Westgevel ", vorm: { soort: "muur", zijde: "gevel", a: [0, 8.0004], b: [0, 0], n: [-1, 0], onder: 0, boven: 3.2049 }, materiaal },
      { id: "def456", naam: "Muren badkamer", vorm: { soort: "wanden", ruimteId: 7, onder: 0, boven: 1.2 }, materiaal: { naam: "Witte tegels", kleur: "#F2F1ED", patroon: "tegels", voegkleur: "#D9D6CF", optieId: 12 } },
      { id: "ghi789", naam: "Tegels keuken", vorm: { soort: "vloer", veelhoek: [...rechthoek(6, 1, 9, 4), [6, 1]] }, materiaal: { naam: "", kleur: "#cfcac2", patroon: "parket", voegkleur: "#000000", optieId: null } },
    ]);
    expect(muur.vorm).toEqual({ soort: "muur", zijde: "gevel", a: [0, 0], b: [0, 8], n: [-1, 0], onder: 0, boven: 3.2 });
    expect(muur.naam).toBe("Westgevel");
    expect(wanden.materiaal).toEqual({ naam: "Witte tegels", kleur: "#f2f1ed", patroon: "tegels", voegkleur: "#d9d6cf", optieId: 12 });
    // Het punt dat het eerste herhaalt, valt weg; parket heeft geen voeg; zonder naam een eigen naam.
    expect(vloer.vorm).toEqual({ soort: "vloer", veelhoek: rechthoek(6, 1, 9, 4) });
    expect(vloer.materiaal).toMatchObject({ naam: "Parket #cfcac2", voegkleur: null });
  });

  it("laat weg wat niet klopt", () => {
    const goed = { id: "aaaaaa", naam: "Deel", vorm: { soort: "dak", veelhoek: rechthoek(0, 0, 2, 2) }, materiaal };
    expect(schoneDelen("niets")).toEqual([]);
    expect(
      schoneDelen([
        goed,
        // Dezelfde id, een id die niet mag, een kleur die geen kleur is.
        { ...goed },
        { ...goed, id: "AB" },
        { ...goed, id: "bbbbbb", materiaal: { ...materiaal, kleur: "rood" } },
        // Een vloer van drie punten op een lijn, een muur zonder hoogte, een onbekende kant.
        { ...goed, id: "cccccc", vorm: { soort: "vloer", veelhoek: [[0, 0], [1, 0], [2, 0]] } },
        { ...goed, id: "dddddd", vorm: { soort: "muur", zijde: "gevel", a: [0, 0], b: [2, 0], n: [0, 1], onder: 1, boven: 1.01 } },
        { ...goed, id: "eeeeee", vorm: { soort: "muur", zijde: "dak", a: [0, 0], b: [2, 0], n: [0, 1], onder: 0, boven: 1 } },
        // Een kant die langs de muur loopt in plaats van ervan weg.
        { ...goed, id: "ffffff", vorm: { soort: "muur", zijde: "gevel", a: [0, 0], b: [2, 0], n: [1, 0], onder: 0, boven: 1 } },
        { ...goed, id: "gggggg", vorm: { soort: "wanden", ruimteId: -1, onder: 0, boven: 1 } },
      ]).map((deel) => deel.id),
    ).toEqual(["aaaaaa"]);
    const veel = Array.from({ length: MAX_DELEN + 5 }, (_, i) => ({ ...goed, id: `deel${String(i).padStart(4, "0")}` }));
    expect(schoneDelen(veel)).toHaveLength(MAX_DELEN);
  });

  it("kent de sleutels, de onderdelen en de grootte", () => {
    expect(deelsleutel("abc123")).toBe("deel:abc123");
    expect(deelVanSleutel("deel:abc123")).toBe("abc123");
    expect(deelVanSleutel("vloer:3")).toBeNull();
    expect(slotVanDeel({ soort: "muur", zijde: "gevel", a: [0, 0], b: [1, 0], n: [0, 1], onder: 0, boven: 1 })).toBe("gevel");
    expect(slotVanDeel({ soort: "wanden", ruimteId: 1, onder: 0, boven: 1 })).toBe("binnenmuur");
    expect(slotVanDeel({ soort: "dak", veelhoek: rechthoek(0, 0, 1, 1) })).toBe("dak");
    expect(grootteVan({ soort: "muur", zijde: "gevel", a: [0, 0], b: [4, 0], n: [0, 1], onder: 0.5, boven: 2 })).toBeCloseTo(6);
    expect(grootteVan({ soort: "vloer", veelhoek: rechthoek(0, 0, 3, 2) })).toBeCloseTo(6);
    const vorm = { soort: "vloer" as const, veelhoek: rechthoek(0, 0, 3, 2) };
    expect(zelfdeVorm(vorm, { soort: "vloer", veelhoek: rechthoek(0, 0, 3, 2) })).toBe(true);
    expect(zelfdeVorm(vorm, { soort: "dak", veelhoek: rechthoek(0, 0, 3, 2) })).toBe(false);
  });
});

describe("het muurvlak onder een tik", () => {
  it("neemt de gevel van hoek tot hoek, over het raam heen", () => {
    const vlak = muurvlakBij(gelijkvloers, [0, 1], [-1, 0])!;
    // Van buiten gezien, naar het oosten kijkend, loopt het van het noorden (boven) naar het zuiden.
    expect(vlak).toMatchObject({ zijde: "gevel", a: [0, 0], b: [0, 8], n: [-1, 0] });
    expect(vlak.openingen).toEqual([{ van: 2, tot: 4, onder: 0.9, boven: 2.15 }]);
  });

  it("neemt een binnenmuur van één ruimte, tot de muren haaks erop, ook over een deur", () => {
    // De binnenkant van de linkermuur, in de leefruimte: van onder naar boven gezien vanuit de ruimte.
    const links = muurvlakBij(gelijkvloers, [0.41, 5], [1, 0])!;
    expect(links).toMatchObject({ zijde: "binnenmuur", a: [0.4, 7.6], b: [0.4, 0.4] });
    // De muur tussen leefruimte en keuken, aan de kant van de leefruimte, met de deur erin.
    const tussen = muurvlakBij(gelijkvloers, [5, 1], [-1, 0])!;
    expect(tussen).toMatchObject({ zijde: "binnenmuur", a: [5, 0.4], b: [5, 7.6] });
    expect(tussen.openingen).toHaveLength(1);
    // De noordmuur van de keuken stopt aan de binnenmuur, en loopt niet door in de leefruimte. Wie in de keuken
    // naar het noorden kijkt, heeft het westen links.
    expect(muurvlakBij(gelijkvloers, [7, 0.4], [0, 1])).toMatchObject({ a: [5.14, 0.4], b: [9.6, 0.4] });
  });

  it("vindt niets naast de muren, of met de verkeerde kant", () => {
    expect(muurvlakBij(gelijkvloers, [2.5, 4], [1, 0])).toBeNull();
    // De binnenkant van de buitenmuur bestaat, maar niet met de kant naar buiten.
    expect(muurvlakBij(gelijkvloers, [0.4, 5], [-1, 0])).toBeNull();
  });

  it("weet welke ruimte voor een muur ligt", () => {
    expect(ruimteVoor(gelijkvloers.vloeren, [0.4, 7.6], [0.4, 0.4], [1, 0])).toBe(1);
    expect(ruimteVoor(gelijkvloers.vloeren, [5.14, 0.4], [5.14, 3], [1, 0])).toBe(2);
    expect(ruimteVoor(gelijkvloers.vloeren, [0, 0], [0, 8], [-1, 0])).toBeNull();
  });

  it("geeft de hoeken om aan te kleven, elk één keer", () => {
    const hoeken = hoekenVan(gelijkvloers);
    expect(hoeken).toContainEqual([5.14, 0.4]);
    expect(new Set(hoeken.map((p) => p.join(","))).size).toBe(hoeken.length);
  });
});

const som = (stukken: Wand[]) => stukken.reduce((totaal, s) => totaal + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * (s.z1 - s.z0), 0);

describe("vlakken knippen", () => {
  const westgevel: Muurknip = { sleutel: "deel:hout", zijde: "gevel", a: [0, 2], r: [0, 1], n: [-1, 0], lengte: 2, z0: 1, z1: 5 };

  it("knipt een stuk gevel uit een wand, en laat de andere kant en een andere lijn met rust", () => {
    const wand: Wand = { sleutel: "gevel", a: [0, 0], b: [0, 8], z0: 0, z1: 2.95 };
    const stukken = knipWand(wand, [-1, 0], null, [westgevel], []);
    expect(som(stukken)).toBeCloseTo(8 * 2.95);
    const hout = stukken.filter((s) => s.sleutel === "deel:hout");
    expect(hout).toEqual([{ sleutel: "deel:hout", a: [0, 2], b: [0, 4], z0: 1, z1: 2.95 }]);
    // De binnenkant van dezelfde muur, een wand op een andere lijn, of een binnenmuur: niets.
    expect(knipWand({ ...wand, sleutel: "binnenmuur" }, [1, 0], 1, [westgevel], [])).toHaveLength(1);
    expect(knipWand({ ...wand, a: [0.4, 0], b: [0.4, 8] }, [-1, 0], null, [westgevel], [])).toHaveLength(1);
  });

  it("legt de muren van een ruimte onder een rechthoek op een muur", () => {
    const wand: Wand = { sleutel: "binnenmuur", a: [0.4, 7.6], b: [0.4, 0.4], z0: 0, z1: 2.95 };
    const tegels = { sleutel: "deel:tegels", ruimteId: 1, z0: 0, z1: 1.2 };
    const verf: Muurknip = { sleutel: "deel:verf", zijde: "binnenmuur", a: [0.4, 7.6], r: [0, -1], n: [1, 0], lengte: 2, z0: 0, z1: 2.95 };
    const stukken = knipWand(wand, [1, 0], 1, [verf], [tegels]);
    expect(som(stukken)).toBeCloseTo(7.2 * 2.95);
    const per = (sleutel: string) => som(stukken.filter((s) => s.sleutel === sleutel));
    expect(per("deel:verf")).toBeCloseTo(2 * 2.95);
    expect(per("deel:tegels")).toBeCloseTo(5.2 * 1.2);
    // Een andere ruimte heeft die tegels niet.
    expect(knipWand(wand, [1, 0], 2, [], [tegels])).toEqual([wand]);
  });

  it("laat een deel doorlopen tot in de punt van de gevel onder het dak", () => {
    // Een puntgevel van 8 m breed op x = 0, van 3 tot 6 m hoog, en een deel vanaf 4 m.
    const punten: [number, number, number][] = [[0, 0, 3], [0, 8, 3], [0, 4, 6]];
    const stukken = knipGevel(punten, [-1, 0], [{ ...westgevel, a: [0, 0], lengte: 8, z0: 4, z1: 20 }])!;
    const opp = (sleutel: string) =>
      stukken
        .filter((s) => s.sleutel === sleutel)
        .reduce((totaal, s) => totaal + nettoOppervlakte(s.veelhoek.map((ring) => ring.map(([, y, z]): Xy => [y, z]))), 0);
    expect(opp("gevel") + opp("deel:hout")).toBeCloseTo(12);
    // Boven 4 m: een driehoek van 2/3 van de breedte en 2 m hoog.
    expect(opp("deel:hout")).toBeCloseTo(0.5 * (8 * (2 / 3)) * 2);
    expect(knipGevel(punten, [1, 0], [westgevel])).toBeNull();
  });

  it("knipt een vloer, met het laatste deel bovenaan", () => {
    const vloer = [rechthoek(0, 0, 4, 4)];
    const stukken = knipVlak(vloer, [
      { sleutel: "deel:a", veelhoek: rechthoek(0, 0, 2, 2) },
      { sleutel: "deel:b", veelhoek: rechthoek(1, 1, 3, 3) },
    ], "vloer:1");
    const opp = (sleutel: string) => stukken.filter((s) => s.sleutel === sleutel).reduce((t, s) => t + nettoOppervlakte(s.veelhoek), 0);
    expect(opp("deel:b")).toBeCloseTo(4);
    expect(opp("deel:a")).toBeCloseTo(3);
    expect(opp("vloer:1")).toBeCloseTo(9);
    expect(knipVlak(vloer, [], "vloer:1")).toEqual([{ sleutel: "vloer:1", veelhoek: vloer }]);
  });

  it("zet de delen per gebouw en verdieping, in hoogte boven ±0", () => {
    const delen = new Map<number, Deel[]>([
      [
        11,
        [
          { id: "aaaaaa", naam: "Hout", vorm: { soort: "muur", zijde: "gevel", a: [0, 0], b: [0, 8], n: [-1, 0], onder: 0, boven: 2.9 }, materiaal },
          { id: "bbbbbb", naam: "Tegels", vorm: { soort: "wanden", ruimteId: 4, onder: 0, boven: 1.2 }, materiaal },
          { id: "cccccc", naam: "Vloer", vorm: { soort: "vloer", veelhoek: rechthoek(0, 0, 1, 1) }, materiaal },
          { id: "dddddd", naam: "Groendak", vorm: { soort: "dak", veelhoek: rechthoek(0, 0, 1, 1) }, materiaal },
        ],
      ],
      // Een verdieping die niet (meer) in het model zit: niets.
      [99, [{ id: "eeeeee", naam: "Weg", vorm: { soort: "vloer", veelhoek: rechthoek(0, 0, 1, 1) }, materiaal }]],
    ]);
    const uit = scenedelen([{ id: 11, gebouwId: 3, z0: 3.2 }], delen);
    expect(uit.muren.get(3)).toEqual([{ sleutel: "deel:aaaaaa", zijde: "gevel", a: [0, 0], r: [0, 1], n: [-1, 0], lengte: 8, z0: 3.2, z1: 6.1 }]);
    expect(uit.wanden.get(11)).toEqual([{ sleutel: "deel:bbbbbb", ruimteId: 4, z0: 3.2, z1: 4.4 }]);
    expect(uit.vloeren.get(11)?.map((d) => d.sleutel)).toEqual(["deel:cccccc"]);
    expect(uit.daken.get(11)?.map((d) => d.sleutel)).toEqual(["deel:dddddd"]);
    expect(uit.vloeren.has(99)).toBe(false);
  });
});

describe("tekenen op een muur", () => {
  const vlak = { lengte: 8, hoogte: 2.95, openingen: [{ van: 2, tot: 4, onder: 0.9, boven: 2.15 }] };

  it("kleeft aan de randen, de ramen, de vloer en de bovenkant", () => {
    expect(kleefOpMuur(2.07, 0.86, vlak, 0.1)).toEqual([2, 0.9]);
    expect(kleefOpMuur(7.96, 2.9, vlak, 0.1)).toEqual([8, 2.95]);
    expect(kleefOpMuur(-0.3, 0.04, vlak, 0.1)).toEqual([0, 0]);
  });

  it("anders op 5 cm", () => {
    expect(kleefOpMuur(5.53, 1.42, vlak, 0.1)).toEqual([5.55, 1.4]);
  });
});

describe("namen en materialen", () => {
  it("geeft de windrichting met het noorden waar het ligt", () => {
    expect(windrichting([0, -1], 0)).toBe("noord");
    expect(windrichting([0, -1], 180)).toBe("zuid");
    expect(windrichting([1, 0], 0)).toBe("oost");
    expect(windrichting([-1, 1], 0)).toBe("zuidwest");
    expect(windrichting([1, 0], 90)).toBe("noord");
  });

  it("noemt een deel naar waar het ligt, zonder twee keer dezelfde naam", () => {
    const plaats = { verdieping: "Gelijkvloers", ruimte: "Badkamer", noorden: 0 };
    const gevel = { soort: "muur" as const, zijde: "gevel" as const, a: [0, 0] as Xy, b: [0, 8] as Xy, n: [-1, 0] as Xy, onder: 0, boven: 3 };
    expect(deelnaam(gevel, plaats)).toBe("Westgevel, gelijkvloers");
    expect(deelnaam(gevel, plaats, ["Westgevel, gelijkvloers"])).toBe("Westgevel, gelijkvloers 2");
    // Wie in de badkamer naar het westen kijkt, ziet de westmuur: de kant kijkt naar het oosten.
    expect(deelnaam({ ...gevel, zijde: "binnenmuur", n: [1, 0] }, plaats)).toBe("Badkamer, westmuur");
    expect(deelnaam({ soort: "wanden", ruimteId: 1, onder: 0, boven: 1.2 }, { ...plaats, ruimte: "BADKAMER" })).toBe("Muren badkamer");
    expect(deelnaam({ soort: "vloer", veelhoek: rechthoek(0, 0, 1, 1) }, { ...plaats, ruimte: "Keuken" })).toBe("Vloer keuken, deel");
    expect(deelnaam({ soort: "dak", veelhoek: rechthoek(0, 0, 1, 1) }, plaats)).toBe("Plat dak, deel");
  });

  it("toont de optie van een deel met haar foto, of anders zijn eigen kleur", () => {
    const keuzes: Materiaalkeuze[] = [
      {
        keuzeId: 1,
        titel: "Gevelsteen",
        slot: "gevel",
        ruimteIds: [],
        opties: [{ id: 5, naam: "Handvorm", kleur: null, foto: "https://opslag.test/foto", patroon: "baksteen", voegkleur: "#cccccc" }],
        standaard: 5,
      },
    ];
    expect(materiaalVanDeel({ materiaal: { ...materiaal, optieId: 5 } }, keuzes)).toMatchObject({ foto: "https://opslag.test/foto", patroon: "baksteen" });
    // De optie is weg: dan de eigen kleur van het deel.
    expect(materiaalVanDeel({ materiaal: { ...materiaal, optieId: 6 } }, keuzes)).toEqual({ kleur: "#8b6845", foto: null, patroon: "planken", voegkleur: null });
  });
});

describe("een echt plan, ruw", () => {
  it("vindt een vlak op elke muurrand van het model", () => {
    // Elke rand van elke muur hoort bij een vlak dat de rand bevat.
    for (const muur of gelijkvloers.muren) {
      muur.veelhoek.forEach((ring, i) =>
        ring.forEach((a, j) => {
          const b = ring[(j + 1) % ring.length];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
          const midden: Xy = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const vlak = muurvlakBij(gelijkvloers, midden, muur.zijden[i][j].n);
          expect(vlak, `${a} → ${b}`).not.toBeNull();
          expect(Math.abs(oppervlakte([vlak!.a, vlak!.b, midden]))).toBeLessThan(0.01);
        }),
      );
    }
  });
});

describe("delen bewaren", () => {
  const ik = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder" };
  let db: ReturnType<typeof nepSupabase>;

  beforeEach(() => {
    nep.huis = { ...TESTHUIS };
    nep.ik = ik;
    db = nepSupabase({
      bouw_huizen: [{ ...TESTHUIS }],
      bouw_gebouwen: metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]),
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0, delen: [] },
        { id: 2, gebouw_id: 1, naam: "Verdieping", volgorde: 1, delen: [] },
      ],
      bouw_ruimtes: [
        { id: 11, verdieping_id: 1, naam: "Leefruimte" },
        { id: 21, verdieping_id: 2, naam: "Badkamer" },
      ],
    });
    nep.client = db.client;
  });

  const gevel = { id: "aaaaaa", naam: "Westgevel", vorm: { soort: "muur", zijde: "gevel", a: [0, 0], b: [0, 8], n: [-1, 0], onder: 0, boven: 3.2 }, materiaal };

  it("bewaart de delen van een verdieping, nagekeken, en geeft ze terug", async () => {
    const uit = await bewaarDelenActie(1, { verdiepingId: 1, delen: [gevel] });
    expect(uit).toMatchObject({ ok: true, data: [{ id: "aaaaaa", naam: "Westgevel" }] });
    expect((await leesVerdieping(1, 1))?.delen).toEqual([{ ...gevel, vorm: { ...gevel.vorm, n: [-1, 0] } }]);
    // Alles samen: wat ontbreekt, is weg.
    expect(await bewaarDelenActie(1, { verdiepingId: 1, delen: [] })).toMatchObject({ ok: true, data: [] });
    expect((await leesVerdieping(1, 1))?.delen).toEqual([]);
  });

  it("houdt de muren van een ruimte enkel bij een ruimte van die verdieping", async () => {
    const wanden = (ruimteId: number) => ({ id: `wand${ruimteId}`, naam: "Muren", vorm: { soort: "wanden", ruimteId, onder: 0, boven: 1.2 }, materiaal });
    const uit = await bewaarDelenActie(1, { verdiepingId: 2, delen: [wanden(21), wanden(11)] });
    expect(uit).toMatchObject({ ok: true, data: [{ id: "wand21" }] });
  });

  it("weigert wie geen toegang heeft, een deel dat niet klopt, en een vreemde verdieping", async () => {
    nep.ik = null;
    expect(await bewaarDelenActie(1, { verdiepingId: 1, delen: [gevel] })).toMatchObject({ ok: false });
    nep.ik = ik;
    expect(await bewaarDelenActie(1, { verdiepingId: 1, delen: [{ ...gevel, id: "X" }] })).toMatchObject({ ok: false, melding: expect.stringContaining("klopt niet") });
    expect(await bewaarDelenActie(1, { verdiepingId: 1, delen: "niets" })).toMatchObject({ ok: false });
    expect(await bewaarDelenActie(1, { verdiepingId: 99, delen: [gevel] })).toMatchObject({ ok: false, melding: expect.stringContaining("bestaat niet meer") });
    expect((await leesVerdieping(1, 1))?.delen).toEqual([]);
  });
});
