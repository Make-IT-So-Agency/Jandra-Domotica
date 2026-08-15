"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { vereistAangemeld } from "@/auth";
import { leesInstellingen } from "@/lib/settings";
import { bevestigTarief, bewaarTarief, probeerAutomatischTarief } from "@/lib/tariffs";

function terug(soort: "goed" | "fout" | "info", melding: string): never {
  revalidatePath("/tarieven");
  revalidatePath("/");
  redirect(`/tarieven?soort=${soort}&melding=${encodeURIComponent(melding)}`);
}

export async function haalTariefAutomatischOp(formulier: FormData): Promise<void> {
  await vereistAangemeld();

  const jaar = Number(formulier.get("jaar"));
  const kwartaal = Number(formulier.get("kwartaal"));
  const instellingen = await leesInstellingen();

  if (!Number.isInteger(jaar) || !Number.isInteger(kwartaal)) {
    terug("fout", "Kies eerst een geldig kwartaal.");
  }

  let resultaat;
  try {
    resultaat = await probeerAutomatischTarief(instellingen.regio, jaar, kwartaal);
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Ophalen mislukt.");
  }

  if (!resultaat.tarief) {
    terug("fout", `${resultaat.melding} (Q${kwartaal} ${jaar})`);
  }
  terug(
    "info",
    `Q${kwartaal} ${jaar}: ${resultaat.tarief.eur_per_kwh} €/kWh gevonden. ${resultaat.melding}`,
  );
}

export async function bevestigTariefActie(formulier: FormData): Promise<void> {
  await vereistAangemeld();

  const id = String(formulier.get("id") ?? "");
  if (!id) terug("fout", "Onbekend tarief.");

  try {
    await bevestigTarief(id);
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Bevestigen mislukt.");
  }
  terug("goed", "Tarief bevestigd. Je kan nu rapporten maken voor dat kwartaal.");
}

export async function bewaarHandmatigTarief(formulier: FormData): Promise<void> {
  await vereistAangemeld();

  const jaar = Number(formulier.get("jaar"));
  const kwartaal = Number(formulier.get("kwartaal"));
  // Zowel "0,2809" als "0.2809" moet werken; de komma is hier de gewoonte.
  const bedrag = Number(String(formulier.get("eur_per_kwh") ?? "").replace(",", "."));
  const btwVoet = Number(String(formulier.get("btw_voet") ?? "6").replace(",", ".")) / 100;
  const inclusiefBtw = formulier.get("inclusief_btw") === "ja";
  const instellingen = await leesInstellingen();

  if (!Number.isInteger(jaar) || !Number.isInteger(kwartaal)) {
    terug("fout", "Kies een geldig kwartaal.");
  }
  if (!Number.isFinite(bedrag) || bedrag <= 0 || bedrag > 5) {
    terug("fout", "Vul een bedrag per kWh in, bijvoorbeeld 0,2809.");
  }
  if (!Number.isFinite(btwVoet) || btwVoet < 0 || btwVoet >= 1) {
    terug("fout", "Vul een btw-percentage in tussen 0 en 100.");
  }

  try {
    await bewaarTarief({
      regio: instellingen.regio,
      jaar,
      kwartaal,
      eur_per_kwh: bedrag,
      includes_vat: inclusiefBtw,
      vat_rate: btwVoet,
      source: "manual",
      note: String(formulier.get("notitie") ?? "").trim() || null,
      // Wie het zelf intikt, heeft het al nagekeken.
      bevestigd: true,
    });
  } catch (fout) {
    terug("fout", fout instanceof Error ? fout.message : "Bewaren mislukt.");
  }

  terug("goed", `Tarief voor Q${kwartaal} ${jaar} bewaard en bevestigd.`);
}
