import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { isVak } from "@/lib/bouw/punten";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { maakWensenlijstExcel } from "@/lib/bouw/wensenlijst-bestanden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als Excel, met de aantallen als echte getallen. */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { huis } = toegang;
  const gevraagd = new URL(request.url).searchParams.get("vak");
  const vak = isVak(gevraagd) ? gevraagd : "elektriciteit";
  const { lijst, project } = await laadWensenlijst(huis, vak);
  const excel = await maakWensenlijstExcel(lijst, project, new Date(), vak);
  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Wensenlijst-${vak}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
