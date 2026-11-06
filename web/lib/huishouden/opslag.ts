import "server-only";

import { db } from "@/lib/supabase";

import { isVerschuiving, type Verschuiving } from "./voorstel";
import {
  FASES,
  FREQUENTIES,
  LEGE_INVOER,
  PERSONEN,
  VERDELINGEN,
  isClaim,
  isPersoon,
  isScore,
  type Claim,
  type Invoer,
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
    .select("id, fase, lijst_versie, voorstel_versie")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`De ronde lezen mislukt: ${error.message}`);
  if (!data) throw new Error("Er is nog geen ronde. Draai de databankmigraties.");
  const fase = (FASES as readonly string[]).includes(data.fase) ? (data.fase as Fase) : "lijst";
  return {
    id: Number(data.id),
    fase,
    lijstVersie: String(data.lijst_versie),
    voorstelVersie: String(data.voorstel_versie),
  };
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

// --- Stap 2 -----------------------------------------------------------------

export interface Inschattingen {
  /** Per persoon: per kaart wat die invulde (claims van deze ronde, tijd en last over rondes heen). */
  invoer: Record<Persoon, Map<number, Invoer>>;
  beschikbareTijd: Record<Persoon, number | null>;
}

/** Alles van stap 2, van allebei. Wat de ander koos, gaat nooit zomaar naar de browser: zie de pagina. */
export async function leesInschattingen(ronde: Ronde): Promise<Inschattingen> {
  const [scores, claims, tijd] = await Promise.all([
    db().from("huishouden_inschattingen").select("persoon, kaart_id, tijd, last"),
    db().from("huishouden_claims").select("persoon, kaart_id, claim").eq("ronde_id", ronde.id),
    db().from("huishouden_tijd").select("persoon, uren"),
  ]);
  for (const resultaat of [scores, claims, tijd]) {
    if (resultaat.error) throw new Error(`De inschattingen lezen mislukt: ${resultaat.error.message}`);
  }

  const invoer: Record<Persoon, Map<number, Invoer>> = { jan: new Map(), sandra: new Map() };
  const vanKaart = (persoon: Persoon, kaartId: number) => {
    const bestaand = invoer[persoon].get(kaartId);
    if (bestaand) return bestaand;
    const nieuw = { ...LEGE_INVOER };
    invoer[persoon].set(kaartId, nieuw);
    return nieuw;
  };

  for (const rij of scores.data ?? []) {
    if (!isPersoon(rij.persoon)) continue;
    const kaart = vanKaart(rij.persoon, Number(rij.kaart_id));
    kaart.tijd = isScore(rij.tijd) ? rij.tijd : null;
    kaart.last = isScore(rij.last) ? rij.last : null;
  }
  for (const rij of claims.data ?? []) {
    if (!isPersoon(rij.persoon)) continue;
    vanKaart(rij.persoon, Number(rij.kaart_id)).claim = isClaim(rij.claim) ? rij.claim : null;
  }

  const beschikbareTijd: Record<Persoon, number | null> = { jan: null, sandra: null };
  for (const rij of tijd.data ?? []) {
    if (isPersoon(rij.persoon)) beschikbareTijd[rij.persoon] = Number(rij.uren);
  }
  return { invoer, beschikbareTijd };
}

export async function leesKaart(id: number): Promise<Kaart | null> {
  const { data, error } = await db().from("huishouden_kaarten").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`De kaart lezen mislukt: ${error.message}`);
  return data ? naarKaart(data as KaartRij) : null;
}

/** Eén score bewaren. Enkel die ene kolom, zodat een tik op tijd en een op last elkaar niet overschrijven. */
export async function zetScore(persoon: Persoon, kaartId: number, veld: "tijd" | "last", score: number): Promise<void> {
  const { error } = await db()
    .from("huishouden_inschattingen")
    .upsert(
      { persoon, kaart_id: kaartId, [veld]: score, gewijzigd_op: new Date().toISOString() },
      { onConflict: "persoon,kaart_id" },
    );
  if (error) throw new Error(`Je inschatting bewaren mislukt: ${error.message}`);
}

export async function zetClaim(ronde: Ronde, persoon: Persoon, kaartId: number, claim: Claim): Promise<void> {
  const { error } = await db()
    .from("huishouden_claims")
    .upsert(
      { ronde_id: ronde.id, persoon, kaart_id: kaartId, claim, gewijzigd_op: new Date().toISOString() },
      { onConflict: "ronde_id,persoon,kaart_id" },
    );
  if (error) throw new Error(`Je claim bewaren mislukt: ${error.message}`);
}

/** De beschikbare tijd; null wist ze ("nog niet ingevuld"). */
export async function zetBeschikbareTijd(persoon: Persoon, uren: number | null): Promise<void> {
  const tabel = db().from("huishouden_tijd");
  const { error } =
    uren === null
      ? await tabel.delete().eq("persoon", persoon)
      : await tabel.upsert({ persoon, uren, gewijzigd_op: new Date().toISOString() }, { onConflict: "persoon" });
  if (error) throw new Error(`Je beschikbare tijd bewaren mislukt: ${error.message}`);
}

