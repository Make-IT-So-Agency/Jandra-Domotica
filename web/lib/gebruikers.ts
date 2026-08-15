import "server-only";

import { normaliseerEmail, type Gebruiker, type Rol } from "./rollen";
import { db } from "./supabase";

/**
 * Adressen uit TOEGELATEN_EMAILS zijn altijd hoofdbeheerder, wat er ook in de
 * databank staat. Dat is de noodingang: je kan jezelf via de app nooit
 * buitensluiten, en bij een lege databank geraakt de eerste persoon binnen.
 */
export function vasteBeheerders(): string[] {
  return (process.env.TOEGELATEN_EMAILS ?? "")
    .split(",")
    .map(normaliseerEmail)
    .filter(Boolean);
}

interface GebruikerRij {
  id: string;
  email: string;
  name: string | null;
  role: Rol;
  company_id: string | null;
  invited_by: string | null;
  invited_at: string;
  last_login_at: string | null;
  is_active: boolean;
}

function naarGebruiker(rij: GebruikerRij, vast: boolean): Gebruiker {
  return {
    id: rij.id,
    email: rij.email,
    naam: rij.name,
    // Een vast beheerder blijft hoofdbeheerder, ook als de rij iets anders zegt.
    rol: vast ? "hoofdbeheerder" : rij.role,
    vennootschap_id: vast ? null : rij.company_id,
    vasteBeheerder: vast,
  };
}

/** Zoekt de gebruiker op. Geeft null als het adres geen toegang heeft. */
export async function zoekGebruiker(email: string): Promise<Gebruiker | null> {
  const adres = normaliseerEmail(email);
  if (!adres) return null;

  const vast = vasteBeheerders().includes(adres);

  const { data, error } = await db()
    .from("app_users")
    .select("*")
    .eq("email", adres)
    .maybeSingle();

  if (error) throw new Error(`Gebruiker opzoeken mislukt: ${error.message}`);

  if (data) {
    const rij = data as GebruikerRij;
    if (!vast && !rij.is_active) return null;
    return naarGebruiker(rij, vast);
  }

  if (!vast) return null;

  // Vaste beheerder die nog geen rij heeft: die bestaat, ook zonder databank.
  return {
    id: `vast:${adres}`,
    email: adres,
    naam: null,
    rol: "hoofdbeheerder",
    vennootschap_id: null,
    vasteBeheerder: true,
  };
}

/** Mag dit adres binnen? Gebruikt tijdens het aanmelden. */
export async function magAanmelden(email: string): Promise<boolean> {
  const adres = normaliseerEmail(email);
  if (!adres) return false;
  if (vasteBeheerders().includes(adres)) return true;

  try {
    return (await zoekGebruiker(adres)) !== null;
  } catch {
    // Is de databank onbereikbaar, dan laten we niemand binnen behalve de
    // vaste beheerders hierboven. Liever een geweigerde aanmelding dan een
    // open deur.
    return false;
  }
}

/** Houdt bij wanneer iemand laatst binnenkwam, en vult de naam aan. */
export async function registreerAanmelding(email: string, naam?: string | null): Promise<void> {
  const adres = normaliseerEmail(email);
  if (!adres) return;

  const nu = new Date().toISOString();
  const vast = vasteBeheerders().includes(adres);

  try {
    const { data } = await db()
      .from("app_users")
      .select("id, name")
      .eq("email", adres)
      .maybeSingle();

    if (data) {
      await db()
        .from("app_users")
        .update({ last_login_at: nu, name: naam ?? data.name })
        .eq("id", data.id);
      return;
    }

    if (vast) {
      // Zet de vaste beheerder ook echt in de lijst, zodat hij zichtbaar is
      // op de pagina Gebruikers.
      await db().from("app_users").insert({
        email: adres,
        name: naam ?? null,
        role: "hoofdbeheerder",
        company_id: null,
        invited_by: "TOEGELATEN_EMAILS",
        last_login_at: nu,
      });
    }
  } catch {
    // Aanmelden mag nooit stuklopen op deze bijkomstigheid.
  }
}

export interface GebruikerMetVennootschap extends Gebruiker {
  vennootschap_naam: string | null;
  laatste_aanmelding: string | null;
  uitgenodigd_door: string | null;
  actief: boolean;
}

export async function lijstGebruikers(
  beperktTot: string[] | null,
): Promise<GebruikerMetVennootschap[]> {
  let query = db()
    .from("app_users")
    .select("*, companies(name)")
    .order("role")
    .order("email");

  if (beperktTot !== null) {
    if (beperktTot.length === 0) return [];
    query = query.in("company_id", beperktTot);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Gebruikers lezen mislukt: ${error.message}`);

  const vast = vasteBeheerders();
  return (data ?? []).map((rij) => {
    const gebruiker = rij as unknown as GebruikerRij & { companies: { name: string } | null };
    const isVast = vast.includes(normaliseerEmail(gebruiker.email));
    return {
      ...naarGebruiker(gebruiker, isVast),
      vennootschap_naam: gebruiker.companies?.name ?? null,
      laatste_aanmelding: gebruiker.last_login_at,
      uitgenodigd_door: gebruiker.invited_by,
      actief: gebruiker.is_active,
    };
  });
}

export async function zoekGebruikerOpId(id: string): Promise<Gebruiker | null> {
  const { data, error } = await db()
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Gebruiker opzoeken mislukt: ${error.message}`);
  if (!data) return null;

  const rij = data as GebruikerRij;
  return naarGebruiker(rij, vasteBeheerders().includes(normaliseerEmail(rij.email)));
}

/**
 * Hoeveel mensen kunnen er nog aan de instellingen?
 *
 * Vaste beheerders tellen mee, ook als ze nog geen rij hebben: hun toegang
 * hangt aan de omgevingsvariabele, niet aan de databank.
 */
export async function telHoofdbeheerders(): Promise<number> {
  const { data, error } = await db()
    .from("app_users")
    .select("email")
    .eq("role", "hoofdbeheerder")
    .eq("is_active", true);

  if (error) throw new Error(`Hoofdbeheerders tellen mislukt: ${error.message}`);

  const adressen = new Set(vasteBeheerders());
  for (const rij of data ?? []) adressen.add(normaliseerEmail(String(rij.email)));
  return adressen.size;
}

export interface NieuweGebruiker {
  email: string;
  rol: Rol;
  vennootschap_id: string | null;
  uitgenodigd_door: string;
}

export async function voegGebruikerToe(nieuw: NieuweGebruiker): Promise<void> {
  const { error } = await db().from("app_users").insert({
    email: normaliseerEmail(nieuw.email),
    role: nieuw.rol,
    company_id: nieuw.vennootschap_id,
    invited_by: nieuw.uitgenodigd_door,
  });

  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Dit e-mailadres heeft al toegang."
        : `Toevoegen mislukt: ${error.message}`,
    );
  }
}

export async function wijzigGebruiker(
  id: string,
  rol: Rol,
  vennootschapId: string | null,
): Promise<void> {
  const { error } = await db()
    .from("app_users")
    .update({ role: rol, company_id: rol === "hoofdbeheerder" ? null : vennootschapId })
    .eq("id", id);

  if (error) throw new Error(`Wijzigen mislukt: ${error.message}`);
}

export async function verwijderGebruiker(id: string): Promise<void> {
  const { error } = await db().from("app_users").delete().eq("id", id);
  if (error) throw new Error(`Verwijderen mislukt: ${error.message}`);
}
