"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { Staalbeeld } from "@/components/bouw/staal";
import {
  deelnaam,
  deelVanSleutel,
  grootteVan,
  hoekenVan,
  kleefOpMuur,
  materiaalVanDeel,
  MAX_DELEN,
  muurvlakBij,
  ruimteVoor,
  schoneDelen,
  slotVanDeel,
  zelfdeVorm,
  type Deel,
  type Deelvorm,
  type Muurvlak,
  type Wandzijde,
} from "@/lib/bouw/drie/delen";
import type { Drieverdieping } from "@/lib/bouw/drie/laden";
import {
  KEUZE_VAN_SLOT,
  SLOTNAMEN,
  SLOTS,
  alsMateriaal,
  bewaardAls,
  keuzeVan,
  materiaalVan,
  proefsleutel,
  vloertitel,
  zelfdeMateriaal,
  type Getoond,
  type Materiaal,
  type Materiaalkeuze,
  type Proef,
  type Slot,
} from "@/lib/bouw/drie/materialen";
import type { Model3d, Verdieping3d } from "@/lib/bouw/drie/model";
import { STALEN, eigenNaam } from "@/lib/bouw/drie/stalen";
import { MET_VOEG, PATRONEN, PATROONNAMEN, isPatroon } from "@/lib/bouw/keuzes";
import { kleefLeiding } from "@/lib/bouw/leidingen";
import { binnenRuimte, zwaartepunt } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { huispad } from "@/lib/bouw/paden";

import { bewaarDelenActie, bewaarMateriaalActie } from "./acties";
import { kleefmarge, snijVlak, Voorbeeld } from "./deeltekening";
import { richtStraal, useTik, zichtbareRaak, type Kern } from "./kern";
import type { Opgebouwd, Sleutel } from "./scene";
import { zetMateriaal, type Texturen } from "./texturen";

/**
 * Materialen uitproberen in 3D: per onderdeel (de gevel, het dak, de ramen,
 * de binnenmuren, de vloer van een ruimte) de opties van de keuze, de stalen
 * en een eigen kleur met een patroon. Tik een muur, het dak of een vloer aan
 * in het beeld, en kies eronder een staal. Uitproberen bewaart niets; Bewaren
 * als optie zet het materiaal bij de keuze (bewaarMateriaalActie).
 *
 * Een deel van een vlak kan een eigen materiaal krijgen: na een tik kies je
 * Dit muurvlak, de muren van de ruimte, of Deel tekenen (een rechthoek op een
 * muur, een veelhoek op een vloer of een plat dak). Een deel bewaar je met
 * Delen bewaren (bewaarDelenActie). Enkel voor de browser; de regels staan in
 * lib/bouw/drie/materialen.ts, stalen.ts en delen.ts.
 */

type Driekern = Kern & { opgebouwd: Opgebouwd | null; materialen: Map<Sleutel, THREE.MeshStandardMaterial> };
type Melding = { soort: "goed" | "fout"; tekst: string };

/** Waar een materiaal op ligt: een onderdeel, bij een vloer de ruimte, of een deel met een eigen materiaal. */
export interface Plek {
  slot: Slot;
  ruimteId?: number;
  deelId?: string;
}

export interface Vloerruimte {
  id: number;
  naam: string;
  verdieping: string;
}

/**
 * Wat een tik raakte: genoeg om er een deel van te maken. `punt` ligt in het
 * assenstelsel van het gebouw; `deelId` is het deel dat er al lag.
 */
type Tik = (
  | { soort: "muur"; zijde: Wandzijde; gebouwId: number; verdiepingId: number; punt: Xy; kijk: Xy }
  | { soort: "vloer"; gebouwId: number; verdiepingId: number; punt: Xy; ruimteId: number | null }
  | { soort: "dak"; gebouwId: number; verdiepingId: number; punt: Xy }
) & { deelId?: string };

type Muurtik = Extract<Tik, { soort: "muur" }>;
type Vlaktik = Exclude<Tik, Muurtik>;

/**
 * Een deel dat getekend wordt. Op een muur: de vloer en de hoogte van de
 * muur, en de eerste hoek (meter langs het vlak, meter boven de vloer). Op
 * een vloer of plat dak: de hoogte van het vlak, de hoeken om aan te kleven
 * en de getikte punten.
 */
type Tekening =
  | { soort: "muur"; tik: Muurtik; vlak: Muurvlak; vloer: number; hoogte: number; hoek: Xy | null }
  | { soort: "vloer" | "dak"; tik: Vlaktik; hoogte: number; hoeken: Xy[]; punten: Xy[] };

/** De voeg van een eigen baksteen of tegel, tot je er een kiest. */
const STANDAARDVOEG = "#c9c2b8";

/** Welk onderdeel een sleutel van de scène volgt; de rest heeft een vaste kleur. Een deel volgt zijn eigen materiaal. */
export function slotVan(sleutel: Sleutel): Plek | null {
  if (sleutel === "gevel") return { slot: "gevel" };
  if (sleutel === "binnenmuur") return { slot: "binnenmuur" };
  if (sleutel === "dak" || sleutel === "dakplat") return { slot: "dak" };
  if (sleutel === "schrijnwerk") return { slot: "schrijnwerk" };
  if (sleutel.startsWith("vloer:")) return { slot: "vloer", ruimteId: Number(sleutel.slice(6)) };
  return null;
}

/** Wat een tik raakt: het glas van een raam hoort bij het schrijnwerk, de rand van een plat dak bij het dak. */
function plekVanTik(sleutel: Sleutel): Plek | null {
  if (sleutel === "glas") return { slot: "schrijnwerk" };
  if (sleutel === "dakrand") return { slot: "dak" };
  return slotVan(sleutel);
}

const VAST: Record<string, string> = {
  plafond: "het plafond",
  trap: "de trap",
  luifel: "een luifel",
  binnendeur: "een binnendeur",
  muurtop: "de bovenkant van een muur",
  plaat: "de rand van een vloer",
  deurboog: "de draaicirkel van een deur",
};

/** Zet kleur, patroon of foto van een vlak, met wat er nu uitgeprobeerd wordt, of het materiaal van zijn deel. */
export function werkMateriaalBij(
  sleutel: Sleutel,
  m: THREE.MeshStandardMaterial,
  materialen: readonly Materiaalkeuze[],
  proef: ReadonlyMap<string, Proef>,
  delen: ReadonlyMap<string, Deel>,
  texturen: Texturen,
  anisotropie: number,
) {
  const deelId = deelVanSleutel(sleutel);
  if (deelId !== null) {
    // Een deel dat net weg is: zijn vlakken verdwijnen bij het volgende bouwen.
    const deel = delen.get(deelId);
    if (deel) zetMateriaal(m, materiaalVanDeel(deel, materialen), texturen, anisotropie);
    return;
  }
  const plek = slotVan(sleutel);
  if (!plek) return;
  zetMateriaal(m, materiaalVan(plek.slot, materialen, proef, plek.ruimteId).materiaal, texturen, anisotropie);
}

/** Een knop na een tik: het hele onderdeel, dit vlak, de muren van de ruimte, of een deel tekenen. */
export interface Bereik {
  sleutel: string;
  naam: string;
  actief: boolean;
  kies(): void;
}

