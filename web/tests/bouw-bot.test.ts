import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { POST } from "@/app/api/bouw/telegram/route";
import { deadlinebericht, factuurbericht, herinneringen, weekbericht } from "@/lib/bouw/berichten";
import { tweeWeken } from "@/lib/bouw/planning";
import { dagelijkseRonde } from "@/lib/bouw/ronde";
import { bouwWebhookGeheim } from "@/lib/bouw/telegram";
import { webhookGeheim } from "@/lib/opvang/telegram";

const TOKEN = "654321:nep-token-voor-de-bouwbot";
const JAN = 1001;
const VREEMDE = 6666;
const GROEP = -100300;

let verstuurd: Record<string, unknown>[];
let db: ReturnType<typeof nepSupabase>;
let telegramFaalt: boolean;

beforeEach(() => {
  verstuurd = [];
  telegramFaalt = false;
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-05T07:00:00Z") }); // maandag
  vi.stubEnv("BOUW_TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("BOUW_TOEGELATEN_TELEGRAM_IDS", `${JAN}, ${GROEP}`);
  vi.stubEnv("AUTH_URL", "https://jandra.voorbeeld.be/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (telegramFaalt) return Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 });
      if (url.endsWith("/sendMessage")) verstuurd.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, result: { message_id: 1 } });
    }),
  );
  db = nepSupabase({
    bouw_instellingen: [],
    bouw_planning: [
      { id: 1, soort: "taak", titel: "Metselwerk", begindatum: "2026-09-20", einddatum: "2026-10-20", fase_id: null, partij_id: 4, status: "gepland" },
      { id: 2, soort: "taak", titel: "Riolering", begindatum: "2026-10-06", einddatum: "2026-10-09", fase_id: null, partij_id: null, status: "gepland" },
      { id: 3, soort: "mijlpaal", titel: "Vergunning", begindatum: "2026-10-05", einddatum: null, fase_id: null, partij_id: null, status: "gepland" },
    ],
    bouw_partijen: [{ id: 4, soort: "aannemer", naam: "Bouwbedrijf Voorbeeld" }],
    bouw_keuzes: [
      { id: 7, titel: "Gevelsteen", categorie: "gevel", deadline: "2026-10-12", planning_id: null, levertermijn_weken: null, eenheid: "m2", hoeveelheid: null, partij_id: null, gekozen_optie_id: null },
      { id: 8, titel: "Keuken", categorie: "keuken", deadline: "2026-12-01", planning_id: null, levertermijn_weken: null, eenheid: "totaal", hoeveelheid: null, partij_id: null, gekozen_optie_id: null },
    ],
    bouw_keuze_ruimtes: [],
    bouw_meldingen: [],
  });
  nep.client = db.client;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stuurUpdate(update: unknown, geheim = bouwWebhookGeheim(TOKEN)) {
  return POST(
    new Request("https://jandra.vercel.app/api/bouw/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": geheim },
      body: JSON.stringify(update),
    }),
  );
}

const bericht = (tekst: string, van = JAN, chat: { id: number; type: string } = { id: van, type: "private" }) => ({
  update_id: 1,
  message: { message_id: 1, text: tekst, from: { id: van }, chat },
});

