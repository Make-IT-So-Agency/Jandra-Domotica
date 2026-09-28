import { describe, expect, it } from "vitest";

import { naamKlopt, soortVan, zoekTegel } from "../src/iactive.ts";
import { afgehandeld, inschrijfbaar, leesStaat, maandVanTitel } from "../src/tegels.ts";
import { stukken } from "../src/telegram.ts";

const tegel = (titel: string, klassen = "fc-event calendarblauw", balk = "", iconen = "") => ({ titel, klassen, balk, iconen });

describe("staat van een tegel, zoals gezien in de kalender van november en december 2026", () => {
  it("vrij: 'Inschrijven tot'", () => {
    expect(leesStaat(tegel("Inschrijven tot: 16/11/2026 06:00", "fc-event progress-bar-fill pb_default", "38%"))).toBe("vrij");
  });
  it("volzet: 'Inschrijven OP RESERVELIJST tot' en de balk RESERVE", () => {
    expect(leesStaat(tegel("Inschrijven OP RESERVELIJST tot: 16/11/2026 11:00", "fc-event pb_full", "RESERVE"))).toBe("volzet");
  });
  it("gesloten: calendaralert of 'beëindigd'", () => {
    expect(leesStaat(tegel("", "fc-event calendaralert"))).toBe("gesloten");
    expect(leesStaat(tegel("Inschrijven beëindigd op 02/11/2026"))).toBe("gesloten");
  });
  it("nog niet open: 'Inschrijven vanaf'", () => {
    expect(leesStaat(tegel("Inschrijven vanaf 06/10/2026 18:00", "fc-event calendarblauw no_click"))).toBe("nog_niet_open");
  });
  it("ingeschreven: klasse en titel, ook al is de balk vol", () => {
    expect(leesStaat(tegel("Ingeschreven", "fc-event ingeschreven progress-bar-fill pb_full", "RESERVE"))).toBe("ingeschreven");
  });
  it("reservelijst: het icoon uit de legende", () => {
    expect(leesStaat(tegel("Inschrijven OP RESERVELIJST tot: x", "fc-event", "", "fa fa-pause-circle"))).toBe("reservelijst");
  });
  it("volzet is niet 'op de reservelijst': de titel begint met Inschrijven", () => {
    expect(leesStaat(tegel("Inschrijven OP RESERVELIJST tot: x"))).toBe("volzet");
  });
  it("wat inschrijfbaar en wat afgehandeld is", () => {
    expect(inschrijfbaar("vrij") && inschrijfbaar("volzet")).toBe(true);
    expect(inschrijfbaar("nog_niet_open") || inschrijfbaar("gesloten") || inschrijfbaar("ingeschreven")).toBe(false);
    expect(afgehandeld("ingeschreven") && afgehandeld("reservelijst")).toBe(true);
    expect(afgehandeld("volzet")).toBe(false);
  });
});

describe("maandtitel", () => {
  it("leest de titel van FullCalendar", () => {
    expect(maandVanTitel("december 2026")).toBe("2026-12");
    expect(maandVanTitel("November 2026")).toBe("2026-11");
    expect(maandVanTitel("")).toBeNull();
  });
});

describe("een gekozen tegel terugvinden", () => {
  const dag = [
    { datum: "2026-12-22", moment: "Kerstvakantie Voormiddag", locatie: "BKO - A" },
    { datum: "2026-12-22", moment: "Kerstvakantie Voormiddag", locatie: "BKO - B" },
    { datum: "2026-12-22", moment: "Kerstvakantie Namiddag", locatie: "BKO - A" },
  ];
  it("exact op dag, tekst en locatie", () => {
    expect(zoekTegel(dag, { datum: "2026-12-22", moment: "Kerstvakantie Voormiddag", locatie: "BKO - B" })).toBe(dag[1]);
  });
  it("als de tekst veranderde: hetzelfde soort op dezelfde locatie, als dat er één is", () => {
    expect(zoekTegel(dag, { datum: "2026-12-22", moment: "Namiddag (verwerking)", locatie: "BKO - A" })).toBe(dag[2]);
  });
  it("nooit een gok: geen treffer op een andere locatie of dag", () => {
    expect(zoekTegel(dag, { datum: "2026-12-22", moment: "Namiddag", locatie: "BKO - B" })).toBeNull();
    expect(zoekTegel(dag, { datum: "2026-12-23", moment: "Kerstvakantie Voormiddag", locatie: "BKO - A" })).toBeNull();
  });
  it("soort opvang uit de tekst", () => {
    expect(soortVan("Voorschoolse opvang (verwerking)")).toBe("voor");
    expect(soortVan("Naschoolse opvang (verwerking)")).toBe("na");
    expect(soortVan("Woensdagmiddag opvang (verwerking)")).toBe("woe");
    expect(soortVan("Kerstvakantie Volle dag")).toBe("dag");
    expect(soortVan("Kerstvakantie Namiddag Speelhuis: opvang gesloten om 16:00 uur")).toBe("nm");
  });
});

describe("naam bij een vinkje", () => {
  it("voornaam, met of zonder familienaam, zonder accenten", () => {
    expect(naamKlopt("Zoë Janssens", "Zoë")).toBe(true);
    expect(naamKlopt("zoe", "Zoë")).toBe(true);
    expect(naamKlopt("Lars Janssens", "Zoë")).toBe(false);
    expect(naamKlopt("Lars", "")).toBe(false);
  });
});

describe("lange berichten", () => {
  it("knipt op regels", () => {
    const tekst = Array.from({ length: 10 }, (_, i) => `regel ${i}`).join("\n");
    const delen = stukken(tekst, 20);
    expect(delen.join("\n")).toBe(tekst);
    expect(delen.every((d) => d.length <= 20)).toBe(true);
  });
});
