import { describe, expect, it } from "vitest";

import type { Claim, Invoer, Kaart, Persoon, Score } from "@/lib/huishouden/balans";
import {
  berekenVoorstel,
  halfJes,
  magUitbesteden,
  mentaalVan,
  niemandGraag,
  overschreden,
  toewijzing,
  urenTekst,
  urenVan,
  vulling,
  type Bod,
  type Verschuiving,
  type Voorstelinvoer,
} from "@/lib/huishouden/voorstel";

let volgnummer = 0;
const kaart = (titel: string, verdeling: Kaart["verdeling"], extra: Partial<Kaart> = {}): Kaart => {
  volgnummer += 1;
  return {
    id: volgnummer,
    titel,
    domein: "Huishouden",
    omschrijving: null,
    goedGenoeg: null,
    frequentie: "wekelijks",
    verdeling,
    vasteUren: null,
    geschrapt: false,
    volgorde: volgnummer,
    ...extra,
  };
};

type Rij = [Kaart, [Score | null, Score | null], [Score | null, Score | null], [Claim | null, Claim | null]?];

/** Zet een tabel zoals in de overdracht om naar de invoer van het voorstel. */
function invoerVan(rijen: Rij[]): Record<Persoon, Map<number, Invoer>> {
  const invoer: Record<Persoon, Map<number, Invoer>> = { jan: new Map(), sandra: new Map() };
  for (const [k, [tijdJan, tijdSandra], [lastJan, lastSandra], claims] of rijen) {
    invoer.jan.set(k.id, { claim: claims?.[0] ?? null, tijd: tijdJan, last: lastJan });
    invoer.sandra.set(k.id, { claim: claims?.[1] ?? null, tijd: tijdSandra, last: lastSandra });
  }
  return invoer;
}

// Het volledige voorbeeld uit de overdracht (§6, "Voorbeeld van een volledig voorstel").
const ZORG = kaart("Dagelijkse zorg kinderen", "spel");
const ORGANISATIE = kaart("Organisatie kinderen", "spel");
const HOND = kaart("Hond dagelijks", "spel");
const MAALTIJDEN = kaart("Maaltijden", "spel");
const POETSEN = kaart("Poetsen", "spel");
const WAS = kaart("Was", "spel");
const FINANCIEN = kaart("Gezinsfinanciën en papierwerk", "spel");
const AGENDA = kaart("Gezinsagenda en vakanties", "spel");
const AUTOS = kaart("Auto's en mobiliteit", "spel");
const VERHUUR_JAN = kaart("Verhuur pand Jan", "jan");
const VERHUUR_SANDRA = kaart("Verhuur pand Sandra", "sandra");
const BOUW = kaart("Bouwproject", "sandra");
const HOBBY = kaart("Hobbytijd", "elk", { vasteUren: 5 });
const SAMEN = kaart("Tijd samen", "samen");
const GESCHRAPT = kaart("Training hond", "spel", { geschrapt: true });

const VOORBEELD: Voorstelinvoer = {
  kaarten: [ZORG, ORGANISATIE, HOND, MAALTIJDEN, POETSEN, WAS, FINANCIEN, AGENDA, AUTOS, VERHUUR_JAN, VERHUUR_SANDRA, BOUW, HOBBY, SAMEN, GESCHRAPT],
  invoer: invoerVan([
    [ZORG, [5, 5], [3, 4], ["mag", "mag"]],
    [ORGANISATIE, [2, 2], [4, 5], ["echt_niet", "wil"]],
    [HOND, [5, 4], [1, 2], ["wil", "liever_niet"]],
    [MAALTIJDEN, [5, 5], [4, 4], ["wil", "wil"]],
    [POETSEN, [3, 4], [1, 2], ["liever_niet", "echt_niet"]],
    [WAS, [3, 3], [1, 1], ["liever_niet", "liever_niet"]],
    [FINANCIEN, [2, 2], [4, 3], ["wil", "mag"]],
    [AGENDA, [2, 1], [4, 4], ["mag", "wil"]],
    [AUTOS, [1, 1], [1, 2], ["mag", "liever_niet"]],
    [VERHUUR_JAN, [2, 2], [2, 2]],
    [VERHUUR_SANDRA, [2, 2], [2, 2]],
    [BOUW, [4, 4], [5, 4]],
    [GESCHRAPT, [5, 5], [5, 5], ["wil", "wil"]],
  ]),
  beschikbareTijd: { jan: 34, sandra: 30 },
  biedingen: new Map<number, Bod>([[MAALTIJDEN.id, { jan: 40, sandra: 60 }]]),
};

