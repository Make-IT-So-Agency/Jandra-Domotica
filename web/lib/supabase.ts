import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Verbinding met Supabase via de service-role sleutel.
 *
 * Die sleutel omzeilt Row Level Security en mag dus nooit in de browser
 * belanden. Het "server-only" importje hierboven laat de build falen als dit
 * bestand per ongeluk vanuit een clientcomponent gebruikt wordt.
 */
export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken. Vul ze in bij de " +
        "omgevingsvariabelen van je Vercel-project.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
