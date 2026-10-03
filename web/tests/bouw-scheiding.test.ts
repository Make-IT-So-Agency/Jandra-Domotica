import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { lijstFacturen, lijstOffertes, lijstPosten, leesOfferte, leesPost, voegOfferteToe } from "@/lib/bouw/geld-opslag";
import { lijstHuizen } from "@/lib/bouw/huizen";
import { lijstGaranties, lijstOnderhoud } from "@/lib/bouw/nazorg-opslag";
import {
  leesBestand,
  leesVerdieping,
  lijstGebouwen,
  lijstPartijen,
  lijstPlannen,
  lijstPunten,
  lijstRuimtes,
  lijstVerdiepingen,
  verwijderPartij,
  verwijderPunt,
  verwijderVerdieping,
  voegPlanToe,
  voegPuntToe,
  voegVerdiepingToe,
  wijzigGebouw,
  wijzigPartij,
  wijzigPunt,
  zetBladcode,
  zoekOfMaakGebouw,
} from "@/lib/bouw/opslag";
import {
  beslisKeuze,
  leesKeuze,
  leesOptie,
  lijstKeuzes,
  lijstOpties,
  lijstPlanning,
  verwijderKeuze,
  voegKeuzeToe,
  voegOptieToe,
  wijzigKeuze,
  zetKeuzeRuimtes,
} from "@/lib/bouw/regie-opslag";
import { lijstActiepunten, lijstOpleverpunten, leesOpleverpunt, wijzigActiepunt } from "@/lib/bouw/werf-opslag";

/**
 * Twee huizen in één databank: wat van het ene is, mag het andere nooit zien
 * of wijzigen, ook niet via een id uit een formulier of een kind van een rij.
 */

const TWEEDE = { ...TESTHUIS, id: 2, naam: "Testhuis", soort: "bestaand", volgorde: 1 };
const ANDER_HUIS = "Dat hoort niet bij dit huis, of het bestaat niet meer.";

let db: ReturnType<typeof nepSupabase>;

const keuze = (id: number, titel: string) => ({
  id, titel, categorie: "gevel", omschrijving: null, deadline: null, planning_id: null, levertermijn_weken: null,
  eenheid: "m2", hoeveelheid: null, partij_id: null, gekozen_optie_id: null, beslist_op: null, beslist_door: null,
});
const nieuweKeuze = (titel: string, partij_id: number | null = null) => ({
  titel, categorie: "gevel" as const, omschrijving: null, deadline: null, planning_id: null, levertermijn_weken: null,
  eenheid: "m2" as const, hoeveelheid: null, partij_id,
});
const punt = { soort: "stopcontact", x_m: 1, y_m: 1, hoogte_m: null, aantal: 1, label: null, opmerking: null, status: "gewenst" as const };

