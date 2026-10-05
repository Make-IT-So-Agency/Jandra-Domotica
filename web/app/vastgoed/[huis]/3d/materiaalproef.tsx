"use client";

import { useState, type RefObject } from "react";
import * as THREE from "three";

import { Staalbeeld } from "@/components/bouw/staal";
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
import { STALEN, eigenNaam } from "@/lib/bouw/drie/stalen";
import { MET_VOEG, PATRONEN, PATROONNAMEN, isPatroon } from "@/lib/bouw/keuzes";
import { huispad } from "@/lib/bouw/paden";

import { bewaarMateriaalActie } from "./acties";
import { richtStraal, useTik, zichtbareRaak, type Kern } from "./kern";
import type { Opgebouwd, Sleutel } from "./scene";
import { zetMateriaal, type Texturen } from "./texturen";

/**
 * Materialen uitproberen in 3D: per onderdeel (de gevel, het dak, de ramen,
 * de binnenmuren, de vloer van een ruimte) de opties van de keuze, de stalen
 * en een eigen kleur met een patroon. Tik een muur, het dak of een vloer aan
 * in het beeld, en kies eronder een staal. Uitproberen bewaart niets; Bewaren
 * als optie zet het materiaal bij de keuze (bewaarMateriaalActie). Enkel voor
 * de browser; de regels staan in lib/bouw/drie/materialen.ts en stalen.ts.
 */

type Driekern = Kern & { opgebouwd: Opgebouwd | null; materialen: Map<Sleutel, THREE.MeshStandardMaterial> };
type Melding = { soort: "goed" | "fout"; tekst: string };

/** Waar een materiaal op ligt: een onderdeel, en bij een vloer de ruimte. */
export interface Plek {
  slot: Slot;
  ruimteId?: number;
}

export interface Vloerruimte {
  id: number;
  naam: string;
  verdieping: string;
}

/** De voeg van een eigen baksteen of tegel, tot je er een kiest. */
const STANDAARDVOEG = "#c9c2b8";

/** Welk onderdeel een sleutel van de scène volgt; de rest heeft een vaste kleur. */
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

/** Zet kleur, patroon of foto van een vlak, met wat er nu uitgeprobeerd wordt. */
export function werkMateriaalBij(
  sleutel: Sleutel,
  m: THREE.MeshStandardMaterial,
  materialen: readonly Materiaalkeuze[],
  proef: ReadonlyMap<string, Proef>,
  texturen: Texturen,
  anisotropie: number,
) {
  const plek = slotVan(sleutel);
  if (!plek) return;
  zetMateriaal(m, materiaalVan(plek.slot, materialen, proef, plek.ruimteId).materiaal, texturen, anisotropie);
}

export interface Materiaalproef {
  /** Wat er uitgeprobeerd wordt, per plek (zie proefsleutel). */
  proef: ReadonlyMap<string, Proef>;
  plek: Plek;
  kiesPlek(plek: Plek): void;
  /** Hoe de plek heet: "Gevel", "Vloer badkamer". */
  naam: string;
  getoond: Getoond;
  /** De keuze die de plek volgt, of null. */
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
  bezig: boolean;
  bewaar(): Promise<void>;
  /** Waarom de laatste tik niets koos. */
  tikfout: string | null;
  /** Net bewaard: "Bewaard bij Gevelsteen.", tot je iets anders kiest. */
  bewaard: string | null;
}