export interface Materiaalproef {
  /** Wat er uitgeprobeerd wordt, per plek (zie proefsleutel). */
  proef: ReadonlyMap<string, Proef>;
  plek: Plek;
  kiesPlek(plek: Plek): void;
  /** Hoe de plek heet: "Gevel", "Vloer badkamer", of de naam van het deel. */
  naam: string;
  getoond: Getoond;
  /** De keuze die de plek volgt, of null. Bij een deel: de keuze waarvan de opties bij de stalen staan. */
  keuze: Materiaalkeuze | null;
  /** Bij een vloer: de ruimtes die mee veranderen, want ze hangen aan dezelfde keuze. */
  ruimtes: number[];
  /** De opties van de keuze, dan de stalen die nog geen optie zijn. */
  stalen: { sleutel: string; naam: string; materiaal: Materiaal; optieId: number | null }[];
  probeer(naam: string, materiaal: Materiaal, optieId: number | null): void;
  /** Een eigen kleur, patroon of voeg, vanaf wat er nu getoond wordt. */
  eigen(wijziging: Partial<Materiaal>): void;
  zetNaam(naam: string): void;
  terug(): void;
  /** Kan het materiaal terug: wat uitgeprobeerd wordt, of een deel dat anders is dan bewaard. */
  kanTerug: boolean;
  bezig: boolean;
  bewaar(): Promise<void>;
  /** Waarom de laatste tik niets koos. */
  tikfout: string | null;
  /** Net bewaard: "Bewaard bij Gevelsteen.", tot je iets anders kiest. */
  bewaard: string | null;

  /** Wat je met de laatste tik kan kiezen. Leeg zonder tik. */
  bereik: Bereik[];
  /** Alle delen per verdieping, zoals ze nu zijn: ook wat nog niet bewaard is. */
  delen: ReadonlyMap<number, readonly Deel[]>;
  /** Het gekozen deel, met zijn verdieping. */
  deel: { verdiepingId: number; deel: Deel } | null;
  /** Het muurvlak van het gekozen deel op een muur: daarop meet Van en Tot. */
  deelvlak: Muurvlak | null;
  /** Hoe hoog de muren van de verdieping van het gekozen deel zijn, en tot de vloer erboven. */
  muurhoogte: { muur: number; verdieping: number } | null;
  /** Hoeveel verdiepingen delen hebben die niet bewaard zijn. */
  gewijzigd: number;
  tekening: { soort: Tekening["soort"]; uitleg: string; punten: number } | null;
  stopTekenen(): void;
  /** Sluit de veelhoek op een vloer of dak. */
  sluitTekening(): void;
  puntWeg(): void;
  /** Breekt een begonnen tekening af (Esc); false als er geen was. */
  breekAf(): boolean;
  hernoem(naam: string): void;
  wijzigVorm(vorm: Deelvorm): void;
  verwijder(): void;
  delenBezig: boolean;
  bewaarDelen(): Promise<void>;
  herbegin(): void;
}

const afstand = (a: Xy, b: Xy) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const langs = (vlak: Pick<Muurvlak, "n">): Xy => [vlak.n[1], -vlak.n[0]];
const klein = (naam: string) => (naam === naam.toUpperCase() ? naam.toLowerCase() : `${naam.charAt(0).toLowerCase()}${naam.slice(1)}`);
const gelijk = (a: readonly Deel[] | undefined, b: readonly Deel[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Een id voor een nieuw deel: acht tekens, cijfers en kleine letters. */
function nieuweId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => (byte % 36).toString(36)).join("");
}

/** Hoe hoog de muren van een verdieping zijn, en tot de vloer van de verdieping erboven in hetzelfde gebouw. */
function hoogtesVan(model: Model3d, v: Verdieping3d): { muur: number; verdieping: number } {
  const erboven = model.verdiepingen.filter((w) => w.gebouwId === v.gebouwId && w.z0 > v.z0 + 0.01).sort((a, b) => a.z0 - b.z0)[0];
  const muur = Math.round((v.z1 - v.z0) * 100) / 100;
  return { muur, verdieping: erboven ? Math.round((erboven.z0 - v.z0) * 100) / 100 : muur };
}

/** Waar een tik op de tekening terechtkomt, gekleefd: op een muur meter langs het vlak en boven de vloer, op een vloer meter op het plan. */
function puntOpTekening(straal: THREE.Raycaster, eigen: THREE.Object3D, t: Tekening, camera: THREE.Camera): Xy | null {
  if (t.soort === "muur") {
    const lokaal = snijVlak(straal, eigen, { punt: t.vlak.a, hoogte: t.vloer, kijk: t.vlak.n });
    if (!lokaal) return null;
    const r = langs(t.vlak);
    const langsMuur = (lokaal.x - t.vlak.a[0]) * r[0] + (lokaal.z - t.vlak.a[1]) * r[1];
    const [u, z] = kleefOpMuur(langsMuur, lokaal.y - t.vloer, { lengte: afstand(t.vlak.a, t.vlak.b), hoogte: t.hoogte, openingen: t.vlak.openingen }, kleefmarge(camera, eigen, lokaal));
    return [u, Math.max(0, z)];
  }
  const lokaal = snijVlak(straal, eigen, { punt: [0, 0], hoogte: t.hoogte, kijk: null });
  if (!lokaal) return null;
  const kandidaten = t.punten.length >= 3 ? [...t.hoeken, t.punten[0]] : t.hoeken;
  return kleefLeiding([lokaal.x, lokaal.z], { vorige: t.punten.at(-1) ?? null, kandidaten, straal: kleefmarge(camera, eigen, lokaal) }).punt;
}

