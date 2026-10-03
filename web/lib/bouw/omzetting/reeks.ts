import type { Bevestiging } from "./bevestigen";
import { naarHuis, type Kalibratie } from "./geometrie";
import type { Planinfo } from "./referentie";
import { vergelijkRuimtes, type Oudruimte, type Ruimteverschil } from "./ruimtediff";
import { MARGE, bewijs } from "./schaal";
import type { Blad, Ruimtevoorstel, Voorstel, Xy } from "./types";
import { lijnUitOpLijnen, lijnUitOpNamen, muurlijnen, type Lijnstuk } from "./uitlijnen";

/**
 * Alle grondplannen in één keer omzetten: welke plannen meedoen, in welke
 * volgorde, en wanneer een plan zonder nakijken bevestigd mag worden. Puur,
 * met tests; de pagina leest de PDF's en roept dit aan.
 *
 * Elk plan doorloopt dezelfde stappen als in het nakijkscherm: lezen,
 * uitlijnen op de referentie, de namen van bestaande ruimtes overnemen. Enkel
 * wat daar met de hand zou gebeuren, gebeurt hier niet: een plan waarbij iets
 * niet zeker is, krijgt een ⚠ en een link naar het nakijkscherm.
 */

/** Vanaf deze zekerheid ligt een blad zeker juist op zijn referentie. */
export const ZEKER_UITGELIJND = 0.15;

export interface Verdiepinginfo {
  id: number;
  naam: string;
  gebouw_id: number;
  vloerpeil_m: number | null;
  volgorde: number;
}

export interface Gebouwinfo {
  id: number;
  naam: string;
}

export interface Reeksplan {
  plan: Planinfo;
  /** De nieuwste versie: die wordt omgezet. */
  versie: Planinfo["versies"][number];
  verdieping: Verdiepinginfo;
  gebouw: Gebouwinfo | null;
  /** Aan deze verdieping hangt nog een grondplan: welk de ruimtes geeft, kiest iemand zelf. */
  dubbel: boolean;
}

export interface Overgeslagen {
  plan: Planinfo;
  reden: string;
}

const natuurlijk = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });

/** Dezelfde hoogte als waarmee de referentie gekozen wordt: het peil, anders 3 m per verdieping. */
const peil = (verdieping: Verdiepinginfo) => verdieping.vloerpeil_m ?? verdieping.volgorde * 3;

/**
 * Welke grondplannen omgezet moeten worden: die met een verdieping waarvan de
 * nieuwste versie nog niet bevestigd is. Per gebouw, en daarin eerst het
 * gelijkvloers, dan naar boven en dan naar beneden. Het gelijkvloers is
 * meestal het volledigste blad; zo ligt elke verdieping op een buur die al
 * uitgelijnd is.
 *
 * open telt alle grondplannen waarvan de nieuwste versie nog niet omgezet is,
 * ook die zonder verdieping: zoals de taak op het overzicht.
 */
export function teDoen(
  plannen: Planinfo[],
  verdiepingen: Verdiepinginfo[],
  gebouwen: Gebouwinfo[],
  bevestigd: Set<number>,
): { reeks: Reeksplan[]; overgeslagen: Overgeslagen[]; omgezet: number; open: number } {
  const verdiepingVan = new Map(verdiepingen.map((v) => [v.id, v]));
  const gebouwVan = new Map(gebouwen.map((g) => [g.id, g]));
  const plaats = new Map(gebouwen.map((g, index) => [g.id, index]));

  const grondplannen = plannen.filter((plan) => plan.soort === "grondplan");
  const perVerdieping = new Map<number, number>();
  for (const plan of grondplannen) {
    if (plan.verdieping_id !== null && plan.versies.length > 0) {
      perVerdieping.set(plan.verdieping_id, (perVerdieping.get(plan.verdieping_id) ?? 0) + 1);
    }
  }

  const reeks: Reeksplan[] = [];
  const overgeslagen: Overgeslagen[] = [];
  let omgezet = 0;
  let open = 0;
  for (const plan of grondplannen) {
    const versie = nieuwsteVersie(plan);
    if (!versie) {
      overgeslagen.push({ plan, reden: "Dit plan heeft nog geen versie." });
      continue;
    }
    if (bevestigd.has(versie.id)) {
      omgezet++;
      continue;
    }
    open++;
    if (plan.verdieping_id === null) {
      overgeslagen.push({ plan, reden: "Dit grondplan hangt nog niet aan een verdieping." });
      continue;
    }
    const verdieping = verdiepingVan.get(plan.verdieping_id);
    if (!verdieping) {
      overgeslagen.push({ plan, reden: "De verdieping van dit grondplan bestaat niet meer." });
      continue;
    }
    reeks.push({
      plan,
      versie,
      verdieping,
      gebouw: gebouwVan.get(verdieping.gebouw_id) ?? null,
      dubbel: (perVerdieping.get(verdieping.id) ?? 0) > 1,
    });
  }

  const rang = (v: Verdiepinginfo): [number, number] => (peil(v) >= 0 ? [0, peil(v)] : [1, -peil(v)]);
  reeks.sort((a, b) => {
    const [ga, ha] = rang(a.verdieping);
    const [gb, hb] = rang(b.verdieping);
    return (
      (plaats.get(a.verdieping.gebouw_id) ?? 999) - (plaats.get(b.verdieping.gebouw_id) ?? 999) ||
      ga - gb ||
      ha - hb ||
      a.verdieping.volgorde - b.verdieping.volgorde ||
      natuurlijk.compare(a.plan.titel, b.plan.titel)
    );
  });
  return { reeks, overgeslagen, omgezet, open };
}

