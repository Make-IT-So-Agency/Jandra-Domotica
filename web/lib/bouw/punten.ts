import { afstandTotRing, binnenRuimte } from "./omzetting/geometrie";
import type { Xy } from "./omzetting/types";
import { gelukt, mislukt, type Uitkomst } from "./types";

/**
 * Punten op het plan: lichtpunten, schakelaars, stopcontacten, netwerk,
 * sensoren en zo verder. De catalogus staat hier, in de code; de databank
 * kijkt enkel de vorm van de soort na (zie de migratie). Puur, voor de
 * server, de browser en de tests.
 *
 * Een punt ligt in meter in het assenstelsel van het gebouw, zodat het een
 * nieuwe versie van het plan overleeft. In welke ruimte het ligt, volgt uit
 * de veelhoeken van de ruimtes.
 */

export const CATEGORIEEN = [
  "verlichting",
  "bediening",
  "stopcontacten",
  "data",
  "sensoren",
  "klimaat",
  "zonwering",
  "andere",
] as const;

export type Categorie = (typeof CATEGORIEEN)[number];

export const CATEGORIENAMEN: Record<Categorie, string> = {
  verlichting: "Verlichting",
  bediening: "Bediening",
  stopcontacten: "Stopcontacten",
  data: "Data en media",
  sensoren: "Sensoren en veiligheid",
  klimaat: "Klimaat",
  zonwering: "Zonwering",
  andere: "Andere",
};

/** De kleur van een categorie op het plan en in de lijst. */
export const CATEGORIEKLEUREN: Record<Categorie, string> = {
  verlichting: "#d97706",
  bediening: "#4f46e5",
  stopcontacten: "#dc2626",
  data: "#0284c7",
  sensoren: "#16a34a",
  klimaat: "#0891b2",
  zonwering: "#7c3aed",
  andere: "#6b7280",
};

export interface Puntsoort {
  soort: string;
  naam: string;
  categorie: Categorie;
  /** De korte code op het plan, zoals een elektricien ze ook leest. */
  code: string;
  /** De gewone hoogte boven de afgewerkte vloer, in meter, of aan het plafond. */
  hoogte: number | "plafond";
}