beforeEach(() => {
  db = nepSupabase({
    bouw_huizen: [{ ...TESTHUIS }, { ...TWEEDE }],
    bouw_gebouwen: [
      ...metHuis([{ id: 1, naam: "Woning", volgorde: 0 }], 1),
      ...metHuis([{ id: 2, naam: "Woning", volgorde: 0 }], 2),
    ],
    bouw_verdiepingen: [
      { id: 10, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: 0, verdiepingshoogte_m: null, plafondhoogte_m: null },
      { id: 20, gebouw_id: 2, naam: "Gelijkvloers", volgorde: 0, vloerpeil_m: 0, verdiepingshoogte_m: null, plafondhoogte_m: null },
    ],
    bouw_ruimtes: [
      { id: 100, verdieping_id: 10, naam: "Keuken", soort: "keuken", veelhoek: [], oppervlakte_m2: 12 },
      { id: 200, verdieping_id: 20, naam: "Living", soort: "leefruimte", veelhoek: [], oppervlakte_m2: 30 },
    ],
    bouw_punten: [
      { id: 1000, verdieping_id: 10, ...punt },
      { id: 2000, verdieping_id: 20, ...punt },
    ],
    bouw_partijen: [
      ...metHuis([{ id: 1, soort: "aannemer", naam: "Bouwbedrijf Een" }], 1),
      ...metHuis([{ id: 2, soort: "aannemer", naam: "Bouwbedrijf Twee" }], 2),
    ],
    bouw_plannen: [
      ...metHuis([{ id: 1, titel: "Grondplan", soort: "grondplan", gebouw_id: 1, verdieping_id: 10, bladcode: "A01" }], 1),
      ...metHuis([{ id: 2, titel: "Grondplan", soort: "grondplan", gebouw_id: 2, verdieping_id: 20, bladcode: null }], 2),
    ],
    bouw_planversies: [],
    bouw_keuzes: [...metHuis([keuze(1, "Gevelsteen")], 1), ...metHuis([keuze(2, "Dakpannen")], 2)],
    bouw_opties: [
      { id: 1, keuze_id: 1, naam: "Rood", volgorde: 0 },
      { id: 2, keuze_id: 2, naam: "Zwart", volgorde: 0 },
    ],
    bouw_keuze_ruimtes: [],
    bouw_planning: [
      ...metHuis([{ id: 1, soort: "taak", titel: "Ruwbouw", begindatum: "2026-10-05", einddatum: null, status: "gepland" }], 1),
      ...metHuis([{ id: 2, soort: "taak", titel: "Schilderen", begindatum: "2026-10-05", einddatum: null, status: "gepland" }], 2),
    ],
    bouw_posten: [
      ...metHuis([{ id: 1, naam: "Ruwbouw", categorie: "ruwbouw", raming: 1000 }], 1),
      ...metHuis([{ id: 2, naam: "Schilderwerk", categorie: "afwerking", raming: 500 }], 2),
    ],
    bouw_offertes: [
      { id: 1, post_id: 1, partij_id: 1, bedrag: 900, status: "ontvangen" },
      { id: 2, post_id: 2, partij_id: 2, bedrag: 450, status: "ontvangen" },
    ],
    bouw_meerwerken: [],
    bouw_facturen: [...metHuis([{ id: 1, bedrag: 100 }], 1), ...metHuis([{ id: 2, bedrag: 200 }], 2)],
    bouw_actiepunten: [
      ...metHuis([{ id: 1, titel: "Stelling", status: "open" }], 1),
      ...metHuis([{ id: 2, titel: "Container", status: "open" }], 2),
    ],
    bouw_opleverpunten: [
      ...metHuis([{ id: 1, titel: "Voeg", partij_id: 1, status: "open", ronde: "voorlopig" }], 1),
      ...metHuis([{ id: 2, titel: "Deur", partij_id: 2, status: "open", ronde: "voorlopig" }], 2),
    ],
    bouw_onderhoud: [
      ...metHuis([{ id: 1, wat: "Ketel", interval_maanden: 12 }], 1),
      ...metHuis([{ id: 2, wat: "Goten", interval_maanden: 12 }], 2),
    ],
    bouw_garanties: [
      ...metHuis([{ id: 1, wat: "ramen", begin: "2026-01-01", duur_maanden: 24 }], 1),
      ...metHuis([{ id: 2, wat: "dak", begin: "2026-01-01", duur_maanden: 120 }], 2),
    ],
    bouw_bestanden: [
      ...metHuis([{ id: 1, pad: "plannen/een.pdf", doel: "plan", status: "klaar", oorspronkelijke_naam: "een.pdf" }], 1),
      ...metHuis([{ id: 2, pad: "plannen/twee.pdf", doel: "plan", status: "klaar", oorspronkelijke_naam: "twee.pdf" }], 2),
    ],
  });
  nep.client = db.client;
});

const ids = (rijen: { id: number }[]) => rijen.map((rij) => rij.id);

