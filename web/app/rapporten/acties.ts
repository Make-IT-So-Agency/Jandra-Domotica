"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { vereistAangemeld } from "@/auth";
import { bereidRapportVoor, bewaarRapport } from "@/lib/reports";
import { db } from "@/lib/supabase";

import { periodeUitFormulier } from "./periode";

export async function maakRapport(formulier: FormData): Promise<void> {
  const door = await vereistAangemeld();

  const vennootschapId = String(formulier.get("vennootschap") ?? "");
  if (!vennootschapId) {
    redirect("/rapporten?soort=fout&melding=Kies+eerst+een+vennootschap.");
  }

  let referentie: string;
  try {
    const periode = periodeUitFormulier({
      soort: String(formulier.get("periodesoort") ?? "month"),
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
  await vereistAangemeld();

  const id = String(formulier.get("id") ?? "");
  if (!id) return;

  const { error } = await db().from("reports").delete().eq("id", id);
  if (error) {
    redirect(`/rapporten?soort=fout&melding=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/rapporten");
  redirect("/rapporten?soort=goed&melding=Rapport+verwijderd.");
}
