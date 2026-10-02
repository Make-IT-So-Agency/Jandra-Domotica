import { NextResponse } from "next/server";

import { maakGeldExcel } from "@/lib/bouw/geld-excel";
import { laadGeld } from "@/lib/bouw/geld-laden";
import { vandaag } from "@/lib/bouw/kalender";
import { bouwgebruiker } from "@/lib/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Het geld van de bouw als Excel: posten, offertes, meerwerken, facturen, kasplanning en krediet. */
export async function GET() {
  if (!(await bouwgebruiker())) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const dag = vandaag();
  const excel = await maakGeldExcel(await laadGeld(), dag);
  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Bouw-geld-${dag}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
