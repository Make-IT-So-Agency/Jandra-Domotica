import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SessieSchema = z.object({
  external_id: z.string().min(1),
  loadpoint: z.string().nullable().optional(),
  vehicle: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  energy_kwh: z.number().nullable().optional(),
  meter_start_kwh: z.number().nullable().optional(),
  meter_stop_kwh: z.number().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  solar_percentage: z.number().nullable().optional(),
  odometer_km: z.number().nullable().optional(),
  evcc_price_eur: z.number().nullable().optional(),
  evcc_price_per_kwh: z.number().nullable().optional(),
  is_complete: z.boolean().default(false),
});

const MeterSchema = z.object({
  loadpoint: z.string().min(1),
  reading_kwh: z.number(),
  read_at: z.string(),
});

const PayloadSchema = z.object({
  source: z.string().optional(),
  sent_at: z.string().optional(),
  installation_id: z.string().optional(),
  sessions: z.array(SessieSchema).max(20000),
  meters: z.array(MeterSchema).max(200).default([]),
});

/** Vergelijking die niet sneller stopt bij een vroege afwijking. */
function sleutelKlopt(aangeboden: string, verwacht: string): boolean {
  const a = Buffer.from(aangeboden);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function controleerSleutel(request: Request): NextResponse | null {
  const verwacht = process.env.INGEST_API_KEY;
  if (!verwacht) {
    return NextResponse.json(
      { ok: false, error: "INGEST_API_KEY is niet ingesteld op de server." },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const aangeboden = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!aangeboden || !sleutelKlopt(aangeboden, verwacht)) {
    return NextResponse.json({ ok: false, error: "Ongeldige API-sleutel." }, { status: 401 });
  }
  return null;
}

/** Home Assistant gebruikt dit om adres en sleutel te controleren. */
export async function GET(request: Request) {
  const geweigerd = controleerSleutel(request);
  if (geweigerd) return geweigerd;

  return NextResponse.json({ ok: true, service: "laadkosten", versie: 1 });
}

export async function POST(request: Request) {
  const geweigerd = controleerSleutel(request);
  if (geweigerd) return geweigerd;

  let payload: z.infer<typeof PayloadSchema>;
  try {
    payload = PayloadSchema.parse(await request.json());
  } catch (fout) {
    return NextResponse.json(
      {
        ok: false,
        error: `Onverwachte inhoud: ${fout instanceof Error ? fout.message : "onbekend"}`,
      },
      { status: 400 },
    );
  }

  const supabase = db();

  try {
    const rijen = payload.sessions.map((sessie) => ({
      external_id: sessie.external_id,
      loadpoint_name: sessie.loadpoint ?? null,
      vehicle: sessie.vehicle ?? null,
      started_at: sessie.started_at ?? null,
      finished_at: sessie.finished_at ?? null,
      energy_kwh: sessie.energy_kwh ?? null,
      meter_start_kwh: sessie.meter_start_kwh ?? null,
      meter_stop_kwh: sessie.meter_stop_kwh ?? null,
      duration_seconds: sessie.duration_seconds ?? null,
      solar_percentage: sessie.solar_percentage ?? null,
      odometer_km: sessie.odometer_km ?? null,
      evcc_price_eur: sessie.evcc_price_eur ?? null,
      evcc_price_per_kwh: sessie.evcc_price_per_kwh ?? null,
      is_complete: sessie.is_complete,
    }));

    // Vooraf tellen wat we al kenden, zodat de sensor in Home Assistant kan
    // tonen hoeveel er écht nieuw was.
    let bestaand = 0;
    for (const stuk of stukjes(rijen, 500)) {
      const { count, error } = await supabase
        .from("sessions")
        .select("external_id", { count: "exact", head: true })
        .in(
          "external_id",
          stuk.map((rij) => rij.external_id),
        );
      if (error) throw new Error(error.message);
      bestaand += count ?? 0;
    }

    for (const stuk of stukjes(rijen, 500)) {
      const { error } = await supabase
        .from("sessions")
        .upsert(stuk, { onConflict: "external_id" });
      if (error) throw new Error(error.message);
    }

    // Nieuwe laadpalen automatisch aanmaken, zodat ze meteen in de app staan
    // om aan een vennootschap te koppelen.
    await registreerNieuweLaadpalen(
      payload.sessions
        .map((sessie) => sessie.loadpoint)
        .filter((naam): naam is string => Boolean(naam && naam.trim())),
    );

    if (payload.meters.length > 0) {
      const { error } = await supabase.from("meter_readings").upsert(
        payload.meters.map((meter) => ({
          loadpoint_name: meter.loadpoint,
          reading_kwh: meter.reading_kwh,
          read_at: meter.read_at,
        })),
        { onConflict: "loadpoint_name,read_at", ignoreDuplicates: true },
      );
      // Dubbele meterstanden zijn onschadelijk; die mogen de synchronisatie
      // niet laten mislukken.
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    const nieuw = Math.max(rijen.length - bestaand, 0);
    await supabase.from("ingest_log").insert({
      installation_id: payload.installation_id ?? null,
      session_count: rijen.length,
      inserted_count: nieuw,
      updated_count: bestaand,
    });

    return NextResponse.json({
      ok: true,
      received: rijen.length,
      inserted: nieuw,
      updated: bestaand,
    });
  } catch (fout) {
    const boodschap = fout instanceof Error ? fout.message : "onbekende fout";
    await supabase.from("ingest_log").insert({
      installation_id: payload.installation_id ?? null,
      session_count: payload.sessions.length,
      error: boodschap,
    });
    return NextResponse.json({ ok: false, error: boodschap }, { status: 500 });
  }
}

async function registreerNieuweLaadpalen(namen: string[]): Promise<void> {
  const uniek = [...new Set(namen.map((naam) => naam.trim()))];
  if (uniek.length === 0) return;

  const supabase = db();
  const { data, error } = await supabase.from("loadpoints").select("name");
  if (error) throw new Error(error.message);

  const gekend = new Set((data ?? []).map((rij) => String(rij.name).toLowerCase()));
  const ontbrekend = uniek.filter((naam) => !gekend.has(naam.toLowerCase()));
  if (ontbrekend.length === 0) return;

  const { error: invoegFout } = await supabase
    .from("loadpoints")
    .insert(ontbrekend.map((naam) => ({ name: naam })));

  // Een gelijktijdige synchronisatie kan dezelfde paal net hebben aangemaakt.
  if (invoegFout && invoegFout.code !== "23505") throw new Error(invoegFout.message);
}

function* stukjes<T>(lijst: T[], grootte: number): Generator<T[]> {
  for (let index = 0; index < lijst.length; index += grootte) {
    yield lijst.slice(index, index + grootte);
  }
}
