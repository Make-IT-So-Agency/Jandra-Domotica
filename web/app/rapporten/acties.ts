"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mailStaatAan } from "@/lib/mail";
import { verstuurRapport } from "@/lib/rapport-mail";
import { bereidRapportVoor, bewaarRapport } from "@/lib/reports";
import { magVennootschapZien } from "@/lib/rollen";
import { db } from "@/lib/supabase";
import { vereistRapportenrechten } from "@/lib/toegang";
import type { RapportMomentopname } from "@/lib/types";

import { periodeUitFormulier } from "./periode";

export async function maakRapport(formulier: FormData): Promise<void> {
  const ik = await vereistRapportenrechten();
  const door = ik.email;

  const vennootschapId = String(formulier.get("vennootschap") ?? "");
  if (!vennootschapId) {
    redirect("/rapporten?soort=fout&melding=Kies+eerst+een+vennootschap.");
  }
  if (!magVennootschapZien(ik, vennootschapId)) {
    redirect(
      "/rapporten?soort=fout&melding=" +
        encodeURIComponent("Je hebt geen toegang tot deze vennootschap."),
    );
  }

  let referentie: string;
  try {
    const periode = periodeUitFormulier({
      periode: String(formulier.get("periode") ?? ""),
      soort: String(formulier.get("periodesoort") ?? ""),
      jaar: String(formulier.get("jaar") ?? ""),
      maand: String(formulier.get("maand") ?? ""),
      kwartaal: String(formulier.get("kwartaal") ?? ""),
      van: String(formulier.get("van") ?? ""),
      tot: String(formulier.get("tot") ?? ""),
    });

    const voorbereiding = await bereidRapportVoor(vennootschapId, periode);
    const bewaard = await bewaarRapport(voorbereiding, door);
    referentie = bewaard.reference;
  } catch (fout) {
    const boodschap = fout instanceof Error ? fout.message : "Rapport maken mislukt.";
    redirect(`/rapporten?soort=fout&melding=${encodeURIComponent(boodschap)}`);
  }

  revalidatePath("/rapporten");
  redirect(
    `/rapporten?soort=goed&melding=${encodeURIComponent(
      `Rapport ${referentie} is bewaard. Je kan het hieronder downloaden.`,
    )}`,
  );
}

export async function verwijderRapport(formulier: FormData): Promise<void> {
  await vereistRapportenrechten();

  const id = String(formulier.get("id") ?? "");
  if (!id) return;

  const { error } = await db().from("reports").delete().eq("id", id);
  if (error) {
    redirect(`/rapporten?soort=fout&melding=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/rapporten");
  redirect("/rapporten?soort=goed&melding=Rapport+verwijderd.");
}

/**
 * Verstuurt een bewaard rapport met de hand naar zijn vennootschap.
 *
 * Nodig omdat de automatische taak alleen verstuurt wat ze zelf die ronde
 * maakt. Een rapport waarvan het e-mailadres toen nog ontbrak, of dat naar een
 * verkeerd adres ging, zou anders nooit meer kunnen vertrekken.
 *
 * Opnieuw versturen mag: emailed_at wordt overschreven met het nieuwe tijdstip
 * en adres. Dat is ook het punt -- de knop heet niet voor niets "Opnieuw
 * versturen" zodra er al eens iets vertrokken is.
 */
export async function verstuurRapportNu(formulier: FormData): Promise<void> {
  const ik = await vereistRapportenrechten();

  const id = String(formulier.get("id") ?? "");
  if (!id) return;

  let melding: string;
  try {
    if (!mailStaatAan()) {
      throw new Error(
        "Versturen staat uit op de server: RESEND_API_KEY of MAIL_AFZENDER ontbreekt.",
      );
    }

    const { data, error } = await db()
      .from("reports")
      .select("reference, snapshot, company_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Dit rapport bestaat niet (meer).");

    // Dezelfde controle als bij het maken: wie de vennootschap niet mag zien,
    // mag haar ook geen post sturen.
    if (!magVennootschapZien(ik, String(data.company_id))) {
      throw new Error("Je hebt geen toegang tot deze vennootschap.");
    }

    const { data: vennootschap, error: adresFout } = await db()
      .from("companies")
      .select("email")
      .eq("id", data.company_id)
      .maybeSingle();
    if (adresFout) throw new Error(adresFout.message);

    const resultaat = await verstuurRapport({
      id,
      referentie: String(data.reference),
      momentopname: data.snapshot as RapportMomentopname,
      adres: (vennootschap?.email as string | null) ?? null,
    });

    if (!resultaat.verstuurd) throw new Error(`Niet verstuurd: ${resultaat.reden}`);
    melding = `${data.reference} is verstuurd naar ${resultaat.adres}.`;
  } catch (fout) {
    const boodschap = fout instanceof Error ? fout.message : "Versturen mislukt.";
    redirect(`/rapporten?soort=fout&melding=${encodeURIComponent(boodschap)}`);
  }

  revalidatePath("/rapporten");
  redirect(`/rapporten?soort=goed&melding=${encodeURIComponent(melding)}`);
}
