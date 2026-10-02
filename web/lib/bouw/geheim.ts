import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Een geheim versleuteld in de databank bewaren, zoals het token van de bot
 * van Bouw: AES-256-GCM, met een sleutel die HKDF uit AUTH_SECRET afleidt,
 * met een eigen label per soort geheim. Een dump of back-up van de databank
 * alleen geeft het geheim dus niet prijs. Verandert AUTH_SECRET, dan is het
 * niet meer te lezen en moet het opnieuw ingevuld worden.
 *
 * Vorm: "v1:<iv>:<tag>:<versleuteld>", alle drie in base64url.
 */

const VERSIE = "v1";
const TAGLENGTE = 16;

function sleutel(label: string): Buffer {
  const geheim = process.env.AUTH_SECRET;
  if (!geheim) throw new Error("AUTH_SECRET is niet ingesteld op de server.");
  return Buffer.from(hkdfSync("sha256", geheim, "jandra-bouw", label, 32));
}

export function versleutel(tekst: string, label: string): string {
  const iv = randomBytes(12);
  const versleutelaar = createCipheriv("aes-256-gcm", sleutel(label), iv, { authTagLength: TAGLENGTE });
  const versleuteld = Buffer.concat([versleutelaar.update(tekst, "utf8"), versleutelaar.final()]);
  return [VERSIE, iv, versleutelaar.getAuthTag(), versleuteld].map((deel) => (typeof deel === "string" ? deel : deel.toString("base64url"))).join(":");
}

/** Null als het niet te lezen valt: geknoeid, een andere AUTH_SECRET, of een andere vorm. */
export function ontsleutel(waarde: string, label: string): string | null {
  const [versie, iv, tag, versleuteld, ...rest] = waarde.split(":");
  if (versie !== VERSIE || !iv || !tag || !versleuteld || rest.length > 0) return null;
  try {
    const ontsleutelaar = createDecipheriv("aes-256-gcm", sleutel(label), Buffer.from(iv, "base64url"), {
      authTagLength: TAGLENGTE,
    });
    ontsleutelaar.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([ontsleutelaar.update(Buffer.from(versleuteld, "base64url")), ontsleutelaar.final()]).toString("utf8");
  } catch {
    return null;
  }
}
