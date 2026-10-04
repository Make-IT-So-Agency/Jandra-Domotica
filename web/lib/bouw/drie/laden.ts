import "server-only";

import { bevestigdGrondplan } from "../omzetting/referentie";
import {
  leesBestanden,
  leesInplanting,
  leesMurenEnOpeningen,
  lijstDaken,
  lijstGebouwen,
  lijstOmzettingen,
  lijstPlannen,
  lijstPunten,
  lijstRuimtes,
  lijstVerdiepingen,
} from "../opslag";
import { tijdelijkeUrl } from "../opslagruimte";
import { CATEGORIEKLEUREN, soortVan, type Categorie } from "../punten";
import { lijstKeuzes, lijstOpties, lijstVoorkeuren } from "../regie-opslag";
import type { SoortPlan } from "../types";
import { verdiepingNaam } from "../weergave";
import { STANDAARDDAK, type Dakinstelling } from "./dakregels";
import { materiaalkeuzes, type Materiaalkeuze } from "./materialen";
import type { Invoerverdieping } from "./model";
import type { Georef } from "./omgeving";
import type { Plaatsing } from "./plaatsing";

/**
 * Alles wat het 3D-scherm nodig heeft, in één keer en als gewone gegevens:
 * de gebouwen met hun dak en hun plaats, de verdiepingen met hun ruimtes,
 * muren en openingen, de materialen uit de keuzes, de punten, en welk
 * inplantingsplan er is. Het model zelf maakt de browser, zodat een ander dak
 * of materiaal meteen te zien is; het inplantingsplan leest de browser ook
 * zelf, met pdf.js.
 */

export interface Drieverdieping extends Invoerverdieping {
  /** Heeft het grondplan een bevestigde omzetting, en daarin muren? */
  omgezet: boolean;
  metMuren: boolean;
  grondplanId: number | null;
  /** Met welke regels de omzetting gemaakt werd: vóór 3 zocht ze nog geen trappen. */
  werkwijze: number | null;
}

/** Een plan dat als inplantingsplan kan dienen, met zijn nieuwste versie. */
export interface Inplantingsplan {
  id: number;
  titel: string;
  soort: SoortPlan;
  versie: { versieId: number; bestandId: number; pagina: number };
}

export interface Driegegevens {
  /** Met de bewaarde plaats op het terrein, of null: dan zoekt het scherm het gebouw zelf. */
  gebouwen: { id: number; naam: string; dak: Dakinstelling; plaats: Plaatsing | null }[];
  verdiepingen: Drieverdieping[];
  materialen: Materiaalkeuze[];
  punten: { id: number; verdiepingId: number; x: number; y: number; hoogte: number | null; categorie: Categorie; kleur: string; naam: string }[];
  inplanting: {
    /** Het bewaarde plan en zijn schaal (N van 1/N). */
    planId: number | null;
    schaal: number | null;
    /** De inplantingsplannen eerst, dan de plannen van het soort Andere. */
    plannen: Inplantingsplan[];
  };
  omgeving: {
    /** Of er een adres is: enkel dan haalt het scherm de omgeving op. Het adres zelf blijft op de server. */
    metAdres: boolean;
    /** Waar het terrein op de kaart ligt, als het bewaard is. */
    georef: Georef | null;
  };
}

