import * as THREE from "three";

import { buurhuis, BUURHOOGTE, lokaal, type Omgeving } from "@/lib/bouw/drie/omgeving";
import { binnen, zwaartepunt } from "@/lib/bouw/omzetting/geometrie";
import type { Xy } from "@/lib/bouw/omzetting/types";

import { Bouwer } from "./scene";

/**
 * De omgeving in three.js: de luchtfoto als grond, de perceelgrenzen (het
 * onze met een lage oranje boord), en de huizen van de buren als eenvoudige
 * volumes. Alles in het assenstelsel rond het adrespunt (x naar het oosten, y
 * naar het zuiden), in één groep die een plaatsing op het terrein legt, net
 * als een gebouw (zie plaats in scene.ts). Enkel voor de browser.
 */

export interface Omgevingsscene {
  groep: THREE.Group;
  luchtfoto: THREE.Mesh;
  grenzen: THREE.Group;
  buren: THREE.Group;
  /** De gebouwen van het GRB op ons perceel: wat er nu staat, en meestal weg moet. */
  opPerceel: THREE.Group;
  /** Hoe groot de luchtfoto is, in meter, voor de schaduw en de camera. */
  straal: number;
  opruimen(): void;
}

const KLEUREN = { boord: "#f59e0b", grens: "#ffffff", muur: "#e7e2da", dak: "#7d7a76" };

/** `grond`: de hoogte van de grond in de scène; de luchtfoto ligt er net boven, onder het inplantingsplan. */
export function bouwOmgeving(omgeving: Omgeving, grond: number, luchtfotoUrl: string, anisotropie: number): Omgevingsscene {
  const groep = new THREE.Group();
  groep.name = "omgeving";
  const op = (q: [number, number]) => lokaal(q, omgeving.punt);
  const opruimen: (() => void)[] = [];
  const materiaal = <M extends THREE.Material>(m: M): M => {
    opruimen.push(() => m.dispose());
    return m;
  };

  // De luchtfoto: noord boven. Een negatieve polygonOffset houdt hem boven het gras en onder het plan.
  const { x0, y0, x1, y1 } = omgeving.luchtfoto;
  const textuur = new THREE.TextureLoader().load(luchtfotoUrl);
  textuur.colorSpace = THREE.SRGBColorSpace;
  textuur.anisotropy = anisotropie;
  opruimen.push(() => textuur.dispose());
  const luchtfoto = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0),
    materiaal(new THREE.MeshStandardMaterial({ map: textuur, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
  );
  opruimen.push(() => luchtfoto.geometry.dispose());
  luchtfoto.rotation.x = -Math.PI / 2;
  const [mx, my] = op([(x0 + x1) / 2, (y0 + y1) / 2]);
  luchtfoto.position.set(mx, grond + 0.004, my);
  luchtfoto.receiveShadow = true;
  groep.add(luchtfoto);

  // De perceelgrenzen: de onze met een boord van 10 cm, die van de buren als dunne lijn.
  const grenzen = new THREE.Group();
  const lijnen: THREE.Vector3[] = [];
  const boord = new Bouwer();
  const eigen = omgeving.percelen.find((perceel) => perceel.eigen);
  for (const perceel of omgeving.percelen) {
    const ring = perceel.ring.map(op);
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      if (perceel.eigen) {
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const n: Xy = [(-(b[1] - a[1]) / l) * 0.06, ((b[0] - a[0]) / l) * 0.06];
        boord.balk("boord", [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]], grond, grond + 0.1);
      } else {
        lijnen.push(new THREE.Vector3(a[0], grond + 0.03, a[1]), new THREE.Vector3(b[0], grond + 0.03, b[1]));
      }
    });
  }
  for (const geometrie of boord.geometrieen().values()) {
    opruimen.push(() => geometrie.dispose());
    const mesh = new THREE.Mesh(geometrie, materiaal(new THREE.MeshStandardMaterial({ color: KLEUREN.boord, roughness: 0.6, side: THREE.DoubleSide })));
    mesh.castShadow = true;
    grenzen.add(mesh);
  }
  if (lijnen.length > 0) {
    const geometrie = new THREE.BufferGeometry().setFromPoints(lijnen);
    opruimen.push(() => geometrie.dispose());
    grenzen.add(new THREE.LineSegments(geometrie, materiaal(new THREE.LineBasicMaterial({ color: KLEUREN.grens, transparent: true, opacity: 0.85 }))));
  }
  groep.add(grenzen);

  // De huizen van de buren, en apart wat er op ons perceel staat.
  const eigenRing = eigen?.ring.map(op) ?? [];
  const buren = new THREE.Group();
  const opPerceel = new THREE.Group();
  for (const [doel, alleenOpPerceel] of [
    [buren, false],
    [opPerceel, true],
  ] as const) {
    const bouwer = new Bouwer();
    for (const gebouw of omgeving.gebouwen) {
      const ring = gebouw.ring.map(op);
      if ((eigenRing.length >= 3 && binnen(zwaartepunt(ring), eigenRing)) !== alleenOpPerceel) continue;
      const { dak } = buurhuis(ring);
      ring.forEach((a, i) => bouwer.wand("muur", a, ring[(i + 1) % ring.length], grond, grond + BUURHOOGTE));
      for (const vlak of dak?.vlakken ?? []) bouwer.waaier("dak", vlak.map(([x, y, z]) => [x, grond + z, y] as [number, number, number]));
      for (const gevel of dak?.gevels ?? []) bouwer.waaier("muur", gevel.map(([x, y, z]) => [x, grond + z, y] as [number, number, number]));
    }
    for (const [sleutel, geometrie] of bouwer.geometrieen()) {
      opruimen.push(() => geometrie.dispose());
      const mesh = new THREE.Mesh(
        geometrie,
        materiaal(new THREE.MeshStandardMaterial({ color: sleutel === "dak" ? KLEUREN.dak : KLEUREN.muur, roughness: 0.95, side: THREE.DoubleSide })),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      doel.add(mesh);
    }
    groep.add(doel);
  }

  return {
    groep,
    luchtfoto,
    grenzen,
    buren,
    opPerceel,
    straal: Math.max(x1 - x0, y1 - y0) / 2,
    opruimen: () => opruimen.forEach((ruim) => ruim()),
  };
}
