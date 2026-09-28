import { NextResponse } from "next/server";

import { verwerkBericht } from "@/lib/opvang/bot";
import { botToken, geheimKlopt, verbergToken, type Update } from "@/lib/opvang/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De webhook van Opvang_bot. Staat buiten de Google-login (zie
 * middleware.ts); het geheim in de header is hier de beveiliging.
 */
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Opvang-bot is niet ingesteld." }, { status: 503 });
  }
  if (!geheimKlopt(request.headers.get("x-telegram-bot-api-secret-token") ?? "", token)) {
    return NextResponse.json({ ok: false, error: "Geen toegang." }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  try {
    if (update?.message) await verwerkBericht(update.message, botToken());
  } catch (fout) {
    // Toch 200: anders blijft Telegram dezelfde update opnieuw sturen, en een
    // fout die bij de eerste keer optreedt, treedt de tiende keer ook op.
    console.error("Opvang-bot: update niet verwerkt:", verbergToken(String(fout), token));
  }
  return NextResponse.json({ ok: true });
}