/**
 * Alles resetten: de inschattingen, de beschikbare tijd en alles van de
 * ronde (claims, akkoorden, verschuivingen, de vastgelegde verdeling) weg, en
 * terug naar stap 1. De kaarten blijven.
 */
export async function allesResetten(ronde: Ronde): Promise<void> {
  const stappen = [
    db().from("huishouden_verdeling").delete().eq("ronde_id", ronde.id),
    db().from("huishouden_biedingen").delete().eq("ronde_id", ronde.id),
    db().from("huishouden_verschuivingen").delete().eq("ronde_id", ronde.id),
    db().from("huishouden_claims").delete().eq("ronde_id", ronde.id),
    db().from("huishouden_akkoorden").delete().eq("ronde_id", ronde.id),
    db().from("huishouden_inschattingen").delete().in("persoon", [...PERSONEN]),
    db().from("huishouden_tijd").delete().in("persoon", [...PERSONEN]),
  ];
  for (const stap of stappen) {
    const { error } = await stap;
    if (error) throw new Error(`Resetten mislukt: ${error.message}`);
  }
  const { error } = await db()
    .from("huishouden_rondes")
    .update({
      fase: "lijst",
      lijst_versie: new Date().toISOString(),
      voorstel_versie: new Date().toISOString(),
      vastgelegd_op: null,
    })
    .eq("id", ronde.id);
  if (error) throw new Error(`Resetten mislukt: ${error.message}`);
}

// --- Stap 4 en 5 -------------------------------------------------------------

/** De akkoorden van één soort in deze ronde, per persoon met hun versie. */
export async function leesAkkoorden(ronde: Ronde, soort: "lijst" | "bieden" | "voorstel"): Promise<Lijstakkoord[]> {
  const { data, error } = await db()
    .from("huishouden_akkoorden")
    .select("persoon, versie")
    .eq("ronde_id", ronde.id)
    .eq("soort", soort);
  if (error) throw new Error(`De akkoorden lezen mislukt: ${error.message}`);
  return (data ?? [])
    .filter((rij) => isPersoon(rij.persoon))
    .map((rij) => ({ persoon: rij.persoon as Persoon, versie: rij.versie === null ? null : String(rij.versie) }));
}

export async function leesVerschuivingen(ronde: Ronde): Promise<Map<number, Verschuiving>> {
  const { data, error } = await db().from("huishouden_verschuivingen").select("kaart_id, naar").eq("ronde_id", ronde.id);
  if (error) throw new Error(`De verschuivingen lezen mislukt: ${error.message}`);
  return new Map((data ?? []).filter((rij) => isVerschuiving(rij.naar)).map((rij) => [Number(rij.kaart_id), rij.naar as Verschuiving]));
}

/** De vastgelegde verdeling van deze ronde: per kaart via het spel de eigenaar. */
export async function leesVerdeling(ronde: Ronde): Promise<Map<number, Verschuiving>> {
  const { data, error } = await db().from("huishouden_verdeling").select("kaart_id, eigenaar").eq("ronde_id", ronde.id);
  if (error) throw new Error(`De verdeling lezen mislukt: ${error.message}`);
  return new Map(
    (data ?? []).filter((rij) => isVerschuiving(rij.eigenaar)).map((rij) => [Number(rij.kaart_id), rij.eigenaar as Verschuiving]),
  );
}

/**
 * Een nieuwe versie van het voorstel: na een verschuiving, of een gewijzigde
 * claim of inschatting. Daarmee telt "voelt goed" van allebei niet meer.
 */
export async function voorstelGewijzigd(ronde: Ronde): Promise<void> {
  const { error } = await db()
    .from("huishouden_rondes")
    .update({ voorstel_versie: new Date().toISOString() })
    .eq("id", ronde.id);
  if (error) throw new Error(`Het voorstel bijwerken mislukt: ${error.message}`);
}

/** Een kaart verschuiven; null haalt de verschuiving weg (terug naar het voorstel). */
export async function zetVerschuiving(ronde: Ronde, kaartId: number, naar: Verschuiving | null): Promise<void> {
  const tabel = db().from("huishouden_verschuivingen");
  const { error } =
    naar === null
      ? await tabel.delete().eq("ronde_id", ronde.id).eq("kaart_id", kaartId)
      : await tabel.upsert(
          { ronde_id: ronde.id, kaart_id: kaartId, naar, gewijzigd_op: new Date().toISOString() },
          { onConflict: "ronde_id,kaart_id" },
        );
  if (error) throw new Error(`Verschuiven mislukt: ${error.message}`);
  await voorstelGewijzigd(ronde);
}

