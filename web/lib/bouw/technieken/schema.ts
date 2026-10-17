import { binnen, middenVan } from "../omzetting/geometrie";
import type { Xy } from "../omzetting/types";
import { kva, type Kring, type Techniekverdieping, type Techniekvoorstel } from "./voorstel";

/**
 * Het voorstel als tekening: een eendraadschema met elke kring onder haar
 * automaat en haar punten erlangs, en per verdieping een situatieschema met
 * waar elk punt ligt en bij welke kring het hoort (A3). Zoals een elektricien
 * ze tekent voor de keuring, maar eenvoudiger: het blijft een voorstel.
 *
 * Een tekening is een lijst van lijnen, rechthoeken, cirkels en teksten in
 * punten (y naar beneden): de pagina tekent ze als SVG, de PDF met
 * @react-pdf. Puur, met tests.
 */

export type Tekenstuk =
  | { soort: "lijn"; punten: Xy[]; dikte?: number; streep?: boolean; kleur?: string }
  | { soort: "vlak"; punten: Xy[]; vul: string; lijn?: string }
  | { soort: "rechthoek"; x: number; y: number; breedte: number; hoogte: number; vul?: string; lijn?: string }
  | { soort: "cirkel"; x: number; y: number; r: number; vul?: string; lijn?: string }
  | { soort: "tekst"; x: number; y: number; tekst: string; grootte: number; anker?: "start" | "middle" | "end"; vet?: boolean; kleur?: string };

export interface Tekening {
  breedte: number;
  hoogte: number;
  stukken: Tekenstuk[];
  /** Waar de tekening op papier in stukken mag: tussen twee kolommen van het eendraadschema. */
  naden?: number[];
}

const ZWART = "#111827";
const GRIJS = "#6b7280";

/** De kleuren van de kringen op het situatieschema: genoeg verschil naast elkaar. */
export const KRINGKLEUREN = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563", "#65a30d", "#9333ea"];

/** Waar een tekening breder dan `breedte` in stukken gaat, op de naden: de x van het begin en het einde van elk stuk. */
export function sneden(tekening: Tekening, breedte: number): [number, number][] {
  const uit: [number, number][] = [];
  let begin = 0;
  while (begin < tekening.breedte - 1) {
    const verst = begin + breedte;
    if (verst >= tekening.breedte) {
      uit.push([begin, tekening.breedte]);
      break;
    }
    const naad = (tekening.naden ?? []).filter((x) => x > begin + breedte / 3 && x <= verst).at(-1) ?? verst;
    uit.push([begin, naad]);
    begin = naad;
  }
  return uit;
}

/** Breekt een tekst in regels van hoogstens `breedte` tekens, op de spaties. */
export function regels(tekst: string, breedte: number, maximum = 3): string[] {
  const woorden = tekst.split(/\s+/).filter(Boolean);
  const uit: string[] = [];
  let regel = "";
  for (const woord of woorden) {
    if (regel && regel.length + 1 + woord.length > breedte) {
      uit.push(regel);
      regel = woord;
    } else {
      regel = regel ? `${regel} ${woord}` : woord;
    }
  }
  if (regel) uit.push(regel);
  if (uit.length <= maximum) return uit;
  return [...uit.slice(0, maximum - 1), `${uit.slice(maximum - 1).join(" ").slice(0, breedte - 1)}…`];
}

/** Wat voor symbool een punt krijgt op het schema. */
function symboolVan(soort: string): "licht" | "stopcontact" | "toestel" | "motor" {
  if (["lichtpunt", "inbouwspot", "wandlicht", "ledstrip", "buitenlicht"].includes(soort)) return "licht";
  if (soort.startsWith("stopcontact")) return "stopcontact";
  if (soort === "rolluik") return "motor";
  return "toestel";
}