/** De nieuwste versie van een plan, zoals de lijst van plannen ze toont. */
function nieuwsteVersie(plan: Planinfo): Planinfo["versies"][number] | undefined {
  return [...plan.versies].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
}

// ---------------------------------------------------------------------------
// Eén plan
// ---------------------------------------------------------------------------

/**
 * Wat na te kijken is aan een ruimte: geen naam, of een oppervlakte die meer
 * dan de marge afwijkt van wat op het plan staat. Dezelfde regels als de
 * omzetting zelf.
 */
export function beoordeelRuimte<T extends Ruimtevoorstel>(ruimte: T): T {
  const redenen: string[] = [];
  if (!ruimte.naam.trim()) redenen.push("geen naam");
  if (ruimte.oppervlaktePlan !== null) {
    const afwijking = Math.abs(ruimte.oppervlakte / ruimte.oppervlaktePlan - 1);
    if (afwijking > MARGE) redenen.push(`de oppervlakte wijkt ${(afwijking * 100).toFixed(1).replace(".", ",")} % af van het plan`);
  }
  return { ...ruimte, redenen, status: redenen.length === 0 ? "goed" : "nakijken" };
}

export interface Uitgelijnd {
  kalibratie: Kalibratie;
  /** Van 0 (gok) tot 1; 0 als er niets gevonden werd. */
  zekerheid: number;
  /** Staat de tekening anders gedraaid dan haar referentie? */
  gedraaid: boolean;
}

/**
 * Legt een blad op zijn referentie, zoals het nakijkscherm dat doet: eerst
 * met dezelfde draaiing als de referentie. Is dat niet zeker, dan ook met de
 * drie andere; wint een andere draaiing, dan zegt gedraaid dat iemand het
 * moet nakijken (een symmetrisch huis past ook na een halve draai).
 */
export function lijnBladUit(invoer: {
  blad: Blad;
  voorstel: Pick<Voorstel, "ruimtes" | "gebied">;
  meterPerPunt: number;
  referentie: { soort: "versie" | "verdieping"; kalibratie: Kalibratie };
  /** De muren van de referentie, in meter, al in het gebouw gelegd. */
  referentielijnen: Lijnstuk[];
  /** De ruimtes die de verdieping nu heeft, in meter. */
  bestaand: Oudruimte[];
}): Uitgelijnd {
  const { blad, voorstel, meterPerPunt, referentie, referentielijnen, bestaand } = invoer;
  const ruimtesInPunten = voorstel.ruimtes.map((r) => ({ naam: r.naam, ringen: r.ringen }));
  const lijnen = muurlijnen(blad, meterPerPunt, voorstel.gebied);
  const zelfdePlaats = { dx: referentie.kalibratie.dx, dy: referentie.kalibratie.dy };

  const probeer = (kwartslagen: number) => {
    const opNamen = referentie.soort === "versie" ? lijnUitOpNamen(ruimtesInPunten, bestaand, meterPerPunt, kwartslagen) : null;
    const opLijnen = lijnUitOpLijnen(lijnen, meterPerPunt, referentielijnen, {
      begin: opNamen ?? (kwartslagen === referentie.kalibratie.kwartslagen ? zelfdePlaats : undefined),
      kwartslagen: [kwartslagen],
      bereikM: opNamen ? 0.6 : 3,
    });
    const gevonden = opLijnen ?? opNamen;
    return {
      kalibratie: { meterPerPunt, kwartslagen, dx: gevonden?.dx ?? zelfdePlaats.dx, dy: gevonden?.dy ?? zelfdePlaats.dy },
      zekerheid: gevonden?.zekerheid ?? 0,
    };
  };

  const eigen = ((Math.round(referentie.kalibratie.kwartslagen) % 4) + 4) % 4;
  let beste = probeer(eigen);
  if (beste.zekerheid < ZEKER_UITGELIJND) {
    for (const kwartslagen of [0, 1, 2, 3].filter((k) => k !== eigen)) {
      const ander = probeer(kwartslagen);
      if (ander.zekerheid > beste.zekerheid) beste = ander;
    }
  }
  return { ...beste, gedraaid: beste.kalibratie.kwartslagen !== eigen };
}

