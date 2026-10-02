import { NextResponse } from "next/server";

import { leesLink } from "@/lib/bouw/links";
import { maakWensenlijstExcel, maakWensenlijstPdf } from "@/lib/bouw/wensenlijst-bestanden";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als PDF of Excel, voor wie een link met dat recht heeft. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; soort: string }> }) {
  const { token, soort } = await params;
  const externe = await leesLink(token).catch(() => null);
  if (!externe || !externe.rechten.includes("wensenlijst") || (soort !== "pdf" && soort !== "excel")) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const { lijst, project } = await laadWensenlijst();
  const pdf = soort === "pdf";
  const inhoud = pdf ? await maakWensenlijstPdf(lijst, project) : await maakWensenlijstExcel(lijst, project);
  return new NextResponse(new Uint8Array(inhoud), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Wensenlijst-elektriciteit.${pdf ? "pdf" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
