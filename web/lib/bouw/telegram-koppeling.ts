import "server-only";

import { TelegramFout, roepAan, verbergToken } from "@/lib/opvang/telegram";

import { ontsleutel, versleutel } from "./geheim";
import { leesInstelling, verwijderInstelling, zetInstelling } from "./regie-opslag";
import { bouwWebhookGeheim } from "./telegram";
import {
  TELEGRAM_SLEUTELS,
  leesAanvragen,
  leesChats,
  lopendeAanvragen,
  metChat,
  schoonToken,
  telegramCommandos,
  voegAanvraagToe,
  zonderChat,
  type Aanvraag,
  type Telegramchat,
} from "./telegramregels";

/**
 * De bot van Bouw koppelen vanuit de app, zonder GitHub of BotFather-id's:
 * het token komt versleuteld in bouw_instellingen, wie toegang vraagt komt in
 * een lijst, en toelaten is één tik op /bouw/telegram.
 *
 * Een preview-uitrol deelt de databank met productie. Daarom gebruikt enkel
 * productie (of een lokale omgeving zonder VERCEL_ENV) het token, en wijst de
 * webhook altijd naar AUTH_URL, nooit naar het adres van een aanvraag.
 */

const LABEL = "bouw-bot:token";
const TIJDSLIMIET_MS = 10_000;

/** Of de bot hier mag werken: in productie, of lokaal en in de tests. */
export function botMagHier(): boolean {
  const omgeving = process.env.VERCEL_ENV;
  return !omgeving || omgeving === "production";
}

/** Waar Telegram de berichten heen stuurt. Null zonder AUTH_URL. */
export function webhookAdres(): string | null {
  const adres = process.env.AUTH_URL?.trim().replace(/\/+$/, "");
  return adres ? `${adres}/api/bouw/telegram` : null;
}

/** Het token, ontsleuteld. Null als er geen is, het niet te lezen valt, of de bot hier niet mag. */
export async function leesBottoken(): Promise<string | null> {
  if (!botMagHier()) return null;
  const waarde = await leesInstelling(TELEGRAM_SLEUTELS.token);
  return waarde ? ontsleutel(waarde, LABEL) : null;
}

export async function bewaarBottoken(token: string, bot: string): Promise<void> {
  await zetInstelling(TELEGRAM_SLEUTELS.token, versleutel(token, LABEL));
  await zetInstelling(TELEGRAM_SLEUTELS.bot, bot);
}

/** Telegram, met een tijdslimiet: een trage Telegram mag een pagina niet ophouden. */
async function telegram<T>(token: string, methode: string, body: Record<string, unknown> = {}): Promise<T> {
  let klok: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      roepAan<T>(token, methode, body),
      new Promise<never>((_, weiger) => {
        klok = setTimeout(() => weiger(new TelegramFout(`${methode}: Telegram antwoordt niet.`)), TIJDSLIMIET_MS);
      }),
    ]);
  } finally {
    clearTimeout(klok);
  }
}

function leesbareFout(fout: unknown, token: string): string {
  const tekst = verbergToken(fout instanceof Error ? fout.message : String(fout), token);
  // Een fout of ingetrokken token: 401 Unauthorized of 404 Not Found.
  if (/: (unauthorized|not found)$/i.test(tekst)) {
    return "Telegram kent dit token niet. Kopieer het opnieuw bij BotFather, of vraag er een nieuw met /token.";
  }
  if (/geen verbinding|antwoordt niet/.test(tekst)) return `Telegram is nu niet bereikbaar (${tekst}). Probeer het straks opnieuw.`;
  return `Telegram weigerde: ${tekst}`;
}

export type Koppeluitkomst = { ok: true; bot: string } | { ok: false; melding: string };

/**
 * Het token nakijken bij Telegram, de webhook en de commando's zetten, en het
 * token versleuteld bewaren. Kan opnieuw: dat zet alles gewoon nog eens.
 */
