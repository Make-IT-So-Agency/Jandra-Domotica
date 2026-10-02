import { datum as leesDatum, sleutelVan } from "./invoer";
import { gelukt, isSoortPlan, mislukt, type SoortPlan, type Uitkomst } from "./types";

/**
 * De regels voor het inlezen van een dossier: wat de browser mag sturen, en
 * bij welk bestaand plan elk blad hoort. Puur, zodat het nakijkscherm in de
 * browser dezelfde koppeling toont als de server straks maakt.
 */

export interface Dossierblad {
  pagina: number;
  titel: string;
  soort: SoortPlan;
  /** null: het hele project, zoals het inplantingsplan. */
  gebouw: string | null;
  verdieping: string | null;
  bladcode: string | null;
}

export interface Dossierverdieping {
  gebouw: string;
  naam: string;
  volgorde: number;
  vloerpeil_m: number | null;
  plafondhoogte_m: number | null;
  verdiepingshoogte_m: number | null;
}

export interface Dossieraanvraag {
  label: string;
  datum: string | null;
  bladen: Dossierblad[];
  verdiepingen: Dossierverdieping[];
}

export interface Dossieruitkomst {
  plannen: number;
  nieuwePlannen: number;
  verdiepingen: number;
  gebouwen: number;
}

/** Een plan dat er al is, zoals de koppeling het nodig heeft. */
export interface Bestaandplan {
  id: number;
  titel: string;
  bladcode: string | null;
  /** De naam van het gebouw, of null voor het hele project. */
  gebouw: string | null;
  labels: string[];
}

export interface Bladplan {
  pagina: number;
  /** Het plan dat er al is, of null voor een nieuw plan. */
  plan: { id: number; titel: string } | null;
}

const MAX_BLADEN = 300;

function naam(waarde: unknown, maximum: number): string | null {
  const schoon = String(waarde ?? "").trim().replace(/\s+/g, " ");
  return schoon.length > 0 && schoon.length <= maximum ? schoon : null;
}

function hoogte(waarde: unknown, min: number, max: number): number | null | "fout" {
  if (waarde === null || waarde === undefined || waarde === "") return null;
  const getal = Number(waarde);
  return Number.isFinite(getal) && getal > min && getal <= max ? getal : "fout";
}

