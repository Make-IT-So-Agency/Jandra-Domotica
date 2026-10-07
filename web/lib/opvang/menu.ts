import "server-only";

import { heeftToegang, toegelatenIds } from "./toegang";
import { aanklikbaar, conflicten, keuzemenu, overzicht, slotsVanWeek, vakantieLocaties, welkeVakantieLocatie, type Slot } from "./keuzemenu";
import { momentLabel, opvangLabel, volgendeMomenten } from "./inschrijfmomenten";
import * as opslag from "./opslag";
import { beantwoordKnop, bewerkBericht, stuurBericht, type Klik, type Knoppen } from "./telegram";

/**
 * Het keuzemenu: tonen, bijwerken na een klik, definitief maken, en de
 * dagelijkse ronde (vragen en herinneren).
 */

/** Tot hoeveel minuten vóór de opening je nog kan wijzigen. */
const WIJZIGEN_TOT_MINUTEN = 5;

/** Zoveel dagen vóór de opening vraagt de bot wat jullie nodig hebben. */
export const VRAGEN_VANAF_DAGEN = 10;

/** Op deze dagen vóór de opening herinnert de bot, zolang het niet definitief is. */
const HERINNEREN_OP = [7, 3, 1, 0];

/** Zo lang na de opening schrijft de workflow nog vanzelf in (WACHTEN.inhalenMs in opvang/iactive/src/startsein.ts). */
const INHALEN_MS = 24 * 3_600_000;

/** Een ronde die langer "bezig" staat, is blijven steken: inschrijven duurt geen uur. */
const BEZIG_HOOGSTENS_MS = 2 * 3_600_000;

/** Tot zoveel dagen na de opening zegt de bot dat er niet ingeschreven is. */
const NAMELDEN_DAGEN = 2;

const GELUKT: opslag.Uitkomst[] = ["ingeschreven", "reservelijst", "al_ingeschreven"];

async function menuVoor(ronde: opslag.Ronde, kind: opslag.Kind, week: number) {
  const [lijst, keuzes, vakantieLocatie] = await Promise.all([
    opslag.slots(kind.id, ronde.maand),
    opslag.gekozen(ronde.id),
    opslag.leesInstelling(`vakantielocatie_${kind.id}`),
  ]);
  return {
    lijst,
    ...keuzemenu({
      rondeId: ronde.id,
      kindId: kind.id,
      kindNaam: kind.naam,
      maand: ronde.maand,
      opent: new Date(ronde.opent),
      status: ronde.status,
      slots: lijst,
      gekozen: keuzes,
      week,
      definitiefDoor: ronde.definitief_door,
      vakantieLocatie,
    }),
  };
}

/**
 * Toont of vernieuwt het menu van elk kind dat ingepland wordt. Een menu dat
 * al bestaat, wordt aangepast in plaats van opnieuw gestuurd, tenzij `nieuw`.
 */
export async function toonMenus(token: string, rondeId: number, chatId: number, nieuw = false): Promise<number> {
  const ronde = await opslag.ronde(rondeId);
  if (!ronde) return 0;
  const bestaand = new Map((await opslag.menus(rondeId)).map((m) => [m.kind_id, m]));
  let getoond = 0;
  for (const kind of (await opslag.kinderen()).filter((k) => k.plannen)) {
    const oud = bestaand.get(kind.id);
    const { tekst, knoppen, lijst } = await menuVoor(ronde, kind, oud?.week ?? 0);
    if (!lijst.length) continue;
    if (oud && !nieuw) {
      await bewerkBericht(token, oud.chat_id, oud.bericht_id, tekst, knoppen);
    } else {
      const b = await stuurBericht(token, chatId, tekst, knoppen);
      await opslag.zetMenu({ ronde_id: rondeId, kind_id: kind.id, chat_id: chatId, bericht_id: b.message_id, week: oud?.week ?? 0 });
    }
    getoond++;
  }
  return getoond;
}

