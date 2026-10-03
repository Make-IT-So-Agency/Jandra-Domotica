import { NextResponse } from "next/server";

import { huisVoorRoute } from "@/lib/bouw/huistoegang";
import { id as leesId } from "@/lib/bouw/invoer";
import { maakOpleverPdf } from "@/lib/bouw/oplevering-pdf";
import { laadOpleverlijst } from "@/lib/bouw/werf-laden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De opleverpunten van één aannemer als PDF, met per punt een foto. */
export async function GET(request: Request, { params }: { params: Promise<{ partij: string }> }) {
  const niet = () => NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const toegang = await huisVoorRoute(request);
  if (!toegang) return niet();
  const partijId = leesId((await params).partij);
  const lijst = partijId ? await laadOpleverlijst(toegang.huis, partijId) : null;
  if (!lijst) return niet();
  const pdf = await maakOpleverPdf(lijst);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Opleverpunten.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