export async function laadDrie(huisId: number, ik: string, metAdres = false): Promise<Driegegevens> {
  const [gebouwen, daken, verdiepingen, plannen, ruimtes, keuzes, opties, voorkeuren, punten, inplanting] = await Promise.all([
    lijstGebouwen(huisId),
    lijstDaken(huisId),
    lijstVerdiepingen(huisId),
    lijstPlannen(huisId),
    lijstRuimtes(huisId),
    lijstKeuzes(huisId),
    lijstOpties(huisId),
    lijstVoorkeuren(huisId),
    lijstPunten(huisId),
    leesInplanting(huisId),
  ]);

  const omzettingen = await lijstOmzettingen(plannen.flatMap((plan) => plan.versies.map((versie) => versie.id)));
  const bevestigd = new Set(omzettingen.map((omzetting) => omzetting.planversie_id));
  const grondplannen = new Map(verdiepingen.map((v) => [v.id, bevestigdGrondplan(plannen, v.id, bevestigd)]));
  const bewaard = await leesMurenEnOpeningen(
    [...grondplannen.values()].flatMap((grondplan) => (grondplan ? [grondplan.versie.id] : [])),
  );

  // Een foto toont de browser als textuur, via een ondertekende URL van een uur.
  const bestanden = await leesBestanden(
    huisId,
    opties.flatMap((optie) => (optie.foto_bestand_id ? [optie.foto_bestand_id] : [])),
  );
  const fotos = new Map(
    (
      await Promise.all(
        bestanden.map(async (bestand) => [bestand.id, await tijdelijkeUrl(bestand.pad, 3600).catch(() => null)] as const),
      )
    ).filter((paar): paar is readonly [number, string] => paar[1] !== null),
  );

  return {
    gebouwen: gebouwen.map((gebouw) => ({
      id: gebouw.id,
      naam: gebouw.naam,
      dak: daken.get(gebouw.id) ?? STANDAARDDAK,
      plaats: inplanting.plaatsen.get(gebouw.id) ?? null,
    })),
    verdiepingen: verdiepingen.map((verdieping) => {
      const grondplan = grondplannen.get(verdieping.id) ?? null;
      const opgeslagen = grondplan ? bewaard.get(grondplan.versie.id) : undefined;
      return {
        id: verdieping.id,
        naam: verdiepingNaam(verdieping, gebouwen),
        gebouwId: verdieping.gebouw_id,
        volgorde: verdieping.volgorde,
        vloerpeil: verdieping.vloerpeil_m,
        plafondhoogte: verdieping.plafondhoogte_m,
        verdiepingshoogte: verdieping.verdiepingshoogte_m,
        ruimtes: ruimtes
          .filter((ruimte) => ruimte.verdieping_id === verdieping.id)
          .map((ruimte) => ({
            id: ruimte.id,
            naam: ruimte.naam,
            soort: ruimte.soort,
            ringen: ruimte.veelhoek,
            plafondhoogte: ruimte.plafondhoogte_m,
          })),
        muren: opgeslagen?.muren ?? [],
        openingen: opgeslagen?.openingen ?? [],
        trappen: opgeslagen?.trappen ?? [],
        trapstanden: verdieping.trapstanden ?? [],
        omgezet: grondplan !== null,
        metMuren: (opgeslagen?.muren.length ?? 0) > 0,
        grondplanId: grondplan?.plan.id ?? null,
        werkwijze: opgeslagen?.werkwijze ?? null,
      };
    }),
    materialen: materiaalkeuzes(keuzes, opties, voorkeuren, fotos, ik),
    punten: punten.map((punt) => {
      const soort = soortVan(punt.soort);
      return {
        id: punt.id,
        verdiepingId: punt.verdieping_id,
        x: punt.x_m,
        y: punt.y_m,
        hoogte: punt.hoogte_m,
        categorie: soort?.categorie ?? "andere",
        kleur: CATEGORIEKLEUREN[soort?.categorie ?? "andere"],
        naam: soort?.naam ?? punt.soort,
      };
    }),
    inplanting: {
      planId: inplanting.planId,
      schaal: inplanting.schaal,
      plannen: plannen
        .filter((plan) => plan.soort === "inplanting" || plan.soort === "andere" || plan.id === inplanting.planId)
        .sort((a, b) => Number(b.soort === "inplanting") - Number(a.soort === "inplanting"))
        .flatMap((plan) => {
          // De nieuwste versie: de versies staan van oud naar nieuw.
          const versie = plan.versies.at(-1);
          return versie
            ? [{ id: plan.id, titel: plan.titel, soort: plan.soort, versie: { versieId: versie.id, bestandId: versie.bestand_id, pagina: versie.pagina } }]
            : [];
        }),
    },
    omgeving: { metAdres, georef: inplanting.georef },
  };
}