export async function kinderenBericht(): Promise<{ tekst: string; knoppen: Knoppen }> {
  const lijst = await opslag.kinderen();
  if (!lijst.length) {
    return { tekst: "Ik ken nog geen kinderen: de kalender van i-Active is nog niet gelezen.", knoppen: [] };
  }
  return {
    tekst: [
      "Voor wie reserveer ik opvang?",
      "Tik om aan of uit te zetten. Enkel wie ✅ heeft, krijgt een keuzemenu, en enkel voor die kinderen schrijf ik in.",
    ].join("\n"),
    knoppen: lijst.map((k) => [
      { text: `${k.plannen ? "✅" : "▫️"} ${k.naam}${k.plannen ? "" : " (nog niet)"}`, callback_data: `o:k:${k.id}` },
    ]),
  };
}

/** De eerstvolgende ronde voor inwoners, aangemaakt als ze nog niet bestaat. */
export async function volgendeRonde(nu = new Date()): Promise<opslag.Ronde> {
  const lopend = (await opslag.lopendeRondes()).find((r) => new Date(r.opent) > nu || r.status === "bezig");
  if (lopend) return lopend;
  const [m] = volgendeMomenten("inwoners", nu);
  return opslag.zorgVoorRonde(m.opvang, "inwoners", m.opent);
}

function naam(van: { first_name?: string; id: number }): string {
  return van.first_name?.trim() || `id ${van.id}`;
}

function kanWijzigen(ronde: opslag.Ronde, nu = new Date()): boolean {
  return new Date(ronde.opent).getTime() - nu.getTime() > WIJZIGEN_TOT_MINUTEN * 60_000;
}

/** Het vaste overzicht van wat nu gekozen is, voor alle kinderen samen. */
export async function overzichtVan(ronde: opslag.Ronde): Promise<{ tekst: string; aantal: number; conflicten: string[] }> {
  const keuzes = await opslag.gekozen(ronde.id);
  const perKind: { naam: string; slots: Slot[] }[] = [];
  const fout: string[] = [];
  for (const kind of (await opslag.kinderen()).filter((k) => k.plannen)) {
    const lijst = (await opslag.slots(kind.id, ronde.maand)).filter((s) => keuzes.has(s.id));
    perKind.push({ naam: kind.naam, slots: lijst });
    fout.push(...conflicten(lijst).map((c) => `${kind.naam}, ${c}`));
  }
  return { tekst: overzicht(perKind), aantal: perKind.reduce((n, k) => n + k.slots.length, 0), conflicten: fout };
}