describe("het voorbeeld uit de overdracht", () => {
  const voorstel = berekenVoorstel(VOORBEELD);
  const van = (k: Kaart) => voorstel.kaarten.find((item) => item.kaart.id === k.id)!;

  it("geeft elke kaart de eigenaar en de reden uit de tabel", () => {
    const tabel = [ZORG, ORGANISATIE, HOND, MAALTIJDEN, POETSEN, WAS, FINANCIEN, AGENDA, AUTOS].map((k) => [
      k.titel,
      van(k).eigenaar,
      van(k).reden,
      van(k).nipt,
    ]);
    expect(tabel).toEqual([
      ["Dagelijkse zorg kinderen", "jan", "Mag voor allebei, voor het evenwicht", true],
      ["Organisatie kinderen", "sandra", "Sandra doet dit graag", false],
      ["Hond dagelijks", "jan", "Jan doet dit graag", false],
      ["Maaltijden", "sandra", "Sandra wou dit het liefst (60 tegen 40)", false],
      ["Poetsen", "jan", "Valt Jan minder zwaar, telt 1,5 keer", true],
      ["Was", "sandra", "Niemand doet dit graag, telt 1,5 keer", true],
      ["Gezinsfinanciën en papierwerk", "jan", "Jan doet dit graag", false],
      ["Gezinsagenda en vakanties", "sandra", "Sandra doet dit graag", false],
      ["Auto's en mobiliteit", "jan", "Mag voor Jan", false],
    ]);
  });

  it("rekent de uren en de mentale last per kaart zoals in de tabel", () => {
    expect([van(ZORG).gewogen, van(ZORG).mentaal]).toEqual([7, 3.5]);
    expect([van(HOND).gewogen, van(HOND).mentaal]).toEqual([5.5, 1.5]);
    expect([van(POETSEN).uren, van(POETSEN).gewogen, van(POETSEN).compensatie]).toEqual([3.25, 4.875, true]);
    expect([van(WAS).gewogen, van(WAS).mentaal]).toEqual([3.75, 1]);
    expect([van(AGENDA).gewogen, van(AGENDA).mentaal]).toEqual([0.75, 4]);
    expect([van(BOUW).eigenaar, van(BOUW).gewogen, van(BOUW).mentaal]).toEqual(["sandra", 4, 4.5]);
    expect([van(HOBBY).eigenaar, van(HOBBY).gewogen, van(HOBBY).mentaal]).toEqual(["elk", 5, 0]);
  });

  it("komt uit op Jan 24,875 u en 13,5, Sandra 22,5 u en 20, zonder overschrijding", () => {
    expect(voorstel.totaal.jan).toEqual({ uren: 24.875, mentaal: 13.5, beschikbaar: 34 });
    expect(voorstel.totaal.sandra).toEqual({ uren: 22.5, mentaal: 20, beschikbaar: 30 });
    expect(urenTekst(voorstel.totaal.jan.uren)).toBe("~25 u");
    expect(urenTekst(voorstel.totaal.sandra.uren)).toBe("~22,5 u");
    expect(overschreden(voorstel.totaal.jan)).toBe(false);
  });

  it("telt vijf kaarten die vanzelf een thuis vonden: R1 en R3, niet het bod", () => {
    expect(voorstel.vanzelf).toBe(5);
  });

  it("laat geschrapte kaarten weg en zet samen apart", () => {
    expect(voorstel.kaarten.some((item) => item.kaart.id === GESCHRAPT.id)).toBe(false);
    expect(van(SAMEN).eigenaar).toBe("samen");
    expect(van(SAMEN).gewogen).toBe(0);
  });
});

describe("zonder bieden", () => {
  it("stuurt twee keer 'Wil ik' naar het evenwicht (R2b)", () => {
    const zonderBod = berekenVoorstel({ ...VOORBEELD, biedingen: undefined });
    const maaltijden = zonderBod.kaarten.find((item) => item.kaart.id === MAALTIJDEN.id)!;
    expect(maaltijden.regel).toBe("R2b");
    expect(maaltijden.reden).toBe("Jullie willen dit allebei graag, voor het evenwicht");
  });
});

describe("de regels (R1 tot R5b)", () => {
  it("kiest de eerste regel die past", () => {
    expect(toewijzing("wil", "mag").regel).toBe("R1");
    expect(toewijzing("echt_niet", "wil").naar).toBe("sandra");
    expect(toewijzing("wil", "wil", { jan: 45, sandra: 55 })).toMatchObject({ naar: "sandra", regel: "R2", nipt: true });
    expect(toewijzing("wil", "wil", { jan: 40, sandra: 55 })).toMatchObject({ naar: "sandra", nipt: false });
    expect(toewijzing("wil", "wil", { jan: 50, sandra: 50 }).regel).toBe("R2b");
    expect(toewijzing("wil", "wil", { jan: 0, sandra: 0 }).regel).toBe("R2b");
    expect(toewijzing("mag", "echt_niet")).toMatchObject({ naar: "jan", regel: "R3" });
    expect(toewijzing("echt_niet", "liever_niet")).toMatchObject({ naar: "sandra", regel: "R4" });
    expect(toewijzing("echt_niet", "echt_niet").regel).toBe("R5");
    expect(toewijzing("liever_niet", "liever_niet").regel).toBe("R5");
    expect(toewijzing("mag", "mag").regel).toBe("R5b");
    expect(toewijzing(null, "wil").naar).toBe("evenwicht");
  });

  it("telt 1,5 keer enkel als niemand de kaart graag doet", () => {
    expect(niemandGraag("liever_niet", "echt_niet")).toBe(true);
    expect(niemandGraag("liever_niet", "mag")).toBe(false);
    expect(niemandGraag(null, "echt_niet")).toBe(false);
  });
});

