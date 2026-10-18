"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  KIJKHOEK,
  beeldInVak,
  cameraKijkhoek,
  camerarichting,
  gebouwVanOog,
  naarWereld,
  standpuntVan,
  titelVanBestand,
  uitWereld,
  verdiepingVanOog,
  verplaatsOog,
  type Beeld,
  type Gebouwligging,
  type Xyz,
} from "@/lib/bouw/drie/beelden";
import type { Model3d } from "@/lib/bouw/drie/model";
import type { Plaatsing } from "@/lib/bouw/drie/plaatsing";
import { oppervlakte, zwaartepunt } from "@/lib/bouw/omzetting/geometrie";
import { verkleinFoto } from "@/lib/bouw/verklein";
import { zetOp } from "@/lib/bouw/zet-op";

import { bewaarBeeldActie, bewaarStandpuntActie, verwijderBeeldActie, vraagBeeldAan, wijzigBeeldActie } from "./acties";

/**
 * Beelden van het huis, zoals de renders van de keukenbouwer of de
 * schrijnwerker, over het 3D-model gelegd vanuit hun standpunt. Kies een
 * beeld: de camera gaat naar het bewaarde standpunt (of naar de ruimte die
 * het toont), en het beeld ligt over het model, met een schuif tussen 3D en
 * beeld. Zoek het standpunt met de muis en de toetsen tot beeld en huis
 * samenvallen, en bewaar het. De regels staan in lib/bouw/drie/beelden.ts.
 * Enkel voor de browser.
 */

/** Hoe de camera staat terwijl je vanuit een beeld kijkt, in de wereld van three.js. */
export interface Beeldcamera {
  oog: THREE.Vector3;
  kijk: number;
  op: number;
  kijkhoek: number;
  /** Breedte op hoogte van het beeld. */
  verhouding: number;
  toetsen: Set<string>;
  /** Het gebouw waar het oog in staat, en waar dat stond: verschuift het, dan gaat het oog mee. */
  anker: { gebouwId: number; plaatsing: Plaatsing } | null;
}

interface Beeldkern {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  elkBeeld: Set<(dt: number) => void>;
  beeld: Beeldcamera | null;
  wandel: { stand: unknown };
}

