import type { Patroon } from "../keuzes";
import type { Slot } from "./materialen";
import { willekeur } from "./stalen";

/**
 * Een materiaal uit een foto, slim gebruikt. Er zijn twee soorten foto's:
 * - een staal: één steen, tegel, plank of pan op een effen achtergrond, zoals
 *   op de site van een fabrikant. In 3D vult die foto elke steen, tegel of
 *   plank van het patroon, op echte maat, telkens met een ander stukje en
 *   soms gespiegeld: zo lijkt het een echte muur;
 * - een vlak: een stuk muur, vloer of gevel, zoals een foto van een huis met
 *   die steen. Daarvan geeft de foto de kleuren (en de voeg), of je duidt
 *   er een recht stuk op aan met hoe breed het in het echt is: dat ligt dan
 *   als foto op de muur.
 *
 * Uit de pixels: wat de achtergrond is, waar het staal staat, de kleuren, en
 * welk patroon past. Puur, met tests; de browser geeft de pixels.
 */

export interface Fotostaal {
  bron: "staal" | "vlak";
  /** Het deel van de foto dat telt, in breukdelen van de breedte en de hoogte: links, boven, rechts, onder. */
  uitsnede: [number, number, number, number];
  /**
   * Hoe breed de uitsnede in het echt is, in meter: bij een vlak altijd. Bij
   * een staal enkel zonder patroon met stenen, tegels of planken; anders
   * volgt de maat uit het patroon.
   */
  breedte: number | null;
}

/** De pixels van een foto: rij na rij, telkens rood, groen, blauw en doorzichtigheid. */
export interface Pixels {
  breedte: number;
  hoogte: number;
  data: ArrayLike<number>;
}

type Rgb = [number, number, number];

/** De patronen met stenen, tegels, planken of pannen: daar vult een staal elk stuk. */
export const PATRONEN_MET_STUKKEN: readonly Patroon[] = ["baksteen", "tegels", "planken", "parket", "pannen", "leien"];

/** De grootste breedte van een vlak, in meter. */
const MAX_BREEDTE = 30;

const rond = (waarde: number) => Math.round(waarde * 10000) / 10000;

/** Wat bewaard of ingestuurd werd, nagekeken; null als het niet klopt. */
export function schoneFotostaal(ruw: unknown): Fotostaal | null {
  if (!ruw || typeof ruw !== "object") return null;
  const r = ruw as Record<string, unknown>;
  if (r.bron !== "staal" && r.bron !== "vlak") return null;
  const u = r.uitsnede;
  if (!Array.isArray(u) || u.length !== 4 || !u.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1)) return null;
  const [x0, y0, x1, y1] = u as number[];
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null;
  const breedte = r.breedte ?? null;
  const goedeBreedte = typeof breedte === "number" && Number.isFinite(breedte) && breedte >= 0.02 && breedte <= MAX_BREEDTE;
  if (breedte !== null && !goedeBreedte) return null;
  if (r.bron === "vlak" && breedte === null) return null;
  return { bron: r.bron, uitsnede: [rond(x0), rond(y0), rond(x1), rond(y1)], breedte: breedte === null ? null : Math.round((breedte as number) * 1000) / 1000 };
}

export const hexVan = ([r, g, b]: Rgb): string => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;

const verschil = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** De kleur van een pixel; doorzichtig telt als wit, zoals een PNG op een witte pagina. */
function pixel(beeld: Pixels, x: number, y: number): Rgb {
  const i = (y * beeld.breedte + x) * 4;
  const a = beeld.data[i + 3] / 255;
  return [beeld.data[i] * a + 255 * (1 - a), beeld.data[i + 1] * a + 255 * (1 - a), beeld.data[i + 2] * a + 255 * (1 - a)];
}