export function useMateriaalproef(
  kern: RefObject<Driekern | null>,
  opties: {
    aan: boolean;
    huisId: number;
    materialen: readonly Materiaalkeuze[];
    vloerruimtes: readonly Vloerruimte[];
    /** De verdiepingen zoals geladen: hun delen zoals bewaard, en de namen van hun ruimtes. */
    verdiepingen: readonly Drieverdieping[];
    /** De delen zoals ze nu zijn, per verdieping: het 3D-scherm bouwt ermee (zie scenedelen). */
    delen: ReadonlyMap<number, readonly Deel[]>;
    zetDelen: (wijzig: (oud: ReadonlyMap<number, readonly Deel[]>) => ReadonlyMap<number, readonly Deel[]>) => void;
    model: Model3d;
    /** Waar het noorden ligt op het plan, voor de naam van een nieuw deel. */
    noorden: () => number;
    meld: (melding: Melding) => void;
  },
): Materiaalproef {
  const { aan, huisId, materialen, vloerruimtes, model, delen, zetDelen: setDelen } = opties;
  const [proef, setProef] = useState<ReadonlyMap<string, Proef>>(new Map());
  const [gekozen, setGekozen] = useState<Plek>({ slot: "gevel" });
  const [bezig, setBezig] = useState(false);
  const [tikfout, setTikfout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState<string | null>(null);
  const [bewaardeDelen, setBewaardeDelen] = useState<ReadonlyMap<number, readonly Deel[]>>(
    () => new Map(opties.verdiepingen.map((v) => [v.id, v.delen ?? []])),
  );
  const [tik, setTik] = useState<Tik | null>(null);
  const [teken, setTeken] = useState<Tekening | null>(null);
  const [delenBezig, setDelenBezig] = useState(false);
  const tekenRef = useRef(teken);
  tekenRef.current = teken;

  const perId = useMemo(
    () => new Map([...delen].flatMap(([verdiepingId, lijst]) => lijst.map((deel) => [deel.id, { verdiepingId, deel }] as const))),
    [delen],
  );
  const verdieping3d = (id: number) => model.verdiepingen.find((v) => v.id === id) ?? null;
  const ruimtenaam = (id: number | null | undefined) =>
    id === null || id === undefined ? null : (opties.verdiepingen.flatMap((v) => v.ruimtes).find((r) => r.id === id)?.naam ?? null);
  /** De ruimte onder het midden van een veelhoek op een verdieping. */
  const ruimteOnder = (verdiepingId: number, veelhoek: Xy[]) => {
    const midden = zwaartepunt(veelhoek);
    return verdieping3d(verdiepingId)?.vloeren.find((vloer) => binnenRuimte(midden, vloer.ringen))?.ruimteId;
  };

  // Een deel dat weg is: zijn onderdeel. Een vloer zonder (bestaande) ruimte: de eerste ruimte met een vloer.
  const gekozenDeel = gekozen.deelId !== undefined ? (perId.get(gekozen.deelId) ?? null) : null;
  const deel = gekozenDeel?.deel ?? null;
  const plek: Plek = deel
    ? { slot: slotVanDeel(deel.vorm), deelId: deel.id }
    : gekozen.deelId !== undefined
      ? { slot: gekozen.slot }
      : gekozen.slot === "vloer" && !vloerruimtes.some((r) => r.id === gekozen.ruimteId)
        ? { slot: "vloer", ruimteId: vloerruimtes[0]?.id }
        : gekozen;
  // Een deel van een vloer krijgt de opties van de keuze van de ruimte eronder bij zijn stalen.
  const keuzeRuimte = deel && gekozenDeel ? (deel.vorm.soort === "vloer" ? ruimteOnder(gekozenDeel.verdiepingId, deel.vorm.veelhoek) : undefined) : plek.ruimteId;
  const keuze = keuzeVan(plek.slot, materialen, keuzeRuimte);
  const ruimtes = deel || plek.slot !== "vloer" ? [] : keuze ? keuze.ruimteIds : plek.ruimteId !== undefined ? [plek.ruimteId] : [];
  const sleutels = plek.slot === "vloer" ? ruimtes.map((id) => proefsleutel("vloer", id)) : [plek.slot];
  const getoond: Getoond = deel
    ? { materiaal: materiaalVanDeel(deel, materialen), naam: deel.materiaal.naam, optieId: deel.materiaal.optieId, bron: "deel" }
    : materiaalVan(plek.slot, materialen, proef, plek.ruimteId);
  const vloernaam = vloerruimtes.find((r) => r.id === plek.ruimteId)?.naam;
  const naam = deel ? deel.naam : plek.slot === "vloer" ? (vloernaam ? vloertitel(vloernaam) : "Vloer") : SLOTNAMEN[plek.slot];
  const bewaardDeel = deel ? [...bewaardeDelen.values()].flat().find((d) => d.id === deel.id) : undefined;

  const optiestalen = (keuze?.opties ?? []).map((o) => ({ sleutel: `optie-${o.id}`, naam: o.naam, materiaal: alsMateriaal(o, plek.slot), optieId: o.id }));
  const stalen = [
    ...optiestalen,
    ...STALEN[plek.slot]
      .filter((s) => !optiestalen.some((o) => zelfdeMateriaal(o.materiaal, s.materiaal)))
      .map((s) => ({ sleutel: `staal-${s.naam}`, naam: s.naam, materiaal: s.materiaal, optieId: null })),
  ];

  const gewijzigd = useMemo(
    () => [...new Set([...delen.keys(), ...bewaardeDelen.keys()])].filter((id) => !gelijk(delen.get(id), bewaardeDelen.get(id))),
    [delen, bewaardeDelen],
  );

  // Wie weggaat met delen die niet bewaard zijn, krijgt een vraag van de browser.
  useEffect(() => {
    if (gewijzigd.length === 0) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [gewijzigd.length]);

  function kies(nieuw: Plek) {
    setTikfout(null);
    setBewaard(null);
    setGekozen(nieuw);
  }

  function zet(wijzig: (oud: Proef | undefined) => Proef | null) {
    setBewaard(null);
    setTikfout(null);
    setProef((oud) => {
      const nieuw = new Map(oud);
      for (const sleutel of sleutels) {
        const p = wijzig(oud.get(sleutel));
        if (p) nieuw.set(sleutel, p);
        else nieuw.delete(sleutel);
      }
      return nieuw;
    });
  }

  /** Verandert een deel, of haalt het weg (null). */
  function wijzigDeel(id: string, wijzig: (oud: Deel) => Deel | null) {
    setBewaard(null);
    setTikfout(null);
    setDelen((oud) => {
      const nieuw = new Map(oud);
      for (const [verdiepingId, lijst] of oud) {
        if (!lijst.some((d) => d.id === id)) continue;
        nieuw.set(
          verdiepingId,
          lijst.flatMap((d) => {
            if (d.id !== id) return [d];
            const ander = wijzig(d);
            return ander ? [ander] : [];
          }),
        );
      }
      return nieuw;
    });
  }

  function probeer(staalnaam: string, materiaal: Materiaal, optieId: number | null) {
    // Een staal of eigen kleur die al een optie is: dan die optie.
    const bestaand = optieId === null ? bewaardAls(keuze, materiaal) : null;
    if (deel) {
      wijzigDeel(deel.id, (d) => ({
        ...d,
        materiaal: {
          naam: bestaand?.naam ?? staalnaam,
          kleur: materiaal.kleur.toLowerCase(),
          patroon: materiaal.patroon,
          voegkleur: materiaal.voegkleur,
          optieId: bestaand?.id ?? optieId,
        },
      }));
      return;
    }
    const nieuw: Proef = { naam: bestaand?.naam ?? staalnaam, materiaal, optieId: bestaand?.id ?? optieId };
    zet(() => nieuw);
  }

  function eigen(wijziging: Partial<Materiaal>) {
    const nieuw: Materiaal = { ...getoond.materiaal, foto: null, ...wijziging };
    if (!nieuw.patroon || !MET_VOEG.includes(nieuw.patroon)) nieuw.voegkleur = null;
    else nieuw.voegkleur ??= STANDAARDVOEG;
    probeer(eigenNaam(nieuw), nieuw, null);
  }

  async function bewaar() {
    if (deel || getoond.bron !== "proef" || getoond.optieId !== null) return;
    const optienaam = (getoond.naam ?? "").trim();
    if (!optienaam) return;
    const { kleur, patroon, voegkleur } = getoond.materiaal;
    setBezig(true);
    const uitkomst = await bewaarMateriaalActie(huisId, {
      slot: plek.slot,
      ruimteId: plek.slot === "vloer" ? (plek.ruimteId ?? null) : null,
      keuzeId: keuze?.keuzeId ?? null,
      naam: optienaam,
      kleur,
      patroon,
      voegkleur,
    }).catch(() => null);
    setBezig(false);
    if (!uitkomst) return opties.meld({ soort: "fout", tekst: "Geen verbinding met de app." });
    if (!uitkomst.ok) return opties.meld({ soort: "fout", tekst: uitkomst.melding });
    const { optieId, titel, nieuweKeuze, bestond } = uitkomst.data;
    zet((oud) => (oud && zelfdeMateriaal(oud.materiaal, getoond.materiaal) ? { ...oud, optieId } : (oud ?? null)));
    setBewaard(bestond ? `Stond al bij ${titel}.` : `Bewaard als optie bij ${titel}.`);
    opties.meld({
      soort: "goed",
      tekst: bestond
        ? `${optienaam} stond al als optie bij ${titel}.`
        : `${optienaam} staat nu als optie bij ${nieuweKeuze ? "de nieuwe keuze " : ""}${titel}. Kiezen doe je bij de keuze.`,
    });
  }

  // ---------------------------------------------------------------------------
  // Delen maken
  // ---------------------------------------------------------------------------

  /**
   * Een nieuw deel, met wat er nu op die plek te zien is: het deel dat de tik
   * raakte, of het materiaal van het onderdeel. Pas met een staal verandert er
   * iets. Een tweede keer hetzelfde vlak kiest het eerste.
   */
  function nieuwDeel(verdiepingId: number, vorm: Deelvorm, ruimte: string | null, ruimteId?: number) {
    const v = opties.verdiepingen.find((w) => w.id === verdiepingId);
    if (!v) return;
    const huidig = delen.get(verdiepingId) ?? [];
    const slot = slotVanDeel(vorm);
    const eronder = tik?.deelId !== undefined ? perId.get(tik.deelId)?.deel : undefined;
    const nu = materiaalVan(slot, materialen, proef, slot === "vloer" ? ruimteId : undefined);
    const materiaal =
      eronder && slotVanDeel(eronder.vorm) === slot
        ? eronder.materiaal
        : { naam: nu.naam ?? "Standaard", kleur: nu.materiaal.kleur.toLowerCase(), patroon: nu.materiaal.patroon, voegkleur: nu.materiaal.voegkleur, optieId: nu.optieId };
    const [schoon] = schoneDelen([
      {
        id: nieuweId(),
        naam: deelnaam(vorm, { verdieping: v.naam, ruimte, noorden: opties.noorden() }, [...perId.values()].map((x) => x.deel.naam)),
        vorm,
        materiaal,
      },
    ]);
    if (!schoon) return setTikfout("Dat deel is te klein. Probeer het groter.");
    const zelfde = huidig.find((d) => zelfdeVorm(d.vorm, schoon.vorm));
    if (zelfde) return kies({ slot: slotVanDeel(zelfde.vorm), deelId: zelfde.id });
    if (huidig.length >= MAX_DELEN) return opties.meld({ soort: "fout", tekst: `Hoogstens ${MAX_DELEN} delen per verdieping.` });
    setDelen((oud) => new Map(oud).set(verdiepingId, [...(oud.get(verdiepingId) ?? []), schoon]));
    kies({ slot, deelId: schoon.id });
  }

  /** Het muurvlak onder de tik: van hoek tot hoek, van de vloer tot de vloer erboven (een gevel) of het plafond. */
  function maakVlak() {
    if (tik?.soort !== "muur") return;
    const v = verdieping3d(tik.verdiepingId);
    const vlak = v ? muurvlakBij(v, tik.punt, tik.kijk) : null;
    if (!v || !vlak) return setTikfout("Hier vind ik geen muur om een vlak van te maken. Teken het deel zelf.");
    const hoogtes = hoogtesVan(model, v);
    const ruimteId = vlak.zijde === "binnenmuur" ? ruimteVoor(v.vloeren, vlak.a, vlak.b, vlak.n) : null;
    nieuwDeel(
      v.id,
      { soort: "muur", zijde: vlak.zijde, a: vlak.a, b: vlak.b, n: vlak.n, onder: 0, boven: vlak.zijde === "gevel" ? hoogtes.verdieping : hoogtes.muur },
      ruimtenaam(ruimteId),
    );
  }

  const tikruimte = tik?.soort === "muur" && tik.zijde === "binnenmuur" ? ruimteVoor(verdieping3d(tik.verdiepingId)?.vloeren ?? [], tik.punt, tik.punt, tik.kijk) : null;

  /** Alle binnenmuren van de ruimte onder de tik, van de vloer tot het plafond. */
  function maakWanden() {
    const v = tik ? verdieping3d(tik.verdiepingId) : null;
    if (!v || tikruimte === null) return;
    nieuwDeel(v.id, { soort: "wanden", ruimteId: tikruimte, onder: 0, boven: hoogtesVan(model, v).muur }, ruimtenaam(tikruimte));
  }

  function startTekenen() {
    if (!tik) return;
    const v = verdieping3d(tik.verdiepingId);
    if (!v) return;
    setTikfout(null);
    setBewaard(null);
    if (tik.soort === "muur") {
      const vlak = muurvlakBij(v, tik.punt, tik.kijk);
      if (!vlak) return setTikfout("Hier vind ik geen muur om op te tekenen.");
      setTeken({ soort: "muur", tik, vlak, vloer: v.z0, hoogte: hoogtesVan(model, v).muur, hoek: null });
      return;
    }
    const opDak = tik.soort === "dak";
    const hoeken = [...hoekenVan(v), ...(opDak ? (v.dakplaat?.veelhoeken.flat(2) ?? []) : [])];
    setTeken({ soort: tik.soort, tik, hoogte: opDak ? (v.dakplaat?.z1 ?? v.z1) : v.z0 + 0.012, hoeken, punten: [] });
  }

  /** Sluit de veelhoek op een vloer of plat dak, als er minstens drie punten zijn. */
  function sluit(t: Tekening) {
    if (t.soort === "muur" || t.punten.length < 3) return;
    setTeken(null);
    const ruimteId = t.soort === "vloer" ? ruimteOnder(t.tik.verdiepingId, t.punten) : undefined;
    nieuwDeel(t.tik.verdiepingId, { soort: t.soort, veelhoek: t.punten }, ruimtenaam(ruimteId), ruimteId);
  }

  function tikTekening(straal: THREE.Raycaster) {
    const d = kern.current;
    const t = tekenRef.current;
    const eigenGroep = t ? d?.opgebouwd?.eigen.get(t.tik.gebouwId) : undefined;
    if (!d || !t || !eigenGroep) return;
    const p = puntOpTekening(straal, eigenGroep, t, d.camera);
    if (!p) return;
    if (t.soort === "muur") {
      if (!t.hoek) return setTeken({ ...t, hoek: p });
      const [u0, u1] = [Math.min(t.hoek[0], p[0]), Math.max(t.hoek[0], p[0])];
      const [z0, z1] = [Math.min(t.hoek[1], p[1]), Math.max(t.hoek[1], p[1])];
      if (u1 - u0 < 0.05 || z1 - z0 < 0.05) return setTikfout("Tik de hoek schuin tegenover de eerste: zo wordt het een rechthoek.");
      const r = langs(t.vlak);
      const a: Xy = [t.vlak.a[0] + r[0] * u0, t.vlak.a[1] + r[1] * u0];
      const b: Xy = [t.vlak.a[0] + r[0] * u1, t.vlak.a[1] + r[1] * u1];
      const v = verdieping3d(t.tik.verdiepingId);
      const ruimteId = t.vlak.zijde === "binnenmuur" && v ? ruimteVoor(v.vloeren, a, b, t.vlak.n) : null;
      setTeken(null);
      nieuwDeel(t.tik.verdiepingId, { soort: "muur", zijde: t.vlak.zijde, a, b, n: t.vlak.n, onder: z0, boven: z1 }, ruimtenaam(ruimteId));
      return;
    }
    const eerste = t.punten[0];
    if (eerste && t.punten.length >= 3 && afstand(p, eerste) < 1e-6) return sluit(t);
    setTikfout(null);
    setTeken({ ...t, punten: [...t.punten, p] });
  }

  // Het voorbeeld van wat er getekend wordt: met de muis ook waar de volgende tik komt.
  const voorbeeld = useRef<Voorbeeld | null>(null);
  const muis = useRef<{ clientX: number; clientY: number } | null>(null);
  useEffect(() => {
    const d = kern.current;
    if (!d) return;
    const nieuw = new Voorbeeld(d.scene);
    voorbeeld.current = nieuw;
    return () => {
      nieuw.opruimen();
      voorbeeld.current = null;
    };
  }, [kern]);

  const toonVoorbeeld = useCallback(() => {
    const d = kern.current;
    const t = tekenRef.current;
    const v = voorbeeld.current;
    if (!v) return;
    const eigenGroep = t ? d?.opgebouwd?.eigen.get(t.tik.gebouwId) : undefined;
    if (!d || !t || !eigenGroep) return v.wis();
    let cursor: Xy | null = null;
    if (muis.current) {
      const straal = new THREE.Raycaster();
      richtStraal(straal, muis.current, d.renderer.domElement, d.camera);
      cursor = puntOpTekening(straal, eigenGroep, t, d.camera);
    }
    if (t.soort === "muur") {
      const r = langs(t.vlak);
      const in3 = ([u, z]: Xy) => new THREE.Vector3(t.vlak.a[0] + r[0] * u, t.vloer + z, t.vlak.a[1] + r[1] * u);
      if (t.hoek && cursor) v.toon(eigenGroep, [t.hoek, [cursor[0], t.hoek[1]] as Xy, cursor, [t.hoek[0], cursor[1]] as Xy].map(in3), true);
      else v.toon(eigenGroep, [], false, [t.hoek, cursor].flatMap((p) => (p ? [in3(p)] : [])));
      return;
    }
    const in3 = ([x, y]: Xy) => new THREE.Vector3(x, t.hoogte + 0.01, y);
    const punten = cursor ? [...t.punten, cursor] : t.punten;
    v.toon(eigenGroep, punten.map(in3), false, punten.map(in3));
  }, [kern]);

  useEffect(() => {
    toonVoorbeeld();
  }, [teken, toonVoorbeeld]);

  // Met de muis: het voorbeeld volgt, zonder te tikken.
  const tekent = teken !== null;
  useEffect(() => {
    const element = kern.current?.renderer.domElement;
    if (!tekent || !element) return;
    let frame = 0;
    const beweeg = (e: PointerEvent) => {
      muis.current = e.pointerType === "mouse" && e.buttons === 0 ? { clientX: e.clientX, clientY: e.clientY } : null;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          toonVoorbeeld();
        });
      }
    };
    const weg = () => {
      muis.current = null;
      toonVoorbeeld();
    };
    element.addEventListener("pointermove", beweeg);
    element.addEventListener("pointerleave", weg);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", beweeg);
      element.removeEventListener("pointerleave", weg);
      muis.current = null;
    };
  }, [kern, tekent, toonVoorbeeld]);

  // Uit de materialen: een begonnen tekening valt weg.
  useEffect(() => {
    if (!aan) setTeken(null);
  }, [aan]);

  /** Laat de vlakken van een plek even oplichten: zo zie je wat je aantikte. */
  function licht(geraakt: Plek) {
    const d = kern.current;
    if (!d) return;
    const k = keuzeVan(geraakt.slot, materialen, geraakt.ruimteId);
    const kamers = geraakt.slot !== "vloer" ? [] : k ? k.ruimteIds : [geraakt.ruimteId];
    const vlakken = [...d.materialen]
      .filter(([sleutel]) => {
        if (geraakt.deelId !== undefined) return deelVanSleutel(sleutel) === geraakt.deelId;
        const p = slotVan(sleutel);
        return p !== null && p.slot === geraakt.slot && (p.slot !== "vloer" || kamers.includes(p.ruimteId));
      })
      .map(([, m]) => m);
    let tijd = 0;
    const doe = (dt: number) => {
      tijd += dt;
      const sterkte = Math.max(0, 1 - tijd / 0.9);
      for (const m of vlakken) {
        m.emissive.setHex(0xf97316);
        m.emissiveIntensity = 0.55 * sterkte;
      }
      if (sterkte > 0) return;
      for (const m of vlakken) m.emissive.setHex(0x000000);
      d.elkBeeld.delete(doe);
    };
    d.elkBeeld.add(doe);
  }

  /** Wat de tik raakte, in het assenstelsel van het gebouw: genoeg om er een deel van te maken. */
  function tikVan(raak: THREE.Intersection, straal: THREE.Raycaster, geraakt: Plek): Tik | null {
    const d = kern.current;
    const { gebouwId, verdiepingId } = raak.object.userData as { gebouwId?: number; verdiepingId?: number | null };
    const eigenGroep = gebouwId === undefined ? undefined : d?.opgebouwd?.eigen.get(gebouwId);
    if (!eigenGroep || gebouwId === undefined || verdiepingId === null || verdiepingId === undefined) return null;
    const lokaal = eigenGroep.worldToLocal(raak.point.clone());
    const punt: Xy = [lokaal.x, lokaal.z];
    const vorm = geraakt.deelId !== undefined ? perId.get(geraakt.deelId)?.deel.vorm : undefined;
    const sleutel = String(raak.object.userData.sleutel);
    const deelId = geraakt.deelId;
    if (geraakt.slot === "gevel" || geraakt.slot === "binnenmuur") {
      // De kant die je ziet: de normaal van het vlak, naar de camera toe. De vlakken liggen in het assenstelsel van het gebouw.
      const normaal = raak.face?.normal.clone();
      if (!normaal) return null;
      const richting = eigenGroep.worldToLocal(raak.point.clone().add(straal.ray.direction)).sub(lokaal);
      if (normaal.dot(richting) > 0) normaal.negate();
      const lengte = Math.hypot(normaal.x, normaal.z);
      if (lengte < 0.5) return null;
      return { soort: "muur", zijde: geraakt.slot, gebouwId, verdiepingId, punt, kijk: [normaal.x / lengte, normaal.z / lengte], deelId };
    }
    if (geraakt.slot === "vloer") {
      const ruimteId = geraakt.ruimteId ?? (vorm?.soort === "vloer" ? ruimteOnder(verdiepingId, [punt, punt, punt]) : undefined);
      return { soort: "vloer", gebouwId, verdiepingId, punt, ruimteId: ruimteId ?? null, deelId };
    }
    if (sleutel === "dakplat" || vorm?.soort === "dak") return { soort: "dak", gebouwId, verdiepingId, punt, deelId };
    return null;
  }

  // Een tik op het beeld kiest de muur, het dak, de vloer of het deel dat je ziet. Tijdens het tekenen zet hij een hoek.
  useTik(kern, aan, (e) => {
    const d = kern.current;
    if (!d?.opgebouwd) return;
    const straal = new THREE.Raycaster();
    richtStraal(straal, e, d.renderer.domElement, d.camera);
    if (tekenRef.current) return tikTekening(straal);
    // Enkel de vlakken van het gebouw: een tik gaat door de leidingen, de punten en de meubels heen.
    const raak = zichtbareRaak(straal, [d.opgebouwd.wortel], d.snede).find((r) => typeof r.object.userData.sleutel === "string");
    const sleutel = raak?.object.userData.sleutel as Sleutel | undefined;
    const deelId = sleutel ? deelVanSleutel(sleutel) : null;
    const gevonden = deelId !== null ? perId.get(deelId) : undefined;
    const geraakt: Plek | null = gevonden ? { slot: slotVanDeel(gevonden.deel.vorm), deelId: gevonden.deel.id } : sleutel ? plekVanTik(sleutel) : null;
    if (!geraakt || !raak) {
      // Wat je na een tik kan kiezen, hoort bij die tik: een tik ernaast neemt het weg.
      setTik(null);
      setTikfout(
        sleutel && VAST[sleutel]
          ? `Dat is ${VAST[sleutel]}: dat kan je hier niet aanpassen.`
          : "Tik een gevel, een binnenmuur, het dak, een raam of een vloer.",
      );
      return;
    }
    setTik(tikVan(raak, straal, geraakt));
    kies(geraakt);
    licht(geraakt);
  });

  function breekAf(): boolean {
    if (!tekenRef.current) return false;
    setTeken(null);
    return true;
  }

  // Wat je na een tik kan kiezen: het hele onderdeel, dit vlak, de muren van de ruimte, of een deel tekenen.
  const bereik: Bereik[] = [];
  if (tik) {
    const v = verdieping3d(tik.verdiepingId);
    const geheel: Plek =
      tik.soort === "muur" ? { slot: tik.zijde } : tik.soort === "vloer" ? { slot: "vloer", ruimteId: tik.ruimteId ?? undefined } : { slot: "dak" };
    const vloer = tik.soort === "vloer" ? ruimtenaam(tik.ruimteId) : null;
    bereik.push({
      sleutel: "geheel",
      naam: tik.soort === "muur" ? (tik.zijde === "gevel" ? "Heel de gevel" : "Alle binnenmuren") : tik.soort === "vloer" ? (vloer ? vloertitel(vloer) : "Hele vloer") : "Heel het dak",
      actief: !deel && !teken && plek.slot === geheel.slot && (geheel.slot !== "vloer" || plek.ruimteId === geheel.ruimteId),
      kies: () => {
        setTeken(null);
        kies(geheel);
      },
    });
    if (tik.soort === "muur" && v) {
      const vlak = muurvlakBij(v, tik.punt, tik.kijk);
      bereik.push({
        sleutel: "vlak",
        naam: tik.zijde === "gevel" ? "Dit muurvlak" : "Deze muur",
        actief: !teken && !!vlak && deel?.vorm.soort === "muur" && afstand(deel.vorm.a, vlak.a) < 0.01 && afstand(deel.vorm.b, vlak.b) < 0.01 && deel.vorm.onder === 0,
        kies: () => {
          setTeken(null);
          maakVlak();
        },
      });
      const naamRuimte = ruimtenaam(tikruimte);
      if (tik.zijde === "binnenmuur" && naamRuimte) {
        bereik.push({
          sleutel: "wanden",
          naam: `Muren ${klein(naamRuimte)}`,
          actief: !teken && deel?.vorm.soort === "wanden" && deel.vorm.ruimteId === tikruimte,
          kies: () => {
            setTeken(null);
            maakWanden();
          },
        });
      }
    }
    bereik.push({ sleutel: "tekenen", naam: "Deel tekenen", actief: teken !== null, kies: () => (teken ? setTeken(null) : startTekenen()) });
  }
  if (deel && !bereik.some((b) => b.actief)) bereik.push({ sleutel: "deel", naam: deel.naam, actief: true, kies: () => undefined });

  const tekening: Materiaalproef["tekening"] = teken
    ? {
        soort: teken.soort,
        punten: teken.soort === "muur" ? (teken.hoek ? 1 : 0) : teken.punten.length,
        uitleg:
          teken.soort === "muur"
            ? teken.hoek
              ? "Tik de hoek schuin tegenover de eerste."
              : "Tik een hoek van het deel op de muur. Een tik kleeft aan de rand van een raam, de vloer en de hoeken."
            : teken.punten.length < 3
              ? `Tik de hoeken van het deel op ${teken.soort === "vloer" ? "de vloer" : "het dak"}. Een tik kleeft aan een hoek van een muur.`
              : "Tik nog een hoek, of op het eerste punt of Klaar om het deel te sluiten.",
      }
    : null;

  const deelvlak = useMemo(() => {
    if (!gekozenDeel || gekozenDeel.deel.vorm.soort !== "muur") return null;
    const { vorm } = gekozenDeel.deel;
    const v = model.verdiepingen.find((w) => w.id === gekozenDeel.verdiepingId);
    return v ? muurvlakBij(v, [(vorm.a[0] + vorm.b[0]) / 2, (vorm.a[1] + vorm.b[1]) / 2], vorm.n) : null;
  }, [gekozenDeel, model]);
  const deelverdieping = gekozenDeel ? verdieping3d(gekozenDeel.verdiepingId) : null;

  return {
    proef,
    plek,
    kiesPlek: (nieuw) => {
      setTeken(null);
      kies(nieuw);
    },
    naam,
    getoond,
    keuze,
    ruimtes,
    stalen,
    probeer,
    eigen,
    zetNaam: (nieuw) => zet((oud) => (oud ? { ...oud, naam: nieuw } : null)),
    terug: () => {
      if (!deel) return zet(() => null);
      if (bewaardDeel) wijzigDeel(deel.id, (d) => ({ ...d, materiaal: bewaardDeel.materiaal }));
    },
    kanTerug: deel ? !!bewaardDeel && JSON.stringify(bewaardDeel.materiaal) !== JSON.stringify(deel.materiaal) : getoond.bron === "proef",
    bezig,
    bewaar,
    tikfout,
    bewaard,

    bereik,
    delen,
    deel: gekozenDeel,
    deelvlak,
    muurhoogte: deelverdieping ? hoogtesVan(model, deelverdieping) : null,
    gewijzigd: gewijzigd.length,
    tekening,
    stopTekenen: () => setTeken(null),
    sluitTekening: () => {
      if (teken) sluit(teken);
    },
    puntWeg: () => {
      if (teken?.soort === "muur") setTeken({ ...teken, hoek: null });
      else if (teken) setTeken({ ...teken, punten: teken.punten.slice(0, -1) });
    },
    breekAf,
    hernoem: (nieuw) => {
      if (deel) wijzigDeel(deel.id, (d) => ({ ...d, naam: nieuw.slice(0, 80) }));
    },
    wijzigVorm: (vorm) => {
      if (deel) wijzigDeel(deel.id, (d) => ({ ...d, vorm }));
    },
    verwijder: () => {
      if (deel) wijzigDeel(deel.id, () => null);
    },
    delenBezig,
    bewaarDelen: async () => {
      setDelenBezig(true);
      for (const verdiepingId of gewijzigd) {
        // Een lege naam bewaart de app als "Deel".
        const lijst = (delen.get(verdiepingId) ?? []).map((d) => ({ ...d, naam: d.naam.trim() || "Deel" }));
        const uitkomst = await bewaarDelenActie(huisId, { verdiepingId, delen: lijst }).catch(() => null);
        if (!uitkomst || !uitkomst.ok) {
          setDelenBezig(false);
          return opties.meld({ soort: "fout", tekst: uitkomst ? uitkomst.melding : "Geen verbinding met de app." });
        }
        setBewaardeDelen((oud) => new Map(oud).set(verdiepingId, uitkomst.data));
        setDelen((oud) => new Map(oud).set(verdiepingId, uitkomst.data));
      }
      setDelenBezig(false);
      opties.meld({ soort: "goed", tekst: "De delen zijn bewaard." });
    },
    herbegin: () => {
      setTeken(null);
      setDelen(() => bewaardeDelen);
    },
  };
}

