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
  // Het CSV-bestand achter de CREG-tabel met de maximumtarieven. Aanpasbaar in
  // de app: verhuist het bestand, dan zet je hier een ander adres. Wijst dit
  // naar een gewone webpagina, dan zoekt de app het bedrag in de tekst -- dat
  // lukt minder vaak, en de bron van de FOD staat achter een botcontrole.
  tarief_bron_url: "https://www.creg.be/sites/default/files/assets/Prices/CREG_Tariff_EV.csv",
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
