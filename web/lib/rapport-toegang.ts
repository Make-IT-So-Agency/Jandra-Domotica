import "server-only";

import { magVennootschapZien } from "./rollen";
import { db } from "./supabase";
import { huidigeGebruiker } from "./toegang";
import type { RapportMomentopname } from "./types";

export interface RapportAntwoord {
  status: number;
  fout?: string;
  rapport?: { referentie: string; momentopname: RapportMomentopname };
}

/**
 * Haalt een rapport op voor download, maar enkel als de aangemelde gebruiker
 * de bijhorende vennootschap mag zien.
 *
 * Een onbestaand rapport en een rapport van iemand anders geven allebei 404,
 * zodat je via de download-URL niet kan uitvissen welke rapporten er bestaan.
 */
export async function haalRapportVoorDownload(id: string): Promise<RapportAntwoord> {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) return { status: 401, fout: "Niet aangemeld." };

  const { data, error } = await db()
    .from("reports")
    .select("reference, snapshot, company_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return { status: 500, fout: error.message };
  if (!data) return { status: 404, fout: "Dit rapport bestaat niet." };

  if (!magVennootschapZien(gebruiker, String(data.company_id))) {
    return { status: 404, fout: "Dit rapport bestaat niet." };
  }

  return {
    status: 200,
    rapport: {
      referentie: String(data.reference),
      momentopname: data.snapshot as RapportMomentopname,
    },
  };
}