/** Een symbool op (x, y): een lichtpunt is een cirkel met een kruis, een stopcontact een halve cirkel, een toestel een vierkant. */
function symbool(x: number, y: number, soort: string): Tekenstuk[] {
  const r = 5;
  switch (symboolVan(soort)) {
    case "licht": {
      const d = r * Math.SQRT1_2;
      return [
        { soort: "cirkel", x, y, r, vul: "#ffffff", lijn: ZWART },
        { soort: "lijn", punten: [[x - d, y - d], [x + d, y + d]] },
        { soort: "lijn", punten: [[x - d, y + d], [x + d, y - d]] },
      ];
    }
    case "stopcontact": {
      // Een halve cirkel met de open kant naar rechts, en het pootje naar de kabel.
      const boog: Xy[] = Array.from({ length: 9 }, (_, i) => {
        const hoek = Math.PI / 2 + (i / 8) * Math.PI;
        return [x + 2 + r * Math.cos(hoek), y + r * Math.sin(hoek)];
      });
      return [
        { soort: "lijn", punten: boog },
        { soort: "lijn", punten: [[x + 2, y - r], [x + 2, y + r]] },
      ];
    }
    case "motor":
      return [
        { soort: "cirkel", x, y, r, vul: "#ffffff", lijn: ZWART },
        { soort: "tekst", x, y: y + 3, tekst: "M", grootte: 7, anker: "middle", vet: true },
      ];
    default:
      return [
        { soort: "rechthoek", x: x - r, y: y - r, breedte: 2 * r, hoogte: 2 * r, vul: "#ffffff", lijn: ZWART },
        { soort: "lijn", punten: [[x - r, y + r], [x + r, y - r]] },
      ];
  }
}

/** Een automaat: een schakelaar met een rechthoekje, en eronder de stroom. */
function automaat(x: number, y: number): Tekenstuk[] {
  return [
    { soort: "lijn", punten: [[x, y], [x, y + 8]] },
    { soort: "lijn", punten: [[x, y + 8], [x + 7, y + 20]] },
    { soort: "lijn", punten: [[x, y + 24], [x, y + 32]] },
    { soort: "rechthoek", x: x + 1, y: y + 11, breedte: 5, hoogte: 5, vul: ZWART },
  ];
}

/** Hoe hoog een differentieel is met zoveel regels tekst onder de ΔI. */
const diffhoogte = (regels: number) => 18 + regels * 9;

/** Een differentieel: een rechthoek met ΔI, en eronder in de rechthoek de gevoeligheid, het type en de polen. */
function differentieel(x: number, y: number, tekst: string[]): Tekenstuk[] {
  return [
    { soort: "rechthoek", x: x - 25, y, breedte: 50, hoogte: diffhoogte(tekst.length), vul: "#ffffff", lijn: ZWART },
    { soort: "tekst", x, y: y + 12, tekst: "ΔI", grootte: 9, anker: "middle", vet: true },
    ...tekst.map((regel, i): Tekenstuk => ({ soort: "tekst", x, y: y + 22 + i * 9, tekst: regel, grootte: 7, anker: "middle", kleur: i === 0 ? ZWART : GRIJS })),
  ];
}

const KOLOM = 86;
const BUS = 70;
/** De bus van een differentieel van 30 mA: onder zijn rechthoek, boven de letters van de kringen. */
const ONDERBUS = BUS + 64;
const AUTOMAAT = 176;
const PUNTEN = 300;
const STAP = 30;

/** Kort: "3G2,5" uit "XVB 3G2,5 per lichtgroep". */
const kortekabel = (kabel: string) => kabel.replace(/^XVB /, "").replace(/ per .*$/, "").replace(/, in de grond.*$/, "");

/**
 * Het eendraadschema: links het net, de meter en de algemene differentieel,
 * daarna de bus met elke kring als een kolom. De kringen achter een 30 mA
 * hangen aan hun eigen bus. Per kring de letter, de automaat, de kabel en de
 * naam, en eronder haar punten met hun nummer.
 */
