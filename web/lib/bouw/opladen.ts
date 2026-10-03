import "server-only";

import { randomUUID } from "node:crypto";

import { controleerUpload, isJpegBegin, isPdfBegin, maakPad, maxVoor, type Aanbod, type Doel } from "./bestanden";
import {
  leesBestand,
  markeerKlaar,
  registreerBestand,
  verlatenUploads,
  verwijderBestandRij,
  wordtGebruikt,
} from "./opslag";
import { bestandInfo, leesBegin, maakUploadUrl, verwijderUitOpslag } from "./opslagruimte";
import { gelukt, mislukt, type Bestand, type Uitkomst } from "./types";

/**
 * Een bestand opladen gaat in drie stappen:
 *
 *   1. startUpload    de server controleert type en grootte, zet een rij op
 *                     "wacht" en geeft een ondertekende upload-URL
 *   2. de browser     zet het bestand met die URL rechtstreeks in Storage
 *   3. rondUploadAf   de server kijkt na of het er staat, hoe groot het is en
 *                     of het echt een PDF of JPEG is, en zet de rij op "klaar"
 *
 * Een upload die nooit afgerond wordt, blijft op "wacht" staan en wordt na
 * drie uur opgeruimd. De toelating zelf is twee uur geldig.
 *
 * Een bestand hoort bij het huis waarvoor het opgeladen werd.
 */

const VERLATEN_NA_MS = 3 * 60 * 60 * 1000;

export interface Gestart {
  bestandId: number;
  uploadUrl: string;
  contentType: string;
}

export async function startUpload(huisId: number, aanbod: Aanbod, doel: Doel, door: string): Promise<Uitkomst<Gestart>> {
  const controle = controleerUpload(aanbod, doel);
  if (!controle.ok) return mislukt(controle.melding);

  await ruimVerlatenUploadsOp().catch((fout) => {
    // Opruimen is een bijzaak: een upload mag daar nooit op mislukken.
    console.error("Bouw: verlaten uploads opruimen mislukt", fout instanceof Error ? fout.message : fout);
  });

  const bestand = await registreerBestand(huisId, {
    pad: maakPad(doel, randomUUID()),
    doel,
    oorspronkelijke_naam: aanbod.naam.slice(0, 255),
    mime_type: controle.contentType,
    grootte_bytes: aanbod.grootte,
    opgeladen_door: door,
  });

  try {
    const { signedUrl } = await maakUploadUrl(bestand.pad);
    return gelukt({ bestandId: bestand.id, uploadUrl: signedUrl, contentType: controle.contentType });
  } catch (fout) {
    await verwijderBestandRij(bestand.id).catch(() => undefined);
    return mislukt(fout instanceof Error ? fout.message : "Upload voorbereiden mislukt.");
  }
}

/** Haalt een bestand weg uit Storage en uit het register, zonder te klagen als het al weg is. */
async function gooiWeg(bestand: Bestand): Promise<void> {
  await verwijderUitOpslag([bestand.pad]).catch(() => undefined);
  await verwijderBestandRij(bestand.id).catch(() => undefined);
}

export async function rondUploadAf(huisId: number, bestandId: number): Promise<Uitkomst<Bestand>> {
  const bestand = await leesBestand(huisId, bestandId);
  if (!bestand) return mislukt("Dit bestand is niet (meer) gekend. Laad het opnieuw op.");
  if (bestand.status === "klaar") return gelukt(bestand);

  const info = await bestandInfo(bestand.pad);
  if (!info) return mislukt("Het bestand is niet aangekomen. Laad het opnieuw op.");

  if (info.grootte <= 0 || info.grootte > maxVoor(bestand.doel)) {
    await gooiWeg(bestand);
    return mislukt("Het bestand is leeg of te groot, en werd niet bewaard.");
  }

  if (bestand.mime_type === "application/pdf") {
    const begin = await leesBegin(bestand.pad, 1024);
    if (!isPdfBegin(begin)) {
      await gooiWeg(bestand);
      return mislukt("Dit bestand is geen PDF, ook al heet het zo. Het werd niet bewaard.");
    }
  }
  if (bestand.mime_type === "image/jpeg") {
    if (!isJpegBegin(await leesBegin(bestand.pad, 3))) {
      await gooiWeg(bestand);
      return mislukt("Dit bestand is geen JPEG-foto. Het werd niet bewaard.");
    }
  }

  await markeerKlaar(bestand.id, info.grootte);
  return gelukt({ ...bestand, status: "klaar", grootte_bytes: info.grootte });
}

/** Ruimt bestanden van het huis op die geen versie of optie nog gebruikt, bv. na het verwijderen van een plan. */
export async function ruimOngebruikteBestandenOp(huisId: number, ids: number[]): Promise<void> {
  for (const bestandId of ids) {
    if (await wordtGebruikt(bestandId)) continue;
    const bestand = await leesBestand(huisId, bestandId);
    if (bestand) await gooiWeg(bestand);
  }
}

export async function ruimVerlatenUploadsOp(nu = new Date()): Promise<number> {
  const verlaten = await verlatenUploads(new Date(nu.getTime() - VERLATEN_NA_MS));
  for (const bestand of verlaten) await gooiWeg(bestand);
  return verlaten.length;
}
