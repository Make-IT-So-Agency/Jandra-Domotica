import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { GET as openBestand } from "@/app/extern/[token]/bestand/[bestandId]/route";
import { rondInzendingAfActie, startInzendingActie } from "@/app/extern/[token]/acties";
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

let db: ReturnType<typeof nepSupabase>;
let verstuurd: Record<string, unknown>[];
const pdf = new TextEncoder().encode("%PDF-1.7\nnep");

beforeEach(() => {
  verstuurd = [];
  db = nepSupabase({
    bouw_partijen: [
      { id: 1, soort: "architect", naam: "Architectenbureau Voorbeeld" },
      { id: 2, soort: "aannemer", naam: "Bouwbedrijf Voorbeeld" },
    ],
    bouw_links: [],
    bouw_bestanden: [
      { id: 50, pad: "plannen/dossier.pdf", doel: "plan", status: "klaar", oorspronkelijke_naam: "dossier.pdf", opgeladen_door: "jan@voorbeeld.be" },
      { id: 51, pad: "fotos/foto.jpg", doel: "foto", status: "klaar", oorspronkelijke_naam: "IMG.jpg", opgeladen_door: "jan@voorbeeld.be" },
    ],
    bouw_plannen: [{ id: 7, titel: "Grondplan", soort: "grondplan", gebouw_id: null, verdieping_id: null, bladcode: null }],
    bouw_planversies: [{ id: 70, plan_id: 7, bestand_id: 50, label: "v1", pagina: 1 }],
    bouw_inzendingen: [],
    bouw_instellingen: [],
  });
  nep.client = db.client;
  vi.stubEnv("AUTH_URL", "https://jandra.voorbeeld.be");
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
    const { token } = await maakLink({ partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan@voorbeeld.be" });
    expect(token).toMatch(TOKENVORM);
    const rij = db.tabellen.bouw_links[0];
    expect(rij.token_hash).toBe(hashVan(token));
    expect(JSON.stringify(db.tabellen.bouw_links)).not.toContain(token);
    const ander = await maakLink({ partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan@voorbeeld.be" });
    expect(ander.token).not.toBe(token);
  });

  it("laat een geldige link binnen en onthoudt wanneer", async () => {
    const { token, id } = await maakLink({ partijId: 1, rechten: ["plannen", "inzenden"], vervaltOp: morgen(), door: "jan" });
    expect(await leesLink(token)).toMatchObject({ linkId: id, partijnaam: "Architectenbureau Voorbeeld", rechten: ["plannen", "inzenden"] });
    expect(db.tabellen.bouw_links[0].laatst_gebruikt_op).toBeTruthy();
  });

  it("weigert een verlopen, ingetrokken, onbekend of misvormd token", async () => {
    const verlopen = await maakLink({ partijId: 1, rechten: ["plannen"], vervaltOp: new Date(Date.now() - 1000), door: "jan" });
    expect(await leesLink(verlopen.token)).toBeNull();

    const ingetrokken = await maakLink({ partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan" });
    await trekLinkIn(ingetrokken.id);
    expect(await leesLink(ingetrokken.token)).toBeNull();

    expect(await leesLink("A".repeat(43))).toBeNull();
    expect(await leesLink("../../etc/passwd")).toBeNull();
    expect(await leesLink("")).toBeNull();
  });
});

describe("insturen via een link", () => {
  async function link(rechten: Parameters<typeof maakLink>[0]["rechten"]) {
    return maakLink({ partijId: 1, rechten, vervaltOp: morgen(), door: "jan" });
  }

  it("mag enkel met het recht om in te sturen", async () => {
    const { token } = await link(["plannen"]);
    const uitkomst = await startInzendingActie(token, { naam: "v2.pdf", type: "application/pdf", grootte: 1000 });
    expect(uitkomst).toEqual({ ok: false, melding: "Deze link werkt niet (meer). Vraag een nieuwe aan." });
  });

  it("zet een PDF in de inbox en verwittigt de bot", async () => {
    vi.stubEnv("BOUW_TELEGRAM_BOT_TOKEN", "654321:nep-token-voor-de-bouwbot");
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: "-100300" });
    const { token, id } = await link(["inzenden"]);

    const start = await startInzendingActie(token, { naam: "dossier v2.pdf", type: "application/pdf", grootte: pdf.length });
    if (!start.ok) throw new Error(start.melding);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === start.data.bestandId)!;
    expect(rij.opgeladen_door).toBe(`link:${id}`);
    db.objecten.set(String(rij.pad), { inhoud: pdf, type: "application/pdf" });

    expect(await rondInzendingAfActie(token, { bestandId: start.data.bestandId, opmerking: "Trap verplaatst" })).toEqual({ ok: true, data: null });
    expect(await lijstInzendingen({ status: "nieuw" })).toEqual([
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
      db.tabellen.bouw_bestanden.push({ id: 900 + i, pad: `plannen/${i}.pdf`, status: "wacht", opgeladen_door: `link:${id}`, created_at: new Date().toISOString() });
    }
    expect(await telUploadsVanLink(id, new Date(Date.now() - 60_000))).toBe(MAX_INZENDINGEN_PER_DAG);
    const uitkomst = await startInzendingActie(token, { naam: "nog een.pdf", type: "application/pdf", grootte: 1000 });
    expect(uitkomst.ok).toBe(false);
  });

  it("houdt een inzending vast tot ze ingelezen of genegeerd is", async () => {
    db.tabellen.bouw_bestanden.push({ id: 60, pad: "plannen/inzending.pdf", status: "klaar", opgeladen_door: "link:1" });
    db.tabellen.bouw_inzendingen.push({ id: 1, bestand_id: 60, status: "nieuw" });
    await ruimOngebruikteBestandenOp([60]);
    expect(db.verwijderd).toEqual([]);
    db.tabellen.bouw_inzendingen[0].status = "genegeerd";
    await ruimOngebruikteBestandenOp([60]);
    expect(db.verwijderd).toEqual(["plannen/inzending.pdf"]);
  });
});

describe("een offerte of factuur insturen via een link", () => {
  async function link(rechten: Parameters<typeof maakLink>[0]["rechten"]) {
    return maakLink({ partijId: 2, rechten, vervaltOp: morgen(), door: "jan" });
  }

  it("zet een offerte met haar bedrag bij Geld, en verwittigt de bot", async () => {
    vi.stubEnv("BOUW_TELEGRAM_BOT_TOKEN", "654321:nep-token-voor-de-bouwbot");
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
    expect(await lijstInzendingen({ status: "nieuw", soorten: ["offerte", "factuur"] })).toEqual([
      expect.objectContaining({ soort: "offerte", partij_id: 2, bedrag: 12_100, datum: "2026-09-30", opmerking: "Ruwbouw" }),
    ]);
    // Bij Plannen komt ze niet.
    expect(await lijstInzendingen({ status: "nieuw", soorten: ["plan"] })).toEqual([]);
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

describe("een dossier openen via een link", () => {
  const vraag = (token: string, bestandId: number) =>
    openBestand(new Request(`https://jandra.voorbeeld.be/extern/${token}/bestand/${bestandId}`), {
      params: Promise.resolve({ token, bestandId: String(bestandId) }),
    });

  it("stuurt door naar een korte URL, enkel voor een bestand van een plan", async () => {
    const { token } = await maakLink({ partijId: 1, rechten: ["plannen"], vervaltOp: morgen(), door: "jan" });
    const antwoord = await vraag(token, 50);
    expect(antwoord.status).toBe(303);
    expect(antwoord.headers.get("location")).toBe("https://opslag.test/plannen/dossier.pdf");
    expect(antwoord.headers.get("referrer-policy")).toBe("no-referrer");
    // Een foto van een keuze hoort niet bij de plannen.
    expect((await vraag(token, 51)).status).toBe(404);
  });

  it("weigert zonder het recht om plannen te bekijken", async () => {
    const { token } = await maakLink({ partijId: 1, rechten: ["planning"], vervaltOp: morgen(), door: "jan" });
    expect((await vraag(token, 50)).status).toBe(404);
  });
});
