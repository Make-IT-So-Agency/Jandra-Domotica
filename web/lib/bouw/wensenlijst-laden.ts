import "server-only";

import { leesProject, lijstGebouwen, lijstPunten, lijstRuimtes, lijstVerdiepingen } from "./opslag";
import { maakWensenlijst, type Wensenlijst } from "./punten";
import { sorteerVerdiepingen, verdiepingNaam } from "./weergave";

/** De wensenlijst van het hele project, met de projectnaam voor op de PDF. */
export async function laadWensenlijst(): Promise<{ lijst: Wensenlijst; project: string | null }> {
  const [gebouwen, verdiepingen, ruimtes, punten, project] = await Promise.all([
    lijstGebouwen(),
    lijstVerdiepingen(),
    lijstRuimtes(),
    lijstPunten(),
    leesProject(),
  ]);
  const lijst = maakWensenlijst(
    sorteerVerdiepingen(verdiepingen, gebouwen).map((v) => ({
      id: v.id,
      naam: verdiepingNaam(v, gebouwen),
      plafondhoogte_m: v.plafondhoogte_m,
    })),
    ruimtes.map((r) => ({
      id: r.id,
      naam: r.naam,
      veelhoek: r.veelhoek,
      verdieping_id: r.verdieping_id,
      plafondhoogte_m: r.plafondhoogte_m,
    })),
    punten,
  );
  return { lijst, project: project.projectnaam };
}
