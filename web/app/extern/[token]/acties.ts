"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adresVanApp } from "@/lib/bouw/adres";
import { leesbareGrootte } from "@/lib/bouw/bestanden";
import { euroBedrag } from "@/lib/bouw/geld";
import { id, tekst } from "@/lib/bouw/invoer";
import { korteDatum, vandaag } from "@/lib/bouw/kalender";
import {
  DOEL_VOOR_INZENDING,
  MAX_INZENDINGEN_PER_DAG,
  RECHT_VOOR_INZENDING,
  controleerGeldvelden,
  isSoortInzending,
  type Geldvelden,
  type Inzendgegevens,
  type SoortInzending,
} from "@/lib/bouw/linkregels";
import { doorLink, leesLink, telUploadsVanLink, voegInzendingToe } from "@/lib/bouw/links";
import { rondUploadAf, ruimOngebruikteBestandenOp, startUpload, type Gestart } from "@/lib/bouw/opladen";
import { leesBestand } from "@/lib/bouw/opslag";
import { leesInstelling } from "@/lib/bouw/regie-opslag";
import { CHAT_SLEUTEL } from "@/lib/bouw/ronde";
import { leesBottoken } from "@/lib/bouw/telegram-koppeling";
import { stuurBouwbericht } from "@/lib/bouw/telegram";
import { gelukt, mislukt, type Uitkomst } from "@/lib/bouw/types";
import { pasStapToe } from "@/lib/bouw/werf";
import { laadPlaatsen, ruimtenaamIn } from "@/lib/bouw/werf-laden";
import { leesOpleverpunt, zetOpleverstap } from "@/lib/bouw/werf-opslag";
import { verbergToken } from "@/lib/opvang/telegram";

/**
 * Wat een partij via haar link kan doen. Elke actie kijkt het token zelf
 * opnieuw na: een serveractie is van buitenaf aan te roepen, los van de
 * pagina die ze toont.
 */

const ONGELDIG = "Deze link werkt niet (meer). Vraag een nieuwe aan.";

/** Een plan of dossier, tenzij er uitdrukkelijk een offerte of factuur gevraagd wordt. */
function soortVan(waarde: unknown): SoortInzending | null {
  if (waarde === undefined || waarde === null || waarde === "") return "plan";
  const soort = String(waarde);
  return isSoortInzending(soort) ? soort : null;
}

/** Stap 1: mag deze link dit insturen, klopt wat erbij ingevuld is, en is het een PDF van een redelijke grootte? */
export async function startInzendingActie(
  token: string,
  aanbod: { naam: string; type: string; grootte: number; soort?: string; velden?: Geldvelden },
): Promise<Uitkomst<Gestart>> {
  const soort = soortVan(aanbod?.soort);
  const externe = await leesLink(String(token ?? "")).catch(() => null);
  if (!soort || !externe || !externe.rechten.includes(RECHT_VOOR_INZENDING[soort])) return mislukt(ONGELDIG);

  // Eerst de velden: een fout bedrag hoort niet pas na het opladen te blijken.
  const velden = controleerGeldvelden(soort, aanbod?.velden);
  if (!velden.ok) return velden;

  const etmaal = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await telUploadsVanLink(externe.linkId, etmaal)) >= MAX_INZENDINGEN_PER_DAG) {
    return mislukt(`Je stuurde vandaag al ${MAX_INZENDINGEN_PER_DAG} bestanden. Probeer het morgen opnieuw.`);
  }
  return startUpload(
    { naam: String(aanbod?.naam ?? ""), type: String(aanbod?.type ?? ""), grootte: Number(aanbod?.grootte) },
    DOEL_VOOR_INZENDING[soort],
    doorLink(externe.linkId),
  );
}

/** Stap 3: het bestand nakijken, bewaren als inzending, en Jan en Sandra verwittigen. */
export async function rondInzendingAfActie(
  token: string,
  vraag: { bestandId: number; opmerking: string; soort?: string; velden?: Geldvelden },
): Promise<Uitkomst<null>> {
  const soort = soortVan(vraag?.soort);
  const externe = await leesLink(String(token ?? "")).catch(() => null);
  if (!soort || !externe || !externe.rechten.includes(RECHT_VOOR_INZENDING[soort])) return mislukt(ONGELDIG);
  const bestandId = id(String(vraag?.bestandId));
  if (!bestandId) return mislukt("Onbekend bestand.");

  // Enkel een bestand dat deze link zelf begon op te laden, voor deze soort.
  const bestand = await leesBestand(bestandId);
  if (!bestand || bestand.opgeladen_door !== doorLink(externe.linkId) || bestand.doel !== DOEL_VOOR_INZENDING[soort]) {
    return mislukt("Onbekend bestand.");
  }
  const velden = controleerGeldvelden(soort, vraag?.velden);
  if (!velden.ok) return velden;
  const opmerking = tekst(String(vraag?.opmerking ?? "").slice(0, 1000));

  try {
    const afgerond = await rondUploadAf(bestandId);
    if (!afgerond.ok) return afgerond;
    await voegInzendingToe({ linkId: externe.linkId, partijId: externe.partijId, bestandId, opmerking, soort, ...velden.waarde });
  } catch {
    await ruimOngebruikteBestandenOp([bestandId]).catch(() => undefined);
    return mislukt("Het bestand bewaren is mislukt. Probeer het opnieuw.");
  }

  await verwittig(
    `📥 ${externe.partijnaam} ${watIngestuurd(soort, velden.waarde, bestand.oorspronkelijke_naam, bestand.grootte_bytes ?? 0)}.${opmerking ? `\n\n"${opmerking}"` : ""}`,
    soort === "plan" ? "/bouw/plannen#inzendingen" : "/bouw/geld#inzendingen",
  );
  revalidatePath(`/extern/${token}`);
  revalidatePath(soort === "plan" ? "/bouw/plannen" : "/bouw/geld");
  return gelukt(null);
}

