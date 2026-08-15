import { NextResponse } from "next/server";

import { controleerCronSleutel } from "@/lib/cron";
import { kwartaalVan, lokaleOnderdelen, vorigePeriode } from "@/lib/periods";
import { bereidRapportVoor, bewaarRapport } from "@/lib/reports";
import { db } from "@/lib/supabase";
import type { Vennootschap } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Uitkomst {
  vennootschap: string;
  periode: string;
  status: "bewaard" | "overgeslagen" | "bestond al" | "mislukt";
  referentie?: string;
  reden?: string;
}

/**
 * Maakt op de eerste van de maand het rapport van de afgelopen maand, en bij
 * de start van een nieuw kwartaal ook dat van het afgelopen kwartaal.
 *
 * Loopt er iets mis bij één vennootschap, dan gaat de rest gewoon door: het
 * antwoord vertelt per vennootschap wat er gebeurd is.
 */
export async function GET(request: Request) {
  const geweigerd = controleerCronSleutel(request);
  if (geweigerd) return geweigerd;

  const nu = new Date();
  const { maand } = lokaleOnderdelen(nu);

  const periodes = [vorigePeriode("month", nu)];
  // Een nieuw kwartaal begint in januari, april, juli en oktober.
  if ([1, 4, 7, 10].includes(maand)) {
    periodes.push(vorigePeriode("quarter", nu));
  }

  const { data, error } = await db()
    .from("companies")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const vennootschappen = (data ?? []) as Vennootschap[];
  const uitkomsten: Uitkomst[] = [];

  for (const periode of periodes) {
    for (const vennootschap of vennootschappen) {
      const basis = { vennootschap: vennootschap.name, periode: periode.label };

      // Niet twee keer hetzelfde rapport maken als de taak opnieuw draait.
      const { count } = await db()
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("company_id", vennootschap.id)
        .eq("period_start", periode.start)
        .eq("period_end", periode.eind);

      if ((count ?? 0) > 0) {
        uitkomsten.push({ ...basis, status: "bestond al" });
        continue;
      }

      try {
        const voorbereiding = await bereidRapportVoor(vennootschap.id, periode);
        if (voorbereiding.blokkades.length > 0) {
          uitkomsten.push({
            ...basis,
            status: "overgeslagen",
            reden: voorbereiding.blokkades.join(" "),
          });
          continue;
        }

        const bewaard = await bewaarRapport(voorbereiding, "automatische taak");
        uitkomsten.push({ ...basis, status: "bewaard", referentie: bewaard.reference });
      } catch (fout) {
        uitkomsten.push({
          ...basis,
          status: "mislukt",
          reden: fout instanceof Error ? fout.message : "onbekende fout",
        });
      }
    }
  }

  const { kwartaal, jaar } = kwartaalVan(nu);
  return NextResponse.json({
    ok: true,
    uitgevoerd_op: nu.toISOString(),
    lopend_kwartaal: `Q${kwartaal} ${jaar}`,
    uitkomsten,
  });
}
