import { describe, expect, it } from "vitest";

import {
  LEGE_INVOER,
  isGebouwd,
  kaartenOmInTeVullen,
  leesBeschikbareTijd,
  magInschatten,
  magVerderNaInschatten,
  toonScoresVanAnder,
  volgendeFase,
  voortgang,
  voortgangstekst,
  vragenVoor,
  type Invoer,
  type Kaart,
  akkoordMetLijst,
  ander,
  bovenschrift,
  domeinen,
  leesKaart,
  lijstOpen,
  magAanDeSlag,
  magAkkoordGeven,
  stapVan,
  verdelingslabel,
  zelfdeVersie,
  type Ronde,
} from "@/lib/huishouden/balans";

const GELDIG = {
  titel: "Maaltijden",
  domein: "Huishouden",
  omschrijving: "Weekmenu, boodschappen, koken",
  goedGenoeg: "",
  frequentie: "dagelijks",
  verdeling: "spel",
  vasteUren: "",
};

const VERSIE = "2026-11-06T10:00:00.000Z";
const RONDE: Ronde = { id: 1, fase: "lijst", lijstVersie: VERSIE, voorstelVersie: VERSIE };

describe("een kaart lezen uit de dialoog", () => {
  it("neemt een geldige kaart over, met lege velden als null", () => {
    const resultaat = leesKaart(GELDIG);
    expect(resultaat).toEqual({
      ok: true,
      kaart: {
        titel: "Maaltijden",
        domein: "Huishouden",
        omschrijving: "Weekmenu, boodschappen, koken",
        goedGenoeg: null,
        frequentie: "dagelijks",
        verdeling: "spel",
        vasteUren: null,
      },
    });
  });

  it("knipt spaties weg en weigert een lege titel of een leeg domein", () => {
    const resultaat = leesKaart({ ...GELDIG, titel: "  Was  " });
    expect(resultaat.ok && resultaat.kaart.titel).toBe("Was");
    expect(leesKaart({ ...GELDIG, titel: "   " })).toEqual({ ok: false, fout: "Vul titel in." });
    expect(leesKaart({ ...GELDIG, domein: "" })).toEqual({ ok: false, fout: "Vul domein in." });
  });

  it("houdt de grenzen aan: titel 60, domein 40, omschrijving en goed genoeg 300", () => {
    expect(leesKaart({ ...GELDIG, titel: "x".repeat(60) }).ok).toBe(true);
    expect(leesKaart({ ...GELDIG, titel: "x".repeat(61) })).toEqual({ ok: false, fout: "Titel mag hoogstens 60 tekens hebben." });
    expect(leesKaart({ ...GELDIG, domein: "x".repeat(41) }).ok).toBe(false);
    expect(leesKaart({ ...GELDIG, omschrijving: "x".repeat(301) }).ok).toBe(false);
    expect(leesKaart({ ...GELDIG, goedGenoeg: "x".repeat(300) }).ok).toBe(true);
  });

  it("aanvaardt enkel de gekende frequenties en verdelingen", () => {
    expect(leesKaart({ ...GELDIG, frequentie: "elk uur" })).toEqual({ ok: false, fout: "Kies hoe vaak." });
    expect(leesKaart({ ...GELDIG, verdeling: "mama" })).toEqual({ ok: false, fout: "Kies hoe de kaart verdeeld wordt." });
  });

  it("leest vaste uren met een komma, op een half uur, enkel bij elk voor zich", () => {
    const hobby = leesKaart({ ...GELDIG, titel: "Hobbytijd", verdeling: "elk", vasteUren: "4,7" });
    expect(hobby.ok && hobby.kaart.vasteUren).toBe(4.5);
    const zonder = leesKaart({ ...GELDIG, verdeling: "elk", vasteUren: "" });
    expect(zonder.ok && zonder.kaart.vasteUren).toBeNull();
    const nietElk = leesKaart({ ...GELDIG, verdeling: "spel", vasteUren: "5" });
    expect(nietElk.ok && nietElk.kaart.vasteUren).toBeNull();
    expect(leesKaart({ ...GELDIG, verdeling: "elk", vasteUren: "90" }).ok).toBe(false);
    expect(leesKaart({ ...GELDIG, verdeling: "elk", vasteUren: "veel" }).ok).toBe(false);
  });

  it("weigert iets dat geen formulier is", () => {
    expect(leesKaart(null).ok).toBe(false);
    expect(leesKaart({}).ok).toBe(false);
  });
});

