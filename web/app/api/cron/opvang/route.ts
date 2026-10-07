import { NextResponse } from "next/server";

import { controleerCronSleutel } from "@/lib/cron";
import { dagelijks } from "@/lib/opvang/menu";
import { botToken, verbergToken } from "@/lib/opvang/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De dagelijkse ronde van de opvang-bot: de volgende inschrijfronde
 * aanmaken, het keuzemenu sturen zodra de kalender gelezen is, herinneren
 * zolang het niet definitief is, en na de opening zeggen als er niet
 * ingeschreven werd.
 *
 * Vercel roept dit elke ochtend aan, en elke avond om 17:00 UTC: na de
 * opening van 18:00, in zomer- en wintertijd. Zo hoor je het dezelfde avond
 * als de workflow in GitHub niet startte. De workflow die de kalender van
 * i-Active leest, roept het ook aan (met ?vernieuw=1), zodat het menu meteen
 * komt en bestaande menu's de nieuwe tegels tonen. Twee keer lopen kan geen
 * kwaad: elke stap onthoudt dat ze al gebeurd is.
 */
export async function GET(request: Request) {
  const geweigerd = controleerCronSleutel(request);
  if (geweigerd) return geweigerd;

  let token = "";
  try {
    token = botToken();
    const vernieuw = new URL(request.url).searchParams.get("vernieuw") === "1";
    const gedaan = await dagelijks(token, new Date(), vernieuw);
    return NextResponse.json({ ok: true, gedaan });
  } catch (fout) {
    return NextResponse.json({ ok: false, error: verbergToken(String(fout), token) }, { status: 500 });
  }
}
