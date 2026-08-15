import "server-only";

import { db } from "./supabase";
import type { Instellingen } from "./types";

const SLEUTEL = "algemeen";

export const STANDAARD_INSTELLINGEN: Instellingen = {
  begunstigde: {
    naam: "",
    adres: "",
    email: "",
    rekeningnummer: "",
    btw_nummer: "",
  },
  regio: "vlaanderen",
  // Startpunt voor de automatische tariefophaling. Aanpasbaar in de app, want
  // de overheid verhuist zo'n pagina wel eens.
  tarief_bron_url:
    "https://financien.belgium.be/nl/ondernemingen/personeel_en_loon/voordelen_van_alle_aard/elektriciteit-laadpaal",
};

export async function leesInstellingen(): Promise<Instellingen> {
  const { data, error } = await db()
    .from("app_settings")
    .select("value")
    .eq("key", SLEUTEL)
    .maybeSingle();

  if (error) throw new Error(`Instellingen lezen mislukt: ${error.message}`);
  if (!data?.value) return STANDAARD_INSTELLINGEN;

  const opgeslagen = data.value as Partial<Instellingen>;
  return {
    ...STANDAARD_INSTELLINGEN,
    ...opgeslagen,
    begunstigde: {
      ...STANDAARD_INSTELLINGEN.begunstigde,
      ...(opgeslagen.begunstigde ?? {}),
    },
  };
}

export async function bewaarInstellingen(waarden: Instellingen): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: SLEUTEL, value: waarden, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Instellingen bewaren mislukt: ${error.message}`);
}