describe("wat er op een kaart staat", () => {
  it("zet domein en frequentie in het bovenschrift", () => {
    expect(bovenschrift({ domein: "Kinderen", frequentie: "dagelijks" })).toBe("Kinderen · Dagelijks");
    expect(bovenschrift({ domein: "Auto's", frequentie: "kwartaal" })).toBe("Auto's · Per kwartaal");
  });

  it("geeft een label enkel bij elk voor zich en samen", () => {
    expect(verdelingslabel({ verdeling: "elk", vasteUren: 5 })).toBe("Elk voor zich · 5 u elk");
    expect(verdelingslabel({ verdeling: "elk", vasteUren: 4.5 })).toBe("Elk voor zich · 4,5 u elk");
    expect(verdelingslabel({ verdeling: "elk", vasteUren: null })).toBe("Elk voor zich");
    expect(verdelingslabel({ verdeling: "samen", vasteUren: null })).toBe("Samen, telt niet mee");
    expect(verdelingslabel({ verdeling: "spel", vasteUren: null })).toBeNull();
    expect(verdelingslabel({ verdeling: "jan", vasteUren: null })).toBeNull();
  });

  it("stelt elk domein één keer voor, alfabetisch", () => {
    expect(domeinen([{ domein: "Hond" }, { domein: "Kinderen" }, { domein: "hond " }, { domein: "Administratie" }])).toEqual([
      "Administratie",
      "Hond",
      "Kinderen",
    ]);
  });
});

describe("het akkoord met de lijst", () => {
  it("telt een akkoord enkel voor de versie van de lijst zoals ze nu is", () => {
    expect(akkoordMetLijst(RONDE, [{ persoon: "jan", versie: VERSIE }])).toEqual({ jan: true, sandra: false });
    expect(akkoordMetLijst(RONDE, [{ persoon: "sandra", versie: "2026-11-06T09:59:00.000Z" }])).toEqual({
      jan: false,
      sandra: false,
    });
  });

  it("wist met elke wijziging het akkoord van allebei", () => {
    const akkoorden = [
      { persoon: "jan" as const, versie: VERSIE },
      { persoon: "sandra" as const, versie: VERSIE },
    ];
    expect(akkoordMetLijst(RONDE, akkoorden)).toEqual({ jan: true, sandra: true });
    const gewijzigd = { ...RONDE, lijstVersie: "2026-11-06T10:05:00.000Z" };
    expect(akkoordMetLijst(gewijzigd, akkoorden)).toEqual({ jan: false, sandra: false });
  });

  it("vergelijkt tijdstippen, niet hoe de databank ze schrijft", () => {
    expect(zelfdeVersie("2026-11-06T10:00:00+00:00", "2026-11-06T10:00:00.000Z")).toBe(true);
    expect(zelfdeVersie("2026-11-06 11:00:00+01", "2026-11-06T10:00:00.000Z")).toBe(true);
    expect(zelfdeVersie(null, VERSIE)).toBe(false);
    expect(zelfdeVersie("onzin", "onzin")).toBe(false);
  });

  it("laat akkoord geven op de lijst die je zag, als er een kaart is", () => {
    expect(magAkkoordGeven(RONDE, VERSIE, 3)).toEqual({ ok: true });
    expect(magAkkoordGeven(RONDE, VERSIE, 0)).toEqual({ ok: false, reden: "Voeg eerst een kaart toe." });
    expect(magAkkoordGeven(RONDE, "2026-11-06T09:00:00.000Z", 3)).toEqual({
      ok: false,
      reden: "De lijst is net gewijzigd. Kijk ze nog even na.",
    });
    expect(magAkkoordGeven({ ...RONDE, fase: "inschatten" }, VERSIE, 3).ok).toBe(false);
  });

  it("gaat pas aan de slag als allebei akkoord zijn", () => {
    const jan = { persoon: "jan" as const, versie: VERSIE };
    const sandra = { persoon: "sandra" as const, versie: VERSIE };
    expect(magAanDeSlag(RONDE, [jan, sandra], 5)).toEqual({ ok: true });
    expect(magAanDeSlag(RONDE, [jan], 5).ok).toBe(false);
    expect(magAanDeSlag(RONDE, [jan, sandra], 0).ok).toBe(false);
    expect(magAanDeSlag({ ...RONDE, fase: "inschatten" }, [jan, sandra], 5)).toEqual({
      ok: false,
      reden: "Jullie zijn al aan de slag.",
    });
  });
});

