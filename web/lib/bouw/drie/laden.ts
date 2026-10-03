import "server-only";

import { bevestigdGrondplan } from "../omzetting/referentie";
import {
  leesBestanden,
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
import { CATEGORIEKLEUREN, soortVan } from "../punten";
import { lijstKeuzes, lijstOpties, lijstVoorkeuren } from "../regie-opslag";
import { verdiepingNaam } from "../weergave";
import { STANDAARDDAK, type Dakinstelling } from "./dakregels";
import { materiaalkeuzes, type Materiaalkeuze } from "./materialen";
import type { Invoerverdieping } from "./model";

/**
 * Alles wat het 3D-scherm nodig heeft, in één keer en als gewone gegevens:
 * de gebouwen met hun dak, de verdiepingen met hun ruimtes, muren en
 * openingen, de materialen uit de keuzes en de punten. Het model zelf maakt
 * de browser, zodat een ander dak of materiaal meteen te zien is.
 */

export interface Drieverdieping extends Invoerverdieping {
  /** Heeft het grondplan een bevestigde omzetting, en daarin muren? */
  omgezet: boolean;
  metMuren: boolean;
  grondplanId: number | null;
}

export interface Driegegevens {
  gebouwen: { id: number; naam: string; dak: Dakinstelling }[];
  verdiepingen: Drieverdieping[];
  materialen: Materiaalkeuze[];
  punten: { id: number; verdiepingId: number; x: number; y: number; hoogte: number | null; kleur: string; naam: string }[];
}

export async function laadDrie(huisId: number, ik: string): Promise<Driegegevens> {
  const [gebouwen, daken, verdiepingen, plannen, ruimtes, keuzes, opties, voorkeuren, punten] = await Promise.all([
    lijstGebouwen(huisId),
    lijstDaken(huisId),
    lijstVerdiepingen(huisId),
    lijstPlannen(huisId),
    lijstRuimtes(huisId),
    lijstKeuzes(huisId),
    lijstOpties(huisId),
    lijstVoorkeuren(huisId),
    lijstPunten(huisId),
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
    gebouwen: gebouwen.map((gebouw) => ({ id: gebouw.id, naam: gebouw.naam, dak: daken.get(gebouw.id) ?? STANDAARDDAK })),
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
        omgezet: grondplan !== null,
        metMuren: (opgeslagen?.muren.length ?? 0) > 0,
        grondplanId: grondplan?.plan.id ?? null,
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
        kleur: CATEGORIEKLEUREN[soort?.categorie ?? "andere"],
        naam: soort?.naam ?? punt.soort,
      };
    }),
  };
}
