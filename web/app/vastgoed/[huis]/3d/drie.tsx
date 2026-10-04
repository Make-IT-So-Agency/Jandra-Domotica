"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import { Lagenkeuze, useLagen } from "@/components/bouw/lagen";
import { DAKNAMEN, DAKTYPES, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import { obstakels } from "@/lib/bouw/drie/inrichten";
import { OVERTUIGEND, type Inplantingsvondst, type Zoekgebouw } from "@/lib/bouw/drie/inplanting";
import type { Driegegevens } from "@/lib/bouw/drie/laden";
import { isAan, lagenVan } from "@/lib/bouw/drie/lagen";
import { SLOTNAMEN, STANDAARDKLEUREN, materiaalVan, type Slot } from "@/lib/bouw/drie/materialen";
import { maakModel, type Model3d } from "@/lib/bouw/drie/model";
import { georefVanPlaatsing, plaatsingVanGeoref, type Georef, type Lambert, type Omgeving } from "@/lib/bouw/drie/omgeving";
import { STAND_AFSTAND, type Trap3d } from "@/lib/bouw/drie/trappen";
import {
  genormaliseerd,
  herschaald,
  kaderOpTerrein,
  middenVan,
  naarTerrein,
  rondMidden,
  standaardPlaatsingen,
  type Kader2d,
  type Plaatsing,
} from "@/lib/bouw/drie/plaatsing";
import { ooghoogte, wandel, type Wandelstand, type Wandelverdieping } from "@/lib/bouw/drie/wandelen";
import { noordenVan } from "@/lib/bouw/drie/zon";
import { INRICHTINGSLAAGNAMEN, INRICHTINGSLAGEN, laagVan } from "@/lib/bouw/inrichting";
import { LEIDINGSOORTEN } from "@/lib/bouw/leidingen";
import { zwaartepunt, oppervlakte } from "@/lib/bouw/omzetting/geometrie";
import { METER_PER_PUNT } from "@/lib/bouw/omzetting/schaal";
import type { Xy } from "@/lib/bouw/omzetting/types";
import { huispad } from "@/lib/bouw/paden";
import { CATEGORIEEN, CATEGORIEKLEUREN, CATEGORIENAMEN, hoogteTekst, ruimteVan, STATUSNAMEN } from "@/lib/bouw/punten";
import type { Trapstand } from "@/lib/bouw/types";

import { bewaarDakActie, bewaarInplantingActie, bewaarOmgevingActie, bewaarTrappenActie } from "./acties";
import type { GeladenPlan } from "./inplantingsplan";
import { Inrichtkaart, useInrichten } from "./inrichten";
import { bouwLeidingen, type Leidingenscene } from "./leidingen-scene";
import { richtStraal, useTik, zichtbareRaak } from "./kern";
import { useMeten } from "./meten";
import { bouwOmgeving, type Omgevingsscene } from "./omgeving-scene";
import { bouwPunten, puntBijTik, type Puntenscene } from "./punten-scene";
import { bouwScene, plaats, type Opgebouwd, type Sleutel } from "./scene";
import { Noordpijl, Zonkaart } from "./zon";

type Modus = "rond" | "wandel";
/** Wat een tik of slepen op het beeld doet. Er staat altijd maar één gereedschap aan. */
type Gereedschap = "kijken" | "meten" | "verplaatsen" | "omgeving" | "inrichten";

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
/** De schaal van het inplantingsplan zolang er geen gekend is. */
const STANDAARDSCHAAL = 200;
/** Hoe de schaal gekozen werd, voor de uitleg onder het veld. */
type Schaalbron = Inplantingsvondst["bron"] | "bewaard" | "hand";
const SCHAALUITLEG: Record<NonNullable<Schaalbron>, string> = {
  bewaard: "Zoals bewaard.",
  hand: "Zelf ingesteld.",
  gegeven: "Zelf ingesteld.",
  plan: "Volgens het plan.",
  gebouwen: "Berekend uit de gebouwen: het plan vermeldt geen schaal, of een die niet past.",
};

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

/** De camera recht boven het terrein, met het plan rechtop: zo zie je of alles op zijn plaats staat. */
function vanBoven(d: { camera: THREE.PerspectiveCamera; controls: OrbitControls }, kader: Kader2d) {
  const { x0, y0, x1, y1 } = kader;
  const straal = Math.max(8, Math.hypot(x1 - x0, y1 - y0) / 2) * 1.6;
  const verticaal = THREE.MathUtils.degToRad(d.camera.fov) / 2;
  const horizontaal = Math.atan(Math.tan(verticaal) * d.camera.aspect);
  const hoogte = Math.min(MAX_AFSTAND, straal / Math.tan(Math.min(verticaal, horizontaal)));
  // Een haar naar het zuiden: recht van boven heeft OrbitControls geen richting.
  d.camera.position.set((x0 + x1) / 2, hoogte, (y0 + y1) / 2 + 0.001);
  d.controls.target.set((x0 + x1) / 2, 0, (y0 + y1) / 2);
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
  // Wat er te zien is: per laag aan of uit, onthouden per browser (zie lib/bouw/drie/lagen.ts).
  const [lagen, zetLagen] = useLagen();
  const [doorsnede, setDoorsnede] = useState<number | null>(null);
  const [modus, setModus] = useState<Modus>("rond");
  const [gereedschap, setGereedschap] = useState<Gereedschap>("kijken");
  // Staat de scène er? De kaarten met een eigen effect (de zon) wachten erop.
  const [klaar, setKlaar] = useState(false);
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

  // De inplanting: op welk plan, op welke schaal, en waar elk gebouw staat.
  const plannen = gegevens.inplanting.plannen;
  const [bewaardPlan, setBewaardPlan] = useState({ planId: gegevens.inplanting.planId, schaal: gegevens.inplanting.schaal });
  const [bewaardePlaatsen, setBewaardePlaatsen] = useState<Map<number, Plaatsing>>(
    () => new Map(gegevens.gebouwen.flatMap((g) => (g.plaats ? [[g.id, g.plaats] as const] : []))),
  );
  // Zonder bewaard plan het eerste inplantingsplan. Wat zonder plan bewaard werd, geldt daar niet: dan zoekt het opnieuw.
  const [planId, setPlanId] = useState<number | null>(() => gegevens.inplanting.planId ?? plannen[0]?.id ?? null);
  const opBewaardPlan = planId === bewaardPlan.planId;
  const [plaatsen, setPlaatsen] = useState<Map<number, Plaatsing>>(() => (opBewaardPlan ? bewaardePlaatsen : new Map()));
  const [schaal, setSchaal] = useState<number | null>(() => (opBewaardPlan ? bewaardPlan.schaal : null));
  const [schaalbron, setSchaalbron] = useState<Schaalbron>(() => (opBewaardPlan && bewaardPlan.schaal !== null ? "bewaard" : null));
  const [schaaltekst, setSchaaltekst] = useState<string | null>(null);
  const [geladen, setGeladen] = useState<GeladenPlan | null>(null);
  const [planstand, setPlanstand] = useState<"geen" | "laden" | "zoeken" | "klaar" | "fout">("geen");
  const [planfout, setPlanfout] = useState<string | null>(null);
  const planTonen = isAan(lagen, "terrein:plan");
  // Per gebouw: automatisch gevonden (met de overeenkomst), zelf verzet, of niet gevonden op het plan.
  const [gevonden, setGevonden] = useState<Map<number, number>>(new Map());
  const [verzet, setVerzet] = useState<Set<number>>(new Set());
  const [nietGevonden, setNietGevonden] = useState<Set<number>>(new Set());
  const verplaatsen = gereedschap === "verplaatsen";
  const [gekozen, setGekozen] = useState<number | null>(null);
  const [hoektekst, setHoektekst] = useState<string | null>(null);

  // De omgeving uit Vlaanderen: de percelen, de buren en de luchtfoto, en waar ze op het terrein ligt.
  const [omgeving, setOmgeving] = useState<Omgeving | null>(null);
  const [omgevingstand, setOmgevingstand] = useState<"geen" | "laden" | "klaar" | "fout">(gegevens.omgeving.metAdres ? "laden" : "geen");
  const [omgevingsfout, setOmgevingsfout] = useState<string | null>(null);
  const [bewaardeGeoref, setBewaardeGeoref] = useState<Georef | null>(gegevens.omgeving.georef);
  // Waar het adrespunt op het terrein ligt en hoe de kaart gedraaid is (zie drie/omgeving.ts).
  const [omgevingsplaats, setOmgevingsplaats] = useState<Plaatsing | null>(null);
  const [omgevingsbron, setOmgevingsbron] = useState<{ soort: "bewaard" | "plan" | "huis" | "hand"; overeenkomst?: number } | null>(null);
  const omgevingVerplaatsen = gereedschap === "omgeving";
  const planOpFoto = isAan(lagen, "terrein:luchtfoto") && omgeving !== null && omgevingsplaats !== null;

  /** Meter per punt op het inplantingsplan. */
  const meterPerPunt = (schaal ?? STANDAARDSCHAAL) * METER_PER_PUNT;
  // Waar elk gebouw staat: zijn plaats, of naast de andere. Staat er nog niets op een plan, dan in het midden ervan.
  const plaatsingen = useMemo(() => {
    const standaard = standaardPlaatsingen(model.gebouwen, plaatsen);
    if (plaatsen.size > 0 || !geladen) return standaard;
    return rondMidden(model.gebouwen, standaard, [(geladen.blad.breedte * meterPerPunt) / 2, (geladen.blad.hoogte * meterPerPunt) / 2]);
  }, [model, plaatsen, geladen, meterPerPunt]);
  const terrein = useMemo(() => kaderOpTerrein(model.gebouwen, plaatsingen), [model, plaatsingen]);
  // Wat het zoeken op het plan nodig heeft: per gebouw de voetafdruk en de muren van het gelijkvloers.
  const zoekgebouwen: Zoekgebouw[] = useMemo(
    () =>
      model.gebouwen.flatMap((gebouw) => {
        const eigen = model.verdiepingen.filter((v) => v.gebouwId === gebouw.id).sort((a, b) => a.z0 - b.z0);
        // Het gelijkvloers: de laagste verdieping die geen kelder is.
        const gelijkvloers = eigen.find((v) => v.z0 >= -0.5) ?? eigen.at(-1);
        if (!gelijkvloers) return [];
        return [
          {
            id: gebouw.id,
            voetafdruk: gelijkvloers.plaat.veelhoeken.map((veelhoek) => [veelhoek[0]]),
            muren: gelijkvloers.muren.flatMap((muur) => muur.veelhoek.flatMap((ring) => ring.map((a, i): [Xy, Xy] => [a, ring[(i + 1) % ring.length]]))),
            midden: middenVan(gebouw.kader),
          },
        ];
      }),
    [model],
  );

  // Alles wat three.js nodig heeft, buiten React om.
  const drie = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    zon: THREE.DirectionalLight;
    hemel: THREE.HemisphereLight;
    rond: THREE.AmbientLight;
    grond: THREE.Mesh;
    snede: THREE.Plane;
    /** Labels in HTML boven het beeld, zoals de maten. */
    labels: CSS2DRenderer;
    /** Wat bij elk beeld moet gebeuren, zoals de noordpijl draaien. */
    elkBeeld: Set<(dt: number) => void>;
    materialen: Map<Sleutel, THREE.MeshStandardMaterial>;
    texturen: Map<string, THREE.Texture>;
    opgebouwd: Opgebouwd | null;
    punten: THREE.Object3D[];
    puntenscene: Puntenscene | null;
    leidingenscene: Leidingenscene | null;
    /** Het inplantingsplan op de grond, en zijn textuur (één per gelezen plan). */
    plan: THREE.Mesh | null;
    plantextuur: { van: GeladenPlan; textuur: THREE.Texture } | null;
    omgeving: Omgevingsscene | null;
    ingekaderd: boolean;
    /** Heeft iemand de camera al bewogen? Zo niet, dan gaat ze mee naar de gebouwen op het plan. */
    bewogen: boolean;
    naPlan: boolean;
    /** Rondwandelen: waar je bent (in het gebouw), waar je naar kijkt (op het terrein), en welke toetsen ingedrukt zijn. */
    wandel: { stand: Wandelstand | null; kijk: number; op: number; toetsen: Set<string> };
  } | null>(null);
  // De lus van three.js en het bouwen lezen de laatste stand uit refs, niet uit een oude render.
  const proefRef = useRef(proef);
  proefRef.current = proef;
  const modelRef = useRef(model);
  modelRef.current = model;
  const plaatsingenRef = useRef(plaatsingen);
  plaatsingenRef.current = plaatsingen;
  const plaatsenRef = useRef(plaatsen);
  plaatsenRef.current = plaatsen;
  const schaalRef = useRef(schaal);
  schaalRef.current = schaal;
  const geladenRef = useRef(geladen);
  geladenRef.current = geladen;
  const zoekgebouwenRef = useRef(zoekgebouwen);
  zoekgebouwenRef.current = zoekgebouwen;
  const omgevingsplaatsRef = useRef(omgevingsplaats);
  omgevingsplaatsRef.current = omgevingsplaats;

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

    // Binnen moet het ook licht zijn: een plafond krijgt geen zon. Waar de zon staat, zet de kaart Zon.
    const hemel = new THREE.HemisphereLight("#ffffff", "#d9d3c7", 1.5);
    const rond = new THREE.AmbientLight("#ffffff", 0.45);
    scene.add(hemel, rond);
    const zon = new THREE.DirectionalLight("#fff4e0", 2.6);
    zon.castShadow = true;
    zon.shadow.mapSize.set(2048, 2048);
    zon.shadow.normalBias = 0.03;
    scene.add(zon, zon.target);

    const grond = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: STANDAARDKLEUREN.grond, roughness: 1 }));
    grond.rotation.x = -Math.PI / 2;
    grond.receiveShadow = true;
    scene.add(grond);

    const labels = new CSS2DRenderer();
    labels.domElement.className = "drie-labels";
    element.appendChild(labels.domElement);

    drie.current = {
      renderer,
      scene,
      camera,
      controls,
      zon,
      hemel,
      rond,
      grond,
      snede: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000),
      labels,
      elkBeeld: new Set(),
      materialen: new Map(),
      texturen: new Map(),
      opgebouwd: null,
      punten: [],
      puntenscene: null,
      leidingenscene: null,
      plan: null,
      plantextuur: null,
      omgeving: null,
      ingekaderd: false,
      bewogen: false,
      naPlan: false,
      wandel: { stand: null, kijk: 0, op: 0, toetsen: new Set() },
    };

    controls.addEventListener("start", () => {
      if (drie.current) drie.current.bewogen = true;
    });

    const maat = () => {
      const breedte = element.clientWidth;
      const hoogte = element.clientHeight;
      renderer.setSize(breedte, hoogte);
      labels.setSize(breedte, hoogte);
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
      for (const doe of d.elkBeeld) doe(dt);
      d.renderer.render(d.scene, d.camera);
      d.labels.render(d.scene, d.camera);
    };
    lus();
    setKlaar(true);

    return () => {
      cancelAnimationFrame(frame);
      waarnemer.disconnect();
      controls.dispose();
      const d = drie.current;
      d?.opgebouwd?.meshes.forEach((mesh) => mesh.geometry.dispose());
      d?.materialen.forEach((m) => m.dispose());
      d?.texturen.forEach((t) => t.dispose());
      d?.plan?.geometry.dispose();
      (d?.plan?.material as THREE.Material | undefined)?.dispose();
      d?.plantextuur?.textuur.dispose();
      d?.omgeving?.opruimen();
      d?.puntenscene?.opruimen();
      d?.leidingenscene?.opruimen();
      renderer.dispose();
      element.removeChild(renderer.domElement);
      element.removeChild(labels.domElement);
      drie.current = null;
      setKlaar(false);
    };
  }, []);

  // Het model: opnieuw bouwen als het verandert, elk gebouw meteen op zijn plaats.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    if (d.opgebouwd) {
      d.scene.remove(d.opgebouwd.wortel);
      d.opgebouwd.meshes.forEach((mesh) => mesh.geometry.dispose());
    }
    const opgebouwd = bouwScene(model, materiaal, plaatsingenRef.current);
    d.scene.add(opgebouwd.wortel);
    d.opgebouwd = opgebouwd;

    // De punten als symbolen, in de groep van hun verdieping: ze verdwijnen en verschuiven mee.
    d.puntenscene?.opruimen();
    d.puntenscene = bouwPunten(gegevens.punten, model, opgebouwd.verdiepingen, d.snede);
    d.punten = d.puntenscene.objecten;
    // De leidingen ook, met de grond zoals hieronder.
    d.leidingenscene?.opruimen();
    d.leidingenscene = bouwLeidingen(gegevens.leidingen, model, opgebouwd.verdiepingen, d.snede, Math.min(0, ...model.verdiepingen.map((v) => v.z0)) - 0.24);
  }, [model, materiaal, gegevens.punten, gegevens.leidingen]);

  // Een gebouw verzet: enkel zijn groep verplaatsen, niets opnieuw bouwen.
  useEffect(() => {
    const d = drie.current;
    if (!d?.opgebouwd) return;
    for (const [id, groep] of d.opgebouwd.gebouwen) {
      const plaatsing = plaatsingen.get(id);
      if (plaatsing) plaats(groep, plaatsing);
    }
  }, [plaatsingen, model]);

  // De grond rond de gebouwen; bij het openen de camera erop. De zon zet de kaart Zon.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    const { x0, y0, x1, y1 } = terrein;
    const grootte = Math.max(x1 - x0, y1 - y0, terrein.z1, 4);
    const laagste = Math.min(0, ...model.verdiepingen.map((v) => v.z0));
    d.grond.scale.set(grootte * 10, grootte * 10, 1);
    d.grond.position.set((x0 + x1) / 2, laagste - 0.24, (y0 + y1) / 2);
    if (d.plan) d.plan.position.y = laagste - 0.235;
    if (!d.ingekaderd) {
      kadreer(d, terrein);
      d.ingekaderd = true;
    }
  }, [terrein, model]);

  // Het inplantingsplan op de grond: de linkerbovenhoek van het blad in de oorsprong, op schaal.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    if (d.plan) {
      d.scene.remove(d.plan);
      d.plan.geometry.dispose();
      (d.plan.material as THREE.Material).dispose();
      d.plan = null;
    }
    if (d.plantextuur && d.plantextuur.van !== geladen) {
      d.plantextuur.textuur.dispose();
      d.plantextuur = null;
    }
    if (!geladen || !planTonen) return;
    if (!d.plantextuur) {
      const textuur = new THREE.CanvasTexture(geladen.beeld);
      textuur.colorSpace = THREE.SRGBColorSpace;
      textuur.anisotropy = d.renderer.capabilities.getMaxAnisotropy();
      d.plantextuur = { van: geladen, textuur };
    }
    const [breedte, hoogte] = [geladen.blad.breedte * meterPerPunt, geladen.blad.hoogte * meterPerPunt];
    // Een negatieve polygonOffset legt het plan boven het gras en de luchtfoto, zonder flikkeren.
    const boven = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const plan = new THREE.Mesh(
      new THREE.PlaneGeometry(breedte, hoogte),
      // Boven de luchtfoto vermenigvuldigd: het wit van het papier valt weg, de lijnen blijven.
      planOpFoto
        ? new THREE.MeshBasicMaterial({ map: d.plantextuur.textuur, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false, ...boven })
        : new THREE.MeshStandardMaterial({ map: d.plantextuur.textuur, roughness: 1, metalness: 0, ...boven }),
    );
    plan.rotation.x = -Math.PI / 2;
    plan.position.set(breedte / 2, Math.min(0, ...modelRef.current.verdiepingen.map((v) => v.z0)) - 0.235, hoogte / 2);
    plan.receiveShadow = !planOpFoto;
    d.scene.add(plan);
    d.plan = plan;
  }, [geladen, planTonen, meterPerPunt, planOpFoto]);

  const huidigPlan = plannen.find((plan) => plan.id === planId) ?? null;
  const huidigPlanRef = useRef(huidigPlan);
  huidigPlanRef.current = huidigPlan;
  // Na het bewaren komen de gegevens opnieuw binnen, als nieuwe objecten: enkel een ander plan of een andere versie leest opnieuw.
  const planSleutel = huidigPlan ? `${huidigPlan.id}:${huidigPlan.versie.versieId}:${huidigPlan.versie.pagina}` : null;

  // Het gekozen inplantingsplan lezen en tekenen. pdf.js komt pas nu binnen.
  useEffect(() => {
    setGeladen(null);
    setPlanfout(null);
    const plan = huidigPlanRef.current;
    if (!plan) {
      setPlanstand("geen");
      return;
    }
    let weg = false;
    setPlanstand("laden");
    const maxPixels = Math.min(4096, drie.current?.renderer.capabilities.maxTextureSize ?? 4096);
    import("./inplantingsplan")
      .then(({ laadInplantingsplan }) => laadInplantingsplan(huisId, plan, maxPixels))
      .then(
        (gelezen) => {
          if (!weg) setGeladen(gelezen);
        },
        (fout: unknown) => {
          if (weg) return;
          setPlanfout(fout instanceof Error ? fout.message : "Het plan kon niet gelezen worden.");
          setPlanstand("fout");
        },
      );
    return () => {
      weg = true;
    };
  }, [huisId, planSleutel]);

  /** Zoekt deze gebouwen op het plan; met een schaal enkel op die schaal, anders ook de schaal. */
  async function zoek(ids: number[], gegeven: number | null) {
    const plan = geladenRef.current;
    if (!plan || ids.length === 0) return;
    setPlanstand("zoeken");
    let vondst: Inplantingsvondst;
    try {
      const { zoekInplanting } = await import("./inplantingsplan");
      vondst = await zoekInplanting(
        zoekgebouwenRef.current.filter((g) => ids.includes(g.id)),
        plan.blad,
        gegeven,
      );
    } catch {
      if (geladenRef.current !== plan) return;
      setPlanfout("De gebouwen zoeken op het plan is mislukt. Zet ze zelf op hun plaats.");
      setPlanstand("fout");
      return;
    }
    // Intussen een ander plan gekozen: dan geldt dit niet meer.
    if (geladenRef.current !== plan) return;
    const vorige = schaalRef.current ?? STANDAARDSCHAAL;
    const nieuweSchaal = gegeven ?? vondst.noemer;
    if (gegeven === null && vondst.noemer !== null) {
      setSchaal(vondst.noemer);
      setSchaalbron(vondst.bron);
    }
    setPlaatsen((huidig) => {
      // Wat niet gevonden werd, blijft op zijn plek op het plan, ook op een andere schaal.
      const nieuw = nieuweSchaal !== null && nieuweSchaal !== vorige ? herschaald(huidig, nieuweSchaal / vorige) : new Map(huidig);
      for (const [id, v] of vondst.gevonden) nieuw.set(id, v.plaatsing);
      return nieuw;
    });
    setGevonden((huidig) => {
      const nieuw = new Map(huidig);
      for (const id of ids) nieuw.delete(id);
      for (const [id, v] of vondst.gevonden) nieuw.set(id, v.overeenkomst);
      return nieuw;
    });
    setVerzet((huidig) => new Set([...huidig].filter((id) => !vondst.gevonden.has(id))));
    setNietGevonden(
      (huidig) => new Set([...[...huidig].filter((id) => !ids.includes(id)), ...ids.filter((id) => !vondst.gevonden.has(id))]),
    );
    setPlanstand("klaar");
  }
  const zoekRef = useRef(zoek);
  zoekRef.current = zoek;

  // Zodra het plan gelezen is: de gebouwen zonder plaats erop zoeken.
  useEffect(() => {
    if (!geladen) return;
    const zonder = zoekgebouwenRef.current.filter((g) => !plaatsenRef.current.has(g.id)).map((g) => g.id);
    if (zonder.length === 0) setPlanstand("klaar");
    else void zoekRef.current(zonder, schaalRef.current);
  }, [geladen]);

  // De omgeving ophalen: enkel met een adres, en het adres zelf blijft op de server.
  useEffect(() => {
    if (!gegevens.omgeving.metAdres) return;
    let weg = false;
    fetch(`/api/bouw/omgeving?huis=${huisId}`)
      .then(async (antwoord) => {
        const inhoud = (await antwoord.json().catch(() => null)) as (Omgeving & { fout?: string }) | null;
        if (weg) return;
        if (!antwoord.ok || !inhoud?.punt) {
          setOmgevingsfout(inhoud?.fout ?? "De omgeving ophalen is mislukt.");
          setOmgevingstand("fout");
          return;
        }
        setOmgeving(inhoud);
        setOmgevingstand("klaar");
      })
      .catch(() => {
        if (weg) return;
        setOmgevingsfout("Geen verbinding met de app.");
        setOmgevingstand("fout");
      });
    return () => {
      weg = true;
    };
  }, [huisId, gegevens.omgeving.metAdres]);

  // De omgeving in de scène: de luchtfoto, de grenzen en de buren, in één groep.
  useEffect(() => {
    const d = drie.current;
    if (!d || !omgeving) return;
    const grond = Math.min(0, ...modelRef.current.verdiepingen.map((v) => v.z0)) - 0.24;
    const scene = bouwOmgeving(omgeving, grond, `/api/bouw/omgeving/luchtfoto?huis=${huisId}`, d.renderer.capabilities.getMaxAnisotropy());
    scene.groep.visible = false;
    d.scene.add(scene.groep);
    d.omgeving = scene;
    return () => {
      d.scene.remove(scene.groep);
      scene.opruimen();
      if (d.omgeving === scene) d.omgeving = null;
    };
  }, [omgeving, huisId]);

  // Waar de omgeving ligt, en wat er van te zien is.
  useEffect(() => {
    const scene = drie.current?.omgeving;
    if (!scene) return;
    if (omgevingsplaats) plaats(scene.groep, omgevingsplaats);
    scene.groep.visible = omgevingsplaats !== null;
    scene.luchtfoto.visible = isAan(lagen, "terrein:luchtfoto");
    scene.grenzen.visible = isAan(lagen, "terrein:grenzen");
    scene.buren.visible = isAan(lagen, "terrein:buren");
    scene.opPerceel.visible = isAan(lagen, "terrein:opPerceel");
  }, [omgeving, omgevingsplaats, lagen]);

  /**
   * De omgeving op het terrein leggen: ons perceel op het inplantingsplan
   * zoeken, en lukt dat niet (of is er geen plan), het adrespunt op de woning
   * met het noorden naar boven.
   */
  async function legOmgeving(o: Omgeving) {
    const opHuis = () => {
      const huis = plaatsingenRef.current.get(modelRef.current.gebouwen[0]?.id ?? -1);
      setOmgevingsplaats({ x: huis?.x ?? 0, y: huis?.y ?? 0, hoek: 0 });
      setOmgevingsbron({ soort: "huis" });
    };
    const plan = geladenRef.current;
    if (!plan) return opHuis();
    try {
      const { zoekPerceel } = await import("./inplantingsplan");
      const vondst = await zoekPerceel(o, plan.blad, schaalRef.current ?? STANDAARDSCHAAL);
      if (!vondst) return opHuis();
      setOmgevingsplaats(plaatsingVanGeoref(vondst.georef, o.punt));
      setOmgevingsbron({ soort: "plan", overeenkomst: vondst.overeenkomst });
    } catch {
      opHuis();
    }
  }
  const legOmgevingRef = useRef(legOmgeving);
  legOmgevingRef.current = legOmgeving;

  // Zoals bewaard; anders zodra het plan gelezen is en de gebouwen erop staan.
  const omgevingGelegd = useRef(false);
  useEffect(() => {
    if (!omgeving || omgevingGelegd.current) return;
    if (bewaardeGeoref) {
      omgevingGelegd.current = true;
      setOmgevingsplaats(plaatsingVanGeoref(bewaardeGeoref, omgeving.punt));
      setOmgevingsbron({ soort: "bewaard" });
      return;
    }
    if (planstand === "laden" || planstand === "zoeken") return;
    omgevingGelegd.current = true;
    void legOmgevingRef.current(omgeving);
  }, [omgeving, bewaardeGeoref, planstand]);

  // Na het eerste zoeken op het plan staan de gebouwen elders: de camera gaat mee, tenzij iemand ze al bewoog.
  useEffect(() => {
    const d = drie.current;
    if (!d || planstand !== "klaar" || d.naPlan) return;
    d.naPlan = true;
    if (!d.bewogen) kadreer(d, terrein);
  }, [planstand, terrein]);

  /**
   * Een gebouw zelf verzet: een nieuwe plaats, of een wijziging van waar het
   * nu staat. Wat de andere gebouwen nu tonen, wordt hun plaats: zo springt er
   * niets weg.
   */
  function verzetGebouw(id: number, wijzig: (huidig: Plaatsing) => Plaatsing) {
    const huidig = plaatsingenRef.current.get(id);
    if (!huidig) return;
    const nieuw = wijzig(huidig);
    setPlaatsen(new Map(plaatsingenRef.current).set(id, { ...nieuw, hoek: genormaliseerd(nieuw.hoek) }));
    setVerzet((alle) => new Set(alle).add(id));
    setGevonden((alle) => {
      const zonder = new Map(alle);
      zonder.delete(id);
      return zonder;
    });
  }
  const verzetRef = useRef(verzetGebouw);
  verzetRef.current = verzetGebouw;

  /** Een stap op het terrein ten opzichte van het scherm: vooruit is van de camera weg. */
  function stapOpGrond(vooruit: number, opzij: number): [number, number] {
    const d = drie.current;
    if (!d) return [0, 0];
    const richting = new THREE.Vector3();
    d.camera.getWorldDirection(richting);
    richting.y = 0;
    // Recht van boven kijkt de camera nergens heen: dan is vooruit de bovenkant van het plan.
    if (richting.lengthSq() < 1e-6) richting.set(0, 0, -1);
    richting.normalize();
    return [richting.x * vooruit - richting.z * opzij, richting.z * vooruit + richting.x * opzij];
  }

  /** Het gekozen gebouw verschuiven, ten opzichte van het scherm. */
  function schuif(id: number, vooruit: number, opzij: number) {
    const [dx, dy] = stapOpGrond(vooruit, opzij);
    verzetGebouw(id, (p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }
  const schuifRef = useRef(schuif);
  schuifRef.current = schuif;

  /** De omgeving zelf verschuiven (ten opzichte van het scherm) of draaien (rond de woning). */
  function verzetOmgeving(wijzig: (huidig: Plaatsing) => Plaatsing) {
    const huidig = omgevingsplaatsRef.current;
    if (!huidig) return;
    const nieuw = wijzig(huidig);
    setOmgevingsplaats({ ...nieuw, hoek: genormaliseerd(nieuw.hoek) });
    setOmgevingsbron({ soort: "hand" });
  }
  function schuifOmgeving(vooruit: number, opzij: number) {
    const [dx, dy] = stapOpGrond(vooruit, opzij);
    verzetOmgeving((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }
  const schuifOmgevingRef = useRef(schuifOmgeving);
  schuifOmgevingRef.current = schuifOmgeving;
  function draaiOmgeving(graden: number) {
    const huis = plaatsingenRef.current.get(model.gebouwen[0]?.id ?? -1);
    verzetOmgeving((p) => {
      const [mx, my] = huis ? [huis.x, huis.y] : [p.x, p.y];
      const r = (graden * Math.PI) / 180;
      const [c, z] = [Math.cos(r), Math.sin(r)];
      return { x: mx + c * (p.x - mx) - z * (p.y - my), y: my + z * (p.x - mx) + c * (p.y - my), hoek: p.hoek + graden };
    });
  }

  async function bewaarOmgeving() {
    if (!omgeving || !omgevingsplaats) return;
    const georef = georefVanPlaatsing(omgevingsplaats, omgeving.punt);
    setBezig(true);
    const uitkomst = await bewaarOmgevingActie(huisId, georef).catch(() => null);
    setBezig(false);
    setMelding(
      !uitkomst
        ? { soort: "fout", tekst: "Geen verbinding met de app." }
        : uitkomst.ok
          ? { soort: "goed", tekst: "Omgeving bewaard." }
          : { soort: "fout", tekst: uitkomst.melding },
    );
    if (!uitkomst?.ok) return;
    setBewaardeGeoref(georef);
    setOmgevingsbron({ soort: "bewaard" });
  }

  /** Een ander plan, of geen: terug naar wat bewaard is, of alles opnieuw zoeken. */
  function kiesPlan(id: number | null) {
    const terug = id === bewaardPlan.planId;
    setPlanId(id);
    setPlaatsen(terug ? bewaardePlaatsen : new Map());
    setSchaal(terug ? bewaardPlan.schaal : null);
    setSchaalbron(terug && bewaardPlan.schaal !== null ? "bewaard" : null);
    setGevonden(new Map());
    setVerzet(new Set());
    setNietGevonden(new Set());
  }

  /** Een andere schaal: de gebouwen blijven op hun plek op het plan. */
  function zetSchaal(tekst: string) {
    setSchaaltekst(null);
    const nieuw = Math.round(Number(tekst.replace(",", ".")));
    if (!Number.isFinite(nieuw) || nieuw < 10 || nieuw > 5000 || nieuw === schaal) return;
    setPlaatsen((huidig) => herschaald(huidig, nieuw / (schaal ?? STANDAARDSCHAAL)));
    setSchaal(nieuw);
    setSchaalbron("hand");
  }

  async function bewaarInplanting() {
    const bewaren = new Map(model.gebouwen.flatMap((g) => (plaatsingen.has(g.id) ? [[g.id, plaatsingen.get(g.id)!] as const] : [])));
    // Met een plan altijd een schaal: zo staat alles na het herladen precies hetzelfde.
    const vraag = {
      planId,
      schaal: planId !== null ? (schaal ?? STANDAARDSCHAAL) : null,
      plaatsen: [...bewaren].map(([gebouwId, plaats]) => ({ gebouwId, plaats })),
    };
    setBezig(true);
    const uitkomst = await bewaarInplantingActie(huisId, vraag).catch(() => null);
    setBezig(false);
    setMelding(
      !uitkomst
        ? { soort: "fout", tekst: "Geen verbinding met de app." }
        : uitkomst.ok
          ? { soort: "goed", tekst: "Inplanting bewaard." }
          : { soort: "fout", tekst: uitkomst.melding },
    );
    if (!uitkomst?.ok) return;
    setBewaardPlan({ planId: vraag.planId, schaal: vraag.schaal });
    setBewaardePlaatsen(bewaren);
    setPlaatsen(bewaren);
    setSchaal(vraag.schaal);
    setGevonden(new Map());
    setVerzet(new Set());
  }

  // Meubels en toestellen: plaatsen, slepen, draaien en bewaren (zie inrichten.tsx).
  const inrichting = useInrichten(drie, {
    aan: gereedschap === "inrichten",
    huisId,
    model,
    bewaard: gegevens.stukken,
    lagen,
    grond: Math.min(0, ...model.verdiepingen.map((v) => v.z0)) - 0.24,
    meld: setMelding,
  });
  const inrichtingRef = useRef(inrichting);
  inrichtingRef.current = inrichting;

  // Wat wandelen nodig heeft: per verdieping de muren, de gaten in de vloer, de trappen naar boven en de meubels.
  const wereld: Wandelverdieping[] = useMemo(
    () =>
      model.verdiepingen.map((v) => ({
        id: v.id,
        gebouwId: v.gebouwId,
        z0: v.z0,
        muren: v.muren.map((m) => m.veelhoek),
        gaten: v.plaat.veelhoeken.flatMap((veelhoek) => veelhoek.slice(1).map((ring) => [ring])),
        trappen: v.trappen,
        obstakels: obstakels(inrichting.stukken.filter((s) => s.verdiepingId === v.id)),
      })),
    [model, inrichting.stukken],
  );
  const wereldRef = useRef(wereld);
  wereldRef.current = wereld;

  // Een ander materiaal uitproberen: enkel de kleuren en texturen.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    for (const [sleutel, m] of d.materialen) werkMateriaalBij(sleutel, m, gegevens.materialen, proef, d.texturen);
  }, [proef, gegevens.materialen]);

  // Wat er te zien is: de lagen, en de doorsnede.
  useEffect(() => {
    const d = drie.current;
    if (!d?.opgebouwd) return;
    for (const [id, groep] of d.opgebouwd.verdiepingen) groep.visible = isAan(lagen, `verdieping:${id}`);
    // Tijdens het wandelen blijft het dak: anders zie je op de bovenste verdieping de lucht.
    for (const dak of d.opgebouwd.daken) dak.visible = isAan(lagen, "daken") || modus === "wandel";
    for (const punt of d.punten) punt.visible = isAan(lagen, `punten:${punt.userData.categorie}`);
    for (const leiding of d.leidingenscene?.objecten ?? []) {
      leiding.visible = isAan(lagen, `leidingen:${leiding.userData.soort}`);
      for (const deel of leiding.children) if (deel.userData.doorzicht) deel.visible = isAan(lagen, "hulp:doorzicht");
    }
    // Tijdens het inrichten is alles boven het plafond van de verdieping weg: zo kijk je in de ruimtes.
    d.snede.constant = Math.min(doorsnede ?? 1000, inrichting.snede ?? 1000);
  }, [lagen, doorsnede, model, modus, gegevens.punten, gegevens.leidingen, inrichting.snede]);

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

  // Gebouwen verplaatsen: een gebouw slepen over de grond. Elders slepen draait de camera zoals altijd.
  useEffect(() => {
    if (!verplaatsen || modus !== "rond") return;
    const d = drie.current;
    if (!d) return;
    const doel = d.renderer.domElement;
    const straal = new THREE.Raycaster();
    const vloer = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let sleep: { id: number; pointer: number; begin: THREE.Vector3; van: Plaatsing; naar: Plaatsing | null } | null = null;
    const richt = (e: PointerEvent) => richtStraal(straal, e, doel, d.camera);
    const druk = (e: PointerEvent) => {
      if (e.button !== 0 || !d.opgebouwd) return;
      richt(e);
      // Enkel wat je ziet: geen verborgen verdieping, niets boven de doorsnede.
      let object: THREE.Object3D | null = zichtbareRaak(straal, [...d.opgebouwd.gebouwen.values()], d.snede)[0]?.object ?? null;
      while (object && object.userData.gebouwId === undefined) object = object.parent;
      const id = object?.userData.gebouwId as number | undefined;
      const van = id === undefined ? undefined : plaatsingenRef.current.get(id);
      const begin = straal.ray.intersectPlane(vloer, new THREE.Vector3());
      if (id === undefined || !van || !begin) return;
      // Dit is voor het gebouw, niet voor de camera.
      e.stopImmediatePropagation();
      d.controls.enabled = false;
      doel.setPointerCapture(e.pointerId);
      sleep = { id, pointer: e.pointerId, begin, van, naar: null };
      setGekozen(id);
    };
    const beweeg = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      richt(e);
      const nu = straal.ray.intersectPlane(vloer, new THREE.Vector3());
      if (!nu) return;
      sleep.naar = { ...sleep.van, x: sleep.van.x + nu.x - sleep.begin.x, y: sleep.van.y + nu.z - sleep.begin.z };
      // Tijdens het slepen enkel de groep; de rest pas bij het loslaten.
      const groep = d.opgebouwd?.gebouwen.get(sleep.id);
      if (groep) plaats(groep, sleep.naar);
    };
    const los = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      const { id, naar } = sleep;
      sleep = null;
      d.controls.enabled = true;
      if (naar) verzetRef.current(id, () => naar);
    };
    doel.addEventListener("pointerdown", druk, { capture: true });
    doel.addEventListener("pointermove", beweeg);
    doel.addEventListener("pointerup", los);
    doel.addEventListener("pointercancel", los);
    return () => {
      doel.removeEventListener("pointerdown", druk, { capture: true });
      doel.removeEventListener("pointermove", beweeg);
      doel.removeEventListener("pointerup", los);
      doel.removeEventListener("pointercancel", los);
      d.controls.enabled = true;
    };
  }, [verplaatsen, modus]);

  // Het gekozen gebouw met de pijltjes verschuiven: 10 cm, met Shift 1 m.
  useEffect(() => {
    if (!verplaatsen || modus !== "rond" || gekozen === null) return;
    const toets = (e: KeyboardEvent) => {
      const veld = (e.target as HTMLElement | null)?.tagName;
      if (veld === "INPUT" || veld === "SELECT" || veld === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const stap = e.shiftKey ? 1 : 0.1;
      const richting: Record<string, [number, number]> = { ArrowUp: [stap, 0], ArrowDown: [-stap, 0], ArrowLeft: [0, -stap], ArrowRight: [0, stap] };
      const [vooruit, opzij] = richting[e.key] ?? [0, 0];
      if (!vooruit && !opzij) return;
      e.preventDefault();
      schuifRef.current(gekozen, vooruit, opzij);
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [verplaatsen, modus, gekozen]);

  // De omgeving verschuiven: slepen over de grond schuift de hele omgeving mee.
  useEffect(() => {
    if (!omgevingVerplaatsen || modus !== "rond") return;
    const d = drie.current;
    if (!d) return;
    const doel = d.renderer.domElement;
    const straal = new THREE.Raycaster();
    const vloer = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let sleep: { pointer: number; begin: THREE.Vector3; van: Plaatsing; naar: Plaatsing | null } | null = null;
    const opGrond = (e: PointerEvent) => {
      richtStraal(straal, e, doel, d.camera);
      return straal.ray.intersectPlane(vloer, new THREE.Vector3());
    };
    const druk = (e: PointerEvent) => {
      const van = omgevingsplaatsRef.current;
      const begin = e.button === 0 ? opGrond(e) : null;
      if (!van || !begin) return;
      e.stopImmediatePropagation();
      d.controls.enabled = false;
      doel.setPointerCapture(e.pointerId);
      sleep = { pointer: e.pointerId, begin, van, naar: null };
    };
    const beweeg = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      const nu = opGrond(e);
      if (!nu) return;
      sleep.naar = { ...sleep.van, x: sleep.van.x + nu.x - sleep.begin.x, y: sleep.van.y + nu.z - sleep.begin.z };
      if (d.omgeving) plaats(d.omgeving.groep, sleep.naar);
    };
    const los = (e: PointerEvent) => {
      if (!sleep || e.pointerId !== sleep.pointer) return;
      const { naar } = sleep;
      sleep = null;
      d.controls.enabled = true;
      if (naar) {
        setOmgevingsplaats(naar);
        setOmgevingsbron({ soort: "hand" });
      }
    };
    doel.addEventListener("pointerdown", druk, { capture: true });
    doel.addEventListener("pointermove", beweeg);
    doel.addEventListener("pointerup", los);
    doel.addEventListener("pointercancel", los);
    const toets = (e: KeyboardEvent) => {
      const veld = (e.target as HTMLElement | null)?.tagName;
      if (veld === "INPUT" || veld === "SELECT" || veld === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const stap = e.shiftKey ? 1 : 0.1;
      const richting: Record<string, [number, number]> = { ArrowUp: [stap, 0], ArrowDown: [-stap, 0], ArrowLeft: [0, -stap], ArrowRight: [0, stap] };
      const [vooruit, opzij] = richting[e.key] ?? [0, 0];
      if (!vooruit && !opzij) return;
      e.preventDefault();
      schuifOmgevingRef.current(vooruit, opzij);
    };
    window.addEventListener("keydown", toets);
    return () => {
      doel.removeEventListener("pointerdown", druk, { capture: true });
      doel.removeEventListener("pointermove", beweeg);
      doel.removeEventListener("pointerup", los);
      doel.removeEventListener("pointercancel", los);
      window.removeEventListener("keydown", toets);
      d.controls.enabled = true;
    };
  }, [omgevingVerplaatsen, modus]);

  // Het gekozen gebouw krijgt een oranje omtrek, die meeschuift en altijd te zien is.
  useEffect(() => {
    const d = drie.current;
    const groep = verplaatsen && gekozen !== null ? d?.opgebouwd?.eigen.get(gekozen) : undefined;
    const gebouw = zoekgebouwen.find((g) => g.id === gekozen);
    if (!groep || !gebouw) return;
    const materiaal = new THREE.LineBasicMaterial({ color: "#ea580c", depthTest: false });
    const lijnen = gebouw.voetafdruk.map((veelhoek) => {
      const lijn = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(veelhoek[0].map(([x, y]) => new THREE.Vector3(x, 0.05, y))), materiaal);
      lijn.renderOrder = 10;
      groep.add(lijn);
      return lijn;
    });
    return () => {
      for (const lijn of lijnen) {
        groep.remove(lijn);
        lijn.geometry.dispose();
      }
      materiaal.dispose();
    };
  }, [verplaatsen, gekozen, zoekgebouwen, model]);

  // Het meetlint: de hoeken van de gebouwen en de buren kleven; een tik raakt ook de grond.
  const meetlint = useMeten(drie, {
    aan: gereedschap === "meten",
    tonen: isAan(lagen, "hulp:maten"),
    wortels: () => {
      const d = drie.current;
      return d ? [d.opgebouwd?.wortel, d.omgeving?.groep].filter((o): o is THREE.Group => o !== undefined) : [];
    },
    doelen: () => {
      const d = drie.current;
      if (!d) return [];
      const doelen: (THREE.Object3D | null | undefined)[] = [d.opgebouwd?.wortel, d.omgeving?.groep, d.plan, d.grond];
      return doelen.filter((o): o is THREE.Object3D => o !== null && o !== undefined);
    },
  });
  const meetlintRef = useRef(meetlint);
  meetlintRef.current = meetlint;

  // Een punt aantikken: een label op het beeld, en in het paneel wat het is.
  const [gekozenPunt, setGekozenPunt] = useState<number | null>(null);
  useTik(drie, gereedschap === "kijken", (e) => {
    const d = drie.current;
    if (!d) return;
    const doelen = [d.opgebouwd?.wortel, d.omgeving?.groep].filter((o): o is THREE.Group => o !== undefined);
    setGekozenPunt(puntBijTik(d.punten, doelen, { x: e.clientX, y: e.clientY }, d.camera, d.renderer.domElement, d.snede));
  });
  useEffect(() => {
    const object = drie.current?.punten.find((o) => o.userData.puntId === gekozenPunt);
    const punt = gegevens.punten.find((p) => p.id === gekozenPunt);
    if (!object || !punt) return;
    const element = document.createElement("div");
    element.className = "drie-puntlabel";
    element.textContent = `${punt.code} · ${punt.naam}${punt.aantal > 1 ? ` (${punt.aantal}×)` : ""}`;
    const label = new CSS2DObject(element);
    // Net boven het symbool.
    label.center.set(0.5, 1.5);
    object.add(label);
    return () => {
      object.remove(label);
    };
  }, [gekozenPunt, gegevens.punten, model]);

  // Volledig scherm: de pagina eronder scrolt niet mee.
  useEffect(() => {
    if (!volledig) return;
    const vorige = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorige;
    };
  }, [volledig]);

  // Esc: eerst een begonnen maat of een gekozen meubel weg, dan terug naar kijken, dan uit het volledig scherm.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (meetlintRef.current.breekAf()) return;
      if (inrichtingRef.current.breekAf()) return;
      if (gereedschap !== "kijken") setGereedschap("kijken");
      else setVolledig(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [gereedschap]);

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

  /** Het beeld als PNG, met de labels van de maten erop getekend. */
  function beeld() {
    const d = drie.current;
    if (!d) return;
    d.renderer.render(d.scene, d.camera);
    const bron = d.renderer.domElement;
    const doek = document.createElement("canvas");
    doek.width = bron.width;
    doek.height = bron.height;
    const ctx = doek.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bron, 0, 0);
    meetlint.tekenLabels(ctx, bron.width / Math.max(1, bron.clientWidth));
    const link = document.createElement("a");
    link.href = doek.toDataURL("image/png");
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
  // Verdiepingen met een verdieping erboven, waarvan de omzetting nog geen trappen zocht, of het bordes nog niet goed las.
  const ouderdanTrappen = gegevens.verdiepingen.filter(
    (v) =>
      v.omgezet &&
      v.werkwijze !== null &&
      v.werkwijze < 4 &&
      model.verdiepingen.some((b) => b.gebouwId === v.gebouwId && b.z0 > (model.verdiepingen.find((x) => x.id === v.id)?.z0 ?? Infinity)),
  );
  const metTrappen = model.verdiepingen.filter((v) => v.trappen.length > 0 || (standen.get(v.id) ?? []).some((s) => s.geen));
  const veranderd = (id: number) => JSON.stringify(standen.get(id) ?? []) !== JSON.stringify(bewaardeStanden.get(id) ?? []);

  const hoogste = Math.max(3, ...model.verdiepingen.map((v) => v.z1 + 0.3));
  const laagste = Math.min(0, ...model.verdiepingen.map((v) => v.z0));

  const gebouwnaam = (id: number) => gegevens.gebouwen.find((g) => g.id === id)?.naam ?? "Gebouw";
  function plaatsuitleg(id: number): string {
    const overeenkomst = gevonden.get(id);
    if (overeenkomst !== undefined) {
      return `automatisch geplaatst, ${Math.round(overeenkomst * 100)}% overeenkomst${overeenkomst < OVERTUIGEND ? ". Kijk het na" : ""}.`;
    }
    if (verzet.has(id)) return "zelf verplaatst.";
    if (nietGevonden.has(id)) return "niet gevonden op het plan. Zet het zelf op zijn plaats.";
    if (bewaardePlaatsen.has(id) && plaatsen.get(id) === bewaardePlaatsen.get(id)) return "staat waar het bewaard werd.";
    return "nog geen plaats.";
  }
  // Nog nooit iets bewaard en niets gedaan: dan hoeft er ook niets bewaard te worden.
  const nietsBewaard = bewaardePlaatsen.size === 0 && bewaardPlan.planId === null;
  const inplantingVeranderd = nietsBewaard
    ? planId !== null || verzet.size > 0 || gevonden.size > 0
    : planId !== bewaardPlan.planId ||
      (planId !== null && (schaal ?? STANDAARDSCHAAL) !== bewaardPlan.schaal) ||
      model.gebouwen.some((g) => {
        const nu = plaatsingen.get(g.id);
        const toen = bewaardePlaatsen.get(g.id);
        return !nu || !toen || Math.abs(nu.x - toen.x) > 0.001 || Math.abs(nu.y - toen.y) > 0.001 || Math.abs(genormaliseerd(nu.hoek - toen.hoek)) > 0.01;
      });
  const keuze = gekozen !== null ? plaatsingen.get(gekozen) : undefined;

  const omgevingsuitleg =
    omgevingsbron?.soort === "bewaard"
      ? "Ligt zoals bewaard."
      : omgevingsbron?.soort === "plan"
        ? `Op het plan gelegd: ons perceel valt voor ${Math.round((omgevingsbron.overeenkomst ?? 0) * 100)}% op het perceel van het inplantingsplan.`
        : omgevingsbron?.soort === "huis"
          ? "Het adrespunt ligt op de woning, met het noorden naar boven. Verschuif en draai de omgeving tot de luchtfoto op het plan valt."
          : omgevingsbron?.soort === "hand"
            ? "Zelf verschoven."
            : "De omgeving op het plan leggen…";
  const omgevingVeranderd =
    omgeving !== null &&
    omgevingsplaats !== null &&
    (() => {
      if (!bewaardeGeoref) return true;
      const toen = plaatsingVanGeoref(bewaardeGeoref, omgeving.punt);
      return Math.hypot(toen.x - omgevingsplaats.x, toen.y - omgevingsplaats.y) > 0.001 || Math.abs(genormaliseerd(toen.hoek - omgevingsplaats.hoek)) > 0.01;
    })();
  // Het ware noorden en de plaats, voor de zon en de noordpijl: uit de omgeving zoals ze nu ligt, of zoals bewaard.
  const noorden = useMemo(() => {
    if (omgeving && omgevingsplaats) {
      const georef = georefVanPlaatsing(omgevingsplaats, omgeving.punt);
      return noordenVan({ georef, punt: omgeving.punt, soort: omgevingsbron?.soort ?? "hand" }, omgeving.punt);
    }
    if (bewaardeGeoref) {
      const punt: Lambert = [bewaardeGeoref.x, bewaardeGeoref.y];
      return noordenVan({ georef: bewaardeGeoref, punt, soort: "bewaard" }, punt);
    }
    return noordenVan(null, omgeving?.punt ?? null);
  }, [omgeving, omgevingsplaats, omgevingsbron, bewaardeGeoref]);

  const lagengroepen = useMemo(
    () =>
      lagenVan({
        verdiepingen: model.verdiepingen.map((v) => ({ id: v.id, naam: v.naam })),
        daken: model.daken.length > 0 || model.verdiepingen.some((v) => v.dakplaat !== null),
        inplantingsplan: geladen !== null,
        omgeving: omgeving !== null,
        punten: CATEGORIEEN.filter((categorie) => gegevens.punten.some((punt) => punt.categorie === categorie)).map((categorie) => ({
          categorie,
          naam: CATEGORIENAMEN[categorie],
          kleur: CATEGORIEKLEUREN[categorie],
        })),
        inrichting: INRICHTINGSLAGEN.filter((laag) => inrichting.stukken.some((s) => laagVan(s.soort) === laag)).map((laag) => ({
          laag,
          naam: INRICHTINGSLAAGNAMEN[laag],
        })),
        leidingen: LEIDINGSOORTEN.filter((s) => gegevens.leidingen.some((l) => l.soort === s.soort)),
      }),
    [model, geladen, omgeving, gegevens.punten, inrichting.stukken, gegevens.leidingen],
  );

  // Het gekozen punt: in welke ruimte, en de plafondhoogte voor "aan het plafond".
  const puntInfo = (() => {
    const punt = gegevens.punten.find((p) => p.id === gekozenPunt);
    const verdieping = gegevens.verdiepingen.find((v) => v.id === punt?.verdiepingId);
    if (!punt || !verdieping) return null;
    const ruimtes = verdieping.ruimtes.map((r) => ({ id: r.id, naam: r.naam, veelhoek: r.ringen }));
    const ruimteId = ruimteVan({ x_m: punt.x, y_m: punt.y }, ruimtes);
    return {
      punt,
      verdieping: verdieping.naam,
      ruimte: ruimtes.find((r) => r.id === ruimteId)?.naam ?? null,
      plafond: verdieping.plafondhoogte,
    };
  })();

  /** Een gereedschap aan, of weer uit als het al aan stond. */
  const wissel = (welk: Gereedschap) => setGereedschap((huidig) => (huidig === welk ? "kijken" : welk));

  const draaiknop = (graden: number, tekst: string, uitleg: string) => (
    <button type="button" className="stil" title={uitleg} onClick={() => draaiOmgeving(graden)}>
      {tekst}
    </button>
  );

  return (
    <div className={`drie-scherm${volledig ? " volledig" : ""}${paneel ? "" : " zonder-paneel"}`}>
      <div className="drie-beeld">
        <div className="drie-raam">
          <div
            ref={vak}
            className={`drie-vak${modus === "wandel" ? " wandel" : ""}${gereedschap === "meten" || (gereedschap === "inrichten" && inrichting.nieuw) ? " meten" : ""}`}
          />
          <div className="drie-links" role="group" aria-label="Gereedschap">
            <button
              type="button"
              className="drie-knop"
              aria-pressed={gereedschap === "meten"}
              title={gereedschap === "meten" ? "Stoppen met meten (Esc)" : "Meten: tik een begin en een einde"}
              onClick={() => wissel("meten")}
            >
              {gereedschap === "meten" ? "Klaar met meten" : "Meten"}
            </button>
            {meetlint.aantal > 0 ? (
              <button type="button" className="drie-knop" title="Alle maten weghalen" onClick={meetlint.wis}>
                Wissen ({meetlint.aantal})
              </button>
            ) : null}
          </div>
          <Noordpijl kern={drie} klaar={klaar} noorden={noorden} tonen={isAan(lagen, "hulp:noorden")} />
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
          {gereedschap === "meten"
            ? meetlint.bezig
              ? "Tik het einde van de maat. Esc breekt af."
              : "Tik het begin van een maat; een tik dicht bij een hoek kleeft eraan. Slepen draait zoals altijd."
            : gereedschap === "inrichten"
            ? inrichting.nieuw
              ? inrichting.dakwerk
                ? "Tik op het dak waar het midden van het veld moet komen. Esc breekt af."
                : "Tik op de vloer waar het stuk moet komen. Esc breekt af."
              : inrichting.gekozen
                ? inrichting.dakwerk
                  ? "Sleep het veld over het dak: het volgt de helling. De pijltjes verschuiven het 5 cm (met Shift 50 cm), Delete haalt het weg."
                  : "Sleep het stuk naar zijn plaats. De pijltjes verschuiven het 5 cm (met Shift 50 cm), R draait het 15°, Delete haalt het weg."
                : "Kies een stuk in het paneel en tik op de vloer, of tik een stuk om het te verschuiven. Elders slepen draait zoals altijd."
            : modus === "wandel"
            ? "Slepen kijkt rond. Lopen met W A S D of de pijltjes, sneller met Shift, of met de knoppen."
            : verplaatsen
              ? "Sleep een gebouw naar zijn plaats; elders slepen draait. De pijltjes verschuiven het gekozen gebouw 10 cm, met Shift 1 m."
              : omgevingVerplaatsen
                ? "Slepen schuift de omgeving; rechts slepen schuift het beeld. De pijltjes verschuiven de omgeving 10 cm, met Shift 1 m."
                : "Slepen draait, rechts slepen of drie vingers schuift. Zoomen met + en −, het muiswiel of twee vingers. Tik op een punt om te zien wat het is."}
        </p>
      </div>

      <div className="omzetten-zijbalk drie-paneel" hidden={!paneel}>
        {melding ? <div className={`melding ${melding.soort}`}>{melding.tekst}</div> : null}

        {puntInfo ? (
          <section className="kaart">
            <h3>
              <span className="palet-code" style={{ background: puntInfo.punt.kleur }}>
                {puntInfo.punt.code}
              </span>{" "}
              {puntInfo.punt.naam}
            </h3>
            <ul className="inplanting-gebouwen">
              {puntInfo.punt.label ? <li>{puntInfo.punt.label}</li> : null}
              <li>
                {puntInfo.punt.aantal}× · {hoogteTekst(puntInfo.punt.hoogte, puntInfo.plafond)}
              </li>
              <li>
                {puntInfo.ruimte ?? "Buiten of zonder ruimte"} · {puntInfo.verdieping}
              </li>
              <li>{STATUSNAMEN[puntInfo.punt.status]}</li>
            </ul>
            <div className="knoppenrij">
              <a className="knop stil" href={huispad(huisId, `/punten?verdieping=${puntInfo.punt.verdiepingId}`)}>
                Naar de punten
              </a>
              <button type="button" className="stil" onClick={() => setGekozenPunt(null)}>
                Sluiten
              </button>
            </div>
          </section>
        ) : null}

        <section className="kaart">
          <h3>Bekijken</h3>
          <div className="knoppenrij">
            <button type="button" className={modus === "rond" ? "" : "stil"} onClick={() => setModus("rond")}>
              Rondkijken
            </button>
            <button
              type="button"
              className={modus === "wandel" ? "" : "stil"}
              onClick={() => {
                // Verplaatsen en inrichten kan enkel van buiten; meten blijft.
                if (verplaatsen || omgevingVerplaatsen || gereedschap === "inrichten") setGereedschap("kijken");
                setModus("wandel");
              }}
            >
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
          <h3>Lagen</h3>
          <Lagenkeuze groepen={lagengroepen} stand={lagen} zet={zetLagen} />
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

        <Inrichtkaart
          inrichting={inrichting}
          aan={gereedschap === "inrichten"}
          wissel={() => {
            setModus("rond");
            wissel("inrichten");
          }}
          verdiepingen={model.verdiepingen.map((v) => ({ id: v.id, naam: v.naam }))}
        />

        <Zonkaart kern={drie} klaar={klaar} noorden={noorden} terrein={terrein} metOmgeving={omgeving !== null && omgevingsplaats !== null} />

        {gegevens.verdiepingen.some((v) => v.omgezet) ? (
          <section className="kaart">
            <h3>Leidingen</h3>
            <p className="hulp">
              Water, afvoer, ventilatie, elektriciteit en vloerverwarming teken je op het plan. Door de muren heen zie je ze met de laag
              Leidingen door de muren.
            </p>
            <ul className="inplanting-gebouwen">
              {gegevens.verdiepingen
                .filter((v) => v.omgezet)
                .map((v) => {
                  const aantal = gegevens.leidingen.filter((l) => l.verdiepingId === v.id).length;
                  return (
                    <li key={v.id}>
                      <a href={huispad(huisId, `/punten/leidingen?verdieping=${v.id}`)}>{v.naam}</a>
                      {aantal > 0 ? <span className="hulp"> · {aantal} {aantal === 1 ? "leiding" : "leidingen"}</span> : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ) : null}

        {gegevens.verdiepingen.some((v) => v.metMuren) ? (
          <section className="kaart">
            <h3>Plan verbeteren</h3>
            <p className="hulp">Klopt een muur, raam of deur niet? Verbeter het op het plan; 3D bouwt het mee.</p>
            <ul className="inplanting-gebouwen">
              {gegevens.verdiepingen
                .filter((v) => v.metMuren)
                .map((v) => (
                  <li key={v.id}>
                    <a href={huispad(huisId, `/3d/verbeteren?verdieping=${v.id}`)}>{v.naam}</a>
                    {(v.correcties?.length ?? 0) > 0 ? <span className="hulp"> · {v.correcties?.length} verbeterd</span> : null}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <section className="kaart">
          <h3>Inplanting</h3>
          {plannen.length === 0 ? (
            <p className="hulp">
              Er is nog geen inplantingsplan. Laad het op bij <a href={huispad(huisId, "/plannen")}>Plannen</a>, als soort
              Inplantingsplan: dan zet de app de gebouwen er zelf op.
            </p>
          ) : (
            <>
              <label htmlFor="inplanting-plan">Plan</label>
              <select id="inplanting-plan" value={planId ?? ""} onChange={(g) => kiesPlan(Number(g.currentTarget.value) || null)}>
                <option value="">Geen plan</option>
                {plannen.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.titel}
                  </option>
                ))}
              </select>
              {planstand === "laden" ? <p className="hulp">Het plan lezen…</p> : null}
              {planstand === "zoeken" ? <p className="hulp">De gebouwen zoeken op het plan…</p> : null}
              {planstand === "fout" && planfout ? <p className="melding fout">{planfout}</p> : null}
              {geladen ? (
                <>
                  <div className="veldenrij" style={{ marginTop: 8 }}>
                    <div>
                      <label htmlFor="inplanting-schaal">Schaal 1/</label>
                      <input
                        id="inplanting-schaal"
                        inputMode="numeric"
                        value={schaaltekst ?? String(schaal ?? STANDAARDSCHAAL)}
                        onChange={(g) => setSchaaltekst(g.currentTarget.value)}
                        onBlur={(g) => zetSchaal(g.currentTarget.value)}
                        onKeyDown={(g) => {
                          if (g.key === "Enter") g.currentTarget.blur();
                        }}
                      />
                    </div>
                  </div>
                  <p className="hulp">{schaalbron ? SCHAALUITLEG[schaalbron] : "Geen schaal gevonden: vul ze in zoals ze op het plan staat."}</p>
                  {!planTonen ? <p className="hulp">Het plan ligt niet op de grond: zet het aan bij Lagen.</p> : null}
                </>
              ) : null}
            </>
          )}
          <ul className="inplanting-gebouwen">
            {model.gebouwen.map((g) => (
              <li key={g.id}>
                <strong>{gebouwnaam(g.id)}</strong>: {plaatsuitleg(g.id)}
              </li>
            ))}
          </ul>
          <div className="knoppenrij">
            {geladen ? (
              <button
                type="button"
                className="stil"
                disabled={planstand === "zoeken"}
                onClick={() =>
                  void zoek(
                    model.gebouwen.map((g) => g.id),
                    schaalbron === "hand" || schaalbron === "bewaard" ? schaal : null,
                  )
                }
              >
                Opnieuw automatisch plaatsen
              </button>
            ) : null}
            <button
              type="button"
              className={verplaatsen ? "" : "stil"}
              aria-pressed={verplaatsen}
              onClick={() => {
                setModus("rond");
                wissel("verplaatsen");
              }}
            >
              {verplaatsen ? "Klaar met verplaatsen" : "Gebouwen verplaatsen"}
            </button>
            <button type="button" className="stil" onClick={() => drie.current && vanBoven(drie.current, terrein)}>
              Van boven
            </button>
          </div>
          {verplaatsen ? (
            gekozen !== null && keuze ? (
              <div className="verplaatsen">
                <p>
                  <strong>{gebouwnaam(gekozen)}</strong>
                </p>
                <div className="draaiknoppen" role="group" aria-label="Draaien">
                  <button type="button" className="stil" title="Een kwartslag tegen de klok in" onClick={() => verzetGebouw(gekozen, (p) => ({ ...p, hoek: p.hoek - 90 }))}>
                    ⟲ 90°
                  </button>
                  <button type="button" className="stil" title="1° tegen de klok in" onClick={() => verzetGebouw(gekozen, (p) => ({ ...p, hoek: p.hoek - 1 }))}>
                    ⟲ 1°
                  </button>
                  <input
                    aria-label="Hoek in graden, met de klok mee"
                    inputMode="decimal"
                    value={hoektekst ?? String(Math.round(keuze.hoek * 10) / 10).replace(".", ",")}
                    onChange={(g) => setHoektekst(g.currentTarget.value)}
                    onBlur={(g) => {
                      const hoek = Number(g.currentTarget.value.replace(",", "."));
                      setHoektekst(null);
                      if (Number.isFinite(hoek)) verzetGebouw(gekozen, (p) => ({ ...p, hoek }));
                    }}
                    onKeyDown={(g) => {
                      if (g.key === "Enter") g.currentTarget.blur();
                    }}
                  />
                  <button type="button" className="stil" title="1° met de klok mee" onClick={() => verzetGebouw(gekozen, (p) => ({ ...p, hoek: p.hoek + 1 }))}>
                    ⟳ 1°
                  </button>
                  <button type="button" className="stil" title="Een kwartslag met de klok mee" onClick={() => verzetGebouw(gekozen, (p) => ({ ...p, hoek: p.hoek + 90 }))}>
                    ⟳ 90°
                  </button>
                </div>
                <div className="pijlknoppen" role="group" aria-label="Verschuiven per 10 cm">
                  <button type="button" className="stil" title="10 cm omhoog op het scherm" onClick={() => schuif(gekozen, 0.1, 0)}>
                    ↑
                  </button>
                  <button type="button" className="stil" title="10 cm naar links" onClick={() => schuif(gekozen, 0, -0.1)}>
                    ←
                  </button>
                  <button type="button" className="stil" title="10 cm omlaag op het scherm" onClick={() => schuif(gekozen, -0.1, 0)}>
                    ↓
                  </button>
                  <button type="button" className="stil" title="10 cm naar rechts" onClick={() => schuif(gekozen, 0, 0.1)}>
                    →
                  </button>
                </div>
              </div>
            ) : (
              <p className="hulp">Tik op een gebouw om het te kiezen, en sleep het naar zijn plaats.</p>
            )
          ) : null}
          {inplantingVeranderd ? (
            <div className="knoppenrij">
              <button type="button" disabled={bezig} onClick={() => void bewaarInplanting()}>
                Inplanting bewaren
              </button>
              {!nietsBewaard ? (
                <button type="button" className="stil" onClick={() => kiesPlan(bewaardPlan.planId)}>
                  Herbeginnen
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="kaart">
          <h3>Omgeving</h3>
          {!gegevens.omgeving.metAdres ? (
            <p className="hulp">
              Vul het adres in bij <a href={huispad(huisId, "")}>Overzicht</a>: dan toont de app de percelen, de huizen van de buren en de
              luchtfoto, uit de gegevens van Digitaal Vlaanderen.
            </p>
          ) : omgevingstand === "laden" ? (
            <p className="hulp">De omgeving ophalen bij Digitaal Vlaanderen…</p>
          ) : omgevingstand === "fout" ? (
            <p className="melding fout">{omgevingsfout}</p>
          ) : (
            <>
              <p className="hulp">{omgevingsuitleg} De luchtfoto, de grenzen en de buren zet je aan en uit bij Lagen.</p>
              <div className="knoppenrij">
                <button
                  type="button"
                  className={omgevingVerplaatsen ? "" : "stil"}
                  aria-pressed={omgevingVerplaatsen}
                  disabled={!omgevingsplaats}
                  onClick={() => {
                    setModus("rond");
                    wissel("omgeving");
                  }}
                >
                  {omgevingVerplaatsen ? "Klaar met verschuiven" : "Omgeving verschuiven en draaien"}
                </button>
                {geladen && omgeving ? (
                  <button type="button" className="stil" disabled={planstand === "zoeken"} onClick={() => void legOmgeving(omgeving)}>
                    Opnieuw op het plan leggen
                  </button>
                ) : null}
              </div>
              {omgevingVerplaatsen ? (
                <div className="verplaatsen">
                  <div className="draaiknoppen omgeving" role="group" aria-label="Draaien rond de woning">
                    {draaiknop(-90, "⟲ 90°", "Een kwartslag tegen de klok in, rond de woning")}
                    {draaiknop(-1, "⟲ 1°", "1° tegen de klok in")}
                    {draaiknop(-0.1, "⟲ 0,1°", "0,1° tegen de klok in")}
                    {draaiknop(0.1, "⟳ 0,1°", "0,1° met de klok mee")}
                    {draaiknop(1, "⟳ 1°", "1° met de klok mee")}
                    {draaiknop(90, "⟳ 90°", "Een kwartslag met de klok mee, rond de woning")}
                  </div>
                  <div className="pijlknoppen" role="group" aria-label="De omgeving verschuiven per 10 cm">
                    <button type="button" className="stil" title="10 cm omhoog op het scherm" onClick={() => schuifOmgeving(0.1, 0)}>
                      ↑
                    </button>
                    <button type="button" className="stil" title="10 cm naar links" onClick={() => schuifOmgeving(0, -0.1)}>
                      ←
                    </button>
                    <button type="button" className="stil" title="10 cm omlaag op het scherm" onClick={() => schuifOmgeving(-0.1, 0)}>
                      ↓
                    </button>
                    <button type="button" className="stil" title="10 cm naar rechts" onClick={() => schuifOmgeving(0, 0.1)}>
                      →
                    </button>
                  </div>
                </div>
              ) : null}
              {omgevingVeranderd ? (
                <div className="knoppenrij">
                  <button type="button" disabled={bezig} onClick={() => void bewaarOmgeving()}>
                    Omgeving bewaren
                  </button>
                  {bewaardeGeoref && omgeving ? (
                    <button
                      type="button"
                      className="stil"
                      onClick={() => {
                        setOmgevingsplaats(plaatsingVanGeoref(bewaardeGeoref, omgeving.punt));
                        setOmgevingsbron({ soort: "bewaard" });
                      }}
                    >
                      Herbeginnen
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="hulp">Bron: Digitaal Vlaanderen (GRB en orthofoto).</p>
            </>
          )}
        </section>

        {metTrappen.length > 0 || ouderdanTrappen.length > 0 ? (
          <section className="kaart">
            <h3>Trappen</h3>
            {ouderdanTrappen.map((v) => (
              <p key={v.id} className="hulp">
                {v.naam} werd omgezet vóór de app {v.werkwijze !== null && v.werkwijze >= 3 ? "het bordes van een trap goed las" : "trappen las"}.{" "}
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