describe("uren en mentale last (R7 tot R11)", () => {
  const k = kaart("Was", "spel");
  const invoer = (jan: Partial<Invoer>, sandra: Partial<Invoer>) => ({
    jan: new Map([[k.id, { claim: null, tijd: null, last: null, ...jan }]]),
    sandra: new Map([[k.id, { claim: null, tijd: null, last: null, ...sandra }]]),
  });

  it("neemt het gemiddelde van wie invulde, of 0", () => {
    expect(urenVan(k, invoer({ tijd: 3 }, { tijd: 5 }))).toBe(4.75);
    expect(urenVan(k, invoer({ tijd: 3 }, {}))).toBe(2.5);
    expect(urenVan(k, invoer({}, {}))).toBe(0);
    expect(urenVan({ ...k, vasteUren: 5 }, invoer({ tijd: 1 }, {}))).toBe(5);
    expect(mentaalVan(k, invoer({ last: 4 }, { last: 5 }))).toBe(4.5);
  });

  it("rondt af op een half uur, met een komma", () => {
    expect(halfJes(24.875)).toBe("25");
    expect(halfJes(3.25)).toBe("3,5");
    expect(halfJes(0.75)).toBe("1");
    expect(halfJes(13.5)).toBe("13,5");
  });

  it("is een overschrijding enkel boven de beschikbare tijd, en vult de balk hoogstens vol", () => {
    expect(overschreden({ uren: 34.5, mentaal: 0, beschikbaar: 34 })).toBe(true);
    expect(overschreden({ uren: 34, mentaal: 0, beschikbaar: 34 })).toBe(false);
    expect(overschreden({ uren: 34, mentaal: 0, beschikbaar: null })).toBe(false);
    expect(vulling({ uren: 40, mentaal: 0, beschikbaar: 34 })).toBe(100);
    expect(vulling({ uren: 17, mentaal: 0, beschikbaar: 34 })).toBe(50);
    expect(vulling({ uren: 17, mentaal: 0, beschikbaar: null })).toBe(0);
  });
});

describe("het evenwicht (R6)", () => {
  it("wisselt af bij een gelijke stand, te beginnen bij Jan", () => {
    const a = kaart("A", "spel");
    const b = kaart("B", "spel");
    const voorstel = berekenVoorstel({
      kaarten: [a, b],
      invoer: invoerVan([
        [a, [2, 2], [1, 1], ["mag", "mag"]],
        [b, [1, 1], [1, 1], ["mag", "mag"]],
      ]),
      beschikbareTijd: { jan: 30, sandra: 30 },
    });
    // A (1 u) gaat bij gelijke stand naar Jan; B (0,5 u) dan naar wie het minst draagt: Sandra.
    expect(voorstel.kaarten.map((item) => item.eigenaar)).toEqual(["jan", "sandra"]);

    const twee = berekenVoorstel({
      kaarten: [a, b],
      invoer: invoerVan([
        [a, [], [], ["mag", "mag"]] as unknown as Rij,
        [b, [], [], ["mag", "mag"]] as unknown as Rij,
      ]),
      beschikbareTijd: { jan: 30, sandra: 30 },
    });
    // Twee kaarten van 0 uur: telkens een gelijke stand, dus Jan en dan Sandra.
    expect(twee.kaarten.map((item) => item.eigenaar)).toEqual(["jan", "sandra"]);
  });
});

describe("samen verschuiven", () => {
  it("zet een kaart bij de ander of uitbesteed, en telt ze daar", () => {
    const verschuivingen = new Map<number, Verschuiving>([
      [POETSEN.id, "sandra"],
      [WAS.id, "uitbesteed"],
      [HOND.id, "jan"], // al bij Jan: geen verschuiving
      [VERHUUR_JAN.id, "sandra"], // vast: telt niet
    ]);
    const voorstel = berekenVoorstel({ ...VOORBEELD, verschuivingen });
    const van = (k: Kaart) => voorstel.kaarten.find((item) => item.kaart.id === k.id)!;
    expect([van(POETSEN).eigenaar, van(POETSEN).verschoven]).toEqual(["sandra", true]);
    expect([van(WAS).eigenaar, van(WAS).verschoven]).toEqual(["uitbesteed", true]);
    expect(van(HOND).verschoven).toBe(false);
    expect(van(VERHUUR_JAN).eigenaar).toBe("jan");
    expect(voorstel.verschoven).toBe(2);
    expect(voorstel.totaal.jan.uren).toBe(24.875 - 4.875);
    expect(voorstel.totaal.sandra.uren).toBe(22.5 - 3.75 + 4.875);
  });

  it("laat enkel kaarten die niemand graag doet uitbesteden", () => {
    const voorstel = berekenVoorstel(VOORBEELD);
    const uitbesteedbaar = voorstel.kaarten.filter(magUitbesteden).map((item) => item.kaart.titel);
    expect(uitbesteedbaar).toEqual(["Poetsen", "Was"]);
  });
});