export const CATALOGUS: readonly Puntsoort[] = [
  { soort: "lichtpunt", naam: "Lichtpunt aan het plafond", categorie: "verlichting", code: "L", hoogte: "plafond" },
  { soort: "inbouwspot", naam: "Inbouwspot", categorie: "verlichting", code: "IS", hoogte: "plafond" },
  { soort: "wandlicht", naam: "Wandlicht", categorie: "verlichting", code: "WL", hoogte: 1.8 },
  { soort: "ledstrip", naam: "Ledstrip", categorie: "verlichting", code: "LED", hoogte: "plafond" },
  { soort: "buitenlicht", naam: "Buitenlicht", categorie: "verlichting", code: "BL", hoogte: 2.0 },
  { soort: "schakelaar", naam: "Schakelaar", categorie: "bediening", code: "S", hoogte: 1.1 },
  { soort: "dimmer", naam: "Dimmer", categorie: "bediening", code: "D", hoogte: 1.1 },
  { soort: "drukknop", naam: "Drukknop voor de domotica", categorie: "bediening", code: "K", hoogte: 1.1 },
  { soort: "stopcontact", naam: "Stopcontact", categorie: "stopcontacten", code: "WC", hoogte: 0.3 },
  { soort: "stopcontact_dubbel", naam: "Dubbel stopcontact", categorie: "stopcontacten", code: "2WC", hoogte: 0.3 },
  { soort: "stopcontact_aanrecht", naam: "Stopcontact boven het aanrecht", categorie: "stopcontacten", code: "WCA", hoogte: 1.1 },
  { soort: "stopcontact_buiten", naam: "Buitenstopcontact", categorie: "stopcontacten", code: "WCB", hoogte: 0.6 },
  { soort: "vast_toestel", naam: "Vast toestel (oven, kookplaat, wasmachine)", categorie: "stopcontacten", code: "T", hoogte: 0.3 },
  { soort: "laadpunt", naam: "Laadpunt voor de wagen", categorie: "stopcontacten", code: "EV", hoogte: 1.0 },
  { soort: "netwerk", naam: "Netwerkaansluiting", categorie: "data", code: "UTP", hoogte: 0.3 },
  { soort: "tv", naam: "Tv-aansluiting", categorie: "data", code: "TV", hoogte: 0.3 },
  { soort: "wifi", naam: "Wifi-toegangspunt", categorie: "data", code: "AP", hoogte: "plafond" },
  { soort: "luidspreker", naam: "Luidspreker", categorie: "data", code: "LS", hoogte: "plafond" },
  { soort: "deurbel", naam: "Deurbel of parlofoon", categorie: "data", code: "BEL", hoogte: 1.5 },
  { soort: "camera", naam: "Camera", categorie: "data", code: "CAM", hoogte: 2.5 },
  { soort: "aanwezigheid", naam: "Aanwezigheidsmelder", categorie: "sensoren", code: "PIR", hoogte: "plafond" },
  { soort: "temperatuur", naam: "Temperatuurvoeler", categorie: "sensoren", code: "T°", hoogte: 1.5 },
  { soort: "co2", naam: "CO₂-meter", categorie: "sensoren", code: "CO2", hoogte: 1.5 },
  { soort: "rookmelder", naam: "Rookmelder", categorie: "sensoren", code: "RM", hoogte: "plafond" },
  { soort: "waterlek", naam: "Waterlekmelder", categorie: "sensoren", code: "H2O", hoogte: 0 },
  { soort: "thermostaat", naam: "Thermostaat", categorie: "klimaat", code: "TH", hoogte: 1.5 },
  { soort: "ventilatie_afvoer", naam: "Ventilatie: afvoer", categorie: "klimaat", code: "VA", hoogte: "plafond" },
  { soort: "ventilatie_toevoer", naam: "Ventilatie: toevoer", categorie: "klimaat", code: "VT", hoogte: "plafond" },
  { soort: "rolluik", naam: "Rolluik of screen met motor", categorie: "zonwering", code: "RL", hoogte: 2.3 },
  { soort: "zonwering_bediening", naam: "Bediening van de zonwering", categorie: "zonwering", code: "RB", hoogte: 1.1 },
  { soort: "andere", naam: "Andere", categorie: "andere", code: "?", hoogte: 1.0 },
];

const PER_SOORT = new Map(CATALOGUS.map((soort) => [soort.soort, soort]));

export function soortVan(soort: string): Puntsoort | undefined {
  return PER_SOORT.get(soort);
}

export function isSoortPunt(waarde: string): boolean {
  return PER_SOORT.has(waarde);
}

/** Wat bewaard wordt als hoogte: een getal, of null voor "aan het plafond". */
export function standaardHoogte(soort: string): number | null {
  const gekend = soortVan(soort);
  return !gekend || gekend.hoogte === "plafond" ? null : gekend.hoogte;
}

const komma = (waarde: number) => waarde.toFixed(2).replace(".", ",");

export function hoogteTekst(hoogte: number | null, plafondhoogte: number | null): string {
  if (hoogte === null) return plafondhoogte === null ? "plafond" : `plafond (${komma(plafondhoogte)} m)`;
  return `${komma(hoogte)} m`;
}

export const STATUSSEN_PUNT = ["gewenst", "in_offerte", "geplaatst", "getest"] as const;

export type StatusPunt = (typeof STATUSSEN_PUNT)[number];

export const STATUSNAMEN: Record<StatusPunt, string> = {
  gewenst: "Gewenst",
  in_offerte: "In de offerte",
  geplaatst: "Geplaatst",
  getest: "Getest",
};

export interface Punt {
  id: number;
  verdieping_id: number;
  soort: string;
  x_m: number;
  y_m: number;
  hoogte_m: number | null;
  aantal: number;
  label: string | null;
  opmerking: string | null;
  status: StatusPunt;
}

export interface Ruimtevorm {
  id: number;
  naam: string;
  veelhoek: Xy[][];
}

