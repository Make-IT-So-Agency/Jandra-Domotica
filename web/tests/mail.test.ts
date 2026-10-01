import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lijktEenAdres, mailStaatAan, verstuurMail } from "@/lib/mail";
import { bouwBericht, bouwOnderwerp } from "@/lib/rapport-mail";
import type { RapportMomentopname } from "@/lib/types";

const MOMENTOPNAME: RapportMomentopname = {
  vennootschap: { naam: "Sascon", btw_nummer: "BE0123456789", adres: "Dorpsstraat 1" },
  begunstigde: {
    naam: "Jan Festjens",
    adres: "Dorpsstraat 1",
    email: "jan@makeitso.be",
    rekeningnummer: "BE00 0000 0000 0000",
    btw_nummer: "BE0987654321",
  },
  periode: { start: "2026-07-01", eind: "2026-09-30", label: "Q3 2026", soort: "quarter" },
  regels: [],
  totalen: { aantal_sessies: 40, kwh: 932.6, excl_btw: 283.46, btw: 17.01, incl_btw: 300.47 },
  meterstanden: [],
  tarieven: [],
  opgemaakt_op: "2026-10-01T07:00:00Z",
};

describe("lijktEenAdres", () => {
  it("aanvaardt een gewoon adres", () => {
    expect(lijktEenAdres("boekhouder@kantoor.be")).toBe(true);
    expect(lijktEenAdres("  boekhouder@kantoor.be  ")).toBe(true);
  });

  it("weigert wat geen adres is", () => {
    for (const waarde of [null, undefined, "", "   ", "de boekhouder", "a@b", "a@b.c d"]) {
      expect(lijktEenAdres(waarde)).toBe(false);
    }
  });
});

describe("bouwOnderwerp", () => {
  it("noemt periode, vennootschap en referentie", () => {
    expect(bouwOnderwerp(MOMENTOPNAME, "LK-2026-SASCON-003")).toBe(
      "Laadkosten Q3 2026 — Sascon (LK-2026-SASCON-003)",
    );
  });
});

describe("bouwBericht", () => {
  const bericht = bouwBericht(MOMENTOPNAME, "LK-2026-SASCON-003");

  it("zet de cijfers erin die de boekhouder nodig heeft", () => {
    expect(bericht).toContain("Sascon");
    expect(bericht).toContain("Q3 2026");
    expect(bericht).toContain("01/07/2026 t.e.m. 30/09/2026");
    expect(bericht).toContain("40");
    expect(bericht).toContain("932,60 kWh");
    expect(bericht).toContain("LK-2026-SASCON-003");
  });

  it("toont het totaal inclusief btw voluit", () => {
    // Dit is het bedrag dat terugbetaald wordt; het mag niet afgerond of
    // anders opgemaakt in de mail staan dan in het rapport zelf.
    expect(bericht).toContain("300,47");
  });

  it("zwijgt over zonne-energie", () => {
    // Het rapport is voor de boekhouder; wat van het eigen dak kwam is intern.
    expect(bericht.toLowerCase()).not.toContain("zon");
  });

  it("ondertekent met de begunstigde", () => {
    expect(bericht.trimEnd().endsWith("Jan Festjens")).toBe(true);
  });
});

describe("mailStaatAan", () => {
  const bewaard = { ...process.env };

  afterEach(() => {
    process.env = { ...bewaard };
  });

  it("staat uit zonder sleutel of zonder afzender", () => {
    delete process.env.RESEND_API_KEY;
    process.env.MAIL_AFZENDER = "Laadkosten <laadkosten@makeitso.be>";
    expect(mailStaatAan()).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    delete process.env.MAIL_AFZENDER;
    expect(mailStaatAan()).toBe(false);
  });

  it("staat aan met allebei", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_AFZENDER = "Laadkosten <laadkosten@makeitso.be>";
    expect(mailStaatAan()).toBe(true);
  });
});

describe("verstuurMail", () => {
  const bewaard = { ...process.env };
  let opgevangen: { url: string; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_AFZENDER = "Laadkosten <laadkosten@makeitso.be>";
    opgevangen = null;

    vi.stubGlobal("fetch", async (url: string, opties: RequestInit) => {
      opgevangen = { url, body: JSON.parse(String(opties.body)) };
      return new Response(JSON.stringify({ id: "bericht-1" }), { status: 200 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...bewaard };
  });

  it("stuurt afzender, ontvanger en onderwerp mee", async () => {
    const id = await verstuurMail({
      aan: "boekhouder@kantoor.be",
      onderwerp: "Laadkosten Q3 2026",
      tekst: "Beste,",
    });

    expect(id).toBe("bericht-1");
    expect(opgevangen!.body.from).toBe("Laadkosten <laadkosten@makeitso.be>");
    expect(opgevangen!.body.to).toEqual(["boekhouder@kantoor.be"]);
    expect(opgevangen!.body.subject).toBe("Laadkosten Q3 2026");
  });

  it("zet bijlagen om naar base64", async () => {
    await verstuurMail({
      aan: "boekhouder@kantoor.be",
      onderwerp: "x",
      tekst: "x",
      bijlagen: [{ bestandsnaam: "rapport.pdf", inhoud: Buffer.from("hallo") }],
    });

    expect(opgevangen!.body.attachments).toEqual([
      { filename: "rapport.pdf", content: Buffer.from("hallo").toString("base64") },
    ]);
  });

  it("laat reply_to weg als het adres niet deugt", async () => {
    await verstuurMail({
      aan: "boekhouder@kantoor.be",
      onderwerp: "x",
      tekst: "x",
      antwoordNaar: "",
    });

    expect(opgevangen!.body).not.toHaveProperty("reply_to");
  });

  it("weigert te versturen naar iets dat geen adres is", async () => {
    await expect(
      verstuurMail({ aan: "de boekhouder", onderwerp: "x", tekst: "x" }),
    ).rejects.toThrow(/adres/);
  });

  it("weigert te versturen zonder sleutel", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      verstuurMail({ aan: "boekhouder@kantoor.be", onderwerp: "x", tekst: "x" }),
    ).rejects.toThrow(/staat uit/);
  });

  it("neemt de uitleg van Resend mee in de fout", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ message: "domain is not verified" }), { status: 403 }),
    );

    await expect(
      verstuurMail({ aan: "boekhouder@kantoor.be", onderwerp: "x", tekst: "x" }),
    ).rejects.toThrow(/403.*not verified/s);
  });
});
