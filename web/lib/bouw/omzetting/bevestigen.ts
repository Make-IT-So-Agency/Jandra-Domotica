import { gelukt, isSoortRuimte, mislukt, type SoortRuimte, type Uitkomst } from "../types";
import { naarHuis, nettoOppervlakte, rond, type Kalibratie } from "./geometrie";
import { WERKWIJZE } from "./pijplijn";
import type { Opening, Schaal, Xy } from "./types";

/**
 * Wat de browser stuurt als een omzetting bevestigd wordt, en hoe de server
 * dat nakijkt en omrekent naar meter. Puur, met tests.
 *
 * De browser stuurt de ruimtes in paginapunten, met de kalibratie; de server
 * rekent zelf de meters en de oppervlaktes uit. Zo kan wat de browser stuurt
 * geen oppervlakte verzinnen.
 */

export interface Bevestigruimte {
  /** De bestaande ruimte die deze voortzet, of null voor een nieuwe. */
  ruimteId: number | null;
  naam: string;
  soort: SoortRuimte;
  /** In paginapunten: de buitenrand en de gaten. */
  ringen: Xy[][];
  oppervlaktePlan: number | null;
  plafondhoogte: number | null;
  vloerpeil: number | null;
}

export interface Bevestigkalibratie extends Kalibratie {
  /** Waar de schaal vandaan komt, en het bewijs in mensentaal. */
  bron: string;
  bewijs: string;
  /** De versie waarop uitgelijnd werd, of null als dit de referentie is. */
  referentieVersieId: number | null;
}

export interface Bevestiging {
  versieId: number;
  kalibratie: Bevestigkalibratie;
  ruimtes: Bevestigruimte[];
  openingen: Opening[];
  verdieping: { bijwerken: boolean; vloerpeil: number | null; plafondhoogte: number | null };
  schaal: Pick<Schaal, "noemer" | "bron" | "titelblok" | "kloppend" | "getoetst"> | null;
}

/** Een ruimte zoals ze in bouw_ruimtes komt. */
export interface Ruimterij {
  id: number | null;
  naam: string;
  soort: SoortRuimte;
  veelhoek: Xy[][];
  oppervlakte_m2: number;
  oppervlakte_plan_m2: number | null;
  plafondhoogte_m: number | null;
  vloerpeil_m: number | null;
}

const isGetal = (waarde: unknown): waarde is number => typeof waarde === "number" && Number.isFinite(waarde);

function optioneel(waarde: unknown, min: number, max: number): number | null | "fout" {
  if (waarde === null || waarde === undefined) return null;
  return isGetal(waarde) && waarde > min && waarde <= max ? waarde : "fout";
}

function ringen(waarde: unknown): Xy[][] | null {
  if (!Array.isArray(waarde) || waarde.length < 1 || waarde.length > 20) return null;
  const uit: Xy[][] = [];
  for (const ring of waarde) {
    if (!Array.isArray(ring) || ring.length < 3 || ring.length > 2000) return null;
    const punten: Xy[] = [];
    for (const punt of ring) {
      if (!Array.isArray(punt) || punt.length !== 2 || !isGetal(punt[0]) || !isGetal(punt[1])) return null;
      if (Math.abs(punt[0]) > 20000 || Math.abs(punt[1]) > 20000) return null;
      punten.push([punt[0], punt[1]]);
    }
    uit.push(punten);
  }
  return uit;
}