function Staalknop({ naam, materiaal, actief, kies }: { naam: string; materiaal: Materiaal; actief: boolean; kies: () => void }) {
  return (
    <button type="button" className="staal" aria-pressed={actief} title={naam} onClick={kies}>
      <Staalbeeld materiaal={materiaal} className="staal-beeld" />
      <span className="staal-naam">{naam}</span>
    </button>
  );
}

function Stalen({ proef: p, welke }: { proef: Materiaalproef; welke: "opties" | "stalen" | "alle" }) {
  const { getoond } = p;
  const getoonde = p.stalen.filter((staal) => welke === "alle" || (welke === "opties") === (staal.optieId !== null));
  return (
    <>
      {getoonde.map((staal) => (
        <Staalknop
          key={staal.sleutel}
          naam={staal.naam}
          materiaal={staal.materiaal}
          actief={
            getoond.optieId !== null
              ? staal.optieId === getoond.optieId
              : (getoond.bron === "proef" || getoond.bron === "deel") && staal.optieId === null && zelfdeMateriaal(staal.materiaal, getoond.materiaal)
          }
          kies={() => p.probeer(staal.naam, staal.materiaal, staal.optieId)}
        />
      ))}
    </>
  );
}

const kanBewaren = (p: Materiaalproef, metKeuzes: boolean) => metKeuzes && p.getoond.bron === "proef" && p.getoond.optieId === null;

