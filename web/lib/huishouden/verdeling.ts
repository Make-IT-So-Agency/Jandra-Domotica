import { ander, type Beslissing, type Persoon, type Ronde } from "./balans";
import type { Voorstelkaart } from "./voorstel";

/**
 * Stap 5, het leven na de verdeling: een kaart tijdelijk uitlenen, een vaste
 * kaart doorgeven, en een nieuwe ronde. Puur, zodat elke regel apart te
 * testen valt (zie tests/huishouden-verdeling.test.ts).
 */

/** Wie de kaart nu doet, als die een persoon is. */
function owner(item: Pick<Voorstelkaart, "eigenaar">): Persoon | null {
  return item.eigenaar === "jan" || item.eigenaar === "sandra" ? item.eigenaar : null;
}

/**
 * Tijdelijk uitlenen kan de owner, bij een kaart via het spel of een vaste
 * kaart, zolang de verdeling vastligt. Eigen tijd, uitbesteed en samen niet.
 */
export function magUitlenen(
  ronde: Pick<Ronde, "fase">,
  item: Pick<Voorstelkaart, "eigenaar" | "regel">,
  ik: Persoon,
): Beslissing {
  if (ronde.fase !== "vastgelegd") return { ok: false, reden: "Uitlenen kan pas als de verdeling vastligt." };
  if (item.regel === "elk" || item.regel === "samen" || owner(item) === null) {
    return { ok: false, reden: "Deze kaart kan je niet uitlenen." };
  }
  if (owner(item) !== ik) return { ok: false, reden: "Enkel wie de kaart heeft, kan ze uitlenen." };
  return { ok: true };
}

/** Doorgeven aan de ander kan de owner, enkel bij een vaste kaart. Dat is voor altijd. */
export function magDoorgeven(
  ronde: Pick<Ronde, "fase">,
  item: Pick<Voorstelkaart, "eigenaar" | "regel">,
  ik: Persoon,
): Beslissing {
  if (ronde.fase !== "vastgelegd") return { ok: false, reden: "Doorgeven kan pas als de verdeling vastligt." };
  if (item.regel !== "vast") return { ok: false, reden: "Enkel een vaste kaart kan je doorgeven." };
  if (owner(item) !== ik) return { ok: false, reden: "Enkel wie de kaart heeft, kan ze doorgeven." };
  return { ok: true };
}

/** Naar wie een kaart gaat als je ze uitleent of doorgeeft: altijd de ander. */
export function naarDeAnder(ik: Persoon): Persoon {
  return ander(ik);
}

/** Een nieuwe ronde kan als de verdeling vastligt. */
export function magNieuweRonde(ronde: Pick<Ronde, "fase">): Beslissing {
  if (ronde.fase !== "vastgelegd") {
    return { ok: false, reden: "Een nieuwe ronde start je in stap 5, als de verdeling vastligt." };
  }
  return { ok: true };
}