const mediaan = (lijst: number[]) => {
  const s = [...lijst].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * De achtergrond: de rand van de foto, als die effen is (wit, lichtgrijs,
 * doorzichtig). Null: de foto loopt tot aan de rand door, zoals een muur.
 */
export function achtergrondVan(beeld: Pixels): Rgb | null {
  const { breedte: w, hoogte: h } = beeld;
  if (w < 8 || h < 8) return null;
  const rand: Rgb[] = [];
  const stap = Math.max(1, Math.floor(Math.min(w, h) / 60));
  for (let x = 0; x < w; x += stap) rand.push(pixel(beeld, x, 0), pixel(beeld, x, h - 1));
  for (let y = 0; y < h; y += stap) rand.push(pixel(beeld, 0, y), pixel(beeld, w - 1, y));
  const midden: Rgb = [mediaan(rand.map((p) => p[0])), mediaan(rand.map((p) => p[1])), mediaan(rand.map((p) => p[2]))];
  const gelijk = rand.filter((p) => verschil(p, midden) <= 36).length / rand.length;
  return gelijk >= 0.85 ? midden : null;
}

/**
 * Wat niet de achtergrond is: de eerste en de laatste rij en kolom, in
 * pixels, en hoe vol die rechthoek staat (het deel van de pixels erin dat
 * niet de achtergrond is). Een rij of kolom telt pas mee met genoeg pixels
 * (geen stofje of schaduw). Null: niets.
 */
function inhoudVan(beeld: Pixels, achtergrond: Rgb): { rand: [number, number, number, number]; vol: number } | null {
  const { breedte: w, hoogte: h } = beeld;
  const stap = Math.max(1, Math.floor(Math.max(w, h) / 400));
  const rijen = new Array<number>(h).fill(0);
  const kolommen = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y += stap) {
    for (let x = 0; x < w; x += stap) {
      if (verschil(pixel(beeld, x, y), achtergrond) > 48) {
        rijen[y]++;
        kolommen[x]++;
      }
    }
  }
  const drempelRij = Math.max(1, (w / stap) * 0.02);
  const drempelKolom = Math.max(1, (h / stap) * 0.02);
  const eerste = (lijst: number[], drempel: number) => lijst.findIndex((n) => n >= drempel);
  const laatste = (lijst: number[], drempel: number) => lijst.length - 1 - [...lijst].reverse().findIndex((n) => n >= drempel);
  const [y0, y1] = [eerste(rijen, drempelRij), laatste(rijen, drempelRij)];
  const [x0, x1] = [eerste(kolommen, drempelKolom), laatste(kolommen, drempelKolom)];
  if (y0 < 0 || x0 < 0 || x1 <= x0 || y1 <= y0) return null;
  let erin = 0;
  for (let y = y0; y <= y1; y++) erin += rijen[y];
  const plaatsen = (Math.floor((x1 - x0) / stap) + 1) * (Math.floor((y1 - y0) / stap) + 1);
  return { rand: [x0, y0, x1, y1], vol: Math.min(1, erin / plaatsen) };
}

/** De rechthoek in breukdelen, een beetje binnen de rand van het staal: daar zit vaak een afgeronde kant of een schaduw. */
function binnenDeRand([x0, y0, x1, y1]: readonly [number, number, number, number], { breedte: w, hoogte: h }: Pixels): [number, number, number, number] {
  const [bx, by] = [(x1 - x0) * 0.04, (y1 - y0) * 0.06];
  return [rond((x0 + bx) / w), rond((y0 + by) / h), rond((x1 + 1 - bx) / w), rond((y1 + 1 - by) / h)];
}

export interface Fotolezing {
  soort: "staal" | "vlak";
  uitsnede: [number, number, number, number];
  /** De achtergrond van een staal, of null. */
  achtergrond: string | null;
  /** Breedte op hoogte van de uitsnede, in pixels. */
  verhouding: number;
}

/**
 * Wat voor foto het is. Een staal: iets op een effen achtergrond, dat zijn
 * rechthoek vult, en niet bijna niets. De rest is een vlak: dan telt eerst
 * de hele foto, tot je er een stuk op aanduidt. Zo is hout met nerven tot aan
 * de rand een vlak, ook al is de rand bijna overal de kleur van het hout:
 * de nerven vullen hun rechthoek niet.
 */
export function leesFoto(beeld: Pixels): Fotolezing {
  const achtergrond = achtergrondVan(beeld);
  const inhoud = achtergrond ? inhoudVan(beeld, achtergrond) : null;
  const verhoudingVan = (u: readonly number[]) => ((u[2] - u[0]) * beeld.breedte) / Math.max(1e-9, (u[3] - u[1]) * beeld.hoogte);
  const oppervlak = inhoud ? ((inhoud.rand[2] + 1 - inhoud.rand[0]) * (inhoud.rand[3] + 1 - inhoud.rand[1])) / (beeld.breedte * beeld.hoogte) : 0;
  if (!achtergrond || !inhoud || inhoud.vol < 0.5 || oppervlak < 0.01) {
    return { soort: "vlak", uitsnede: [0, 0, 1, 1], achtergrond: null, verhouding: verhoudingVan([0, 0, 1, 1]) };
  }
  const uitsnede = binnenDeRand(inhoud.rand, beeld);
  return { soort: "staal", uitsnede, achtergrond: hexVan(achtergrond), verhouding: verhoudingVan(uitsnede) };
}

/**
 * De kleuren in een deel van de foto, de meest voorkomende eerst: k-means op
 * een steekproef van hoogstens 3000 pixels, zonder de achtergrond. Altijd
 * hetzelfde voor dezelfde foto.
 */
