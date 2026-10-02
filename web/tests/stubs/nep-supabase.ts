/**
 * Een kleine Supabase in het geheugen: net genoeg van de query-bouwer van
 * supabase-js voor wat lib/opvang/opslag.ts en lib/bouw/opslag.ts gebruiken.
 * Unieke sleutels per tabel bepalen wat een upsert overschrijft of overslaat,
 * en wanneer een insert faalt met 23505 zoals Postgres.
 *
 * Met `fouten` laat je een bewerking op een tabel mislukken, bv.
 * { "bouw_verdiepingen:delete": { code: "23503", message: "..." } } voor een
 * verdieping waar nog iets aan hangt.
 */

type Rij = Record<string, unknown>;

export interface NepFout {
  code: string;
  message: string;
}

const SLEUTELS: Record<string, string[]> = {
  opvang_instellingen: ["sleutel"],
  opvang_rondes: ["maand", "ronde"],
  opvang_keuzes: ["ronde_id", "slot_id"],
  opvang_menus: ["ronde_id", "kind_id"],
  opvang_kinderen: ["leerling_id"],
  opvang_slots: ["kind_id", "datum", "moment", "locatie"],
  bouw_instellingen: ["sleutel"],
  bouw_bestanden: ["pad"],
  bouw_verdiepingen: ["naam"],
  bouw_referentiepunten: ["code"],
  bouw_planversies: ["plan_id", "label"],
};

type Actie =
  | { soort: "select" }
  | { soort: "update"; waarden: Rij }
  | { soort: "delete" }
  | { soort: "insert"; nieuw: Rij[] }
  | { soort: "upsert"; nieuw: Rij[]; negeer: boolean };

export function nepSupabase(begin: Record<string, Rij[]> = {}, fouten: Record<string, NepFout> = {}) {
  const tabellen: Record<string, Rij[]> = structuredClone(begin);
  let volgendId = 1000;

  function from(tabel: string) {
    tabellen[tabel] ??= [];
    const rijen = tabellen[tabel];
    const filters: ((r: Rij) => boolean)[] = [];
    let actie: Actie = { soort: "select" };
    const volgorde: { kolom: string; oplopend: boolean }[] = [];
    let maximum: number | null = null;

    const voerUit = (): { data: Rij[]; error: NepFout | null } => {
      const fout = fouten[`${tabel}:${actie.soort}`];
      if (fout) return { data: [], error: fout };

      const sleutel = SLEUTELS[tabel] ?? ["id"];
      if (actie.soort === "upsert") {
        for (const n of actie.nieuw) {
          const bestaand = rijen.find((r) => sleutel.every((k) => r[k] === n[k]));
          if (bestaand) {
            if (!actie.negeer) Object.assign(bestaand, n);
          } else {
            rijen.push({ id: volgendId++, ...standaard(tabel), ...n });
          }
        }
        return { data: [], error: null };
      }
      if (actie.soort === "insert") {
        const toegevoegd: Rij[] = [];
        for (const n of actie.nieuw) {
          const dubbel = SLEUTELS[tabel] && rijen.some((r) => sleutel.every((k) => r[k] === n[k]));
          if (dubbel) {
            return { data: [], error: { code: "23505", message: `duplicate key value violates unique constraint on ${tabel}` } };
          }
          const rij = { id: volgendId++, created_at: new Date().toISOString(), ...standaard(tabel), ...n };
          rijen.push(rij);
          toegevoegd.push({ ...rij });
        }
        return { data: toegevoegd, error: null };
      }

      let treffers = rijen.filter((r) => filters.every((f) => f(r)));
      if (actie.soort === "update") for (const r of treffers) Object.assign(r, actie.waarden);
      if (actie.soort === "delete") tabellen[tabel] = rijen.filter((r) => !treffers.includes(r));
      if (volgorde.length > 0) {
        treffers.sort((a, b) => {
          for (const { kolom, oplopend } of volgorde) {
            const verschil = String(a[kolom] ?? "").localeCompare(String(b[kolom] ?? ""), undefined, { numeric: true });
            if (verschil !== 0) return oplopend ? verschil : -verschil;
          }
          return 0;
        });
      }
      if (maximum !== null) treffers = treffers.slice(0, maximum);
      return { data: treffers.map((r) => ({ ...r })), error: null };
    };

    const bouwer = {
      select: () => bouwer,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), bouwer),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), bouwer),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), bouwer),
      lt: (k: string, v: unknown) => (filters.push((r) => String(r[k]) < String(v)), bouwer),
      order: (k: string, opties?: { ascending?: boolean }) => (
        volgorde.push({ kolom: k, oplopend: opties?.ascending !== false }), bouwer
      ),
      limit: (n: number) => ((maximum = n), bouwer),
      update: (waarden: Rij) => ((actie = { soort: "update", waarden }), bouwer),
      delete: () => ((actie = { soort: "delete" }), bouwer),
      insert: (n: Rij | Rij[]) => ((actie = { soort: "insert", nieuw: Array.isArray(n) ? n : [n] }), bouwer),
      upsert: (n: Rij | Rij[], opties?: { ignoreDuplicates?: boolean }) => (
        (actie = { soort: "upsert", nieuw: Array.isArray(n) ? n : [n], negeer: !!opties?.ignoreDuplicates }), bouwer
      ),
      maybeSingle: async () => {
        const { data, error } = voerUit();
        return { data: error ? null : (data[0] ?? null), error };
      },
      single: async () => {
        const { data, error } = voerUit();
        if (error) return { data: null, error };
        return data[0] ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "geen rij" } };
      },
      then: (ok: (v: { data: Rij[]; error: NepFout | null }) => unknown, fout?: (e: unknown) => unknown) =>
        Promise.resolve(voerUit()).then(ok, fout),
    };
    return bouwer;
  }

  return { client: { from }, tabellen };
}

function standaard(tabel: string): Rij {
  if (tabel === "opvang_rondes") {
    return {
      status: "open",
      definitief_door: null,
      definitief_op: null,
      stop_gevraagd: false,
      kalender_gelezen_op: null,
      gevraagd_op: null,
      herinnerd_op: null,
    };
  }
  if (tabel === "opvang_menus") return { week: 0 };
  if (tabel === "bouw_bestanden") return { status: "wacht", grootte_bytes: null, klaar_op: null };
  if (tabel === "bouw_planversies") return { pagina: 1, datum: null, kalibratie: null, opmerking: null };
  return {};
}
