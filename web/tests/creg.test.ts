import { describe, expect, it } from "vitest";

import { haalTariefOp, htmlNaarTekst, leesCregCsv, zoekTariefKandidaten } from "@/lib/creg";

/**
 * Een echt fragment uit het bestand van CREG, byte order mark inbegrepen.
 *
 * De kolom "Average 3 months" staat enkel op de eerste maand van een kwartaal
 * ingevuld, en geldt voor het kwartaal dáárna. De rijen hieronder zijn precies
 * de drie waarmee dat nagegaan is tegen de tabel op de CREG-pagina.
 */
const CREG_CSV =
  "﻿Year;Month;" +
  "Flanders - Digital meter - End-user Price EV (c€/kWh);" +
  "Flanders - Digital meter - Average 3 months (M-2 to M-4);" +
  "Brussels - Classic meter - End-user Price EV (c€/kWh);" +
  "Brussels - Classic meter - Average 3 months (M-2 to M-4);" +
  "Wallonia - Classic meter - End-user Price EV (c€/kWh);" +
  "Wallonia - Classic meter - Average 3 months (M-2 to M-4)\n" +
  "2026;7;33,65;32,25;38,22;36,88;39,1;37,79\n" +
  "2026;6;32,17;;36,86;;37,74;\n" +
  "2026;5;30,93;;35,57;;36,53;\n" +
  "2026;4;32,71;32,22;37,64;37,19;38,38;37,83\n" +
  "2024;10;28,1;28,22;32,44;32,94;32,43;32,56\n";

describe("htmlNaarTekst", () => {
  it("haalt scripts, stijlen en tags weg", () => {
    const html = `
      <html><head><style>p { color: red }</style><script>var a = 1;</script></head>
      <body><p>Het tarief bedraagt 28,22&nbsp;c&euro;/kWh.</p></body></html>`;

    expect(htmlNaarTekst(html)).toBe("Het tarief bedraagt 28,22 c€/kWh.");
  });
});

describe("zoekTariefKandidaten", () => {
  it("herkent eurocent en zet om naar euro", () => {
    const kandidaten = zoekTariefKandidaten(
      "Voor het Vlaamse Gewest bedraagt het maximum 28,22 c€/kWh.",
      "vlaanderen",
    );

    expect(kandidaten[0].eur_per_kwh).toBe(0.2822);
  });

  it("herkent een bedrag in euro", () => {
    const kandidaten = zoekTariefKandidaten(
      "Vlaanderen: 0,2822 euro/kWh voor deze periode.",
      "vlaanderen",
    );

    expect(kandidaten[0].eur_per_kwh).toBe(0.2822);
  });

  it("herkent de schrijfwijze 'per kWh'", () => {
    const kandidaten = zoekTariefKandidaten(
      "In het Vlaams Gewest is dat 0,2809 euro per kWh.",
      "vlaanderen",
    );

    expect(kandidaten[0].eur_per_kwh).toBe(0.2809);
  });

  it("geeft de hoogste score aan de juiste regio en het juiste kwartaal", () => {
    const tekst =
      "Voor het derde kwartaal van 2026 bedraagt het maximum voor het Vlaamse Gewest " +
      "28,22 c€/kWh. Voor het Waals Gewest is dat 30,10 c€/kWh.";

    const kandidaten = zoekTariefKandidaten(tekst, "vlaanderen", { jaar: 2026, kwartaal: 3 });

    expect(kandidaten[0].eur_per_kwh).toBe(0.2822);
    expect(kandidaten[0].score).toBe(3);
  });

  it("kiest het Waalse cijfer als je Wallonië vraagt", () => {
    const tekst =
      "Vlaams Gewest: 28,22 c€/kWh. Waals Gewest: 30,10 c€/kWh voor hetzelfde kwartaal.";

    expect(zoekTariefKandidaten(tekst, "wallonie")[0].eur_per_kwh).toBe(0.301);
  });

  it("negeert bedragen buiten een geloofwaardige marge", () => {
    const kandidaten = zoekTariefKandidaten(
      "Het jaarverbruik bedraagt 3500 kWh en de bijdrage is 0,001 euro/kWh.",
      "vlaanderen",
    );

    expect(kandidaten).toHaveLength(0);
  });

  it("geeft de gevonden zin mee zodat je kan nakijken", () => {
    const kandidaten = zoekTariefKandidaten(
      "Voor het Vlaamse Gewest bedraagt het maximum 28,22 c€/kWh.",
      "vlaanderen",
    );

    expect(kandidaten[0].fragment).toContain("Vlaamse Gewest");
  });

  it("houdt geen dubbels over", () => {
    const tekst =
      "Vlaams Gewest 28,22 c€/kWh. Elders herhaald: Vlaams Gewest 28,22 c€/kWh.";

    expect(zoekTariefKandidaten(tekst, "vlaanderen")).toHaveLength(1);
  });
});