describe("rondes en personen", () => {
  it("houdt de lijst enkel open in stap 1", () => {
    expect(lijstOpen({ fase: "lijst" })).toBe(true);
    expect(lijstOpen({ fase: "inschatten" })).toBe(false);
    expect(lijstOpen({ fase: "vastgelegd" })).toBe(false);
  });

  it("nummert de stappen van 1 tot 5", () => {
    expect(stapVan("lijst")).toBe(1);
    expect(stapVan("vastgelegd")).toBe(5);
  });

  it("kent de ander", () => {
    expect(ander("jan")).toBe("sandra");
    expect(ander("sandra")).toBe("jan");
  });
});

const kaart = (id: number, verdeling: Kaart["verdeling"], extra: Partial<Kaart> = {}): Kaart => ({
  id,
  titel: `Kaart ${id}`,
  domein: "Huishouden",
  omschrijving: null,
  goedGenoeg: null,
  frequentie: "wekelijks",
  verdeling,
  vasteUren: null,
  geschrapt: false,
  volgorde: id,
  ...extra,
});

describe("stap 2: wat er per kaart in te vullen is", () => {
  it("vraagt per soort kaart enkel wat van toepassing is", () => {
    expect(vragenVoor(kaart(1, "spel"))).toEqual({ claim: true, tijd: true, last: true });
    expect(vragenVoor(kaart(2, "jan"))).toEqual({ claim: false, tijd: true, last: true });
    expect(vragenVoor(kaart(3, "sandra"))).toEqual({ claim: false, tijd: true, last: true });
    expect(vragenVoor(kaart(4, "elk", { vasteUren: 5 }))).toEqual({ claim: false, tijd: false, last: false });
    expect(vragenVoor(kaart(5, "elk"))).toEqual({ claim: false, tijd: true, last: false });
    expect(vragenVoor(kaart(6, "samen"))).toEqual({ claim: false, tijd: false, last: false });
  });

  it("toont enkel actieve kaarten met iets om in te vullen", () => {
    const kaarten = [
      kaart(1, "spel"),
      kaart(2, "samen"),
      kaart(3, "elk", { vasteUren: 5 }),
      kaart(4, "jan", { geschrapt: true }),
      kaart(5, "elk"),
    ];
    expect(kaartenOmInTeVullen(kaarten).map((k) => k.id)).toEqual([1, 5]);
  });
});