/** De knoppen tijdens het tekenen van een deel. */
function Tekenknoppen({ proef: p }: { proef: Materiaalproef }) {
  const t = p.tekening;
  if (!t) return null;
  return (
    <div className="drie-bereik">
      {t.soort !== "muur" ? (
        <button type="button" className="drie-knop klein" disabled={t.punten < 3} onClick={p.sluitTekening}>
          Klaar
        </button>
      ) : null}
      <button type="button" className="drie-knop klein" disabled={t.punten === 0} onClick={p.puntWeg}>
        {t.soort === "muur" ? "Opnieuw" : "Laatste punt weg"}
      </button>
      <button type="button" className="drie-knop klein" onClick={p.stopTekenen}>
        Stoppen
      </button>
    </div>
  );
}

/** De stalen onderaan het beeld, tijdens het aantikken: ook in het volledig scherm, zonder paneel. */
export function Staalstrook({ proef: p, metKeuzes, boven }: { proef: Materiaalproef; metKeuzes: boolean; boven: boolean }) {
  return (
    <div className={`drie-stalen${boven ? " boven-knoppen" : ""}`} role="group" aria-label={`Stalen voor ${p.naam.toLowerCase()}`}>
      <div className="drie-stalen-kop">
        <span>
          <strong>{p.naam}</strong>
          {p.tikfout ? null : <span className="hulp"> · {p.getoond.naam ?? "standaard"}</span>}
        </span>
        {p.gewijzigd > 0 && !p.tekening ? (
          <button type="button" className="drie-knop klein" disabled={p.delenBezig} onClick={() => void p.bewaarDelen()}>
            Delen bewaren
          </button>
        ) : kanBewaren(p, metKeuzes) ? (
          <button type="button" className="drie-knop klein" disabled={p.bezig || !(p.getoond.naam ?? "").trim()} onClick={() => void p.bewaar()}>
            Bewaren als optie
          </button>
        ) : null}
      </div>
      {p.bereik.length > 0 ? (
        <div className="drie-bereik" role="group" aria-label="Wat het materiaal krijgt">
          {p.bereik.map((b) => (
            <button key={b.sleutel} type="button" className="drie-knop klein" aria-pressed={b.actief} onClick={b.kies}>
              {b.naam}
            </button>
          ))}
        </div>
      ) : null}
      {p.tikfout ? <p className="drie-stalen-fout">{p.tikfout}</p> : null}
      {p.bewaard ? <p className="drie-stalen-goed">{p.bewaard}</p> : null}
      {p.tekening ? (
        <>
          <p className="drie-stalen-goed">{p.tekening.uitleg}</p>
          <Tekenknoppen proef={p} />
        </>
      ) : (
        <div className="drie-stalen-rij">
          <Stalen proef={p} welke="opties" />
          {p.stalen.some((s) => s.optieId !== null) ? <span className="drie-stalen-scheiding" aria-hidden="true" /> : null}
          <Stalen proef={p} welke="stalen" />
        </div>
      )}
    </div>
  );
}

