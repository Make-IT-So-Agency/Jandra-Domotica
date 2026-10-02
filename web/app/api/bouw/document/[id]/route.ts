import { NextResponse } from "next/server";

import { id as leesId } from "@/lib/bouw/invoer";
import { leesBestand } from "@/lib/bouw/opslag";
import { tijdelijkeUrl } from "@/lib/bouw/opslagruimte";
import { bouwgebruiker } from "@/lib/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De PDF van een offerte of factuur openen: naar een ondertekende URL van een
 * minuut, zodat de browser hem zelf toont. Enkel voor wie Bouw mag zien, en
 * enkel een document, geen plan of foto.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const niet = () => NextResponse.json({ error: "Niet gevonden." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!(await bouwgebruiker())) return niet();

  const bestandId = leesId((await params).id);
  const bestand = bestandId ? await leesBestand(bestandId).catch(() => null) : null;
  if (!bestand || bestand.doel !== "document" || bestand.status !== "klaar") return niet();

  const url = await tijdelijkeUrl(bestand.pad, 60);
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