describe("de webhook van de bot van Bouw", () => {
  it("weigert zonder het eigen geheim, ook met dat van Opvang_bot", async () => {
    expect((await stuurUpdate(bericht("/start"), "verkeerd")).status).toBe(401);
    expect((await stuurUpdate(bericht("/start"), webhookGeheim(TOKEN))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("antwoordt 503 zolang er geen token is", async () => {
    vi.stubEnv("BOUW_TELEGRAM_BOT_TOKEN", "");
    expect((await stuurUpdate(bericht("/start"))).status).toBe(503);
  });

  it("geeft een onbekende enkel haar id, en zwijgt verder", async () => {
    await stuurUpdate(bericht("/id", VREEMDE));
    expect(String(verstuurd[0].text)).toContain(`Jouw Telegram-id: ${VREEMDE}`);
    expect(String(verstuurd[0].text)).toContain("BOUW_TOEGELATEN_TELEGRAM_IDS");
    await stuurUpdate(bericht("/week", VREEMDE));
    expect(verstuurd).toHaveLength(1);
  });

  it("aanvaardt een groep enkel als de groep zelf toegelaten is", async () => {
    await stuurUpdate(bericht("/start", JAN, { id: -100999, type: "group" }));
    expect(String(verstuurd[0].text)).toContain("Deze bot is privé");
    await stuurUpdate(bericht("/start@JandraBouwBot", JAN, { id: GROEP, type: "supergroup" }));
    expect(String(verstuurd[1].text)).toContain("De bot van Bouw is actief");
  });

  it("onthoudt met /hier de chat voor de herinneringen", async () => {
    await stuurUpdate(bericht("/hier", JAN, { id: GROEP, type: "supergroup" }));
    expect(db.tabellen.bouw_instellingen).toEqual([expect.objectContaining({ sleutel: "telegram_chat_id", waarde: String(GROEP) })]);
  });

  it("toont de week en de deadlines, met een knop naar het scherm", async () => {
    await stuurUpdate(bericht("/week"));
    expect(verstuurd[0].text).toBe(
      [
        "Deze en volgende week (5 okt – 18 okt):",
        "• ma 5 okt · loopt nog: Metselwerk",
        "• ma 5 okt · ◆ Vergunning",
        "• di 6 okt · begint: Riolering",
        "• vr 9 okt · eindigt: Riolering",
        "• ma 12 okt · beslissen: Gevelsteen",
      ].join("\n"),
    );
    expect(verstuurd[0].reply_markup).toEqual({
      inline_keyboard: [[{ text: "Openen in Jandra", url: "https://jandra.voorbeeld.be/bouw/planning" }]],
    });

    await stuurUpdate(bericht("/deadlines"));
    expect(verstuurd[1].text).toBe("Te beslissen:\n• Gevelsteen: over 7 dagen (12 okt)\n• Keuken: over 8 weken (1 dec)");
  });

  it("toont met /facturen wat nog betaald moet worden", async () => {
    db.tabellen.bouw_facturen = [
      { id: 1, post_id: null, partij_id: 4, nummer: "F-12", omschrijving: null, bedrag: 12_100, factuurdatum: "2026-09-01", vervaldag: "2026-10-01", betaald_op: null, bestand_id: null, vennootschap_id: null, opmerking: null },
      { id: 2, post_id: null, partij_id: null, nummer: null, omschrijving: null, bedrag: 450, factuurdatum: "2026-10-01", vervaldag: "2026-10-08", betaald_op: null, bestand_id: null, vennootschap_id: null, opmerking: null },
      { id: 3, post_id: null, partij_id: null, nummer: "F-9", omschrijving: null, bedrag: 900, factuurdatum: "2026-08-01", vervaldag: null, betaald_op: "2026-08-20", bestand_id: null, vennootschap_id: null, opmerking: null },
    ];
    await stuurUpdate(bericht("/facturen"));
    expect(verstuurd[0].text).toBe(
      [
        "Te betalen:",
        "• Factuur F-12 van Bouwbedrijf Voorbeeld (€\u00a012.100,00): ⚠️ 4 dagen te laat (1 okt)",
        "• Een factuur (€\u00a0450,00): over 3 dagen (8 okt)",
      ].join("\n"),
    );
    expect(verstuurd[0].reply_markup).toEqual({
      inline_keyboard: [[{ text: "Openen in Jandra", url: "https://jandra.voorbeeld.be/bouw/geld/facturen" }]],
    });

    await stuurUpdate(bericht("/taken"));
    expect(String(verstuurd[1].text)).toContain("Factuur F-12 van Bouwbedrijf Voorbeeld (€\u00a012.100,00): 4 dagen te laat.");
  });

  it("antwoordt 200 als Telegram faalt, zonder het token in de logs", async () => {
    telegramFaalt = true;
    const fout = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await stuurUpdate(bericht("/start"))).status).toBe(200);
    expect(fout.mock.calls.flat().join(" ")).not.toContain(TOKEN);
    fout.mockRestore();
  });
});

describe("de berichten", () => {
  it("zegt het als er niets gepland is", () => {
    expect(weekbericht({ van: "2026-10-05", tot: "2026-10-18", regels: [] })).toBe("Deze en volgende week (5 okt – 18 okt): niets gepland.");
    expect(deadlinebericht([], "2026-10-05")).toBe("Geen keuzes met een deadline die nog open staan.");
    expect(factuurbericht([], "2026-10-05")).toBe("Geen facturen die nog betaald moeten worden.");
  });

  it("herinnert op 14, 7, 3 en 1 dag, op de dag zelf en de dag erna", () => {
    const deadline = (dagen: number) => ({ keuzeId: 7, titel: "Gevelsteen", datum: "2026-10-12", dagen });
    const geen = { van: "2026-09-28", tot: "2026-10-11", regels: [] };
    const tekst = (dagen: number) => herinneringen([deadline(dagen)], [], geen, "2026-10-05").map((h) => h.tekst);
    expect(tekst(7)).toEqual(["⏰ Gevelsteen: beslissen over 7 dagen (tegen 12 okt)."]);
    expect(tekst(5)).toEqual([]);
    expect(tekst(0)).toEqual(["⏰ Gevelsteen: vandaag beslissen."]);
    expect(tekst(-1)).toEqual(["⚠️ De deadline voor Gevelsteen was gisteren (12 okt). Nog niet beslist."]);
    expect(tekst(-2)).toEqual([]);
    expect(herinneringen([deadline(3)], [], geen, "2026-10-05")[0]).toMatchObject({
      sleutel: "deadline:7:2026-10-12:3",
      pad: "/bouw/keuzes/7",
    });
  });

  it("meldt wat morgen begint en een mijlpaal van vandaag, en op maandag de week", () => {
    const planning = [
      { id: 2, soort: "taak" as const, titel: "Riolering", begindatum: "2026-10-06", status: "gepland" as const, partij: "Grondwerken Test" },
      { id: 3, soort: "mijlpaal" as const, titel: "Vergunning", begindatum: "2026-10-05", status: "gepland" as const, partij: null },
      { id: 4, soort: "taak" as const, titel: "Al klaar", begindatum: "2026-10-06", status: "klaar" as const, partij: null },
    ];
    const week = tweeWeken(
      planning.map((p) => ({ ...p, einddatum: null })),
      [],
      "2026-10-05",
    );
    expect(herinneringen([], planning, week, "2026-10-05").map((h) => h.sleutel)).toEqual([
      "week:2026-10-05",
      "begint:2:2026-10-06",
      "mijlpaal:3:2026-10-05",
    ]);
    // Op dinsdag geen week meer.
    expect(herinneringen([], planning, tweeWeken([], [], "2026-10-06"), "2026-10-06").map((h) => h.sleutel)).toEqual([]);
  });
});

describe("de dagelijkse ronde", () => {
  it("doet niets zonder gekozen chat", async () => {
    expect(await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).toMatchObject({ verstuurd: 0 });
    expect(verstuurd).toEqual([]);
  });

  it("stuurt elke melding maar één keer, ook als de ronde twee keer loopt", async () => {
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: String(GROEP) });
    const eerste = await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be");
    // De week (maandag), de deadline over 7 dagen, wat morgen begint, en de mijlpaal van vandaag.
    expect(eerste).toEqual({ verstuurd: 4, alGemeld: 0 });
    expect(verstuurd.map((b) => b.chat_id)).toEqual([GROEP, GROEP, GROEP, GROEP]);
    expect(await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).toEqual({ verstuurd: 0, alGemeld: 4 });
  });

  it("herinnert ook aan een factuur, drie dagen voor de vervaldag", async () => {
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: String(GROEP) });
    db.tabellen.bouw_facturen = [
      { id: 5, post_id: null, partij_id: 4, nummer: "F-12", omschrijving: null, bedrag: 2_420, factuurdatum: "2026-09-08", vervaldag: "2026-10-08", betaald_op: null, bestand_id: null, vennootschap_id: null, opmerking: null },
    ];
    expect(await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).toEqual({ verstuurd: 5, alGemeld: 0 });
    const factuur = verstuurd.at(-1)!;
    expect(factuur.text).toBe("💶 Factuur F-12 van Bouwbedrijf Voorbeeld (€\u00a02.420,00): betalen over 3 dagen (tegen 8 okt).");
    expect(factuur.reply_markup).toEqual({
      inline_keyboard: [[{ text: "Openen in Jandra", url: "https://jandra.voorbeeld.be/bouw/geld/facturen" }]],
    });
    expect(db.tabellen.bouw_meldingen.map((m) => m.sleutel)).toContain("factuur:5:2026-10-08:3");
  });

  it("herinnert aan een actiepunt de dag voor de deadline", async () => {
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: String(GROEP) });
    db.tabellen.bouw_actiepunten = [
      { id: 9, titel: "Stelling afbreken", omschrijving: null, partij_id: 4, deadline: "2026-10-06", status: "open", klaar_op: null },
      { id: 10, titel: "Al gedaan", omschrijving: null, partij_id: null, deadline: "2026-10-06", status: "klaar", klaar_op: "2026-10-04T10:00:00Z" },
    ];
    expect(await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).toEqual({ verstuurd: 5, alGemeld: 0 });
    const herinnering = verstuurd.at(-1)!;
    expect(herinnering.text).toBe("📌 Actiepunt Stelling afbreken (Bouwbedrijf Voorbeeld): klaar tegen morgen.");
    expect(JSON.stringify(herinnering.reply_markup)).toContain("/bouw/werf/actiepunten");
  });

  it("probeert het de volgende keer opnieuw als Telegram faalde", async () => {
    db.tabellen.bouw_instellingen.push({ sleutel: "telegram_chat_id", waarde: String(GROEP) });
    telegramFaalt = true;
    await expect(dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).rejects.toThrow("chat not found");
    expect(db.tabellen.bouw_meldingen).toEqual([]);
    telegramFaalt = false;
    expect((await dagelijkseRonde(TOKEN, new Date(), "https://jandra.voorbeeld.be")).verstuurd).toBe(4);
  });
});
