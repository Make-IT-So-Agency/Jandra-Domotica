import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { isVak } from "@/lib/bouw/punten";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { maakWensenlijstPdf } from "@/lib/bouw/wensenlijst-bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als PDF. Enkel voor wie Bouw mag zien; voor de rest bestaat ze niet. */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { huis } = toegang;
  const gevraagd = new URL(request.url).searchParams.get("vak");
  const vak = isVak(gevraagd) ? gevraagd : "elektriciteit";
  const { lijst, project } = await laadWensenlijst(huis, vak);
  const pdf = await maakWensenlijstPdf(lijst, project, new Date(), vak);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Wensenlijst-${vak}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
