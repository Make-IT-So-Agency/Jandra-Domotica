import * as THREE from "three";

import { patroonDoek, type Patroonmateriaal } from "@/components/bouw/staal";
import type { Materiaal } from "@/lib/bouw/drie/materialen";
import { PATROONMATEN, oppervlakVan } from "@/lib/bouw/drie/stalen";

/**
 * Een materiaal op een vlak van 3D: een patroon op echte schaal, een foto, of
 * een kleur. De textuurcoördinaten in de scène staan in meter (zie scene.ts):
 * een patroon herhaalt zich daarom elke PATROONMATEN, een foto elke meter.
 * Dezelfde textuur dient voor elk vlak met hetzelfde materiaal. Enkel voor de
 * browser.
 */

export type Texturen = Map<string, THREE.Texture>;

function patroontextuur(materiaal: Patroonmateriaal, texturen: Texturen, anisotropie: number): THREE.Texture {
  const sleutel = `patroon:${materiaal.patroon}|${materiaal.kleur}|${materiaal.voegkleur ?? ""}`;
  let textuur = texturen.get(sleutel);
  if (!textuur) {
    textuur = new THREE.CanvasTexture(patroonDoek(materiaal));
    textuur.wrapS = THREE.RepeatWrapping;
    textuur.wrapT = THREE.RepeatWrapping;
    textuur.colorSpace = THREE.SRGBColorSpace;
    textuur.anisotropy = anisotropie;
    const maat = PATROONMATEN[materiaal.patroon];
    textuur.repeat.set(1 / maat.breedte, 1 / maat.hoogte);
    texturen.set(sleutel, textuur);
  }
  return textuur;
}

function fototextuur(url: string, texturen: Texturen, anisotropie: number): THREE.Texture {
  let textuur = texturen.get(url);
  if (!textuur) {
    textuur = new THREE.TextureLoader().setCrossOrigin("anonymous").load(url);
    textuur.wrapS = THREE.RepeatWrapping;
    textuur.wrapT = THREE.RepeatWrapping;
    textuur.colorSpace = THREE.SRGBColorSpace;
    textuur.anisotropy = anisotropie;
    texturen.set(url, textuur);
  }
  return textuur;
}

/** Zet het materiaal op een vlak: het patroon gaat voor de foto, de foto voor de kleur. */
export function zetMateriaal(m: THREE.MeshStandardMaterial, materiaal: Materiaal, texturen: Texturen, anisotropie: number) {
  const { patroon, foto } = materiaal;
  const map = patroon
    ? patroontextuur({ patroon, kleur: materiaal.kleur, voegkleur: materiaal.voegkleur }, texturen, anisotropie)
    : foto
      ? fototextuur(foto, texturen, anisotropie)
      : null;
  const { ruwheid, metaal } = oppervlakVan(materiaal);
  if (m.map !== map) {
    m.map = map;
    m.needsUpdate = true;
  }
  m.color.set(map ? "#ffffff" : materiaal.kleur);
  m.roughness = ruwheid;
  m.metalness = metaal;
}

/** Ruimt de texturen op die geen enkel vlak nog gebruikt: elk staal dat je uitprobeert, kost geheugen op de grafische kaart. */
export function ruimTexturenOp(texturen: Texturen, materialen: Iterable<THREE.MeshStandardMaterial>) {
  const gebruikt = new Set<THREE.Texture>();
  for (const m of materialen) if (m.map) gebruikt.add(m.map);
  for (const [sleutel, textuur] of texturen) {
    if (gebruikt.has(textuur)) continue;
    textuur.dispose();
    texturen.delete(sleutel);
  }
}