/** Kijkt na wat de browser stuurt. Een serveractie kan van overal aangeroepen worden. */
export function controleerBevestiging(ruw: unknown): Uitkomst<Bevestiging> {
  const b = (ruw ?? {}) as Record<string, unknown>;
  const versieId = Number(b.versieId);
  if (!Number.isSafeInteger(versieId) || versieId < 1) return mislukt("Onbekende versie.");

  const k = (b.kalibratie ?? {}) as Record<string, unknown>;
  if (!isGetal(k.meterPerPunt) || k.meterPerPunt <= 1e-5 || k.meterPerPunt > 2) return mislukt("De schaal klopt niet.");
  if (!Number.isInteger(k.kwartslagen) || Number(k.kwartslagen) < 0 || Number(k.kwartslagen) > 3) {
    return mislukt("De draaiing klopt niet.");
  }
  if (!isGetal(k.dx) || !isGetal(k.dy) || Math.abs(k.dx) > 10000 || Math.abs(k.dy) > 10000) {
    return mislukt("De uitlijning klopt niet.");
  }
  const referentie = k.referentieVersieId === null || k.referentieVersieId === undefined ? null : Number(k.referentieVersieId);
  if (referentie !== null && (!Number.isSafeInteger(referentie) || referentie < 1)) return mislukt("De uitlijning klopt niet.");
  const kalibratie: Bevestigkalibratie = {
    meterPerPunt: k.meterPerPunt,
    kwartslagen: Number(k.kwartslagen),
    dx: k.dx,
    dy: k.dy,
    bron: String(k.bron ?? "").slice(0, 40),
    bewijs: String(k.bewijs ?? "").slice(0, 300),
    referentieVersieId: referentie,
  };

  if (!Array.isArray(b.ruimtes) || b.ruimtes.length === 0) return mislukt("Er gaat geen enkele ruimte mee.");
  if (b.ruimtes.length > 200) return mislukt("Hoogstens 200 ruimtes per verdieping.");
  const ids = new Set<number>();
  const ruimtes: Bevestigruimte[] = [];
  for (const r of b.ruimtes as Record<string, unknown>[]) {
    const naam = String(r?.naam ?? "").trim().replace(/\s+/g, " ");
    if (!naam || naam.length > 60) return mislukt("Geef elke ruimte een naam van hoogstens 60 tekens.");
    const soort = String(r.soort ?? "");
    if (!isSoortRuimte(soort)) return mislukt(`${naam}: kies wat voor ruimte het is.`);
    const veelhoek = ringen(r.ringen);
    if (!veelhoek) return mislukt(`${naam}: de vorm klopt niet.`);
    const ruimteId = r.ruimteId === null || r.ruimteId === undefined ? null : Number(r.ruimteId);
    if (ruimteId !== null) {
      if (!Number.isSafeInteger(ruimteId) || ruimteId < 1 || ids.has(ruimteId)) return mislukt(`${naam}: ongeldige koppeling.`);
      ids.add(ruimteId);
    }
    const plan = optioneel(r.oppervlaktePlan, 0, 100000);
    const plafond = optioneel(r.plafondhoogte, 0, 20);
    const peil = optioneel(r.vloerpeil, -100, 100);
    if (plan === "fout" || plafond === "fout" || peil === "fout") return mislukt(`${naam}: een oppervlakte of hoogte klopt niet.`);
    ruimtes.push({ ruimteId, naam, soort, ringen: veelhoek, oppervlaktePlan: plan, plafondhoogte: plafond, vloerpeil: peil });
  }

  const openingen: Opening[] = [];
  for (const o of (Array.isArray(b.openingen) ? b.openingen : []).slice(0, 500) as Record<string, unknown>[]) {
    if ((o?.soort !== "deur" && o?.soort !== "raam") || !isGetal(o.x) || !isGetal(o.y) || !isGetal(o.breedte)) continue;
    const punten = (Array.isArray(o.punten) ? o.punten : [])
      .slice(0, 2)
      .filter((p): p is Xy => Array.isArray(p) && isGetal(p[0]) && isGetal(p[1]));
    openingen.push({
      soort: o.soort,
      x: o.x,
      y: o.y,
      punten,
      breedte: o.breedte,
      hoogte: isGetal(o.hoogte) ? o.hoogte : null,
      ruimte: typeof o.ruimte === "string" ? o.ruimte.slice(0, 20) : null,
    });
  }

  const v = (b.verdieping ?? {}) as Record<string, unknown>;
  const vloerpeil = optioneel(v.vloerpeil, -100, 100);
  const plafondhoogte = optioneel(v.plafondhoogte, 0, 20);
  if (vloerpeil === "fout" || plafondhoogte === "fout") return mislukt("Het peil of de plafondhoogte van de verdieping klopt niet.");

  const s = b.schaal as Record<string, unknown> | null | undefined;
  const schaal =
    s && isGetal(s.noemer)
      ? {
          noemer: s.noemer,
          bron: (["titelblok", "oppervlaktes", "beide", "hand"].includes(String(s.bron)) ? s.bron : "hand") as Schaal["bron"],
          titelblok: isGetal(s.titelblok) ? s.titelblok : null,
          kloppend: isGetal(s.kloppend) ? s.kloppend : 0,
          getoetst: isGetal(s.getoetst) ? s.getoetst : 0,
        }
      : null;

  return gelukt({
    versieId,
    kalibratie,
    ruimtes,
    openingen,
    verdieping: { bijwerken: v.bijwerken === true, vloerpeil, plafondhoogte },
    schaal,
  });
}

/** Een ring in meter, op de millimeter. */
function inMeter(ring: Xy[], k: Kalibratie): Xy[] {
  return ring.map((p) => {
    const [x, y] = naarHuis(p, k);
    return [rond(x, 3), rond(y, 3)] as Xy;
  });
}

/** De ruimtes in meter, met de oppervlakte zoals de server ze uitrekent. */
export function naarRuimterijen(bevestiging: Bevestiging): Uitkomst<Ruimterij[]> {
  const rijen: Ruimterij[] = [];
  for (const ruimte of bevestiging.ruimtes) {
    const veelhoek = ruimte.ringen.map((ring) => inMeter(ring, bevestiging.kalibratie));
    const oppervlakte = rond(nettoOppervlakte(veelhoek), 3);
    if (oppervlakte < 0.2) return mislukt(`${ruimte.naam} is te klein om een ruimte te zijn.`);
    rijen.push({
      id: ruimte.ruimteId,
      naam: ruimte.naam,
      soort: ruimte.soort,
      veelhoek,
      oppervlakte_m2: oppervlakte,
      oppervlakte_plan_m2: ruimte.oppervlaktePlan,
      plafondhoogte_m: ruimte.plafondhoogte,
      vloerpeil_m: ruimte.vloerpeil,
    });
  }
  return gelukt(rijen);
}

/**
 * Wat bewaard wordt als bewijs van de omzetting: de schaal, de kalibratie,
 * de ruimtes in het kort en de openingen in meter (voor het 3D-model later).
 * Geen andere teksten van het blad.
 */
export function omzettingsvoorstel(bevestiging: Bevestiging, rijen: Ruimterij[]): Record<string, unknown> {
  const k = bevestiging.kalibratie;
  return {
    werkwijze: WERKWIJZE,
    schaal: bevestiging.schaal,
    kalibratie: k,
    verdieping: bevestiging.verdieping,
    ruimtes: rijen.map((rij) => ({
      naam: rij.naam,
      soort: rij.soort,
      oppervlakte: rij.oppervlakte_m2,
      oppervlaktePlan: rij.oppervlakte_plan_m2,
    })),
    openingen: bevestiging.openingen.map((o) => {
      const [x, y] = naarHuis([o.x, o.y], k);
      return {
        soort: o.soort,
        x: rond(x, 3),
        y: rond(y, 3),
        punten: o.punten.map((p) => naarHuis(p, k).map((w) => rond(w, 3))),
        breedte: o.breedte,
        hoogte: o.hoogte,
      };
    }),
  };
}
