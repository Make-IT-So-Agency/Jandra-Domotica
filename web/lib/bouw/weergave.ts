import type { Gebouw, Plan, Verdieping } from "./types";

/**
 * Hoe gebouwen, verdiepingen en plannen in lijsten en keuzelijsten staan.
 * Puur, voor de server en de browser.
 */

/**
 * De naam van een verdieping in een keuzelijst. Met één gebouw volstaat
 * "Gelijkvloers"; met een bijgebouw erbij wordt het "Woning · Gelijkvloers".
 */
export function verdiepingNaam(verdieping: Verdieping, gebouwen: Gebouw[]): string {
  if (gebouwen.length <= 1) return verdieping.naam;
  const gebouw = gebouwen.find((g) => g.id === verdieping.gebouw_id);
  return gebouw ? `${gebouw.naam} · ${verdieping.naam}` : verdieping.naam;
}

/** Verdiepingen per gebouw in de volgorde van de gebouwen, en binnen een gebouw op volgorde. */
export function sorteerVerdiepingen(verdiepingen: Verdieping[], gebouwen: Gebouw[]): Verdieping[] {
  const plaats = new Map(gebouwen.map((gebouw, index) => [gebouw.id, index]));
  return [...verdiepingen].sort(
    (a, b) =>
      (plaats.get(a.gebouw_id) ?? 99) - (plaats.get(b.gebouw_id) ?? 99) ||
      a.volgorde - b.volgorde ||
      a.naam.localeCompare(b.naam, "nl"),
  );
}

const natuurlijk = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });

/**
 * Plannen per gebouw (wat over het hele project gaat achteraan), en daarbinnen
 * in de volgorde van de architect: op bladcode, anders op titel.
 */
export function sorteerPlannen<T extends Pick<Plan, "gebouw_id" | "bladcode" | "titel">>(
  plannen: T[],
  gebouwen: Gebouw[],
): T[] {
  const plaats = new Map(gebouwen.map((gebouw, index) => [gebouw.id, index]));
  const gebouwplaats = (plan: T) => (plan.gebouw_id === null ? 999 : (plaats.get(plan.gebouw_id) ?? 998));
  return [...plannen].sort(
    (a, b) =>
      gebouwplaats(a) - gebouwplaats(b) ||
      Number(a.bladcode === null) - Number(b.bladcode === null) ||
      natuurlijk.compare(a.bladcode ?? "", b.bladcode ?? "") ||
      natuurlijk.compare(a.titel, b.titel),
  );
}

/** Het volgende label: v1, v2, … na het hoogste vN dat er al is. */
export function volgendLabel(labels: string[]): string {
  const nummers = labels.map((label) => label.match(/^v(\d+)$/i)?.[1]).filter(Boolean).map(Number);
  return `v${(nummers.length > 0 ? Math.max(...nummers) : 0) + 1}`;
}
