import { PATROONNAMEN, type Patroon } from "../keuzes";
import type { Materiaal, Slot } from "./materialen";

/**
 * Stalen om in 3D uit te proberen, per onderdeel: gewone materialen van een
 * nieuwbouw, met hun kleur, hun patroon en de kleur van de voeg. Een staal is
 * nog geen optie: bewaar je het, dan komt het als optie bij de keuze. Ook de
 * maten van elk patroon staan hier: zo ligt een baksteen in 3D even groot als
 * in het echt. Puur.
 */

export interface Staal {
  naam: string;
  materiaal: Materiaal;
}

const staal = (naam: string, kleur: string, patroon: Patroon | null = null, voegkleur: string | null = null): Staal => ({
  naam,
  materiaal: { kleur, foto: null, patroon, voegkleur },
});

export const STALEN: Record<Slot, readonly Staal[]> = {
  gevel: [
    staal("Rode baksteen", "#9b4a33", "baksteen", "#c9c2b8"),
    staal("Roodbruine baksteen", "#7a4535", "baksteen", "#8f877d"),
    staal("Gele baksteen", "#c8a46e", "baksteen", "#e3dccf"),
    staal("Grijze baksteen", "#8d8a85", "baksteen", "#c4c0b8"),
    staal("Witte baksteen", "#e6e1d6", "baksteen", "#f1eee7"),
    staal("Antraciet baksteen", "#3f3e40", "baksteen", "#2c2c2e"),
    staal("Witte crepi", "#f0ede5", "crepi"),
    staal("Grijze crepi", "#b8b4ab", "crepi"),
    staal("Hout naturel", "#8b6845", "planken"),
    staal("Hout zwart", "#2d2c2b", "planken"),
    staal("Zichtbeton", "#bcb9b2", "beton"),
  ],
  dak: [
    staal("Rode dakpannen", "#9a4b33", "pannen"),
    staal("Antraciet dakpannen", "#3c3f44", "pannen"),
    staal("Natuurleien", "#4a4f57", "leien"),
    staal("Zink, natuurgrijs", "#9aa1a6", "zink"),
    staal("Zink, antraciet", "#4d5257", "zink"),
    staal("EPDM", "#2f3134"),
    staal("Groendak", "#6f8a4c", "crepi"),
  ],
  schrijnwerk: [
    staal("Antraciet (RAL 7016)", "#383e42"),
    staal("Zwart (RAL 9005)", "#0e0e10"),
    staal("Wit (RAL 9016)", "#f1f0ea"),
    staal("Kwartsgrijs (RAL 7039)", "#6c6960"),
    staal("Brons", "#6a5640"),
    staal("Eik", "#a67c52"),
  ],
  binnenmuur: [
    staal("Wit", "#f3f0e9"),
    staal("Gebroken wit", "#ebe4d4"),
    staal("Lichtgrijs", "#d6d4cf"),
    staal("Zand", "#d9cbb2"),
    staal("Saliegroen", "#b3bda3"),
    staal("Terracotta", "#c9876a"),
    staal("Leempleister", "#cdb79a", "crepi"),
    staal("Witte tegels", "#f2f1ed", "tegels", "#d9d6cf"),
    staal("Rode baksteen", "#9b4a33", "baksteen", "#c9c2b8"),
    staal("Beton", "#c2bfb8", "beton"),
  ],
  vloer: [
    staal("Eik naturel", "#c19a6b", "parket"),
    staal("Lichte eik", "#d8bf98", "parket"),
    staal("Gerookte eik", "#7a5a40", "parket"),
    staal("Lichtgrijze tegels", "#cfcac2", "tegels", "#bdb7ad"),
    staal("Beige tegels", "#d6c7ae", "tegels", "#c4b49a"),
    staal("Antraciet tegels", "#56585b", "tegels", "#3f4144"),
    staal("Witte tegels", "#eceae5", "tegels", "#d5d2cb"),
    staal("Gietvloer", "#b1aea7", "beton"),
  ],
};

