"use server";

import { revalidatePath } from "next/cache";

import { vereistHoofdbeheerder } from "@/lib/toegang";
import { db } from "@/lib/supabase";

function tekst(waarde: FormDataEntryValue | null): string | null {
  const schoon = String(waarde ?? "").trim();
  return schoon.length > 0 ? schoon : null;
}

export async function voegVennootschapToe(formulier: FormData): Promise<void> {
  await vereistHoofdbeheerder();

  const naam = tekst(formulier.get("naam"));
  if (!naam) throw new Error("Vul een naam in.");

  const { error } = await db().from("companies").insert({
    name: naam,
    vat_number: tekst(formulier.get("btw_nummer")),
    address: tekst(formulier.get("adres")),
    email: tekst(formulier.get("email")),
  });

  if (error) {
    throw new Error(
      error.code === "23505"
        ? `Er bestaat al een vennootschap met de naam ${naam}.`
        : `Toevoegen mislukt: ${error.message}`,
    );
  }

  revalidatePath("/vennootschappen");
  revalidatePath("/");
}

export async function bewerkVennootschap(formulier: FormData): Promise<void> {
  await vereistHoofdbeheerder();

  const id = String(formulier.get("id") ?? "");
  const naam = tekst(formulier.get("naam"));
  if (!id || !naam) throw new Error("Vul een naam in.");

  const { error } = await db()
    .from("companies")
    .update({
      name: naam,
      vat_number: tekst(formulier.get("btw_nummer")),
      address: tekst(formulier.get("adres")),
      email: tekst(formulier.get("email")),
    })
    .eq("id", id);

  if (error) throw new Error(`Bewaren mislukt: ${error.message}`);

  revalidatePath("/vennootschappen");
  revalidatePath("/");
}

export async function verwijderVennootschap(formulier: FormData): Promise<void> {
  await vereistHoofdbeheerder();

  const id = String(formulier.get("id") ?? "");
  if (!id) return;

  // Een vennootschap met rapporten mag niet zomaar weg: die rapporten zijn je
  // bewijsstuk. De databank ruimt ze anders mee op.
  const { count, error: telFout } = await db()
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);

  if (telFout) throw new Error(`Controle mislukt: ${telFout.message}`);
  if ((count ?? 0) > 0) {
    throw new Error(
      `Deze vennootschap heeft ${count} bewaard rapport(en). Verwijderen zou die weggooien.`,
    );
  }

  const { error } = await db().from("companies").delete().eq("id", id);
  if (error) throw new Error(`Verwijderen mislukt: ${error.message}`);

  revalidatePath("/vennootschappen");
  revalidatePath("/");
}