/** Een klik op een knop van de bot. Antwoordt altijd, anders blijft de knop draaien. */
export async function verwerkKlik(klik: Klik, token: string): Promise<void> {
  const chat = klik.message?.chat;
  const bericht = klik.message;
  if (!chat || !bericht || !heeftToegang({ message_id: 0, from: klik.from, chat }, toegelatenIds(process.env.TOEGELATEN_TELEGRAM_IDS))) {
    await beantwoordKnop(token, klik.id, "Geen toegang.");
    return;
  }
  const [soort, ...rest] = (klik.data ?? "").split(":").slice(1);
  const getallen = rest.map(Number);
  let melding: string | undefined;

  if (soort === "k") {
    const kind = (await opslag.kinderen()).find((k) => k.id === getallen[0]);
    if (kind) {
      await opslag.zetPlannen(kind.id, !kind.plannen);
      const { tekst, knoppen } = await kinderenBericht();
      await bewerkBericht(token, chat.id, bericht.message_id, tekst, knoppen);
      if (!kind.plannen) {
        const r = await volgendeRonde();
        if (r.status === "open") await toonMenus(token, r.id, chat.id);
      }
    }
  } else if (soort === "v") {
    // Naar de volgende vakantielocatie. Mag ook na Definitief: het verandert enkel wat je ziet.
    const [rondeId, kindId] = getallen;
    const ronde = await opslag.ronde(rondeId);
    const kind = (await opslag.kinderen()).find((k) => k.id === kindId);
    if (ronde && kind) {
      const lijst = await opslag.slots(kindId, ronde.maand);
      const locs = vakantieLocaties(lijst);
      const nu = welkeVakantieLocatie(lijst, await opslag.leesInstelling(`vakantielocatie_${kindId}`));
      const volgende = locs[(locs.indexOf(nu ?? "") + 1) % locs.length];
      if (volgende) await opslag.zetInstelling(`vakantielocatie_${kindId}`, volgende);
      const week = (await opslag.menus(rondeId)).find((m) => m.kind_id === kindId)?.week ?? 0;
      const { tekst, knoppen } = await menuVoor(ronde, kind, week);
      await bewerkBericht(token, chat.id, bericht.message_id, tekst, knoppen);
      melding = volgende ? `📍 ${volgende}` : undefined;
    }
  } else if (["t", "w", "a", "l"].includes(soort)) {
    const [rondeId, kindId, derde] = getallen;
    const ronde = await opslag.ronde(rondeId);
    const kind = (await opslag.kinderen()).find((k) => k.id === kindId);
    if (!ronde || !kind) {
      melding = "Dit menu bestaat niet meer.";
    } else {
      let week = (await opslag.menus(rondeId)).find((m) => m.kind_id === kindId)?.week ?? 0;
      if (soort === "w") {
        week = derde;
      } else if (ronde.status !== "open") {
        melding = ronde.status === "definitief" ? "Al definitief. Druk eerst op Wijzigen." : "Deze ronde is voorbij.";
      } else {
        const lijst = await opslag.slots(kindId, ronde.maand);
        const keuzes = await opslag.gekozen(rondeId);
        if (soort === "t") {
          const slot = lijst.find((s) => s.id === derde);
          if (slot && aanklikbaar(slot)) {
            if (keuzes.has(slot.id)) await opslag.ontkies(rondeId, [slot.id]);
            else await opslag.kies(rondeId, [slot.id], naam(klik.from));
          }
        } else if (soort === "a") {
          await opslag.kies(rondeId, slotsVanWeek(lijst, derde, true).map((s) => s.id), naam(klik.from));
        } else {
          await opslag.ontkies(rondeId, slotsVanWeek(lijst, derde).map((s) => s.id));
        }
        if (soort !== "t") week = derde;
      }
      const verse = (await opslag.ronde(rondeId))!;
      const { tekst, knoppen } = await menuVoor(verse, kind, week);
      await bewerkBericht(token, chat.id, bericht.message_id, tekst, knoppen);
      await opslag.zetMenu({ ronde_id: rondeId, kind_id: kindId, chat_id: chat.id, bericht_id: bericht.message_id, week });
    }
  } else if (soort === "d") {
    const ronde = await opslag.ronde(getallen[0]);
    if (!ronde) melding = "Deze ronde bestaat niet meer.";
    else if (!kanWijzigen(ronde)) melding = "Te laat: de inschrijving start zo meteen.";
    else {
      const { tekst, aantal, conflicten: dubbel } = await overzichtVan(ronde);
      if (!aantal) melding = "Er is nog niets gekozen.";
      else if (dubbel.length) {
        melding = "Nog niet definitief: er zit een dubbele keuze in.";
        await stuurBericht(token, chat.id, `⚠️ Nog niet definitief. Deze keuzes sluiten elkaar uit:\n${dubbel.map((d) => `• ${d}`).join("\n")}`);
      } else if (
        await opslag.zetStatus(ronde.id, ["open"], "definitief", {
          definitief_door: naam(klik.from),
          definitief_op: new Date().toISOString(),
          // Een /stop van vóór Wijzigen geldt niet meer: wie opnieuw definitief maakt, wil dat het gebeurt.
          stop_gevraagd: false,
        })
      ) {
        await toonMenus(token, ronde.id, chat.id);
        await stuurBericht(
          token,
          chat.id,
          [
            `🔒 Definitief door ${naam(klik.from)}. Op ${momentLabel(new Date(ronde.opent))} schrijf ik exact dit in, niets meer en niets minder:`,
            "",
            tekst,
            "",
            "Volzet? Dan zet ik het op de reservelijst en meld ik dat apart.",
          ].join("\n"),
        );
      }
    }
  } else if (soort === "e") {
    const ronde = await opslag.ronde(getallen[0]);
    if (!ronde) melding = "Deze ronde bestaat niet meer.";
    else if (!kanWijzigen(ronde)) melding = "Te laat: de inschrijving start zo meteen.";
    else if (await opslag.zetStatus(ronde.id, ["definitief"], "open", { definitief_door: null, definitief_op: null })) {
      await toonMenus(token, ronde.id, chat.id);
      await stuurBericht(token, chat.id, `✏️ ${naam(klik.from)} wijzigt de keuze. Druk daarna opnieuw op Definitief.`);
    }
  }
  await beantwoordKnop(token, klik.id, melding);
}

