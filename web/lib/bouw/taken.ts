import { dagenTekst } from "./kalender";
import type { SoortPartij, SoortPlan } from "./types";

/**
 * Wat er nog moet gebeuren voor het bouwproject klaarstaat, voor de lijst
 * bovenaan het overzicht. Puur: de pagina geeft de stand, deze functie zegt
 * wat er ontbreekt.
 */

export interface Bouwstand {
  projectnaam: string | null;
  verdiepingen: number;
  plannen: {
    id: number;
    titel: string;
    versies: number;
    soort?: SoortPlan;
    /** Is een versie omgezet naar ruimtes: geen, enkel een oudere, of de laatste? */
    omgezet?: "geen" | "oud" | "laatste";
  }[];
  partijen: { soort: SoortPartij }[];
  /** De open keuzes met een deadline, met het aantal dagen tot die deadline. */
  deadlines?: { keuzeId: number; titel: string; dagen: number }[];
  /** De facturen die nog betaald moeten worden: wat, en het aantal dagen tot de vervaldag. */
  facturen?: { factuurId: number; wat: string; dagen: number }[];
  /** Wat partijen via hun link instuurden en nog wacht: dossiers, en offertes of facturen. */
  inzendingen?: { plannen: number; geld: number };
  /** De open actiepunten met een deadline: wat, wie, en het aantal dagen tot de deadline. */
  actiepunten?: { puntId: number; titel: string; wie: string | null; dagen: number }[];
  /** Opleverpunten die een aannemer hersteld meldde, en die wij nog moeten nakijken. */
  nakijken?: number;
}

/** Zo ver vooruit komt een deadline bij "nog te doen". */
export const DEADLINE_VOORUIT_DAGEN = 14;

/** Zo ver vooruit komt een factuur bij "nog te doen". */
export const FACTUUR_VOORUIT_DAGEN = 7;

/** Zo ver vooruit komt een actiepunt bij "nog te doen". */
export const ACTIEPUNT_VOORUIT_DAGEN = 2;

export interface Taak {
  tekst: string;
  link: string;
  knop: string;
}

export function takenVoorBouw(stand: Bouwstand): Taak[] {
  const taken: Taak[] = [];

  // Wat een datum heeft, eerst: een levertermijn wacht niet.
  for (const deadline of [...(stand.deadlines ?? [])].sort((a, b) => a.dagen - b.dagen)) {
    if (deadline.dagen > DEADLINE_VOORUIT_DAGEN) continue;
    taken.push({
      tekst:
        deadline.dagen < 0
          ? `"${deadline.titel}": de deadline is ${-deadline.dagen === 1 ? "1 dag" : `${-deadline.dagen} dagen`} voorbij.`
          : `"${deadline.titel}": beslissen ${dagenTekst(deadline.dagen)}.`,
      link: `/bouw/keuzes/${deadline.keuzeId}`,
      knop: "Kiezen",
    });
  }

  for (const factuur of [...(stand.facturen ?? [])].sort((a, b) => a.dagen - b.dagen)) {
    if (factuur.dagen > FACTUUR_VOORUIT_DAGEN) continue;
    const wat = factuur.wat.charAt(0).toLocaleUpperCase("nl-BE") + factuur.wat.slice(1);
    taken.push({
      tekst:
        factuur.dagen < 0
          ? `${wat}: ${-factuur.dagen === 1 ? "1 dag" : `${-factuur.dagen} dagen`} te laat.`
          : `${wat}: betalen ${dagenTekst(factuur.dagen)}.`,
      link: "/bouw/geld/facturen",
      knop: "Betalen",
    });
  }

  for (const punt of [...(stand.actiepunten ?? [])].sort((a, b) => a.dagen - b.dagen)) {
    if (punt.dagen > ACTIEPUNT_VOORUIT_DAGEN) continue;
    const wat = `Actiepunt "${punt.titel}"${punt.wie ? ` (${punt.wie})` : ""}`;
    taken.push({
      tekst:
        punt.dagen < 0
          ? `${wat}: ${-punt.dagen === 1 ? "1 dag" : `${-punt.dagen} dagen`} over tijd.`
          : `${wat}: klaar tegen ${dagenTekst(punt.dagen)}.`,
      link: "/bouw/werf/actiepunten",
      knop: "Bekijken",
    });
  }

  if (stand.nakijken) {
    taken.push({
      tekst:
        stand.nakijken === 1
          ? "Een opleverpunt is hersteld gemeld: kijk het na."
          : `${stand.nakijken} opleverpunten zijn hersteld gemeld: kijk ze na.`,
      link: "/bouw/werf/oplevering",
      knop: "Nakijken",
    });
  }

  const { plannen: dossiers = 0, geld = 0 } = stand.inzendingen ?? {};
  if (dossiers > 0) {
    taken.push({
      tekst: dossiers === 1 ? "Er wacht een ingestuurd dossier." : `Er wachten ${dossiers} ingestuurde dossiers.`,
      link: "/bouw/plannen#inzendingen",
      knop: "Inlezen",
    });
  }
  if (geld > 0) {
    taken.push({
      tekst: geld === 1 ? "Er wacht een ingestuurde offerte of factuur." : `Er wachten ${geld} ingestuurde offertes en facturen.`,
      link: "/bouw/geld#inzendingen",
      knop: "Inboeken",
    });
  }

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
    } else if (plan.soort === "grondplan" && plan.omgezet === "geen") {
      taken.push({
        tekst: `Zet "${plan.titel}" om naar ruimtes.`,
        link: `/bouw/plannen/${plan.id}/omzetten`,
        knop: "Omzetten",
      });
    } else if (plan.soort === "grondplan" && plan.omgezet === "oud") {
      taken.push({
        tekst: `De nieuwste versie van "${plan.titel}" is nog niet omgezet.`,
        link: `/bouw/plannen/${plan.id}/omzetten`,
        knop: "Nakijken",
      });
    }
  }
  if (!stand.partijen.some((partij) => partij.soort === "architect")) {
    taken.push({ tekst: "Voeg de architect toe bij de partijen.", link: "/bouw/partijen", knop: "Partijen" });
  }

  return taken;
}
