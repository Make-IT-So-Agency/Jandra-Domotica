import { heeftOnderdeel, onderdeelVan } from "./bouw/onderdelen";
import { VASTGOED, deelVan, huisUitPad, huispad } from "./bouw/paden";
import type { SoortHuis } from "./bouw/types";
import { magBouwZien, magGebruikersBeheren, magHuishoudenZien, magInstellingenBeheren, type Gebruiker } from "./rollen";

/**
 * Het menu van de app, per module. Links staat een smalle balk met een icoon
 * per module; ernaast een paneel met de pagina's van de module waarin je zit,
 * in secties. Op de gsm wordt de balk een tabbalk onderaan.
 *
 * Een nieuwe module is één item in menuVoor, met haar pagina's en wie ze mag
 * zien. Puur, want het zijmenu is een clientcomponent en dit bestand gaat dus
 * mee naar de browser.
 */

export interface Paginalink {
  pad: string;
  naam: string;
}

/** Een groep pagina's in het paneel, met een kopje; zonder naam staan ze bovenaan, zonder kopje. */
export interface Menusectie {
  naam: string | null;
  paginas: Paginalink[];
}

/** De iconen die een module in de balk kan hebben, zie components/module-icoon.tsx. */
export const ICONEN = ["stekker", "huis", "mensen", "mand", "kalender"] as const;
export type Icoon = (typeof ICONEN)[number];

/** Wat het menu van een huis weet: het nummer, de korte naam en het soort, niets meer. */
export interface Menuhuis {
  id: number;
  naam: string;
  soort: SoortHuis;
}

/** Een huis onder Vastgoed, met zijn eigen pagina's: alle samen, en in secties. */
export interface Huismenu extends Menuhuis {
  paginas: Paginalink[];
  secties: Menusectie[];
}

export interface Menumodule {
  id: string;
  /** Voluit, bovenaan het paneel. */
  naam: string;
  /** Onder het icoon in de balk; hoogstens een tiental tekens. */
  kort: string;
  icoon: Icoon;
  /** Eén zin over wat de module doet, op de startpagina. */
  uitleg: string;
  /** Waar het icoon in de balk naartoe gaat. */
  start: string;
  /** Enkel Vastgoed: een keuze van het huis, met zijn pagina's boven de secties. */
  huizen?: Huismenu[];
  secties: Menusectie[];
  /** Onderaan in de balk, apart van de modules zelf: Beheer. */
  onderaan?: boolean;
}

/** De pagina's van een huis, met wat er na /vastgoed/<nummer> komt, in volgorde en per sectie. */
export const HUISPAGINAS: { deel: string; naam: string; sectie: string | null }[] = [
  { deel: "", naam: "Overzicht", sectie: null },
  { deel: "/plannen", naam: "Plannen", sectie: "Ontwerp" },
  { deel: "/verdiepingen", naam: "Verdiepingen", sectie: "Ontwerp" },
  { deel: "/ruimtes", naam: "Ruimtes", sectie: "Ontwerp" },
  { deel: "/punten", naam: "Punten", sectie: "Ontwerp" },
  { deel: "/technieken", naam: "Technieken", sectie: "Ontwerp" },
  { deel: "/3d", naam: "3D", sectie: "Ontwerp" },
  { deel: "/keuzes", naam: "Keuzes", sectie: "Uitvoering" },
  { deel: "/beslissingen", naam: "Beslissingen", sectie: "Uitvoering" },
  { deel: "/planning", naam: "Planning", sectie: "Uitvoering" },
  { deel: "/werf", naam: "Werf", sectie: "Uitvoering" },
  { deel: "/geld", naam: "Geld", sectie: "Administratie" },
  { deel: "/dossier", naam: "Dossier", sectie: "Administratie" },
  { deel: "/partijen", naam: "Partijen", sectie: "Administratie" },
  { deel: "/toegang", naam: "Toegang", sectie: "Administratie" },
];

/** Het basispad van Laadpalen; de startpagina van de app (/) is van alle modules samen. */
export const LAADPALEN = "/laadpalen";

/** Het basispad van Huishouden, en zijn pagina's. /huishouden zelf stuurt door naar De balans. */
export const HUISHOUDEN = "/huishouden";

export const HUISHOUDENPAGINAS: Paginalink[] = [{ pad: `${HUISHOUDEN}/balans`, naam: "De balans" }];

/** Onder Vastgoed, los van de huizen: de huizen zelf, en de bot voor alle huizen. */
export const VASTGOEDPAGINAS: Paginalink[] = [
  { pad: VASTGOED, naam: "Huizen" },
  { pad: `${VASTGOED}/telegram`, naam: "Telegram" },
];

