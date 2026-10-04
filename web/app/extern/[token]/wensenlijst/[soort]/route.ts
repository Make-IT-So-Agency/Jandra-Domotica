import { NextResponse } from "next/server";

import { leesHuis } from "@/lib/bouw/huizen";
import { leesLink } from "@/lib/bouw/links";
import { isVak } from "@/lib/bouw/punten";
import { maakWensenlijstExcel, maakWensenlijstPdf } from "@/lib/bouw/wensenlijst-bestanden";
import { laadWensenlijst } from "@/lib/bouw/wensenlijst-laden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De wensenlijst als PDF of Excel, voor wie een link met dat recht heeft. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; soort: string }> }) {
  const { token, soort } = await params;
  const externe = await leesLink(token).catch(() => null);
  // De wensenlijst van het huis van deze link, van geen ander.
  const huis = externe ? await leesHuis(externe.huisId) : null;
  if (!externe || !huis || !externe.rechten.includes("wensenlijst") || (soort !== "pdf" && soort !== "excel")) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const gevraagd = new URL(request.url).searchParams.get("vak");
  const vak = isVak(gevraagd) ? gevraagd : "elektriciteit";
  const { lijst, project } = await laadWensenlijst(huis, vak);
  const pdf = soort === "pdf";
  const inhoud = pdf ? await maakWensenlijstPdf(lijst, project, new Date(), vak) : await maakWensenlijstExcel(lijst, project, new Date(), vak);
  return new NextResponse(new Uint8Array(inhoud), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Wensenlijst-${vak}.${pdf ? "pdf" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
