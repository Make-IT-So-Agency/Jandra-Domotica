import type { Bericht } from "@/lib/opvang/telegram";

/**
 * De koppeling van de bot van Bouw: wie de bot mag gebruiken, wie erom vroeg,
 * en hoe een token eruitziet. Puur: de server bewaart, deze functies beslissen.
 * Alles staat in bouw_instellingen; de lijsten als JSON.
 */

/** De sleutels in bouw_instellingen. */
export const TELEGRAM_SLEUTELS = {
  /** Het token, versleuteld (zie lib/bouw/geheim.ts). */
  token: "telegram_token",
  /** De gebruikersnaam van de bot, zonder @. */
  bot: "telegram_bot",
  toegelaten: "telegram_toegelaten",
  aanvragen: "telegram_aanvragen",
  /** De chat voor de herinneringen, gekozen in de app of met /hier. */
  chat: "telegram_chat_id",
} as const;

export const CHAT_SLEUTEL = TELEGRAM_SLEUTELS.chat;

/** Wat de bot kan, voor /help en voor het menu in Telegram. */
export const COMMANDOS: readonly { commando: string; uitleg: string }[] = [
  { commando: "week", uitleg: "wat er deze en volgende week gebeurt" },
  { commando: "deadlines", uitleg: "welke keuzes nog open staan, en tegen wanneer" },
  { commando: "facturen", uitleg: "welke facturen nog betaald moeten worden" },
  { commando: "taken", uitleg: "wat er in de app nog te doen is" },
  { commando: "hier", uitleg: "stuur mijn herinneringen voortaan naar deze chat" },
  { commando: "id", uitleg: "je Telegram-id" },
];

/** Voor setMyCommands: Telegram wil een beschrijving met een hoofdletter, hoogstens 256 tekens. */
export function telegramCommandos(): { command: string; description: string }[] {
  return COMMANDOS.map(({ commando, uitleg }) => ({
    command: commando,
    description: (uitleg.charAt(0).toLocaleUpperCase("nl-BE") + uitleg.slice(1)).slice(0, 256),
  }));
}

/**
 * Een token zoals BotFather het geeft: cijfers, een dubbele punt, en een lange
 * reeks letters, cijfers, _ en -. Witruimte valt weg, net als "bot" ervoor
 * (zoals in een URL van de Bot API). Null als het er niet zo uitziet.
 */
export function schoonToken(invoer: string): string | null {
  const token = invoer.replace(/\s+/g, "").replace(/^bot(?=\d)/i, "");
  return /^\d{5,15}:[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

export type Chatsoort = "persoon" | "groep";

export interface Telegramchat {
  id: number;
  naam: string;
  soort: Chatsoort;
}

export interface Aanvraag extends Telegramchat {
  /** Wanneer, als ISO-tijd. */
  op: string;
}

/** Zoveel aanvragen blijven bewaard, de nieuwste eerst. */
export const MAX_AANVRAGEN = 10;
/** Een aanvraag die zo lang wacht, verdwijnt. */
export const AANVRAAG_DAGEN = 30;

const NAAM_MAX = 80;

function isChat(waarde: unknown): waarde is Telegramchat {
  if (typeof waarde !== "object" || waarde === null) return false;
  const { id, naam, soort } = waarde as Record<string, unknown>;
  return typeof id === "number" && Number.isSafeInteger(id) && id !== 0 && typeof naam === "string" && (soort === "persoon" || soort === "groep");
}

function leesLijst(json: string | null): unknown[] {
  try {
    const lijst: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(lijst) ? lijst : [];
  } catch {
    return [];
  }
}

/** De toegelaten chats uit bouw_instellingen. Wat niet klopt, valt weg. */
export function leesChats(json: string | null): Telegramchat[] {
  return leesLijst(json)
    .filter(isChat)
    .map(({ id, naam, soort }) => ({ id, naam, soort }));
}

/** De aanvragen uit bouw_instellingen. Wat niet klopt, valt weg. */
export function leesAanvragen(json: string | null): Aanvraag[] {
  return leesLijst(json)
    .filter((waarde): waarde is Aanvraag => isChat(waarde) && typeof (waarde as Aanvraag).op === "string")
    .map(({ id, naam, soort, op }) => ({ id, naam, soort, op }));
}

/** Enkel de aanvragen die nog niet vervallen zijn. */
export function lopendeAanvragen(aanvragen: readonly Aanvraag[], nu: Date): Aanvraag[] {
  const grens = nu.getTime() - AANVRAAG_DAGEN * 24 * 60 * 60 * 1000;
  return aanvragen.filter((aanvraag) => {
    const op = Date.parse(aanvraag.op);
    return Number.isFinite(op) && op >= grens;
  });
}

/**
 * Een nieuwe aanvraag vooraan. Wie al vroeg, schuift naar voren in plaats van
 * twee keer te staan; wat vervallen is, valt weg; hoogstens MAX_AANVRAGEN.
 */
export function voegAanvraagToe(aanvragen: readonly Aanvraag[], chat: Telegramchat, nu: Date): Aanvraag[] {
  return [
    { ...chat, op: nu.toISOString() },
    ...lopendeAanvragen(aanvragen, nu).filter((aanvraag) => aanvraag.id !== chat.id),
  ].slice(0, MAX_AANVRAGEN);
}

/** Toelaten: in de lijst, of met een nieuwe naam als hij er al stond. */
export function metChat(lijst: readonly Telegramchat[], chat: Telegramchat): Telegramchat[] {
  const nieuw = { id: chat.id, naam: chat.naam, soort: chat.soort };
  return lijst.some((bestaand) => bestaand.id === chat.id)
    ? lijst.map((bestaand) => (bestaand.id === chat.id ? nieuw : bestaand))
    : [...lijst, nieuw];
}

export function zonderChat<T extends Telegramchat>(lijst: readonly T[], id: number): T[] {
  return lijst.filter((chat) => chat.id !== id);
}

/** De velden die Telegram meestuurt en die het type van Opvang niet kent. */
export type Bouwbericht = Bericht & {
  from?: Bericht["from"] & { last_name?: string; username?: string };
  chat: Bericht["chat"] & { title?: string };
};

function persoonsnaam(van: NonNullable<Bouwbericht["from"]>): string {
  const naam = [van.first_name, van.last_name].filter(Boolean).join(" ").trim();
  return (naam || (van.username ? `@${van.username}` : "Iemand zonder naam")).slice(0, NAAM_MAX);
}

/**
 * Wie er in een bericht om toegang kan vragen: de afzender, en in een groep
 * ook de groep zelf. In een groep moeten ze allebei toegelaten zijn.
 */
export function chatsVan(bericht: Bouwbericht): Telegramchat[] {
  const chats: Telegramchat[] = [];
  if (bericht.from) chats.push({ id: bericht.from.id, naam: persoonsnaam(bericht.from), soort: "persoon" });
  if (bericht.chat.type !== "private") {
    chats.push({ id: bericht.chat.id, naam: (bericht.chat.title?.trim() || "Groep zonder naam").slice(0, NAAM_MAX), soort: "groep" });
  }
  return chats;
}

/** Een id dat iemand met de hand invult: een geheel getal, negatief voor een groep. */
export function leesTelegramId(invoer: string): number | null {
  const schoon = invoer.trim();
  if (!/^-?\d{1,16}$/.test(schoon)) return null;
  const id = Number(schoon);
  return Number.isSafeInteger(id) && id !== 0 ? id : null;
}