export function eendraadschema(voorstel: Techniekvoorstel): Tekening {
  const stukken: Tekenstuk[] = [];
  const { instellingen, kringen, differentielen } = voorstel;
  const algemeen = differentielen[0];
  // Links: het net, de meter en de algemene schakelaar met differentieel.
  const net = instellingen.fasen === 3 ? "3N400 V" : "230 V";
  stukken.push(
    { soort: "tekst", x: 14, y: 22, tekst: `Net ${net}, ${instellingen.stroom} A`, grootte: 9, vet: true },
    { soort: "tekst", x: 14, y: 34, tekst: `${String(kva(instellingen)).replace(".", ",")} kVA`, grootte: 8, kleur: GRIJS },
    { soort: "lijn", punten: [[30, 44], [30, 60]], dikte: 1.5 },
    { soort: "rechthoek", x: 14, y: 60, breedte: 32, hoogte: 22, vul: "#ffffff", lijn: ZWART },
    { soort: "tekst", x: 30, y: 75, tekst: "kWh", grootte: 8, anker: "middle", vet: true },
    { soort: "lijn", punten: [[30, 82], [30, 96]], dikte: 1.5 },
    ...differentieel(30, 96, [`${algemeen.gevoeligheid} mA`, `type ${algemeen.type}`, `${algemeen.polen} ${algemeen.ampere} A`]),
    { soort: "lijn", punten: [[30, 96 + diffhoogte(3)], [30, 156], [70, 156], [70, BUS]], dikte: 1.5 },
  );

  // De kolommen: de kringen van de algemene, dan per differentieel van 30 mA een groep met wat ruimte ervoor.
  let x = 110;
  const kolommen: { kring: Kring; x: number }[] = [];
  const groepen: { nummer: number; x0: number; x1: number }[] = [];
  for (const d of differentielen) {
    const eigen = kringen.filter((k) => k.differentieel === d.nummer);
    if (eigen.length === 0) continue;
    if (d.nummer > 0) x += 34;
    const x0 = x;
    for (const kring of eigen) {
      kolommen.push({ kring, x });
      x += KOLOM;
    }
    groepen.push({ nummer: d.nummer, x0, x1: x - KOLOM });
  }
  const einde = Math.max(x, 260);
  stukken.push({ soort: "lijn", punten: [[70, BUS], [einde - KOLOM / 2, BUS]], dikte: 2.5 });

  for (const groep of groepen) {
    const d = differentielen[groep.nummer];
    if (d.nummer === 0) continue;
    // Een differentieel van 30 mA aan de hoofdbus, met een eigen bus voor zijn kringen.
    const dx = groep.x0 - 34;
    stukken.push(
      { soort: "lijn", punten: [[dx, BUS], [dx, BUS + 14]], dikte: 1.5 },
      ...differentieel(dx, BUS + 14, [`${d.gevoeligheid} mA`, `type ${d.type}`]),
      { soort: "lijn", punten: [[dx, BUS + 14 + diffhoogte(2)], [dx, ONDERBUS], [groep.x1 + 1, ONDERBUS]], dikte: 2 },
    );
  }

  let onderaan = PUNTEN;
  for (const { kring, x: kx } of kolommen) {
    const bus = kring.differentieel === 0 ? BUS : ONDERBUS;
    stukken.push(
      { soort: "lijn", punten: [[kx, bus], [kx, AUTOMAAT]] },
      ...automaat(kx, AUTOMAAT),
      { soort: "cirkel", x: kx, y: AUTOMAAT - 22, r: 9, vul: "#ffffff", lijn: ZWART },
      { soort: "tekst", x: kx, y: AUTOMAAT - 18.5, tekst: kring.letter, grootte: 9, anker: "middle", vet: true },
      { soort: "tekst", x: kx + 10, y: AUTOMAAT + 18, tekst: `${kring.beveiliging.ampere} A`, grootte: 8, vet: true },
      { soort: "tekst", x: kx + 10, y: AUTOMAAT + 28, tekst: kring.beveiliging.polen, grootte: 7, kleur: GRIJS },
      { soort: "tekst", x: kx, y: AUTOMAAT + 46, tekst: kortekabel(kring.kabel), grootte: 7.5, anker: "middle" },
      ...regels(kring.naam, 16).map((regel, i): Tekenstuk => ({ soort: "tekst", x: kx, y: AUTOMAAT + 60 + i * 9, tekst: regel, grootte: 7.5, anker: "middle", vet: i === 0, kleur: ZWART })),
    );
    if (kring.punten.length === 0) {
      stukken.push({ soort: "lijn", punten: [[kx, AUTOMAAT + 32], [kx, AUTOMAAT + 38]] });
      continue;
    }
    const laatste = PUNTEN + (kring.punten.length - 1) * STAP;
    stukken.push({ soort: "lijn", punten: [[kx, AUTOMAAT + 32], [kx, AUTOMAAT + 36]] }, { soort: "lijn", punten: [[kx, PUNTEN - 18], [kx, laatste]] });
    kring.punten.forEach((punt, i) => {
      const y = PUNTEN + i * STAP;
      stukken.push(
        ...symbool(kx, y, punt.soort),
        { soort: "tekst", x: kx + 10, y: y - 2, tekst: `${punt.nummer} ${punt.code}${punt.aantal > 1 ? ` ×${punt.aantal}` : ""}`, grootte: 7.5, vet: true },
        { soort: "tekst", x: kx + 10, y: y + 7, tekst: (punt.ruimte ?? "buiten").slice(0, 14), grootte: 6.5, kleur: GRIJS },
      );
    });
    onderaan = Math.max(onderaan, laatste);
  }
  // Tussen twee kringen mag het schema over twee bladen: net voor de volgende kolom.
  const naden = kolommen.slice(1).map((k) => k.x - KOLOM / 2 + 6);
  return { breedte: einde + 20, hoogte: onderaan + 40, stukken, naden };
}

