import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/telegram/route";
import { heeftToegang, toegelatenIds } from "@/lib/opvang/toegang";
import { commando, verbergToken, webhookGeheim } from "@/lib/opvang/telegram";

const TOKEN = "123456:nep-token-voor-de-test";
const JAN = 1001;
const VREEMDE = 6666;
const GROEP = -100200;

let verstuurd: Record<string, unknown>[];

beforeEach(() => {
  verstuurd = [];
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("TOEGELATEN_TELEGRAM_IDS", String(JAN));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/sendMessage")) verstuurd.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, result: true });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stuurUpdate(update: unknown, geheim = webhookGeheim(TOKEN)) {
  return POST(
    new Request("https://app.voorbeeld.be/api/telegram", {
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

describe("webhook van de opvang-bot", () => {
  it("antwoordt op /start van een toegelaten gebruiker", async () => {
    const antwoord = await stuurUpdate(bericht("/start"));
    expect(antwoord.status).toBe(200);
    expect(verstuurd).toEqual([{ chat_id: JAN, text: "Opvang_bot is actief" }]);
  });

  it("weigert een aanroep zonder het juiste geheim, en doet dan niets", async () => {
    const antwoord = await stuurUpdate(bericht("/start"), "verkeerd");
    expect(antwoord.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("geeft een onbekende op /start enkel haar id terug", async () => {
    await stuurUpdate(bericht("/start", VREEMDE));
    expect(verstuurd).toHaveLength(1);
    expect(verstuurd[0].chat_id).toBe(VREEMDE);
    expect(verstuurd[0].text).toContain(`Jouw Telegram-id: ${VREEMDE}`);
    expect(verstuurd[0].text).not.toContain("actief");
  });

  it("zwijgt tegen een onbekende die iets anders stuurt", async () => {
    await stuurUpdate(bericht("/definitief", VREEMDE));
    await stuurUpdate(bericht("hallo", VREEMDE));
    expect(verstuurd).toEqual([]);
  });

  it("laat niemand toe zolang er geen id's ingesteld zijn", async () => {
    vi.stubEnv("TOEGELATEN_TELEGRAM_IDS", "");
    await stuurUpdate(bericht("/start"));
    expect(verstuurd[0].text).toContain("privé");
  });

  it("aanvaardt een groep enkel als de groep zelf toegelaten is", async () => {
    const inGroep = bericht("/start@Opvang_bot", JAN, { id: GROEP, type: "supergroup" });
    await stuurUpdate(inGroep);
    expect(verstuurd[0].text).toContain(`Id van deze groep: ${GROEP}`);

    verstuurd = [];
    vi.stubEnv("TOEGELATEN_TELEGRAM_IDS", `${JAN},${GROEP}`);
    await stuurUpdate(inGroep);
    expect(verstuurd).toEqual([{ chat_id: GROEP, text: "Opvang_bot is actief" }]);
  });

  it("antwoordt ook 200 als Telegram faalt, en lekt het token niet in de logs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, description: `fout bij bot${TOKEN}` })));
    const fout = vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await stuurUpdate(bericht("/start"));
    expect(antwoord.status).toBe(200);
    expect(fout).toHaveBeenCalled();
    expect(String(fout.mock.calls[0])).not.toContain(TOKEN);
  });

  it("antwoordt 503 zolang er geen token ingesteld is", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await stuurUpdate(bericht("/start"))).status).toBe(503);
  });
});

describe("hulpfuncties van de opvang-bot", () => {
  it("herkent commando's, ook met botnaam en argumenten", () => {
    expect(commando("/start")).toBe("start");
    expect(commando("/Start@Opvang_bot")).toBe("start");
    expect(commando("/id nu")).toBe("id");
    expect(commando("start")).toBeNull();
    expect(commando(undefined)).toBeNull();
  });

  it("leest id's met komma's, spaties en negatieve groeps-id's", () => {
    expect([...toegelatenIds(" 1001, -100200 ;x")]).toEqual([1001, -100200]);
    expect(toegelatenIds(undefined).size).toBe(0);
  });

  it("weigert een bericht zonder afzender", () => {
    expect(heeftToegang({ message_id: 1, chat: { id: 1, type: "private" } }, new Set([1]))).toBe(false);
  });

  it("vervangt het token in foutmeldingen", () => {
    expect(verbergToken(`https://api.telegram.org/bot${TOKEN}/x`, TOKEN)).toBe("https://api.telegram.org/bot<token>/x");
  });

  it("maakt een geheim dat Telegram aanvaardt", () => {
    expect(webhookGeheim(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
  });
});
