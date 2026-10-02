"use server";

import { revalidatePath } from "next/cache";

import { adresVanApp } from "@/lib/bouw/adres";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { id, tekst } from "@/lib/bouw/invoer";
import { MAX_INZENDINGEN_PER_DAG } from "@/lib/bouw/linkregels";
import { doorLink, leesLink, telUploadsVanLink, voegInzendingToe } from "@/lib/bouw/links";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { leesBestand } from "@/lib/bouw/opslag";
import { leesInstelling } from "@/lib/bouw/regie-opslag";
import { CHAT_SLEUTEL } from "@/lib/bouw/ronde";
import { stuurBouwbericht } from "@/lib/bouw/telegram";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { verbergToken } from "@/lib/opvang/telegram";

/**
 * Wat een partij via haar link kan doen. Elke actie kijkt het token zelf
 * opnieuw na: een serveractie is van buitenaf aan te roepen, los van de
 * pagina die ze toont.
 */

const ONGELDIG = "Deze link werkt niet (meer). Vraag een nieuwe aan.";

/** Stap 1: mag deze link nog iets insturen, en is het een PDF van een redelijke grootte? */
export async function startInzendingActie(
  token: string,
  aanbod: { naam: string; type: string; grootte: number },
): Promise<Uitkomst<Gestart>> {
  const externe = await leesLink(String(token ?? "")).catch(() => null);
  if (!externe || !externe.rechten.includes("inzenden")) return mislukt(ONGELDIG);

  const etmaal = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await telUploadsVanLink(externe.linkId, etmaal)) >= MAX_INZENDINGEN_PER_DAG) {
    return mislukt(`Je stuurde vandaag al ${MAX_INZENDINGEN_PER_DAG} bestanden. Probeer het morgen opnieuw.`);
  }
  return startUpload(
    { naam: String(aanbod?.naam ?? ""), type: String(aanbod?.type ?? ""), grootte: Number(aanbod?.grootte) },
    "plan",
    doorLink(externe.linkId),
  );
}

/** Stap 3: het bestand nakijken, bewaren als inzending, en Jan en Sandra verwittigen. */
export async function rondInzendingAfActie(token: string, vraag: { bestandId: number; opmerking: string }): Promise<Uitkomst<null>> {
  const externe = await leesLink(String(token ?? "")).catch(() => null);
  if (!externe || !externe.rechten.includes("inzenden")) return mislukt(ONGELDIG);
  const bestandId = id(String(vraag?.bestandId));
  if (!bestandId) return mislukt("Onbekend bestand.");

  // Enkel een bestand dat deze link zelf begon op te laden.
  const bestand = await leesBestand(bestandId);
  if (!bestand || bestand.opgeladen_door !== doorLink(externe.linkId)) return mislukt("Onbekend bestand.");
  const opmerking = tekst(String(vraag?.opmerking ?? "").slice(0, 1000));

  try {
    const afgerond = await rondUploadAf(bestandId);
    if (!afgerond.ok) return afgerond;
    await voegInzendingToe({ linkId: externe.linkId, partijId: externe.partijId, bestandId, opmerking });
  } catch {
    await ruimOngebruikteBestandenOp([bestandId]).catch(() => undefined);
    return mislukt("Het bestand bewaren is mislukt. Probeer het opnieuw.");
  }

  await verwittig(
    `📥 ${externe.partijnaam} stuurde ${bestand.oorspronkelijke_naam} in (${leesbareGrootte(bestand.grootte_bytes ?? 0)}).${opmerking ? `\n\n"${opmerking}"` : ""}`,
  );
  revalidatePath(`/extern/${token}`);
  revalidatePath("/bouw/plannen");
  return gelukt(null);
}

/** Via de bot van Bouw, als die er is. Een melding die niet vertrekt, mag de inzending niet tegenhouden. */
async function verwittig(tekstVanMelding: string): Promise<void> {
  const token = process.env.BOUW_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const chat = Number(await leesInstelling(CHAT_SLEUTEL));
    if (!Number.isSafeInteger(chat) || chat === 0) return;
    await stuurBouwbericht(token, chat, tekstVanMelding, `${await adresVanApp()}/bouw/plannen#inzendingen`);
  } catch (fout) {
    console.error("Bouw: melding van een inzending niet verstuurd:", verbergToken(String(fout), token));
  }
}
