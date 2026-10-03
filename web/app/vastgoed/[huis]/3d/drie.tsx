"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { DAKNAMEN, DAKTYPES, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import type { Driegegevens } from "@/lib/bouw/drie/laden";
import { SLOTNAMEN, STANDAARDKLEUREN, materiaalVan, type Slot } from "@/lib/bouw/drie/materialen";
import { maakModel, type Model3d } from "@/lib/bouw/drie/model";
import { STAND_AFSTAND, type Trap3d } from "@/lib/bouw/drie/trappen";
import { kaderOpTerrein, middenVan, naarTerrein, standaardPlaatsingen, type Kader2d, type Plaatsing } from "@/lib/bouw/drie/plaatsing";
import { ooghoogte, wandel, type Wandelstand, type Wandelverdieping } from "@/lib/bouw/drie/wandelen";
import { zwaartepunt, oppervlakte } from "@/lib/bouw/omzetting/geometrie";
import { huispad } from "@/lib/bouw/paden";
import type { Trapstand } from "@/lib/bouw/types";

import { bewaarDakActie, bewaarTrappenActie } from "./acties";
import { bouwScene, type Opgebouwd, type Sleutel } from "./scene";

type Modus = "rond" | "wandel";

/** Hoe dicht en hoe ver de camera bij het middelpunt mag komen, in meter. */
const MIN_AFSTAND = 1.5;
const MAX_AFSTAND = 400;
/** Of het paneel open staat, per browser. */
const PANEELSLEUTEL = "jandra.drie.paneel";

function leesPaneel(): boolean {
  try {
    return window.localStorage.getItem(PANEELSLEUTEL) !== "dicht";
  } catch {
    return true;
  }
}

function bewaarPaneel(open: boolean) {
  try {
    window.localStorage.setItem(PANEELSLEUTEL, open ? "open" : "dicht");
  } catch {
    // Geen opslag (privévenster): dan vergeet de browser het gewoon.
  }
}

/** Welk slot een sleutel van de scène volgt; de rest heeft een vaste kleur. */
function slotVan(sleutel: Sleutel): { slot: Slot; ruimteId?: number } | null {
  if (sleutel === "gevel") return { slot: "gevel" };
  if (sleutel === "binnenmuur") return { slot: "binnenmuur" };
  if (sleutel === "dak" || sleutel === "dakplat") return { slot: "dak" };
  if (sleutel === "schrijnwerk") return { slot: "schrijnwerk" };
  if (sleutel.startsWith("vloer:")) return { slot: "vloer", ruimteId: Number(sleutel.slice(6)) };
  return null;
}

/** Zet kleur of textuur van een materiaal, met wat er nu uitgeprobeerd wordt. */
function werkMateriaalBij(
  sleutel: Sleutel,
  m: THREE.MeshStandardMaterial,
  materialen: Driegegevens["materialen"],
  proef: ReadonlyMap<number, number>,
  texturen: Map<string, THREE.Texture>,
) {
  const welk = slotVan(sleutel);
  if (!welk) return;
  const { kleur, foto } = materiaalVan(welk.slot, materialen, proef, welk.ruimteId);
  if (foto) {
    let textuur = texturen.get(foto);
    if (!textuur) {
      textuur = new THREE.TextureLoader().setCrossOrigin("anonymous").load(foto);
      textuur.wrapS = THREE.RepeatWrapping;
      textuur.wrapT = THREE.RepeatWrapping;
      textuur.colorSpace = THREE.SRGBColorSpace;
      texturen.set(foto, textuur);
    }
    m.map = textuur;
    m.color.set("#ffffff");
  } else {
    m.map = null;
    m.color.set(kleur);
  }
  m.needsUpdate = true;
}

/** De kijkrichting bij het openen: schuin van boven, van rechtsvoor. */
const KIJKRICHTING = new THREE.Vector3(0.9, 0.85, 1.15).normalize();

/**
 * De camera schuin boven alle gebouwen, zoals bij het openen en met de knop
 * Passend. De afstand hangt af van het beeld: op een smalle gsm staat de
 * camera verder, zodat het huis ook in de breedte past.
 */
function kadreer(d: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, kader: Kader2d & { z1: number }) {
  const { x0, y0, x1, y1, z1 } = kader;
  const midden = new THREE.Vector3((x0 + x1) / 2, z1 / 2, (y0 + y1) / 2);
  const straal = Math.max(2, Math.hypot(x1 - x0, y1 - y0, z1) / 2);
  const verticaal = THREE.MathUtils.degToRad(d.camera.fov) / 2;
  const horizontaal = Math.atan(Math.tan(verticaal) * d.camera.aspect);
  const afstand = Math.min(MAX_AFSTAND, (straal / Math.sin(Math.min(verticaal, horizontaal))) * 1.05);
  d.camera.position.copy(midden).addScaledVector(KIJKRICHTING, afstand);
  d.controls.target.copy(midden);
  d.controls.update();
}