const komma = (waarde: number) => String(Math.round(waarde * 100) / 100).replace(".", ",");

/** Een maat in meter, met een komma: bewaard bij Enter of als je het veld verlaat. */
function Maatveld({ id, label, waarde, min, max, zet }: { id: string; label: string; waarde: number; min: number; max: number; zet: (waarde: number) => void }) {
  const [tekst, setTekst] = useState<string | null>(null);
  const bevestig = () => {
    if (tekst === null) return;
    const getal = Number(tekst.replace(",", ".").trim());
    setTekst(null);
    if (Number.isFinite(getal) && getal >= min - 1e-9 && getal <= max + 1e-9 && Math.abs(getal - waarde) > 0.001) zet(Math.round(getal * 100) / 100);
  };
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={tekst ?? komma(waarde)}
        onChange={(g) => setTekst(g.currentTarget.value)}
        onBlur={bevestig}
        onKeyDown={(g) => {
          if (g.key === "Enter") bevestig();
        }}
      />
    </div>
  );
}

/** De naam en de maten van het gekozen deel. */
function Deelvelden({ proef: p }: { proef: Materiaalproef }) {
  if (!p.deel) return null;
  const { deel } = p.deel;
  const { vorm } = deel;
  const vlak = p.deelvlak;
  const grootte = grootteVan(vorm);
  const hoog = p.muurhoogte;
  const lengte = vlak ? afstand(vlak.a, vlak.b) : 0;
  const r = vlak ? langs(vlak) : ([0, 0] as Xy);
  const opVlak = (q: Xy) => (vlak ? (q[0] - vlak.a[0]) * r[0] + (q[1] - vlak.a[1]) * r[1] : 0);
  const punt = (u: number): Xy => (vlak ? [Math.round((vlak.a[0] + r[0] * u) * 1000) / 1000, Math.round((vlak.a[1] + r[1] * u) * 1000) / 1000] : [0, 0]);
  return (
    <div className="deelvelden">
      <label htmlFor="deel-naam">Naam van het deel</label>
      <input id="deel-naam" value={deel.naam} maxLength={80} onChange={(g) => p.hernoem(g.currentTarget.value)} />
      {vorm.soort === "muur" || vorm.soort === "wanden" ? (
        <>
          <div className="veldenrij" style={{ marginTop: 8 }}>
            {vorm.soort === "muur" && vlak ? (
              <>
                <Maatveld
                  id="deel-van"
                  label="Van (m, van links)"
                  waarde={Math.max(0, opVlak(vorm.a))}
                  min={0}
                  max={Math.max(0, opVlak(vorm.b) - 0.05)}
                  zet={(u) => p.wijzigVorm({ ...vorm, a: punt(u) })}
                />
                <Maatveld
                  id="deel-tot"
                  label={`Tot (m, van ${komma(lengte)})`}
                  waarde={Math.min(lengte, opVlak(vorm.b))}
                  min={opVlak(vorm.a) + 0.05}
                  max={lengte}
                  zet={(u) => p.wijzigVorm({ ...vorm, b: punt(u) })}
                />
              </>
            ) : null}
            <Maatveld id="deel-onder" label="Onderkant (m)" waarde={vorm.onder} min={0} max={vorm.boven - 0.05} zet={(onder) => p.wijzigVorm({ ...vorm, onder })} />
            <Maatveld
              id="deel-boven"
              label="Bovenkant (m)"
              waarde={vorm.boven}
              min={vorm.onder + 0.05}
              max={vorm.soort === "muur" ? 60 : 20}
              zet={(boven) => p.wijzigVorm({ ...vorm, boven })}
            />
          </div>
          <div className="plekken" style={{ marginTop: 6 }}>
            {[1.2, 2.1].map((hoogte) => (
              <button key={hoogte} type="button" className="stil" onClick={() => p.wijzigVorm({ ...vorm, onder: 0, boven: hoogte })}>
                Tot {komma(hoogte)} m
              </button>
            ))}
            {hoog ? (
              <button
                type="button"
                className="stil"
                onClick={() => p.wijzigVorm({ ...vorm, onder: 0, boven: vorm.soort === "muur" && vorm.zijde === "gevel" ? hoog.verdieping : hoog.muur })}
              >
                Volle hoogte
              </button>
            ) : null}
          </div>
          <p className="hulp">
            Boven de vloer van de verdieping. Een gevel mag hoger: dan loopt het deel door op de verdieping erboven, tot in de punt onder het
            dak.
          </p>
        </>
      ) : null}
      <p className="hulp">
        {grootte !== null ? `${komma(grootte)} m²${vorm.soort === "muur" ? ", met de ramen en deuren" : ""}. ` : ""}
        Het materiaal hoort bij het deel, niet bij een keuze.
      </p>
      <div className="knoppenrij">
        <button type="button" className="stil" onClick={p.verwijder}>
          Deel weg
        </button>
      </div>
    </div>
  );
}

