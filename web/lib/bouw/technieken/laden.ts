import "server-only";

import { leesTechniekinstellingen } from "../huizen";
import { lijstGebouwen, lijstPunten, lijstRuimtes, lijstStukken, lijstVerdiepingen } from "../opslag";
import type { Huis } from "../types";
import { sorteerVerdiepingen, verdiepingNaam } from "../weergave";
import { maakVoorstel, standaardInstellingen, type Techniekinstellingen, type Techniekinvoer, type Techniekvoorstel } from "./voorstel";

/** Gewoon een verdieping hoger, als er geen peil is: enkel voor de lengte van een kabel. */
const VERDIEPINGSHOOGTE = 3;

/**
 * Alles wat de pagina Technieken en haar PDF nodig hebben: de verdiepingen met
 * hun ruimtes, de punten, de toestellen bij Inrichten, de bewaarde
 * instellingen (of wat de app zelf kiest), en het voorstel.
 */
export async function laadTechnieken(huis: Huis): Promise<{
  invoer: Techniekinvoer;
  instellingen: Techniekinstellingen;
  /** Zijn de instellingen bewaard, of koos de app ze? */
  bewaard: boolean;
  voorstel: Techniekvoorstel;
  project: string | null;
}> {
  const [gebouwen, verdiepingen, ruimtes, punten, stukken, bewaard] = await Promise.all([
    lijstGebouwen(huis.id),
    lijstVerdiepingen(huis.id),
    lijstRuimtes(huis.id),
    lijstPunten(huis.id),
    lijstStukken(huis.id),
    leesTechniekinstellingen(huis.id),
  ]);
  const invoer: Techniekinvoer = {
    verdiepingen: sorteerVerdiepingen(verdiepingen, gebouwen).map((v) => ({
      id: v.id,
      naam: verdiepingNaam(v, gebouwen),
      gebouwId: v.gebouw_id,
      z0: v.vloerpeil_m ?? v.volgorde * VERDIEPINGSHOOGTE,
      ruimtes: ruimtes
        .filter((r) => r.verdieping_id === v.id)
        .map((r) => ({ id: r.id, naam: r.naam, soort: r.soort, veelhoek: r.veelhoek })),
    })),
    punten,
    stukken,
  };
  const instellingen = bewaard ?? standaardInstellingen(punten, stukken);
  return { invoer, instellingen, bewaard: bewaard !== null, voorstel: maakVoorstel(invoer, instellingen), project: huis.projectnaam };
}
