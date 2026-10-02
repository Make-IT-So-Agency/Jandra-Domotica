import { NextResponse } from "next/server";

import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { maakWensenlijstExcel } from "@/lib/bouw/wensenlijst-bestanden";
import { bouwgebruiker } from "@/lib/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als Excel, met de aantallen als echte getallen. */
export async function GET() {
  if (!(await bouwgebruiker())) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { lijst, project } = await laadWensenlijst();
  const excel = await maakWensenlijstExcel(lijst, project);
  return new NextResponse(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Wensenlijst-elektriciteit.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