/** Een ring van paginapunten naar meter in het gebouw. */
const inHuisRingen = (ringen: Xy[][], kalibratie: Kalibratie) => ringen.map((ring) => ring.map((p) => naarHuis(p, kalibratie)));

/**
 * Een ruimte die op dezelfde plaats ligt als een bestaande, krijgt de naam die
 * ze al had, zoals in het nakijkscherm. Wie zo een naam krijgt en verder in
 * orde is, gaat mee: dezelfde regel als de omzetting voor een ruimte met een
 * naam van het plan.
 */
export function neemNamenOver(ruimtes: Ruimtevoorstel[], bestaand: Oudruimte[], kalibratie: Kalibratie): Ruimtevoorstel[] {
  if (bestaand.length === 0 || ruimtes.length === 0) return ruimtes;
  const verschil = vergelijkRuimtes(
    bestaand,
    ruimtes.map((r) => ({ sleutel: r.sleutel, naam: r.naam, ringen: inHuisRingen(r.ringen, kalibratie) })),
  );
  return ruimtes.map((r) => {
    const koppeling = verschil.koppelingen.find((k) => k.sleutel === r.sleutel);
    if (!koppeling?.oudeNaam || koppeling.oudeNaam === r.naam) return r;
    const nieuw = beoordeelRuimte({ ...r, naam: koppeling.oudeNaam });
    return nieuw.status === "goed" ? { ...nieuw, mee: true } : nieuw;
  });
}

/** De ruimtes die bij het bevestigen meegaan: aangevinkt en met een naam. */
export function meegaand(ruimtes: Ruimtevoorstel[]): Ruimtevoorstel[] {
  return ruimtes.filter((r) => r.mee && r.naam.trim() !== "");
}

/** Welke bestaande ruimtes elke meegaande ruimte voortzet, en welke verdwijnen. */
export function verschilVoor(ruimtes: Ruimtevoorstel[], bestaand: Oudruimte[], kalibratie: Kalibratie): Ruimteverschil {
  return vergelijkRuimtes(
    bestaand,
    meegaand(ruimtes).map((r) => ({ sleutel: r.sleutel, naam: r.naam, ringen: inHuisRingen(r.ringen, kalibratie) })),
  );
}

export type Oordeel = "klaar" | "nakijken" | "kan-niet";

export interface Planstatus {
  oordeel: Oordeel;
  redenen: string[];
}

const opsomming = (namen: string[]) =>
  namen.length <= 1 ? (namen[0] ?? "") : `${namen.slice(0, -1).join(", ")} en ${namen.at(-1)}`;

/**
 * Mag dit plan zonder nakijken bevestigd worden? Klaar: de schaal is zeker,
 * de uitlijning ook (of er is geen referentie), elke ruimte gaat mee en er
 * verdwijnt niets. Kan niet: zonder schaal, zonder ruimtes met een naam, of
 * met een tweede grondplan op dezelfde verdieping. Al de rest: nakijken.
 */
