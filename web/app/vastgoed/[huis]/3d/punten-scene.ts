import * as THREE from "three";

import { bevestigingVan } from "@/lib/bouw/drie/bevestiging";
import type { Driepunt } from "@/lib/bouw/drie/laden";
import type { Model3d } from "@/lib/bouw/drie/model";

import { zichtbaar, zichtbareRaak } from "./kern";

/**
 * De punten in 3D, herkenbaar: per soort een rond symbool met de code, in de
 * kleur van de categorie. Tegen de muur een plaatje dat de ruimte in kijkt,
 * aan het plafond een rozet, in de vloer een schijf; zonder muur in de buurt
 * een symbool dat naar de camera kijkt. Waar het hangt, rekent
 * lib/bouw/drie/bevestiging.ts. Enkel voor de browser.
 *
 * Elk punt komt in de groep van zijn verdieping, in het assenstelsel van het
 * gebouw: het verdwijnt en verschuift mee. userData.puntId en
 * userData.categorie zeggen welk punt het is, voor de lagen en om het aan te
 * tikken.
 */

/** Zo groot is een symbool, in meter: wat groter dan een stopcontact, om het te zien. */
const MAAT = 0.12;
/** Zo ver van de muur, het plafond of de vloer, tegen het flikkeren. */
const AFSTAND = 0.006;

function symbool(code: string, kleur: string): THREE.CanvasTexture {
  const doek = document.createElement("canvas");
  doek.width = doek.height = 128;
  const ctx = doek.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fillStyle = kleur;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${code.length >= 3 ? 40 : code.length === 2 ? 52 : 64}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, 64, 68);
  const textuur = new THREE.CanvasTexture(doek);
  textuur.colorSpace = THREE.SRGBColorSpace;
  return textuur;
}

export interface Puntenscene {
  objecten: THREE.Object3D[];
  opruimen(): void;
}

export function bouwPunten(
  punten: readonly Driepunt[],
  model: Model3d,
  groepen: ReadonlyMap<number, THREE.Group>,
  snede: THREE.Plane,
): Puntenscene {
  const texturen = new Map<string, THREE.CanvasTexture>();
  const materialen = new Map<string, THREE.Material>();
  const vlak = new THREE.PlaneGeometry(MAAT, MAAT);
  const objecten: THREE.Object3D[] = [];

  const textuurVan = (punt: Driepunt) => {
    const sleutel = `${punt.code}|${punt.kleur}`;
    let textuur = texturen.get(sleutel);
    if (!textuur) {
      textuur = symbool(punt.code, punt.kleur);
      texturen.set(sleutel, textuur);
    }
    return textuur;
  };
  const materiaalVan = (punt: Driepunt, vrij: boolean): THREE.Material => {
    const sleutel = `${vrij ? "vrij" : "vast"}|${punt.code}|${punt.kleur}`;
    let materiaal = materialen.get(sleutel);
    if (!materiaal) {
      const gemeen = { map: textuurVan(punt), transparent: true, alphaTest: 0.05, toneMapped: false, clippingPlanes: [snede] };
      materiaal = vrij ? new THREE.SpriteMaterial(gemeen) : new THREE.MeshBasicMaterial(gemeen);
      materialen.set(sleutel, materiaal);
    }
    return materiaal;
  };

  for (const punt of punten) {
    const verdieping = model.verdiepingen.find((v) => v.id === punt.verdiepingId);
    const groep = groepen.get(punt.verdiepingId);
    if (!verdieping || !groep) continue;
    const bevestiging = bevestigingVan(
      [punt.x, punt.y],
      punt.hoogte,
      verdieping.muren.map((muur) => muur.veelhoek),
    );
    let object: THREE.Object3D;
    if (bevestiging.soort === "vrij") {
      const sprite = new THREE.Sprite(materiaalVan(punt, true) as THREE.SpriteMaterial);
      sprite.scale.set(MAAT, MAAT, 1);
      sprite.position.set(punt.x, verdieping.z0 + (punt.hoogte ?? verdieping.plafond), punt.y);
      object = sprite;
    } else {
      const mesh = new THREE.Mesh(vlak, materiaalVan(punt, false));
      if (bevestiging.soort === "muur") {
        const [x, y] = bevestiging.punt;
        const [nx, ny] = bevestiging.n;
        mesh.position.set(x + nx * AFSTAND, verdieping.z0 + (punt.hoogte ?? 1), y + ny * AFSTAND);
        // Het vlak kijkt naar +z; gedraaid kijkt het langs de normaal van de muur.
        mesh.rotation.y = Math.atan2(nx, ny);
      } else if (bevestiging.soort === "plafond") {
        mesh.position.set(punt.x, verdieping.z0 + verdieping.plafond - AFSTAND * 2, punt.y);
        mesh.rotation.x = Math.PI / 2;
      } else {
        mesh.position.set(punt.x, verdieping.z0 + 0.012 + AFSTAND * 2, punt.y);
        mesh.rotation.x = -Math.PI / 2;
      }
      object = mesh;
    }
    object.userData = { puntId: punt.id, categorie: punt.categorie };
    object.renderOrder = 5;
    groep.add(object);
    objecten.push(object);
  }

  return {
    objecten,
    opruimen() {
      for (const object of objecten) object.removeFromParent();
      vlak.dispose();
      materialen.forEach((materiaal) => materiaal.dispose());
      texturen.forEach((textuur) => textuur.dispose());
    },
  };
}

/**
 * Welk punt een tik bedoelt: het symbool dat de straal raakt, of anders het
 * dichtste op het scherm binnen `bereik` pixels, als het niet achter een muur
 * of vloer ligt. Een symbool is klein: een vinger mag er wat naast tikken.
 */
export function puntBijTik(
  punten: readonly THREE.Object3D[],
  doelen: readonly THREE.Object3D[],
  tik: { x: number; y: number },
  camera: THREE.Camera,
  element: HTMLElement,
  snede: THREE.Plane,
  bereik = 16,
): number | null {
  const kader = element.getBoundingClientRect();
  const straal = new THREE.Raycaster();
  straal.setFromCamera(new THREE.Vector2(((tik.x - kader.left) / kader.width) * 2 - 1, -((tik.y - kader.top) / kader.height) * 2 + 1), camera);
  const raak = zichtbareRaak(straal, punten, snede)[0];
  if (raak) return raak.object.userData.puntId as number;

  const oog = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  let beste: { id: number; afstand: number } | null = null;
  for (const object of punten) {
    if (!zichtbaar(object)) continue;
    const plek = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    if (snede.distanceToPoint(plek) < 0) continue;
    const ndc = plek.clone().project(camera);
    if (ndc.z < -1 || ndc.z > 1) continue;
    const afstand = Math.hypot(((ndc.x + 1) / 2) * kader.width - (tik.x - kader.left), ((1 - ndc.y) / 2) * kader.height - (tik.y - kader.top));
    if (afstand > bereik || (beste && afstand >= beste.afstand)) continue;
    // Ligt er iets tussen de camera en het punt?
    const richting = plek.clone().sub(oog);
    const tot = richting.length();
    const zicht = new THREE.Raycaster(oog, richting.normalize(), 0, tot);
    const ervoor = zichtbareRaak(zicht, doelen, snede).find((r) => r.object !== object && r.distance < tot - 0.05);
    if (!ervoor) beste = { id: object.userData.puntId as number, afstand };
  }
  return beste?.id ?? null;
}
