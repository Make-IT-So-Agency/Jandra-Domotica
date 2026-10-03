import { VASTGOED, deelVan, huisUitPad, huispad } from "./bouw/paden";
import { magBouwZien, magGebruikersBeheren, magInstellingenBeheren, type Gebruiker } from "./rollen";

/**
 * Het menu van de app: links, in groepen. Puur, want het zijmenu is een
 * clientcomponent en dit bestand gaat dus mee naar de browser.
 */

export interface Paginalink {
  pad: string;
  naam: string;
}

/** Wat het menu van een huis weet: het nummer en de korte naam, niets meer. */
export interface Menuhuis {
  id: number;
  naam: string;
}

/** Een huis onder Vastgoed, met zijn eigen pagina's. */
export interface Huismenu extends Menuhuis {
  paginas: Paginalink[];
}

export type Menuonderdeel =
  | { soort: "groep"; naam: string; paginas: Paginalink[] }
  | { soort: "vastgoed"; naam: string; huizen: Huismenu[]; los: Paginalink[] }
  | { soort: "pagina"; pagina: Paginalink };

/** De pagina's van een huis, met wat er na /vastgoed/<nummer> komt. */
export const HUISPAGINAS: { deel: string; naam: string }[] = [
  { deel: "", naam: "Overzicht" },
  { deel: "/plannen", naam: "Plannen" },
  { deel: "/ruimtes", naam: "Ruimtes" },
  { deel: "/punten", naam: "Punten" },
  { deel: "/3d", naam: "3D" },
  { deel: "/keuzes", naam: "Keuzes" },
  { deel: "/planning", naam: "Planning" },
  { deel: "/geld", naam: "Geld" },
  { deel: "/werf", naam: "Werf" },
  { deel: "/dossier", naam: "Dossier" },
  { deel: "/beslissingen", naam: "Beslissingen" },
  { deel: "/verdiepingen", naam: "Verdiepingen" },
  { deel: "/partijen", naam: "Partijen" },
  { deel: "/toegang", naam: "Toegang" },
];

/** Onder Vastgoed, los van de huizen: de huizen zelf, en de bot voor alle huizen. */
export const VASTGOEDPAGINAS: Paginalink[] = [
  { pad: VASTGOED, naam: "Huizen" },
  { pad: `${VASTGOED}/telegram`, naam: "Telegram" },
];

export function huismenu(huis: Menuhuis): Huismenu {
  return {
    id: huis.id,
    naam: huis.naam,
    paginas: HUISPAGINAS.map((pagina) => ({ pad: huispad(huis.id, pagina.deel), naam: pagina.naam })),
  };
}

/** Het menu dat deze gebruiker te zien krijgt, in volgorde, met de actieve huizen onder Vastgoed. */
export function menuVoor(gebruiker: Gebruiker, huizen: Menuhuis[] = []): Menuonderdeel[] {
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
    menu.push({ soort: "vastgoed", naam: "Vastgoed", huizen: huizen.map(huismenu), los: VASTGOEDPAGINAS });
  }
  if (magGebruikersBeheren(gebruiker)) {
    menu.push({ soort: "pagina", pagina: { pad: "/gebruikers", naam: "Gebruikers" } });
  }
  return menu;
}

/** De pagina's van één onderdeel van het menu. */
export function paginasVan(onderdeel: Menuonderdeel): Paginalink[] {
  if (onderdeel.soort === "groep") return onderdeel.paginas;
  if (onderdeel.soort === "vastgoed") return [...onderdeel.huizen.flatMap((huis) => huis.paginas), ...onderdeel.los];
  return [onderdeel.pagina];
}

/** Alle paden in het menu, om te weten welke link oplicht. */
export function allePaden(menu: Menuonderdeel[]): string[] {
  return menu.flatMap((onderdeel) => paginasVan(onderdeel).map((pagina) => pagina.pad));
}

/** Het huis van deze pagina; anders het eerste, of geen als er geen huizen zijn. */
export function huisVan(huidig: string, huizen: Huismenu[]): Huismenu | null {
  const id = huisUitPad(huidig);
  return huizen.find((huis) => huis.id === id) ?? huizen[0] ?? null;
}

/**
 * Waar je terechtkomt als je een ander huis kiest: hetzelfde onderdeel van
 * dat huis, of zijn overzicht als het dat onderdeel niet heeft. Nooit dieper
 * dan het onderdeel: een plan of een post van het ene huis bestaat niet in
 * het andere.
 */
export function wisselPad(huidig: string, van: Huismenu | null, naar: Huismenu): string {
  const actief = van ? actievePagina(huidig, van.paginas.map((pagina) => pagina.pad)) : null;
  const deel = actief === null ? "" : deelVan(actief);
  return naar.paginas.find((pagina) => deelVan(pagina.pad) === deel)?.pad ?? huispad(naar.id);
}

/**
 * Welke link oplicht voor het huidige pad: de langste die past, op de grens
 * van een padstuk. Zo licht /vastgoed/1/plannen/12 "Plannen" op, en niet het
 * overzicht van het huis. "/" past enkel op zichzelf, anders zou Overzicht
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
