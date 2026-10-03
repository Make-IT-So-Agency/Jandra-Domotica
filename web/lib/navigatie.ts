import { magBouwZien, magGebruikersBeheren, magInstellingenBeheren, type Gebruiker } from "./rollen";

/**
 * Het menu van de app: links, in groepen. Puur, want het zijmenu is een
 * clientcomponent en dit bestand gaat dus mee naar de browser.
 */

export interface Paginalink {
  pad: string;
  naam: string;
}

/** Een huis onder Vastgoed, met zijn eigen pagina's. Nu enkel de nieuwbouw. */
export interface Huis {
  sleutel: string;
  naam: string;
  paginas: Paginalink[];
}

export type Menuonderdeel =
  | { soort: "groep"; naam: string; paginas: Paginalink[] }
  | { soort: "vastgoed"; naam: string; huizen: Huis[] }
  | { soort: "pagina"; pagina: Paginalink };

/** De pagina's van Bouw: het huis dat we bouwen. */
export const BOUWPAGINAS: Paginalink[] = [
  { pad: "/bouw", naam: "Overzicht" },
  { pad: "/bouw/plannen", naam: "Plannen" },
  { pad: "/bouw/ruimtes", naam: "Ruimtes" },
  { pad: "/bouw/punten", naam: "Punten" },
  { pad: "/bouw/3d", naam: "3D" },
  { pad: "/bouw/keuzes", naam: "Keuzes" },
  { pad: "/bouw/planning", naam: "Planning" },
  { pad: "/bouw/geld", naam: "Geld" },
  { pad: "/bouw/werf", naam: "Werf" },
  { pad: "/bouw/dossier", naam: "Dossier" },
  { pad: "/bouw/beslissingen", naam: "Beslissingen" },
  { pad: "/bouw/verdiepingen", naam: "Verdiepingen" },
  { pad: "/bouw/partijen", naam: "Partijen" },
  { pad: "/bouw/toegang", naam: "Toegang" },
  { pad: "/bouw/telegram", naam: "Telegram" },
];

/**
 * De huizen onder Vastgoed, in het keuzemenu. Komt het huidige huis erbij,
 * dan is dat hier één regel; de gegevens van Bouw horen nu wel bij één
 * project, dus dat wordt een eigen stuk werk.
 */
export const HUIZEN: Huis[] = [{ sleutel: "nieuwbouw", naam: "Nieuwbouw", paginas: BOUWPAGINAS }];

/** Het menu dat deze gebruiker te zien krijgt, in volgorde. */
export function menuVoor(gebruiker: Gebruiker): Menuonderdeel[] {
  const laden: Paginalink[] = [
    { pad: "/", naam: "Overzicht" },
    { pad: "/rapporten", naam: "Rapporten" },
  ];
  if (magInstellingenBeheren(gebruiker)) {
    laden.push(
      // De pagina heet zo, zodat ze niet dezelfde naam heeft als de groep.
      { pad: "/laadpalen", naam: "Laadpunten" },
      { pad: "/vennootschappen", naam: "Vennootschappen" },
      { pad: "/tarieven", naam: "Tarieven" },
      { pad: "/instellingen", naam: "Instellingen" },
    );
  }

  const menu: Menuonderdeel[] = [{ soort: "groep", naam: "Laadpalen", paginas: laden }];
  if (magBouwZien(gebruiker)) {
    menu.push({ soort: "vastgoed", naam: "Vastgoed", huizen: HUIZEN });
  }
  if (magGebruikersBeheren(gebruiker)) {
    menu.push({ soort: "pagina", pagina: { pad: "/gebruikers", naam: "Gebruikers" } });
  }
  return menu;
}

/** De pagina's van één onderdeel van het menu. */
export function paginasVan(onderdeel: Menuonderdeel): Paginalink[] {
  if (onderdeel.soort === "groep") return onderdeel.paginas;
  if (onderdeel.soort === "vastgoed") return onderdeel.huizen.flatMap((huis) => huis.paginas);
  return [onderdeel.pagina];
}

/** Alle paden in het menu, om te weten welke link oplicht. */
export function allePaden(menu: Menuonderdeel[]): string[] {
  return menu.flatMap((onderdeel) => paginasVan(onderdeel).map((pagina) => pagina.pad));
}

/** Het huis waarvan deze pagina is; anders het eerste. */
export function huisVan(huidig: string, huizen: Huis[]): Huis {
  return (
    huizen.find((huis) => actievePagina(huidig, huis.paginas.map((pagina) => pagina.pad)) !== null) ?? huizen[0]
  );
}

/**
 * Welke link oplicht voor het huidige pad: de langste die past, op de grens
 * van een padstuk. Zo licht /bouw/plannen/12 "Plannen" op, en niet
 * "Overzicht" van Vastgoed. "/" past enkel op zichzelf, anders zou Overzicht
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
