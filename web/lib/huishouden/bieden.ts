import { PERSONEN, actieveKaarten, type Invoer, type Kaart, type Persoon } from "./balans";
import type { Bod } from "./voorstel";

/**
 * Stap 3, bieden: als jullie allebei "Wil ik" zeggen op dezelfde kaart,
 * verdeelt elk 100 punten naar hoe graag. Puur, zodat R18 tot R22 apart te
 * testen vallen (zie tests/huishouden-bieden.test.ts).
 */

export const BUDGET = 100;
export const STAP = 5;

/** De kaarten die botsen: actief, via het spel, en allebei "Wil ik". */
export function botsendeKaarten<T extends Pick<Kaart, "id" | "geschrapt" | "verdeling">>(
  kaarten: T[],
  invoer: Record<Persoon, ReadonlyMap<number, Pick<Invoer, "claim">>>,
): T[] {
  return actieveKaarten(kaarten).filter(
    (kaart) =>
      kaart.verdeling === "spel" &&
      PERSONEN.every((persoon) => invoer[persoon].get(kaart.id)?.claim === "wil"),
  );
}

/** Hoeveel punten iemand verdeeld heeft, enkel op kaarten die nu botsen (R21). */
export function verdeeld(biedingen: ReadonlyMap<number, number>, botsend: ReadonlySet<number>, behalve?: number): number {
  let som = 0;
  for (const [kaartId, punten] of biedingen) {
    if (botsend.has(kaartId) && kaartId !== behalve) som += punten;
  }
  return som;
}

/**
 * Een bod binnen het budget: in stappen van 5, tussen 0 en wat er nog over
 * is. Wie al 70 bood en een andere kaart naar 50 schuift, stopt op 30 (R18).
 */
export function begrens(gevraagd: number, alVerdeeld: number): number {
  const rest = Math.max(0, BUDGET - alVerdeeld);
  const afgerond = Math.round((Number.isFinite(gevraagd) ? gevraagd : 0) / STAP) * STAP;
  return Math.min(Math.max(0, afgerond), Math.floor(rest / STAP) * STAP);
}

/** De biedingen van allebei, enkel voor kaarten die nu botsen; wie niets bood, bood 0 (R20, R21). */
export function biedingenVoorVoorstel(
  biedingen: Record<Persoon, ReadonlyMap<number, number>>,
  botsend: ReadonlySet<number>,
): Map<number, Bod> {
  return new Map(
    [...botsend].map((kaartId) => [
      kaartId,
      { jan: biedingen.jan.get(kaartId) ?? 0, sandra: biedingen.sandra.get(kaartId) ?? 0 },
    ]),
  );
}

/** Is stap 3 af? Zonder botsende kaarten meteen (R22), anders als allebei klaar zijn. */
export function biedenAf(aantalBotsend: number, klaar: Record<Persoon, boolean>): boolean {
  return aantalBotsend === 0 || (klaar.jan && klaar.sandra);
}

/** Wat de pagina in stap 3 meekrijgt: enkel je eigen biedingen; die van de ander zie je pas in het voorstel. */
export interface Stap3Gegevens {
  kaarten: { kaart: Kaart; uren: number; mentaal: number }[];
  mijn: Record<number, number>;
  klaar: Record<Persoon, boolean>;
}
