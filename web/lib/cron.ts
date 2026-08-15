import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Vercel roept geplande taken aan met de CRON_SECRET als bearer-token.
 * Zonder geldig token antwoorden we met 401, zodat niemand anders de taak
 * kan starten.
 */
export function controleerCronSleutel(request: Request): NextResponse | null {
  const verwacht = process.env.CRON_SECRET;
  if (!verwacht) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is niet ingesteld op de server." },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const aangeboden = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  const a = Buffer.from(aangeboden);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "Geen toegang." }, { status: 401 });
  }
  return null;
}
