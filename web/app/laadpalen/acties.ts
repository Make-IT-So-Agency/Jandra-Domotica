"use server";

import { revalidatePath } from "next/cache";

import { vereistHoofdbeheerder } from "@/lib/toegang";
import { db } from "@/lib/supabase";

/**
 * Koppelt elke laadpaal aan een vennootschap. Alles staat in één formulier,
 * zodat je in één keer kan opslaan in plaats van paal per paal.
 */
export async function bewaarKoppelingen(formulier: FormData): Promise<void> {
  await vereistHoofdbeheerder();

  const ids = formulier.getAll("laadpaal_id").map(String);
  const supabase = db();

  for (const id of ids) {
    const vennootschap = String(formulier.get(`vennootschap-${id}`) ?? "");
    const regio = String(formulier.get(`regio-${id}`) ?? "vlaanderen");
    const weergavenaam = String(formulier.get(`naam-${id}`) ?? "").trim();

    const { error } = await supabase
      .from("loadpoints")
      .update({
        company_id: vennootschap === "" ? null : vennootschap,
        region: regio,
        display_name: weergavenaam || null,
      })
      .eq("id", id);

    if (error) throw new Error(`Bewaren mislukt: ${error.message}`);
  }

  revalidatePath("/laadpalen");
  revalidatePath("/");
}