/** De echte maten, in meter. Een baksteen in waalformaat: 21 op 5 cm, met een voeg van 1,2 cm. */
export const BAKSTEEN = { lengte: 0.21, hoogte: 0.05, voeg: 0.012 };
/** Een tegel van 60 op 60, met een voeg van 3 mm. */
export const TEGEL = { zijde: 0.6, voeg: 0.003 };

/**
 * Hoe groot één herhaling van een patroon is, in meter, en hoeveel stukken
 * erin passen. In 3D staat de textuur in meter (zie scene.ts): de textuur
 * herhaalt zich dan elke breedte op hoogte.
 */
export const PATROONMATEN: Record<Patroon, { breedte: number; hoogte: number; kolommen: number; rijen: number }> = {
  // Vier stenen breed, acht lagen hoog, in halfsteens verband.
  baksteen: { breedte: 4 * (BAKSTEEN.lengte + BAKSTEEN.voeg), hoogte: 8 * (BAKSTEEN.hoogte + BAKSTEEN.voeg), kolommen: 4, rijen: 8 },
  // Pannen van 25 cm breed, om de 33 cm een rij.
  pannen: { breedte: 1, hoogte: 0.99, kolommen: 4, rijen: 3 },
  // Leien van 30 cm, om de 20 cm een rij, verspringend.
  leien: { breedte: 1.2, hoogte: 0.8, kolommen: 4, rijen: 4 },
  // Zink met een staande naad om de 50 cm.
  zink: { breedte: 0.5, hoogte: 1, kolommen: 1, rijen: 1 },
  // Planken van 14 cm, 2 tot 4 m lang.
  planken: { breedte: 4, hoogte: 0.56, kolommen: 2, rijen: 4 },
  // Parketplanken van 19 cm op 1,40 m.
  parket: { breedte: 2.8, hoogte: 0.76, kolommen: 2, rijen: 4 },
  tegels: { breedte: 2 * TEGEL.zijde, hoogte: 2 * TEGEL.zijde, kolommen: 2, rijen: 2 },
  // Een bekistingsplaat van 2,40 op 1,20, met vier gaten van de spanstaven.
  beton: { breedte: 2.4, hoogte: 1.2, kolommen: 1, rijen: 1 },
  crepi: { breedte: 1, hoogte: 1, kolommen: 1, rijen: 1 },
};

/** Hoe het oppervlak het licht weerkaatst: zink glanst, crepi niet. */
export function oppervlakVan(materiaal: Pick<Materiaal, "patroon">): { ruwheid: number; metaal: number } {
  switch (materiaal.patroon) {
    case "zink":
      return { ruwheid: 0.45, metaal: 0.35 };
    case "tegels":
      return { ruwheid: 0.4, metaal: 0 };
    case "parket":
      return { ruwheid: 0.6, metaal: 0 };
    case "leien":
      return { ruwheid: 0.7, metaal: 0 };
    default:
      return { ruwheid: 0.9, metaal: 0 };
  }
}

/** Een naam voor een eigen kleur: "Baksteen #a65a3a", of "Kleur #a65a3a". */
export function eigenNaam(materiaal: Pick<Materiaal, "kleur" | "patroon">): string {
  return `${materiaal.patroon ? PATROONNAMEN[materiaal.patroon] : "Kleur"} ${materiaal.kleur}`;
}

/**
 * Een getal van 0 tot 1 dat telkens hetzelfde is voor hetzelfde zaad: zo
 * krijgt elke steen een eigen tint, maar ziet dezelfde staal er altijd
 * hetzelfde uit.
 */
export function willekeur(zaad: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < zaad.length; i++) h = Math.imul(h ^ zaad.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Een kleur lichter (factor boven 1) of donkerder, als #rrggbb. */
export function tint(kleur: string, factor: number): string {
  const n = Number.parseInt(kleur.slice(1), 16);
  const kanaal = (schuif: number) => Math.max(0, Math.min(255, Math.round(((n >> schuif) & 255) * factor)));
  return `#${[16, 8, 0].map((schuif) => kanaal(schuif).toString(16).padStart(2, "0")).join("")}`;
}
