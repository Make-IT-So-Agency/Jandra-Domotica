import { NextResponse } from "next/server";

import { huidigeGebruiker } from "@/lib/toegang";
import { magInstellingenBeheren } from "@/lib/rollen";
import { toegelatenIds } from "@/lib/opvang/toegang";
import { botToken, roepAan, verbergToken, webhookGeheim } from "@/lib/opvang/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Koppelt de webhook van Opvang_bot aan deze app en toont wat Telegram daarna
 * zelf over de webhook zegt. Veilig om opnieuw te openen: het resultaat is
 * telkens hetzelfde. Enkel voor de hoofdbeheerder, en er komt geen token of
 * geheim in het antwoord.
 */
export async function GET(request: Request) {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker || !magInstellingenBeheren(gebruiker)) {
    return NextResponse.json({ ok: false, error: "Enkel voor de hoofdbeheerder." }, { status: 403 });
  }

  let token = "";
  try {
    token = botToken();
    const webhookUrl = `${new URL(request.url).origin}/api/telegram`;
    await roepAan(token, "setWebhook", {
      url: webhookUrl,
      secret_token: webhookGeheim(token),
      allowed_updates: ["message", "callback_query"],
    });
    const info = await roepAan<Record<string, unknown>>(token, "getWebhookInfo");
    const bot = await roepAan<{ username: string }>(token, "getMe");
    return NextResponse.json({
      ok: true,
      bot: bot.username,
      webhook: info.url,
      wachtende_updates: info.pending_update_count,
      laatste_fout: info.last_error_message ?? null,
      toegelaten_ids_ingesteld: toegelatenIds(process.env.TOEGELATEN_TELEGRAM_IDS).size,
    });
  } catch (fout) {
    return NextResponse.json({ ok: false, error: verbergToken(String(fout), token) }, { status: 502 });
  }
}
