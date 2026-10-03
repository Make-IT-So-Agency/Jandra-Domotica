import { NextResponse } from "next/server";

import { oudsteHuisId } from "@/lib/bouw/huizen";
import { VASTGOED, huispad } from "@/lib/bouw/paden";
import { magBouwZien } from "@/lib/rollen";
import { huidigeGebruiker } from "@/lib/toegang";

export const dynamic = "force-dynamic";

/**
 * De oude adressen van Bouw, uit Telegram of een bladwijzer. /bouw/telegram
 * gaat naar /vastgoed/telegram, de rest naar dezelfde pagina van het eerste
 * huis: de nieuwbouw, waar alles vroeger bij hoorde. Enkel voor wie Vastgoed
 * mag zien; de anderen gaan naar de start.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const naar = (pad: string) => NextResponse.redirect(new URL(pad, url.origin), 307);

  const gebruiker = await huidigeGebruiker().catch(() => null);
  if (!gebruiker || !magBouwZien(gebruiker)) return naar("/");

  // Wat na /bouw komt, zoals het gevraagd werd; het begint altijd met / of is leeg.
  const rest = url.pathname.replace(/^\/bouw/, "");
  if (rest === "/telegram" || rest.startsWith("/telegram/")) return naar(`${VASTGOED}${rest}${url.search}`);

  const huisId = await oudsteHuisId().catch(() => null);
  if (huisId === null) return naar(VASTGOED);
  return naar(`${huispad(huisId, rest)}${url.search}`);
}
