import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { GET as cronBouw } from "@/app/api/cron/bouw/route";
import { HULP } from "@/lib/bouw/berichten";
import { ontsleutel, versleutel } from "@/lib/bouw/geheim";
import { bouwWebhookGeheim } from "@/lib/bouw/telegram";
import {
  bewaarBottoken,
  koppelBot,
  laadKoppeling,
  laatToe,
  leesBottoken,
  leesToegang,
  noteerAanvragen,
  ontkoppelBot,
  trekIn,
  vergeetAanvraag,
  zetHerinneringenChat,
} from "@/lib/bouw/telegram-koppeling";
import {
  MAX_AANVRAGEN,
  chatsVan,
  leesAanvragen,
  leesChats,
  leesTelegramId,
  metChat,
  schoonToken,
  telegramCommandos,
  voegAanvraagToe,
} from "@/lib/bouw/telegramregels";

// Hoogstens zeven cijfers voor de dubbele punt: de geheimenzoeker van CI
// zoekt naar echte tokens, met acht tot tien.
const TOKEN = "7654321:nep_token_voor_de_bot_van_bouw_ABCDEF";
const OPVANG = "1234567:nep_token_van_de_bot_van_opvang_XYZ";

type Aanroep = { methode: string; body: Record<string, unknown> };
let aanroepen: Aanroep[];
let antwoorden: Record<string, Response | (() => Response)>;
let db: ReturnType<typeof nepSupabase>;

beforeEach(() => {
  aanroepen = [];
  antwoorden = {};
  vi.stubEnv("AUTH_SECRET", "telegram-testgeheim-0123456789abcdef");
  vi.stubEnv("AUTH_URL", "https://jandra.voorbeeld.be/");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", OPVANG);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const methode = url.split("/").at(-1) ?? "";
      aanroepen.push({ methode, body: JSON.parse(String(init?.body ?? "{}")) });
      const antwoord = antwoorden[methode];
      if (antwoord) return typeof antwoord === "function" ? antwoord() : antwoord;
      if (methode === "getMe") return Response.json({ ok: true, result: { username: "JandraBouwBot" } });
      return Response.json({ ok: true, result: true });
    }),
  );
  db = nepSupabase({ bouw_instellingen: [] });
  nep.client = db.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const instelling = (sleutel: string) => db.tabellen.bouw_instellingen.find((rij) => rij.sleutel === sleutel)?.waarde;

describe("een geheim versleuteld bewaren", () => {
  it("leest terug wat het versleutelde, telkens anders versleuteld", () => {
    const eerste = versleutel(TOKEN, "bouw-bot:token");
    const tweede = versleutel(TOKEN, "bouw-bot:token");
    expect(eerste).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(eerste).not.toBe(tweede);
    expect(eerste).not.toContain("nep_token");
    expect(ontsleutel(eerste, "bouw-bot:token")).toBe(TOKEN);
    expect(ontsleutel(tweede, "bouw-bot:token")).toBe(TOKEN);
  });

  it("geeft niets terug als er geknoeid is, of met een andere sleutel of een ander label", () => {
    const waarde = versleutel(TOKEN, "bouw-bot:token");
    const [versie, iv, tag, inhoud] = waarde.split(":");
    const anders = (inhoud[0] === "A" ? "B" : "A") + inhoud.slice(1);
    expect(ontsleutel([versie, iv, tag, anders].join(":"), "bouw-bot:token")).toBeNull();
    expect(ontsleutel([versie, iv, tag.slice(0, 8), inhoud].join(":"), "bouw-bot:token")).toBeNull();
    expect(ontsleutel(waarde, "ander:label")).toBeNull();
    expect(ontsleutel("geen geldige vorm", "bouw-bot:token")).toBeNull();

    vi.stubEnv("AUTH_SECRET", "een-andere-geheime-sleutel-van-de-app");
    expect(ontsleutel(waarde, "bouw-bot:token")).toBeNull();
    vi.stubEnv("AUTH_SECRET", "");
    expect(ontsleutel(waarde, "bouw-bot:token")).toBeNull();
    expect(() => versleutel(TOKEN, "bouw-bot:token")).toThrow("AUTH_SECRET");
  });
});

