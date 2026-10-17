import { describe, expect, it } from "vitest";

import type { GeplaatstStuk } from "@/lib/bouw/inrichting";
import type { Xy } from "@/lib/bouw/omzetting/types";
import type { Punt } from "@/lib/bouw/punten";
import { eendraadschema, naamplek, regels, situatieschema, type Tekenstuk } from "@/lib/bouw/technieken/schema";
import {
  KNX_BUSKABEL,
  kastplaatsVan,
  kringletter,
  kva,
  maakVoorstel,
  schoneInstellingen,
  standaardInstellingen,
  toestelVan,
  type Kring,
  type Techniekinstellingen,
  type Techniekinvoer,
} from "@/lib/bouw/technieken/voorstel";
import { domoticaTekst, netwerkTekst, plaatsTekst, ruimtesTekst } from "@/lib/bouw/technieken/weergave";

const rechthoek = (x0: number, y0: number, x1: number, y1: number): Xy[][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];

let volgend = 1;
const punt = (verdieping: number, soort: string, x: number, y: number, over: Partial<Punt> = {}): Punt => ({
  id: volgend++,
  verdieping_id: verdieping,
  soort,
  x_m: x,
  y_m: y,
  hoogte_m: null,
  aantal: 1,
  label: null,
  opmerking: null,
  status: "gewenst",
  ...over,
});
const stuk = (verdieping: number, soort: string, x: number, y: number, over: Partial<GeplaatstStuk> = {}): GeplaatstStuk => ({
  id: volgend++,
  verdiepingId: verdieping,
  soort,
  x,
  y,
  z: 0,
  hoek: 0,
  kanteling: 0,
  breedte: 0.6,
  diepte: 0.6,
  hoogte: 1,
  label: null,
  ...over,
});
const reeks = (n: number, maak: (i: number) => Punt) => Array.from({ length: n }, (_, i) => maak(i));

/** Drie fasen van 25 A, domotica los van het merk, en enkel wat op het plan staat. */
const ANDER: Techniekinstellingen = { fasen: 3, stroom: 25, domotica: "ander", laadpaal: null, zonnepanelen: null, batterij: null };