export async function wisVerschuivingen(ronde: Ronde): Promise<void> {
  const { error } = await db().from("huishouden_verschuivingen").delete().eq("ronde_id", ronde.id);
  if (error) throw new Error(`Terugzetten mislukt: ${error.message}`);
  await voorstelGewijzigd(ronde);
}

/** "Dit voelt goed voor mij", voor de versie van het voorstel die je zag. Enkel je eigen rij. */
export async function zetVoeltGoed(ronde: Ronde, persoon: Persoon, akkoord: boolean): Promise<void> {
  const tabel = db().from("huishouden_akkoorden");
  const { error } = akkoord
    ? await tabel.upsert(
        { ronde_id: ronde.id, persoon, soort: "voorstel", versie: ronde.voorstelVersie, gegeven_op: new Date().toISOString() },
        { onConflict: "ronde_id,persoon,soort" },
      )
    : await tabel.delete().eq("ronde_id", ronde.id).eq("persoon", persoon).eq("soort", "voorstel");
  if (error) throw new Error(`Bewaren mislukt: ${error.message}`);
}

/**
 * De verdeling vastleggen en naar stap 5. Eerst de fase, enkel als die nog
 * "voorstel" is: zo legt een dubbele tik niets twee keer vast.
 */
export async function legVast(ronde: Ronde, verdeling: { kaartId: number; eigenaar: Verschuiving }[]): Promise<boolean> {
  const nu = new Date().toISOString();
  const { data, error } = await db()
    .from("huishouden_rondes")
    .update({ fase: "vastgelegd", vastgelegd_op: nu })
    .eq("id", ronde.id)
    .eq("fase", "voorstel")
    .select("id");
  if (error) throw new Error(`Vastleggen mislukt: ${error.message}`);
  if (!data || data.length === 0) return false;

  const verwijderd = await db().from("huishouden_verdeling").delete().eq("ronde_id", ronde.id);
  if (verwijderd.error) throw new Error(`Vastleggen mislukt: ${verwijderd.error.message}`);
  if (verdeling.length > 0) {
    const { error: fout } = await db()
      .from("huishouden_verdeling")
      .insert(verdeling.map(({ kaartId, eigenaar }) => ({ ronde_id: ronde.id, kaart_id: kaartId, eigenaar, vastgelegd_op: nu })));
    if (fout) throw new Error(`Vastleggen mislukt: ${fout.message}`);
  }
  return true;
}

// --- Stap 3 -------------------------------------------------------------------

/** De biedingen van allebei in deze ronde. Wat de ander bood, gaat nooit zomaar naar de browser. */
export async function leesBiedingen(ronde: Ronde): Promise<Record<Persoon, Map<number, number>>> {
  const { data, error } = await db().from("huishouden_biedingen").select("persoon, kaart_id, punten").eq("ronde_id", ronde.id);
  if (error) throw new Error(`De biedingen lezen mislukt: ${error.message}`);
  const biedingen: Record<Persoon, Map<number, number>> = { jan: new Map(), sandra: new Map() };
  for (const rij of data ?? []) {
    if (isPersoon(rij.persoon)) biedingen[rij.persoon].set(Number(rij.kaart_id), Number(rij.punten));
  }
  return biedingen;
}

export async function zetBod(ronde: Ronde, persoon: Persoon, kaartId: number, punten: number): Promise<void> {
  const { error } = await db()
    .from("huishouden_biedingen")
    .upsert(
      { ronde_id: ronde.id, persoon, kaart_id: kaartId, punten, gewijzigd_op: new Date().toISOString() },
      { onConflict: "ronde_id,persoon,kaart_id" },
    );
  if (error) throw new Error(`Je bod bewaren mislukt: ${error.message}`);
}

/** "Ik ben klaar" met bieden, of "Toch nog aanpassen". Enkel je eigen rij. */
export async function zetKlaarMetBieden(ronde: Ronde, persoon: Persoon, klaar: boolean): Promise<void> {
  const tabel = db().from("huishouden_akkoorden");
  const { error } = klaar
    ? await tabel.upsert(
        { ronde_id: ronde.id, persoon, soort: "bieden", versie: null, gegeven_op: new Date().toISOString() },
        { onConflict: "ronde_id,persoon,soort" },
      )
    : await tabel.delete().eq("ronde_id", ronde.id).eq("persoon", persoon).eq("soort", "bieden");
  if (error) throw new Error(`Bewaren mislukt: ${error.message}`);
}

/** "Klaar met bieden" van allebei weg: na een gewijzigde claim kan er een nieuwe botsing zijn. */
export async function wisKlaarMetBieden(ronde: Ronde): Promise<void> {
  const { error } = await db().from("huishouden_akkoorden").delete().eq("ronde_id", ronde.id).eq("soort", "bieden");
  if (error) throw new Error(`Bewaren mislukt: ${error.message}`);
}
