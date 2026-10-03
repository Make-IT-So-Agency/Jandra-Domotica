import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NAAR ${url}`);
  },
}));

import { GET as openBestand } from "@/app/extern/[token]/bestand/[bestandId]/route";
import { meldHersteldActie, rondInzendingAfActie, startInzendingActie } from "@/app/extern/[token]/acties";
import {
  MAX_INZENDINGEN_PER_DAG,
  TOKENVORM,
  controleerGeldvelden,
  schoneRechten,
  standVanLink,
  standaardRechten,
} from "@/lib/bouw/linkregels";
import { hashVan, leesLink, lijstInzendingen, maakLink, telUploadsVanLink, trekLinkIn } from "@/lib/bouw/links";
import { ruimOngebruikteBestandenOp } from "@/lib/bouw/opladen";
import { bewaarBottoken } from "@/lib/bouw/telegram-koppeling";

let db: ReturnType<typeof nepSupabase>;
let verstuurd: Record<string, unknown>[];
const pdf = new TextEncoder().encode("%PDF-1.7\nnep");

beforeEach(() => {
  verstuurd = [];
  db = nepSupabase({
    bouw_huizen: [{ ...TESTHUIS }],
    bouw_partijen: metHuis([
      { id: 1, soort: "architect", naam: "Architectenbureau Voorbeeld" },
      { id: 2, soort: "aannemer", naam: "Bouwbedrijf Voorbeeld" },
    ]),
    bouw_links: [],
    bouw_bestanden: metHuis([
      { id: 50, pad: "plannen/dossier.pdf", doel: "plan", status: "klaar", oorspronkelijke_naam: "dossier.pdf", opgeladen_door: "jan@voorbeeld.be" },
      { id: 51, pad: "fotos/foto.jpg", doel: "foto", status: "klaar", oorspronkelijke_naam: "IMG.jpg", opgeladen_door: "jan@voorbeeld.be" },
    ]),
    bouw_plannen: metHuis([{ id: 7, titel: "Grondplan", soort: "grondplan", gebouw_id: null, verdieping_id: null, bladcode: null }]),
    bouw_planversies: [{ id: 70, plan_id: 7, bestand_id: 50, label: "v1", pagina: 1 }],
    bouw_inzendingen: [],
    bouw_instellingen: [],
  });
  nep.client = db.client;
  vi.stubEnv("AUTH_URL", "https://jandra.voorbeeld.be");
  vi.stubEnv("AUTH_SECRET", "links-testgeheim-0123456789abcdef");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api.telegram.org")) {
        verstuurd.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true, result: {} });
      }
      // Storage: de eerste bytes van een opgeladen bestand.
      const pad = new URL(url).pathname.slice(1);
      const object = db.objecten.get(pad);
      return object ? new Response(new Blob([new Uint8Array(object.inhoud)]), { status: 206 }) : new Response("weg", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const morgen = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

describe("de regels van een link", () => {
  it("geeft elke soort partij wat ze nodig heeft", () => {
    expect(standaardRechten("architect")).toEqual(["plannen", "inzenden", "facturen", "keuzes", "planning"]);
    expect(standaardRechten("aannemer")).toEqual(["plannen", "offertes", "facturen", "oplevering", "planning"]);
    expect(standaardRechten("leverancier")).toEqual(["plannen", "offertes", "facturen"]);
    expect(standaardRechten("bank")).toEqual(["plannen"]);
  });

  it("kijkt het bedrag en de datums van een offerte of factuur na", () => {
    expect(controleerGeldvelden("plan", { bedrag: "onzin" })).toEqual({
      ok: true,
      waarde: { bedrag: null, nummer: null, datum: null, vervaldag: null },
    });
    expect(controleerGeldvelden("offerte", { bedrag: "12.100", datum: "", nummer: "genegeerd" })).toEqual({
      ok: true,
      waarde: { bedrag: 12_100, nummer: null, datum: null, vervaldag: null },
    });
    expect(controleerGeldvelden("offerte", { bedrag: "" })).toEqual({ ok: false, melding: "Vul het bedrag in, inclusief btw." });
    expect(controleerGeldvelden("offerte", { bedrag: "12,5,0" }).ok).toBe(false);
    expect(controleerGeldvelden("factuur", { bedrag: "2.420,00" })).toEqual({ ok: false, melding: "Vul de factuurdatum in." });
    expect(controleerGeldvelden("factuur", { bedrag: "2.420,00", datum: "2026-10-05", vervaldag: "2026-10-01" })).toEqual({
      ok: false,
      melding: "De vervaldag ligt vóór de factuurdatum.",
    });
    expect(controleerGeldvelden("factuur", { bedrag: "2.420,00", datum: "2026-10-05", vervaldag: "2026-11-04", nummer: " F-12 " })).toEqual({
      ok: true,
      waarde: { bedrag: 2_420, nummer: "F-12", datum: "2026-10-05", vervaldag: "2026-11-04" },
    });
  });

  it("kent actief, verlopen en ingetrokken", () => {
    const nu = new Date("2026-10-02T12:00:00Z");
    expect(standVanLink({ vervalt_op: "2026-10-03T00:00:00Z", ingetrokken_op: null }, nu)).toBe("actief");
    expect(standVanLink({ vervalt_op: "2026-10-01T00:00:00Z", ingetrokken_op: null }, nu)).toBe("verlopen");
    expect(standVanLink({ vervalt_op: "2027-10-01T00:00:00Z", ingetrokken_op: "2026-10-01T00:00:00Z" }, nu)).toBe("ingetrokken");
  });

  it("houdt enkel gekende rechten over, in vaste volgorde", () => {
    expect(schoneRechten(["planning", "beheer", "plannen", "planning"])).toEqual(["plannen", "planning"]);
  });
});

describe("een link maken en nakijken", () => {
  it("bewaart enkel de hash, en het token is lang en willekeurig", async () => {
    const { token } = await maakLink(1, { partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan@voorbeeld.be" });
    expect(token).toMatch(TOKENVORM);
    const rij = db.tabellen.bouw_links[0];
    expect(rij.token_hash).toBe(hashVan(token));
    expect(JSON.stringify(db.tabellen.bouw_links)).not.toContain(token);
    const ander = await maakLink(1, { partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan@voorbeeld.be" });
    expect(ander.token).not.toBe(token);
  });

  it("laat een geldige link binnen en onthoudt wanneer", async () => {
    const { token, id } = await maakLink(1, { partijId: 1, rechten: ["plannen", "inzenden"], vervaltOp: morgen(), door: "jan" });
    expect(await leesLink(token)).toMatchObject({ linkId: id, partijnaam: "Architectenbureau Voorbeeld", rechten: ["plannen", "inzenden"] });
    expect(db.tabellen.bouw_links[0].laatst_gebruikt_op).toBeTruthy();
  });

  it("weigert een verlopen, ingetrokken, onbekend of misvormd token", async () => {
    const verlopen = await maakLink(1, { partijId: 1, rechten: ["plannen"], vervaltOp: new Date(Date.now() - 1000), door: "jan" });
    expect(await leesLink(verlopen.token)).toBeNull();

    const ingetrokken = await maakLink(1, { partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan" });
    await trekLinkIn(1, ingetrokken.id);
    expect(await leesLink(ingetrokken.token)).toBeNull();

    expect(await leesLink("A".repeat(43))).toBeNull();
    expect(await leesLink("../../etc/passwd")).toBeNull();
    expect(await leesLink("")).toBeNull();
  });
});

describe("insturen via een link", () => {
  async function link(rechten: Parameters<typeof maakLink>[1]["rechten"]) {
    return maakLink(1, { partijId: 1, rechten, vervaltOp: morgen(), door: "jan" });
  }

  it("mag enkel met het recht om in te sturen", async () => {
    const { token } = await link(["plannen"]);
    const uitkomst = await startInzendingActie(token, { naam: "v2.pdf", type: "application/pdf", grootte: 1000 });
    expect(uitkomst).toEqual({ ok: false, melding: "Deze link werkt niet (meer). Vraag een nieuwe aan." });
  });

  it("zet een PDF in de inbox en verwittigt de bot", async () => {
    await bewaarBottoken("654321:nep-token-voor-de-bouwbot", "JandraBouwBot");
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: "-100300" });
    const { token, id } = await link(["inzenden"]);

    const start = await startInzendingActie(token, { naam: "dossier v2.pdf", type: "application/pdf", grootte: pdf.length });
    if (!start.ok) throw new Error(start.melding);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === start.data.bestandId)!;
    expect(rij.opgeladen_door).toBe(`link:${id}`);
    db.objecten.set(String(rij.pad), { inhoud: pdf, type: "application/pdf" });

    expect(await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking: "Trap verplaatst" })).toEqual({ ok: true, data: null });
    expect(await lijstInzendingen(1, { status: "nieuw" })).toEqual([
      expect.objectContaining({ link_id: id, partij_id: 1, bestand_id: start.data.bestandId, opmerking: "Trap verplaatst" }),
    ]);
    expect(String(verstuurd[0].text)).toContain("Architectenbureau Voorbeeld stuurde dossier v2.pdf in");
  });

  it("aanvaardt geen bestand van iemand anders", async () => {
    const { token } = await link(["inzenden"]);
    expect(await rondInzendingAfActie(token, { bestandId: 50, opmerking: "" })).toEqual({ ok: false, melding: "Onbekend bestand." });
  });

  it("stopt na het maximum per etmaal", async () => {
    const { token, id } = await link(["inzenden"]);
    for (let i = 0; i < MAX_INZENDINGEN_PER_DAG; i++) {
      db.tabellen.bouw_bestanden.push({ id: 900 + i, huis_id: 1, pad: `plannen/${i}.pdf`, status: "wacht", opgeladen_door: `link:${id}`, created_at: new Date().toISOString() });
    }
    expect(await telUploadsVanLink(id, new Date(Date.now() - 60_000))).toBe(MAX_INZENDINGEN_PER_DAG);
    const uitkomst = await startInzendingActie(token, { naam: "nog een.pdf", type: "application/pdf", grootte: 1000 });
    expect(uitkomst.ok).toBe(false);
  });

  it("houdt een inzending vast tot ze ingelezen of genegeerd is", async () => {
    db.tabellen.bouw_bestanden.push({ id: 60, huis_id: 1, pad: "plannen/inzending.pdf", status: "klaar", opgeladen_door: "link:1" });
    db.tabellen.bouw_inzendingen.push({ id: 1, huis_id: 1, bestand_id: 60, status: "nieuw" });
    await ruimOngebruikteBestandenOp(1, [60]);
    expect(db.verwijderd).toEqual([]);
    db.tabellen.bouw_inzendingen[0].status = "genegeerd";
    await ruimOngebruikteBestandenOp(1, [60]);
    expect(db.verwijderd).toEqual(["plannen/inzending.pdf"]);
  });
});

describe("een offerte of factuur insturen via een link", () => {
  async function link(rechten: Parameters<typeof maakLink>[1]["rechten"]) {
    return maakLink(1, { partijId: 2, rechten, vervaltOp: morgen(), door: "jan" });
  }

  it("zet een offerte met haar bedrag bij Geld, en verwittigt de bot", async () => {
    await bewaarBottoken("654321:nep-token-voor-de-bouwbot", "JandraBouwBot");
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: "-100300" });
    const { token, id } = await link(["offertes"]);
    const velden = { bedrag: "12.100", datum: "2026-09-30" };

    const start = await startInzendingActie(token, { naam: "offerte.pdf", type: "application/pdf", grootte: pdf.length, soort: "offerte", velden });
    if (!start.ok) throw new Error(start.melding);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === start.data.bestandId)!;
    expect(rij).toMatchObject({ doel: "document", opgeladen_door: `link:${id}` });
    expect(String(rij.pad)).toMatch(/^documenten\//);
    db.objecten.set(String(rij.pad), { inhoud: pdf, type: "application/pdf" });

    const af = await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking: "Ruwbouw", soort: "offerte", velden });
    expect(af).toEqual({ ok: true, data: null });
    expect(await lijstInzendingen(1, { status: "nieuw", soorten: ["offerte", "factuur"] })).toEqual([
      expect.objectContaining({ soort: "offerte", partij_id: 2, bedrag: 12_100, datum: "2026-09-30", opmerking: "Ruwbouw" }),
    ]);
    // Bij Plannen komt ze niet.
    expect(await lijstInzendingen(1, { status: "nieuw", soorten: ["plan"] })).toEqual([]);
    expect(String(verstuurd[0].text)).toBe('📥 Bouwbedrijf Voorbeeld stuurde een offerte in: €\u00a012.100,00.\n\n"Ruwbouw"');
    expect(JSON.stringify(verstuurd[0].reply_markup)).toContain("/bouw/geld#inzendingen");
  });

  it("vraagt het recht voor die soort, en een geldig bedrag vóór het opladen", async () => {
    const { token: dossierlink } = await link(["inzenden"]);
    expect(
      await startInzendingActie(dossierlink, { naam: "f.pdf", type: "application/pdf", grootte: 1000, soort: "factuur", velden: { bedrag: "100", datum: "2026-10-01" } }),
    ).toEqual({ ok: false, melding: "Deze link werkt niet (meer). Vraag een nieuwe aan." });

    const { token } = await link(["facturen"]);
    const aantal = db.tabellen.bouw_bestanden.length;
    expect(await startInzendingActie(token, { naam: "f.pdf", type: "application/pdf", grootte: 1000, soort: "factuur", velden: { bedrag: "100" } })).toEqual({
      ok: false,
      melding: "Vul de factuurdatum in.",
    });
    expect(db.tabellen.bouw_bestanden.length).toBe(aantal);
    expect((await startInzendingActie(token, { naam: "f.pdf", type: "application/pdf", grootte: 1000, soort: "onzin" })).ok).toBe(false);
  });

  it("maakt van een opgeladen plan geen factuur", async () => {
    const { token, id } = await link(["inzenden", "facturen"]);
    const start = await startInzendingActie(token, { naam: "plan.pdf", type: "application/pdf", grootte: pdf.length });
    if (!start.ok) throw new Error(start.melding);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === start.data.bestandId)!;
    expect(rij).toMatchObject({ doel: "plan", opgeladen_door: `link:${id}` });
    expect(
      await rondInzendingAfActie(token, {
        bestandId: start.data.bestandId,
        opmerking: "",
        soort: "factuur",
        velden: { bedrag: "100", datum: "2026-10-01" },
      }),
    ).toEqual({ ok: false, melding: "Onbekend bestand." });
  });
});

describe("opleverpunten via de link van een aannemer", () => {
  const formulier = (velden: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(velden)) f.set(k, v);
    return f;
  };
  const punt = (id: number, partij: number, status: string) => ({
    id, titel: `Punt ${id}`, omschrijving: null, partij_id: partij, verdieping_id: null, ruimte_id: null, x_m: null, y_m: null,
    ronde: "voorlopig", status, gemeld_op: "2026-10-01T08:00:00Z", hersteld_op: null, hersteld_door: null, herstelopmerking: null,
    gecontroleerd_op: null, gecontroleerd_door: null,
  });

  it("laat de aannemer melden wat hersteld is, en enkel van zijn eigen punten", async () => {
    await bewaarBottoken("654321:nep-token-voor-de-bouwbot", "JandraBouwBot");
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: "-100300" });
    db.tabellen.bouw_opleverpunten = metHuis([punt(1, 2, "gemeld"), punt(2, 1, "open")]);
    const { token } = await maakLink(1, { partijId: 2, rechten: ["oplevering"], vervaltOp: morgen(), door: "jan" });

    await expect(meldHersteldActie(token, formulier({ punt_id: "1", opmerking: "Voeg opnieuw gezet" }))).rejects.toThrow(
      `NAAR /extern/${token}?soort=goed`,
    );
    expect(db.tabellen.bouw_opleverpunten[0]).toMatchObject({ status: "hersteld", hersteld_door: "Bouwbedrijf Voorbeeld", herstelopmerking: "Voeg opnieuw gezet" });
    expect(String(verstuurd[0].text)).toContain("Bouwbedrijf Voorbeeld meldt hersteld: Punt 1.");

    // Een punt van een andere partij: niets aan te doen.
    await expect(meldHersteldActie(token, formulier({ punt_id: "2" }))).rejects.toThrow("soort=fout");
    expect(db.tabellen.bouw_opleverpunten[1]).toMatchObject({ status: "open" });
    // Al hersteld gemeld: niet nog eens.
    await expect(meldHersteldActie(token, formulier({ punt_id: "1" }))).rejects.toThrow("soort=fout");
  });

  it("vraagt het recht om de oplevering te zien", async () => {
    db.tabellen.bouw_opleverpunten = metHuis([punt(1, 2, "gemeld")]);
    const { token } = await maakLink(1, { partijId: 2, rechten: ["plannen"], vervaltOp: morgen(), door: "jan" });
    await expect(meldHersteldActie(token, formulier({ punt_id: "1" }))).rejects.toThrow("soort=fout");
    expect(db.tabellen.bouw_opleverpunten[0]).toMatchObject({ status: "gemeld" });
  });
});

describe("een dossier openen via een link", () => {
  const vraag = (token: string, bestandId: number) =>
    openBestand(new Request(`https://jandra.voorbeeld.be/extern/${token}/bestand/${bestandId}`), {
      params: Promise.resolve({ token, bestandId: String(bestandId) }),
    });

  it("stuurt door naar een korte URL, enkel voor een bestand van een plan", async () => {
    const { token } = await maakLink(1, { partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan" });
    const antwoord = await vraag(token, 50);
    expect(antwoord.status).toBe(303);
    expect(antwoord.headers.get("location")).toBe("https://opslag.test/plannen/dossier.pdf");
    expect(antwoord.headers.get("referrer-policy")).toBe("no-referrer");
    // Een foto van een keuze hoort niet bij de plannen.
    expect((await vraag(token, 51)).status).toBe(404);
  });

  it("weigert zonder het recht om plannen te bekijken", async () => {
    const { token } = await maakLink(1, { partijId: 1, rechten: ["planning"], vervaltOp: morgen(), door: "jan" });
    expect((await vraag(token, 50)).status).toBe(404);
  });
});

