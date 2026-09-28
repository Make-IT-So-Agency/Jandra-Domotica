/**
 * Een kleine Supabase in het geheugen: net genoeg van de query-bouwer van
 * supabase-js voor wat lib/opvang/opslag.ts gebruikt. Unieke sleutels per
 * tabel bepalen wat een upsert overschrijft of overslaat.
 */

type Rij = Record<string, unknown>;

const SLEUTELS: Record<string, string[]> = {
  opvang_instellingen: ["sleutel"],
  opvang_rondes: ["maand", "ronde"],
  opvang_keuzes: ["ronde_id", "slot_id"],
  opvang_menus: ["ronde_id", "kind_id"],
  opvang_kinderen: ["leerling_id"],
  opvang_slots: ["kind_id", "datum", "moment", "locatie"],
};

export function nepSupabase(begin: Record<string, Rij[]> = {}) {
  const tabellen: Record<string, Rij[]> = structuredClone(begin);
  let volgendId = 1000;

  function from(tabel: string) {
    tabellen[tabel] ??= [];
    const rijen = tabellen[tabel];
    const filters: ((r: Rij) => boolean)[] = [];
    let actie: { soort: "select" } | { soort: "update"; waarden: Rij } | { soort: "delete" } | { soort: "upsert"; nieuw: Rij[]; negeer: boolean } = {
      soort: "select",
    };
    let volgorde: string | null = null;

    const voerUit = () => {
      if (actie.soort === "upsert") {
        const sleutel = SLEUTELS[tabel] ?? ["id"];
        for (const n of actie.nieuw) {
          const bestaand = rijen.find((r) => sleutel.every((k) => r[k] === n[k]));
          if (bestaand) {
            if (!actie.negeer) Object.assign(bestaand, n);
          } else {
            rijen.push({ id: volgendId++, ...standaard(tabel), ...n });
          }
        }
        return [];
      }
      const treffers = rijen.filter((r) => filters.every((f) => f(r)));
      if (actie.soort === "update") for (const r of treffers) Object.assign(r, actie.waarden);
      if (actie.soort === "delete") tabellen[tabel] = rijen.filter((r) => !treffers.includes(r));
      if (volgorde) treffers.sort((a, b) => String(a[volgorde!]).localeCompare(String(b[volgorde!]), undefined, { numeric: true }));
      return treffers.map((r) => ({ ...r }));
    };

    const bouwer = {
      select: () => bouwer,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), bouwer),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), bouwer),
      order: (k: string) => ((volgorde = k), bouwer),
      update: (waarden: Rij) => ((actie = { soort: "update", waarden }), bouwer),
      delete: () => ((actie = { soort: "delete" }), bouwer),
      upsert: (n: Rij | Rij[], opties?: { ignoreDuplicates?: boolean }) => (
        (actie = { soort: "upsert", nieuw: Array.isArray(n) ? n : [n], negeer: !!opties?.ignoreDuplicates }), bouwer
      ),
      maybeSingle: async () => ({ data: voerUit()[0] ?? null, error: null }),
      single: async () => {
        const [r] = voerUit();
        return r ? { data: r, error: null } : { data: null, error: { message: "geen rij" } };
      },
      then: (ok: (v: { data: Rij[]; error: null }) => unknown, fout?: (e: unknown) => unknown) =>
        Promise.resolve({ data: voerUit(), error: null }).then(ok, fout),
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
  return {};
}