describe("twee huizen naast elkaar", () => {
  it("kent beide huizen, in hun volgorde", async () => {
    expect((await lijstHuizen()).map((huis) => huis.naam)).toEqual(["Nieuwbouw", "Testhuis"]);
  });

  it("laat geen lijst naar het andere huis lekken, ook niet bij de kinderen", async () => {
    for (const huisId of [1, 2]) {
      const eigen = [huisId];
      expect(ids(await lijstGebouwen(huisId))).toEqual(eigen);
      expect(ids(await lijstVerdiepingen(huisId))).toEqual([huisId * 10]);
      expect(ids(await lijstRuimtes(huisId))).toEqual([huisId * 100]);
      expect(ids(await lijstPunten(huisId))).toEqual([huisId * 1000]);
      expect(ids(await lijstPartijen(huisId))).toEqual(eigen);
      expect(ids(await lijstPlannen(huisId))).toEqual(eigen);
      expect(ids(await lijstKeuzes(huisId))).toEqual(eigen);
      expect(ids(await lijstOpties(huisId))).toEqual(eigen);
      expect(ids(await lijstPlanning(huisId))).toEqual(eigen);
      expect(ids(await lijstPosten(huisId))).toEqual(eigen);
      expect(ids(await lijstOffertes(huisId))).toEqual(eigen);
      expect(ids(await lijstFacturen(huisId))).toEqual(eigen);
      expect(ids(await lijstActiepunten(huisId))).toEqual(eigen);
      expect(ids(await lijstOpleverpunten(huisId))).toEqual(eigen);
      expect(ids(await lijstOnderhoud(huisId))).toEqual(eigen);
      expect(ids(await lijstGaranties(huisId))).toEqual(eigen);
    }
  });

  it("filtert ook een gevraagde verdieping of keuze op het huis", async () => {
    expect(await lijstRuimtes(1, 20)).toEqual([]);
    expect(await lijstPunten(1, 20)).toEqual([]);
    expect(await lijstOpties(1, [2])).toEqual([]);
    expect(ids(await lijstOpties(1, [1, 2]))).toEqual([1]);
  });

  it("leest niets op een id van het andere huis", async () => {
    expect(await leesVerdieping(1, 20)).toBeNull();
    expect(await leesKeuze(1, 2)).toBeNull();
    expect(await leesOptie(1, 2)).toBeNull();
    expect(await leesPost(1, 2)).toBeNull();
    expect(await leesOfferte(1, 2)).toBeNull();
    expect(await leesOpleverpunt(1, 2)).toBeNull();
    expect(await leesBestand(1, 2)).toBeNull();
    expect(await leesVerdieping(2, 20)).not.toBeNull();
  });

  it("wijzigt niets op een id van het andere huis", async () => {
    const partij = {
      soort: "aannemer" as const, naam: "Overgenomen", vak: null, contactpersoon: null, email: null, telefoon: null, adres: null,
      website: null, btw_nummer: null, opmerking: null,
    };
    await expect(wijzigPartij(1, 2, partij)).rejects.toThrow(ANDER_HUIS);
    await expect(wijzigGebouw(1, 2, { naam: "Overgenomen", volgorde: 0 })).rejects.toThrow(ANDER_HUIS);
    await expect(wijzigKeuze(1, 2, nieuweKeuze("Overgenomen"))).rejects.toThrow(ANDER_HUIS);
    await expect(beslisKeuze(1, 2, null, "jan")).rejects.toThrow(ANDER_HUIS);
    await expect(
      wijzigActiepunt(1, 2, { titel: "Overgenomen", omschrijving: null, partij_id: null, deadline: null }),
    ).rejects.toThrow(ANDER_HUIS);
    expect(await wijzigPunt(1, 2000, { ...punt, label: "Overgenomen" })).toBeNull();
    await expect(zetBladcode(1, 2, "B01")).rejects.toThrow(ANDER_HUIS);

    const alles = JSON.stringify(db.tabellen);
    expect(alles).not.toContain("Overgenomen");
    expect(alles).not.toContain("B01");
  });

  it("verwijdert niets van het andere huis", async () => {
    await verwijderPartij(1, 2);
    await verwijderPunt(1, 2000);
    await expect(verwijderVerdieping(1, 20)).rejects.toThrow(ANDER_HUIS);
    await expect(verwijderKeuze(1, 2)).rejects.toThrow(ANDER_HUIS);
    expect(ids(await lijstPartijen(2))).toEqual([2]);
    expect(ids(await lijstPunten(2))).toEqual([2000]);
    expect(ids(await lijstVerdiepingen(2))).toEqual([20]);
    expect(ids(await lijstKeuzes(2))).toEqual([2]);
  });

  it("weigert een verwijzing naar iets van het andere huis", async () => {
    await expect(
      voegVerdiepingToe(1, { gebouw_id: 2, naam: "Zolder", volgorde: 1, vloerpeil_m: null, verdiepingshoogte_m: null, plafondhoogte_m: null }),
    ).rejects.toThrow(ANDER_HUIS);
    await expect(voegPuntToe(1, 20, punt)).rejects.toThrow(ANDER_HUIS);
    await expect(voegKeuzeToe(1, nieuweKeuze("Ramen", 2))).rejects.toThrow(ANDER_HUIS);
    await expect(
      voegOptieToe(1, { keuze_id: 2, naam: "Blauw", leverancier_id: null, prijs: null, kleur: null, url: null, opmerking: null, volgorde: 0 }),
    ).rejects.toThrow(ANDER_HUIS);
    await expect(zetKeuzeRuimtes(1, 1, [100, 200])).rejects.toThrow(ANDER_HUIS);
    await expect(beslisKeuze(1, 1, 2, "jan")).rejects.toThrow(ANDER_HUIS);
    await expect(
      voegPlanToe(1, { titel: "Snede", soort: "doorsnede", gebouw_id: 2, verdieping_id: null, opmerking: null }),
    ).rejects.toThrow(ANDER_HUIS);
    await expect(
      voegOfferteToe(1, { post_id: 2, partij_id: 1, omschrijving: null, bedrag: 100, datum: null, geldig_tot: null, bestand_id: null, opmerking: null }),
    ).rejects.toThrow(ANDER_HUIS);
    // Niets van dat alles kwam in de databank.
    expect(db.tabellen.bouw_verdiepingen).toHaveLength(2);
    expect(db.tabellen.bouw_punten).toHaveLength(2);
    expect(db.tabellen.bouw_keuzes).toHaveLength(2);
    expect(db.tabellen.bouw_keuze_ruimtes).toEqual([]);
    expect(db.tabellen.bouw_offertes).toHaveLength(2);
  });

  it("kent de namen van gebouwen en de bladcodes per huis", async () => {
    // Elk huis heeft zijn eigen Woning.
    expect(await zoekOfMaakGebouw(2, "woning")).toBe(2);
    const bijgebouw = await zoekOfMaakGebouw(2, "Bijgebouw");
    expect(db.tabellen.bouw_gebouwen.find((gebouw) => gebouw.id === bijgebouw)).toMatchObject({ huis_id: 2 });
    expect(await zoekOfMaakGebouw(1, "Bijgebouw")).not.toBe(bijgebouw);

    // Dezelfde bladcode mag in elk huis één keer.
    await zetBladcode(2, 2, "A01");
    await expect(
      voegPlanToe(1, { titel: "Ander grondplan", soort: "grondplan", gebouw_id: 1, verdieping_id: null, opmerking: null, bladcode: "A01" }),
    ).rejects.toThrow("Er is al een plan met bladcode A01.");
  });
});
