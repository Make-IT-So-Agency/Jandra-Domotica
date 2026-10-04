/**
 * De lagen van het 3D-model: wat je aan en uit zet. Elke laag heeft een
 * sleutel ("verdieping:12", "punten:verlichting", "inrichting:meubels",
 * "hulp:maten"); de browser onthoudt per sleutel of ze aan staat. Wat niet
 * onthouden is, staat zoals standaard: aan, behalve wat in STANDAARD_UIT
 * staat.
 *
 * Puur, met tests. Het onthouden zelf staat in components/bouw/lagen.tsx.
 */

export interface Laag {
  sleutel: string;
  naam: string;
  /** Een kleurtje voor de naam, zoals de categorie van een punt. */
  kleur?: string;
}

export interface Lagengroep {
  naam: string;
  lagen: Laag[];
}

/** Per sleutel: aan of uit. Enkel wat iemand zelf aan- of uitzette. */
export type Lagenstand = Readonly<Record<string, boolean>>;

/** Wat standaard uit staat. */
export const STANDAARD_UIT: ReadonlySet<string> = new Set(["terrein:opPerceel"]);

/** Hoeveel sleutels de browser hoogstens onthoudt. */
const MAX_SLEUTELS = 500;
const SLEUTELVORM = /^[a-z]+(?::[a-z0-9_]+)?$/;

/** Staat deze laag aan? */
export const isAan = (stand: Lagenstand, sleutel: string): boolean => stand[sleutel] ?? !STANDAARD_UIT.has(sleutel);

export interface Lageninvoer {
  verdiepingen: readonly { id: number; naam: string }[];
  daken: boolean;
  /** Ligt er een inplantingsplan op de grond? */
  inplantingsplan: boolean;
  /** Is de omgeving uit Vlaanderen er? */
  omgeving: boolean;
  /** De categorieën van de punten die er zijn, in de volgorde van de catalogus. */
  punten: readonly { categorie: string; naam: string; kleur: string }[];
  /** De meubels en de toestellen, als die er zijn (zie inrichting.ts). */
  inrichting: readonly { laag: string; naam: string }[];
}

/** De punten per categorie: in 3D, en ook in het puntenscherm. */
export function puntlagen(punten: Lageninvoer["punten"]): Lagengroep {
  return { naam: "Punten", lagen: punten.map((p) => ({ sleutel: `punten:${p.categorie}`, naam: p.naam, kleur: p.kleur })) };
}

/** De lagen, in groepen. Een groep zonder lagen valt weg. */
export function lagenVan(invoer: Lageninvoer): Lagengroep[] {
  const groepen: Lagengroep[] = [
    {
      naam: "Gebouw",
      lagen: [
        ...invoer.verdiepingen.map((v) => ({ sleutel: `verdieping:${v.id}`, naam: v.naam })),
        ...(invoer.daken ? [{ sleutel: "daken", naam: "Daken" }] : []),
      ],
    },
    {
      naam: "Terrein",
      lagen: [
        ...(invoer.inplantingsplan ? [{ sleutel: "terrein:plan", naam: "Inplantingsplan op de grond" }] : []),
        ...(invoer.omgeving
          ? [
              { sleutel: "terrein:luchtfoto", naam: "Luchtfoto" },
              { sleutel: "terrein:grenzen", naam: "Perceelgrenzen" },
              { sleutel: "terrein:buren", naam: "Huizen van de buren" },
              { sleutel: "terrein:opPerceel", naam: "Wat nu op ons perceel staat" },
            ]
          : []),
      ],
    },
    puntlagen(invoer.punten),
    { naam: "Inrichting", lagen: invoer.inrichting.map((i) => ({ sleutel: `inrichting:${i.laag}`, naam: i.naam })) },
    {
      naam: "Hulp",
      lagen: [
        { sleutel: "hulp:maten", naam: "Maten" },
        { sleutel: "hulp:noorden", naam: "Noordpijl" },
      ],
    },
  ];
  return groepen.filter((groep) => groep.lagen.length > 0);
}

/** Wat de browser bewaarde, als stand. Iets wat niet klopt, valt weg. */
export function leesLagen(tekst: string | null): Lagenstand {
  if (!tekst) return {};
  let ruw: unknown;
  try {
    ruw = JSON.parse(tekst);
  } catch {
    return {};
  }
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) return {};
  const stand: Record<string, boolean> = {};
  for (const [sleutel, aan] of Object.entries(ruw).slice(0, MAX_SLEUTELS)) {
    if (typeof aan === "boolean" && SLEUTELVORM.test(sleutel)) stand[sleutel] = aan;
  }
  return stand;
}

/** Een stand met wijzigingen, om te bewaren. Wat gelijk is aan de standaard, hoeft niet onthouden te worden. */
export function metWijziging(stand: Lagenstand, wijziging: Readonly<Record<string, boolean>>): Record<string, boolean> {
  const nieuw: Record<string, boolean> = { ...stand };
  for (const [sleutel, aan] of Object.entries(wijziging)) {
    if (!SLEUTELVORM.test(sleutel)) continue;
    if (aan === !STANDAARD_UIT.has(sleutel)) delete nieuw[sleutel];
    else nieuw[sleutel] = aan;
  }
  return Object.fromEntries(Object.entries(nieuw).slice(-MAX_SLEUTELS));
}
