import { NextResponse } from "next/server";

import { bouwBotToken, bouwWebhookGeheim } from "@/lib/bouw/telegram";
import { roepAan, verbergToken } from "@/lib/opvang/telegram";
import { toegelatenIds } from "@/lib/opvang/toegang";
import { bouwgebruiker } from "@/lib/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Koppelt de webhook van de bot van Bouw aan deze app en toont wat Telegram
 * daarna zelf over de webhook zegt. Veilig om opnieuw te openen. Enkel voor
 * wie Bouw mag zien, en er komt geen token of geheim in het antwoord.
 */
export async function GET(request: Request) {
  if (!(await bouwgebruiker())) {
    return NextResponse.json({ ok: false, error: "Enkel voor de hoofdbeheerder." }, { status: 403 });
  }

  let token = "";
  try {
    token = bouwBotToken();
    const webhookUrl = `${new URL(request.url).origin}/api/bouw/telegram`;
    await roepAan(token, "setWebhook", {
      url: webhookUrl,
      secret_token: bouwWebhookGeheim(token),
      allowed_updates: ["message"],
    });
    await roepAan(token, "setMyCommands", {
      commands: [
        { command: "week", description: "Wat er deze en volgende week gebeurt" },
        { command: "deadlines", description: "Welke keuzes nog open staan" },
        { command: "facturen", description: "Welke facturen nog betaald moeten worden" },
        { command: "taken", description: "Wat er in de app nog te doen is" },
        { command: "hier", description: "Stuur herinneringen naar deze chat" },
        { command: "id", description: "Je Telegram-id" },
      ],
    });
    const info = await roepAan<Record<string, unknown>>(token, "getWebhookInfo");
    const bot = await roepAan<{ username: string }>(token, "getMe");
    return NextResponse.json({
      ok: true,
      bot: bot.username,
      webhook: info.url,
      wachtende_updates: info.pending_update_count,
      laatste_fout: info.last_error_message ?? null,
      toegelaten_ids_ingesteld: toegelatenIds(process.env.BOUW_TOEGELATEN_TELEGRAM_IDS).size,
    });
  } catch (fout) {
    return NextResponse.json({ ok: false, error: verbergToken(String(fout), token) }, { status: 502 });
  }
}
