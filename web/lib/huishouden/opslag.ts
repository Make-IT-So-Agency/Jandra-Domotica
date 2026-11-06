import "server-only";

import { db } from "@/lib/supabase";

import {
  FASES,
  FREQUENTIES,
  VERDELINGEN,
  isPersoon,
  type Fase,
  type Kaart,
  type Kaartinvoer,
  type Lijstakkoord,
  type Persoon,
  type Ronde,
} from "./balans";

/** De tabellen van Huishouden, zie supabase/migrations/20261106100000_huishouden.sql. */

interface KaartRij {
  id: number;
  titel: string;
  domein: string;
  omschrijving: string | null;
  goed_genoeg: string | null;
  frequentie: string;
  verdeling: string;
  vaste_uren: number | string | null;
  geschrapt: boolean;
  volgorde: number;
}

function naarKaart(rij: KaartRij): Kaart {
  const frequentie = (FREQUENTIES as readonly string[]).includes(rij.frequentie) ? rij.frequentie : "wekelijks";
  const verdeling = (VERDELINGEN as readonly string[]).includes(rij.verdeling) ? rij.verdeling : "spel";
  return {
    id: Number(rij.id),
    titel: rij.titel,
    domein: rij.domein,
    omschrijving: rij.omschrijving,
    goedGenoeg: rij.goed_genoeg,
    frequentie: frequentie as Kaart["frequentie"],
    verdeling: verdeling as Kaart["verdeling"],
    // Postgres geeft numeric als tekst terug.
    vasteUren: rij.vaste_uren === null ? null : Number(rij.vaste_uren),
    geschrapt: rij.geschrapt,
    volgorde: rij.volgorde,
  };
}

function naarRij(kaart: Kaartinvoer) {
  return {
    titel: kaart.titel,
    domein: kaart.domein,
    omschrijving: kaart.omschrijving,
    goed_genoeg: kaart.goedGenoeg,
    frequentie: kaart.frequentie,
    verdeling: kaart.verdeling,
    vaste_uren: kaart.vasteUren,
  };
}

/** De huidige ronde: die met het hoogste nummer. De eerste zet de migratie klaar. */
export async function huidigeRonde(): Promise<Ronde> {
  const { data, error } = await db()
    .from("huishouden_rondes")
    .select("id, fase, lijst_versie")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`De ronde lezen mislukt: ${error.message}`);
  if (!data) throw new Error("Er is nog geen ronde. Draai de databankmigraties.");
  const fase = (FASES as readonly string[]).includes(data.fase) ? (data.fase as Fase) : "lijst";
  return { id: Number(data.id), fase, lijstVersie: String(data.lijst_versie) };
}

export interface Balans {
  ronde: Ronde;
  kaarten: Kaart[];
  lijstakkoorden: Lijstakkoord[];
}

/** Alles wat de pagina nodig heeft, in één keer. */
export async function leesBalans(): Promise<Balans> {
  const ronde = await huidigeRonde();
  const [kaarten, akkoorden] = await Promise.all([
    db().from("huishouden_kaarten").select("*").order("volgorde").order("id"),
    db().from("huishouden_akkoorden").select("persoon, versie").eq("ronde_id", ronde.id).eq("soort", "lijst"),
  ]);
  if (kaarten.error) throw new Error(`De kaarten lezen mislukt: ${kaarten.error.message}`);
  if (akkoorden.error) throw new Error(`De akkoorden lezen mislukt: ${akkoorden.error.message}`);

  return {
    ronde,
    kaarten: ((kaarten.data ?? []) as KaartRij[]).map(naarKaart),
    lijstakkoorden: (akkoorden.data ?? [])
      .filter((rij) => isPersoon(rij.persoon))
      .map((rij) => ({ persoon: rij.persoon as Persoon, versie: rij.versie === null ? null : String(rij.versie) })),
  };
}

