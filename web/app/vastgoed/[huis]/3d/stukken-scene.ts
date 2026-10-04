import * as THREE from "three";

import type { Model3d } from "@/lib/bouw/drie/model";
import { PANEEL, veldVan } from "@/lib/bouw/drie/zonnepanelen";
import { GROEPKLEUREN, laagVan, soortStuk, type GeplaatstStuk, type Stuk } from "@/lib/bouw/inrichting";

/**
 * De meubels en toestellen in 3D: eenvoudige blokken met een herkenbaar
 * silhouet, in een zachte kleur per groep (zie lib/bouw/inrichting.ts). Enkel
 * voor de browser.
 *
 * Elk stuk is een groep in de groep van zijn verdieping, in het assenstelsel
 * van het gebouw: het verdwijnt en verschuift mee. In die groep is x de
 * breedte (van links naar rechts), z de diepte (de rug op -diepte/2, de
 * voorkant op +diepte/2) en y de hoogte vanaf de onderkant.
 * userData.stukId en userData.laag zeggen welk stuk het is, voor de lagen en
 * om het aan te tikken.
 */

const WIT = "#f8fafc";
const DONKER = "#374151";
const WERKBLAD = "#6b6259";
const WATER = "#bfdbfe";
const SPIEGEL = "#dbeafe";
const PANEELKLEUR = "#1f2b45";

/** Eén kubus en één cilinder van 1 m voor alles, op maat geschaald. */
const KUBUS = new THREE.BoxGeometry(1, 1, 1);
const CILINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);

export interface Stukkenscene {
  /** Per stuk zijn groep. */
  objecten: Map<number, THREE.Group>;
  opruimen(): void;
}

/** Zet een groep van een stuk op zijn plaats: het midden op (x, y), de onderkant op z boven de vloer. */
export function zetStuk(groep: THREE.Object3D, stuk: Pick<Stuk, "x" | "y" | "z" | "hoek" | "kanteling">, z0: number) {
  groep.position.set(stuk.x, z0 + stuk.z, stuk.y);
  // Eerst draaien op het plan, dan kantelen: de voorkant zakt.
  groep.rotation.set((stuk.kanteling * Math.PI) / 180, (-stuk.hoek * Math.PI) / 180, 0, "YXZ");
}