/** Het aantal kalenderdagen tussen vandaag en de opening, in Belgische tijd. */
export function dagenTot(opent: Date, nu: Date): number {
  const datum = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
  return Math.round((Date.parse(datum(opent)) - Date.parse(datum(nu))) / 86_400_000);
}

function zelfdeDag(a: string | null, nu: Date): boolean {
  return !!a && dagenTot(new Date(a), nu) === 0;
}

/**
 * De dagelijkse ronde: de volgende ronde aanmaken, het keuzemenu sturen zodra
 * de kalender gelezen is, herinneren zolang het niet definitief is, en een
 * ronde die voorbij is zonder definitieve keuze afsluiten.
 *
 * Mag zo vaak lopen als je wil: elke stap onthoudt dat ze gebeurd is.
 */
export async function dagelijks(token: string, nu = new Date(), vernieuw = false): Promise<string[]> {
  const gedaan: string[] = [];
  let chat = await opslag.leesChat();
  // Nog geen chat, of nog een persoonlijke chat terwijl er intussen een groep
  // toegelaten is: dan de groep. Wie met /hier bewust een chat koos, houdt die.
  const ids = [...toegelatenIds(process.env.TOEGELATEN_TELEGRAM_IDS)];
  const groep = ids.find((i) => i < 0);
  const gekozen = (await opslag.leesInstelling("telegram_chat_gekozen")) === "ja";
  const nieuw = !chat ? (groep ?? ids[0] ?? null) : chat > 0 && groep && !gekozen ? groep : null;
  if (nieuw && nieuw !== chat) {
    const vorig = chat;
    chat = nieuw;
    await opslag.zetInstelling("telegram_chat_id", String(chat));
    // Wie al een menu kreeg in de oude chat, krijgt het nu ook in de nieuwe.
    if (vorig) {
      for (const r of (await opslag.lopendeRondes()).filter((r) => r.status === "open" || r.status === "definitief")) {
        if (!r.gevraagd_op) continue;
        await stuurBericht(
          token,
          chat,
          `👋 Vanaf nu praat ik in deze groep. De inschrijving voor ${opvangLabel(r.maand)} opent ${momentLabel(new Date(r.opent))}. Hieronder het keuzemenu; wat al gekozen was, blijft staan.`,
        );
        await toonMenus(token, r.id, chat, true);
        gedaan.push(`naar groep verhuisd (${r.maand})`);
      }
    }
  }
  const [volgende] = volgendeMomenten("inwoners", nu);
  if (volgende && dagenTot(volgende.opent, nu) <= VRAGEN_VANAF_DAGEN) {
    await opslag.zorgVoorRonde(volgende.opvang, "inwoners", volgende.opent);
  }

  for (const r of await opslag.lopendeRondes()) {
    const opent = new Date(r.opent);
    const dagen = dagenTot(opent, nu);
    if (r.status === "open" && opent <= nu) {
      if (await opslag.zetStatus(r.id, ["open"], "gemist")) {
        gedaan.push(`ronde ${r.maand} gemist`);
        if (chat) {
          await toonMenus(token, r.id, chat);
          await stuurBericht(token, chat, `⚠️ De inschrijving voor ${opvangLabel(r.maand)} is geopend, maar er was geen definitieve keuze. Ik heb niets ingeschreven.`);
        }
      }
      continue;
    }
    if (opent <= nu) {
      if (chat && (await meldNietIngeschreven(token, chat, r, nu))) gedaan.push(`niet ingeschreven ${r.maand} gemeld`);
      continue;
    }
    if (!chat || dagen > VRAGEN_VANAF_DAGEN || r.status === "bezig") continue;

    const planbaar = (await opslag.kinderen()).filter((k) => k.plannen);
    if (!planbaar.length) {
      if (!zelfdeDag(r.herinnerd_op, nu)) {
        const { tekst, knoppen } = await kinderenBericht();
        if (knoppen.length) {
          await stuurBericht(token, chat, tekst, knoppen);
          await opslag.werkRondeBij(r.id, { herinnerd_op: nu.toISOString() });
          gedaan.push("kinderen gevraagd");
        }
      }
      continue;
    }

    if (!r.gevraagd_op) {
      if (!r.kalender_gelezen_op) continue;
      await stuurBericht(
        token,
        chat,
        [
          `📅 De inschrijving voor ${opvangLabel(r.maand)} opent ${momentLabel(opent)}.`,
          "Duid hieronder per kind aan wat nodig is, en druk daarna op 🔒 Definitief maken. Enkel wat definitief is, schrijf ik in.",
        ].join("\n"),
      );
      const n = await toonMenus(token, r.id, chat, true);
      await opslag.werkRondeBij(r.id, { gevraagd_op: nu.toISOString(), herinnerd_op: nu.toISOString() });
      gedaan.push(`menu ${r.maand} gestuurd (${n})`);
      continue;
    }

    if (vernieuw) {
      await toonMenus(token, r.id, chat);
      gedaan.push(`menu ${r.maand} vernieuwd`);
    }

    if (HERINNEREN_OP.includes(dagen) && !zelfdeDag(r.herinnerd_op, nu)) {
      if (r.status === "open") {
        const { aantal } = await overzichtVan(r);
        await stuurBericht(
          token,
          chat,
          `⏰ Nog niet definitief: opvang ${opvangLabel(r.maand)}. De inschrijving opent ${dagen === 0 ? "vandaag" : `over ${dagen} ${dagen === 1 ? "dag" : "dagen"}`}, ${momentLabel(opent)}. Nu gekozen: ${aantal}. Druk op 🔒 Definitief maken in het menu hierboven.`,
        );
        gedaan.push(`herinnering ${r.maand}`);
      } else if (dagen === 0) {
        const { tekst, aantal } = await overzichtVan(r);
        await stuurBericht(
          token,
          chat,
          `Vandaag ${momentLabel(opent)} schrijf ik ${aantal} momenten in:\n\n${tekst}\n\nKort vóór het openingsuur meld ik hier dat ik ingelogd ben. Hoor je dan niets van mij, schrijf dan zelf in via i-Active.`,
        );
        gedaan.push(`aankondiging ${r.maand}`);
      }
      await opslag.werkRondeBij(r.id, { herinnerd_op: nu.toISOString() });
    }
  }
  return gedaan;
}

