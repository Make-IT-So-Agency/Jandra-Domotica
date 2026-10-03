import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { maakWensenlijstPdf } from "@/lib/bouw/wensenlijst-bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als PDF. Enkel voor wie Bouw mag zien; voor de rest bestaat ze niet. */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { huis } = toegang;
  const { lijst, project } = await laadWensenlijst(huis);
  const pdf = await maakWensenlijstPdf(lijst, project);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Wensenlijst-elektriciteit.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