/** Kijkt na wat de browser stuurt. Een serveractie kan van overal aangeroepen worden. */
export function controleerAanvraag(ruw: unknown): Uitkomst<Dossieraanvraag> {
  const aanvraag = (ruw ?? {}) as Partial<Record<keyof Dossieraanvraag, unknown>>;
  const label = naam(aanvraag.label, 40);
  if (!label) return mislukt("Geef de versie een label van hoogstens 40 tekens, bv. v1 of vergunning.");
  const datum = aanvraag.datum ? leesDatum(String(aanvraag.datum)) : null;

  if (!Array.isArray(aanvraag.bladen) || aanvraag.bladen.length === 0) return mislukt("Vink minstens één blad aan.");
  if (aanvraag.bladen.length > MAX_BLADEN) return mislukt(`Hoogstens ${MAX_BLADEN} bladen per dossier.`);
  const bladen: Dossierblad[] = [];
  const paginas = new Set<number>();
  for (const ruwBlad of aanvraag.bladen as Record<string, unknown>[]) {
    const pagina = Number(ruwBlad?.pagina);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 9999 || paginas.has(pagina)) {
      return mislukt("Een blad heeft een ongeldig nummer.");
    }
    paginas.add(pagina);
    const titel = naam(ruwBlad.titel, 120);
    if (!titel) return mislukt(`Blad ${pagina} heeft geen titel.`);
    const soort = String(ruwBlad.soort ?? "");
    if (!isSoortPlan(soort)) return mislukt(`Blad ${pagina}: kies wat voor plan het is.`);
    const gebouw = ruwBlad.gebouw ? naam(ruwBlad.gebouw, 60) : null;
    const verdieping = ruwBlad.verdieping ? naam(ruwBlad.verdieping, 60) : null;
    if (verdieping && !gebouw) return mislukt(`Blad ${pagina}: een verdieping hoort bij een gebouw.`);
    const bladcode = ruwBlad.bladcode ? naam(ruwBlad.bladcode, 60) : null;
    if (bladcode && !/^[\p{L}\d_.-]+$/u.test(bladcode)) return mislukt(`Blad ${pagina}: de bladcode is ongeldig.`);
    bladen.push({ pagina, titel, soort, gebouw, verdieping, bladcode });
  }
  const codes = bladen.map((blad) => blad.bladcode).filter((code): code is string => code !== null);
  if (new Set(codes.map(sleutelVan)).size !== codes.length) return mislukt("Twee bladen hebben dezelfde bladcode.");

  const verdiepingen: Dossierverdieping[] = [];
  const ruweVerdiepingen = Array.isArray(aanvraag.verdiepingen) ? aanvraag.verdiepingen : [];
  if (ruweVerdiepingen.length > 50) return mislukt("Hoogstens 50 verdiepingen per dossier.");
  for (const ruwe of ruweVerdiepingen as Record<string, unknown>[]) {
    const gebouw = naam(ruwe?.gebouw, 60);
    const verdieping = naam(ruwe?.naam, 60);
    if (!gebouw || !verdieping) return mislukt("Elke verdieping heeft een naam en een gebouw.");
    const vloerpeil = hoogte(ruwe.vloerpeil_m, -100, 100);
    const plafond = hoogte(ruwe.plafondhoogte_m, 0, 20);
    const totaal = hoogte(ruwe.verdiepingshoogte_m, 0, 20);
    if (vloerpeil === "fout" || plafond === "fout" || totaal === "fout") {
      return mislukt(`${gebouw} · ${verdieping}: een peil of hoogte klopt niet.`);
    }
    verdiepingen.push({
      gebouw,
      naam: verdieping,
      volgorde: Math.round(Number(ruwe.volgorde) || 0),
      vloerpeil_m: vloerpeil,
      plafondhoogte_m: plafond,
      verdiepingshoogte_m: totaal,
    });
  }

  return gelukt({ label, datum, bladen, verdiepingen });
}

/**
 * Bij welk bestaand plan elk blad hoort, en wat het inlezen in de weg zou
 * staan. Eerst op bladcode; zonder bladcode op dezelfde titel in hetzelfde
 * gebouw.
 */
export function koppelBladen(
  aanvraag: Pick<Dossieraanvraag, "label" | "bladen">,
  plannen: Bestaandplan[],
): { bladen: Bladplan[]; fouten: string[] } {
  const zelfdeGebouw = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : sleutelVan(a) === sleutelVan(b);
  const fouten: string[] = [];
  const bezet = new Set<number>();
  const bladen = aanvraag.bladen.map((blad) => {
    const opCode = blad.bladcode
      ? plannen.find((plan) => plan.bladcode !== null && sleutelVan(plan.bladcode) === sleutelVan(blad.bladcode!))
      : undefined;
    const opTitel = opCode
      ? undefined
      : plannen.find(
          (plan) =>
            (plan.bladcode === null || blad.bladcode === null) &&
            zelfdeGebouw(plan.gebouw, blad.gebouw) &&
            sleutelVan(plan.titel) === sleutelVan(blad.titel) &&
            !bezet.has(plan.id),
        );
    const plan = opCode ?? opTitel ?? null;
    if (plan) {
      if (bezet.has(plan.id)) fouten.push(`Blad ${blad.pagina} en een ander blad horen allebei bij "${plan.titel}".`);
      bezet.add(plan.id);
      if (plan.labels.includes(aanvraag.label)) {
        fouten.push(`"${plan.titel}" heeft al een versie "${aanvraag.label}". Kies een ander label.`);
      }
    }
    return { pagina: blad.pagina, plan: plan ? { id: plan.id, titel: plan.titel } : null };
  });
  return { bladen, fouten };
}