/** De kaart Materialen in het paneel: het onderdeel of deel, de stalen, een eigen kleur, en bewaren. */
export function Materiaalkaart({
  proef: p,
  huisId,
  metKeuzes,
  aan,
  wissel,
  vloerruimtes,
  verdiepingen,
}: {
  proef: Materiaalproef;
  huisId: number;
  metKeuzes: boolean;
  aan: boolean;
  wissel: () => void;
  vloerruimtes: readonly Vloerruimte[];
  /** De namen van de verdiepingen, voor de lijst met delen. */
  verdiepingen: readonly { id: number; naam: string }[];
}) {
  const { plek, getoond, keuze } = p;
  const m = getoond.materiaal;
  const meerdere = new Set(vloerruimtes.map((r) => r.verdieping)).size > 1;
  const nieuweTitel = plek.slot === "vloer" ? p.naam : KEUZE_VAN_SLOT[plek.slot].titel;
  // Een vloer verandert mee in de andere ruimtes van haar keuze.
  const samenMet = p.ruimtes.filter((id) => id !== plek.ruimteId).flatMap((id) => vloerruimtes.find((r) => r.id === id)?.naam ?? []);
  const standaard = keuze?.opties.find((o) => o.id === keuze.standaard)?.naam ?? "de standaard";
  const alleDelen = verdiepingen.flatMap((v) => (p.delen.get(v.id) ?? []).map((deel) => ({ verdieping: v.naam, deel })));
  const meerdereVerdiepingen = new Set(alleDelen.map((d) => d.verdieping)).size > 1;

  return (
    <section className="kaart">
      <h3>Materialen</h3>
      <div className="plekken" role="group" aria-label="Onderdeel">
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            className={plek.slot === slot && plek.deelId === undefined ? "" : "stil"}
            aria-pressed={plek.slot === slot && plek.deelId === undefined}
            onClick={() => p.kiesPlek(slot === "vloer" ? { slot, ruimteId: plek.ruimteId } : { slot })}
          >
            {SLOTNAMEN[slot]}
          </button>
        ))}
      </div>
      {plek.slot === "vloer" && plek.deelId === undefined ? (
        vloerruimtes.length === 0 ? (
          <p className="hulp">Nog geen ruimtes met een vloer.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            <label htmlFor="materiaal-ruimte">Ruimte</label>
            <select id="materiaal-ruimte" value={plek.ruimteId ?? ""} onChange={(g) => p.kiesPlek({ slot: "vloer", ruimteId: Number(g.currentTarget.value) })}>
              {vloerruimtes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.naam}
                  {meerdere ? ` (${r.verdieping})` : ""}
                </option>
              ))}
            </select>
          </div>
        )
      ) : null}

      <p className="staalkop">Delen</p>
      {alleDelen.length === 0 ? (
        <p className="hulp">
          Een ander materiaal op een deel van een muur, vloer of plat dak: tik het aan in het beeld, en kies onderaan Dit muurvlak, de muren
          van de ruimte, of Deel tekenen.
        </p>
      ) : (
        <div className="plekken" role="group" aria-label="Delen" style={{ marginTop: 6 }}>
          {alleDelen.map(({ verdieping, deel }) => (
            <button
              key={deel.id}
              type="button"
              className={plek.deelId === deel.id ? "" : "stil"}
              aria-pressed={plek.deelId === deel.id}
              onClick={() => p.kiesPlek({ slot: slotVanDeel(deel.vorm), deelId: deel.id })}
            >
              {deel.naam}
              {meerdereVerdiepingen ? <span className="hulp"> · {verdieping.toLowerCase()}</span> : null}
            </button>
          ))}
        </div>
      )}
      <Deelvelden proef={p} />
      {p.gewijzigd > 0 ? (
        <div className="knoppenrij" style={{ marginTop: 8 }}>
          <button type="button" disabled={p.delenBezig} onClick={() => void p.bewaarDelen()}>
            Delen bewaren
          </button>
          <button type="button" className="stil" disabled={p.delenBezig} onClick={p.herbegin}>
            Herbeginnen
          </button>
        </div>
      ) : null}

      <p className="hulp" style={{ marginTop: 10 }}>
        {plek.deelId !== undefined
          ? `Het materiaal van ${p.naam}: kies een staal of een eigen kleur, en bewaar met Delen bewaren.`
          : !metKeuzes
            ? "Uitproberen bewaart niets."
            : keuze
              ? `Volgt de keuze ${keuze.titel}${samenMet.length > 0 ? `, samen met ${samenMet.join(", ").toLowerCase()}` : ""}. Uitproberen bewaart niets.`
              : `Nog geen keuze voor ${p.naam.toLowerCase()}: bewaren maakt de keuze ${nieuweTitel}. Uitproberen bewaart niets.`}
      </p>
      {p.stalen.some((s) => s.optieId !== null) ? (
        <>
          <p className="staalkop">Opties van {keuze?.titel}</p>
          <div className="stalen">
            <Stalen proef={p} welke="opties" />
          </div>
        </>
      ) : null}
      <p className="staalkop">Stalen</p>
      <div className="stalen">
        <Stalen proef={p} welke="stalen" />
      </div>
      <div className="veldenrij" style={{ marginTop: 8 }}>
        <div>
          <label htmlFor="materiaal-kleur">Eigen kleur</label>
          <div className="kleurveld">
            <input id="materiaal-kleur" type="color" value={m.kleur} onChange={(g) => p.eigen({ kleur: g.currentTarget.value.toLowerCase() })} />
          </div>
        </div>
        <div>
          <label htmlFor="materiaal-patroon">Patroon</label>
          <select
            id="materiaal-patroon"
            value={m.patroon ?? ""}
            onChange={(g) => {
              const waarde = g.currentTarget.value;
              p.eigen({ patroon: isPatroon(waarde) ? waarde : null });
            }}
          >
            <option value="">Egaal</option>
            {PATRONEN.map((patroon) => (
              <option key={patroon} value={patroon}>
                {PATROONNAMEN[patroon]}
              </option>
            ))}
          </select>
        </div>
        {m.patroon && MET_VOEG.includes(m.patroon) ? (
          <div>
            <label htmlFor="materiaal-voeg">Voeg</label>
            <div className="kleurveld">
              <input
                id="materiaal-voeg"
                type="color"
                value={m.voegkleur ?? STANDAARDVOEG}
                onChange={(g) => p.eigen({ voegkleur: g.currentTarget.value.toLowerCase() })}
              />
            </div>
          </div>
        ) : null}
      </div>
      {p.bewaard ? <p className="melding goed">{p.bewaard} Kiezen doe je bij de keuze.</p> : null}
      {kanBewaren(p, metKeuzes) ? (
        <div className="materiaal-bewaren">
          <label htmlFor="materiaal-naam">Naam van de optie</label>
          <input id="materiaal-naam" value={getoond.naam ?? ""} maxLength={80} onChange={(g) => p.zetNaam(g.currentTarget.value)} />
          <div className="knoppenrij">
            <button type="button" disabled={p.bezig || !(getoond.naam ?? "").trim()} onClick={() => void p.bewaar()}>
              Bewaren als optie
            </button>
          </div>
          <p className="hulp">
            {keuze ? `Bij de keuze ${keuze.titel}` : `In een nieuwe keuze ${nieuweTitel}`}, nog zonder prijs. Kiezen doe je bij de keuze.
          </p>
        </div>
      ) : null}
      <div className="knoppenrij" style={{ marginTop: 10 }}>
        <button type="button" className={aan ? "" : "stil"} aria-pressed={aan} onClick={wissel}>
          {aan ? "Klaar met aantikken" : "Aantikken in het beeld"}
        </button>
        {p.kanTerug ? (
          <button type="button" className="stil" onClick={p.terug}>
            {plek.deelId !== undefined ? "Terug naar het bewaarde materiaal" : `Terug naar ${standaard}`}
          </button>
        ) : null}
      </div>
      {metKeuzes && keuze && plek.deelId === undefined ? (
        <p className="hulp" style={{ marginTop: 8 }}>
          <a href={huispad(huisId, `/keuzes/${keuze.keuzeId}`)}>Naar de keuze {keuze.titel}</a>
        </p>
      ) : null}
    </section>
  );
}
