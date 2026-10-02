/**
 * De regels voor bestanden van de module Bouw: wat mag erin, hoe groot, onder
 * welk pad. Puur, zodat de browser dezelfde controle kan doen vóór het opladen
 * als de server erna.
 */

/** De privé-bucket in Supabase Storage, zie de migratie van Bouw. */
export const EMMER = "bouw";

/** Zelfde limiet als de bucket, en als het gratis niveau van Supabase. */
export const MAX_GROOTTE = 50 * 1024 * 1024;

export const DOELEN = ["plan", "foto", "document"] as const;
export type Doel = (typeof DOELEN)[number];

/**
 * Een foto verkleint de browser eerst tot een JPEG van hoogstens 1600 pixels
 * (zie verklein.ts). Een origineel van een gsm komt hier dus nooit binnen.
 */
const TOEGELATEN: Record<Doel, { types: string[]; extensie: string; map: string; max: number }> = {
  plan: { types: ["application/pdf"], extensie: "pdf", map: "plannen", max: MAX_GROOTTE },
  foto: { types: ["image/jpeg"], extensie: "jpg", map: "fotos", max: 10 * 1024 * 1024 },
  /** Een offerte of factuur. */
  document: { types: ["application/pdf"], extensie: "pdf", map: "documenten", max: 20 * 1024 * 1024 },
};

export interface Aanbod {
  naam: string;
  type: string;
  grootte: number;
}

export type Controle = { ok: true; contentType: string } | { ok: false; melding: string };

export function isDoel(waarde: string): waarde is Doel {
  return (DOELEN as readonly string[]).includes(waarde);
}

/** Hoe groot een bestand voor dit doel mag zijn. Een onbekend doel krijgt de limiet van de bucket. */
export function maxVoor(doel: string): number {
  return isDoel(doel) ? TOEGELATEN[doel].max : MAX_GROOTTE;
}

/** "52,4 MB", "830 kB": voor meldingen en lijsten. */
export function leesbareGrootte(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("nl-BE", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("nl-BE")} kB`;
}

/**
 * Mag dit bestand erin? Sommige browsers geven bij een PDF geen type mee; dan
 * beslist de extensie. Het echte bewijs volgt na het opladen: de eerste bytes
 * moeten "%PDF-" bevatten (zie isPdfBegin).
 */
export function controleerUpload(aanbod: Aanbod, doel: Doel): Controle {
  const regel = TOEGELATEN[doel];

  if (!Number.isFinite(aanbod.grootte) || aanbod.grootte <= 0) {
    return { ok: false, melding: "Dit bestand is leeg." };
  }
  if (aanbod.grootte > regel.max) {
    return {
      ok: false,
      melding: `Dit bestand is ${leesbareGrootte(aanbod.grootte)}; meer dan ${leesbareGrootte(regel.max)} kan niet.`,
    };
  }

  const type = aanbod.type.trim().toLowerCase();
  const extensieKlopt = aanbod.naam.toLowerCase().endsWith(`.${regel.extensie}`);
  if (regel.types.includes(type)) return { ok: true, contentType: type };
  if ((type === "" || type === "application/octet-stream") && extensieKlopt) {
    return { ok: true, contentType: regel.types[0] };
  }
  return { ok: false, melding: `Enkel een ${regel.extensie.toUpperCase()}-bestand kan hier.` };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Het pad in de bucket. Nooit de oorspronkelijke naam: daar kan de straat in staan. */
export function maakPad(doel: Doel, uuid: string): string {
  if (!UUID.test(uuid)) throw new Error("Ongeldige UUID voor een bestandspad.");
  const regel = TOEGELATEN[doel];
  return `${regel.map}/${uuid}.${regel.extensie}`;
}

export function isGeldigPad(pad: string): boolean {
  return Object.values(TOEGELATEN).some(({ map, extensie }) => {
    const [eerste, tweede, ...rest] = pad.split("/");
    if (rest.length > 0 || eerste !== map || !tweede?.endsWith(`.${extensie}`)) return false;
    return UUID.test(tweede.slice(0, -(extensie.length + 1)));
  });
}

/**
 * Begint dit als een PDF? Volgens de standaard mag er nog wat vóór "%PDF-"
 * staan, binnen de eerste 1024 bytes.
 */
export function isPdfBegin(bytes: Uint8Array): boolean {
  const kop = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const grens = Math.min(bytes.length, 1024) - kop.length;
  for (let i = 0; i <= grens; i++) {
    if (kop.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** Begint dit als een JPEG? Dat is altijd FF D8 FF. */
export function isJpegBegin(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Wat Storage antwoordt bij een mislukte upload, in mensentaal. Storage geeft
 * een JSON met statusCode, error en message; we kijken naar de HTTP-status en
 * de tekst.
 */
export function vertaalOpslagfout(status: number, inhoud: string): string {
  const tekst = inhoud.toLowerCase();
  if (status === 413 || tekst.includes("payload too large") || tekst.includes("maximum allowed size")) {
    return `Het bestand is te groot. Meer dan ${leesbareGrootte(MAX_GROOTTE)} kan niet.`;
  }
  if (tekst.includes("mime") || tekst.includes("invalid_mime_type") || status === 415) {
    return "Dit soort bestand wordt niet aanvaard.";
  }
  if (tekst.includes("expired") || tekst.includes("signature") || tekst.includes("jwt") || status === 401 || status === 403) {
    return "De toelating om op te laden is verlopen. Probeer het opnieuw.";
  }
  if (status === 409 || tekst.includes("already exists")) {
    return "Dit bestand staat er al. Probeer het opnieuw.";
  }
  if (status === 0) return "Geen verbinding met de opslag. Controleer je internet en probeer opnieuw.";
  return `Opladen mislukt (HTTP ${status}).`;
}