/**
 * Is de opening voorbij zonder dat de workflow inschreef? "niet_gestart": de
 * ronde staat nog op definitief (de workflow begon niet, of zette ze na een
 * fout terug). "vastgelopen": ze staat te lang op bezig.
 */
export function nietIngeschreven(r: opslag.Ronde, nu: Date): "niet_gestart" | "vastgelopen" | null {
  if (new Date(r.opent) > nu) return null;
  if (r.status === "definitief") return "niet_gestart";
  if (r.status === "bezig" && (!r.bezig_sinds || nu.getTime() - Date.parse(r.bezig_sinds) > BEZIG_HOOGSTENS_MS)) return "vastgelopen";
  return null;
}

/**
 * Na de opening niets ingeschreven: dat zeggen, en wat jullie kunnen doen.
 * Eén keer per dag, tot twee dagen na de opening; niet na een /stop. De
 * aankondiging van de ochtend zelf telt niet mee, zodat het 's avonds na de
 * opening altijd gezegd wordt (Vercel roept de dagelijkse ronde ook 's avonds).
 */
async function meldNietIngeschreven(token: string, chat: number, r: opslag.Ronde, nu: Date): Promise<boolean> {
  const hoe = nietIngeschreven(r, nu);
  if (!hoe || r.stop_gevraagd) return false;
  const opent = new Date(r.opent);
  if (-dagenTot(opent, nu) > NAMELDEN_DAGEN) return false;
  if (r.herinnerd_op && new Date(r.herinnerd_op) >= opent && zelfdeDag(r.herinnerd_op, nu)) return false;

  const [{ aantal }, uitkomsten] = await Promise.all([overzichtVan(r), opslag.resultaten(r.id)]);
  const gelukt = uitkomsten.filter((u) => GELUKT.includes(u)).length;
  const tot = new Date(opent.getTime() + INHALEN_MS);
  const waarom = hoe === "vastgelopen" ? "de taak in GitHub is blijven steken" : "de taak in GitHub is niet (op tijd) gestart";
  const regels = [
    nu < tot
      ? `⚠️ Opvang ${opvangLabel(r.maand)} is ${gelukt ? `maar voor ${gelukt} van de ${aantal} momenten` : "nog niet"} ingeschreven. De inschrijving opende ${momentLabel(opent)}, maar ${waarom}.`
      : `❌ Opvang ${opvangLabel(r.maand)} is ${gelukt ? `maar voor ${gelukt} van de ${aantal} momenten` : "niet"} ingeschreven. De inschrijving opende ${momentLabel(opent)}, maar ${waarom}.`,
    "",
    nu < tot
      ? `GitHub start de taak om de vier uur opnieuw, vaak uren te laat. Start ze vóór ${momentLabel(tot)}, dan schrijf ik meteen alsnog in en stuur ik het verslag.`
      : "Vanzelf schrijf ik niet meer in: het is langer dan een dag geleden.",
    nu < tot
      ? "Niet wachten? Start ze nu zelf (GitHub → Actions → Opvang - inschrijven → Run workflow, modus normaal), of schrijf zelf in via i-Active; wat daar al staat, sla ik over. Moet ik niets meer doen: /stop."
      : "Schrijf zelf in via i-Active, of laat het mij nog doen: GitHub → Actions → Opvang - inschrijven → Run workflow, modus inhalen.",
  ];
  await stuurBericht(token, chat, regels.join("\n"));
  await opslag.werkRondeBij(r.id, { herinnerd_op: nu.toISOString() });
  return true;
}

