import * as THREE from "three";

import type { Model3d } from "@/lib/bouw/drie/model";
import { hoogteVan, leidingsoort, type Leiding } from "@/lib/bouw/leidingen";

/**
 * De leidingen in 3D: buizen in de vloer, in de muren en aan het plafond,
 * buiten in de grond, stijgleidingen recht omhoog, en vloerverwarming als een
 * roze vlak op de vloer. Een doorschijnende tweede tekening die niets
 * verbergt, toont de buizen ook door de muren en vloeren heen (de laag
 * hulp:doorzicht). Waar ze liggen, rekent lib/bouw/leidingen.ts. Enkel voor
 * de browser.
 *
 * Elke leiding is een groep in de groep van haar verdieping, in het
 * assenstelsel van het gebouw. userData.soort zegt welke soort het is, voor
 * de lagen; userData.doorzicht welke delen de doorschijnende tekening zijn;
 * userData.leidingId op elk deel houdt het meetlint weg van de buizen.
 */

/** Eén cilinder en één bol van 1 m voor alle buizen, op maat geschaald. */
const CILINDER = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const BOL = new THREE.SphereGeometry(1, 12, 8);
const OMHOOG = new THREE.Vector3(0, 1, 0);
/** Zo dun is een buis hoogstens niet, om ze van wat verder nog te zien. */
const MINSTE_STRAAL = 0.01;

export interface Leidingenscene {
  objecten: THREE.Group[];
  opruimen(): void;
}

/** `grond`: waar de grond ligt in de scène; een leiding buiten ligt er 60 cm onder. */
export function bouwLeidingen(
  leidingen: readonly Leiding[],
  model: Model3d,
  groepen: ReadonlyMap<number, THREE.Group>,
  snede: THREE.Plane,
  grond: number,
): Leidingenscene {
  const materialen = new Map<string, { vast: THREE.Material; door: THREE.Material; vlak: THREE.Material }>();
  const materiaalVan = (kleur: string) => {
    let m = materialen.get(kleur);
    if (!m) {
      m = {
        vast: new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.45, metalness: 0.05, clippingPlanes: [snede] }),
        door: new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, clippingPlanes: [snede] }),
        vlak: new THREE.MeshBasicMaterial({
          color: kleur,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes: [snede],
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      };
      materialen.set(kleur, m);
    }
    return m;
  };
  const vlakken: THREE.BufferGeometry[] = [];
  const objecten: THREE.Group[] = [];

  for (const leiding of leidingen) {
    const verdieping = model.verdiepingen.find((v) => v.id === leiding.verdiepingId);
    const ouder = groepen.get(leiding.verdiepingId);
    if (!verdieping || !ouder || leiding.punten.length === 0) continue;
    const m = materiaalVan(leidingsoort(leiding.soort)?.kleur ?? "#6b7280");
    const groep = new THREE.Group();
    groep.name = `leiding-${leiding.id}`;
    groep.userData = { soort: leiding.soort };
    const straal = Math.max(MINSTE_STRAAL, leiding.diameter / 2000);

    /** Een deel, vast en doorschijnend. */
    const deel = (geometrie: THREE.BufferGeometry, zet: (mesh: THREE.Mesh) => void) => {
      for (const doorzicht of [false, true]) {
        const mesh = new THREE.Mesh(geometrie, doorzicht ? m.door : m.vast);
        zet(mesh);
        mesh.userData = { leidingId: leiding.id, doorzicht };
        if (doorzicht) mesh.renderOrder = 20;
        else mesh.castShadow = true;
        groep.add(mesh);
      }
    };
    const buis = (a: THREE.Vector3, b: THREE.Vector3) => {
      const richting = b.clone().sub(a);
      const lengte = richting.length();
      if (lengte < 1e-4) return;
      deel(CILINDER, (mesh) => {
        mesh.scale.set(straal, lengte, straal);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(OMHOOG, richting.normalize());
      });
    };
    const knoop = (p: THREE.Vector3) =>
      deel(BOL, (mesh) => {
        mesh.scale.setScalar(straal);
        mesh.position.copy(p);
      });

    if (leiding.ligging === "zone") {
      // Vloerverwarming: een vlak net boven de vloer, zodat je het ziet.
      const vorm = new THREE.Shape(leiding.punten.map(([x, y]) => new THREE.Vector2(x, y)));
      const geometrie = new THREE.ShapeGeometry(vorm);
      vlakken.push(geometrie);
      const mesh = new THREE.Mesh(geometrie, m.vlak);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = verdieping.z0 + 0.016;
      mesh.userData = { leidingId: leiding.id, doorzicht: false };
      groep.add(mesh);
    } else if (leiding.ligging === "stijg") {
      // Recht omhoog tot de vloer van de verdieping waar ze naartoe loopt, of tot het plafond.
      const doel = model.verdiepingen.find((v) => v.id === leiding.totVerdiepingId);
      const [x, y] = leiding.punten[0];
      const [z0, z1] = [verdieping.z0, doel ? doel.z0 + 0.012 : verdieping.z0 + verdieping.plafond];
      const [onder, boven] = [new THREE.Vector3(x, Math.min(z0, z1), y), new THREE.Vector3(x, Math.max(z0, z1), y)];
      buis(onder, boven);
      knoop(onder);
      knoop(boven);
    } else {
      const z = verdieping.z0 + hoogteVan(leiding, verdieping.plafond, grond - verdieping.z0);
      const punten = leiding.punten.map(([x, y]) => new THREE.Vector3(x, z, y));
      for (let i = 1; i < punten.length; i++) buis(punten[i - 1], punten[i]);
      for (const p of punten) knoop(p);
    }

    ouder.add(groep);
    objecten.push(groep);
  }

  return {
    objecten,
    opruimen() {
      for (const groep of objecten) groep.removeFromParent();
      for (const geometrie of vlakken) geometrie.dispose();
      for (const m of materialen.values()) {
        m.vast.dispose();
        m.door.dispose();
        m.vlak.dispose();
      }
    },
  };
}