export function paletVan(
  beeld: Pixels,
  uitsnede: readonly [number, number, number, number],
  k = 4,
  achtergrond: Rgb | null = null,
): { kleur: string; aandeel: number }[] {
  const [x0, y0, x1, y1] = [
    Math.floor(uitsnede[0] * beeld.breedte),
    Math.floor(uitsnede[1] * beeld.hoogte),
    Math.ceil(uitsnede[2] * beeld.breedte),
    Math.ceil(uitsnede[3] * beeld.hoogte),
  ];
  const oppervlak = Math.max(1, (x1 - x0) * (y1 - y0));
  const stap = Math.max(1, Math.round(Math.sqrt(oppervlak / 3000)));
  const punten: Rgb[] = [];
  for (let y = y0; y < y1; y += stap) {
    for (let x = x0; x < x1; x += stap) {
      const p = pixel(beeld, Math.min(x, beeld.breedte - 1), Math.min(y, beeld.hoogte - 1));
      if (!achtergrond || verschil(p, achtergrond) > 48) punten.push(p);
    }
  }
  if (punten.length === 0) return [];
  // Beginnen bij de kwantielen van de helderheid: zo is het altijd hetzelfde.
  const helder = (p: Rgb) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const gesorteerd = [...punten].sort((a, b) => helder(a) - helder(b));
  const aantal = Math.min(k, punten.length);
  let centra: Rgb[] = Array.from({ length: aantal }, (_, i) => [...gesorteerd[Math.floor(((i + 0.5) / aantal) * gesorteerd.length)]] as Rgb);
  let toewijzing = new Array<number>(punten.length).fill(0);
  for (let ronde = 0; ronde < 15; ronde++) {
    toewijzing = punten.map((p) => {
      let beste = 0;
      for (let c = 1; c < centra.length; c++) if (verschil(p, centra[c]) < verschil(p, centra[beste])) beste = c;
      return beste;
    });
    centra = centra.map((oud, c) => {
      const leden = punten.filter((_, i) => toewijzing[i] === c);
      if (leden.length === 0) return oud;
      return [0, 1, 2].map((d) => leden.reduce((s, p) => s + p[d], 0) / leden.length) as Rgb;
    });
  }
  return centra
    .map((c, i) => ({ kleur: hexVan(c), aandeel: toewijzing.filter((t) => t === i).length / punten.length }))
    .filter((c) => c.aandeel > 0)
    .sort((a, b) => b.aandeel - a.aandeel);
}

/**
 * De kleur van een stuk en de voeg uit een palet: de meest voorkomende
 * kleur, en als voeg de kleur die het meest verschilt en minstens 5% van
 * de foto is (een voeg is smal). Zonder zo'n kleur: geen voeg.
 */
export function kleurenUitPalet(palet: readonly { kleur: string; aandeel: number }[]): { kleur: string; voegkleur: string | null } {
  const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  if (palet.length === 0) return { kleur: "#9a9a9a", voegkleur: null };
  const hoofd = palet[0];
  const kandidaten = palet.slice(1).filter((p) => p.aandeel >= 0.05 && p.aandeel <= 0.45);
  const voeg = kandidaten.sort((a, b) => verschil(rgb(b.kleur), rgb(hoofd.kleur)) - verschil(rgb(a.kleur), rgb(hoofd.kleur)))[0];
  return { kleur: hoofd.kleur, voegkleur: voeg && verschil(rgb(voeg.kleur), rgb(hoofd.kleur)) > 60 ? voeg.kleur : null };
}

/**
 * Welk patroon past bij een staal, op dit onderdeel, uit de verhouding van
 * de foto (breedte op hoogte): een baksteen is langwerpig, een tegel
 * vierkant, een plank lang. Null: geen patroon met stukken; dan ligt het
 * staal als foto op het vlak, zo breed als opgegeven.
 */
export function patroonVoorStaal(slot: Slot | "meubel", verhouding: number): Patroon | null {
  const v = verhouding >= 1 ? verhouding : 1 / verhouding;
  switch (slot) {
    case "gevel":
      return v >= 2 ? "baksteen" : null;
    case "dak":
      return v < 1.6 ? "pannen" : null;
    case "vloer":
      return v >= 3 ? "parket" : v < 1.3 ? "tegels" : null;
    case "binnenmuur":
      return v >= 3 ? "planken" : v < 1.3 ? "tegels" : null;
    default:
      return null;
  }
}

/**
 * Een stukje van het staal voor één steen, tegel of plank: zo breed op hoog
 * als het stuk, zo groot als het in de uitsnede past, op een toevallige
 * plaats, en soms gespiegeld. In pixels van de foto.
 */
export function venster(
  uitsnede: readonly [number, number, number, number],
  verhouding: number,
  toeval: () => number,
): { x: number; y: number; breedte: number; hoogte: number; spiegel: boolean } {
  const [x0, y0, x1, y1] = uitsnede;
  const [uw, uh] = [x1 - x0, y1 - y0];
  // Zo groot als past met de juiste verhouding, en dan 80 tot 100% daarvan.
  let breedte = Math.min(uw, uh * verhouding);
  let hoogte = breedte / verhouding;
  const schaal = 0.8 + 0.2 * toeval();
  breedte *= schaal;
  hoogte *= schaal;
  return { x: x0 + (uw - breedte) * toeval(), y: y0 + (uh - hoogte) * toeval(), breedte, hoogte, spiegel: toeval() < 0.5 };
}

/** Een toevalsgenerator voor de stukjes van een staal: dezelfde foto geeft altijd dezelfde muur. */
export const toevalVoor = (foto: string, patroon: string) => willekeur(`${foto}|${patroon}`);
