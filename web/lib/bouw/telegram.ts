import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { roepAan } from "@/lib/opvang/telegram";

/**
 * De eigen bot van Bouw: een andere bot dan Opvang_bot, met een eigen token,
 * een eigen lijst toegelaten id's en een eigen webhookgeheim. Het token en de
 * lijst komen uit de app (zie telegram-koppeling.ts). Het aanroepen van
 * Telegram zelf komt ongewijzigd uit lib/opvang/telegram.ts.
 */

/**
 * Het geheim dat Telegram bij elke webhook-aanroep meestuurt. Afgeleid van het
 * token, met een eigen label: zo verschilt het van dat van Opvang_bot, ook als
 * iemand per ongeluk hetzelfde token zou gebruiken.
 */
export function bouwWebhookGeheim(token: string): string {
  return createHmac("sha256", token).update("bouw-bot:telegram-webhook").digest("hex");
}

export function bouwGeheimKlopt(aangeboden: string, token: string): boolean {
  const a = Buffer.from(aangeboden);
  const b = Buffer.from(bouwWebhookGeheim(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Het adres van de webapp, voor de knoppen onder een bericht. */
export function appAdres(request: Request): string {
  const ingesteld = process.env.AUTH_URL?.trim().replace(/\/+$/, "");
  return ingesteld || new URL(request.url).origin;
}

/**
 * Een bericht met een knop naar het juiste scherm. Telegram aanvaardt enkel
 * https-links in een knop; op een testomgeving zonder https komt de link
 * gewoon onder de tekst.
 */
export async function stuurBouwbericht(token: string, chatId: number, tekst: string, url?: string): Promise<void> {
  const knop = url?.startsWith("https://");
  await roepAan(token, "sendMessage", {
    chat_id: chatId,
    text: url && !knop ? `${tekst}\n\n${url}` : tekst,
    link_preview_options: { is_disabled: true },
    ...(knop ? { reply_markup: { inline_keyboard: [[{ text: "Openen in Jandra", url }]] } } : {}),
  });
}