// Een verzonnen huis: beneden een leefruimte, een keuken en een technische ruimte, boven een slaapkamer en een badkamer.
function huis(): Techniekinvoer {
  return {
    verdiepingen: [
      {
        id: 1,
        naam: "Gelijkvloers",
        gebouwId: 1,
        z0: 0,
        ruimtes: [
          { id: 11, naam: "Leefruimte", soort: "leefruimte", veelhoek: rechthoek(0, 0, 8, 6) },
          { id: 12, naam: "Keuken", soort: "keuken", veelhoek: rechthoek(8.2, 0, 12, 6) },
          { id: 13, naam: "Technieken", soort: "technieken", veelhoek: rechthoek(12.2, 0, 14, 3) },
        ],
      },
      {
        id: 2,
        naam: "Verdieping",
        gebouwId: 1,
        z0: 3,
        ruimtes: [
          { id: 21, naam: "Slaapkamer", soort: "slaapkamer", veelhoek: rechthoek(0, 0, 6, 6) },
          { id: 22, naam: "Badkamer", soort: "badkamer", veelhoek: rechthoek(6.2, 0, 10, 4) },
        ],
      },
    ],
    punten: [
      // Twaalf contactdozen beneden: acht in de leefruimte, vier in de keuken.
      ...reeks(6, (i) => punt(1, "stopcontact", 1 + i, 0.2)),
      ...reeks(2, (i) => punt(1, "stopcontact_dubbel", 1 + i, 5.8)),
      ...reeks(4, (i) => punt(1, "stopcontact", 9 + i * 0.5, 5.8)),
      ...reeks(3, (i) => punt(1, "stopcontact_aanrecht", 9 + i, 0.3)),
      ...reeks(4, (i) => punt(1, "lichtpunt", 2 + i, 3)),
      // Zes spots in de keuken: samen één lichtpunt.
      ...reeks(6, (i) => punt(1, "inbouwspot", 9 + i * 0.5, 3)),
      punt(1, "dimmer", 7.9, 2),
      punt(1, "vast_toestel", 9, 1, { label: "Kookplaat" }),
      punt(1, "vast_toestel", 10, 1, { label: "Oven" }),
      punt(1, "vast_toestel", 11, 1, { label: "Vaatwasser" }),
      punt(1, "vast_toestel", 11.5, 1, { label: "Koelkast" }),
      punt(1, "laadpunt", 16, 2),
      punt(1, "netwerk", 1, 0.3, { aantal: 2 }),
      punt(1, "netwerk", 10, 5.8, { aantal: 2 }),
      punt(1, "wifi", 4, 3),
      punt(1, "camera", 14.5, 0),
      ...reeks(4, (i) => punt(1, "drukknop", 0.2 + i * 2, 0.2)),
      punt(1, "aanwezigheid", 4, 4),
      // Boven: de badkamer met licht en een dubbel stopcontact, de slaapkamer, rolluiken.
      punt(2, "lichtpunt", 8, 2, { aantal: 2 }),
      punt(2, "stopcontact_dubbel", 9, 0.3),
      ...reeks(3, (i) => punt(2, "stopcontact", 1 + i, 0.2)),
      punt(2, "lichtpunt", 3, 3),
      punt(2, "rolluik", 3, 0, { aantal: 3 }),
      punt(2, "wifi", 3, 4),
    ],
    stukken: [
      stuk(1, "verdeelkast", 13.9, 1.5, { z: 1 }),
      stuk(1, "warmtepomp_binnen", 13, 2.5),
      stuk(1, "warmtepomp_buiten", 15, 2.5),
      stuk(1, "wasmachine", 12.5, 0.4),
      stuk(1, "omvormer", 13.5, 0.2),
      // Twee rijen van vier staande panelen.
      stuk(2, "zonnepanelen", 5, 3, { breedte: 4.58, diepte: 3.46, hoogte: 0.04 }),
    ],
  };
}