/** Een rechthoek op het blad, in punten: links, boven, rechts, onder. */
export type Vak = [number, number, number, number];

const overlapt = (a: Vak, b: Vak) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Hoe breed een tekst ongeveer is, in punten: een letter van Helvetica is gemiddeld wat meer dan half zo breed als hoog. */
const tekstbreedte = (tekst: string, grootte: number) => tekst.length * grootte * 0.55;

/** Waar de naam van een ruimte mag komen, van het midden uit: eerst wat lager of hoger, dan opzij (in breedtes van de naam en in punten). */
const NAAMPLEKKEN: readonly [number, number][] = [
  [0, 0], [0, 14], [0, -14], [0, 28], [0, -28], [-0.8, 0], [0.8, 0], [-0.8, 14], [0.8, 14], [-0.8, -14], [0.8, -14], [0, 42], [0, -42],
];

/**
 * Waar de naam van een ruimte komt: in het midden, tenzij daar een punt of
 * zijn nummer staat (een lichtpunt hangt vaak net in het midden). Dan de
 * eerste plek in de ruimte die vrij is; is er geen, toch het midden.
 */
export function naamplek(midden: Xy, naam: string, ring: readonly Xy[], bezet: readonly Vak[]): Xy {
  const breedte = tekstbreedte(naam, 8);
  const vak = ([x, y]: Xy): Vak => [x - breedte / 2, y - 8, x + breedte / 2, y + 2];
  const plekken = NAAMPLEKKEN.map(([dx, dy]): Xy => [midden[0] + dx * breedte, midden[1] + dy]);
  const erin = (p: Xy) => {
    const [l, b, r, o] = vak(p);
    return ([[l, b], [r, b], [r, o], [l, o]] as Xy[]).every((hoek) => binnen(hoek, ring));
  };
  return plekken.find((p) => erin(p) && !bezet.some((v) => overlapt(v, vak(p)))) ?? midden;
}

/**
 * Het situatieschema van een verdieping: de ruimtes, elk punt met zijn nummer
 * (A3) in de kleur van zijn kring, en de verdeelkast als ze hier hangt.
 * `breedte` en `hoogte`: hoe groot de tekening mag worden, in punten.
 */
