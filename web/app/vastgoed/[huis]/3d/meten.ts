import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

import { kleef, KLEEFAFSTAND, maattekst, uniekePunten, type Kleefkandidaat, type P3 } from "@/lib/bouw/drie/meten";

import { gesneden, richtStraal, useTik, zichtbaar, zichtbareRaak, type Kern } from "./kern";

/**
 * Het meetlint in 3D: tik een begin en een einde, en de lijn krijgt haar
 * lengte. Een tik kleeft aan een hoek van een muur, vloer of trap. De maten
 * blijven staan tot Wissen; ze zijn een laag (hulp:maten). Enkel voor de
 * browser; het rekenwerk staat in lib/bouw/drie/meten.ts.
 */

const KLEUR = "#dc2626";

interface Maat {
  a: THREE.Vector3;
  b: THREE.Vector3;
  delen: THREE.Object3D[];
}

export interface Meetlint {
  /** Hoeveel maten er staan. */
  aantal: number;
  /** Is er een begin getikt, en wacht het op een einde? */
  bezig: boolean;
  wis(): void;
  /** Breekt een begonnen maat af; false als er geen begonnen was. */
  breekAf(): boolean;
  /** De labels op een beeld tekenen, voor Beeld downloaden. `schaal`: pixels van het beeld per pixel op het scherm. */
  tekenLabels(ctx: CanvasRenderingContext2D, schaal: number): void;
}

const p3 = (v: THREE.Vector3): P3 => [v.x, v.y, v.z];

function stip(punt: THREE.Vector3, zweven = false): CSS2DObject {
  const element = document.createElement("div");
  element.className = zweven ? "drie-maatpunt zweef" : "drie-maatpunt";
  const object = new CSS2DObject(element);
  object.position.copy(punt);
  return object;
}

function vulLabel(element: HTMLElement, a: THREE.Vector3, b: THREE.Vector3) {
  const { lengte, detail } = maattekst(p3(a), p3(b));
  element.textContent = lengte;
  if (detail) {
    const klein = document.createElement("small");
    klein.textContent = detail;
    element.append(klein);
  }
}

function label(a: THREE.Vector3, b: THREE.Vector3): CSS2DObject {
  const element = document.createElement("div");
  element.className = "drie-maat";
  vulLabel(element, a, b);
  const object = new CSS2DObject(element);
  object.position.copy(a).add(b).multiplyScalar(0.5);
  return object;
}

/** Haalt een deel uit de groep en ruimt het op; een label haalt zijn element mee weg. */
function weg(groep: THREE.Group, deel: THREE.Object3D) {
  groep.remove(deel);
  if (deel instanceof THREE.Line) deel.geometry.dispose();
}

