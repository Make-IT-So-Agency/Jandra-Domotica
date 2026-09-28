/** Wat de Worker van Cloudflare meekrijgt. Beide staan daar als secret. */
export interface Env {
  /** Het token van Opvang_bot, van BotFather. Komt nooit in code of logs. */
  TELEGRAM_BOT_TOKEN: string;
  /**
   * Telegram-id's die de bot mogen gebruiken, gescheiden door komma's.
   * Gebruikers-id's (Jan, Sandra) en, zodra die bestaat, de id van de
   * gezamenlijke groep. Leeg of niet ingesteld: niemand heeft toegang.
   */
  TOEGELATEN_TELEGRAM_IDS?: string;
}