describe("de regels van de koppeling", () => {
  it("herkent een token van BotFather, ook met spaties of bot ervoor", () => {
    expect(schoonToken(` ${TOKEN}\n`)).toBe(TOKEN);
    expect(schoonToken(`bot${TOKEN}`)).toBe(TOKEN);
    expect(schoonToken("7654321:kort")).toBeNull();
    expect(schoonToken("geen token")).toBeNull();
    expect(schoonToken("7654321;nep_token_voor_de_bot_van_bouw_ABCDEF")).toBeNull();
  });

  it("leest enkel wat klopt uit de lijsten", () => {
    expect(leesChats(null)).toEqual([]);
    expect(leesChats("kapot")).toEqual([]);
    expect(
      leesChats(JSON.stringify([{ id: 5, naam: "Jan", soort: "persoon", extra: 1 }, { id: "6", naam: "x", soort: "persoon" }, { id: 7, naam: "y", soort: "kanaal" }, { id: 0, naam: "z", soort: "groep" }])),
    ).toEqual([{ id: 5, naam: "Jan", soort: "persoon" }]);
    expect(leesAanvragen(JSON.stringify([{ id: 5, naam: "Jan", soort: "persoon" }]))).toEqual([]);
  });

  it("houdt hoogstens tien aanvragen bij, zonder dubbels, en vergeet ze na dertig dagen", () => {
    const nu = new Date("2026-10-05T07:00:00Z");
    let aanvragen = voegAanvraagToe([], { id: 1, naam: "Een", soort: "persoon" }, new Date("2026-09-01T07:00:00Z"));
    aanvragen = voegAanvraagToe(aanvragen, { id: 2, naam: "Twee", soort: "persoon" }, new Date("2026-10-01T07:00:00Z"));
    aanvragen = voegAanvraagToe(aanvragen, { id: 3, naam: "Drie", soort: "groep" }, nu);
    // De eerste is ouder dan dertig dagen.
    expect(aanvragen.map((aanvraag) => aanvraag.id)).toEqual([3, 2]);
    // Wie opnieuw vraagt, schuift naar voren in plaats van twee keer te staan.
    aanvragen = voegAanvraagToe(aanvragen, { id: 2, naam: "Twee", soort: "persoon" }, nu);
    expect(aanvragen.map((aanvraag) => aanvraag.id)).toEqual([2, 3]);
    for (let id = 10; id < 30; id++) aanvragen = voegAanvraagToe(aanvragen, { id, naam: `Nr ${id}`, soort: "persoon" }, nu);
    expect(aanvragen).toHaveLength(MAX_AANVRAGEN);
    expect(aanvragen[0].id).toBe(29);
  });

  it("past de naam aan van wie al toegelaten is", () => {
    const lijst = metChat([{ id: 5, naam: "Jan", soort: "persoon" }], { id: 5, naam: "Jan F", soort: "persoon" });
    expect(lijst).toEqual([{ id: 5, naam: "Jan F", soort: "persoon" }]);
    expect(metChat(lijst, { id: -100, naam: "Bouw", soort: "groep" })).toHaveLength(2);
  });

  it("haalt de afzender en de groep uit een bericht", () => {
    expect(chatsVan({ message_id: 1, from: { id: 5, first_name: "Jan", last_name: "F" }, chat: { id: 5, type: "private" } })).toEqual([
      { id: 5, naam: "Jan F", soort: "persoon" },
    ]);
    expect(
      chatsVan({ message_id: 1, from: { id: 6, username: "sandra" }, chat: { id: -100, type: "supergroup", title: " Ons huis " } }),
    ).toEqual([
      { id: 6, naam: "@sandra", soort: "persoon" },
      { id: -100, naam: "Ons huis", soort: "groep" },
    ]);
  });

  it("leest een id dat iemand met de hand invult", () => {
    expect(leesTelegramId(" 1001 ")).toBe(1001);
    expect(leesTelegramId("-100123456789")).toBe(-100123456789);
    expect(leesTelegramId("0")).toBeNull();
    expect(leesTelegramId("12a")).toBeNull();
    expect(leesTelegramId("")).toBeNull();
  });

  it("geeft Telegram en /help dezelfde commando's", () => {
    expect(telegramCommandos()[0]).toEqual({ command: "week", description: "Wat er deze en volgende week gebeurt" });
    expect(HULP.split("\n")).toHaveLength(telegramCommandos().length);
    expect(HULP).toContain("/hier: stuur mijn herinneringen voortaan naar deze chat");
  });
});

