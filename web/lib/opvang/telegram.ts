import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Het kleine stukje Telegram Bot API dat de opvang-bot gebruikt.
 *
 * Het token zit in de URL van elke aanroep. Daarom gaat er nooit een URL, een
 * request of een ruwe foutmelding naar de logs: enkel wat `verbergToken` er
 * van overlaat.
 */

const API = "https://api.telegram.org";

export class TelegramFout extends Error {}

export function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramFout("TELEGRAM_BOT_TOKEN is niet ingesteld op de server.");
  return token;
}

export function verbergToken(tekst: string, token: string): string {
  return token ? tekst.split(token).join("<token>") : tekst;
}

export async function roepAan<T = unknown>(
  token: string,
  methode: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  let antwoord: Response;
  try {
    antwoord = await fetch(`${API}/bot${token}/${methode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (fout) {
    throw new TelegramFout(`${methode}: geen verbinding (${verbergToken(String(fout), token)})`);
  }

  const inhoud = (await antwoord.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;
  if (!inhoud?.ok) {
    const reden = inhoud?.description ?? `HTTP ${antwoord.status}`;
    throw new TelegramFout(`${methode}: ${verbergToken(reden, token)}`);
  }
  return inhoud.result as T;
}

export function stuurBericht(token: string, chatId: number, tekst: string) {
  return roepAan(token, "sendMessage", { chat_id: chatId, text: tekst });
}

/**
 * Telegram stuurt bij elke webhook-aanroep het geheim mee dat we bij
 * setWebhook opgaven, in de header X-Telegram-Bot-Api-Secret-Token. Zonder
 * die controle kan iedereen die de URL kent zich als Telegram voordoen.
 *
 * Het geheim wordt afgeleid van het bot-token in plaats van apart ingesteld:
 * één secret minder, en een nieuw token geeft vanzelf een nieuw geheim zodra
 * de webhook opnieuw gekoppeld wordt. Hex, want Telegram laat enkel
 * A-Z, a-z, 0-9, _ en - toe.
 */
export function webhookGeheim(token: string): string {
  return createHmac("sha256", token).update("opvang-bot:telegram-webhook").digest("hex");
}

export function geheimKlopt(aangeboden: string, token: string): boolean {
  const a = Buffer.from(aangeboden);
  const b = Buffer.from(webhookGeheim(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** De velden uit een update die we vandaag lezen. */
export interface Update {
  update_id: number;
  message?: Bericht;
}

export interface Bericht {
  message_id: number;
  text?: string;
  from?: { id: number; first_name?: string };
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
}

/**
 * "/start", "/start@Opvang_bot" en "/start iets" worden allemaal "start".
 * In een groep plakt Telegram de botnaam achter het commando.
 */
export function commando(tekst: string | undefined): string | null {
  const treffer = tekst?.trim().match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s|$)/i);
  return treffer ? treffer[1].toLowerCase() : null;
}
