import "server-only";

import { lijstGebouwen, lijstPunten, lijstRuimtes, lijstVerdiepingen } from "./opslag";
import { maakWensenlijst, type Vak, type Wensenlijst } from "./punten";
import type { Huis } from "./types";
import { sorteerVerdiepingen, verdiepingNaam } from "./weergave";

/** De wensenlijst van een huis voor een vakgebied, met de projectnaam voor op de PDF. */
export async function laadWensenlijst(huis: Huis, vak: Vak): Promise<{ lijst: Wensenlijst; project: string | null }> {
  const [gebouwen, verdiepingen, ruimtes, punten] = await Promise.all([
    lijstGebouwen(huis.id),
    lijstVerdiepingen(huis.id),
    lijstRuimtes(huis.id),
    lijstPunten(huis.id),
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
    vak,
  );
  return { lijst, project: huis.projectnaam };
}