export function situatieschema(voorstel: Techniekvoorstel, verdieping: Techniekverdieping, breedte = 760, hoogte = 520): Tekening | null {
  const punten = voorstel.kringen.flatMap((kring, i) => kring.punten.filter((p) => p.verdiepingId === verdieping.id).map((p) => ({ ...p, kleur: KRINGKLEUREN[i % KRINGKLEUREN.length] })));
  const hoeken = verdieping.ruimtes.flatMap((r) => r.veelhoek[0] ?? []);
  const alle: Xy[] = [...hoeken, ...punten.map((p): Xy => [p.x, p.y])];
  if (voorstel.kast?.verdiepingId === verdieping.id) alle.push(voorstel.kast.punt);
  if (alle.length === 0 || (punten.length === 0 && voorstel.kast?.verdiepingId !== verdieping.id)) return null;
  const [x0, y0] = [Math.min(...alle.map((p) => p[0])) - 1, Math.min(...alle.map((p) => p[1])) - 1];
  const [x1, y1] = [Math.max(...alle.map((p) => p[0])) + 1, Math.max(...alle.map((p) => p[1])) + 1];
  const schaal = Math.min(breedte / (x1 - x0), hoogte / (y1 - y0));
  const op = ([x, y]: Xy): Xy => [Math.round((x - x0) * schaal * 10) / 10, Math.round((y - y0) * schaal * 10) / 10];
  const stukken: Tekenstuk[] = [];
  const kast = voorstel.kast?.verdiepingId === verdieping.id ? op(voorstel.kast.punt) : null;
  // Wat de naam van een ruimte niet mag bedekken: elk punt met zijn nummer, en de kast.
  const bezet: Vak[] = punten.map((p) => {
    const [px, py] = op([p.x, p.y]);
    return [px - 4, py - 11, px + 6 + tekstbreedte(p.nummer, 7.5), py + 4];
  });
  if (kast) bezet.push([kast[0] - 9, kast[1] - 7, kast[0] + 9, kast[1] + 7]);
  for (const ruimte of verdieping.ruimtes) {
    for (const [r, ring] of ruimte.veelhoek.entries()) stukken.push({ soort: "vlak", punten: ring.map(op), vul: r === 0 ? "#f9fafb" : "#ffffff", lijn: "#9ca3af" });
    const [mx, my] = naamplek(op(middenVan(ruimte.veelhoek)), ruimte.naam, (ruimte.veelhoek[0] ?? []).map(op), bezet);
    stukken.push({ soort: "tekst", x: mx, y: my, tekst: ruimte.naam, grootte: 8, anker: "middle", kleur: "#9ca3af" });
  }
  if (kast) {
    const [kx, ky] = kast;
    stukken.push(
      { soort: "rechthoek", x: kx - 9, y: ky - 7, breedte: 18, hoogte: 14, vul: ZWART },
      { soort: "tekst", x: kx, y: ky + 3, tekst: "VK", grootte: 7, anker: "middle", vet: true, kleur: "#ffffff" },
    );
  }
  for (const p of punten) {
    const [px, py] = op([p.x, p.y]);
    stukken.push(
      { soort: "cirkel", x: px, y: py, r: 3.5, vul: p.kleur },
      { soort: "tekst", x: px + 5, y: py - 3, tekst: p.nummer, grootte: 7.5, vet: true, kleur: p.kleur },
    );
  }
  // Een schaalstok van een ronde lengte, een tachtigtal punten lang.
  const meter = [1, 2, 5, 10, 20, 50].find((m) => m * schaal >= 60) ?? 50;
  const stok = meter * schaal;
  const sy = (y1 - y0) * schaal + 14;
  stukken.push(
    { soort: "lijn", punten: [[0, sy], [stok, sy]], dikte: 2 },
    { soort: "tekst", x: stok + 6, y: sy + 3, tekst: `${meter} m`, grootte: 7.5, kleur: GRIJS },
  );
  return { breedte: Math.ceil((x1 - x0) * schaal), hoogte: Math.ceil(sy + 12), stukken };
}