/** Pagina's in secties, in de volgorde waarin hun sectie voor het eerst voorkomt. */
function inSecties(paginas: (Paginalink & { sectie: string | null })[]): Menusectie[] {
  const secties: Menusectie[] = [];
  for (const { sectie, ...pagina } of paginas) {
    const bestaand = secties.find((kandidaat) => kandidaat.naam === sectie);
    if (bestaand) bestaand.paginas.push(pagina);
    else secties.push({ naam: sectie, paginas: [pagina] });
  }
  return secties;
}

/** De pagina's van een huis, zonder wat zijn soort niet heeft: een bestaand huis heeft geen keuzes, planning of werf. */
export function huismenu(huis: Menuhuis): Huismenu {
  const paginas = HUISPAGINAS.filter((pagina) => {
    const onderdeel = onderdeelVan(pagina.deel);
    return onderdeel === null || heeftOnderdeel(huis.soort, onderdeel);
  }).map((pagina) => ({ pad: huispad(huis.id, pagina.deel), naam: pagina.naam, sectie: pagina.sectie }));
  return {
    id: huis.id,
    naam: huis.naam,
    soort: huis.soort,
    paginas: paginas.map(({ pad, naam }) => ({ pad, naam })),
    secties: inSecties(paginas),
  };
}

/** Het menu dat deze gebruiker te zien krijgt: de modules in volgorde, met Beheer onderaan. */
export function menuVoor(gebruiker: Gebruiker, huizen: Menuhuis[] = []): Menumodule[] {
  const laden: Paginalink[] = [
    { pad: LAADPALEN, naam: "Overzicht" },
    { pad: `${LAADPALEN}/rapporten`, naam: "Rapporten" },
  ];
  if (magInstellingenBeheren(gebruiker)) {
    laden.push(
      // De pagina heet zo, zodat ze niet dezelfde naam heeft als de module.
      { pad: `${LAADPALEN}/laadpunten`, naam: "Laadpunten" },
      { pad: `${LAADPALEN}/vennootschappen`, naam: "Vennootschappen" },
      { pad: `${LAADPALEN}/tarieven`, naam: "Tarieven" },
      { pad: `${LAADPALEN}/instellingen`, naam: "Instellingen" },
    );
  }

  const menu: Menumodule[] = [
    {
      id: "laadpalen",
      naam: "Laadpalen",
      kort: "Laden",
      icoon: "stekker",
      uitleg: "De laadsessies thuis, doorgerekend en per vennootschap gerapporteerd.",
      start: LAADPALEN,
      secties: [{ naam: null, paginas: laden }],
    },
  ];
  if (magBouwZien(gebruiker)) {
    const huismenus = huizen.map(huismenu);
    menu.push({
      id: "vastgoed",
      naam: "Vastgoed",
      kort: "Vastgoed",
      icoon: "huis",
      uitleg: "Onze huizen: van de plannen van de architect tot het woningdossier.",
      start: huismenus[0] ? huispad(huismenus[0].id) : VASTGOED,
      huizen: huismenus,
      secties: [{ naam: "Alle huizen", paginas: VASTGOEDPAGINAS }],
    });
  }
  if (magHuishoudenZien(gebruiker)) {
    menu.push({
      id: "huishouden",
      naam: "Huishouden",
      kort: "Huishouden",
      icoon: "mand",
      uitleg: "De werkstromen van het gezin, eerlijk verdeeld tussen Jan en Sandra.",
      start: HUISHOUDENPAGINAS[0].pad,
      secties: [{ naam: null, paginas: HUISHOUDENPAGINAS }],
    });
  }
  if (magGebruikersBeheren(gebruiker)) {
    menu.push({
      id: "beheer",
      naam: "Beheer",
      kort: "Beheer",
      icoon: "mensen",
      uitleg: "Wie de app mag gebruiken, en met welke rol.",
      start: "/gebruikers",
      secties: [{ naam: null, paginas: [{ pad: "/gebruikers", naam: "Gebruikers" }] }],
      onderaan: true,
    });
  }
  return menu;
}

/** Alle pagina's van één module: die van elk huis, en die van haar secties. */
export function paginasVan(module: Menumodule): Paginalink[] {
  return [...(module.huizen ?? []).flatMap((huis) => huis.paginas), ...module.secties.flatMap((sectie) => sectie.paginas)];
}

/** Alle paden in het menu, om te weten welke link oplicht. */
export function allePaden(menu: Menumodule[]): string[] {
  return menu.flatMap((module) => paginasVan(module).map((pagina) => pagina.pad));
}

/**
 * De module waarin je zit: die met de link die oplicht. Null op een pagina
 * die van geen module is, zoals de startpagina: het paneel toont dan de
 * modules zelf.
 */
export function actieveModule(huidig: string, menu: Menumodule[]): Menumodule | null {
  const actief = actievePagina(huidig, allePaden(menu));
  return menu.find((module) => paginasVan(module).some((pagina) => pagina.pad === actief)) ?? null;
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
