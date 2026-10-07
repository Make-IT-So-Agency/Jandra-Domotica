import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { dagelijks, ingeschrevenBericht, verwerkKlik, vorigeRonde } from "@/lib/opvang/menu";

const TOKEN = "123456:nep-token-voor-de-test";
const JAN = 1001;
const GROEP = -100200;

let aanroepen: { methode: string; body: Record<string, unknown> }[];
let db: ReturnType<typeof nepSupabase>;

beforeEach(() => {
  aanroepen = [];
  // Wijzigen en Definitief kijken naar de echte klok; die staat hier op de dag
  // dat het menu kwam, anders faalt de test vanzelf zodra de opening voorbij is.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T08:00:00Z"));
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
  vi.useRealTimers();
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

  it("de aankondiging op de dag zelf zegt wanneer je iets moet horen", async () => {
    Object.assign(db.tabellen.opvang_rondes[0], { status: "definitief", gevraagd_op: "2026-09-29T08:00:00.000Z" });
    db.tabellen.opvang_keuzes = [{ ronde_id: 5, slot_id: 11 }];
    await dagelijks(TOKEN, new Date("2026-10-06T08:00:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("schrijf ik 1 momenten in");
    expect(verstuurd()[0]).toContain("Hoor je dan niets van mij, schrijf dan zelf in via i-Active.");
  });

  it("opnieuw definitief maken na /stop: de stop geldt niet meer", async () => {
    db.tabellen.opvang_rondes[0].stop_gevraagd = true;
    await verwerkKlik(klik("o:t:5:1:11"), TOKEN);
    await verwerkKlik(klik("o:d:5"), TOKEN);
    expect(db.tabellen.opvang_rondes[0]).toMatchObject({ status: "definitief", stop_gevraagd: false });
  });
});

describe("na de opening: is er ingeschreven?", () => {
  beforeEach(() => {
    // Definitief, en op de ochtend zelf aangekondigd: zoals december 2026.
    Object.assign(db.tabellen.opvang_rondes[0], {
      status: "definitief",
      definitief_door: "Jan",
      gevraagd_op: "2026-09-29T08:00:00.000Z",
      herinnerd_op: "2026-10-06T08:00:00.000Z",
    });
    db.tabellen.opvang_keuzes = [
      { ronde_id: 5, slot_id: 11 },
      { ronde_id: 5, slot_id: 12 },
    ];
  });

  it("niet gestart: 's avonds gezegd, de volgende ochtend nog eens, na 24 uur hoe het nog kan, en dan stilte", async () => {
    await dagelijks(TOKEN, new Date("2026-10-06T17:05:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("⚠️ Opvang december 2026 is nog niet ingeschreven.");
    expect(verstuurd()[0]).toContain("niet (op tijd) gestart");
    expect(verstuurd()[0]).toContain("modus normaal");

    aanroepen = [];
    await dagelijks(TOKEN, new Date("2026-10-06T17:50:00Z"));
    expect(verstuurd()).toEqual([]);

    await dagelijks(TOKEN, new Date("2026-10-07T08:00:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("Start ze vóór");

    aanroepen = [];
    await dagelijks(TOKEN, new Date("2026-10-08T08:00:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("❌ Opvang december 2026 is niet ingeschreven.");
    expect(verstuurd()[0]).toContain("Vanzelf schrijf ik niet meer in");
    expect(verstuurd()[0]).toContain("modus inhalen");

    aanroepen = [];
    await dagelijks(TOKEN, new Date("2026-10-09T08:00:00Z"));
    expect(verstuurd()).toEqual([]);
    expect(db.tabellen.opvang_rondes[0].status).toBe("definitief");
  });

  it("deels gelukt: zegt hoeveel", async () => {
    db.tabellen.opvang_resultaten = [
      { ronde_id: 5, slot_id: 11, uitkomst: "ingeschreven" },
      { ronde_id: 5, slot_id: 12, uitkomst: "mislukt" },
    ];
    await dagelijks(TOKEN, new Date("2026-10-06T17:05:00Z"));
    expect(verstuurd()[0]).toContain("is maar voor 1 van de 2 momenten ingeschreven");
  });

  it("bezig: zwijgt zolang de workflow werkt, en zegt het als hij is blijven steken", async () => {
    Object.assign(db.tabellen.opvang_rondes[0], { status: "bezig", bezig_sinds: "2026-10-06T15:56:00.000Z" });
    await dagelijks(TOKEN, new Date("2026-10-06T17:05:00Z"));
    expect(verstuurd()).toEqual([]);
    await dagelijks(TOKEN, new Date("2026-10-06T18:30:00Z"));
    expect(verstuurd()).toHaveLength(1);
    expect(verstuurd()[0]).toContain("blijven steken");
  });

  it("na /stop: geen melding", async () => {
    db.tabellen.opvang_rondes[0].stop_gevraagd = true;
    await dagelijks(TOKEN, new Date("2026-10-06T17:05:00Z"));
    expect(verstuurd()).toEqual([]);
  });

  it("/status zegt hoe de vorige ronde afliep", async () => {
    expect(await vorigeRonde(new Date("2026-10-06T15:00:00Z"))).toBeNull();
    expect((await vorigeRonde(new Date("2026-10-07T08:00:00Z")))?.tekst).toContain("⚠️ niet ingeschreven: de taak in GitHub is niet (op tijd) gestart.");

    Object.assign(db.tabellen.opvang_rondes[0], { status: "klaar" });
    db.tabellen.opvang_resultaten = [
      { ronde_id: 5, slot_id: 11, uitkomst: "ingeschreven" },
      { ronde_id: 5, slot_id: 12, uitkomst: "reservelijst" },
    ];
    const klaar = await vorigeRonde(new Date("2026-10-07T08:00:00Z"));
    expect(klaar?.tekst).toMatch(/^Opvang december 2026 \(opende .+\): ✔ 1 ingeschreven, ⏸ 1 op de reservelijst\.$/);
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

describe("/ingeschreven", () => {
  it("toont wat de kalender als ingeschreven zag, en wat van een geopende ronde gekozen was maar ontbreekt", async () => {
    Object.assign(db.tabellen.opvang_rondes[0], { status: "klaar" });
    db.tabellen.opvang_keuzes = [
      { ronde_id: 5, slot_id: 11 },
      { ronde_id: 5, slot_id: 12 },
    ];
    Object.assign(db.tabellen.opvang_slots[0], { staat: "ingeschreven", gezien_op: "2026-10-07T11:12:00.000Z" });
    Object.assign(db.tabellen.opvang_slots[1], { staat: "vrij", gezien_op: "2026-10-07T11:12:00.000Z" });
    const tekst = await ingeschrevenBericht(new Date("2026-10-07T20:00:00Z"));
    expect(tekst).toMatch(/^Ingeschreven volgens i-Active \(kalender gelezen .+\):/);
    expect(tekst).toContain("🧒 Kind: 1 ingeschreven");
    expect(tekst).toContain("✔ di 1/12 voorschools (Speelhuis)");
    expect(tekst).toContain("❌ di 1/12 naschools (Speelhuis): gekozen, niet ingeschreven (vrij)");
  });

  it("een ronde die nog moet openen, telt niet als ontbrekend", async () => {
    Object.assign(db.tabellen.opvang_rondes[0], { status: "definitief" });
    db.tabellen.opvang_keuzes = [{ ronde_id: 5, slot_id: 12 }];
    Object.assign(db.tabellen.opvang_slots[1], { staat: "nog_niet_open", gezien_op: "2026-09-30T11:12:00.000Z" });
    expect(await ingeschrevenBericht(new Date("2026-10-01T08:00:00Z"))).toContain("Ik zie in i-Active niets ingeschreven");
  });
});