export function planstatus(invoer: {
  dubbel: boolean;
  voorstel: Pick<Voorstel, "schaal" | "meldingen">;
  ruimtes: Ruimtevoorstel[];
  /** Null als dit blad zelf de referentie is. */
  uitlijning: (Pick<Uitgelijnd, "zekerheid" | "gedraaid"> & { op: string }) | null;
  /** De namen van de bestaande ruimtes die zouden verdwijnen. */
  verdwenen: string[];
}): Planstatus {
  const { dubbel, voorstel, ruimtes, uitlijning, verdwenen } = invoer;
  if (dubbel) {
    return { oordeel: "kan-niet", redenen: ["Aan deze verdieping hangt nog een grondplan. Zet het juiste apart om."] };
  }
  if (!voorstel.schaal) {
    return { oordeel: "kan-niet", redenen: [voorstel.meldingen[0] ?? "Er staat geen schaal op dit blad."] };
  }
  if (ruimtes.length === 0) return { oordeel: "kan-niet", redenen: ["Geen ruimtes gevonden op dit blad."] };
  if (meegaand(ruimtes).length === 0) {
    return { oordeel: "kan-niet", redenen: ["Geen enkele ruimte kan mee: geef ze een naam bij het nakijken."] };
  }

  const redenen: string[] = [];
  if (!voorstel.schaal.zeker) redenen.push(`De schaal is niet zeker: ${bewijs(voorstel.schaal)}`);
  if (uitlijning?.gedraaid) redenen.push(`De tekening staat gedraaid tegenover ${uitlijning.op}.`);
  else if (uitlijning && uitlijning.zekerheid < ZEKER_UITGELIJND) redenen.push(`De uitlijning op ${uitlijning.op} is niet zeker.`);

  const blijft = ruimtes.filter((r) => !r.mee || !r.naam.trim());
  const zonderNaam = blijft.filter((r) => !r.naam.trim()).length;
  if (zonderNaam > 0) {
    redenen.push(`${zonderNaam === 1 ? "1 ruimte heeft" : `${zonderNaam} ruimtes hebben`} geen naam en ${zonderNaam === 1 ? "gaat" : "gaan"} niet mee.`);
  }
  const metNaam = blijft.filter((r) => r.naam.trim());
  if (metNaam.length > 0) {
    const namen = opsomming(metNaam.map((r) => r.naam.trim()));
    const oppervlakte = metNaam.every((r) => r.redenen.some((reden) => reden.includes("oppervlakte")));
    redenen.push(
      `${namen} ${metNaam.length === 1 ? "gaat" : "gaan"} niet mee${oppervlakte ? ": de oppervlakte wijkt af van het plan" : ""}.`,
    );
  }
  if (verdwenen.length > 0) redenen.push(`Verdwijnt van de verdieping: ${opsomming(verdwenen)}.`);

  return redenen.length === 0 ? { oordeel: "klaar", redenen } : { oordeel: "nakijken", redenen };
}

/**
 * Wie een plan afvinkt, vinkt ook de plannen af die erop uitgelijnd werden,
 * en zo verder in de keten: hun plaats in het gebouw hangt ervan af.
 */
export function afhankelijk(
  reeks: { versieId: number; referentieVersieId: number | null }[],
  uit: Set<number>,
): Set<number> {
  const mee = new Set<number>();
  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    for (const plan of reeks) {
      if (mee.has(plan.versieId) || plan.referentieVersieId === null) continue;
      if (uit.has(plan.referentieVersieId) || mee.has(plan.referentieVersieId)) {
        mee.add(plan.versieId);
        veranderd = true;
      }
    }
  }
  return mee;
}

/**
 * Wat bevestigOmzettingActie krijgt, zoals het nakijkscherm het opbouwt. De
 * verdieping krijgt het peil en de plafondhoogte van het plan, zoals daar
 * standaard aangevinkt staat.
 */
export function bevestigingVoor(invoer: {
  versieId: number;
  voorstel: Pick<Voorstel, "schaal" | "openingen" | "muren" | "verdieping">;
  kalibratie: Kalibratie;
  referentieVersieId: number | null;
  ruimtes: Ruimtevoorstel[];
  verschil: Ruimteverschil;
}): Bevestiging | null {
  const { versieId, voorstel, kalibratie, referentieVersieId, ruimtes, verschil } = invoer;
  if (!voorstel.schaal) return null;
  return {
    versieId,
    kalibratie: { ...kalibratie, bron: voorstel.schaal.bron, bewijs: bewijs(voorstel.schaal), referentieVersieId },
    ruimtes: meegaand(ruimtes).map((r) => ({
      ruimteId: verschil.koppelingen.find((k) => k.sleutel === r.sleutel)?.ruimteId ?? null,
      naam: r.naam.trim(),
      soort: r.soort,
      ringen: r.ringen,
      oppervlaktePlan: r.oppervlaktePlan,
      plafondhoogte: r.plafondhoogte,
      vloerpeil: r.vloerpeil,
    })),
    openingen: voorstel.openingen,
    muren: voorstel.muren,
    verdieping: { bijwerken: true, vloerpeil: voorstel.verdieping.vloerpeil, plafondhoogte: voorstel.verdieping.plafondhoogte },
    schaal: voorstel.schaal,
  };
}