/**
 * Een schakelaar of stopcontact staat vaak op de muur, en een muur ligt
 * buiten de netto-veelhoek van de ruimte. Daarom telt ook wat tot zoveel
 * meter van de rand ligt: de helft van een binnenmuur, met wat speling.
 */
const OP_DE_MUUR_M = 0.35;

/** In welke ruimte een punt ligt, of null: buiten, of in geen enkele ruimte. */
export function ruimteVan(punt: { x_m: number; y_m: number }, ruimtes: Ruimtevorm[]): number | null {
  const p: Xy = [punt.x_m, punt.y_m];
  const erin = ruimtes.find((ruimte) => binnenRuimte(p, ruimte.veelhoek));
  if (erin) return erin.id;
  let beste: { id: number; afstand: number } | null = null;
  for (const ruimte of ruimtes) {
    if (!ruimte.veelhoek[0]) continue;
    const afstand = afstandTotRing(p, ruimte.veelhoek[0]);
    if (afstand <= OP_DE_MUUR_M && (!beste || afstand < beste.afstand)) beste = { id: ruimte.id, afstand };
  }
  return beste ? (beste as { id: number }).id : null;
}

export interface Nieuwpunt {
  soort: string;
  x_m: number;
  y_m: number;
  hoogte_m: number | null;
  aantal: number;
  label: string | null;
  opmerking: string | null;
  status: StatusPunt;
}

const isGetal = (waarde: unknown): waarde is number => typeof waarde === "number" && Number.isFinite(waarde);

function tekst(waarde: unknown, maximum: number): string | null | "fout" {
  if (waarde === null || waarde === undefined) return null;
  const schoon = String(waarde).trim().replace(/\s+/g, " ");
  if (schoon === "") return null;
  return schoon.length <= maximum ? schoon : "fout";
}

/** Kijkt na wat de browser stuurt voor een punt. */
export function controleerPunt(ruw: unknown): Uitkomst<Nieuwpunt> {
  const p = (ruw ?? {}) as Record<string, unknown>;
  const soort = String(p.soort ?? "");
  if (!isSoortPunt(soort)) return mislukt("Kies wat voor punt het is.");
  if (!isGetal(p.x_m) || !isGetal(p.y_m) || Math.abs(p.x_m) > 10000 || Math.abs(p.y_m) > 10000) {
    return mislukt("Dit punt ligt niet op het plan.");
  }
  const hoogte = p.hoogte_m === null || p.hoogte_m === undefined ? null : Number(p.hoogte_m);
  if (hoogte !== null && (!Number.isFinite(hoogte) || hoogte < 0 || hoogte > 20)) {
    return mislukt("De hoogte ligt tussen 0 en 20 m; leeg is aan het plafond.");
  }
  const aantal = p.aantal === undefined ? 1 : Number(p.aantal);
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > 99) return mislukt("Het aantal ligt tussen 1 en 99.");
  const label = tekst(p.label, 40);
  const opmerking = tekst(p.opmerking, 300);
  if (label === "fout") return mislukt("Het label is hoogstens 40 tekens.");
  if (opmerking === "fout") return mislukt("De opmerking is hoogstens 300 tekens.");
  const status = String(p.status ?? "gewenst");
  if (!(STATUSSEN_PUNT as readonly string[]).includes(status)) return mislukt("Onbekende status.");
  return gelukt({
    soort,
    x_m: Math.round(p.x_m * 1000) / 1000,
    y_m: Math.round(p.y_m * 1000) / 1000,
    hoogte_m: hoogte === null ? null : Math.round(hoogte * 100) / 100,
    aantal,
    label,
    opmerking,
    status: status as StatusPunt,
  });
}

// ---------------------------------------------------------------------------
// De wensenlijst
// ---------------------------------------------------------------------------

export interface Wensregel {
  soort: string;
  naam: string;
  code: string;
  categorie: Categorie;
  aantal: number;
  /** De verschillende hoogtes, zoals ze op de lijst komen. */
  hoogtes: string[];
  /** Labels en opmerkingen van de punten. */
  opmerkingen: string[];
}