/** Naar het middelpunt toe (factor kleiner dan 1) of ervan weg, binnen de grenzen. */
function zoomCamera(d: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, factor: number) {
  const richting = d.camera.position.clone().sub(d.controls.target);
  richting.setLength(Math.min(MAX_AFSTAND, Math.max(MIN_AFSTAND, richting.length() * factor)));
  d.camera.position.copy(d.controls.target).add(richting);
  d.controls.update();
}

const VASTE_KLEUREN: Record<string, string> = {
  muurtop: STANDAARDKLEUREN.muurtop,
  plaat: STANDAARDKLEUREN.plaat,
  plafond: STANDAARDKLEUREN.plafond,
  dakrand: STANDAARDKLEUREN.dakrand,
  glas: STANDAARDKLEUREN.glas,
  trap: STANDAARDKLEUREN.trap,
};

export default function Drie({ huisId, gegevens }: { huisId: number; gegevens: Driegegevens }) {
  const vak = useRef<HTMLDivElement>(null);
  const [daken, setDaken] = useState<Map<number, Dakinstelling>>(() => new Map(gegevens.gebouwen.map((g) => [g.id, g.dak])));
  const [proef, setProef] = useState<Map<number, number>>(new Map());
  const [verborgen, setVerborgen] = useState<Set<number>>(new Set());
  const [dakenTonen, setDakenTonen] = useState(true);
  const [puntenTonen, setPuntenTonen] = useState(true);
  const [doorsnede, setDoorsnede] = useState<number | null>(null);
  const [modus, setModus] = useState<Modus>("rond");
  const [wandelOp, setWandelOp] = useState<number | null>(null);
  const [melding, setMelding] = useState<{ soort: "goed" | "fout"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [paneel, setPaneel] = useState(leesPaneel);
  const [volledig, setVolledig] = useState(false);
  // De keuzes voor de trappen, per verdieping: wat bewaard is, en wat nu uitgeprobeerd wordt.
  const [bewaardeStanden, setBewaardeStanden] = useState<Map<number, Trapstand[]>>(
    () => new Map(gegevens.verdiepingen.map((v) => [v.id, v.trapstanden ?? []])),
  );
  const [standen, setStanden] = useState<Map<number, Trapstand[]>>(bewaardeStanden);

  const model: Model3d = useMemo(
    () =>
      maakModel(
        gegevens.gebouwen.map((g) => ({ id: g.id, dak: daken.get(g.id) ?? g.dak })),
        gegevens.verdiepingen.map((v) => ({ ...v, trapstanden: standen.get(v.id) ?? [] })),
      ),
    [gegevens, daken, standen],
  );
  // Waar elk gebouw op het terrein staat; voorlopig naast elkaar.
  const plaatsingen = useMemo(() => standaardPlaatsingen(model.gebouwen), [model]);
  const terrein = useMemo(() => kaderOpTerrein(model.gebouwen, plaatsingen), [model, plaatsingen]);
  // Wat wandelen nodig heeft: per verdieping de muren, de gaten in de vloer en de trappen naar boven.
  const wereld: Wandelverdieping[] = useMemo(
    () =>
      model.verdiepingen.map((v) => ({
        id: v.id,
        gebouwId: v.gebouwId,
        z0: v.z0,
        muren: v.muren.map((m) => m.veelhoek),
        gaten: v.plaat.veelhoeken.flatMap((veelhoek) => veelhoek.slice(1).map((ring) => [ring])),
        trappen: v.trappen,
      })),
    [model],
  );

  // Alles wat three.js nodig heeft, buiten React om.
  const drie = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    zon: THREE.DirectionalLight;
    grond: THREE.Mesh;
    snede: THREE.Plane;
    materialen: Map<Sleutel, THREE.MeshStandardMaterial>;
    texturen: Map<string, THREE.Texture>;
    opgebouwd: Opgebouwd | null;
    punten: THREE.Mesh[];
    ingekaderd: boolean;
    /** Rondwandelen: waar je bent (in het gebouw), waar je naar kijkt (op het terrein), en welke toetsen ingedrukt zijn. */
    wandel: { stand: Wandelstand | null; kijk: number; op: number; toetsen: Set<string> };
  } | null>(null);
  // De lus van three.js en het bouwen lezen de laatste stand uit refs, niet uit een oude render.
  const proefRef = useRef(proef);
  proefRef.current = proef;
  const modelRef = useRef(model);
  modelRef.current = model;
  const wereldRef = useRef(wereld);
  wereldRef.current = wereld;
  const plaatsingenRef = useRef(plaatsingen);
  plaatsingenRef.current = plaatsingen;

  /** Het materiaal van een sleutel: één object per sleutel, zodat het overal tegelijk verandert. */
  const materiaal = useCallback(
    (sleutel: Sleutel): THREE.MeshStandardMaterial => {
      const d = drie.current!;
      let m = d.materialen.get(sleutel);
      if (!m) {
        m =
          sleutel === "glas"
            ? new THREE.MeshStandardMaterial({ color: VASTE_KLEUREN.glas, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false })
            : new THREE.MeshStandardMaterial({ color: VASTE_KLEUREN[sleutel] ?? "#cccccc", roughness: 0.9, metalness: 0 });
        m.side = THREE.DoubleSide;
        m.clippingPlanes = [d.snede];
        m.clipShadows = true;
        d.materialen.set(sleutel, m);
        werkMateriaalBij(sleutel, m, gegevens.materialen, proefRef.current, d.texturen);
      }
      return m;
    },
    [gegevens.materialen],
  );

  // Eén keer: de renderer, de camera, het licht, de grond.
  useEffect(() => {
    const element = vak.current;
    if (!element) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#cfe3f2");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = MIN_AFSTAND;
    controls.maxDistance = MAX_AFSTAND;

    // Binnen moet het ook licht zijn: een plafond krijgt geen zon.
    scene.add(new THREE.HemisphereLight("#ffffff", "#d9d3c7", 1.5));
    scene.add(new THREE.AmbientLight("#ffffff", 0.45));
    const zon = new THREE.DirectionalLight("#fff4e0", 2.6);
    zon.castShadow = true;
    zon.shadow.mapSize.set(2048, 2048);
    zon.shadow.normalBias = 0.03;
    scene.add(zon, zon.target);

    const grond = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: STANDAARDKLEUREN.grond, roughness: 1 }));
    grond.rotation.x = -Math.PI / 2;
    grond.receiveShadow = true;
    scene.add(grond);

    drie.current = {
      renderer,
      scene,
      camera,
      controls,
      zon,
      grond,
      snede: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000),
      materialen: new Map(),
      texturen: new Map(),
      opgebouwd: null,
      punten: [],
      ingekaderd: false,
      wandel: { stand: null, kijk: 0, op: 0, toetsen: new Set() },
    };

    const maat = () => {
      const breedte = element.clientWidth;
      const hoogte = element.clientHeight;
      renderer.setSize(breedte, hoogte);
      camera.aspect = breedte / Math.max(1, hoogte);
      camera.updateProjectionMatrix();
    };
    maat();
    const waarnemer = new ResizeObserver(maat);
    waarnemer.observe(element);

    const klok = new THREE.Timer();
    let frame = 0;
    const lus = (tijd?: number) => {
      frame = requestAnimationFrame(lus);
      const d = drie.current;
      if (!d) return;
      klok.update(tijd);
      const dt = Math.min(0.1, klok.getDelta());
      if (d.wandel.stand !== null) stap(d, dt);
      else d.controls.update();
      d.renderer.render(d.scene, d.camera);
    };
    lus();

    return () => {
      cancelAnimationFrame(frame);
      waarnemer.disconnect();
      controls.dispose();
      const d = drie.current;
      d?.opgebouwd?.meshes.forEach((mesh) => mesh.geometry.dispose());
      d?.materialen.forEach((m) => m.dispose());
      d?.texturen.forEach((t) => t.dispose());
      renderer.dispose();
      element.removeChild(renderer.domElement);
      drie.current = null;
    };
  }, []);

  // Het model: opnieuw bouwen als het dak verandert.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    if (d.opgebouwd) {
      d.scene.remove(d.opgebouwd.wortel);
      d.opgebouwd.meshes.forEach((mesh) => mesh.geometry.dispose());
    }
    const opgebouwd = bouwScene(model, materiaal, plaatsingen);
    d.scene.add(opgebouwd.wortel);
    d.opgebouwd = opgebouwd;

    const { x0, y0, x1, y1, z1 } = terrein;
    const midden = new THREE.Vector3((x0 + x1) / 2, z1 / 2, (y0 + y1) / 2);
    const grootte = Math.max(x1 - x0, y1 - y0, z1, 4);
    const laagste = Math.min(0, ...model.verdiepingen.map((v) => v.z0));
    d.grond.scale.set(grootte * 10, grootte * 10, 1);
    d.grond.position.set(midden.x, laagste - 0.24, midden.z);
    d.zon.position.set(midden.x - grootte, grootte * 1.6, midden.z - grootte * 0.7);
    d.zon.target.position.copy(midden);
    const schaduw = d.zon.shadow.camera;
    schaduw.left = schaduw.bottom = -grootte;
    schaduw.right = schaduw.top = grootte;
    schaduw.near = 0.5;
    schaduw.far = grootte * 5;
    schaduw.updateProjectionMatrix();
    if (!d.ingekaderd) {
      kadreer(d, terrein);
      d.ingekaderd = true;
    }

    // De punten, in de groep van hun verdieping: ze verdwijnen en verschuiven mee.
    d.punten = [];
    const bol = new THREE.SphereGeometry(0.06, 14, 10);
    const kleuren = new Map<string, THREE.MeshStandardMaterial>();
    for (const punt of gegevens.punten) {
      const verdieping = model.verdiepingen.find((v) => v.id === punt.verdiepingId);
      if (!verdieping) continue;
      let m = kleuren.get(punt.kleur);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: punt.kleur, emissive: punt.kleur, emissiveIntensity: 0.35 });
        m.clippingPlanes = [d.snede];
        kleuren.set(punt.kleur, m);
      }
      const mesh = new THREE.Mesh(bol, m);
      mesh.position.set(punt.x, verdieping.z0 + (punt.hoogte ?? verdieping.plafond - 0.04), punt.y);
      opgebouwd.verdiepingen.get(punt.verdiepingId)?.add(mesh);
      d.punten.push(mesh);
    }
  }, [model, materiaal, gegevens.punten, plaatsingen, terrein]);

  // Een ander materiaal uitproberen: enkel de kleuren en texturen.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    for (const [sleutel, m] of d.materialen) werkMateriaalBij(sleutel, m, gegevens.materialen, proef, d.texturen);
  }, [proef, gegevens.materialen]);

  // Wat er te zien is.
  useEffect(() => {
    const d = drie.current;
    if (!d?.opgebouwd) return;
    for (const [id, groep] of d.opgebouwd.verdiepingen) groep.visible = !verborgen.has(id);
    // Tijdens het wandelen blijft het dak: anders zie je op de bovenste verdieping de lucht.
    for (const dak of d.opgebouwd.daken) dak.visible = dakenTonen || modus === "wandel";
    for (const punt of d.punten) punt.visible = puntenTonen;
    d.snede.constant = doorsnede ?? 1000;
  }, [verborgen, dakenTonen, puntenTonen, doorsnede, model, modus]);

  // Rondwandelen: de camera op ooghoogte in de grootste ruimte van een verdieping.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    if (modus !== "wandel") {
      d.wandel.stand = null;
      d.controls.enabled = true;
      return;
    }
    const verdieping = model.verdiepingen.find((v) => v.id === wandelOp) ?? model.verdiepingen[0];
    const gebouw = model.gebouwen.find((g) => g.id === verdieping?.gebouwId);
    if (!verdieping || !gebouw) return;
    const grootste = [...verdieping.vloeren].sort((a, b) => Math.abs(oppervlakte(b.ringen[0])) - Math.abs(oppervlakte(a.ringen[0])))[0];
    const [x, y] = grootste ? zwaartepunt(grootste.ringen[0]) : middenVan(gebouw.kader);
    d.wandel = { ...d.wandel, stand: { verdieping: verdieping.id, x, y, trap: null }, kijk: 0, op: 0 };
    d.controls.enabled = false;
  }, [modus, wandelOp, model]);

  /** Eén beeld verder tijdens het wandelen: de toetsen omzetten in een stap in het gebouw. */
  function stap(d: NonNullable<typeof drie.current>, dt: number) {
    const w = d.wandel;
    if (!w.stand) return;
    const wereld = wereldRef.current;
    const gebouwId = wereld.find((v) => v.id === w.stand!.verdieping)?.gebouwId;
    const gebouw = modelRef.current.gebouwen.find((g) => g.id === gebouwId);
    const plaatsing: Plaatsing = (gebouwId !== undefined && plaatsingenRef.current.get(gebouwId)) || { x: 0, y: 0, hoek: 0 };
    const midden = gebouw ? middenVan(gebouw.kader) : ([0, 0] as [number, number]);
    const toetsen = w.toetsen;
    const snel = toetsen.has("shift") ? 3 : 1.4;
    let vooruit = 0;
    let opzij = 0;
    if (toetsen.has("w") || toetsen.has("arrowup")) vooruit += 1;
    if (toetsen.has("s") || toetsen.has("arrowdown")) vooruit -= 1;
    if (toetsen.has("d")) opzij += 1;
    if (toetsen.has("a")) opzij -= 1;
    if (toetsen.has("arrowleft")) w.kijk += 1.6 * dt;
    if (toetsen.has("arrowright")) w.kijk -= 1.6 * dt;
    if (vooruit || opzij) {
      // De stap op het terrein, dan gedraaid naar het assenstelsel van het gebouw.
      const tx = (-Math.sin(w.kijk) * vooruit + Math.cos(w.kijk) * opzij) * snel * dt;
      const ty = (-Math.cos(w.kijk) * vooruit - Math.sin(w.kijk) * opzij) * snel * dt;
      const h = (plaatsing.hoek * Math.PI) / 180;
      w.stand = wandel(wereld, w.stand, Math.cos(h) * tx + Math.sin(h) * ty, -Math.sin(h) * tx + Math.cos(h) * ty);
    }
    const [x, y] = naarTerrein([w.stand.x, w.stand.y], midden, plaatsing);
    d.camera.position.set(x, ooghoogte(wereld, w.stand), y);
    d.camera.rotation.set(w.op, w.kijk, 0, "YXZ");
  }

  // Toetsen en slepen om rond te kijken, enkel tijdens het wandelen.
  useEffect(() => {
    if (modus !== "wandel") return;
    const d = drie.current;
    if (!d) return;
    const doel = d.renderer.domElement;
    const neer = (e: KeyboardEvent) => {
      const veld = (e.target as HTMLElement | null)?.tagName;
      if (veld === "INPUT" || veld === "SELECT" || veld === "TEXTAREA") return;
      const toets = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(toets)) {
        d.wandel.toetsen.add(toets);
        e.preventDefault();
      }
    };
    const op = (e: KeyboardEvent) => d.wandel.toetsen.delete(e.key.toLowerCase());
    let vorige: { x: number; y: number } | null = null;
    const druk = (e: PointerEvent) => {
      vorige = { x: e.clientX, y: e.clientY };
      doel.setPointerCapture(e.pointerId);
    };
    const sleep = (e: PointerEvent) => {
      if (!vorige) return;
      d.wandel.kijk -= (e.clientX - vorige.x) * 0.005;
      d.wandel.op = Math.max(-1.2, Math.min(1.2, d.wandel.op - (e.clientY - vorige.y) * 0.005));
      vorige = { x: e.clientX, y: e.clientY };
    };
    const los = () => {
      vorige = null;
    };
    window.addEventListener("keydown", neer);
    window.addEventListener("keyup", op);
    doel.addEventListener("pointerdown", druk);
    doel.addEventListener("pointermove", sleep);
    doel.addEventListener("pointerup", los);
    doel.addEventListener("pointercancel", los);
    return () => {
      window.removeEventListener("keydown", neer);
      window.removeEventListener("keyup", op);
      doel.removeEventListener("pointerdown", druk);
      doel.removeEventListener("pointermove", sleep);
      doel.removeEventListener("pointerup", los);
      doel.removeEventListener("pointercancel", los);
      d.wandel.toetsen.clear();
    };
  }, [modus]);

  // Volledig scherm: Esc sluit, en de pagina eronder scrolt niet mee.
  useEffect(() => {
    if (!volledig) return;
    const sluit = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVolledig(false);
    };
    const vorige = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", sluit);
    return () => {
      document.body.style.overflow = vorige;
      window.removeEventListener("keydown", sluit);
    };
  }, [volledig]);

  // Zoomen met + en −, behalve tijdens het typen in een veld.
  useEffect(() => {
    if (modus !== "rond") return;
    const toets = (e: KeyboardEvent) => {
      const veld = (e.target as HTMLElement | null)?.tagName;
      if (veld === "INPUT" || veld === "SELECT" || veld === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const d = drie.current;
      if (!d) return;
      if (e.key === "+" || e.key === "=") zoomCamera(d, 0.8);
      else if (e.key === "-" || e.key === "_") zoomCamera(d, 1.25);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [modus]);

  function zetPaneel(open: boolean) {
    setPaneel(open);
    bewaarPaneel(open);
  }

  const knop = (toets: string, tekst: string, label: string) => (
    <button
      type="button"
      className="drie-knop"
      aria-label={label}
      title={label}
      onPointerDown={() => drie.current?.wandel.toetsen.add(toets)}
      onPointerUp={() => drie.current?.wandel.toetsen.delete(toets)}
      onPointerLeave={() => drie.current?.wandel.toetsen.delete(toets)}
    >
      {tekst}
    </button>
  );

  function beeld() {
    const d = drie.current;
    if (!d) return;
    d.renderer.render(d.scene, d.camera);
    const link = document.createElement("a");
    link.href = d.renderer.domElement.toDataURL("image/png");
    link.download = "bouw-3d.png";
    link.click();
  }

  async function bewaarDak(gebouwId: number) {
    const dak = daken.get(gebouwId);
    if (!dak) return;
    setBezig(true);
    const uitkomst = await bewaarDakActie(huisId, { gebouwId, dak }).catch(() => null);
    setBezig(false);
    setMelding(
      !uitkomst
        ? { soort: "fout", tekst: "Geen verbinding met de app." }
        : uitkomst.ok
          ? { soort: "goed", tekst: "Dak bewaard." }
          : { soort: "fout", tekst: uitkomst.melding },
    );
  }

  /** Een keuze voor een trap: de stand bij zijn midden vervangen, of weghalen (null) om terug te raden. */
  function zetStand(verdiepingId: number, midden: [number, number], stand: Omit<Trapstand, "x" | "y"> | null) {
    setStanden((huidig) => {
      const anders = (huidig.get(verdiepingId) ?? []).filter((s) => Math.hypot(s.x - midden[0], s.y - midden[1]) > STAND_AFSTAND);
      return new Map(huidig).set(verdiepingId, stand ? [...anders, { x: midden[0], y: midden[1], ...stand }] : anders);
    });
  }

  async function bewaarTrappen(verdiepingId: number) {
    setBezig(true);
    const uitkomst = await bewaarTrappenActie(huisId, { verdiepingId, standen: standen.get(verdiepingId) ?? [] }).catch(() => null);
    setBezig(false);
    setMelding(
      !uitkomst
        ? { soort: "fout", tekst: "Geen verbinding met de app." }
        : uitkomst.ok
          ? { soort: "goed", tekst: "Trappen bewaard." }
          : { soort: "fout", tekst: uitkomst.melding },
    );
    if (uitkomst?.ok) setBewaardeStanden((huidig) => new Map(huidig).set(verdiepingId, standen.get(verdiepingId) ?? []));
  }

  const verdiepingNaam = (id: number) => model.verdiepingen.find((v) => v.id === id)?.naam ?? "?";
  const trapvorm = (trap: Trap3d) =>
    trap.vorm === "recht" ? "rechte trap" : trap.vorm === "keer" ? "draait halfweg 180°, met een bordes" : "draait een kwartslag, met een bordes";
  const trapbron = (trap: Trap3d) =>
    trap.bron === "plan" ? "van het plan" : trap.bron === "gat" ? "onder het gat in de verdieping erboven" : "in de ruimte Trap";
  // Verdiepingen met een verdieping erboven, waarvan de omzetting nog geen trappen zocht.
  const ouderdanTrappen = gegevens.verdiepingen.filter(
    (v) =>
      v.omgezet &&
      v.werkwijze !== null &&
      v.werkwijze < 3 &&
      model.verdiepingen.some((b) => b.gebouwId === v.gebouwId && b.z0 > (model.verdiepingen.find((x) => x.id === v.id)?.z0 ?? Infinity)),
  );
  const metTrappen = model.verdiepingen.filter((v) => v.trappen.length > 0 || (standen.get(v.id) ?? []).some((s) => s.geen));
  const veranderd = (id: number) => JSON.stringify(standen.get(id) ?? []) !== JSON.stringify(bewaardeStanden.get(id) ?? []);

  const hoogste = Math.max(3, ...model.verdiepingen.map((v) => v.z1 + 0.3));
  const laagste = Math.min(0, ...model.verdiepingen.map((v) => v.z0));

  return (
    <div className={`drie-scherm${volledig ? " volledig" : ""}${paneel ? "" : " zonder-paneel"}`}>
      <div className="drie-beeld">
        <div className="drie-raam">
          <div ref={vak} className={`drie-vak${modus === "wandel" ? " wandel" : ""}`} />
          <div className="drie-boven">
            <button
              type="button"
              className="drie-knop paneelknop"
              aria-pressed={paneel}
              title={paneel ? "Het paneel verbergen: het beeld krijgt de volle breedte" : "Het paneel met de instellingen tonen"}
              onClick={() => zetPaneel(!paneel)}
            >
              {paneel ? "Paneel verbergen" : "Paneel tonen"}
            </button>
            <button
              type="button"
              className="drie-knop"
              aria-pressed={volledig}
              title={volledig ? "Terug naar de pagina (Esc)" : "Het beeld over het hele scherm"}
              onClick={() => setVolledig(!volledig)}
            >
              {volledig ? "✕ Sluiten" : "⛶ Volledig scherm"}
            </button>
          </div>
          {modus === "rond" ? (
            <div className="drie-zoom" role="group" aria-label="Zoomen">
              <button type="button" className="drie-knop rond" aria-label="Inzoomen" title="Inzoomen (+)" onClick={() => drie.current && zoomCamera(drie.current, 0.8)}>
                +
              </button>
              <button type="button" className="drie-knop rond" aria-label="Uitzoomen" title="Uitzoomen (−)" onClick={() => drie.current && zoomCamera(drie.current, 1.25)}>
                −
              </button>
              <button type="button" className="drie-knop" title="Het hele huis in beeld" onClick={() => drie.current && kadreer(drie.current, terrein)}>
                Passend
              </button>
            </div>
          ) : (
            <div className="wandelknoppen">
              {knop("arrowleft", "↺", "Naar links draaien")}
              {knop("w", "▲", "Vooruit")}
              {knop("arrowright", "↻", "Naar rechts draaien")}
              {knop("a", "◀", "Opzij naar links")}
              {knop("s", "▼", "Achteruit")}
              {knop("d", "▶", "Opzij naar rechts")}
            </div>
          )}
        </div>
        <p className="hulp drie-hulp">
          {modus === "rond"
            ? "Slepen draait, rechts slepen of drie vingers schuift. Zoomen met + en −, het muiswiel of twee vingers."
            : "Slepen kijkt rond. Lopen met W A S D of de pijltjes, sneller met Shift, of met de knoppen."}
        </p>
      </div>

      <div className="omzetten-zijbalk drie-paneel" hidden={!paneel}>
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}

        <section className="kaart">
          <h3>Bekijken</h3>
          <div className="knoppenrij">
            <button type="button" className={modus === "rond" ? "" : "stil"} onClick={() => setModus("rond")}>
              Rondkijken
            </button>
            <button type="button" className={modus === "wandel" ? "" : "stil"} onClick={() => setModus("wandel")}>
              Rondwandelen
            </button>
            <button type="button" className="stil" onClick={beeld}>
              Beeld downloaden
            </button>
          </div>
          {modus === "wandel" ? (
            <div style={{ marginTop: 10 }}>
              <label htmlFor="wandel-op">Op</label>
              <select id="wandel-op" value={wandelOp ?? model.verdiepingen[0]?.id ?? ""} onChange={(g) => setWandelOp(Number(g.currentTarget.value))}>
                {model.verdiepingen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.naam}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        <section className="kaart">
          <h3>Verdiepingen</h3>
          {model.verdiepingen.map((v) => (
            <label key={v.id} className="keuzevak">
              <input
                type="checkbox"
                checked={!verborgen.has(v.id)}
                onChange={(g) => {
                  const aan = g.currentTarget.checked;
                  setVerborgen((huidig) => {
                    const nieuw = new Set(huidig);
                    if (aan) nieuw.delete(v.id);
                    else nieuw.add(v.id);
                    return nieuw;
                  });
                }}
              />
              {v.naam}
            </label>
          ))}
          <label className="keuzevak">
            <input type="checkbox" checked={dakenTonen} onChange={(g) => setDakenTonen(g.currentTarget.checked)} />
            Daken
          </label>
          <label className="keuzevak">
            <input type="checkbox" checked={puntenTonen} onChange={(g) => setPuntenTonen(g.currentTarget.checked)} />
            Punten voor de elektricien
          </label>
          <label htmlFor="doorsnede" style={{ marginTop: 10 }}>
            Doorsnede {doorsnede === null ? "uit" : `op ${doorsnede.toFixed(1).replace(".", ",")} m`}
          </label>
          <input
            id="doorsnede"
            type="range"
            min={laagste + 0.5}
            max={hoogste}
            step={0.1}
            value={doorsnede ?? hoogste}
            onChange={(g) => {
              const waarde = Number(g.currentTarget.value);
              setDoorsnede(waarde >= hoogste ? null : waarde);
            }}
          />
        </section>

        {metTrappen.length > 0 || ouderdanTrappen.length > 0 ? (
          <section className="kaart">
            <h3>Trappen</h3>
            {ouderdanTrappen.map((v) => (
              <p key={v.id} className="hulp">
                {v.naam} werd omgezet vóór de app trappen las.{" "}
                {v.grondplanId ? <a href={huispad(huisId, `/plannen/${v.grondplanId}/omzetten`)}>Zet het opnieuw om</a> : "Zet het opnieuw om"} om
                de trap van het plan te krijgen.
              </p>
            ))}
            {metTrappen.map((v) => (
              <div key={v.id} className="trapkeuze">
                {v.trappen.map((trap) => (
                  <div key={`${trap.midden[0]},${trap.midden[1]}`}>
                    <p>
                      <strong>
                        {verdiepingNaam(trap.van)} → {verdiepingNaam(trap.naar)}
                      </strong>
                      <br />
                      <span className="hulp">
                        {trapvorm(trap)}, {trap.delen.reduce((som, deel) => som + deel.treden, 0)} treden, {trapbron(trap)}
                      </span>
                    </p>
                    <div className="knoppenrij">
                      <button
                        type="button"
                        className="stil"
                        onClick={() =>
                          zetStand(v.id, trap.midden, {
                            ...(trap.stand.vorm ? { vorm: trap.stand.vorm, bordesAnderEinde: trap.stand.bordesAnderEinde } : {}),
                            omgekeerd: !trap.stand.omgekeerd,
                          })
                        }
                      >
                        Omdraaien
                      </button>
                      {trap.stand.vorm ? (
                        <button
                          type="button"
                          className="stil"
                          onClick={() => zetStand(v.id, trap.midden, { vorm: trap.stand.vorm === "recht" ? "keer" : "recht" })}
                        >
                          {trap.stand.vorm === "recht" ? "Met bordes (180°)" : "Rechte trap"}
                        </button>
                      ) : null}
                      {trap.stand.vorm === "keer" ? (
                        <button
                          type="button"
                          className="stil"
                          onClick={() =>
                            zetStand(v.id, trap.midden, { vorm: "keer", omgekeerd: trap.stand.omgekeerd, bordesAnderEinde: !trap.stand.bordesAnderEinde })
                          }
                        >
                          Bordes aan het andere einde
                        </button>
                      ) : null}
                      <button type="button" className="stil" onClick={() => zetStand(v.id, trap.midden, { geen: true })}>
                        Geen trap
                      </button>
                    </div>
                  </div>
                ))}
                {(standen.get(v.id) ?? [])
                  .filter((s) => s.geen)
                  .map((s) => (
                    <p key={`${s.x},${s.y}`} className="hulp">
                      Een gat zonder trap (vide).{" "}
                      <button type="button" className="link" onClick={() => zetStand(v.id, [s.x, s.y], null)}>
                        Trap terugzetten
                      </button>
                    </p>
                  ))}
                {veranderd(v.id) ? (
                  <div className="knoppenrij">
                    <button type="button" disabled={bezig} onClick={() => void bewaarTrappen(v.id)}>
                      Trappen bewaren
                    </button>
                    <button type="button" className="stil" onClick={() => setStanden((huidig) => new Map(huidig).set(v.id, bewaardeStanden.get(v.id) ?? []))}>
                      Herbeginnen
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {gegevens.materialen.length > 0 ? (
          <section className="kaart">
            <h3>Materialen</h3>
            <p className="hulp">Uitproberen bewaart niets. Kiezen doe je bij de keuze zelf.</p>
            {gegevens.materialen.map((keuze) => (
              <div key={keuze.keuzeId} style={{ marginTop: 8 }}>
                <label htmlFor={`proef-${keuze.keuzeId}`}>
                  {SLOTNAMEN[keuze.slot]}: {keuze.titel}
                </label>
                <select
                  id={`proef-${keuze.keuzeId}`}
                  value={proef.get(keuze.keuzeId) ?? keuze.standaard}
                  onChange={(g) => {
                    const optieId = Number(g.currentTarget.value);
                    setProef((huidig) => new Map(huidig).set(keuze.keuzeId, optieId));
                  }}
                >
                  {keuze.opties.map((optie) => (
                    <option key={optie.id} value={optie.id}>
                      {optie.naam}
                      {optie.id === keuze.standaard ? " (nu)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>
        ) : null}

        {gegevens.gebouwen
          .filter((gebouw) => model.verdiepingen.some((v) => v.gebouwId === gebouw.id))
          .map((gebouw) => {
            const dak = daken.get(gebouw.id) ?? gebouw.dak;
            const zet = (wijziging: Partial<Dakinstelling>) => setDaken((huidig) => new Map(huidig).set(gebouw.id, { ...dak, ...wijziging }));
            return (
              <section key={gebouw.id} className="kaart">
                <h3>Dak{gegevens.gebouwen.length > 1 ? ` van ${gebouw.naam.toLowerCase()}` : ""}</h3>
                <div className="veldenrij">
                  <div>
                    <label htmlFor={`dak-${gebouw.id}`}>Soort</label>
                    <select id={`dak-${gebouw.id}`} value={dak.type} onChange={(g) => zet({ type: g.currentTarget.value as Dakinstelling["type"] })}>
                      {DAKTYPES.map((type) => (
                        <option key={type} value={type}>
                          {DAKNAMEN[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {dak.type !== "plat" ? (
                    <>
                      <div>
                        <label htmlFor={`helling-${gebouw.id}`}>Helling (°)</label>
                        <input
                          id={`helling-${gebouw.id}`}
                          type="number"
                          min={5}
                          max={60}
                          value={dak.helling}
                          onChange={(g) => zet({ helling: Math.max(5, Math.min(60, Number(g.currentTarget.value) || 35)) })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`nok-${gebouw.id}`}>{dak.type === "zadel" ? "Nok" : "Helling"}</label>
                        <select id={`nok-${gebouw.id}`} value={dak.nok} onChange={(g) => zet({ nok: g.currentTarget.value === "y" ? "y" : "x" })}>
                          <option value="x">links-rechts</option>
                          <option value="y">boven-onder</option>
                        </select>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="knoppenrij" style={{ marginTop: 10 }}>
                  <button type="button" className="stil" disabled={bezig} onClick={() => void bewaarDak(gebouw.id)}>
                    Dak bewaren
                  </button>
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
