"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { DAKNAMEN, DAKTYPES, type Dakinstelling } from "@/lib/bouw/drie/dakregels";
import type { Driegegevens } from "@/lib/bouw/drie/laden";
import { SLOTNAMEN, STANDAARDKLEUREN, materiaalVan, type Slot } from "@/lib/bouw/drie/materialen";
import { maakModel, type Model3d } from "@/lib/bouw/drie/model";
import { binnenVeelhoeken } from "@/lib/bouw/drie/vlak";
import { zwaartepunt, oppervlakte } from "@/lib/bouw/omzetting/geometrie";

import { bewaarDakActie } from "./acties";
import { bouwScene, type Opgebouwd, type Sleutel } from "./scene";

type Modus = "rond" | "wandel";

const OOGHOOGTE = 1.6;
const STRAAL = 0.2;

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

const VASTE_KLEUREN: Record<string, string> = {
  muurtop: STANDAARDKLEUREN.muurtop,
  plaat: STANDAARDKLEUREN.plaat,
  plafond: STANDAARDKLEUREN.plafond,
  dakrand: STANDAARDKLEUREN.dakrand,
  glas: STANDAARDKLEUREN.glas,
};

export default function Drie({ gegevens }: { gegevens: Driegegevens }) {
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

  const model: Model3d = useMemo(
    () =>
      maakModel(
        gegevens.gebouwen.map((g) => ({ id: g.id, dak: daken.get(g.id) ?? g.dak })),
        gegevens.verdiepingen,
      ),
    [gegevens, daken],
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
    punten: THREE.Group;
    ingekaderd: boolean;
    wandel: { x: number; y: number; z: number; kijk: number; op: number; toetsen: Set<string>; verdieping: number | null };
  } | null>(null);
  // De lus van three.js en het bouwen lezen de laatste stand uit refs, niet uit een oude render.
  const proefRef = useRef(proef);
  proefRef.current = proef;
  const modelRef = useRef(model);
  modelRef.current = model;

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

    const punten = new THREE.Group();
    scene.add(punten);

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
      punten,
      ingekaderd: false,
      wandel: { x: 0, y: 0, z: 0, kijk: 0, op: 0, toetsen: new Set(), verdieping: null },
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
      if (d.wandel.verdieping !== null) stap(d, modelRef.current, dt);
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
    const opgebouwd = bouwScene(model, materiaal);
    d.scene.add(opgebouwd.wortel);
    d.opgebouwd = opgebouwd;

    const { x0, y0, x1, y1, z1 } = model.kader;
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
      d.camera.position.set(midden.x + grootte * 0.9, midden.y + grootte * 0.85, midden.z + grootte * 1.15);
      d.controls.target.copy(midden);
      d.ingekaderd = true;
    }

    // De punten, bij hun verdieping zodat ze mee verdwijnen.
    d.punten.clear();
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
      const [dx, dy] = verdieping.verschuiving;
      mesh.position.set(punt.x + dx, verdieping.z0 + (punt.hoogte ?? verdieping.plafond - 0.04), punt.y + dy);
      mesh.userData.verdieping = punt.verdiepingId;
      d.punten.add(mesh);
    }
  }, [model, materiaal, gegevens.punten]);

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
    d.opgebouwd.daken.visible = dakenTonen || modus === "wandel";
    d.punten.visible = puntenTonen;
    for (const punt of d.punten.children) punt.visible = !verborgen.has(punt.userData.verdieping as number);
    d.snede.constant = doorsnede ?? 1000;
  }, [verborgen, dakenTonen, puntenTonen, doorsnede, model, modus]);

  // Rondwandelen: de camera op ooghoogte in de grootste ruimte van een verdieping.
  useEffect(() => {
    const d = drie.current;
    if (!d) return;
    if (modus !== "wandel") {
      d.wandel.verdieping = null;
      d.controls.enabled = true;
      return;
    }
    const verdieping = model.verdiepingen.find((v) => v.id === wandelOp) ?? model.verdiepingen[0];
    if (!verdieping) return;
    const grootste = [...verdieping.vloeren].sort((a, b) => Math.abs(oppervlakte(b.ringen[0])) - Math.abs(oppervlakte(a.ringen[0])))[0];
    const [x, y] = grootste ? zwaartepunt(grootste.ringen[0]) : [(model.kader.x0 + model.kader.x1) / 2, (model.kader.y0 + model.kader.y1) / 2];
    d.wandel = { ...d.wandel, x, y, z: verdieping.z0 + OOGHOOGTE, kijk: 0, op: 0, verdieping: verdieping.id };
    d.controls.enabled = false;
    d.camera.position.set(x, verdieping.z0 + OOGHOOGTE, y);
    d.camera.rotation.set(0, 0, 0, "YXZ");
  }, [modus, wandelOp, model]);

  function stap(d: NonNullable<typeof drie.current>, huidig: Model3d, dt: number) {
    const w = d.wandel;
    const verdieping = huidig.verdiepingen.find((v) => v.id === w.verdieping);
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
      const dx = (-Math.sin(w.kijk) * vooruit + Math.cos(w.kijk) * opzij) * snel * dt;
      const dy = (-Math.cos(w.kijk) * vooruit - Math.sin(w.kijk) * opzij) * snel * dt;
      const muren = verdieping?.muren.map((m) => m.veelhoek) ?? [];
      const vrij = (x: number, y: number) =>
        [0, 1, 2, 3, 4, 5, 6, 7, 8].every((k) => {
          const p: [number, number] = k === 8 ? [x, y] : [x + Math.cos((k * Math.PI) / 4) * STRAAL, y + Math.sin((k * Math.PI) / 4) * STRAAL];
          return !binnenVeelhoeken(p, muren);
        });
      if (vrij(w.x + dx, w.y + dy)) {
        w.x += dx;
        w.y += dy;
      } else if (vrij(w.x + dx, w.y)) w.x += dx;
      else if (vrij(w.x, w.y + dy)) w.y += dy;
    }
    d.camera.position.set(w.x, w.z, w.y);
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

  const knop = (toets: string, tekst: string, label: string) => (
    <button
      type="button"
      className="stil"
      aria-label={label}
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
    const uitkomst = await bewaarDakActie({ gebouwId, dak }).catch(() => null);
    setBezig(false);
    setMelding(
      !uitkomst
        ? { soort: "fout", tekst: "Geen verbinding met de app." }
        : uitkomst.ok
          ? { soort: "goed", tekst: "Dak bewaard." }
          : { soort: "fout", tekst: uitkomst.melding },
    );
  }

  const hoogste = Math.max(3, ...model.verdiepingen.map((v) => v.z1 + 0.3));
  const laagste = Math.min(0, ...model.verdiepingen.map((v) => v.z0));

  return (
    <div className="omzetten drie">
      <div>
        <div ref={vak} className={`drie-vak${modus === "wandel" ? " wandel" : ""}`} />
        {modus === "wandel" ? (
          <div className="wandelknoppen">
            {knop("arrowleft", "↺", "Naar links draaien")}
            {knop("w", "▲", "Vooruit")}
            {knop("arrowright", "↻", "Naar rechts draaien")}
            {knop("a", "◀", "Opzij naar links")}
            {knop("s", "▼", "Achteruit")}
            {knop("d", "▶", "Opzij naar rechts")}
          </div>
        ) : null}
        <p className="hulp">
          {modus === "rond"
            ? "Slepen draait, met twee vingers of het muiswiel zoom je, rechts slepen of drie vingers schuift."
            : "Slepen kijkt rond. Lopen met W A S D of de pijltjes, sneller met Shift, of met de knoppen."}
        </p>
      </div>

      <div className="omzetten-zijbalk">
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