export function bouwStukken(
  stukken: readonly GeplaatstStuk[],
  model: Model3d,
  groepen: ReadonlyMap<number, THREE.Group>,
  snede: THREE.Plane,
): Stukkenscene {
  const materialen = new Map<string, THREE.MeshStandardMaterial>();
  const materiaal = (kleur: string, doorzichtig = false) => {
    const sleutel = `${kleur}|${doorzichtig}`;
    let m = materialen.get(sleutel);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: kleur,
        roughness: doorzichtig ? 0.1 : 0.85,
        metalness: 0,
        transparent: doorzichtig,
        opacity: doorzichtig ? 0.3 : 1,
        depthWrite: !doorzichtig,
        clippingPlanes: [snede],
        clipShadows: true,
      });
      materialen.set(sleutel, m);
    }
    return m;
  };
  /** Een tint donkerder of lichter van een kleur. */
  const tint = (kleur: string, factor: number) => `#${new THREE.Color(kleur).multiplyScalar(factor).getHexString()}`;

  const objecten = new Map<number, THREE.Group>();

  for (const stuk of stukken) {
    const verdieping = model.verdiepingen.find((v) => v.id === stuk.verdiepingId);
    const ouder = groepen.get(stuk.verdiepingId);
    const soort = soortStuk(stuk.soort);
    if (!verdieping || !ouder || !soort) continue;
    const kleur = GROEPKLEUREN[soort.groep];
    const accent = tint(kleur, 0.78);
    const { breedte: w, diepte: d, hoogte: h } = stuk;
    const groep = new THREE.Group();

    /** Een blok van x0 tot x1 (breedte), y0 tot y1 (hoogte) en z0 tot z1 (diepte). */
    const blok = (k: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, doorzichtig = false) => {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
      const mesh = new THREE.Mesh(KUBUS, materiaal(k, doorzichtig));
      mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.castShadow = !doorzichtig;
      mesh.receiveShadow = true;
      groep.add(mesh);
    };
    /** Een staande cilinder (of ellips) rond (x, z), van y0 tot y1. */
    const cilinder = (k: string, x: number, z: number, breed: number, diep: number, y0: number, y1: number) => {
      if (y1 - y0 < 1e-3) return;
      const mesh = new THREE.Mesh(CILINDER, materiaal(k));
      mesh.scale.set(breed, y1 - y0, diep);
      mesh.position.set(x, (y0 + y1) / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      groep.add(mesh);
    };
    /** Een schijf op de voorkant, zoals de deur van een wasmachine of een ventilator. */
    const schijf = (k: string, x: number, y: number, straal: number) => {
      const mesh = new THREE.Mesh(CILINDER, materiaal(k));
      mesh.scale.set(straal * 2, 0.02, straal * 2);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, d / 2 + 0.01);
      groep.add(mesh);
    };
    const stoel = (x: number, z: number, naarVoren: boolean) => {
      const s = 0.21;
      blok(accent, x - s, x + s, 0, 0.45, z - s, z + s);
      const rug = naarVoren ? z - s : z + s - 0.04;
      blok(accent, x - s, x + s, 0.45, 0.92, rug, rug + 0.04);
    };
    const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];

    switch (soort.vorm) {
      case "bed": {
        const matras = Math.min(h, Math.max(0.2, h * 0.45));
        blok(kleur, x0, x1, 0, h - matras, z0 + 0.05, z1);
        blok(WIT, x0 + 0.03, x1 - 0.03, h - matras, h, z0 + 0.08, z1 - 0.02);
        blok(accent, x0, x1, 0, Math.max(h + 0.45, 0.9), z0, z0 + 0.06);
        // Een deken over het voeteneinde, en een of twee kussens.
        blok(kleur, x0 + 0.02, x1 - 0.02, h - 0.01, h + 0.04, z0 + Math.min(0.75, d * 0.4), z1);
        const kussens = w >= 1.2 ? 2 : 1;
        const kw = (w - 0.2) / kussens;
        for (let i = 0; i < kussens; i++) {
          blok(WIT, x0 + 0.1 + i * kw + 0.04, x0 + 0.1 + (i + 1) * kw - 0.04, h, h + 0.12, z0 + 0.12, z0 + 0.5);
        }
        break;
      }
      case "zetel": {
        const zit = Math.min(0.42, h * 0.5);
        const arm = Math.min(0.15, w / 6);
        blok(kleur, x0, x1, 0, zit, z0, z1);
        blok(accent, x0, x1, zit, h, z0, z0 + Math.min(0.22, d / 3));
        blok(accent, x0, x0 + arm, zit, zit + 0.2, z0, z1);
        blok(accent, x1 - arm, x1, zit, zit + 0.2, z0, z1);
        break;
      }
      case "hoekzetel": {
        // Langs de rug over de hele breedte, en links een stuk naar voren.
        const zit = Math.min(0.42, h * 0.5);
        const diep = Math.min(0.95, d, w);
        const rug = Math.min(0.22, diep / 3);
        blok(kleur, x0, x1, 0, zit, z0, z0 + diep);
        blok(kleur, x0, x0 + diep, 0, zit, z0 + diep, z1);
        blok(accent, x0, x1, zit, h, z0, z0 + rug);
        blok(accent, x0, x0 + rug, zit, h, z0 + rug, z1);
        blok(accent, x1 - 0.15, x1, zit, zit + 0.2, z0 + rug, z0 + diep);
        break;
      }
      case "tafel":
      case "eettafel":
      case "bureau": {
        const blad = Math.min(0.04, h / 4);
        blok(kleur, x0, x1, h - blad, h, z0, z1);
        const p = 0.05;
        for (const [px, pz] of [
          [x0 + 0.03, z0 + 0.03],
          [x1 - 0.03 - p, z0 + 0.03],
          [x1 - 0.03 - p, z1 - 0.03 - p],
          [x0 + 0.03, z1 - 0.03 - p],
        ]) {
          blok(accent, px, px + p, 0, h - blad, pz, pz + p);
        }
        if (soort.vorm === "eettafel") {
          // Aan de lange kanten een stoel per 60 cm.
          const aantal = Math.max(1, Math.floor(w / 0.6));
          for (let i = 0; i < aantal; i++) {
            const x = x0 + (w / aantal) * (i + 0.5);
            stoel(x, z1 + 0.06, false);
            stoel(x, z0 - 0.06, true);
          }
        } else if (soort.vorm === "bureau") {
          stoel(0, z1 + 0.12, false);
        }
        break;
      }
      case "kast": {
        blok(kleur, x0, x1, 0, h, z0, z1 - 0.01);
        // De deuren, met een naad ertussen en een greep.
        const deuren = Math.max(1, Math.round(w / 0.5));
        const dw = w / deuren;
        for (let i = 0; i < deuren; i++) {
          blok(accent, x0 + i * dw + 0.008, x0 + (i + 1) * dw - 0.008, 0.01, h - 0.01, z1 - 0.012, z1);
          const greep = i % 2 === 0 ? x0 + (i + 1) * dw - 0.05 : x0 + i * dw + 0.03;
          blok(DONKER, greep, greep + 0.02, h * 0.45, h * 0.45 + Math.min(0.15, h / 4), z1, z1 + 0.02);
        }
        break;
      }
      case "keuken": {
        const blad = 0.04;
        blok(DONKER, x0 + 0.02, x1 - 0.02, 0, 0.1, z0, z1 - 0.06);
        blok(kleur, x0, x1, 0.1, h - blad, z0, z1 - 0.02);
        blok(WERKBLAD, x0, x1, h - blad, h, z0, z1);
        const deuren = Math.max(1, Math.round(w / 0.6));
        const dw = w / deuren;
        for (let i = 1; i < deuren; i++) blok(accent, x0 + i * dw - 0.004, x0 + i * dw + 0.004, 0.1, h - blad, z1 - 0.02, z1 - 0.012);
        // Een kookplaat, links.
        if (w >= 1.2) blok(DONKER, x0 + 0.15, x0 + 0.75, h, h + 0.006, z0 + (d - 0.5) / 2, z0 + (d + 0.5) / 2);
        break;
      }
      case "wc": {
        const wand = Math.min(0.14, d / 3);
        blok(WIT, x0, x1, 0, h, z0, z0 + wand);
        blok(DONKER, -0.1, 0.1, h * 0.75, h * 0.75 + 0.12, z0 + wand, z0 + wand + 0.01);
        cilinder(WIT, 0, (z0 + wand + z1) / 2, w * 0.9, d - wand, 0, Math.min(0.42, h));
        break;
      }
      case "lavabo": {
        const blad = 0.05;
        blok(kleur, x0, x1, Math.min(0.3, h / 3), h - blad, z0, z1);
        blok(WIT, x0, x1, h - blad, h, z0, z1);
        const kommen = w >= 1.0 ? 2 : 1;
        const kw = w / kommen;
        for (let i = 0; i < kommen; i++) {
          blok(WATER, x0 + i * kw + 0.08, x0 + (i + 1) * kw - 0.08, h, h + 0.004, z0 + 0.12, z1 - 0.06);
        }
        // De spiegel erboven, tegen de muur.
        blok(SPIEGEL, x0 + w * 0.05, x1 - w * 0.05, h + 0.25, h + 0.95, z0, z0 + 0.02);
        break;
      }
      case "douche": {
        blok(WIT, x0, x1, 0, 0.04, z0, z1);
        // Glas vooraan en rechts; de rug en links staan tegen de muur.
        blok("#e0f2fe", x0, x1, 0.04, h, z1 - 0.01, z1, true);
        blok("#e0f2fe", x1 - 0.01, x1, 0.04, h, z0, z1, true);
        cilinder(DONKER, 0, z0 + 0.12, 0.2, 0.2, h - 0.12, h - 0.1);
        break;
      }
      case "bad": {
        blok(WIT, x0, x1, 0, h, z0, z1);
        blok(WATER, x0 + 0.07, x1 - 0.07, h, h + 0.004, z0 + 0.07, z1 - 0.07);
        break;
      }
      case "cilinder": {
        cilinder(kleur, 0, 0, w, d, 0, h);
        cilinder(accent, 0, 0, w * 0.6, d * 0.6, h, h + 0.04);
        break;
      }
      case "buitenunit": {
        blok(kleur, x0, x1, 0.08, h, z0, z1);
        blok(DONKER, x0 + 0.05, x0 + 0.15, 0, 0.08, z0 + 0.05, z1 - 0.05);
        blok(DONKER, x1 - 0.15, x1 - 0.05, 0, 0.08, z0 + 0.05, z1 - 0.05);
        // De ventilator vooraan.
        const straal = Math.min(w * 0.3, (h - 0.08) * 0.42);
        schijf(DONKER, x0 + w * 0.35, 0.08 + (h - 0.08) / 2, straal);
        break;
      }
      case "paal": {
        const kop = Math.min(0.45, h / 3);
        blok(kleur, -w / 4, w / 4, 0, h - kop, -d / 4, d / 4);
        blok(kleur, x0, x1, h - kop, h, z0, z1);
        blok(DONKER, x0 + 0.05, x1 - 0.05, h - kop + 0.08, h - 0.08, z1, z1 + 0.01);
        break;
      }
      case "zonnepanelen": {
        // De rijen liggen langs de helling, de kolommen langs de dakrand; ertussen een spleet.
        const veld = veldVan(w, d);
        const [pb, pd] = veld.staand ? [PANEEL.breedte, PANEEL.lengte] : [PANEEL.lengte, PANEEL.breedte];
        for (let r = 0; r < veld.rijen; r++) {
          for (let k = 0; k < veld.kolommen; k++) {
            const [px, pz] = [x0 + k * (pb + PANEEL.tussen), z0 + r * (pd + PANEEL.tussen)];
            blok(PANEELKLEUR, px, px + pb, 0, h, pz, pz + pd);
          }
        }
        break;
      }
      case "put": {
        // De put zit in de grond; enkel het deksel komt erboven.
        cilinder(accent, 0, 0, w, d, 0, h);
        cilinder(DONKER, 0, 0, Math.min(0.6, w), Math.min(0.6, d), h, h + 0.03);
        break;
      }
      case "toestel":
      default: {
        blok(kleur, x0, x1, 0, h, z0, z1);
        if (stuk.soort === "wasmachine" || stuk.soort === "droogkast") {
          schijf(DONKER, 0, h * 0.42, Math.min(w, h) * 0.3);
          blok(accent, x0 + 0.03, x1 - 0.03, h - 0.12, h - 0.03, z1, z1 + 0.01);
        } else {
          // Een schermpje bovenaan de voorkant.
          blok(DONKER, -Math.min(0.12, w / 4), Math.min(0.12, w / 4), h * 0.8, h * 0.8 + Math.min(0.08, h / 8), z1, z1 + 0.01);
        }
      }
    }

    zetStuk(groep, stuk, verdieping.z0);
    groep.name = `stuk-${stuk.id}`;
    groep.userData = { stukId: stuk.id, laag: laagVan(stuk.soort) };
    ouder.add(groep);
    objecten.set(stuk.id, groep);
  }

  return {
    objecten,
    opruimen() {
      for (const groep of objecten.values()) groep.removeFromParent();
      materialen.forEach((m) => m.dispose());
    },
  };
}
