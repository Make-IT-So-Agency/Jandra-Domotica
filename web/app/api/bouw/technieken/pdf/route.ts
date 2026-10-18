import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { laadTechnieken } from "@/lib/bouw/technieken/laden";
import { maakTechniekenPdf } from "@/lib/bouw/technieken/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Het voorstel voor de technieken als PDF. Enkel voor wie Bouw mag zien; voor de rest bestaat het niet. */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { voorstel, invoer, project } = await laadTechnieken(toegang.huis);
  const pdf = await maakTechniekenPdf(voorstel, invoer, project);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Voorstel-elektriciteit.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
