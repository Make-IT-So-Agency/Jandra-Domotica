import type { SoortPartij } from "./types";

/**
 * Wat er nog moet gebeuren voor het bouwproject klaarstaat, voor de lijst
 * bovenaan het overzicht. Puur: de pagina geeft de stand, deze functie zegt
 * wat er ontbreekt.
 */

export interface Bouwstand {
  projectnaam: string | null;
  verdiepingen: number;
  plannen: { id: number; titel: string; versies: number }[];
  partijen: { soort: SoortPartij }[];
}

export interface Taak {
  tekst: string;
  link: string;
  knop: string;
}

export function takenVoorBouw(stand: Bouwstand): Taak[] {
  const taken: Taak[] = [];

  if (!stand.projectnaam) {
    taken.push({ tekst: "Geef het project een naam.", link: "/bouw#project", knop: "Invullen" });
  }
  if (stand.verdiepingen === 0) {
    taken.push({
      tekst: "Maak de verdiepingen aan, bijvoorbeeld gelijkvloers en verdieping.",
      link: "/bouw/verdiepingen",
      knop: "Verdiepingen",
    });
  }
  if (stand.plannen.length === 0) {
    taken.push({ tekst: "Laad het eerste plan van de architect op.", link: "/bouw/plannen", knop: "Plannen" });
  }
  for (const plan of stand.plannen) {
    if (plan.versies === 0) {
      taken.push({
        tekst: `"${plan.titel}" heeft nog geen versie.`,
        link: `/bouw/plannen/${plan.id}`,
        knop: "Versie opladen",
      });
    }
  }
  if (!stand.partijen.some((partij) => partij.soort === "architect")) {
    taken.push({ tekst: "Voeg de architect toe bij de partijen.", link: "/bouw/partijen", knop: "Partijen" });
  }

  return taken;
}
