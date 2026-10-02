import { NextResponse } from "next/server";

import { dagelijkseRonde } from "@/lib/bouw/ronde";
import { appAdres, bouwBotToken } from "@/lib/bouw/telegram";
import { controleerCronSleutel } from "@/lib/cron";
import { verbergToken } from "@/lib/opvang/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De dagelijkse ronde van de bot van Bouw: herinneringen voor de deadlines
 * van de keuzes, wat morgen begint, een mijlpaal van vandaag, en op maandag
 * de week. Twee keer lopen kan geen kwaad: elke melding vertrekt maar één
 * keer (zie bouw_meldingen).
 */
export async function GET(request: Request) {
  const geweigerd = controleerCronSleutel(request);
  if (geweigerd) return geweigerd;

  let token = "";
  try {
    token = bouwBotToken();
    const verslag = await dagelijkseRonde(token, new Date(), appAdres(request));
    return NextResponse.json({ ok: true, ...verslag });
  } catch (fout) {
    return NextResponse.json({ ok: false, error: verbergToken(String(fout), token) }, { status: 500 });
  }
}