export interface Wensruimte {
  ruimteId: number | null;
  naam: string;
  regels: Wensregel[];
  aantal: number;
}

export interface Wensverdieping {
  verdiepingId: number;
  naam: string;
  ruimtes: Wensruimte[];
  aantal: number;
}

export interface Wensenlijst {
  verdiepingen: Wensverdieping[];
  totalen: Wensregel[];
  aantal: number;
}

const natuurlijk = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });
const volgorde = new Map(CATALOGUS.map((soort, i) => [soort.soort, i]));

function regelsVan(punten: Punt[], plafondhoogte: number | null): Wensregel[] {
  const perSoort = new Map<string, Wensregel>();
  for (const punt of punten) {
    const soort = soortVan(punt.soort) ?? { soort: punt.soort, naam: punt.soort, categorie: "andere" as const, code: "?", hoogte: 1 };
    const regel =
      perSoort.get(punt.soort) ??
      ({ soort: soort.soort, naam: soort.naam, code: soort.code, categorie: soort.categorie, aantal: 0, hoogtes: [], opmerkingen: [] } as Wensregel);
    perSoort.set(punt.soort, regel);
    regel.aantal += punt.aantal;
    const hoogte = hoogteTekst(punt.hoogte_m, plafondhoogte);
    if (!regel.hoogtes.includes(hoogte)) regel.hoogtes.push(hoogte);
    const opmerking = [punt.label, punt.opmerking].filter(Boolean).join(": ");
    if (opmerking) regel.opmerkingen.push(punt.aantal > 1 ? `${opmerking} (${punt.aantal}×)` : opmerking);
  }
  return [...perSoort.values()].sort((a, b) => (volgorde.get(a.soort) ?? 999) - (volgorde.get(b.soort) ?? 999));
}

/**
 * De wensenlijst: per verdieping en per ruimte wat er moet komen, en het
 * totaal per soort. Punten buiten elke ruimte staan onder "Buiten of zonder
 * ruimte".
 */
export function maakWensenlijst(
  verdiepingen: { id: number; naam: string; plafondhoogte_m: number | null }[],
  ruimtes: (Ruimtevorm & { verdieping_id: number; plafondhoogte_m: number | null })[],
  punten: Punt[],
): Wensenlijst {
  const lijst: Wensverdieping[] = [];
  for (const verdieping of verdiepingen) {
    const eigenRuimtes = ruimtes.filter((r) => r.verdieping_id === verdieping.id);
    const eigenPunten = punten.filter((p) => p.verdieping_id === verdieping.id);
    if (eigenPunten.length === 0) continue;
    const perRuimte = new Map<number | null, Punt[]>();
    for (const punt of eigenPunten) {
      const ruimte = ruimteVan(punt, eigenRuimtes);
      perRuimte.set(ruimte, [...(perRuimte.get(ruimte) ?? []), punt]);
    }
    const wensruimtes: Wensruimte[] = [...perRuimte.entries()]
      .map(([ruimteId, lijstpunten]) => {
        const ruimte = eigenRuimtes.find((r) => r.id === ruimteId);
        const regels = regelsVan(lijstpunten, ruimte?.plafondhoogte_m ?? verdieping.plafondhoogte_m);
        return {
          ruimteId,
          naam: ruimte?.naam ?? "Buiten of zonder ruimte",
          regels,
          aantal: regels.reduce((som, r) => som + r.aantal, 0),
        };
      })
      .sort((a, b) => (a.ruimteId === null ? 1 : b.ruimteId === null ? -1 : natuurlijk.compare(a.naam, b.naam)));
    lijst.push({
      verdiepingId: verdieping.id,
      naam: verdieping.naam,
      ruimtes: wensruimtes,
      aantal: wensruimtes.reduce((som, r) => som + r.aantal, 0),
    });
  }
  const totalen = regelsVan(punten.filter((p) => lijst.some((v) => v.verdiepingId === p.verdieping_id)), null).map((r) => ({
    ...r,
    hoogtes: [],
    opmerkingen: [],
  }));
  return { verdiepingen: lijst, totalen, aantal: totalen.reduce((som, r) => som + r.aantal, 0) };
}
