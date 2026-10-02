import "server-only";

import { db } from "@/lib/supabase";

import { EMMER } from "./bestanden";

/**
 * De bestanden zelf, in de privé-bucket van Supabase Storage. Wat erover in de
 * databank staat, regelt opslag.ts.
 *
 * Bestanden gaan nooit door een functie op Vercel: die laat maar ongeveer
 * 4,5 MB per aanvraag door. De browser krijgt een ondertekende URL en praat
 * daarmee rechtstreeks met Storage, zonder Supabase-sleutel.
 */

function emmer() {
  return db().storage.from(EMMER);
}

export interface Uploadtoelating {
  signedUrl: string;
}

/** Een URL waarmee de browser één bestand op precies dit pad kan zetten, twee uur lang. */
export async function maakUploadUrl(pad: string): Promise<Uploadtoelating> {
  const { data, error } = await emmer().createSignedUploadUrl(pad);
  if (error || !data) throw new Error(`Upload voorbereiden mislukt: ${error?.message ?? "geen antwoord"}`);
  return { signedUrl: data.signedUrl };
}

export interface Objectinfo {
  grootte: number;
  type: string | null;
}

/** Wat Storage over het bestand weet, of null als het er (nog) niet staat. */
export async function bestandInfo(pad: string): Promise<Objectinfo | null> {
  const { data, error } = await emmer().info(pad);
  if (error || !data) return null;
  return { grootte: Number(data.size ?? 0), type: data.contentType ?? null };
}

/**
 * Een URL om het bestand te lezen, die na `seconden` vervalt. Met downloadNaam
 * slaat de browser het op onder die naam in plaats van het te tonen.
 */
export async function tijdelijkeUrl(pad: string, seconden: number, downloadNaam?: string): Promise<string> {
  const { data, error } = await emmer().createSignedUrl(
    pad,
    seconden,
    downloadNaam ? { download: downloadNaam } : undefined,
  );
  if (error || !data) throw new Error(`Bestand openen mislukt: ${error?.message ?? "geen antwoord"}`);
  return data.signedUrl;
}

/** De eerste bytes van een bestand, om na te kijken wat het echt is. */
export async function leesBegin(pad: string, aantal: number): Promise<Uint8Array> {
  const url = await tijdelijkeUrl(pad, 60);
  const antwoord = await fetch(url, { headers: { Range: `bytes=0-${aantal - 1}` }, cache: "no-store" });
  if (!antwoord.ok) throw new Error(`Bestand lezen mislukt (HTTP ${antwoord.status}).`);

  // Een server die Range negeert, stuurt alles: lees dan niet verder dan nodig.
  const lezer = antwoord.body?.getReader();
  if (!lezer) return new Uint8Array(await antwoord.arrayBuffer()).slice(0, aantal);
  const stukken: Uint8Array[] = [];
  let gelezen = 0;
  while (gelezen < aantal) {
    const { done, value } = await lezer.read();
    if (done || !value) break;
    stukken.push(value);
    gelezen += value.length;
  }
  await lezer.cancel().catch(() => undefined);

  const begin = new Uint8Array(Math.min(gelezen, aantal));
  let plaats = 0;
  for (const stuk of stukken) {
    const deel = stuk.subarray(0, begin.length - plaats);
    begin.set(deel, plaats);
    plaats += deel.length;
    if (plaats >= begin.length) break;
  }
  return begin;
}

/** Verwijdert bestanden. Altijd via de API: Supabase blokkeert DELETE op storage.objects in SQL. */
export async function verwijderUitOpslag(paden: string[]): Promise<void> {
  if (paden.length === 0) return;
  const { error } = await emmer().remove(paden);
  if (error) throw new Error(`Bestand verwijderen mislukt: ${error.message}`);
}