describe("stap 2: de voortgang", () => {
  const kaarten = [kaart(1, "spel"), kaart(2, "jan"), kaart(3, "samen"), kaart(4, "spel", { geschrapt: true })];
  const vol = (invoer: Partial<Invoer>): Invoer => ({ ...LEGE_INVOER, ...invoer });

  it("telt een kaart pas als alles van toepassing ingevuld is", () => {
    const invoer = new Map([
      [1, vol({ claim: "wil", tijd: 3 })],
      [2, vol({ tijd: 2, last: 4 })],
    ]);
    expect(voortgang(kaarten, invoer, 34)).toEqual({ klaar: 1, totaal: 2, tijdIngevuld: true, af: false });
  });

  it("is af als elke kaart en de beschikbare tijd ingevuld zijn", () => {
    const invoer = new Map([
      [1, vol({ claim: "mag", tijd: 3, last: 2 })],
      [2, vol({ tijd: 2, last: 4 })],
    ]);
    expect(voortgang(kaarten, invoer, 34).af).toBe(true);
    expect(voortgang(kaarten, invoer, null)).toEqual({ klaar: 2, totaal: 2, tijdIngevuld: false, af: false });
  });

  it("begint leeg op 0/n met tijd?", () => {
    const stand = voortgang(kaarten, new Map(), null);
    expect(voortgangstekst("sandra", stand)).toBe("Sandra 0/2 · tijd?");
    expect(voortgangstekst("jan", { ...stand, klaar: 2, tijdIngevuld: true })).toBe("Jan 2/2");
  });

  it("negeert wat bij een geschrapte kaart ingevuld werd", () => {
    const invoer = new Map([[4, vol({ claim: "wil", tijd: 5, last: 5 })]]);
    expect(voortgang(kaarten, invoer, 10).klaar).toBe(0);
  });
});

describe("stap 2: de beschikbare tijd", () => {
  it("leest een getal van 1 tot 80, leeg of 0 is nog niet ingevuld", () => {
    expect(leesBeschikbareTijd("34")).toEqual({ ok: true, uren: 34 });
    expect(leesBeschikbareTijd(" 1 ")).toEqual({ ok: true, uren: 1 });
    expect(leesBeschikbareTijd("80")).toEqual({ ok: true, uren: 80 });
    expect(leesBeschikbareTijd("")).toEqual({ ok: true, uren: null });
    expect(leesBeschikbareTijd("0")).toEqual({ ok: true, uren: null });
    expect(leesBeschikbareTijd(null)).toEqual({ ok: true, uren: null });
    expect(leesBeschikbareTijd("81").ok).toBe(false);
    expect(leesBeschikbareTijd("veel").ok).toBe(false);
  });
});

describe("stap 2: verder en blind", () => {
  const af = { klaar: 2, totaal: 2, tijdIngevuld: true, af: true };
  const bezig = { klaar: 1, totaal: 2, tijdIngevuld: true, af: false };

  it("laat inschatten vanaf stap 2, ook later nog", () => {
    expect(magInschatten({ fase: "lijst" })).toBe(false);
    expect(magInschatten({ fase: "inschatten" })).toBe(true);
    expect(magInschatten({ fase: "voorstel" })).toBe(true);
  });

  it("toont de scores van de ander pas na stap 2", () => {
    expect(toonScoresVanAnder({ fase: "inschatten" })).toBe(false);
    expect(toonScoresVanAnder({ fase: "bieden" })).toBe(true);
  });

  it("gaat pas verder als allebei af zijn", () => {
    expect(magVerderNaInschatten({ fase: "inschatten" }, { jan: af, sandra: af })).toEqual({ ok: true });
    expect(magVerderNaInschatten({ fase: "inschatten" }, { jan: af, sandra: bezig }).ok).toBe(false);
    expect(magVerderNaInschatten({ fase: "bieden" }, { jan: af, sandra: af }).ok).toBe(false);
  });

  it("gaat enkel naar een stap die al gebouwd is", () => {
    expect(isGebouwd("lijst")).toBe(true);
    expect(isGebouwd("inschatten")).toBe(true);
    expect(isGebouwd("bieden")).toBe(false);
    expect(volgendeFase("lijst")).toBe("inschatten");
    // Stap 3 (bieden) is er nog niet: na stap 2 gaat het meteen naar het voorstel.
    expect(volgendeFase("inschatten")).toBe("voorstel");
    expect(volgendeFase("voorstel")).toBe("vastgelegd");
    expect(volgendeFase("vastgelegd")).toBeNull();
  });
});
