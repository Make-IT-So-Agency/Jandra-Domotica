import { NextResponse } from "next/server";

import { controleerCronSleutel } from "@/lib/cron";
import { mailStaatAan } from "@/lib/mail";
import { kwartaalVan, lokaleOnderdelen, vorigePeriode } from "@/lib/periods";
import { verstuurRapport } from "@/lib/rapport-mail";
import { bereidRapportVoor, bewaarRapport } from "@/lib/reports";
import { db } from "@/lib/supabase";
import type { RapportMomentopname, Vennootschap } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Uitkomst {
  vennootschap: string;
  periode: string;
  status: "bewaard" | "overgeslagen" | "bestond al" | "mislukt";
  referentie?: string;
  reden?: string;
  /** Alleen bij een kwartaalrapport: wat er met de mail gebeurd is. */
  verstuurd_naar?: string;
  niet_verstuurd?: string;
}

/** Een rapport dat zojuist gemaakt is en nog verstuurd moet worden. */
interface NogTeVersturen {
  uitkomst: Uitkomst;
  id: string;
  referentie: string;
  vennootschapId: string;
}

/**
 * Maakt op de eerste van de maand het rapport van de afgelopen maand, en bij
 * de start van een nieuw kwartaal ook dat van het afgelopen kwartaal.
 *
 * Het kwartaalrapport gaat daarna per mail naar de vennootschap. Het
 * maandrapport niet: dat is er om zelf op te volgen, en een boekhouder die
 * per kwartaal afrekent zit niet te wachten op twaalf extra berichten per jaar.
 *
 * Er vertrekt alleen post voor rapporten die deze ronde zélf gemaakt zijn.
 * Bestond het rapport al, dan is het ergens anders vandaan gekomen en beslist
 * iemand zelf wat ermee gebeurt -- zo kan een nieuwe taak nooit een stapel
 * oude rapporten alsnog de deur uit sturen.
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
  const teVersturen: NogTeVersturen[] = [];

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
        const uitkomst: Uitkomst = {
          ...basis,
          status: "bewaard",
          referentie: bewaard.reference,
        };
        uitkomsten.push(uitkomst);

        if (periode.soort === "quarter") {
          teVersturen.push({
            uitkomst,
            id: bewaard.id,
            referentie: bewaard.reference,
            vennootschapId: vennootschap.id,
          });
        }
      } catch (fout) {
        uitkomsten.push({
          ...basis,
          status: "mislukt",
          reden: fout instanceof Error ? fout.message : "onbekende fout",
        });
      }
    }
  }

  await verstuurKwartaalrapporten(teVersturen);

  const { kwartaal, jaar } = kwartaalVan(nu);
  return NextResponse.json({
    ok: true,
    uitgevoerd_op: nu.toISOString(),
    lopend_kwartaal: `Q${kwartaal} ${jaar}`,
    versturen_staat_aan: mailStaatAan(),
    uitkomsten,
  });
}

/**
 * Verstuurt de zojuist gemaakte kwartaalrapporten, elk naar zijn vennootschap.
 *
 * Het resultaat wordt in de uitkomst van dat rapport geschreven, zodat het
 * antwoord per vennootschap toont wat er gebeurd is. Een mislukte verzending
 * blijft bij dat ene rapport: de andere gaan gewoon door, en het rapport zelf
 * staat al veilig in de app.
 */
async function verstuurKwartaalrapporten(lijst: NogTeVersturen[]): Promise<void> {
  if (lijst.length === 0) return;

  if (!mailStaatAan()) {
    for (const item of lijst) {
      item.uitkomst.niet_verstuurd =
        "versturen staat uit; RESEND_API_KEY of MAIL_AFZENDER ontbreekt";
    }
    return;
  }

  for (const item of lijst) {
    try {
      // De momentopname komt vers uit de databank en wordt niet opnieuw
      // berekend: de mail hoort exact hetzelfde document te bevatten als wat
      // je in de app downloadt, tot en met het tijdstip van opmaak.
      const { data, error } = await db()
        .from("reports")
        .select("snapshot, emailed_at")
        .eq("id", item.id)
        .single();
      if (error) throw new Error(error.message);

      // Tweede slot op de deur. Het eerste is dat we enkel pas gemaakte
      // rapporten versturen; dit vangt het geval dat er intussen toch al een
      // mail vertrokken is.
      if (data.emailed_at) {
        item.uitkomst.niet_verstuurd = "stond al als verstuurd genoteerd";
        continue;
      }

      // Het adres apart opvragen in plaats van met een koppeling in de vraag
      // hierboven: dat scheelt één manier waarop dit stuk stuk kan gaan, en
      // het is maar één extra vraag per rapport.
      const { data: vennootschap, error: adresFout } = await db()
        .from("companies")
        .select("email")
        .eq("id", item.vennootschapId)
        .maybeSingle();
      if (adresFout) throw new Error(adresFout.message);

      const resultaat = await verstuurRapport({
        id: item.id,
        referentie: item.referentie,
        momentopname: data.snapshot as RapportMomentopname,
        adres: (vennootschap?.email as string | null) ?? null,
      });

      if (resultaat.verstuurd) item.uitkomst.verstuurd_naar = resultaat.adres;
      else item.uitkomst.niet_verstuurd = resultaat.reden;
    } catch (fout) {
      item.uitkomst.niet_verstuurd =
        fout instanceof Error ? fout.message : "onbekende fout bij het versturen";
    }
  }
}
