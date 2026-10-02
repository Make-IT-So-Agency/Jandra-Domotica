import { NextResponse } from "next/server";

import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";
import { maakWensenlijstPdf } from "@/lib/bouw/wensenlijst-bestanden";
import { bouwgebruiker } from "@/lib/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als PDF. Enkel voor wie Bouw mag zien; voor de rest bestaat ze niet. */
export async function GET() {
  if (!(await bouwgebruiker())) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const { lijst, project } = await laadWensenlijst();
  const pdf = await maakWensenlijstPdf(lijst, project);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Wensenlijst-elektriciteit.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