/** De kijkhoek van het 3D-scherm buiten een beeld. */
const GEWONE_KIJKHOEK = 45;
/** Een render is meestal liggend A4, tot het beeld geladen is. */
const STANDAARDVERHOUDING = Math.SQRT2;
/** De toetsen die je in een beeld gebruikt. */
const TOETSEN = ["w", "a", "s", "d", "q", "e", "pageup", "pagedown", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"];

type Melding = { soort: "goed" | "fout"; tekst: string } | null;

export function useBeelden(
  kern: RefObject<Beeldkern | null>,
  opties: {
    huisId: number;
    /** Een beeld dat meteen open moet, zoals vanuit Ruimtes. */
    begin: number | null;
    bewaard: readonly Beeld[];
    model: Model3d;
    plaatsingen: ReadonlyMap<number, Plaatsing>;
    meld: (melding: Melding) => void;
    /** Vóór een beeld opent: terug naar rondkijken, zonder gereedschap. */
    voorOpen: () => void;
  },
) {
  const { huisId, bewaard, meld } = opties;
  const [gekozenId, setGekozenId] = useState<number | null>(null);
  const [doorzicht, setDoorzicht] = useState(60);
  const [kijkhoek, setKijkhoek] = useState<number>(KIJKHOEK.standaard);
  const [verhouding, setVerhouding] = useState(STANDAARDVERHOUDING);
  const [bezig, setBezig] = useState<string | null>(null);
  const modelRef = useRef(opties.model);
  modelRef.current = opties.model;
  const plaatsingenRef = useRef(opties.plaatsingen);
  plaatsingenRef.current = opties.plaatsingen;
  const voorOpenRef = useRef(opties.voorOpen);
  voorOpenRef.current = opties.voorOpen;
  // De camera van het open beeld, los van three.js: het effect hieronder hangt ze aan de kern, ook als die opnieuw
  // gebouwd wordt (React bouwt in dev-modus alles twee keer).
  const camera = useRef<Beeldcamera | null>(null);
  const gekozen = bewaard.find((beeld) => beeld.id === gekozenId) ?? null;

  const ligging = (gebouwId: number): (Gebouwligging & { id: number }) | null => {
    const gebouw = modelRef.current.gebouwen.find((g) => g.id === gebouwId);
    return gebouw ? { id: gebouw.id, kader: gebouw.kader, plaatsing: plaatsingenRef.current.get(gebouw.id) ?? { x: 0, y: 0, hoek: 0 } } : null;
  };

  /** Waar de camera begint: het bewaarde standpunt, anders in een hoek van de ruimte die het beeld toont (of de grootste van het gelijkvloers). */
  function beginstand(beeld: Beeld): { oog: Xyz; kijk: number; op: number } | null {
    const model = modelRef.current;
    if (beeld.standpunt && beeld.verdiepingId !== null) {
      const verdieping = model.verdiepingen.find((v) => v.id === beeld.verdiepingId);
      const gebouw = verdieping ? ligging(verdieping.gebouwId) : null;
      if (gebouw) {
        const oog = naarWereld(beeld.standpunt.oog, gebouw);
        return { oog, ...camerarichting(oog, naarWereld(beeld.standpunt.doel, gebouw)) };
      }
    }
    let keuze = model.verdiepingen.flatMap((v) => v.vloeren.filter((vloer) => vloer.ruimteId === beeld.ruimteId).map((vloer) => ({ v, vloer })))[0];
    if (!keuze) {
      const gelijkvloers = [...model.verdiepingen].filter((v) => v.z0 >= -0.5).sort((a, b) => a.z0 - b.z0)[0] ?? model.verdiepingen[0];
      const grootste = gelijkvloers
        ? [...gelijkvloers.vloeren].sort((a, b) => Math.abs(oppervlakte(b.ringen[0])) - Math.abs(oppervlakte(a.ringen[0])))[0]
        : undefined;
      if (gelijkvloers && grootste) keuze = { v: gelijkvloers, vloer: grootste };
    }
    const gebouw = keuze ? ligging(keuze.v.gebouwId) : null;
    if (!keuze || !gebouw) return null;
    // In de verste hoek, een beetje naar binnen, met de blik over de ruimte: zo staat een render vaak.
    const ring = keuze.vloer.ringen[0];
    const [mx, my] = zwaartepunt(ring);
    const hoek = ring.reduce((verste, p) => (Math.hypot(p[0] - mx, p[1] - my) > Math.hypot(verste[0] - mx, verste[1] - my) ? p : verste), ring[0]);
    const oog = naarWereld([hoek[0] + (mx - hoek[0]) * 0.2, hoek[1] + (my - hoek[1]) * 0.2, keuze.v.z0 + 1.5], gebouw);
    return { oog, ...camerarichting(oog, naarWereld([mx, my, keuze.v.z0 + 1.3], gebouw)) };
  }

  function open(id: number) {
    const beeld = bewaard.find((b) => b.id === id);
    const d = kern.current;
    if (!beeld || !d) return;
    voorOpenRef.current();
    const stand = beginstand(beeld);
    const richting = d.camera.getWorldDirection(new THREE.Vector3());
    const nu = { oog: d.camera.position.toArray() as Xyz, ...camerarichting([0, 0, 0], richting.toArray() as Xyz) };
    const { oog, kijk, op } = stand ?? nu;
    const hoek = beeld.standpunt?.kijkhoek ?? KIJKHOEK.standaard;
    const gebouw = gebouwVanOog(modelRef.current.gebouwen.flatMap((g) => ligging(g.id) ?? []), oog);
    const anker = gebouw ? { gebouwId: gebouw.id, plaatsing: gebouw.plaatsing } : null;
    camera.current = { oog: new THREE.Vector3(...oog), kijk, op, kijkhoek: hoek, verhouding, toetsen: new Set(), anker };
    setKijkhoek(hoek);
    setGekozenId(id);
  }

  function sluit() {
    const d = kern.current;
    const b = camera.current;
    camera.current = null;
    if (d?.beeld) {
      // Rondkijken gaat verder van hier: met het doel 3 m voor het oog.
      const { oog, kijk, op } = b ?? d.beeld;
      const r = new THREE.Vector3(-Math.sin(kijk) * Math.cos(op), Math.sin(op), -Math.cos(kijk) * Math.cos(op));
      d.controls.target.copy(oog).addScaledVector(r, 3);
      d.camera.fov = GEWONE_KIJKHOEK;
      d.camera.updateProjectionMatrix();
      d.beeld = null;
      if (!d.wandel.stand) d.controls.enabled = true;
    }
    setGekozenId(null);
  }

  function zetKijkhoek(waarde: number) {
    const hoek = Math.max(KIJKHOEK.min, Math.min(KIJKHOEK.max, Math.round(waarde)));
    setKijkhoek(hoek);
    if (camera.current) camera.current.kijkhoek = hoek;
  }

  function zetVerhouding(waarde: number) {
    if (!Number.isFinite(waarde) || waarde <= 0) return;
    setVerhouding(waarde);
    if (camera.current) camera.current.verhouding = waarde;
  }

  async function bewaarStandpunt() {
    const b = camera.current;
    if (!b || !gekozen) return;
    const oog = b.oog.toArray() as Xyz;
    const gebouw = gebouwVanOog(
      modelRef.current.gebouwen.flatMap((g) => ligging(g.id) ?? []),
      oog,
    );
    const lokaal = gebouw ? uitWereld(oog, gebouw) : null;
    const verdieping =
      gebouw && lokaal ? verdiepingVanOog(modelRef.current.verdiepingen.filter((v) => v.gebouwId === gebouw.id), lokaal[2]) : null;
    if (!gebouw || !verdieping) {
      meld({ soort: "fout", tekst: "Er is geen gebouw om het standpunt aan te hangen." });
      return;
    }
    setBezig("Standpunt bewaren…");
    const uit = await bewaarStandpuntActie(huisId, { id: gekozen.id, verdiepingId: verdieping.id, standpunt: standpuntVan(oog, b.kijk, b.op, b.kijkhoek, gebouw) });
    setBezig(null);
    meld(uit.ok ? { soort: "goed", tekst: `Het standpunt van ${gekozen.titel} is bewaard.` } : { soort: "fout", tekst: uit.melding });
  }

  async function wisStandpunt() {
    if (!gekozen) return;
    const uit = await bewaarStandpuntActie(huisId, { id: gekozen.id, verdiepingId: null, standpunt: null });
    if (!uit.ok) meld({ soort: "fout", tekst: uit.melding });
  }

  async function voegToe(bestanden: readonly File[]) {
    let gelukt = 0;
    meld(null);
    for (const [i, bestand] of bestanden.entries()) {
      setBezig(`Beeld ${i + 1} van ${bestanden.length} opladen…`);
      try {
        const foto = await verkleinFoto(bestand);
        const start = await vraagBeeldAan(huisId, { naam: bestand.name, grootte: foto.size });
        if (!start.ok) throw new Error(start.melding);
        await zetOp(start.data.uploadUrl, foto, start.data.contentType);
        const uit = await bewaarBeeldActie(huisId, { bestandId: start.data.bestandId, titel: titelVanBestand(bestand.name), ruimteId: null });
        if (!uit.ok) throw new Error(uit.melding);
        gelukt++;
      } catch (fout) {
        meld({ soort: "fout", tekst: `${bestand.name}: ${fout instanceof Error ? fout.message : "opladen mislukt"}` });
        break;
      }
    }
    setBezig(null);
    if (gelukt > 0) meld({ soort: "goed", tekst: gelukt === 1 ? "Het beeld staat erbij. Tik het aan om het over het huis te leggen." : `${gelukt} beelden staan erbij. Tik er een aan om het over het huis te leggen.` });
  }

  async function wijzig(id: number, titel: string, ruimteId: number | null) {
    const uit = await wijzigBeeldActie(huisId, { id, titel, ruimteId });
    if (!uit.ok) meld({ soort: "fout", tekst: uit.melding });
    return uit.ok;
  }

  async function verwijder(id: number) {
    const beeld = bewaard.find((b) => b.id === id);
    if (!beeld || !window.confirm(`${beeld.titel} weghalen? De foto gaat mee.`)) return;
    if (id === gekozenId) sluit();
    const uit = await verwijderBeeldActie(huisId, { id });
    meld(uit.ok ? null : { soort: "fout", tekst: uit.melding });
  }

  /** Esc: een open beeld sluiten. */
  const breekAf = (): boolean => {
    if (gekozenId === null) return false;
    sluit();
    return true;
  };

  // De effecten hieronder roepen de laatste versie op.
  const sluitRef = useRef(sluit);
  sluitRef.current = sluit;
  const zetKijkhoekRef = useRef(zetKijkhoek);
  zetKijkhoekRef.current = zetKijkhoek;

  // Vanuit Ruimtes: het beeld meteen open, één keer.
  const openRef = useRef(open);
  openRef.current = open;
  const begonnen = useRef(false);
  useEffect(() => {
    if (opties.begin === null || begonnen.current || !kern.current) return;
    begonnen.current = true;
    openRef.current(opties.begin);
  }, [kern, opties.begin]);

  // Verschuift het gebouw, zoals wanneer het zijn plaats op het inplantingsplan vindt, dan gaat het oog mee.
  useEffect(() => {
    const b = camera.current;
    const anker = b?.anker;
    const gebouw = anker ? modelRef.current.gebouwen.find((g) => g.id === anker.gebouwId) : undefined;
    const nieuw = anker ? opties.plaatsingen.get(anker.gebouwId) : undefined;
    if (!b || !anker || !gebouw || !nieuw) return;
    if (nieuw.x === anker.plaatsing.x && nieuw.y === anker.plaatsing.y && nieuw.hoek === anker.plaatsing.hoek) return;
    const stand = verplaatsOog(b.oog.toArray() as Xyz, b.kijk, b.op, { kader: gebouw.kader, plaatsing: anker.plaatsing }, { kader: gebouw.kader, plaatsing: nieuw });
    b.oog.set(...stand.oog);
    b.kijk = stand.kijk;
    b.op = stand.op;
    b.anker = { gebouwId: anker.gebouwId, plaatsing: nieuw };
  }, [opties.plaatsingen]);

  // Een beeld dat weg is (elders weggehaald): dicht.
  const bestaat = gekozenId === null || bewaard.some((b) => b.id === gekozenId);
  useEffect(() => {
    if (!bestaat) sluitRef.current();
  }, [bestaat]);

  // De camera in een beeld: elk beeld het oog en de blik, de toetsen en de muis. Rondkijken staat zolang stil.
  useEffect(() => {
    const d = kern.current;
    if (!d || gekozenId === null || !camera.current) return;
    d.beeld = camera.current;
    d.controls.enabled = false;
    const element = d.renderer.domElement;
    const elk = (dt: number) => {
      const b = d.beeld;
      if (!b) return;
      const t = b.toetsen;
      const snel = t.has("shift") ? 2 : 0.6;
      let vooruit = 0;
      let opzij = 0;
      let hoger = 0;
      if (t.has("w")) vooruit += 1;
      if (t.has("s")) vooruit -= 1;
      if (t.has("d")) opzij += 1;
      if (t.has("a")) opzij -= 1;
      if (t.has("e") || t.has("pageup")) hoger += 1;
      if (t.has("q") || t.has("pagedown")) hoger -= 1;
      const draai = t.has("shift") ? 0.8 : 0.3;
      if (t.has("arrowleft")) b.kijk += draai * dt;
      if (t.has("arrowright")) b.kijk -= draai * dt;
      if (t.has("arrowup")) b.op = Math.min(1.2, b.op + draai * dt);
      if (t.has("arrowdown")) b.op = Math.max(-1.2, b.op - draai * dt);
      if (vooruit || opzij || hoger) {
        b.oog.x += (-Math.sin(b.kijk) * vooruit + Math.cos(b.kijk) * opzij) * snel * dt;
        b.oog.z += (-Math.cos(b.kijk) * vooruit - Math.sin(b.kijk) * opzij) * snel * dt;
        b.oog.y += hoger * snel * dt;
      }
      d.camera.position.copy(b.oog);
      d.camera.rotation.set(b.op, b.kijk, 0, "YXZ");
      const fov = cameraKijkhoek(b.kijkhoek, b.verhouding, { breedte: element.clientWidth, hoogte: element.clientHeight });
      if (Math.abs(d.camera.fov - fov) > 1e-3) {
        d.camera.fov = fov;
        d.camera.updateProjectionMatrix();
      }
    };
    d.elkBeeld.add(elk);

    const inVeld = (e: Event) => ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement | null)?.tagName ?? "");
    const neer = (e: KeyboardEvent) => {
      if (inVeld(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const toets = e.key.toLowerCase();
      if (toets === "+" || toets === "=") zetKijkhoekRef.current((d.beeld?.kijkhoek ?? KIJKHOEK.standaard) - 2);
      else if (toets === "-" || toets === "_") zetKijkhoekRef.current((d.beeld?.kijkhoek ?? KIJKHOEK.standaard) + 2);
      else if (TOETSEN.includes(toets)) d.beeld?.toetsen.add(toets);
      else return;
      e.preventDefault();
    };
    const los = (e: KeyboardEvent) => d.beeld?.toetsen.delete(e.key.toLowerCase());
    let vorige: { x: number; y: number; id: number } | null = null;
    const druk = (e: PointerEvent) => {
      if (vorige) return;
      vorige = { x: e.clientX, y: e.clientY, id: e.pointerId };
      element.setPointerCapture(e.pointerId);
    };
    const sleep = (e: PointerEvent) => {
      const b = d.beeld;
      if (!vorige || !b || e.pointerId !== vorige.id) return;
      // Fijn genoeg om een beeld precies te leggen: een pixel is een twintigste graad.
      b.kijk += (e.clientX - vorige.x) * 0.0009;
      b.op = Math.max(-1.2, Math.min(1.2, b.op + (e.clientY - vorige.y) * 0.0009));
      vorige = { ...vorige, x: e.clientX, y: e.clientY };
    };
    const klaar = (e: PointerEvent) => {
      if (vorige?.id === e.pointerId) vorige = null;
    };
    const wiel = (e: WheelEvent) => {
      e.preventDefault();
      zetKijkhoekRef.current((d.beeld?.kijkhoek ?? KIJKHOEK.standaard) + Math.sign(e.deltaY));
    };
    window.addEventListener("keydown", neer);
    window.addEventListener("keyup", los);
    element.addEventListener("pointerdown", druk);
    element.addEventListener("pointermove", sleep);
    element.addEventListener("pointerup", klaar);
    element.addEventListener("pointercancel", klaar);
    element.addEventListener("wheel", wiel, { passive: false });
    return () => {
      d.elkBeeld.delete(elk);
      window.removeEventListener("keydown", neer);
      window.removeEventListener("keyup", los);
      element.removeEventListener("pointerdown", druk);
      element.removeEventListener("pointermove", sleep);
      element.removeEventListener("pointerup", klaar);
      element.removeEventListener("pointercancel", klaar);
      element.removeEventListener("wheel", wiel);
      d.beeld?.toetsen.clear();
    };
  }, [kern, gekozenId]);

  return {
    lijst: bewaard,
    gekozen,
    doorzicht,
    setDoorzicht,
    kijkhoek,
    zetKijkhoek,
    verhouding,
    zetVerhouding,
    bezig,
    open,
    sluit,
    bewaarStandpunt,
    wisStandpunt,
    voegToe,
    wijzig,
    verwijder,
    breekAf,
  };
}

export type Beeldenstaat = ReturnType<typeof useBeelden>;

/** Het beeld over het 3D-beeld, zo groot mogelijk en in het midden, zoals de camera het ziet. */
export function Beeldlaag({ beelden }: { beelden: Beeldenstaat }) {
  const laag = useRef<HTMLDivElement>(null);
  const [vak, setVak] = useState({ breedte: 0, hoogte: 0 });
  const open = beelden.gekozen !== null;
  useEffect(() => {
    const element = laag.current;
    if (!element) return;
    const maat = () => setVak({ breedte: element.clientWidth, hoogte: element.clientHeight });
    maat();
    const waarnemer = new ResizeObserver(maat);
    waarnemer.observe(element);
    return () => waarnemer.disconnect();
  }, [open]);
  if (!beelden.gekozen?.url) return null;
  const r = beeldInVak(beelden.verhouding, vak);
  return (
    <div ref={laag} className="beeldlaag" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- een foto uit Storage, over het beeld van three.js */}
      <img
        src={beelden.gekozen.url}
        alt=""
        draggable={false}
        // Zoals elders op deze pagina: zo deelt de browser één antwoord, ook voor een materiaal uit dit beeld.
        crossOrigin="anonymous"
        style={{ left: r.x, top: r.y, width: r.breedte, height: r.hoogte, opacity: beelden.doorzicht / 100 }}
        onLoad={(g) => beelden.zetVerhouding(g.currentTarget.naturalWidth / Math.max(1, g.currentTarget.naturalHeight))}
      />
    </div>
  );
}

