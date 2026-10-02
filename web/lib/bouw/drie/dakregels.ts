/**
 * De instelling van een dak, zonder rekenwerk: de databank, de server en het
 * 3D-scherm gebruiken ze. De types horen bij de check-constraint in
 * supabase/migrations/20261002202505_bouw_daken.sql.
 */

export const DAKTYPES = ["plat", "zadel", "lessenaar"] as const;
export type Daktype = (typeof DAKTYPES)[number];

export const DAKNAMEN: Record<Daktype, string> = {
  plat: "Plat dak",
  zadel: "Zadeldak",
  lessenaar: "Lessenaarsdak",
};

export interface Dakinstelling {
  type: Daktype;
  /** In graden. */
  helling: number;
  /** De nok loopt evenwijdig met x of met y. Bij een lessenaarsdak: de richting van de lage rand. */
  nok: "x" | "y";
  /** Hoeveel de dakrand over de muren steekt, in meter. */
  overstek: number;
}

export const STANDAARDDAK: Dakinstelling = { type: "plat", helling: 35, nok: "x", overstek: 0.3 };

export function isDaktype(waarde: string): waarde is Daktype {
  return (DAKTYPES as readonly string[]).includes(waarde);
}