describe("de bot koppelen", () => {
  it("kijkt het token na, zet de webhook en de commando's, en bewaart het token versleuteld", async () => {
    expect(await koppelBot(` ${TOKEN} `)).toEqual({ ok: true, bot: "JandraBouwBot" });
    expect(aanroepen.map((aanroep) => aanroep.methode)).toEqual(["getMe", "setWebhook", "setMyCommands"]);
    expect(aanroepen[1].body).toEqual({
      url: "https://jandra.voorbeeld.be/api/bouw/telegram",
      secret_token: bouwWebhookGeheim(TOKEN),
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    expect(aanroepen[2].body.commands).toEqual(telegramCommandos());

    expect(instelling("telegram_token")).toMatch(/^v1:/);
    expect(JSON.stringify(db.tabellen.bouw_instellingen)).not.toContain("nep_token");
    expect(instelling("telegram_bot")).toBe("JandraBouwBot");
    expect(await leesBottoken()).toBe(TOKEN);
  });

  it("weigert zonder https-adres, op een testversie, met het token van Opvang en met een fout token", async () => {
    vi.stubEnv("AUTH_URL", "");
    expect(await koppelBot(TOKEN)).toMatchObject({ ok: false, melding: expect.stringContaining("AUTH_URL") });
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    expect(await koppelBot(TOKEN)).toMatchObject({ ok: false });
    vi.stubEnv("AUTH_URL", "https://jandra.voorbeeld.be");

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await koppelBot(TOKEN)).toMatchObject({ ok: false, melding: expect.stringContaining("testversie") });
    vi.stubEnv("VERCEL_ENV", "production");

    expect(await koppelBot(OPVANG)).toMatchObject({ ok: false, melding: expect.stringContaining("Opvang") });
    expect(await koppelBot("123:abc")).toMatchObject({ ok: false, melding: expect.stringContaining("BotFather") });
    expect(aanroepen).toEqual([]);
    expect(db.tabellen.bouw_instellingen).toEqual([]);
  });

  it("zegt het als Telegram het token niet kent, zonder het token te tonen", async () => {
    antwoorden.getMe = Response.json({ ok: false, error_code: 401, description: "Unauthorized" }, { status: 401 });
    const uitkomst = await koppelBot(TOKEN);
    expect(uitkomst).toEqual({ ok: false, melding: expect.stringContaining("Telegram kent dit token niet") });
    expect(JSON.stringify(uitkomst)).not.toContain(TOKEN);
    expect(db.tabellen.bouw_instellingen).toEqual([]);
  });

  it("gebruikt het token niet op een testversie, ook al staat het in de databank", async () => {
    await bewaarBottoken(TOKEN, "JandraBouwBot");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await leesBottoken()).toBeNull();
    vi.stubEnv("VERCEL_ENV", "");
    expect(await leesBottoken()).toBe(TOKEN);
  });

  it("toont wat Telegram over de webhook zegt", async () => {
    expect(await laadKoppeling()).toMatchObject({ token: "geen" });
    await bewaarBottoken(TOKEN, "JandraBouwBot");
    antwoorden.getWebhookInfo = () =>
      Response.json({
        ok: true,
        result: { url: "https://jandra.voorbeeld.be/api/bouw/telegram", pending_update_count: 2, last_error_date: 1_790_000_000, last_error_message: "Connection timed out" },
      });
    expect(await laadKoppeling()).toEqual({
      token: "leesbaar",
      bot: "JandraBouwBot",
      webhook: { url: "https://jandra.voorbeeld.be/api/bouw/telegram", juist: true, wachtend: 2, laatsteFout: "Connection timed out", laatsteFoutOp: new Date(1_790_000_000_000).toISOString() },
      fout: null,
    });

    antwoorden.getWebhookInfo = () => Response.json({ ok: true, result: { url: "https://elders.voorbeeld.be/hook", pending_update_count: 0 } });
    expect((await laadKoppeling()).webhook).toMatchObject({ juist: false });

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error(`fetch failed for https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
    }));
    const stand = await laadKoppeling();
    expect(stand.fout).toContain("geen verbinding");
    expect(JSON.stringify(stand)).not.toContain(TOKEN);
  });

  it("ziet een token dat niet meer te lezen is", async () => {
    await bewaarBottoken(TOKEN, "JandraBouwBot");
    vi.stubEnv("AUTH_SECRET", "intussen-een-andere-geheime-sleutel");
    expect(await laadKoppeling()).toMatchObject({ token: "onleesbaar", bot: "JandraBouwBot" });
    expect(await leesBottoken()).toBeNull();
  });

  it("ontkoppelt: de webhook weg, het token weg, wie toegelaten is blijft", async () => {
    await bewaarBottoken(TOKEN, "JandraBouwBot");
    await laatToe({ id: 5, naam: "Jan", soort: "persoon" });
    await ontkoppelBot();
    expect(aanroepen.map((aanroep) => aanroep.methode)).toEqual(["deleteWebhook"]);
    expect(instelling("telegram_token")).toBeUndefined();
    expect(instelling("telegram_bot")).toBeUndefined();
    expect((await leesToegang()).toegelaten).toEqual([{ id: 5, naam: "Jan", soort: "persoon" }]);
  });
});

describe("wie de bot mag gebruiken", () => {
  it("laat toe wie vroeg, en de vraag verdwijnt", async () => {
    await noteerAanvragen([
      { id: 6, naam: "Sandra", soort: "persoon" },
      { id: -100, naam: "Ons huis", soort: "groep" },
    ]);
    expect((await leesToegang()).aanvragen.map((aanvraag) => aanvraag.id)).toEqual([-100, 6]);

    await laatToe({ id: -100, naam: "Ons huis", soort: "groep" });
    await zetHerinneringenChat(-100);
    const toegang = await leesToegang();
    expect(toegang.toegelaten).toEqual([{ id: -100, naam: "Ons huis", soort: "groep" }]);
    expect(toegang.aanvragen.map((aanvraag) => aanvraag.id)).toEqual([6]);
    expect(toegang.chat).toBe(-100);

    await vergeetAanvraag(6);
    expect((await leesToegang()).aanvragen).toEqual([]);
  });

  it("stuurt geen herinneringen meer naar een chat die niet meer mag", async () => {
    await laatToe({ id: -100, naam: "Ons huis", soort: "groep" });
    await laatToe({ id: 5, naam: "Jan", soort: "persoon" });
    await zetHerinneringenChat(-100);
    await trekIn(5);
    expect((await leesToegang()).chat).toBe(-100);
    await trekIn(-100);
    expect(await leesToegang()).toMatchObject({ toegelaten: [], chat: null });
  });
});

describe("de dagelijkse ronde zonder bot", () => {
  it("doet niets en meldt waarom, in plaats van elke ochtend te falen", async () => {
    vi.stubEnv("CRON_SECRET", "cron-testgeheim");
    const antwoord = await cronBouw(
      new Request("https://jandra.voorbeeld.be/api/cron/bouw", { headers: { authorization: "Bearer cron-testgeheim" } }),
    );
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ ok: true, verstuurd: 0, alGemeld: 0, reden: "Nog geen bot gekoppeld: zie Vastgoed → Telegram." });
  });
});