/** Onderaan het beeld, terwijl een beeld open is: tussen 3D en beeld, de kijkhoek, en het standpunt bewaren. */
export function Beeldbalk({ beelden }: { beelden: Beeldenstaat }) {
  const beeld = beelden.gekozen;
  if (!beeld) return null;
  return (
    <div className="beeldbalk" role="group" aria-label={`Vanuit ${beeld.titel}`}>
      <strong className="beeldbalk-titel">{beeld.titel}</strong>
      <label className="beeldschuif">
        <span>3D</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={beelden.doorzicht}
          aria-label="Hoeveel van het beeld"
          onChange={(g) => beelden.setDoorzicht(Number(g.currentTarget.value))}
        />
        <span>Beeld</span>
      </label>
      <label className="beeldschuif">
        <span>Kijkhoek</span>
        <input
          type="range"
          min={KIJKHOEK.min}
          max={KIJKHOEK.max}
          step={1}
          value={beelden.kijkhoek}
          aria-label="Kijkhoek in graden"
          onChange={(g) => beelden.zetKijkhoek(Number(g.currentTarget.value))}
        />
        <span>{beelden.kijkhoek}°</span>
      </label>
      <div className="knoppenrij">
        <button type="button" disabled={beelden.bezig !== null} onClick={() => void beelden.bewaarStandpunt()}>
          Standpunt bewaren
        </button>
        <button type="button" className="stil" onClick={beelden.sluit}>
          Sluiten
        </button>
      </div>
    </div>
  );
}

