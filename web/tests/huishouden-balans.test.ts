import { describe, expect, it } from "vitest";

import {
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
const RONDE: Ronde = { id: 1, fase: "lijst", lijstVersie: VERSIE };

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
