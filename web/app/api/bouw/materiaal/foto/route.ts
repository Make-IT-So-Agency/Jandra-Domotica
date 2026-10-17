import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { fotosoortVan } from "@/lib/bouw/materiaal-pagina";
import { Ophaalfout, haalOp } from "@/lib/bouw/ophalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FOTO = 15 * 1024 * 1024;

/**
 * Een foto van een andere site, via de app: zo komt ze van dezelfde plaats
 * als de app, en mag de browser haar pixels lezen (een staal herkennen, de
 * kleuren nemen) en ze verkleind opladen. Enkel JPEG, PNG, WebP en GIF,
 * nagekeken aan de eerste bytes; nooit een SVG of een pagina.
 */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const adres = new URL(request.url).searchParams.get("url") ?? "";
  try {
    const foto = await haalOp(adres, { maxBytes: MAX_FOTO });
    const soort = fotosoortVan(foto.inhoud);
    if (!soort) return NextResponse.json({ error: "Dit is geen foto (JPEG, PNG, WebP of GIF)." }, { status: 422 });
    return new NextResponse(new Uint8Array(foto.inhoud), {
      headers: {
        "Content-Type": soort,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (fout) {
    const melding = fout instanceof Ophaalfout ? fout.message : "De foto ophalen is mislukt.";
    return NextResponse.json({ error: melding }, { status: 422 });
  }
}