/** De beelden in het paneel: toevoegen, aantikken, een titel en een ruimte, weghalen. */
export function Beeldenkaart({ beelden, ruimtes }: { beelden: Beeldenstaat; ruimtes: readonly { id: number; naam: string; verdieping: string }[] }) {
  const { lijst, gekozen } = beelden;
  return (
    <section className="kaart">
      <h3>Beelden{lijst.length > 0 ? ` (${lijst.length})` : ""}</h3>
      <p className="hulp">
        Renders van de keuken of de schrijnwerker: tik een beeld aan en het ligt over het huis, vanuit zijn standpunt. Zo zie je wat er
        anders is.
      </p>
      {lijst.length > 0 ? (
        <div className="beeldenlijst">
          {lijst.map((beeld) => (
            <button
              key={beeld.id}
              type="button"
              className="beeldknop"
              aria-pressed={beeld.id === gekozen?.id}
              onClick={() => (beeld.id === gekozen?.id ? beelden.sluit() : beelden.open(beeld.id))}
            >
              {beeld.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- een foto uit Storage
                <img src={beeld.url} alt="" loading="lazy" crossOrigin="anonymous" />
              ) : (
                <span className="beeldknop-leeg" aria-hidden="true" />
              )}
              <span className="beeldknop-titel">{beeld.titel}</span>
              {beeld.standpunt ? null : <span className="beeldknop-hulp">nog geen standpunt</span>}
            </button>
          ))}
        </div>
      ) : null}
      <div className="knoppenrij">
        <label className={`knop stil${beelden.bezig ? " uit" : ""}`}>
          Beelden toevoegen
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={beelden.bezig !== null}
            onChange={(g) => {
              const bestanden = [...(g.currentTarget.files ?? [])];
              g.currentTarget.value = "";
              if (bestanden.length > 0) void beelden.voegToe(bestanden);
            }}
          />
        </label>
      </div>
      {beelden.bezig ? <p className="hulp">{beelden.bezig}</p> : null}
      {gekozen ? <Beeldvelden key={gekozen.id} beelden={beelden} beeld={gekozen} ruimtes={ruimtes} /> : null}
    </section>
  );
}