describe("haalTariefOp", () => {
  const kwartaal = { jaar: 2026, kwartaal: 3 };

  it("meldt netjes dat de pagina onbereikbaar is", async () => {
    const resultaat = await haalTariefOp(
      "https://voorbeeld.be",
      "vlaanderen",
      kwartaal,
      async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
    );

    expect(resultaat.gelukt).toBe(false);
    expect(resultaat.melding).toContain("handmatig");
  });

  it("meldt een foutstatus van de bron", async () => {
    const resultaat = await haalTariefOp(
      "https://voorbeeld.be",
      "vlaanderen",
      kwartaal,
      async () => new Response("", { status: 404 }),
    );

    expect(resultaat.gelukt).toBe(false);
    expect(resultaat.melding).toContain("404");
  });

  it("meldt het als er geen bedrag te vinden is", async () => {
    const resultaat = await haalTariefOp(
      "https://voorbeeld.be",
      "vlaanderen",
      kwartaal,
      async () => new Response("<p>Deze pagina is verhuisd.</p>", { status: 200 }),
    );

    expect(resultaat.gelukt).toBe(false);
    expect(resultaat.kandidaten).toHaveLength(0);
  });

  it("vindt het bedrag op een gewone pagina", async () => {
    const html =
      "<html><body><p>Voor het derde kwartaal van 2026 bedraagt het maximum voor " +
      "het Vlaamse Gewest 28,22 c&euro;/kWh.</p></body></html>";

    const resultaat = await haalTariefOp(
      "https://voorbeeld.be",
      "vlaanderen",
      kwartaal,
      async () => new Response(html, { status: 200 }),
    );

    expect(resultaat.gelukt).toBe(true);
    expect(resultaat.kandidaten[0].eur_per_kwh).toBe(0.2822);
  });
});

describe("leesCregCsv", () => {
  it("neemt het gemiddelde van het vorige kwartaal", () => {
    // Rij 2026;4 draagt 32,22 en dat is wat CREG Q3/2026 noemt.
    const resultaat = leesCregCsv(CREG_CSV, "vlaanderen", { jaar: 2026, kwartaal: 3 });

    expect(resultaat?.kandidaat?.eur_per_kwh).toBe(0.3222);
    expect(resultaat?.gezocht).toEqual({ jaar: 2026, maand: 4 });
  });

  it("kijkt voor Q1 in het jaar ervoor", () => {
    // Rij 2024;10 draagt 28,22 en dat is Q1/2025.
    const resultaat = leesCregCsv(CREG_CSV, "vlaanderen", { jaar: 2025, kwartaal: 1 });

    expect(resultaat?.kandidaat?.eur_per_kwh).toBe(0.2822);
    expect(resultaat?.gezocht).toEqual({ jaar: 2024, maand: 10 });
  });

  it("neemt per gewest de juiste kolom", () => {
    const periode = { jaar: 2026, kwartaal: 3 };

    expect(leesCregCsv(CREG_CSV, "brussel", periode)?.kandidaat?.eur_per_kwh).toBe(0.3719);
    expect(leesCregCsv(CREG_CSV, "wallonie", periode)?.kandidaat?.eur_per_kwh).toBe(0.3783);
  });

  it("rekent eurocent om naar euro", () => {
    const resultaat = leesCregCsv(CREG_CSV, "vlaanderen", { jaar: 2026, kwartaal: 4 });

    // 32,25 c€/kWh in het bestand, 0,3225 €/kWh in de app.
    expect(resultaat?.kandidaat?.eur_per_kwh).toBe(0.3225);
  });

  it("geeft de gelezen rij mee om na te kijken", () => {
    const resultaat = leesCregCsv(CREG_CSV, "vlaanderen", { jaar: 2026, kwartaal: 3 });

    expect(resultaat?.kandidaat?.fragment).toContain("2026-04");
    expect(resultaat?.kandidaat?.fragment).toContain("32,22");
    expect(resultaat?.kandidaat?.fragment).toContain("Flanders");
  });

  it("zegt het als het kwartaal er nog niet in staat", () => {
    const resultaat = leesCregCsv(CREG_CSV, "vlaanderen", { jaar: 2027, kwartaal: 3 });

    expect(resultaat).not.toBeNull();
    expect(resultaat?.kandidaat).toBeNull();
    expect(resultaat?.gezocht).toEqual({ jaar: 2027, maand: 4 });
  });

  it("herkent iets dat geen CREG-bestand is, zodat de tekstmethode het overneemt", () => {
    expect(leesCregCsv("<html><body>28,22 c€/kWh</body></html>", "vlaanderen", {
      jaar: 2026,
      kwartaal: 3,
    })).toBeNull();

    expect(leesCregCsv("naam;bedrag\nfoo;12", "vlaanderen", { jaar: 2026, kwartaal: 3 })).toBeNull();
  });
});

describe("haalTariefOp met het CREG-bestand", () => {
  it("leest het bedrag zonder te raden", async () => {
    const resultaat = await haalTariefOp(
      "https://www.creg.be/CREG_Tariff_EV.csv",
      "vlaanderen",
      { jaar: 2026, kwartaal: 3 },
      async () => new Response(CREG_CSV, { status: 200 }),
    );

    expect(resultaat.gelukt).toBe(true);
    expect(resultaat.kandidaten).toHaveLength(1);
    expect(resultaat.kandidaten[0].eur_per_kwh).toBe(0.3222);
    expect(resultaat.kandidaten[0].score).toBe(3);
    expect(resultaat.melding).toContain("CREG");
  });

  it("meldt een nog niet gepubliceerd kwartaal met de rij erbij", async () => {
    const resultaat = await haalTariefOp(
      "https://www.creg.be/CREG_Tariff_EV.csv",
      "vlaanderen",
      { jaar: 2027, kwartaal: 3 },
      async () => new Response(CREG_CSV, { status: 200 }),
    );

    expect(resultaat.gelukt).toBe(false);
    expect(resultaat.melding).toContain("2027-04");
    expect(resultaat.melding).toContain("handmatig");
  });
});
