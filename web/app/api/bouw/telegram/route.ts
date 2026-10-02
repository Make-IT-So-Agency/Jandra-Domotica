import { NextResponse } from "next/server";

import { verwerkBouwbericht } from "@/lib/bouw/bot";
import { appAdres, bouwGeheimKlopt } from "@/lib/bouw/telegram";
import { leesBottoken } from "@/lib/bouw/telegram-koppeling";
import type { Bouwbericht } from "@/lib/bouw/telegramregels";
import { verbergToken, type Update } from "@/lib/opvang/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De webhook van de bot van Bouw. Staat buiten de Google-login (zie
 * middleware.ts); het geheim in de header is hier de beveiliging. Het token
 * staat versleuteld in de databank: eerst de vorm van de header nakijken,
 * zodat een willekeurige aanroep de databank niet raakt.
 */
export async function POST(request: Request) {
  const geheim = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(geheim)) {
    return NextResponse.json({ ok: false, error: "Geen toegang." }, { status: 401 });
  }
  const token = await leesBottoken().catch(() => null);
  if (!token) {
    return NextResponse.json({ ok: false, error: "De bot van Bouw is niet gekoppeld." }, { status: 503 });
  }
  if (!bouwGeheimKlopt(geheim, token)) {
    return NextResponse.json({ ok: false, error: "Geen toegang." }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  try {
    if (update?.message) await verwerkBouwbericht(update.message as Bouwbericht, token, appAdres(request));
  } catch (fout) {
    // Toch 200: anders blijft Telegram dezelfde update opnieuw sturen, en een
    // fout die bij de eerste keer optreedt, treedt de tiende keer ook op.
    console.error("Bouw-bot: update niet verwerkt:", verbergToken(String(fout), token));
  }
  return NextResponse.json({ ok: true });
}
