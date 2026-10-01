import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { dagelijks, verwerkKlik } from "@/lib/opvang/menu";

const TOKEN = "123456:nep-token-voor-de-test";
const JAN = 1001;
const GROEP = -100200;

let aanroepen: { methode: string; body: Record<string, unknown> }[];
let db: ReturnType<typeof nepSupabase>;

beforeEach(() => {
  aanroepen = [];
  vi.stubEnv("TOEGELATEN_TELEGRAM_IDS", `${JAN},${GROEP}`);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const methode = url.split("/").pop()!;
      aanroepen.push({ methode, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, result: methode === "sendMessage" ? { message_id: 50 + aanroepen.length } : true });
    }),
  );
  db = nepSupabase({
    opvang_instellingen: [{ sleutel: "telegram_chat_id", waarde: String(GROEP) }],
    opvang_kinderen: [
      { id: 1, leerling_id: "a", naam: "Kind", plannen: true },
      { id: 2, leerling_id: "b", naam: "Jonger", plannen: false },
    ],
    opvang_rondes: [
      {
        id: 5,
        maand: "2026-12",
        ronde: "inwoners",
        opent: "2026-10-06T16:00:00.000Z",
        status: "open",
        definitief_door: null,
        definitief_op: null,
        stop_gevraagd: false,
        kalender_gelezen_op: "2026-09-29T04:30:00.000Z",
        gevraagd_op: null,
        herinnerd_op: null,
      },
    ],
    opvang_slots: [
      { id: 11, kind_id: 1, maand: "2026-12", datum: "2026-12-01", moment: "Voorschoolse opvang (verwerking)", locatie: "BKO - Speelhuis", staat: "nog_niet_open" },
      { id: 12, kind_id: 1, maand: "2026-12", datum: "2026-12-01", moment: "Naschoolse opvang (verwerking)", locatie: "BKO - Speelhuis", staat: "nog_niet_open" },
    ],
  });
  nep.client = db.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const klik = (data: string, van = JAN, berichtId = 52) => ({
  id: "k1",
  from: { id: van, first_name: "Jan" },
  data,
  message: { message_id: berichtId, chat: { id: GROEP, type: "supergroup" as const } },
});

const verstuurd = () => aanroepen.filter((a) => a.methode === "sendMessage").map((a) => String(a.body.text));
const antwoord = () => aanroepen.filter((a) => a.methode === "answerCallbackQuery").map((a) => a.body.text);