export async function koppelBot(invoer: string): Promise<Koppeluitkomst> {
  const token = schoonToken(invoer);
  if (!token) {
    return {
      ok: false,
      melding: "Dit lijkt geen token van BotFather. Het ziet eruit als 123456789:AAH… : cijfers, een dubbele punt en een lange reeks letters en cijfers.",
    };
  }
  if (token === process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return { ok: false, melding: "Dit is het token van de bot van Opvang. Bouw krijgt een eigen bot: maak er een nieuwe bij BotFather." };
  }
  if (!botMagHier()) return { ok: false, melding: "Dit is een testversie van de app: koppelen kan enkel in de gewone app." };
  const url = webhookAdres();
  if (!url?.startsWith("https://")) {
    return { ok: false, melding: "Koppelen kan enkel in de gewone app, op een https-adres (AUTH_URL)." };
  }

  let bot: string;
  try {
    const ik = await telegram<{ username?: string }>(token, "getMe");
    bot = ik.username ?? "";
    await telegram(token, "setWebhook", {
      url,
      secret_token: bouwWebhookGeheim(token),
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    await telegram(token, "setMyCommands", { commands: telegramCommandos() });
  } catch (fout) {
    return { ok: false, melding: leesbareFout(fout, token) };
  }
  try {
    await bewaarBottoken(token, bot);
  } catch (fout) {
    return { ok: false, melding: verbergToken(fout instanceof Error ? fout.message : "Bewaren mislukt.", token) };
  }
  return { ok: true, bot };
}

/** De webhook weg bij Telegram, en het token weg uit de databank. Wie toegelaten is, blijft dat. */
export async function ontkoppelBot(): Promise<void> {
  const token = await leesBottoken();
  if (token) await telegram(token, "deleteWebhook", { drop_pending_updates: true }).catch(() => undefined);
  await verwijderInstelling(TELEGRAM_SLEUTELS.token);
  await verwijderInstelling(TELEGRAM_SLEUTELS.bot);
}

export interface Botstand {
  /** Of er een token is, en of het nog te lezen valt (een andere AUTH_SECRET maakt het onleesbaar). */
  token: "geen" | "leesbaar" | "onleesbaar";
  bot: string | null;
  webhook: {
    url: string;
    juist: boolean;
    wachtend: number;
    laatsteFout: string | null;
    laatsteFoutOp: string | null;
  } | null;
  /** Telegram niet bereikbaar, of het token ingetrokken. */
  fout: string | null;
}

/** Wat Telegram over de bot zegt. Enkel waar de bot mag werken (zie botMagHier). */
export async function laadKoppeling(): Promise<Botstand> {
  const [ruw, bot] = await Promise.all([leesInstelling(TELEGRAM_SLEUTELS.token), leesInstelling(TELEGRAM_SLEUTELS.bot)]);
  if (!ruw || !botMagHier()) return { token: "geen", bot: null, webhook: null, fout: null };
  const token = ontsleutel(ruw, LABEL);
  if (!token) return { token: "onleesbaar", bot: bot || null, webhook: null, fout: null };
  try {
    const info = await telegram<{
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
    }>(token, "getWebhookInfo");
    return {
      token: "leesbaar",
      bot: bot || null,
      webhook: {
        url: info.url ?? "",
        juist: Boolean(info.url) && info.url === webhookAdres(),
        wachtend: info.pending_update_count ?? 0,
        laatsteFout: info.last_error_message ?? null,
        laatsteFoutOp: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
      },
      fout: null,
    };
  } catch (fout) {
    return { token: "leesbaar", bot: bot || null, webhook: null, fout: leesbareFout(fout, token) };
  }
}

// ---------------------------------------------------------------------------
// Wie de bot mag gebruiken
// ---------------------------------------------------------------------------

export interface Toegang {
  toegelaten: Telegramchat[];
  aanvragen: Aanvraag[];
  /** De chat voor de herinneringen. */
  chat: number | null;
}

export async function leesToegang(nu = new Date()): Promise<Toegang> {
  const [toegelaten, aanvragen, chat] = await Promise.all([
    leesInstelling(TELEGRAM_SLEUTELS.toegelaten),
    leesInstelling(TELEGRAM_SLEUTELS.aanvragen),
    leesInstelling(TELEGRAM_SLEUTELS.chat),
  ]);
  const chatId = Number(chat);
  const lijst = leesChats(toegelaten);
  return {
    toegelaten: lijst,
    // Wie intussen toegelaten is, vraagt niets meer.
    aanvragen: lopendeAanvragen(leesAanvragen(aanvragen), nu).filter((aanvraag) => !lijst.some((t) => t.id === aanvraag.id)),
    chat: Number.isSafeInteger(chatId) && chatId !== 0 ? chatId : null,
  };
}

export async function toegelatenSet(): Promise<Set<number>> {
  return new Set(leesChats(await leesInstelling(TELEGRAM_SLEUTELS.toegelaten)).map((chat) => chat.id));
}

/** Wie de bot een bericht stuurde zonder toegang, komt in de lijst op /bouw/telegram. */
export async function noteerAanvragen(chats: readonly Telegramchat[], nu = new Date()): Promise<void> {
  if (chats.length === 0) return;
  let aanvragen = leesAanvragen(await leesInstelling(TELEGRAM_SLEUTELS.aanvragen));
  for (const chat of chats) aanvragen = voegAanvraagToe(aanvragen, chat, nu);
  await zetInstelling(TELEGRAM_SLEUTELS.aanvragen, JSON.stringify(aanvragen));
}

/** Toelaten: uit de aanvragen, of met de hand. De aanvraag verdwijnt dan. */
export async function laatToe(chat: Telegramchat): Promise<void> {
  const [toegelaten, aanvragen] = await Promise.all([
    leesInstelling(TELEGRAM_SLEUTELS.toegelaten),
    leesInstelling(TELEGRAM_SLEUTELS.aanvragen),
  ]);
  await zetInstelling(TELEGRAM_SLEUTELS.toegelaten, JSON.stringify(metChat(leesChats(toegelaten), chat)));
  await zetInstelling(TELEGRAM_SLEUTELS.aanvragen, JSON.stringify(zonderChat(leesAanvragen(aanvragen), chat.id)));
}

/** Intrekken. Was het de chat voor de herinneringen, dan gaan die nergens meer heen. */
export async function trekIn(id: number): Promise<void> {
  const [toegelaten, chat] = await Promise.all([
    leesInstelling(TELEGRAM_SLEUTELS.toegelaten),
    leesInstelling(TELEGRAM_SLEUTELS.chat),
  ]);
  await zetInstelling(TELEGRAM_SLEUTELS.toegelaten, JSON.stringify(zonderChat(leesChats(toegelaten), id)));
  if (Number(chat) === id) await verwijderInstelling(TELEGRAM_SLEUTELS.chat);
}

/** Een aanvraag weggooien, van iemand die niets met het huis te maken heeft. */
export async function vergeetAanvraag(id: number): Promise<void> {
  const aanvragen = leesAanvragen(await leesInstelling(TELEGRAM_SLEUTELS.aanvragen));
  await zetInstelling(TELEGRAM_SLEUTELS.aanvragen, JSON.stringify(zonderChat(aanvragen, id)));
}

export async function zetHerinneringenChat(id: number): Promise<void> {
  await zetInstelling(TELEGRAM_SLEUTELS.chat, String(id));
}