function Beeldvelden({ beelden, beeld, ruimtes }: { beelden: Beeldenstaat; beeld: Beeld; ruimtes: readonly { id: number; naam: string; verdieping: string }[] }) {
  const [titel, setTitel] = useState(beeld.titel);
  const [ruimte, setRuimte] = useState<number | null>(beeld.ruimteId);
  const veranderd = titel.trim() !== beeld.titel || ruimte !== beeld.ruimteId;
  return (
    <div className="beeldvelden">
      <label htmlFor="beeld-titel">Titel</label>
      <input id="beeld-titel" maxLength={80} value={titel} onChange={(g) => setTitel(g.currentTarget.value)} />
      <label htmlFor="beeld-ruimte">Toont</label>
      <select id="beeld-ruimte" value={ruimte ?? ""} onChange={(g) => setRuimte(g.currentTarget.value ? Number(g.currentTarget.value) : null)}>
        <option value="">Geen ruimte</option>
        {ruimtes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.naam} · {r.verdieping}
          </option>
        ))}
      </select>
      <p className="hulp">
        {beeld.standpunt
          ? "Het standpunt is bewaard. Verschuif je de camera, bewaar het dan opnieuw."
          : "Zoek het standpunt: slepen kijkt rond, W A S D schuift, Q en E zakken en stijgen, het muiswiel of de schuif verandert de kijkhoek. Vallen beeld en huis samen, bewaar dan het standpunt."}
      </p>
      <div className="knoppenrij">
        <button type="button" disabled={!veranderd || !titel.trim()} onClick={() => void beelden.wijzig(beeld.id, titel, ruimte)}>
          Bewaren
        </button>
        {beeld.standpunt ? (
          <button type="button" className="stil" onClick={() => void beelden.wisStandpunt()}>
            Standpunt wissen
          </button>
        ) : null}
        <button type="button" className="stil" onClick={() => void beelden.verwijder(beeld.id)}>
          Weg
        </button>
      </div>
    </div>
  );
}
