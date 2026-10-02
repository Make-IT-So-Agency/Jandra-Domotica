import type { SoortRuimte } from "../types";

/**
 * De vorm van een blad en van wat de omzetting ervan maakt. Puur: de browser,
 * de server en de tests gebruiken dit bestand.
 *
 * Tenzij er "meter" staat, is alles in paginapunten: 1/72 inch, met de
 * oorsprong linksboven en y naar beneden, zoals het blad op het scherm staat.
 * Een A3 op schaal 1:50 is zo 842 × 1191 punten, en 1 punt is 1,76 cm.
 */

export type Xy = [number, number];

export interface Kader {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Een kubische Bézier-boog: van p0 naar p3, met p1 en p2 als controlepunten. */
export interface Boog {
  p0: Xy;
  p1: Xy;
  p2: Xy;
  p3: Xy;
}

export interface Deelpad {
  /** De hoekpunten. Een boog is al afgevlakt tot korte rechte stukken. */
  punten: Xy[];
  gesloten: boolean;
}

/** Eén getekend pad: een vlak, een lijn of beide. */
export interface Pad {
  /** "#rrggbb", "patroon" voor een arcering met een patroon, of null als het niet gevuld is. */
  vul: string | null;
  /** "#rrggbb", of null als er geen lijn getrokken wordt. */
  lijn: string | null;
  /** De lijndikte in punten, op het blad. */
  dikte: number;
  delen: Deelpad[];
  bogen: Boog[];
}

export interface Tekst {
  tekst: string;
  /** Het middelpunt. */
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  /** De lettergrootte in punten. */
  grootte: number;
  /** In graden; 0 is horizontaal. */
  hoek: number;
}

export interface Blad {
  breedte: number;
  hoogte: number;
  paden: Pad[];
  teksten: Tekst[];
  /** Welk deel van het blad met afbeeldingen bedekt is, van 0 tot 1. Een scan zit dicht bij 1. */
  beeldvlak: number;
}

// ---------------------------------------------------------------------------
// Wat de omzetting voorstelt
// ---------------------------------------------------------------------------

export interface Schaal {
  /** Hoeveel meter in het echt één punt op het blad is. */
  meterPerPunt: number;
  /** 50 voor 1:50. */
  noemer: number;
  bron: "titelblok" | "oppervlaktes" | "beide" | "hand";
  /** De schaal die als tekst op het blad staat, als die er is. */
  titelblok: number | null;
  /** Hoeveel oppervlaktes van de architect met deze schaal kloppen, en hoeveel er waren. */
  kloppend: number;
  getoetst: number;
  zeker: boolean;
}

export type Status = "goed" | "nakijken";

export interface Ruimtevoorstel {
  sleutel: string;
  naam: string;
  soort: SoortRuimte;
  /** De buitenrand, en daarna eventuele gaten (een kolom, een schacht). */
  ringen: Xy[][];
  /** Berekend uit de veelhoek, in m². */
  oppervlakte: number;
  /** Zoals op het plan, in m². */
  oppervlaktePlan: number | null;
  /** In meter; null als de ruimte die van de verdieping volgt. */
  plafondhoogte: number | null;
  vloerpeil: number | null;
  status: Status;
  redenen: string[];
  /** Gaat deze ruimte mee bij het bevestigen? */
  mee: boolean;
  /** De bestaande ruimte die dit voortzet, na het vergelijken met wat er al was. */
  ruimteId: number | null;
}

/** Een wit vlak dat geen label had: misschien een ruimte, misschien een meubel. */
export interface Kandidaat {
  sleutel: string;
  ring: Xy[];
  oppervlakte: number;
  plafondhoogte: number | null;
  vloerpeil: number | null;
}

export interface Opening {
  soort: "deur" | "raam";
  /** Bij een deur het scharnier, bij een raam het label. */
  x: number;
  y: number;
  /** Bij een deur de twee uiteinden van de boog. */
  punten: Xy[];
  /** In meter. */
  breedte: number;
  hoogte: number | null;
  /** De sleutel van de dichtstbijzijnde ruimte. */
  ruimte: string | null;
}

export interface Voorstel {
  /** Verandert als de regels van de omzetting veranderen. */
  werkwijze: number;
  blad: { breedte: number; hoogte: number };
  schaal: Schaal | null;
  ruimtes: Ruimtevoorstel[];
  kandidaten: Kandidaat[];
  openingen: Opening[];
  /** De doorgesneden muren: de grijze vlakken tussen en rond de ruimtes. Voor het 3D-model. */
  muren: Xy[][];
  /** Het peil en de plafondhoogte die het meest op het blad staan, in meter. */
  verdieping: { vloerpeil: number | null; plafondhoogte: number | null };
  /** Waar het gebouw op het blad ligt: de ruimtes, met wat marge. */
  gebied: Kader | null;
  meldingen: string[];
}
