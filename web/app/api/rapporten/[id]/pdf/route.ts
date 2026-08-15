import { NextResponse } from "next/server";

import { maakRapportPdf } from "@/lib/pdf";
import { haalRapportVoorDownload } from "@/lib/rapport-toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resultaat = await haalRapportVoorDownload(id);

  if (!resultaat.rapport) {
    return NextResponse.json({ error: resultaat.fout }, { status: resultaat.status });
  }

  const { referentie, momentopname } = resultaat.rapport;
  const pdf = await maakRapportPdf(momentopname, referentie);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Laadkosten-${referentie}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