describe("een ronde van begin tot definitief", () => {
  it("vraagt één keer, met een menu enkel voor het kind dat ingepland wordt", async () => {
    await dagelijks(TOKEN, new Date("2026-09-29T08:00:00Z"));
    expect(verstuurd()).toHaveLength(2);
    expect(verstuurd()[0]).toContain("De inschrijving voor december 2026 opent");
    expect(verstuurd()[1]).toContain("🧒 Kind");
    expect(db.tabellen.opvang_menus).toMatchObject([{ ronde_id: 5, kind_id: 1, chat_id: GROEP, bericht_id: 52, week: 0 }]);

    aanroepen = [];
    await dagelijks(TOKEN, new Date("2026-09-29T12:00:00Z"));
    expect(verstuurd()).toEqual([]);
  });

  it("aanvinken, definitief maken, en daarna niets meer laten wijzigen", async () => {
    await dagelijks(TOKEN, new Date("2026-09-29T08:00:00Z"));
    await verwerkKlik(klik("o:t:5:1:11"), TOKEN);
    expect(db.tabellen.opvang_keuzes.map((k) => k.slot_id)).toEqual([11]);
    const bewerkt = aanroepen.filter((a) => a.methode === "editMessageText").at(-1)!;
    expect(JSON.stringify(bewerkt.body.reply_markup)).toContain("✅ voor");

    aanroepen = [];
    await verwerkKlik(klik("o:d:5"), TOKEN);
    expect(db.tabellen.opvang_rondes[0].status).toBe("definitief");
    expect(db.tabellen.opvang_rondes[0].definitief_door).toBe("Jan");
    const overzicht = verstuurd().find((t) => t.includes("Definitief door Jan"))!;
    expect(overzicht).toContain("• di 1/12  voorschools (BKO - Speelhuis)");
    expect(overzicht).not.toContain("naschools");

    aanroepen = [];
    await verwerkKlik(klik("o:t:5:1:12"), TOKEN);
    expect(db.tabellen.opvang_keuzes.map((k) => k.slot_id)).toEqual([11]);
    expect(antwoord()).toEqual(["Al definitief. Druk eerst op Wijzigen."]);
  });

  it("wijzigen kan niet meer vlak voor de opening", async () => {
    db.tabellen.opvang_rondes[0].status = "definitief";
    db.tabellen.opvang_rondes[0].opent = new Date(Date.now() + 2 * 60_000).toISOString();
    await verwerkKlik(klik("o:e:5"), TOKEN);
    expect(db.tabellen.opvang_rondes[0].status).toBe("definitief");
    expect(antwoord()).toEqual(["Te laat: de inschrijving start zo meteen."]);
  });

  it("niets gekozen: niet definitief", async () => {
    await verwerkKlik(klik("o:d:5"), TOKEN);
    expect(db.tabellen.opvang_rondes[0].status).toBe("open");
    expect(antwoord()).toEqual(["Er is nog niets gekozen."]);
  });

  it("een klik van iemand die niet toegelaten is, verandert niets", async () => {
    await verwerkKlik(klik("o:t:5:1:11", 6666), TOKEN);
    expect(db.tabellen.opvang_keuzes ?? []).toEqual([]);
    expect(antwoord()).toEqual(["Geen toegang."]);
  });

  it("herinnert op de openingsdag zolang het niet definitief is", async () => {
    db.tabellen.opvang_rondes[0].gevraagd_op = "2026-09-29T08:00:00.000Z";
    await dagelijks(TOKEN, new Date("2026-10-06T08:00:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("Nog niet definitief");
    expect(verstuurd()[0]).toContain("vandaag");
  });

  it("voorbij de opening zonder definitieve keuze: gemist, en niets ingeschreven", async () => {
    db.tabellen.opvang_rondes[0].gevraagd_op = "2026-09-29T08:00:00.000Z";
    await dagelijks(TOKEN, new Date("2026-10-06T16:30:00Z"));
    expect(db.tabellen.opvang_rondes[0].status).toBe("gemist");
    expect(verstuurd().at(-1)).toContain("Ik heb niets ingeschreven");
  });
});

describe("van de persoonlijke chat naar de groep", () => {
  it("verhuist vanzelf zodra een groep toegelaten is, en stuurt het menu daar opnieuw", async () => {
    db.tabellen.opvang_instellingen = [{ sleutel: "telegram_chat_id", waarde: String(JAN) }];
    db.tabellen.opvang_rondes[0].gevraagd_op = "2026-09-29T04:35:00.000Z";
    db.tabellen.opvang_rondes[0].herinnerd_op = "2026-09-30T08:00:00.000Z";
    await dagelijks(TOKEN, new Date("2026-09-30T09:00:00Z"));
    expect(db.tabellen.opvang_instellingen.find((i) => i.sleutel === "telegram_chat_id")?.waarde).toBe(String(GROEP));
    const naarGroep = aanroepen.filter((a) => a.methode === "sendMessage" && a.body.chat_id === GROEP);
    expect(String(naarGroep[0].body.text)).toContain("Vanaf nu praat ik in deze groep");
    expect(String(naarGroep[1].body.text)).toContain("🧒 Kind");
  });

  it("wie met /hier een chat koos, houdt die", async () => {
    db.tabellen.opvang_instellingen = [
      { sleutel: "telegram_chat_id", waarde: String(JAN) },
      { sleutel: "telegram_chat_gekozen", waarde: "ja" },
    ];
    await dagelijks(TOKEN, new Date("2026-09-30T09:00:00Z"));
    expect(db.tabellen.opvang_instellingen.find((i) => i.sleutel === "telegram_chat_id")?.waarde).toBe(String(JAN));
  });
});