describe("een link geeft maar één huis vrij", () => {
  const TWEEDE = { ...TESTHUIS, id: 2, naam: "Testhuis", soort: "bestaand", projectnaam: "Ons tweede huis", volgorde: 1 };
  const vraag = (token: string, bestandId: number) =>
    openBestand(new Request(`https://jandra.voorbeeld.be/extern/${token}/bestand/${bestandId}`), {
      params: Promise.resolve({ token, bestandId: String(bestandId) }),
    });
  const linkVan = (huisId: number, partijId: number, rechten: Parameters<typeof maakLink>[1]["rechten"]) =>
    maakLink(huisId, { partijId, rechten, vervaltOp: morgen(), door: "jan" });

  beforeEach(() => {
    db.tabellen.bouw_huizen.push({ ...TWEEDE });
    db.tabellen.bouw_partijen.push(...metHuis([{ id: 3, soort: "aannemer", naam: "Schrijnwerk Test" }], 2));
    db.tabellen.bouw_bestanden.push(
      ...metHuis(
        [{ id: 52, pad: "plannen/tweede.pdf", doel: "plan", status: "klaar", oorspronkelijke_naam: "tweede.pdf", opgeladen_door: "jan@voorbeeld.be" }],
        2,
      ),
    );
    db.tabellen.bouw_plannen.push(
      ...metHuis([{ id: 8, titel: "Grondplan", soort: "grondplan", gebouw_id: null, verdieping_id: null, bladcode: null }], 2),
    );
    db.tabellen.bouw_planversies.push({ id: 80, plan_id: 8, bestand_id: 52, label: "v1", pagina: 1 });
  });

  it("geeft het huis van de partij mee, en een gearchiveerd huis maakt de link ongeldig", async () => {
    const { token } = await linkVan(2, 3, ["plannen"]);
    expect(await leesLink(token)).toMatchObject({ partijId: 3, huisId: 2, huissoort: "bestaand", projectnaam: "Ons tweede huis" });
    db.tabellen.bouw_huizen[1].gearchiveerd_op = "2026-10-01T10:00:00Z";
    expect(await leesLink(token)).toBeNull();
    expect((await vraag(token, 52)).status).toBe(404);
  });

  it("maakt geen link voor een partij van een ander huis, en trekt er geen in", async () => {
    await expect(linkVan(1, 3, ["plannen"])).rejects.toThrow("Dat hoort niet bij dit huis");
    const { id, token } = await linkVan(2, 3, ["plannen"]);
    await expect(trekLinkIn(1, id)).rejects.toThrow("Dat hoort niet bij dit huis");
    expect(await leesLink(token)).not.toBeNull();
  });

  it("opent enkel de dossiers van het eigen huis", async () => {
    const eerste = await linkVan(1, 1, ["plannen"]);
    expect((await vraag(eerste.token, 50)).status).toBe(303);
    expect((await vraag(eerste.token, 52)).status).toBe(404);
    const tweede = await linkVan(2, 3, ["plannen"]);
    expect((await vraag(tweede.token, 52)).status).toBe(303);
    expect((await vraag(tweede.token, 50)).status).toBe(404);
  });

  it("zet een inzending bij het huis van de link, en de bot noemt dat huis", async () => {
    await bewaarBottoken("654321:nep-token-voor-de-bouwbot", "JandraBouwBot");
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: "-100300" });
    const { token } = await linkVan(2, 3, ["offertes"]);
    const velden = { bedrag: "1.250", datum: "2026-09-30" };

    const start = await startInzendingActie(token, { naam: "offerte.pdf", type: "application/pdf", grootte: pdf.length, soort: "offerte", velden });
    if (!start.ok) throw new Error(start.melding);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === start.data.bestandId)!;
    expect(rij.huis_id).toBe(2);
    db.objecten.set(String(rij.pad), { inhoud: pdf, type: "application/pdf" });

    expect(await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking: "", soort: "offerte", velden })).toEqual({
      ok: true,
      data: null,
    });
    expect(await lijstInzendingen(1)).toEqual([]);
    expect(await lijstInzendingen(2)).toEqual([expect.objectContaining({ soort: "offerte", partij_id: 3, bedrag: 1_250 })]);
    expect(String(verstuurd[0].text)).toBe("🏠 Testhuis\n📥 Schrijnwerk Test stuurde een offerte in: € 1.250,00.");
  });

  it("aanvaardt geen bestand dat de link in een ander huis zou opladen", async () => {
    const { token, id } = await linkVan(2, 3, ["inzenden"]);
    // Een bestand van deze link, maar in het eerste huis: kan niet bestaan, en telt dus niet.
    db.tabellen.bouw_bestanden.push({ id: 61, huis_id: 1, pad: "plannen/vreemd.pdf", doel: "plan", status: "wacht", opgeladen_door: `link:${id}` });
    expect(await rondInzendingAfActie(token, { bestandId: 61, opmerking: "" })).toEqual({ ok: false, melding: "Onbekend bestand." });
    expect(db.tabellen.bouw_inzendingen).toEqual([]);
  });

  it("laat een aannemer enkel punten van zijn eigen huis melden", async () => {
    const formulier = new FormData();
    formulier.set("punt_id", "5");
    // Een punt in het eerste huis dat (verkeerd) aan de partij van het tweede hangt.
    db.tabellen.bouw_opleverpunten = metHuis([
      {
        id: 5, titel: "Punt 5", omschrijving: null, partij_id: 3, verdieping_id: null, ruimte_id: null, x_m: null, y_m: null,
        ronde: "voorlopig", status: "gemeld", gemeld_op: "2026-10-01T08:00:00Z", hersteld_op: null, hersteld_door: null,
        herstelopmerking: null, gecontroleerd_op: null, gecontroleerd_door: null,
      },
    ]);
    const { token } = await linkVan(2, 3, ["oplevering"]);
    await expect(meldHersteldActie(token, formulier)).rejects.toThrow("soort=fout");
    expect(db.tabellen.bouw_opleverpunten[0]).toMatchObject({ status: "gemeld" });
  });
});