export function useMateriaalproef(
  kern: RefObject<Driekern | null>,
  opties: {
    aan: boolean;
    huisId: number;
    materialen: readonly Materiaalkeuze[];
    vloerruimtes: readonly Vloerruimte[];
    meld: (melding: Melding) => void;
  },
): Materiaalproef {
  const { aan, huisId, materialen, vloerruimtes } = opties;
  const [proef, setProef] = useState<ReadonlyMap<string, Proef>>(new Map());
  const [gekozen, setGekozen] = useState<Plek>({ slot: "gevel" });
  const [bezig, setBezig] = useState(false);
  const [tikfout, setTikfout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState<string | null>(null);

  // Een vloer zonder (bestaande) ruimte: de eerste ruimte met een vloer.
  const plek: Plek =
    gekozen.slot === "vloer" && !vloerruimtes.some((r) => r.id === gekozen.ruimteId) ? { slot: "vloer", ruimteId: vloerruimtes[0]?.id } : gekozen;
  const keuze = keuzeVan(plek.slot, materialen, plek.ruimteId);
  const ruimtes = plek.slot !== "vloer" ? [] : keuze ? keuze.ruimteIds : plek.ruimteId !== undefined ? [plek.ruimteId] : [];
  const sleutels = plek.slot === "vloer" ? ruimtes.map((id) => proefsleutel("vloer", id)) : [plek.slot];
  const getoond = materiaalVan(plek.slot, materialen, proef, plek.ruimteId);
  const ruimtenaam = vloerruimtes.find((r) => r.id === plek.ruimteId)?.naam;
  const naam = plek.slot === "vloer" ? (ruimtenaam ? vloertitel(ruimtenaam) : "Vloer") : SLOTNAMEN[plek.slot];

  const optiestalen = (keuze?.opties ?? []).map((o) => ({ sleutel: `optie-${o.id}`, naam: o.naam, materiaal: alsMateriaal(o, plek.slot), optieId: o.id }));
  const stalen = [
    ...optiestalen,
    ...STALEN[plek.slot]
      .filter((s) => !optiestalen.some((o) => zelfdeMateriaal(o.materiaal, s.materiaal)))
      .map((s) => ({ sleutel: `staal-${s.naam}`, naam: s.naam, materiaal: s.materiaal, optieId: null })),
  ];

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

  function probeer(staalnaam: string, materiaal: Materiaal, optieId: number | null) {
    // Een staal of eigen kleur die al een optie is: dan die optie.
    const bestaand = optieId === null ? bewaardAls(keuze, materiaal) : null;
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
    if (getoond.bron !== "proef" || getoond.optieId !== null) return;
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

  /** Laat de vlakken van een plek even oplichten: zo zie je wat je aantikte. */
  function licht(geraakt: Plek) {
    const d = kern.current;
    if (!d) return;
    const k = keuzeVan(geraakt.slot, materialen, geraakt.ruimteId);
    const kamers = geraakt.slot !== "vloer" ? [] : k ? k.ruimteIds : [geraakt.ruimteId];
    const vlakken = [...d.materialen]
      .filter(([sleutel]) => {
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

  // Een tik op het beeld kiest de muur, het dak of de vloer die je ziet.
  useTik(kern, aan, (e) => {
    const d = kern.current;
    if (!d?.opgebouwd) return;
    const straal = new THREE.Raycaster();
    richtStraal(straal, e, d.renderer.domElement, d.camera);
    // Enkel de vlakken van het gebouw: een tik gaat door de leidingen, de punten en de meubels heen.
    const sleutel = zichtbareRaak(straal, [d.opgebouwd.wortel], d.snede).find((raak) => typeof raak.object.userData.sleutel === "string")
      ?.object.userData.sleutel as Sleutel | undefined;
    const geraakt = sleutel ? plekVanTik(sleutel) : null;
    if (!geraakt) {
      setTikfout(
        sleutel && VAST[sleutel]
          ? `Dat is ${VAST[sleutel]}: dat kan je hier niet aanpassen.`
          : "Tik een gevel, een binnenmuur, het dak, een raam of een vloer.",
      );
      return;
    }
    setTikfout(null);
    setBewaard(null);
    setGekozen(geraakt);
    licht(geraakt);
  });

  return {
    proef,
    plek,
    kiesPlek: (nieuw) => {
      setTikfout(null);
      setBewaard(null);
      setGekozen(nieuw);
    },
    naam,
    getoond,
    keuze,
    ruimtes,
    stalen,
    probeer,
    eigen,
    zetNaam: (nieuw) => zet((oud) => (oud ? { ...oud, naam: nieuw } : null)),
    terug: () => zet(() => null),
    bezig,
    bewaar,
    tikfout,
    bewaard,
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
              : getoond.bron === "proef" && staal.optieId === null && zelfdeMateriaal(staal.materiaal, getoond.materiaal)
          }
          kies={() => p.probeer(staal.naam, staal.materiaal, staal.optieId)}
        />
      ))}
    </>
  );
}

const kanBewaren = (p: Materiaalproef, metKeuzes: boolean) => metKeuzes && p.getoond.bron === "proef" && p.getoond.optieId === null;

/** De stalen onderaan het beeld, tijdens het aantikken: ook in het volledig scherm, zonder paneel. */
export function Staalstrook({ proef: p, metKeuzes, boven }: { proef: Materiaalproef; metKeuzes: boolean; boven: boolean }) {
  return (
    <div className={`drie-stalen${boven ? " boven-knoppen" : ""}`} role="group" aria-label={`Stalen voor ${p.naam.toLowerCase()}`}>
      <div className="drie-stalen-kop">
        <span>
          <strong>{p.naam}</strong>
          {p.tikfout ? null : <span className="hulp"> · {p.getoond.naam ?? "standaard"}</span>}
        </span>
        {kanBewaren(p, metKeuzes) ? (
          <button type="button" className="drie-knop klein" disabled={p.bezig || !(p.getoond.naam ?? "").trim()} onClick={() => void p.bewaar()}>
            Bewaren als optie
          </button>
        ) : null}
      </div>
      {p.tikfout ? <p className="drie-stalen-fout">{p.tikfout}</p> : null}
      {p.bewaard ? <p className="drie-stalen-goed">{p.bewaard}</p> : null}
      <div className="drie-stalen-rij">
        <Stalen proef={p} welke="opties" />
        {p.stalen.some((s) => s.optieId !== null) ? <span className="drie-stalen-scheiding" aria-hidden="true" /> : null}
        <Stalen proef={p} welke="stalen" />
      </div>
    </div>
  );
}

/** De kaart Materialen in het paneel: het onderdeel, de stalen, een eigen kleur, en bewaren. */
export function Materiaalkaart({
  proef: p,
  huisId,
  metKeuzes,
  aan,
  wissel,
  vloerruimtes,
}: {
  proef: Materiaalproef;
  huisId: number;
  metKeuzes: boolean;
  aan: boolean;
  wissel: () => void;
  vloerruimtes: readonly Vloerruimte[];
}) {
  const { plek, getoond, keuze } = p;
  const m = getoond.materiaal;
  const meerdere = new Set(vloerruimtes.map((r) => r.verdieping)).size > 1;
  const nieuweTitel = plek.slot === "vloer" ? p.naam : KEUZE_VAN_SLOT[plek.slot].titel;
  // Een vloer verandert mee in de andere ruimtes van haar keuze.
  const samenMet = p.ruimtes.filter((id) => id !== plek.ruimteId).flatMap((id) => vloerruimtes.find((r) => r.id === id)?.naam ?? []);
  const standaard = keuze?.opties.find((o) => o.id === keuze.standaard)?.naam ?? "de standaard";

  return (
    <section className="kaart">
      <h3>Materialen</h3>
      <div className="plekken" role="group" aria-label="Onderdeel">
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            className={plek.slot === slot ? "" : "stil"}
            aria-pressed={plek.slot === slot}
            onClick={() => p.kiesPlek(slot === "vloer" ? { slot, ruimteId: plek.ruimteId } : { slot })}
          >
            {SLOTNAMEN[slot]}
          </button>
        ))}
      </div>
      {plek.slot === "vloer" ? (
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
      <p className="hulp">
        {!metKeuzes
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
        {getoond.bron === "proef" ? (
          <button type="button" className="stil" onClick={p.terug}>
            Terug naar {standaard}
          </button>
        ) : null}
      </div>
      {metKeuzes && keuze ? (
        <p className="hulp" style={{ marginTop: 8 }}>
          <a href={huispad(huisId, `/keuzes/${keuze.keuzeId}`)}>Naar de keuze {keuze.titel}</a>
        </p>
      ) : null}
    </section>
  );
}
