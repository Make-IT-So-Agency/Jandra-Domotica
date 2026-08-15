import { NextResponse } from "next/server";

import { controleerCronSleutel } from "@/lib/cron";
import { kwartaalVan } from "@/lib/periods";
import { leesInstellingen } from "@/lib/settings";
import { probeerAutomatischTarief } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zoekt het tarief van het lopende kwartaal op.
 *
 * Draait dagelijks: de overheid publiceert het cijfer soms pas enkele weken na
 * de start van het kwartaal. Zodra er een bevestigd tarief is, doet deze taak
 * niets meer voor dat kwartaal.
 */
export async function GET(request: Request) {
  const geweigerd = controleerCronSleutel(request);
  if (geweigerd) return geweigerd;

  try {
    const instellingen = await leesInstellingen();
    const { jaar, kwartaal } = kwartaalVan(new Date());
    const resultaat = await probeerAutomatischTarief(instellingen.regio, jaar, kwartaal);

    return NextResponse.json({
      ok: true,
      kwartaal: `Q${kwartaal} ${jaar}`,
      gevonden: resultaat.tarief?.eur_per_kwh ?? null,
      bevestigd: Boolean(resultaat.tarief?.confirmed_at),
      melding: resultaat.melding,
    });
  } catch (fout) {
    return NextResponse.json(
      { ok: false, error: fout instanceof Error ? fout.message : "onbekende fout" },
      { status: 500 },
    );
  }
}
