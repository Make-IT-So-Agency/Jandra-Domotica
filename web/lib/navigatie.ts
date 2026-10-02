import type { Paginalink } from "@/components/navigatie";

import { magBouwZien, magGebruikersBeheren, magInstellingenBeheren, type Gebruiker } from "./rollen";

/** De pagina's die deze gebruiker te zien krijgt, in menuvolgorde. */
export function zichtbarePaginas(gebruiker: Gebruiker): Paginalink[] {
  const paginas: Paginalink[] = [
    { pad: "/", naam: "Overzicht" },
    { pad: "/rapporten", naam: "Rapporten" },
  ];

  if (magInstellingenBeheren(gebruiker)) {
    paginas.push(
      { pad: "/laadpalen", naam: "Laadpalen" },
      { pad: "/vennootschappen", naam: "Vennootschappen" },
      { pad: "/tarieven", naam: "Tarieven" },
    );
  }

  if (magBouwZien(gebruiker)) {
    paginas.push({ pad: "/bouw", naam: "Bouw" });
  }

  if (magGebruikersBeheren(gebruiker)) {
    paginas.push({ pad: "/gebruikers", naam: "Gebruikers" });
  }

  if (magInstellingenBeheren(gebruiker)) {
    paginas.push({ pad: "/instellingen", naam: "Instellingen" });
  }

  return paginas;
}

/** Het submenu van de module Bouw. */
export const BOUWPAGINAS: Paginalink[] = [
  { pad: "/bouw", naam: "Overzicht" },
  { pad: "/bouw/plannen", naam: "Plannen" },
  { pad: "/bouw/ruimtes", naam: "Ruimtes" },
  { pad: "/bouw/verdiepingen", naam: "Verdiepingen" },
  { pad: "/bouw/partijen", naam: "Partijen" },
];

/**
 * Welke link oplicht voor het huidige pad: de langste die past, op de grens
 * van een padstuk. Zo licht /bouw/plannen/12 "Plannen" op in het submenu en
 * "Bouw" in het hoofdmenu. "/" past enkel op zichzelf, anders zou Overzicht
 * altijd oplichten.
 */
export function actievePagina(huidig: string, paden: string[]): string | null {
  let beste: string | null = null;
  for (const pad of paden) {
    const past = pad === "/" ? huidig === "/" : huidig === pad || huidig.startsWith(`${pad}/`);
    if (past && (beste === null || pad.length > beste.length)) beste = pad;
  }
  return beste;
}
