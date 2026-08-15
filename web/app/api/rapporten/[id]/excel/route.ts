import { NextResponse } from "next/server";

import { maakRapportExcel } from "@/lib/excel";
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
  const werkmap = await maakRapportExcel(momentopname, referentie);

  return new NextResponse(new Uint8Array(werkmap), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Laadkosten-${referentie}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