export async function telActieveKaarten(): Promise<number> {
  const { count, error } = await db()
    .from("huishouden_kaarten")
    .select("id", { count: "exact", head: true })
    .eq("geschrapt", false);
  if (error) throw new Error(`De kaarten tellen mislukt: ${error.message}`);
  return count ?? 0;
}

/**
 * Zet een nieuwe lijstversie: elke wijziging aan de lijst maakt de akkoorden
 * van allebei ongeldig, omdat die op een oudere versie slaan.
 */
async function lijstGewijzigd(ronde: Ronde): Promise<void> {
  const { error } = await db()
    .from("huishouden_rondes")
    .update({ lijst_versie: new Date().toISOString() })
    .eq("id", ronde.id);
  if (error) throw new Error(`De lijst bijwerken mislukt: ${error.message}`);
}

export async function voegKaartToe(ronde: Ronde, kaart: Kaartinvoer): Promise<void> {
  // Achteraan in de lijst. Voegen jullie tegelijk iets toe, dan krijgen twee
  // kaarten hetzelfde volgnummer; het nummer van de kaart beslist dan.
  const { data: laatste } = await db()
    .from("huishouden_kaarten")
    .select("volgorde")
    .order("volgorde", { ascending: false })
    .limit(1)
    .maybeSingle();
  const volgorde = (laatste?.volgorde ?? 0) + 1;

  const { error } = await db().from("huishouden_kaarten").insert({ ...naarRij(kaart), volgorde });
  if (error) throw new Error(`De kaart bewaren mislukt: ${error.message}`);
  await lijstGewijzigd(ronde);
}

/** Bestaat de kaart niet meer, dan gooit dit een fout: dan heeft de ander ze net verwijderd. */
async function werkKaartBij(ronde: Ronde, id: number, velden: Record<string, unknown>): Promise<void> {
  const { data, error } = await db()
    .from("huishouden_kaarten")
    .update({ ...velden, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`De kaart bewaren mislukt: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Deze kaart bestaat niet meer.");
  await lijstGewijzigd(ronde);
}

export async function wijzigKaart(ronde: Ronde, id: number, kaart: Kaartinvoer): Promise<void> {
  await werkKaartBij(ronde, id, naarRij(kaart));
}

export async function zetGeschrapt(ronde: Ronde, id: number, geschrapt: boolean): Promise<void> {
  await werkKaartBij(ronde, id, { geschrapt });
}

export async function verwijderKaart(ronde: Ronde, id: number): Promise<void> {
  const { error } = await db().from("huishouden_kaarten").delete().eq("id", id);
  if (error) throw new Error(`De kaart verwijderen mislukt: ${error.message}`);
  await lijstGewijzigd(ronde);
}

/** Je eigen akkoord met de lijst, voor de versie die je zag. Enkel je eigen rij: nooit die van de ander. */
export async function zetLijstakkoord(ronde: Ronde, persoon: Persoon, akkoord: boolean): Promise<void> {
  const tabel = db().from("huishouden_akkoorden");
  const { error } = akkoord
    ? await tabel.upsert(
        { ronde_id: ronde.id, persoon, soort: "lijst", versie: ronde.lijstVersie, gegeven_op: new Date().toISOString() },
        { onConflict: "ronde_id,persoon,soort" },
      )
    : await tabel.delete().eq("ronde_id", ronde.id).eq("persoon", persoon).eq("soort", "lijst");
  if (error) throw new Error(`Je akkoord bewaren mislukt: ${error.message}`);
}

/** Naar stap 2. Enkel als de ronde nog in stap 1 staat, zodat twee tikken tegelijk geen kwaad doen. */
export async function naarFase(ronde: Ronde, van: Fase, naar: Fase): Promise<void> {
  const { error } = await db().from("huishouden_rondes").update({ fase: naar }).eq("id", ronde.id).eq("fase", van);
  if (error) throw new Error(`Verder gaan mislukt: ${error.message}`);
}
