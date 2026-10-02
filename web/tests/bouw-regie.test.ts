import { beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { dagenTekst, dagenTussen, dagMetWeekdag, korteDatum, maandagVan, plusDagen, vandaag } from "@/lib/bouw/kalender";
import {
  CATEGORIEEN_KEUZE,
  STANDAARDKEUZES,
  beslissingstekst,
  deadlineVan,
  hoeveelheidVan,
  korteNaam,
  meerprijsTekst,
  meerprijzen,
  openDeadlines,
} from "@/lib/bouw/keuzes";
import {
  groepeer,
  standVan,
  tijdasVan,
  tweeWeken,
  voorbeeldVanaf,
  type Planningsitem,
} from "@/lib/bouw/planning";
import {
  beslisKeuze,
  leesInstelling,
  lijstBeslissingen,
  lijstKeuzes,
  lijstOpties,
  lijstPlanning,
  lijstVoorkeuren,
  meldEenKeer,
  vergeetMelding,
  verwijderKeuze,
  verwijderOptie,
  verwijderPlanning,
  voegBeslissingToe,
  voegKeuzeToe,
  voegOptieToe,
  voegPlanningToe,
  voegPlanningenToe,
  zetBasis,
  zetFoto,
  zetInstelling,
  zetVoorkeur,
} from "@/lib/bouw/regie-opslag";

describe("de kalender", () => {
  it("weet welke dag het in Brussel is", () => {
    // 23:30 UTC in de zomer is al de volgende dag in Brussel.
    expect(vandaag(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(vandaag(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });

  it("telt dagen, ook over een zomeruur heen", () => {
    expect(plusDagen("2027-03-27", 2)).toBe("2027-03-29");
    expect(plusDagen("2027-01-01", -1)).toBe("2026-12-31");
    expect(dagenTussen("2026-10-02", "2026-10-30")).toBe(28);
    expect(dagenTussen("2026-10-02", "2026-09-30")).toBe(-2);
  });

  it("vindt de maandag, en schrijft een datum kort", () => {
    expect(maandagVan("2026-10-04")).toBe("2026-09-28"); // een zondag
    expect(maandagVan("2026-10-05")).toBe("2026-10-05");
    expect(korteDatum("2027-03-09", "2027-01-01")).toBe("9 mrt");
    expect(korteDatum("2027-03-09", "2026-10-02")).toBe("9 mrt 2027");
    expect(dagMetWeekdag("2026-10-05")).toBe("ma 5 okt");
  });

  it("zegt hoe ver iets nog is", () => {
    expect(dagenTekst(0)).toBe("vandaag");
    expect(dagenTekst(1)).toBe("morgen");
    expect(dagenTekst(-3)).toBe("3 dagen te laat");
    expect(dagenTekst(10)).toBe("over 10 dagen");
    expect(dagenTekst(21)).toBe("over 3 weken");
    expect(dagenTekst(120)).toBe("over 4 maanden");
  });
});

describe("hoeveel en wat het kost", () => {
  it("neemt de hoeveelheid met de hand, of de som van de ruimtes", () => {
    expect(hoeveelheidVan({ eenheid: "totaal", hoeveelheid: null }, [10])).toEqual({ waarde: 1, bron: "totaal" });
    expect(hoeveelheidVan({ eenheid: "m2", hoeveelheid: 80 }, [10, 20])).toEqual({ waarde: 80, bron: "hand" });
    expect(hoeveelheidVan({ eenheid: "m2", hoeveelheid: null }, [72.951, 13.2])).toEqual({ waarde: 86.15, bron: "ruimtes" });
    expect(hoeveelheidVan({ eenheid: "stuk", hoeveelheid: null }, [10])).toEqual({ waarde: null, bron: "geen" });
  });

  it("rekent de meerprijs tegenover de basis, of de goedkoopste", () => {
    const opties = [
      { id: 1, prijs: 45, basis: false },
      { id: 2, prijs: 38.5, basis: false },
      { id: 3, prijs: null, basis: false },
    ];
    const zonderBasis = meerprijzen(opties, 80);
    expect(zonderBasis.get(1)).toEqual({ kost: 3600, meerprijs: 520, isReferentie: false });
    expect(zonderBasis.get(2)).toEqual({ kost: 3080, meerprijs: 0, isReferentie: true });
    expect(zonderBasis.get(3)).toEqual({ kost: null, meerprijs: null, isReferentie: false });

    const metBasis = meerprijzen(opties.map((o) => ({ ...o, basis: o.id === 1 })), 80);
    expect(metBasis.get(2)?.meerprijs).toBe(-520);
    expect(metBasis.get(1)?.isReferentie).toBe(true);

    // Zonder hoeveelheid valt er niets te vergelijken.
    expect(meerprijzen(opties, null).get(1)).toEqual({ kost: null, meerprijs: null, isReferentie: false });
  });

  it("schrijft bedragen en beslissingen leesbaar", () => {
    // Intl zet een harde spatie na het euroteken.
    const euro = (tekst: string) => tekst.replace("€ ", "€\u00a0");
    expect(meerprijsTekst(1250.4)).toBe(euro("+€ 1.250"));
    expect(meerprijsTekst(-300)).toBe(euro("−€ 300"));
    expect(meerprijsTekst(0.2)).toBe(euro("€ 0"));
    expect(beslissingstekst({ naam: "Rood-bruin genuanceerd" }, "Steenhandel", 12345.6, "m2")).toBe(
      euro("Rood-bruin genuanceerd (Steenhandel), € 12.346 in totaal"),
    );
    expect(beslissingstekst({ naam: "Systeem D" }, null, null, "totaal")).toBe("Systeem D");
  });

  it("toont een voornaam", () => {
    expect(korteNaam("Sandra Peeters", "s@voorbeeld.be")).toBe("Sandra");
    expect(korteNaam(null, "jan@voorbeeld.be")).toBe("Jan");
  });

  it("heeft gewone keuzes om mee te beginnen", () => {
    expect(new Set(STANDAARDKEUZES.map((k) => k.titel)).size).toBe(STANDAARDKEUZES.length);
    for (const keuze of STANDAARDKEUZES) expect(CATEGORIEEN_KEUZE).toContain(keuze.categorie);
  });
});

describe("deadlines", () => {
  const planning = [{ id: 7, titel: "Ramen en buitendeuren plaatsen", begindatum: "2027-03-08" }];

  it("een vaste deadline gaat voor", () => {
    expect(deadlineVan({ deadline: "2026-11-15", planning_id: 7, levertermijn_weken: 12 }, planning)).toEqual({
      datum: "2026-11-15",
      bron: "vast",
      uitleg: "",
    });
  });

  it("volgt anders uit de planning, min de levertermijn en een week om te bestellen", () => {
    const deadline = deadlineVan({ deadline: null, planning_id: 7, levertermijn_weken: 12 }, planning);
    expect(deadline?.datum).toBe("2026-12-07");
    expect(deadline?.uitleg).toBe(
      '"Ramen en buitendeuren plaatsen" begint op 8 mrt 2027; 12 weken levertermijn, plus een week om te bestellen',
    );
    expect(deadlineVan({ deadline: null, planning_id: 7, levertermijn_weken: null }, planning)?.datum).toBe("2027-03-01");
    expect(deadlineVan({ deadline: null, planning_id: 99, levertermijn_weken: 4 }, planning)).toBeNull();
    expect(deadlineVan({ deadline: null, planning_id: null, levertermijn_weken: 4 }, planning)).toBeNull();
  });

  it("zet de open deadlines op volgorde, zonder wat al beslist is", () => {
    const keuzes = [
      { id: 1, titel: "Keuken", deadline: "2026-12-01", planning_id: null, levertermijn_weken: null, gekozen_optie_id: null },
      { id: 2, titel: "Ramen", deadline: null, planning_id: 7, levertermijn_weken: 12, gekozen_optie_id: null },
      { id: 3, titel: "Gevelsteen", deadline: "2026-09-01", planning_id: null, levertermijn_weken: null, gekozen_optie_id: null },
      { id: 4, titel: "Trap", deadline: "2026-10-01", planning_id: null, levertermijn_weken: null, gekozen_optie_id: 12 },
      { id: 5, titel: "Domotica", deadline: null, planning_id: null, levertermijn_weken: null, gekozen_optie_id: null },
    ];
    expect(openDeadlines(keuzes, planning, "2026-10-02").map((d) => [d.keuze.titel, d.dagen])).toEqual([
      ["Gevelsteen", -31],
      ["Keuken", 60],
      ["Ramen", 66],
    ]);
  });
});

function item(id: number, soort: Planningsitem["soort"], begindatum: string, einddatum: string | null, over: Partial<Planningsitem> = {}): Planningsitem {
  return { id, soort, titel: `item ${id}`, begindatum, einddatum, fase_id: null, partij_id: null, status: "gepland", opmerking: null, ...over };
}

describe("de planning", () => {
  it("groepeert per fase in de tijd, en wat los hangt als laatste", () => {
    const items = [
      item(1, "fase", "2027-02-01", "2027-05-31", { titel: "Ruwbouw" }),
      item(2, "fase", "2026-10-01", "2027-01-31", { titel: "Vergunning" }),
      item(3, "taak", "2027-03-01", "2027-03-31", { fase_id: 1 }),
      item(4, "taak", "2027-02-01", "2027-02-20", { fase_id: 1 }),
      item(5, "mijlpaal", "2027-01-31", null),
      item(6, "taak", "2027-01-01", null, { fase_id: 99 }),
    ];
    const groepen = groepeer(items);
    expect(groepen.map((g) => g.fase?.titel ?? "los")).toEqual(["Vergunning", "Ruwbouw", "los"]);
    expect(groepen[1].items.map((i) => i.id)).toEqual([4, 3]);
    expect(groepen[2].items.map((i) => i.id)).toEqual([6, 5]);
  });

  it("kent de stand van een item", () => {
    expect(standVan(item(1, "taak", "2026-10-01", "2026-10-10"), "2026-10-02")).toBe("bezig");
    expect(standVan(item(1, "taak", "2026-09-01", "2026-09-10"), "2026-10-02")).toBe("te_laat");
    expect(standVan(item(1, "taak", "2026-09-01", "2026-09-10", { status: "klaar" }), "2026-10-02")).toBe("klaar");
    expect(standVan(item(1, "taak", "2026-11-01", null), "2026-10-02")).toBe("gepland");
  });

  it("maakt een tijdas van hele maanden, met vandaag erin", () => {
    const as = tijdasVan(["2026-11-15", "2027-01-10"], "2026-10-02");
    expect(as).toMatchObject({ begin: "2026-10-01", einde: "2027-01-31", maanden: ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"] });
    expect(as.dagen).toBe(123);
  });

  it("zegt wat er deze en volgende week gebeurt", () => {
    const items = [
      item(1, "taak", "2026-09-20", "2026-10-20", { titel: "Metselwerk" }),
      item(2, "taak", "2026-10-07", "2026-10-09", { titel: "Riolering" }),
      item(3, "mijlpaal", "2026-10-09", null, { titel: "Vergunning" }),
      item(4, "taak", "2026-10-30", null, { titel: "Te laat in de toekomst" }),
      item(5, "taak", "2026-10-06", null, { titel: "Al klaar", status: "klaar" }),
    ];
    const week = tweeWeken(items, [{ titel: "Gevelsteen kiezen", datum: "2026-10-08" }], "2026-10-02");
    expect(week.van).toBe("2026-09-28");
    expect(week.tot).toBe("2026-10-11");
    expect(week.regels.map((r) => [r.datum, r.soort, r.tekst])).toEqual([
      ["2026-09-28", "loopt", "Metselwerk"],
      ["2026-10-07", "begint", "Riolering"],
      ["2026-10-08", "deadline", "Gevelsteen kiezen"],
      ["2026-10-09", "mijlpaal", "Vergunning"],
      ["2026-10-09", "eindigt", "Riolering"],
    ]);
  });

  it("maakt een voorbeeldplanning vanaf een datum", () => {
    const items = voorbeeldVanaf("2026-11-02");
    expect(items[0]).toMatchObject({ soort: "fase", titel: "Omgevingsvergunning", begindatum: "2026-11-02" });
    for (const taak of items.filter((i) => i.soort === "taak")) {
      const fase = items[taak.fase!];
      expect(fase.soort).toBe("fase");
      expect(taak.begindatum >= fase.begindatum).toBe(true);
    }
    const vergunning = items.find((i) => i.titel === "Vergunning verleend")!;
    const ruwbouw = items.find((i) => i.titel === "Ruwbouw")!;
    // Pas 36 dagen na de aanplakking mag de vergunning gebruikt worden.
    expect(dagenTussen(vergunning.begindatum, ruwbouw.begindatum)).toBeGreaterThanOrEqual(35);
    const afwerking = items.find((i) => i.titel === "Afwerking")!;
    expect(items.at(-1)).toMatchObject({ soort: "mijlpaal", titel: "Voorlopige oplevering" });
    expect(dagenTussen(afwerking.einddatum!, items.at(-1)!.begindatum)).toBe(1);
  });
});

describe("de regie in de databank", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_planning: [],
      bouw_keuzes: [],
      bouw_opties: [],
      bouw_keuze_ruimtes: [],
      bouw_voorkeuren: [],
      bouw_beslissingen: [],
      bouw_meldingen: [],
      bouw_instellingen: [],
    });
    nep.client = db.client;
  });

  it("zet de voorbeeldplanning erin, met elke taak aan haar fase", async () => {
    const items = voorbeeldVanaf("2026-11-02");
    expect(await voegPlanningenToe(items)).toBe(items.length);
    const planning = await lijstPlanning();
    const ruwbouw = planning.find((i) => i.titel === "Ruwbouw")!;
    const fundering = planning.find((i) => i.titel === "Grondwerken en fundering")!;
    expect(fundering.fase_id).toBe(ruwbouw.id);
    await expect(verwijderPlanning(ruwbouw.id)).rejects.toThrow("Deze fase heeft nog 4 taken");
    await verwijderPlanning(fundering.id);
    expect((await lijstPlanning()).some((i) => i.id === fundering.id)).toBe(false);
  });

  it("keuzes met ruimtes, opties, één basis, een beslissing en voorkeuren", async () => {
    const taak = await voegPlanningToe({
      soort: "taak", titel: "Vloeren", begindatum: "2027-06-01", einddatum: null,
      fase_id: null, partij_id: null, status: "gepland", opmerking: null,
    });
    const keuzeId = await voegKeuzeToe(
      { titel: "Vloer leefruimte", categorie: "vloeren", omschrijving: null, deadline: null, planning_id: taak,
        levertermijn_weken: 4, eenheid: "m2", hoeveelheid: null, partij_id: null },
      [11, 12, 11],
    );
    const [keuze] = await lijstKeuzes();
    expect(keuze).toMatchObject({ id: keuzeId, eenheid: "m2", gekozen_optie_id: null, ruimte_ids: [11, 12] });

    const optie = (naam: string, prijs: number | null) =>
      voegOptieToe({ keuze_id: keuzeId, naam, leverancier_id: null, prijs, kleur: null, url: null, opmerking: null, volgorde: 0 });
    const eik = await optie("Eik", 65);
    const tegel = await optie("Keramische tegel", 48);
    await zetBasis(keuzeId, tegel);
    await zetBasis(keuzeId, eik);
    expect((await lijstOpties([keuzeId])).filter((o) => o.basis).map((o) => o.id)).toEqual([eik]);

    await zetVoorkeur(keuzeId, "jan@voorbeeld.be", "Jan", eik);
    await zetVoorkeur(keuzeId, "jan@voorbeeld.be", "Jan", tegel);
    await zetVoorkeur(keuzeId, "sandra@voorbeeld.be", "Sandra", eik);
    expect((await lijstVoorkeuren([keuzeId])).map((v) => [v.naam, v.optie_id])).toEqual([
      ["Jan", tegel],
      ["Sandra", eik],
    ]);
    await zetVoorkeur(keuzeId, "sandra@voorbeeld.be", "Sandra", null);
    expect(await lijstVoorkeuren([keuzeId])).toHaveLength(1);

    await beslisKeuze(keuzeId, eik, "Sandra");
    expect((await lijstKeuzes())[0]).toMatchObject({ gekozen_optie_id: eik, beslist_door: "Sandra" });

    // Een foto erbij; de vorige komt terug om op te ruimen.
    expect(await zetFoto(eik, 501)).toBeNull();
    expect(await zetFoto(eik, 502)).toBe(501);

    // De gekozen optie verwijderen maakt de keuze terug open.
    expect(await verwijderOptie(eik)).toBe(502);
    expect((await lijstKeuzes())[0]).toMatchObject({ gekozen_optie_id: null, beslist_op: null });

    expect(await verwijderKeuze(keuzeId)).toEqual([]);
    expect(await lijstKeuzes()).toEqual([]);
  });

  it("het log, de meldingen en de instellingen", async () => {
    await voegBeslissingToe({ datum: "2026-09-01", onderwerp: "Kelder", beslissing: "Geen kelder", keuze_id: null, door: "Jan" });
    await voegBeslissingToe({ datum: "2026-10-01", onderwerp: "Ventilatie", beslissing: "Systeem D", keuze_id: null, door: "Sandra" });
    expect((await lijstBeslissingen()).map((b) => b.onderwerp)).toEqual(["Ventilatie", "Kelder"]);

    expect(await meldEenKeer("deadline:3:7")).toBe(true);
    expect(await meldEenKeer("deadline:3:7")).toBe(false);
    await vergeetMelding("deadline:3:7");
    expect(await meldEenKeer("deadline:3:7")).toBe(true);

    expect(await leesInstelling("telegram_chat_id")).toBeNull();
    await zetInstelling("telegram_chat_id", "-100123");
    await zetInstelling("telegram_chat_id", "-100456");
    expect(await leesInstelling("telegram_chat_id")).toBe("-100456");
  });
});
