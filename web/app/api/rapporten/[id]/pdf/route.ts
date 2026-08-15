import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { maakRapportPdf } from "@/lib/pdf";
import { db } from "@/lib/supabase";
import type { RapportMomentopname } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessie = await auth();
  if (!sessie?.user) {
    return NextResponse.json({ error: "Niet aangemeld." }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await db()
    .from("reports")
    .select("reference, snapshot")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Dit rapport bestaat niet." }, { status: 404 });
  }

  const pdf = await maakRapportPdf(
    data.snapshot as RapportMomentopname,
    data.reference as string,
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Laadkosten-${data.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
