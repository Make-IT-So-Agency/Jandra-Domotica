import * as THREE from "three";

import type { Gat } from "@/lib/bouw/drie/gaten";
import type { Model3d, Plaat } from "@/lib/bouw/drie/model";
import type { Veelhoek } from "@/lib/bouw/drie/vlak";
import type { Xy } from "@/lib/bouw/omzetting/types";

/**
 * Van het model naar driehoeken voor three.js. Enkel voor de browser.
 *
 * Het plan heeft x naar rechts en y naar beneden; three.js heeft y naar
 * boven. Een punt (x, y) op hoogte z wordt (x, z, y): van boven gezien ligt
 * het huis dan net zoals op het plan.
 *
 * Elk materiaal heeft een sleutel; per sleutel komt er één geometrie, zodat
 * een ander materiaal uitproberen enkel een kleur of textuur verandert.
 */

export type Sleutel = string;

type P3 = [number, number, number];

const in3d = (p: Xy, z: number): P3 => [p[0], z, p[1]];

class Bouwer {
  readonly delen = new Map<Sleutel, { posities: number[]; normalen: number[]; uvs: number[] }>();

  private deel(sleutel: Sleutel) {
    let deel = this.delen.get(sleutel);
    if (!deel) {
      deel = { posities: [], normalen: [], uvs: [] };
      this.delen.set(sleutel, deel);
    }
    return deel;
  }

