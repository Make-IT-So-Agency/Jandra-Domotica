"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { vereistHoofdbeheerder } from "@/lib/toegang";
import { bewaarInstellingen, leesInstellingen } from "@/lib/settings";

export async function bewaarInstellingenActie(formulier: FormData): Promise<void> {
  await vereistHoofdbeheerder();

  const huidig = await leesInstellingen();
  const tekst = (naam: string): string => String(formulier.get(naam) ?? "").trim();

  const bronUrl = tekst("tarief_bron_url") || huidig.tarief_bron_url;
  if (!/^https?:\/\//i.test(bronUrl)) {
    redirect(
      "/instellingen?soort=fout&melding=" +
        encodeURIComponent("De bron-URL moet met http:// of https:// beginnen."),
    );
  }

  await bewaarInstellingen({
    begunstigde: {
      naam: tekst("naam"),
      adres: tekst("adres"),
      email: tekst("email"),
      rekeningnummer: tekst("rekeningnummer"),
      btw_nummer: tekst("btw_nummer"),
    },
    regio: tekst("regio") || huidig.regio,
    tarief_bron_url: bronUrl,
  });

  revalidatePath("/instellingen");
  revalidatePath("/");
  redirect("/instellingen?soort=goed&melding=Instellingen+bewaard.");
}
