import "server-only";

import { headers } from "next/headers";

/**
 * Het adres van de webapp, voor een link die de deur uit gaat: AUTH_URL als
 * die ingesteld is (productie), anders het adres waarop deze aanvraag
 * binnenkwam.
 */
export async function adresVanApp(): Promise<string> {
  const ingesteld = process.env.AUTH_URL?.trim().replace(/\/+$/, "");
  if (ingesteld) return ingesteld;
  const kop = await headers();
  const host = kop.get("x-forwarded-host") ?? kop.get("host") ?? "localhost:3000";
  const protocol = kop.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