/** Hoe de laatste ronde die al opende, afliep, in één regel. Voor /status. */
export async function vorigeRonde(nu = new Date()): Promise<{ id: number; tekst: string } | null> {
  const r = await opslag.laatstGeopend(nu);
  if (!r || nu.getTime() - Date.parse(r.opent) > 40 * 86_400_000) return null;
  const kop = `Opvang ${opvangLabel(r.maand)} (opende ${momentLabel(new Date(r.opent))}):`;
  if (r.status === "open" || r.status === "gemist") return { id: r.id, tekst: `${kop} niet definitief gemaakt, niets ingeschreven.` };
  const hoe = nietIngeschreven(r, nu);
  if (r.status === "bezig" && !hoe) return { id: r.id, tekst: `${kop} ⏳ de bot is aan het inschrijven.` };
  const uitkomsten = await opslag.resultaten(r.id);
  const tel = (...soorten: opslag.Uitkomst[]) => uitkomsten.filter((u) => soorten.includes(u)).length;
  if (r.status === "klaar") {
    const delen = [
      [tel("ingeschreven", "al_ingeschreven"), "✔", "ingeschreven"],
      [tel("reservelijst"), "⏸", "op de reservelijst"],
      [tel("mislukt"), "❌", "niet gelukt"],
      [tel("gestopt"), "🛑", "niet gedaan (gestopt)"],
    ].filter(([n]) => n);
    return { id: r.id, tekst: `${kop} ${delen.map(([n, teken, wat]) => `${teken} ${n} ${wat}`).join(", ") || "niets gekozen"}.` };
  }
  const { aantal } = await overzichtVan(r);
  const gelukt = tel(...GELUKT);
  return {
    id: r.id,
    tekst: `${kop} ⚠️ ${gelukt ? `maar ${gelukt} van de ${aantal} momenten ingeschreven` : "niet ingeschreven"}: ${hoe === "vastgelopen" ? "de taak in GitHub is blijven steken" : "de taak in GitHub is niet (op tijd) gestart"}.`,
  };
}