export function useMeten(
  kern: RefObject<Kern | null>,
  opties: {
    aan: boolean;
    tonen: boolean;
    /** Waarvan de hoeken kleven: de gebouwen, de buren. */
    wortels: () => THREE.Object3D[];
    /** Wat een tik kan raken: de wortels, en de grond. */
    doelen: () => THREE.Object3D[];
  },
): Meetlint {
  const { aan, tonen } = opties;
  const wortels = useRef(opties.wortels);
  wortels.current = opties.wortels;
  const doelen = useRef(opties.doelen);
  doelen.current = opties.doelen;

  const groep = useRef<THREE.Group | null>(null);
  const materialen = useRef<{ lijn: THREE.LineBasicMaterial; stippel: THREE.LineDashedMaterial } | null>(null);
  const maten = useRef<Maat[]>([]);
  const begin = useRef<{ punt: THREE.Vector3; stip: CSS2DObject } | null>(null);
  const voorbeeld = useRef<THREE.Object3D[]>([]);
  const hoeken = useRef(new WeakMap<THREE.BufferGeometry, P3[]>());
  const [aantal, setAantal] = useState(0);
  const [bezig, setBezig] = useState(false);

  // De groep met de maten, in de scène: lijnen die je altijd ziet, ook door een muur.
  useEffect(() => {
    const d = kern.current;
    if (!d) return;
    const nieuw = new THREE.Group();
    nieuw.name = "maten";
    const lijn = new THREE.LineBasicMaterial({ color: KLEUR, depthTest: false, transparent: true });
    const stippel = new THREE.LineDashedMaterial({ color: KLEUR, depthTest: false, transparent: true, dashSize: 0.12, gapSize: 0.08 });
    d.scene.add(nieuw);
    groep.current = nieuw;
    materialen.current = { lijn, stippel };
    return () => {
      for (const deel of [...nieuw.children]) weg(nieuw, deel);
      d.scene.remove(nieuw);
      lijn.dispose();
      stippel.dispose();
      groep.current = null;
      materialen.current = null;
      maten.current = [];
      begin.current = null;
      voorbeeld.current = [];
    };
  }, [kern]);

  useEffect(() => {
    if (groep.current) groep.current.visible = tonen;
  }, [tonen]);

  /** Het punt onder een tik of de muis: de hoek waaraan het kleeft, anders wat de straal raakt. */
  const puntBij = useCallback(
    (e: { clientX: number; clientY: number }): THREE.Vector3 | null => {
      const d = kern.current;
      if (!d) return null;
      const element = d.renderer.domElement;
      const straal = new THREE.Raycaster();
      richtStraal(straal, e, element, d.camera);
      const raak = zichtbareRaak(straal, doelen.current(), d.snede)[0] ?? null;
      const kader = element.getBoundingClientRect();
      const tik: [number, number] = [e.clientX - kader.left, e.clientY - kader.top];
      const kandidaten: (Kleefkandidaat & { punt: THREE.Vector3 })[] = [];
      const v = new THREE.Vector3();
      const ndc = new THREE.Vector3();
      for (const wortel of wortels.current()) {
        wortel.traverse((object) => {
          const mesh = object as THREE.Mesh;
          // Niet aan de hoeken van een symbool van een punt: enkel aan muren, vloeren en trappen.
          if (!mesh.isMesh || mesh.userData.puntId !== undefined || !zichtbaar(mesh)) return;
          let punten = hoeken.current.get(mesh.geometry);
          if (!punten) {
            punten = uniekePunten(mesh.geometry.getAttribute("position").array);
            hoeken.current.set(mesh.geometry, punten);
          }
          const snijdt = gesneden(mesh, d.snede);
          for (const p of punten) {
            v.set(p[0], p[1], p[2]).applyMatrix4(mesh.matrixWorld);
            if (snijdt && d.snede.distanceToPoint(v) < -1e-6) continue;
            ndc.copy(v).project(d.camera);
            if (ndc.z < -1 || ndc.z > 1) continue;
            const scherm: [number, number] = [((ndc.x + 1) / 2) * kader.width, ((1 - ndc.y) / 2) * kader.height];
            if (Math.abs(scherm[0] - tik[0]) > KLEEFAFSTAND || Math.abs(scherm[1] - tik[1]) > KLEEFAFSTAND) continue;
            kandidaten.push({ punt: v.clone(), scherm, diepte: v.distanceTo(d.camera.position) });
          }
        });
      }
      const i = kleef(tik, kandidaten, raak ? raak.distance : null);
      if (i >= 0) return kandidaten[i].punt;
      return raak ? raak.point.clone() : null;
    },
    [kern],
  );

  const verbergVoorbeeld = useCallback(() => {
    const g = groep.current;
    if (g) for (const deel of voorbeeld.current) weg(g, deel);
    voorbeeld.current = [];
  }, []);

  const breekAf = useCallback((): boolean => {
    const g = groep.current;
    verbergVoorbeeld();
    if (!begin.current) return false;
    if (g) weg(g, begin.current.stip);
    begin.current = null;
    setBezig(false);
    return true;
  }, [verbergVoorbeeld]);

  // Uit het meten: een begonnen maat valt weg, de maten blijven.
  useEffect(() => {
    if (!aan) breekAf();
  }, [aan, breekAf]);

  useTik(kern, aan, (e) => {
    const g = groep.current;
    const m = materialen.current;
    const punt = puntBij(e);
    if (!g || !m || !punt) return;
    verbergVoorbeeld();
    if (!begin.current) {
      const s = stip(punt);
      g.add(s);
      begin.current = { punt, stip: s };
      setBezig(true);
      return;
    }
    const a = begin.current.punt;
    weg(g, begin.current.stip);
    begin.current = null;
    setBezig(false);
    if (a.distanceTo(punt) < 0.001) return;
    const lijn = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, punt]), m.lijn);
    lijn.renderOrder = 20;
    lijn.frustumCulled = false;
    const delen = [lijn, stip(a), stip(punt), label(a, punt)];
    g.add(...delen);
    maten.current.push({ a, b: punt, delen });
    setAantal(maten.current.length);
  });

  // Met de muis: waar de tik zou kleven, en van het begin een stippellijn met de maat.
  useEffect(() => {
    const d = kern.current;
    if (!aan || !d) return;
    const element = d.renderer.domElement;
    let laatste: PointerEvent | null = null;
    let frame = 0;
    const teken = () => {
      frame = 0;
      const g = groep.current;
      const m = materialen.current;
      if (!laatste || !g || !m) return;
      verbergVoorbeeld();
      const punt = puntBij(laatste);
      if (!punt) return;
      const delen: THREE.Object3D[] = [stip(punt, true)];
      if (begin.current && begin.current.punt.distanceTo(punt) > 0.001) {
        const lijn = new THREE.Line(new THREE.BufferGeometry().setFromPoints([begin.current.punt, punt]), m.stippel);
        lijn.computeLineDistances();
        lijn.renderOrder = 20;
        lijn.frustumCulled = false;
        delen.push(lijn, label(begin.current.punt, punt));
      }
      g.add(...delen);
      voorbeeld.current = delen;
    };
    const beweeg = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons !== 0) {
        laatste = null;
        verbergVoorbeeld();
        return;
      }
      laatste = e;
      if (!frame) frame = requestAnimationFrame(teken);
    };
    const buiten = () => {
      laatste = null;
      verbergVoorbeeld();
    };
    element.addEventListener("pointermove", beweeg);
    element.addEventListener("pointerleave", buiten);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", beweeg);
      element.removeEventListener("pointerleave", buiten);
      verbergVoorbeeld();
    };
  }, [kern, aan, puntBij, verbergVoorbeeld]);

  const wis = useCallback(() => {
    const g = groep.current;
    breekAf();
    if (g) for (const maat of maten.current) for (const deel of maat.delen) weg(g, deel);
    maten.current = [];
    setAantal(0);
  }, [breekAf]);

  const tekenLabels = useCallback(
    (ctx: CanvasRenderingContext2D, schaal: number) => {
      const d = kern.current;
      if (!d || !groep.current?.visible) return;
      const element = d.renderer.domElement;
      ctx.save();
      ctx.font = `600 ${13 * schaal}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const maat of maten.current) {
        const midden = maat.a.clone().add(maat.b).multiplyScalar(0.5).project(d.camera);
        if (midden.z < -1 || midden.z > 1) continue;
        const x = ((midden.x + 1) / 2) * element.clientWidth * schaal;
        const y = ((1 - midden.y) / 2) * element.clientHeight * schaal;
        const { lengte, detail } = maattekst(p3(maat.a), p3(maat.b));
        const tekst = detail ? `${lengte} (${detail})` : lengte;
        const breedte = ctx.measureText(tekst).width + 12 * schaal;
        const hoogte = 22 * schaal;
        ctx.beginPath();
        ctx.roundRect(x - breedte / 2, y - hoogte / 2, breedte, hoogte, 4 * schaal);
        ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
        ctx.fill();
        ctx.lineWidth = schaal;
        ctx.strokeStyle = KLEUR;
        ctx.stroke();
        ctx.fillStyle = "#111827";
        ctx.fillText(tekst, x, y);
      }
      ctx.restore();
    },
    [kern],
  );

  return { aantal, bezig, wis, breekAf, tekenLabels };
}
