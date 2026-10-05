import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { haalOmgeving, Omgevingsfout, plaatsVanHuis } from "@/lib/bouw/omgeving-diensten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De omgeving van een huis voor het 3D-scherm: het punt van het perceel of
 * het adres, de percelen en de gebouwen binnen 100 m, uit het GRB van
 * Digitaal Vlaanderen. Enkel voor wie Bouw mag zien. Geen adres en geen
 * perceelnummers in het antwoord, en niets in de logs dat het huis aanwijst.
 * De browser mag het een dag bewaren.
 */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ fout: "Niet gevonden." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const plaats = await plaatsVanHuis(toegang.huis);
    if (!plaats.punt) return NextResponse.json({ fout: plaats.fout }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const omgeving = await haalOmgeving(plaats.punt);
    return NextResponse.json(omgeving, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (fout) {
    const melding = fout instanceof Omgevingsfout ? fout.message : "De omgeving ophalen is mislukt.";
    console.error(`Omgeving van huis ${toegang.huis.id}: ${melding}`);
    return NextResponse.json({ fout: melding }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