/** "stuurde dossier.pdf in (12 MB)", "stuurde een offerte in: € 12.100,00", "stuurde factuur F-12 in: € 2.420,00, te betalen tegen 4 nov". */
function watIngestuurd(soort: SoortInzending, gegevens: Inzendgegevens, naam: string, grootte: number): string {
  if (soort === "plan") return `stuurde ${naam} in (${leesbareGrootte(grootte)})`;
  const bedrag = gegevens.bedrag === null ? "" : `: ${euroBedrag(gegevens.bedrag)}`;
  if (soort === "offerte") return `stuurde een offerte in${bedrag}`;
  return `stuurde ${gegevens.nummer ? `factuur ${gegevens.nummer}` : "een factuur"} in${bedrag}${
    gegevens.vervaldag ? `, te betalen tegen ${korteDatum(gegevens.vervaldag, vandaag())}` : ""
  }`;
}

/** Via de bot van Bouw, als die er is. Een melding die niet vertrekt, mag de inzending niet tegenhouden. */
async function verwittig(tekstVanMelding: string, pad: string): Promise<void> {
  let token: string | null = null;
  try {
    token = await leesBottoken();
    if (!token) return;
    const chat = Number(await leesInstelling(CHAT_SLEUTEL));
    if (!Number.isSafeInteger(chat) || chat === 0) return;
    await stuurBouwbericht(token, chat, tekstVanMelding, `${await adresVanApp()}${pad}`);
  } catch (fout) {
    console.error("Bouw: melding van een inzending niet verstuurd:", verbergToken(String(fout), token ?? ""));
  }
}

/**
 * De aannemer meldt dat een opleverpunt hersteld is. Daarmee is het nog niet
 * af: wij kijken het na. Voor een formulier op zijn linkpagina, met het token
 * vooraf gebonden.
 */
export async function meldHersteldActie(token: string, formulier: FormData): Promise<void> {
  const pagina = `/extern/${token}`;
  // Een gewone functie, geen pijl: enkel zo snapt TypeScript dat hierna niets meer volgt.
  function naar(soort: "goed" | "fout", melding: string): never {
    revalidatePath(pagina);
    redirect(`${pagina}?soort=${soort}&melding=${encodeURIComponent(melding)}`);
  }
  const externe = await leesLink(String(token ?? "")).catch(() => null);
  if (!externe || !externe.rechten.includes("oplevering")) naar("fout", ONGELDIG);
  const puntId = id(formulier.get("punt_id"));
  const punt = puntId ? await leesOpleverpunt(puntId) : null;
  // Enkel een punt van deze partij.
  if (!punt || punt.partij_id !== externe.partijId) naar("fout", "Dit punt bestaat niet (meer).");
  const opmerking = tekst(String(formulier.get("opmerking") ?? "").slice(0, 1000));
  const stap = pasStapToe(punt, "hersteld", "aannemer", externe.partijnaam, new Date(), opmerking);
  if (!stap.ok) naar("fout", "Dit punt staat al als hersteld, of is al nagekeken.");
  let bewaard = false;
  try {
    bewaard = await zetOpleverstap(punt.id, punt.status, stap.waarde);
  } catch {
    naar("fout", "Bewaren mislukt. Probeer het opnieuw.");
  }
  if (!bewaard) naar("fout", "Dit punt werd net aangepast. Kijk het opnieuw na.");

  const waar = await laadPlaatsen()
    .then((plaatsen) => ruimtenaamIn(plaatsen)(punt.ruimte_id))
    .catch(() => null);
  await verwittig(
    `🔧 ${externe.partijnaam} meldt hersteld: ${punt.titel}${waar ? ` (${waar})` : ""}.${opmerking ? `\n\n"${opmerking}"` : ""}\n\nKijk het na voor je het afvinkt.`,
    `/bouw/werf/oplevering?partij=${externe.partijId}`,
  );
  revalidatePath("/bouw/werf/oplevering");
  naar("goed", `Dank je. "${punt.titel}" staat als hersteld; wij kijken het na.`);
}
