import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { fotosVanPagina, fotosoortVan } from "@/lib/bouw/materiaal-pagina";
import { Ophaalfout, haalOp } from "@/lib/bouw/ophalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een pagina van hoogstens 3 MB lezen we; een productpagina is zelden groter. */
const MAX_PAGINA = 3 * 1024 * 1024;

/**
 * De foto's van een site, voor een materiaal: de server haalt de pagina op
 * (enkel van het openbare internet, zie lib/bouw/ophalen.ts) en geeft de
 * naam van het product en de adressen van de foto's. Is het adres zelf een
 * foto, dan enkel die. Enkel voor wie Bouw mag zien.
 */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const adres = new URL(request.url).searchParams.get("url") ?? "";
  try {
    const pagina = await haalOp(adres, { maxBytes: MAX_PAGINA });
    if (pagina.type.startsWith("image/") || fotosoortVan(pagina.inhoud) !== null) {
      return NextResponse.json({ titel: null, fotos: [pagina.url] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!pagina.type.includes("html")) return NextResponse.json({ error: "Dit is geen pagina en geen foto." }, { status: 422 });
    const { titel, fotos } = fotosVanPagina(pagina.inhoud.toString("utf8"), pagina.url);
    return NextResponse.json({ titel, fotos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (fout) {
    const melding = fout instanceof Ophaalfout ? fout.message : "De site lezen is mislukt.";
    return NextResponse.json({ error: melding }, { status: 422 });
  }
}
