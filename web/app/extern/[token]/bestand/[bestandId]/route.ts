import { NextResponse } from "next/server";

import { id } from "@/lib/bouw/invoer";
import { leesLink } from "@/lib/bouw/links";
import { leesBestand, lijstPlannen } from "@/lib/bouw/opslag";
import { tijdelijkeUrl } from "@/lib/bouw/opslagruimte";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een dossier openen via een link: naar een ondertekende URL van een minuut.
 * Enkel een bestand waar een planversie uit komt, en enkel met het recht om
 * de plannen te bekijken.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; bestandId: string }> }) {
  const { token, bestandId: ruw } = await params;
  const niet = () => NextResponse.json({ error: "Niet gevonden." }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const externe = await leesLink(token).catch(() => null);
  if (!externe || !externe.rechten.includes("plannen")) return niet();
  const bestandId = id(ruw);
  if (!bestandId) return niet();
  const plannen = await lijstPlannen();
  if (!plannen.some((plan) => plan.versies.some((versie) => versie.bestand_id === bestandId))) return niet();
  const bestand = await leesBestand(bestandId);
  if (!bestand || bestand.status !== "klaar") return niet();

  const url = await tijdelijkeUrl(bestand.pad, 60);
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
