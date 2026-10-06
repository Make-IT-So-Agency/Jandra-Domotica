import { NextResponse } from "next/server";

import { rond } from "@/lib/bouw/drie/omgeving";
import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { haalLuchtfoto, Omgevingsfout, plaatsVanHuis } from "@/lib/bouw/omgeving-diensten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De luchtfoto rond een huis: 200 × 200 m rond het punt van het perceel of het adres (het kader uit
 * /api/bouw/omgeving), 2048 pixels, ongeveer 10 cm per pixel. Enkel voor wie
 * Bouw mag zien; de browser bewaart hem een dag, wij nergens.
 */
export async function GET(request: Request) {
  const niet = (melding: string, status: number) => NextResponse.json({ fout: melding }, { status, headers: { "Cache-Control": "no-store" } });
  const toegang = await huisVoorRoute(request);
  if (!toegang) return niet("Niet gevonden.", 404);
  try {
    const plaats = await plaatsVanHuis(toegang.huis);
    if (!plaats.punt) return niet(plaats.fout, 404);
    const beeld = await haalLuchtfoto(rond(plaats.punt));
    return new NextResponse(beeld, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch (fout) {
    const melding = fout instanceof Omgevingsfout ? fout.message : "De luchtfoto ophalen is mislukt.";
    console.error(`Luchtfoto van huis ${toegang.huis.id}: ${melding}`);
    return niet(melding, 502);
  }
}