  driehoek(sleutel: Sleutel, a: P3, b: P3, c: P3, uv: [[number, number], [number, number], [number, number]]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const lengte = Math.hypot(nx, ny, nz);
    if (lengte < 1e-12) return;
    nx /= lengte;
    ny /= lengte;
    nz /= lengte;
    const deel = this.deel(sleutel);
    for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]]] as const) {
      deel.posities.push(p[0], p[1], p[2]);
      deel.normalen.push(nx, ny, nz);
      deel.uvs.push(t[0], t[1]);
    }
  }

  /** Een verticaal vlak van a naar b, van z0 tot z1, met de textuur in meter. */
  wand(sleutel: Sleutel, a: Xy, b: Xy, z0: number, z1: number) {
    if (z1 - z0 < 1e-4) return;
    const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.driehoek(sleutel, in3d(a, z0), in3d(b, z0), in3d(b, z1), [[0, z0], [lengte, z0], [lengte, z1]]);
    this.driehoek(sleutel, in3d(a, z0), in3d(b, z1), in3d(a, z1), [[0, z0], [lengte, z1], [0, z1]]);
  }

  /** Een horizontaal vlak, met gaten, op hoogte z. */
  vlak(sleutel: Sleutel, veelhoek: Veelhoek, z: number) {
    const [buiten, ...gaten] = veelhoek;
    if (!buiten || buiten.length < 3) return;
    const v2 = (ring: Xy[]) => ring.map(([x, y]) => new THREE.Vector2(x, y));
    const alle = [buiten, ...gaten].flat();
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v2(buiten), gaten.map(v2))) {
      const [a, b, c] = [alle[i], alle[j], alle[k]];
      this.driehoek(sleutel, in3d(a, z), in3d(b, z), in3d(c, z), [a, b, c]);
    }
  }

  /** Een vlakke, convexe veelhoek in 3D (een dakvlak, een gevel), als waaier. */
  waaier(sleutel: Sleutel, punten: P3[]) {
    for (let i = 1; i < punten.length - 1; i++) {
      const [a, b, c] = [punten[0], punten[i], punten[i + 1]];
      this.driehoek(sleutel, a, b, c, [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
    }
  }

  /** Een balk: een rechthoek op het plan (a, b, c, d), van z0 tot z1. */
  balk(sleutel: Sleutel, hoeken: [Xy, Xy, Xy, Xy], z0: number, z1: number, vlakken: { onder?: boolean; boven?: boolean } = {}) {
    for (let i = 0; i < 4; i++) this.wand(sleutel, hoeken[i], hoeken[(i + 1) % 4], z0, z1);
    if (vlakken.boven !== false) this.vlak(sleutel, [hoeken], z1);
    if (vlakken.onder) this.vlak(sleutel, [hoeken], z0);
  }

  geometrieen(): Map<Sleutel, THREE.BufferGeometry> {
    const uit = new Map<Sleutel, THREE.BufferGeometry>();
    for (const [sleutel, deel] of this.delen) {
      const geometrie = new THREE.BufferGeometry();
      geometrie.setAttribute("position", new THREE.Float32BufferAttribute(deel.posities, 3));
      geometrie.setAttribute("normal", new THREE.Float32BufferAttribute(deel.normalen, 3));
      geometrie.setAttribute("uv", new THREE.Float32BufferAttribute(deel.uvs, 2));
      geometrie.computeBoundingSphere();
      uit.set(sleutel, geometrie);
    }
    return uit;
  }
}

const plus = (a: Xy, b: Xy, f: number): Xy => [a[0] + b[0] * f, a[1] + b[1] * f];

/** Een raam of deur: borstwering, latei, en glas met een kader of een deurblad. */
function gat(bouwer: Bouwer, g: Gat, z0: number, z1: number) {
  const buiten = g.soort === "raam" || g.soort === "buitendeur";
  const voor = "binnenmuur";
  const achter = buiten ? "gevel" : "binnenmuur";
  const [a, b] = [g.a, g.b];
  const [d, c] = [plus(a, g.n, g.dikte), plus(b, g.n, g.dikte)];

  if (g.onder > 0.01) {
    const top = z0 + g.onder;
    bouwer.wand(voor, a, b, z0, top);
    bouwer.wand(achter, c, d, z0, top);
    bouwer.vlak("muurtop", [[a, b, c, d]], top);
  }
  const latei = z0 + g.boven;
  if (z1 - latei > 0.01) {
    bouwer.wand(voor, a, b, latei, z1);
    bouwer.wand(achter, c, d, latei, z1);
    bouwer.vlak("muurtop", [[a, b, c, d]], latei);
  }

  // Glas of deurblad in het midden van de muur, met een kader van 6 cm.
  if (g.soort !== "raam" && g.soort !== "buitendeur") return;
  const lengte = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Xy = [(b[0] - a[0]) / lengte, (b[1] - a[1]) / lengte];
  const midden = g.dikte / 2;
  const profiel = 0.06;
  const strook = (s0: number, s1: number, dikte: number): [Xy, Xy, Xy, Xy] => {
    const p0 = plus(plus(a, u, s0), g.n, midden - dikte / 2);
    const p1 = plus(plus(a, u, s1), g.n, midden - dikte / 2);
    return [p0, p1, plus(p1, g.n, dikte), plus(p0, g.n, dikte)];
  };
  const onder = z0 + g.onder;
  if (g.soort === "buitendeur") {
    bouwer.balk("schrijnwerk", strook(0, lengte, 0.06), onder, latei, { boven: false });
    return;
  }
  bouwer.balk("schrijnwerk", strook(0, profiel, 0.07), onder, latei, { boven: false });
  bouwer.balk("schrijnwerk", strook(lengte - profiel, lengte, 0.07), onder, latei, { boven: false });
  bouwer.balk("schrijnwerk", strook(profiel, lengte - profiel, 0.07), onder, onder + profiel);
  bouwer.balk("schrijnwerk", strook(profiel, lengte - profiel, 0.07), latei - profiel, latei, { boven: false, onder: true });
  const glas = strook(profiel, lengte - profiel, 0.01);
  bouwer.wand("glas", glas[0], glas[1], onder + profiel, latei - profiel);
}

function plaat(bouwer: Bouwer, p: Plaat, boven: Sleutel, onder: Sleutel, zijkant: Sleutel) {
  for (const veelhoek of p.veelhoeken) {
    bouwer.vlak(boven, veelhoek, p.z1);
    bouwer.vlak(onder, veelhoek, p.z0);
    for (const ring of veelhoek) for (let i = 0; i < ring.length; i++) bouwer.wand(zijkant, ring[i], ring[(i + 1) % ring.length], p.z0, p.z1);
  }
}

export interface Opgebouwd {
  wortel: THREE.Group;
  verdiepingen: Map<number, THREE.Group>;
  daken: THREE.Group;
  meshes: THREE.Mesh[];
}

/**
 * Bouwt de scène. `materiaal` geeft voor elke sleutel het materiaal; dezelfde
 * sleutel krijgt overal hetzelfde materiaal-object, zodat een kleur wijzigen
 * overal meteen werkt.
 */
export function bouwScene(model: Model3d, materiaal: (sleutel: Sleutel) => THREE.Material): Opgebouwd {
  const wortel = new THREE.Group();
  const verdiepingen = new Map<number, THREE.Group>();
  const daken = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  wortel.add(daken);

  const voegToe = (groep: THREE.Group, bouwer: Bouwer) => {
    for (const [sleutel, geometrie] of bouwer.geometrieen()) {
      const mesh = new THREE.Mesh(geometrie, materiaal(sleutel));
      mesh.castShadow = sleutel !== "glas";
      mesh.receiveShadow = true;
      mesh.userData.sleutel = sleutel;
      groep.add(mesh);
      meshes.push(mesh);
    }
  };

  for (const v of model.verdiepingen) {
    const bouwer = new Bouwer();
    for (const muur of v.muren) {
      muur.veelhoek.forEach((ring, r) => {
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length];
          bouwer.wand(muur.zijden[r][i].zijde === "buiten" ? "gevel" : "binnenmuur", a, b, v.z0, v.z1);
        });
      });
      bouwer.vlak("muurtop", muur.veelhoek, v.z1);
    }
    for (const g of v.gaten) gat(bouwer, g, v.z0, v.z1);
    for (const vloer of v.vloeren) bouwer.vlak(`vloer:${vloer.ruimteId}`, vloer.ringen, v.z0 + 0.012);
    plaat(bouwer, v.plaat, "plaat", "plafond", "gevel");

    const groep = new THREE.Group();
    groep.name = `verdieping-${v.id}`;
    voegToe(groep, bouwer);
    wortel.add(groep);
    verdiepingen.set(v.id, groep);

    if (v.dakplaat) {
      const dakbouwer = new Bouwer();
      plaat(dakbouwer, v.dakplaat, "dakplat", "plafond", "dakrand");
      voegToe(daken, dakbouwer);
    }
  }

  const dakbouwer = new Bouwer();
  for (const { dak } of model.daken) {
    for (const vlak of dak.vlakken) dakbouwer.waaier("dak", vlak.map(([x, y, z]) => [x, z, y] as P3));
    for (const gevel of dak.gevels) dakbouwer.waaier("gevel", gevel.map(([x, y, z]) => [x, z, y] as P3));
  }
  voegToe(daken, dakbouwer);

  return { wortel, verdiepingen, daken, meshes };
}
