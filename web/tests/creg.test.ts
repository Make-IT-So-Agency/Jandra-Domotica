import { describe, expect, it } from "vitest";

import { haalTariefOp, htmlNaarTekst, zoekTariefKandidaten } from "@/lib/creg";

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
