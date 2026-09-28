import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { commando, verbergToken } from "../src/telegram";
import { heeftToegang, toegelatenIds } from "../src/toegang";
import { webhookGeheim } from "../src/webhook-geheim";

const TOKEN = "123456:nep-token-voor-de-test";
const JAN = 1001;
const VREEMDE = 6666;
const GROEP = -100200;

type Aanroep = { methode: string; body: Record<string, unknown> };
let aanroepen: Aanroep[];

beforeEach(() => {
  aanroepen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const methode = url.split("/").pop()!;
      aanroepen.push({ methode, body: JSON.parse(String(init.body)) });
      const result =
        methode === "getWebhookInfo"
          ? { url: "https://opvang-bot.voorbeeld.workers.dev/telegram", pending_update_count: 0 }
          : methode === "getMe"
            ? { username: "Opvang_bot" }
            : true;
      return Response.json({ ok: true, result });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const env = (ids = String(JAN)) => ({ TELEGRAM_BOT_TOKEN: TOKEN, TOEGELATEN_TELEGRAM_IDS: ids });

async function stuurUpdate(update: unknown, geheim?: string, ids?: string) {
  const request = new Request("https://opvang-bot.voorbeeld.workers.dev/telegram", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": geheim ?? (await webhookGeheim(TOKEN)) },
    body: JSON.stringify(update),
  });
  return worker.fetch(request, env(ids));
}

const bericht = (tekst: string, van = JAN, chat: { id: number; type: string } = { id: van, type: "private" }) => ({
  update_id: 1,
  message: { message_id: 1, text: tekst, from: { id: van }, chat },
});

const verstuurd = () => aanroepen.filter((a) => a.methode === "sendMessage").map((a) => a.body);

describe("webhook", () => {
  it("antwoordt op /start van een toegelaten gebruiker", async () => {
    const antwoord = await stuurUpdate(bericht("/start"));
    expect(antwoord.status).toBe(200);
    expect(verstuurd()).toEqual([{ chat_id: JAN, text: "Opvang_bot is actief" }]);
  });

  it("weigert een aanroep zonder het juiste geheim, en doet dan niets", async () => {
    const antwoord = await stuurUpdate(bericht("/start"), "verkeerd");
    expect(antwoord.status).toBe(401);
    expect(aanroepen).toEqual([]);
  });

  it("geeft een onbekende op /start enkel haar id terug", async () => {
    await stuurUpdate(bericht("/start", VREEMDE));
    const [b] = verstuurd();
    expect(b.chat_id).toBe(VREEMDE);
    expect(b.text).toContain(`Jouw Telegram-id: ${VREEMDE}`);
    expect(b.text).not.toContain("actief");
  });

  it("zwijgt tegen een onbekende die iets anders stuurt", async () => {
    await stuurUpdate(bericht("/definitief", VREEMDE));
    await stuurUpdate(bericht("hallo", VREEMDE));
    expect(verstuurd()).toEqual([]);
  });

  it("geeft iedereen toegang tot niets zolang er geen id's ingesteld zijn", async () => {
    await stuurUpdate(bericht("/start"), undefined, "");
    expect(verstuurd()[0].text).toContain("privé");
  });

  it("aanvaardt een groep enkel als de groep zelf toegelaten is", async () => {
    const inGroep = bericht("/start@Opvang_bot", JAN, { id: GROEP, type: "supergroup" });
    await stuurUpdate(inGroep);
    expect(verstuurd()[0].text).toContain(`Id van deze groep: ${GROEP}`);

    aanroepen = [];
    await stuurUpdate(inGroep, undefined, `${JAN},${GROEP}`);
    expect(verstuurd()).toEqual([{ chat_id: GROEP, text: "Opvang_bot is actief" }]);
  });

  it("antwoordt ook 200 als Telegram faalt, zodat de update niet eindeloos terugkomt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, description: "Bad Request" })));
    const fout = vi.spyOn(console, "error").mockImplementation(() => {});
    const antwoord = await stuurUpdate(bericht("/start"));
    expect(antwoord.status).toBe(200);
    expect(String(fout.mock.calls[0])).not.toContain(TOKEN);
  });
});

describe("/setup", () => {
  it("zet de webhook op deze Worker met het afgeleide geheim, en lekt het token niet", async () => {
    const antwoord = await worker.fetch(new Request("https://opvang-bot.voorbeeld.workers.dev/setup"), env());
    const inhoud = await antwoord.text();

    const zet = aanroepen.find((a) => a.methode === "setWebhook")!;
    expect(zet.body.url).toBe("https://opvang-bot.voorbeeld.workers.dev/telegram");
    expect(zet.body.secret_token).toBe(await webhookGeheim(TOKEN));
    expect(JSON.parse(inhoud)).toMatchObject({ ok: true, bot: "Opvang_bot", toegelaten_ids_ingesteld: 1 });
    expect(inhoud).not.toContain(TOKEN);
    expect(inhoud).not.toContain(String(zet.body.secret_token));
  });
});

describe("hulpfuncties", () => {
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
    expect(verbergToken(`fout bij https://api.telegram.org/bot${TOKEN}/x`, TOKEN)).toBe(
      "fout bij https://api.telegram.org/bot<token>/x",
    );
  });

  it("maakt een geheim dat Telegram aanvaardt", async () => {
    expect(await webhookGeheim(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
  });
});