describe("de instellingen", () => {
  it("kiest driefasig met een laadpaal of warmtepomp, en domotica met drukknoppen", () => {
    const { punten, stukken } = huis();
    // Een laadpunt en een warmtepomp, drukknoppen, en panelen op het dak.
    expect(standaardInstellingen(punten, stukken)).toEqual({ fasen: 3, stroom: 25, domotica: "knx", laadpaal: 11, zonnepanelen: 3.44, batterij: null });
    expect(standaardInstellingen([{ soort: "stopcontact" }], [])).toEqual({ fasen: 1, stroom: 40, domotica: "geen", laadpaal: null, zonnepanelen: null, batterij: null });
    const batterij = [{ soort: "thuisbatterij", breedte: 0.75, diepte: 0.2 }];
    expect(standaardInstellingen([], batterij).batterij).toBe("eigen");
    expect(standaardInstellingen([], [...batterij, ...stukken]).batterij).toBe("hybride");
    expect(kva({ fasen: 3, stroom: 25 })).toBeCloseTo(17.3);
    expect(kva({ fasen: 1, stroom: 40 })).toBeCloseTo(9.2);
  });

  it("weigert wat niet kan", () => {
    const goed = { fasen: 3, stroom: 40, domotica: "knx", laadpaal: 22, zonnepanelen: 9.6, batterij: "hybride" };
    expect(schoneInstellingen(goed)).toEqual(goed);
    // Wat ontbreekt, is er niet.
    expect(schoneInstellingen({ fasen: 3, stroom: 25, domotica: "geen" })).toEqual({ ...ANDER, domotica: "geen" });
    expect(schoneInstellingen({ ...goed, zonnepanelen: 9.6049 })?.zonnepanelen).toBe(9.6);
    for (const fout of [
      { ...goed, fasen: 2 },
      { ...goed, fasen: 1, stroom: 25 },
      { ...goed, domotica: true },
      { ...goed, laadpaal: 15 },
      { ...goed, zonnepanelen: 0 },
      { ...goed, zonnepanelen: 250 },
      { ...goed, zonnepanelen: "9,6" },
      { ...goed, batterij: "ja" },
    ]) {
      expect(schoneInstellingen(fout), JSON.stringify(fout)).toBeNull();
    }
    expect(schoneInstellingen(null)).toBeNull();
  });

  it("herkent een vast toestel aan zijn label, en nummert de kringen", () => {
    expect(["Inductiekookplaat", "Stoomoven", "Vaatwasser", "Wasmachine", "Droogkast", "Diepvries", "Dampkap", null].map(toestelVan)).toEqual([
      "kookplaat",
      "oven",
      "vaatwasser",
      "wasmachine",
      "droogkast",
      "koeling",
      "toestel",
      "toestel",
    ]);
    expect([0, 1, 25, 26, 27].map(kringletter)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });
});

describe("waar de kasten komen", () => {
  it("bij de verdeelkast van Inrichten, anders in de technische ruimte, anders in het midden", () => {
    const invoer = huis();
    expect(kastplaatsVan(invoer)).toMatchObject({ verdiepingId: 1, punt: [13.9, 1.5], ruimte: "Technieken", bron: "verdeelkast" });
    const zonder = { ...invoer, stukken: [] };
    expect(kastplaatsVan(zonder)).toMatchObject({ verdiepingId: 1, ruimte: "Technieken", bron: "ruimte" });
    const zonderRuimte = { ...zonder, verdiepingen: zonder.verdiepingen.map((v) => ({ ...v, ruimtes: v.ruimtes.filter((r) => r.soort !== "technieken") })) };
    expect(kastplaatsVan(zonderRuimte)).toMatchObject({ verdiepingId: 1, bron: "midden" });
    expect(kastplaatsVan({ verdiepingen: [], punten: [], stukken: [] })).toBeNull();
  });
});

describe("het voorstel", () => {
  const voorstel = maakVoorstel(huis(), ANDER);
  const kring = (naam: string) => voorstel.kringen.find((k) => k.naam === naam);

  it("verdeelt de contactdozen per verdieping, hoogstens acht per kring", () => {
    const beneden = voorstel.kringen.filter((k) => k.naam.startsWith("Stopcontacten gelijkvloers"));
    expect(beneden.map((k) => [k.naam, k.telling])).toEqual([
      ["Stopcontacten gelijkvloers 1", 4],
      ["Stopcontacten gelijkvloers 2", 8],
    ]);
    expect(beneden[0]).toMatchObject({ beveiliging: { polen: "1P+N", ampere: 20 }, kabel: "XVB 3G2,5", differentieel: 0 });
    expect(kring("Stopcontacten aanrecht gelijkvloers")?.telling).toBe(3);
    expect(kring("Stopcontacten verdieping")?.telling).toBe(3);
  });

  it("telt spots in één ruimte als één lichtpunt, en legt de badkamer achter de 30 mA", () => {
    expect(kring("Verlichting gelijkvloers")).toMatchObject({ telling: 5, beveiliging: { ampere: 16 } });
    expect(kring("Verlichting gelijkvloers")?.punten).toHaveLength(10);
    const badkamer = kring("Badkamer")!;
    expect(badkamer.telling).toBe(3);
    expect(voorstel.differentielen[badkamer.differentieel]).toMatchObject({ gevoeligheid: 30, type: "A" });
  });

  it("geeft elk groot toestel zijn eigen kring, op drie fasen waar het kan", () => {
    expect(kring("Kookplaat")).toMatchObject({ beveiliging: { polen: "3P+N", ampere: 20 }, kabel: "XVB 5G2,5" });
    expect(kring("Warmtepomp")).toMatchObject({ beveiliging: { polen: "3P+N", ampere: 16 } });
    expect(voorstel.kringen.filter((k) => k.soort === "warmtepomp")).toHaveLength(1);
    expect(kring("Koelkast of diepvries")).toMatchObject({ differentieel: 0 });
    for (const naam of ["Vaatwasser", "Wasmachine"]) expect(voorstel.differentielen[kring(naam)!.differentieel].gevoeligheid).toBe(30);
    const laadpaal = kring("Laadpaal 11 kW")!;
    expect(laadpaal.beveiliging).toEqual({ polen: "3P+N", ampere: 16 });
    expect(voorstel.differentielen[laadpaal.differentieel]).toMatchObject({ gevoeligheid: 30, type: "A of B", polen: "4P" });
    expect(kring("Omvormer zonnepanelen")?.opmerking).toContain("8 panelen");
    expect(voorstel.zonnepanelen).toEqual({ panelen: 8, kwp: 3.44 });
  });

  it("telt de toestellen in het maatwerk, als er geen punt van die soort voor staat", () => {
    const zonderToestellen = huis();
    zonderToestellen.punten = zonderToestellen.punten.filter((p) => p.soort !== "vast_toestel");
    zonderToestellen.stukken = [
      ...zonderToestellen.stukken,
      stuk(1, "keuken_hoog", 9, 0.4, { indeling: { toestel: "twee" } }),
      stuk(1, "keuken_hoog", 9.6, 0.4, { indeling: { toestel: "koelkast" } }),
      stuk(1, "keukeneiland", 10, 3, { breedte: 3, diepte: 1, hoogte: 0.92, indeling: { kookplaat: "midden", vaatwasser: true } }),
    ];
    const keuken = maakVoorstel(zonderToestellen, ANDER);
    const namen = keuken.kringen.map((k) => k.naam);
    expect(namen).toEqual(expect.arrayContaining(["Oven 1", "Oven 2", "Kookplaat", "Vaatwasser", "Koelkast of diepvries"]));
    expect(keuken.kringen.find((k) => k.naam === "Oven 1")?.punten[0]).toMatchObject({ bron: "stuk", code: "OV", naam: "Oven in kolomkast", ruimte: "Keuken" });
    expect(keuken.kringen.find((k) => k.naam === "Kookplaat")?.beveiliging).toEqual({ polen: "3P+N", ampere: 20 });
    // Met een punt "Oven" op het plan telt dat punt, niet de ovens in de kast.
    const metPunt = maakVoorstel({ ...zonderToestellen, punten: [...zonderToestellen.punten, punt(1, "vast_toestel", 9, 1, { label: "Oven" })] }, ANDER);
    expect(metPunt.kringen.filter((k) => k.soort === "oven")).toHaveLength(1);
  });

  it("zet de kringen op volgorde: eerst de algemene, dan de 30 mA, dan de laadpaal, met letters en nummers", () => {
    const groepen = voorstel.kringen.map((k) => voorstel.differentielen[k.differentieel].gevoeligheid === 300 ? 0 : k.soort === "laadpaal" ? 2 : 1);
    expect([...groepen]).toEqual([...groepen].sort((a, b) => a - b));
    expect(voorstel.kringen.map((k) => k.letter)).toEqual(voorstel.kringen.map((_, i) => kringletter(i)));
    const eerste = voorstel.kringen[0];
    expect(eerste.punten.map((p) => p.nummer)).toEqual(eerste.punten.map((_, i) => `${eerste.letter}${i + 1}`));
    expect(voorstel.differentielen[0]).toMatchObject({ gevoeligheid: 300, polen: "4P", ampere: 40 });
  });

  it("schat de kabels, van de kast door de punten", () => {
    for (const k of voorstel.kringen) expect(k.kabellengte, k.naam).toBeGreaterThan(0);
    // Een kring boven loopt drie meter hoger.
    expect(kring("Stopcontacten verdieping")!.kabellengte!).toBeGreaterThan(15);
    expect(voorstel.kabels.map((k) => k.soort)).toEqual(expect.arrayContaining(["XVB 3G2,5", "XVB 5G2,5", "UTP cat. 6"]));
  });

  it("telt de uitgangen en ingangen voor de domotica", () => {
    // De vier lichtpunten van de leefruimte gedimd (er hangt een dimmer), de spots in de keuken samen op één relais.
    expect(voorstel.domotica).toMatchObject({ relais: 3, dimmers: 4, motoren: 3, drukknoppen: 5, melders: 1 });
    expect(voorstel.domotica!.kast.rijen).toBeGreaterThanOrEqual(2);
    expect(kring("Domoticakast")).toBeDefined();
    expect(kring("Verlichting gelijkvloers")?.kabel).toBe("XVB 3G1,5 per lichtgroep");
  });

  it("telt de netwerkpoorten, met PoE voor wifi en camera's, en kiest het rack", () => {
    const { netwerk } = voorstel;
    // Netwerk, wifi, de camera, drie toestellen, de domoticakast en de digitale meter.
    expect(netwerk.totaal).toBe(4 + 2 + 1 + 3 + 1 + 1);
    expect(netwerk.poorten.map((p) => p.wat)).toEqual(expect.arrayContaining(["Domoticakast", "Digitale meter (P1-poort)"]));
    expect(netwerk.poe).toBe(3);
    expect(netwerk).toMatchObject({ patchpanelen: 1, switchpoorten: 24, hoogte: 9, telang: 0 });
    expect(netwerk.kabellengte).toBeGreaterThan(0);
  });

  it("past de verdeelkast in rijen van 13 modules, met plaats over", () => {
    const { verdeelkast } = voorstel;
    expect(verdeelkast.modules).toBe(verdeelkast.regels.reduce((s, r) => s + r.aantal * r.breedte, 0));
    expect((verdeelkast.rijen - 1) * 13).toBeLessThan(verdeelkast.modules + verdeelkast.reserve);
    expect(verdeelkast.rijen * 13).toBeGreaterThanOrEqual(verdeelkast.modules + verdeelkast.reserve);
  });
});

describe("zonder domotica, op één fase", () => {
  it("houdt de verlichting doorgelust, en waarschuwt voor de laadpaal", () => {
    const voorstel = maakVoorstel(huis(), { ...ANDER, fasen: 1, stroom: 40, domotica: "geen" });
    expect(voorstel.domotica).toBeNull();
    expect(voorstel.kringen.find((k) => k.soort === "domotica")).toBeUndefined();
    expect(voorstel.kringen.find((k) => k.naam === "Verlichting gelijkvloers")?.kabel).toBe("XVB 3G1,5");
    expect(voorstel.kringen.find((k) => k.naam === "Kookplaat")).toMatchObject({ beveiliging: { polen: "1P+N", ampere: 32 }, kabel: "XVB 3G6" });
    expect(voorstel.differentielen[0]).toMatchObject({ polen: "2P", ampere: 40 });
    expect(voorstel.opmerkingen.join(" ")).toContain("driefasige aansluiting");
  });
});

describe("KNX met Home Assistant", () => {
  const voorstel = maakVoorstel(huis(), { ...ANDER, domotica: "knx" });
  const { domotica, netwerk } = voorstel;

  it("zet de drukknoppen en melders op de bus, en de actoren in de kast", () => {
    // Vier drukknoppen, een dimmer en een aanwezigheidsmelder op de bus; een schakel-, een dim- en een jaloezieactor.
    expect(domotica).toMatchObject({ systeem: "knx", relais: 3, dimmers: 4, motoren: 3, knx: { toestellen: 6 + 3 + 1, lijnen: 1 } });
    const regels = Object.fromEntries(domotica!.kast.regels.map((r) => [r.wat, r.aantal]));
    expect(regels).toMatchObject({
      "KNX-voeding 640 mA, met smoorspoel": 1,
      "KNX IP-router, naar Home Assistant": 1,
      "Schakelactor 12 kanalen, 16 A": 1,
      "Dimactor 4 kanalen, universeel": 1,
      "Jaloezieactor 8 kanalen, 230 V": 1,
    });
    const bus = domotica!.kabels.find((k) => k.soort === KNX_BUSKABEL)!;
    expect(bus.aantal).toBe(6);
    expect(bus.lengte).toBeGreaterThan(0);
    expect(domotica!.kabels.map((k) => k.soort)).not.toContain("UTP of buskabel");
    expect(voorstel.kabels.map((k) => k.soort)).toContain(KNX_BUSKABEL);
  });

  it("legt elke lichtgroep naar een actor, en koppelt Home Assistant op het netwerk", () => {
    const licht = voorstel.kringen.find((k) => k.naam === "Verlichting gelijkvloers")!;
    expect(licht.kabel).toBe("XVB 3G1,5 per lichtgroep");
    expect(licht.opmerking).toContain("schakel- of dimactor");
    const poorten = netwerk.poorten.map((p) => p.wat);
    expect(poorten).toEqual(expect.arrayContaining(["KNX IP-router", "Home Assistant (mini-pc of Home Assistant Green)", "Digitale meter (P1-poort)"]));
    expect(poorten).not.toContain("Domoticakast");
  });

  it("verdeelt meer dan 64 toestellen over meer lijnen", () => {
    const invoer = huis();
    invoer.punten.push(...reeks(70, (i) => punt(1, "drukknop", 0.5 + (i % 7), 0.5 + Math.floor(i / 7) * 0.5)));
    const groot = maakVoorstel(invoer, { ...ANDER, domotica: "knx" });
    expect(groot.domotica!.knx!.lijnen).toBe(2);
    expect(groot.domotica!.kast.regels.find((r) => r.wat.startsWith("KNX-voeding"))?.aantal).toBe(2);
    expect(groot.opmerkingen.join(" ")).toContain("2 lijnen");
  });
});

describe("de laadpaal, de zonnepanelen en de batterij", () => {
  it("geeft een laadpaal van 22 kW drie fasen van 32 A, en waarschuwt voor de aansluiting", () => {
    const op25 = maakVoorstel(huis(), { ...ANDER, laadpaal: 22 });
    const laadpaal = op25.kringen.find((k) => k.soort === "laadpaal")!;
    expect(laadpaal).toMatchObject({ naam: "Laadpaal 22 kW", beveiliging: { polen: "3P+N", ampere: 32 }, kabel: "XVB 5G6" });
    expect(op25.differentielen[laadpaal.differentieel]).toMatchObject({ polen: "4P", type: "A of B" });
    expect(op25.opmerkingen.join(" ")).toContain("grotere aansluiting");
    const op40 = maakVoorstel(huis(), { ...ANDER, stroom: 40, domotica: "knx", laadpaal: 22 });
    const tekst = op40.opmerkingen.join(" ");
    expect(tekst).toContain("neemt 32 van de 40 A");
    expect(tekst).toContain("capaciteitstarief");
    expect(tekst).toContain("Home Assistant");
  });

  it("laadt op één fase hoogstens 7,4 kW", () => {
    const voorstel = maakVoorstel(huis(), { ...ANDER, fasen: 1, stroom: 40, laadpaal: 22 });
    const laadpaal = voorstel.kringen.find((k) => k.soort === "laadpaal")!;
    expect(laadpaal).toMatchObject({ naam: "Laadpaal 7,4 kW", beveiliging: { polen: "1P+N", ampere: 32 }, kabel: "XVB 3G6" });
    expect(voorstel.differentielen[laadpaal.differentieel].polen).toBe("2P");
    expect(voorstel.opmerkingen.join(" ")).toContain("vraagt drie fasen");
  });

  it("zet erbij wat bij Uitgangspunten staat maar nog niet op het plan, zonder kabel", () => {
    const invoer = huis();
    invoer.punten = invoer.punten.filter((p) => p.soort !== "laadpunt");
    invoer.stukken = invoer.stukken.filter((s) => s.soort !== "omvormer" && s.soort !== "zonnepanelen");
    const voorstel = maakVoorstel(invoer, { ...ANDER, laadpaal: 22, zonnepanelen: 9.6, batterij: "eigen" });
    const zonder = voorstel.kringen.filter((k) => ["laadpaal", "omvormer", "batterij"].includes(k.soort));
    expect(zonder.map((k) => k.naam)).toEqual(["Omvormer zonnepanelen", "Thuisbatterij", "Laadpaal 22 kW"]);
    for (const k of zonder) {
      expect(k.kabellengte, k.naam).toBeNull();
      expect(k.punten).toHaveLength(0);
      expect(k.opmerking, k.naam).toContain("Nog niet op het plan");
    }
    expect(zonder[0].opmerking).toContain("9,6 kWp");
    expect(voorstel.zonnepanelen).toEqual({ panelen: 0, kwp: 9.6 });
    // Een netwerkpoort per toestel, ook zonder plaats.
    expect(voorstel.netwerk.poorten.find((p) => p.wat.startsWith("Toestellen"))?.aantal).toBe(4);
  });

  it("hangt een hybride batterij aan de omvormer", () => {
    const invoer = huis();
    invoer.stukken.push(stuk(1, "thuisbatterij", 13.5, 2.8));
    const eigen = maakVoorstel(invoer, { ...ANDER, batterij: "eigen" });
    expect(eigen.kringen.some((k) => k.soort === "batterij")).toBe(true);
    const hybride = maakVoorstel(invoer, { ...ANDER, batterij: "hybride" });
    expect(hybride.kringen.some((k) => k.soort === "batterij")).toBe(false);
    expect(hybride.kringen.find((k) => k.soort === "omvormer")?.opmerking).toContain("Hybride");
  });
});

describe("een bijgebouw", () => {
  it("schat geen kabel naar een ander gebouw, en zegt het", () => {
    const invoer = huis();
    invoer.verdiepingen.push({ id: 3, naam: "Garage", gebouwId: 2, z0: 0, ruimtes: [{ id: 31, naam: "Garage", soort: "garage", veelhoek: rechthoek(0, 0, 6, 4) }] });
    invoer.punten.push(punt(3, "stopcontact", 1, 0.2), punt(3, "lichtpunt", 3, 2));
    const voorstel = maakVoorstel(invoer, { ...ANDER, domotica: "geen" });
    const garage = voorstel.kringen.filter((k) => k.punten.some((p) => p.verdiepingId === 3));
    expect(garage.length).toBeGreaterThan(0);
    for (const k of garage) expect(k.kabellengte).toBeNull();
    expect(voorstel.opmerkingen.join(" ")).toContain("ander gebouw");
  });
});

describe("de tekeningen", () => {
  const voorstel = maakVoorstel(huis(), ANDER);
  const teksten = (stukken: Tekenstuk[]) => stukken.flatMap((s) => (s.soort === "tekst" ? [s.tekst] : []));

  it("tekent elke kring met haar letter, automaat, kabel en punten", () => {
    const schema = eendraadschema(voorstel);
    const alle = teksten(schema.stukken);
    for (const kring of voorstel.kringen) {
      expect(alle).toContain(kring.letter);
      for (const punt of kring.punten) expect(alle.some((t) => t.startsWith(`${punt.nummer} ${punt.code}`))).toBe(true);
    }
    expect(alle).toContain("Net 3N400 V, 25 A");
    expect(alle).toContain("300 mA");
    expect(alle.filter((t) => t === "30 mA")).toHaveLength(voorstel.differentielen.length - 1);
    // Alles binnen de tekening.
    for (const s of schema.stukken) {
      const punten: [number, number][] = s.soort === "lijn" || s.soort === "vlak" ? s.punten : [[s.x, s.y]];
      for (const [x, y] of punten) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(schema.breedte);
        expect(y).toBeLessThanOrEqual(schema.hoogte);
      }
    }
  });

  it("tekent per verdieping waar elk punt ligt, met de verdeelkast", () => {
    const [gelijkvloers, verdieping] = huis().verdiepingen;
    const beneden = situatieschema(voorstel, gelijkvloers)!;
    expect(teksten(beneden.stukken)).toEqual(expect.arrayContaining(["VK", "Leefruimte", "Technieken"]));
    const boven = situatieschema(voorstel, verdieping)!;
    expect(teksten(boven.stukken)).not.toContain("VK");
    expect(boven.breedte).toBeLessThanOrEqual(760);
    expect(situatieschema(voorstel, { id: 9, naam: "Zolder", gebouwId: 1, z0: 6, ruimtes: [] })).toBeNull();
  });

  it("zet de naam van een ruimte naast het lichtpunt in het midden, en binnen de ruimte", () => {
    const ring: Xy[] = [
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80],
    ];
    // Niets in de weg: het midden.
    expect(naamplek([50, 40], "Wc", ring, [])).toEqual([50, 40]);
    // Een lichtpunt met zijn nummer in het midden: wat lager.
    const [x, y] = naamplek([50, 40], "Wc", ring, [[46, 29, 66, 44]]);
    expect(x).toBe(50);
    expect(y).toBeGreaterThan(44 + 7);
    // Te klein om opzij te gaan: toch het midden.
    const klein: Xy[] = [
      [40, 30],
      [60, 30],
      [60, 46],
      [40, 46],
    ];
    expect(naamplek([50, 40], "Berging", klein, [[46, 29, 66, 44]])).toEqual([50, 40]);
  });

  it("schrijft de kasten en de ruimtes kort", () => {
    const kring = (naam: string, ruimtes: (string | null)[]) => ({ naam, punten: ruimtes.map((ruimte) => ({ ruimte })) }) as unknown as Kring;
    expect(ruimtesTekst(kring("Badkamer", ["Badkamer", "Badkamer"]))).toBe("");
    expect(ruimtesTekst(kring("Buiten", ["Leefruimte", null]))).toBe("Leefruimte, buiten");
    expect(domoticaTekst({ relais: 11, dimmers: 5, led: 0, motoren: 1, drukknoppen: 8, melders: 0 })).toBe("11 relais, 5 dimmers en 1 motor; 8 drukknoppen");
    expect(domoticaTekst({ relais: 0, dimmers: 0, led: 0, motoren: 0, drukknoppen: 0, melders: 0 })).toBe("geen uitgangen; geen drukknoppen of melders");
    expect(netwerkTekst({ patchpanelen: 1, switchpoorten: 24, poe: 0, hoogte: 9, kabellengte: 130, telang: 1 })).toBe(
      "1 patchpaneel van 24, een switch van 24 poorten, en een wandkast van 9 U met plaats voor de router, de modem en een stekkerdoos. " +
        "UTP cat. 6, één kabel per poort: ± 130 m. 1 kabel is langer dan 90 m: daar haalt UTP de volle snelheid niet.",
    );
    const verdiepingen = [{ id: 1, naam: "Woning · Gelijkvloers" }];
    expect(plaatsTekst({ gebouwId: 1, verdiepingId: 1, punt: [0, 0], ruimte: "Berging", bron: "verdeelkast" }, verdiepingen)).toBe(
      "Berging (woning · gelijkvloers): waar de verdeelkast bij Inrichten staat.",
    );
    expect(plaatsTekst({ gebouwId: 1, verdiepingId: 1, punt: [0, 0], ruimte: null, bron: "netwerkkast" }, verdiepingen)).toBe(
      "Woning · gelijkvloers: waar de netwerkkast bij Inrichten staat.",
    );
  });

  it("breekt lange namen in regels", () => {
    expect(regels("Stopcontacten gelijkvloers 2", 16)).toEqual(["Stopcontacten", "gelijkvloers 2"]);
    expect(regels("een twee drie vier vijf zes zeven", 9, 2)).toEqual(["een twee", "drie vie…"]);
  });
});
