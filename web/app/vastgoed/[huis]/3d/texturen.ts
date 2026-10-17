import * as THREE from "three";

import { patroonDoek, tekenPatroon, type Patroonmateriaal } from "@/components/bouw/staal";
import { PATRONEN_MET_STUKKEN, type Fotostaal } from "@/lib/bouw/drie/fotostaal";
import type { Materiaal } from "@/lib/bouw/drie/materialen";
import { PATROONMATEN, oppervlakVan } from "@/lib/bouw/drie/stalen";
import type { Patroon } from "@/lib/bouw/keuzes";

/**
 * Een materiaal op een vlak van 3D: een patroon op echte schaal, een foto, of
 * een kleur. De textuurcoördinaten in de scène staan in meter (zie scene.ts):
 * een patroon herhaalt zich daarom elke PATROONMATEN, een foto elke meter.
 * Een foto van een staal vult elke steen, tegel of plank van het patroon; een
 * vlak ligt op zijn echte breedte, gespiegeld herhaald zodat je geen naad
 * ziet (zie lib/bouw/drie/fotostaal.ts). Dezelfde textuur dient voor elk vlak
 * met hetzelfde materiaal. Enkel voor de browser.
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

/** Een foto zoals een textuur ze nodig heeft: van een andere plaats enkel met CORS. Eén keer per adres. */
const beelden = new Map<string, Promise<HTMLImageElement>>();

export function laadBeeld(url: string): Promise<HTMLImageElement> {
  let belofte = beelden.get(url);
  if (!belofte) {
    belofte = new Promise((gelukt, mislukt) => {
      const beeld = new Image();
      beeld.crossOrigin = "anonymous";
      beeld.decoding = "async";
      beeld.onload = () => gelukt(beeld);
      beeld.onerror = () => mislukt(new Error("Deze foto laadt niet."));
      beeld.src = url;
    });
    beelden.set(url, belofte);
    belofte.catch(() => beelden.delete(url));
  }
  return belofte;
}

/** Hoe de foto heet zonder de handtekening van Storage: zo blijft het toeval hetzelfde na een nieuwe URL. */
const zonderHandtekening = (url: string) => url.split("?")[0];

/** De uitsnede van een staal in pixels van de foto. */
const inPixels = (u: Fotostaal["uitsnede"], beeld: HTMLImageElement): [number, number, number, number] => [
  u[0] * beeld.naturalWidth,
  u[1] * beeld.naturalHeight,
  u[2] * beeld.naturalWidth,
  u[3] * beeld.naturalHeight,
];

/** Een patroon waarvan elke steen, tegel of plank een stukje van de foto krijgt; tot de foto er is, effen. */
function fotopatroontextuur(materiaal: Patroonmateriaal, foto: string, staal: Fotostaal, texturen: Texturen, anisotropie: number): THREE.Texture {
  const sleutel = `fotopatroon:${foto}|${materiaal.patroon}|${materiaal.kleur}|${materiaal.voegkleur ?? ""}|${staal.uitsnede.join(",")}`;
  let textuur = texturen.get(sleutel);
  if (!textuur) {
    const doek = patroonDoek(materiaal);
    const nieuw = new THREE.CanvasTexture(doek);
    nieuw.wrapS = THREE.RepeatWrapping;
    nieuw.wrapT = THREE.RepeatWrapping;
    nieuw.colorSpace = THREE.SRGBColorSpace;
    nieuw.anisotropy = anisotropie;
    const maat = PATROONMATEN[materiaal.patroon];
    nieuw.repeat.set(1 / maat.breedte, 1 / maat.hoogte);
    texturen.set(sleutel, nieuw);
    textuur = nieuw;
    laadBeeld(foto)
      .then((beeld) => {
        const ctx = doek.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, doek.width, doek.height);
        tekenPatroon(ctx, { ...materiaal, gezicht: { beeld, uitsnede: inPixels(staal.uitsnede, beeld), sleutel: zonderHandtekening(foto) } }, doek.width / maat.breedte);
        nieuw.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return textuur;
}

/** Hoe groot het doek van een vlak is: vast, want een textuur die van maat verandert, mag WebGL niet. */
const VLAKDOEK = 1024;

/**
 * Een stuk muur of vloer van een foto, op zijn echte breedte (en een staal
 * zonder patroon met stukken). Het doek is vierkant; de herhaling zet de
 * verhouding van de uitsnede terug. Gespiegeld herhaald: geen naad.
 */
function fotovlaktextuur(foto: string, staal: Fotostaal, texturen: Texturen, anisotropie: number): THREE.Texture {
  const breedte = staal.breedte ?? 0.3;
  const sleutel = `fotovlak:${foto}|${staal.uitsnede.join(",")}|${breedte}`;
  let textuur = texturen.get(sleutel);
  if (!textuur) {
    const doek = document.createElement("canvas");
    doek.width = VLAKDOEK;
    doek.height = VLAKDOEK;
    const nieuw = new THREE.CanvasTexture(doek);
    nieuw.wrapS = THREE.MirroredRepeatWrapping;
    nieuw.wrapT = THREE.MirroredRepeatWrapping;
    nieuw.colorSpace = THREE.SRGBColorSpace;
    nieuw.anisotropy = anisotropie;
    nieuw.repeat.set(1 / breedte, 1 / breedte);
    texturen.set(sleutel, nieuw);
    textuur = nieuw;
    laadBeeld(foto)
      .then((beeld) => {
        const ctx = doek.getContext("2d");
        if (!ctx) return;
        const [x0, y0, x1, y1] = inPixels(staal.uitsnede, beeld);
        ctx.drawImage(beeld, x0, y0, x1 - x0, y1 - y0, 0, 0, VLAKDOEK, VLAKDOEK);
        // Zo hoog als de uitsnede in het echt is, met de verhouding van de foto.
        nieuw.repeat.set(1 / breedte, 1 / ((breedte * (y1 - y0)) / Math.max(1, x1 - x0)));
        nieuw.needsUpdate = true;
      })
      .catch(() => undefined);
  }
  return textuur;
}

/** Heeft dit patroon stenen, tegels of planken om met een foto te vullen? */
const metStukken = (patroon: Patroon | null): patroon is Patroon => patroon !== null && PATRONEN_MET_STUKKEN.includes(patroon);

/**
 * Zet het materiaal op een vlak. Een foto met een staal: elke steen, tegel of
 * plank van het patroon, of het vlak op echte breedte. Anders gaat het
 * patroon voor de foto, en de foto voor de kleur.
 */
export function zetMateriaal(m: THREE.MeshStandardMaterial, materiaal: Materiaal, texturen: Texturen, anisotropie: number) {
  const { patroon, foto, staal } = materiaal;
  const map =
    foto && staal
      ? staal.bron === "staal" && metStukken(patroon)
        ? fotopatroontextuur({ patroon, kleur: materiaal.kleur, voegkleur: materiaal.voegkleur }, foto, staal, texturen, anisotropie)
        : fotovlaktextuur(foto, staal, texturen, anisotropie)
      : patroon
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
