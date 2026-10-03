import { NextResponse } from "next/server";

import { maakGeldExcel } from "@/lib/bouw/geld-excel";
import { laadGeld } from "@/lib/bouw/geld-laden";
import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { vandaag } from "@/lib/bouw/kalender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Het geld van de bouw als Excel: posten, offertes, meerwerken, facturen, kasplanning en krediet. */
export async function GET(request: Request) {
  const toegang = await huisVoorRoute(request);
  if (!toegang) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { huis } = toegang;
  const dag = vandaag();
  const excel = await maakGeldExcel(await laadGeld(huis), dag);
  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Bouw-geld-${dag}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
