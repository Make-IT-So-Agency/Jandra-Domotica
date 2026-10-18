import * as THREE from "three";

import type { Xy } from "@/lib/bouw/omzetting/types";

/**
 * Een deel tekenen in 3D (zie materiaalproef.tsx): een tik gaat naar het vlak
 * waarop je tekent, niet naar wat de straal raakt, en een voorbeeld in het
 * oranje toont wat er komt. Enkel voor de browser; het rekenwerk staat in
 * lib/bouw/drie/delen.ts.
 */

const KLEUR = "#f97316";

/**
 * Waar de straal een vlak van een gebouw snijdt, in het assenstelsel van dat
 * gebouw: x, de hoogte en y. Met `kijk` een staand vlak door `punt` (een
 * muur), zonder een liggend vlak op `hoogte` (een vloer of een plat dak).
 */
export function snijVlak(straal: THREE.Raycaster, eigen: THREE.Object3D, vlak: { punt: Xy; hoogte: number; kijk: Xy | null }): THREE.Vector3 | null {
  eigen.updateWorldMatrix(true, false);
  const oorsprong = eigen.localToWorld(new THREE.Vector3(vlak.punt[0], vlak.hoogte, vlak.punt[1]));
  const normaal = vlak.kijk ? new THREE.Vector3(vlak.kijk[0], 0, vlak.kijk[1]).transformDirection(eigen.matrixWorld) : new THREE.Vector3(0, 1, 0);
  const raak = straal.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normaal, oorsprong), new THREE.Vector3());
  // Een vlak waar je bijna langs kijkt, geeft een punt ver weg: dat telt niet.
  if (!raak || raak.distanceTo(straal.ray.origin) > 400) return null;
  return eigen.worldToLocal(raak);
}

/** Hoe ver een tik mag kleven, in meter: een twaalftal pixels, dus verder weg meer. */
export function kleefmarge(camera: THREE.Camera, eigen: THREE.Object3D, lokaal: THREE.Vector3): number {
  const wereld = eigen.localToWorld(lokaal.clone());
  return Math.min(0.4, Math.max(0.03, camera.position.distanceTo(wereld) * 0.012));
}

/** Het voorbeeld van een deel tijdens het tekenen: lijnen en stippen die je altijd ziet, ook door een muur. */
export class Voorbeeld {
  private readonly groep = new THREE.Group();
  private readonly lijn = new THREE.LineBasicMaterial({ color: KLEUR, depthTest: false, transparent: true });
  private readonly vlak = new THREE.MeshBasicMaterial({ color: KLEUR, depthTest: false, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  private readonly stip = new THREE.PointsMaterial({ color: KLEUR, size: 9, sizeAttenuation: false, depthTest: false, transparent: true });

  constructor(private readonly scene: THREE.Scene) {
    this.groep.name = "deeltekening";
    scene.add(this.groep);
  }

  /**
   * Toont een lijn door de punten (in het gebouw: x, hoogte, y), met een stip
   * op elk punt. Gesloten: met de laatste zijde, en het vlak erin licht
   * gekleurd als het vier punten zijn (een rechthoek op een muur).
   */
  toon(eigen: THREE.Object3D, punten: THREE.Vector3[], gesloten: boolean, stippen: THREE.Vector3[] = punten) {
    this.wis();
    eigen.updateWorldMatrix(true, false);
    const wereld = (p: THREE.Vector3) => eigen.localToWorld(p.clone());
    const delen: THREE.Object3D[] = [];
    if (punten.length >= 2) {
      const geometrie = new THREE.BufferGeometry().setFromPoints(punten.map(wereld));
      delen.push(gesloten ? new THREE.LineLoop(geometrie, this.lijn) : new THREE.Line(geometrie, this.lijn));
    }
    if (gesloten && punten.length === 4) {
      const [a, b, c, d] = punten.map(wereld);
      const geometrie = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d]);
      delen.push(new THREE.Mesh(geometrie, this.vlak));
    }
    if (stippen.length > 0) delen.push(new THREE.Points(new THREE.BufferGeometry().setFromPoints(stippen.map(wereld)), this.stip));
    for (const deel of delen) {
      deel.renderOrder = 30;
      deel.frustumCulled = false;
    }
    if (delen.length > 0) this.groep.add(...delen);
  }

  wis() {
    for (const deel of [...this.groep.children]) {
      this.groep.remove(deel);
      (deel as THREE.Mesh).geometry?.dispose();
    }
  }

  opruimen() {
    this.wis();
    this.scene.remove(this.groep);
    this.lijn.dispose();
    this.vlak.dispose();
    this.stip.dispose();
  }
}
