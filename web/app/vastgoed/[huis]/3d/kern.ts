import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

/**
 * Wat het 3D-scherm deelt met elk gereedschap (meten, de zon, en wat nog
 * komt): de scène, de camera, de doorsnede, iets doen bij elk beeld, en een
 * straal die enkel raakt wat je ziet. Enkel voor de browser.
 */

export interface Kern {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Alles boven dit vlak is weggesneden (de doorsnede). */
  snede: THREE.Plane;
  /** Wordt bij elk beeld opgeroepen, met de tijd sinds het vorige in seconden. */
  elkBeeld: Set<(dt: number) => void>;
}

/** Hoeveel pixels een vinger of muis mag bewegen bij een tik; meer is slepen. */
export const TIKAFSTAND = 6;
/** Hoe lang een tik mag duren: langer is vasthouden. */
const TIKDUUR = 800;

/** Zet de straal door een punt op het scherm. */
export function richtStraal(straal: THREE.Raycaster, punt: { clientX: number; clientY: number }, element: HTMLElement, camera: THREE.Camera) {
  const kader = element.getBoundingClientRect();
  straal.setFromCamera(
    new THREE.Vector2(((punt.clientX - kader.left) / kader.width) * 2 - 1, -((punt.clientY - kader.top) / kader.height) * 2 + 1),
    camera,
  );
}

/** Een punt op het scherm, in pixels binnen het element, en of het voor de camera ligt. */
export function opScherm(punt: THREE.Vector3, camera: THREE.Camera, element: HTMLElement): { x: number; y: number; zichtbaar: boolean } {
  const ndc = punt.clone().project(camera);
  return {
    x: ((ndc.x + 1) / 2) * element.clientWidth,
    y: ((1 - ndc.y) / 2) * element.clientHeight,
    zichtbaar: ndc.z >= -1 && ndc.z <= 1,
  };
}

/** Is dit object te zien: het zelf en al zijn ouders? */
export function zichtbaar(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Snijdt de doorsnede dit object weg boven de snede? Enkel wat de snede in zijn materiaal heeft. */
export function gesneden(object: THREE.Object3D, snede: THREE.Plane): boolean {
  const materiaal = (object as THREE.Mesh).material;
  const materialen = Array.isArray(materiaal) ? materiaal : materiaal ? [materiaal] : [];
  return materialen.some((m) => m.clippingPlanes?.includes(snede));
}

/**
 * Wat de straal raakt, van dichtbij naar ver: enkel vlakken die te zien zijn,
 * en niets wat de doorsnede wegsnijdt. Een gewone straal van three.js raakt
 * ook een verborgen verdieping, of een muur boven de snede.
 */
export function zichtbareRaak(straal: THREE.Raycaster, objecten: readonly THREE.Object3D[], snede: THREE.Plane): THREE.Intersection[] {
  return straal
    .intersectObjects([...objecten], true)
    .filter(
      (raak) =>
        (raak.object as THREE.Mesh).isMesh === true &&
        zichtbaar(raak.object) &&
        !(gesneden(raak.object, snede) && snede.distanceToPoint(raak.point) < -1e-6),
    );
}

/**
 * Een tik op het beeld: neer en los op dezelfde plek (hoogstens 6 pixels),
 * met één vinger of de linkermuisknop. Slepen, knijpen of twee vingers
 * blijven voor de camera.
 */
export function useTik(kern: RefObject<{ renderer: THREE.WebGLRenderer } | null>, aan: boolean, opTik: (e: PointerEvent) => void) {
  const terug = useRef(opTik);
  terug.current = opTik;
  useEffect(() => {
    const element = kern.current?.renderer.domElement;
    if (!aan || !element) return;
    const neer = new Map<number, { x: number; y: number; tijd: number }>();
    let meerdere = false;
    const druk = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      neer.set(e.pointerId, { x: e.clientX, y: e.clientY, tijd: e.timeStamp });
      if (neer.size > 1) meerdere = true;
    };
    const los = (e: PointerEvent) => {
      const begin = neer.get(e.pointerId);
      neer.delete(e.pointerId);
      if (!begin) return;
      if (meerdere) {
        if (neer.size === 0) meerdere = false;
        return;
      }
      if (Math.hypot(e.clientX - begin.x, e.clientY - begin.y) > TIKAFSTAND || e.timeStamp - begin.tijd > TIKDUUR) return;
      terug.current(e);
    };
    const weg = (e: PointerEvent) => {
      neer.delete(e.pointerId);
      if (neer.size === 0) meerdere = false;
    };
    element.addEventListener("pointerdown", druk);
    element.addEventListener("pointerup", los);
    element.addEventListener("pointercancel", weg);
    return () => {
      element.removeEventListener("pointerdown", druk);
      element.removeEventListener("pointerup", los);
      element.removeEventListener("pointercancel", weg);
    };
  }, [kern, aan]);
}
