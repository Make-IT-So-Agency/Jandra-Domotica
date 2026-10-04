/**
 * Testplannen die de structuur van een echt dossier nabootsen, zoals een
 * tekenpakket als Vectorworks het als PDF uitvoert:
 *
 * - elke ruimte is een wit gevuld vlak met precies de oppervlakte van haar
 *   label, en achter het label ligt een klein wit tekstvlak;
 * - muren zijn grijze vlakken met een dikke zwarte rand en een arcering van
 *   0,07 pt;
 * - deuren zijn kwartcirkels, ramen hebben een label als "205 x 275";
 * - per verdieping één keer "PH = 280" en "NIVO 000";
 * - een titelblok met de titel, de bladcode, de schaal en de datum.
 *
 * Het huis wordt in meter getekend, binnen een transformatie naar het blad;
 * zo test het meteen of de CTM goed gevolgd wordt. Alles is verzonnen: er
 * komt nooit een echt plan in de repository.
 */

import { g, maakPdf, pdf, type Bladzijde } from "./pdf-schrijver";

type Xy = [number, number];

export const A3 = { breedte: 842, hoogte: 1191 };

/** Punten per meter op schaal 1:n. */
export function puntPerMeter(noemer: number): number {
  return 72 / 0.0254 / noemer;
}

export interface Testruimte {
  naam: string;
  /** In meter, in het assenstelsel van het huis (y naar beneden). */
  punten: Xy[];
  /** Het label zoals de architect het schrijft, of null voor een vlak zonder label. */
  label: string | null;
  /** Waar naam en label staan. */
  tekstOp: Xy;
  /** Kleine opschriften in de ruimte, zoals "wasmachine" of "PH = 280". */
  opschriften?: string[];
}

export interface Testdeur {
  scharnier: Xy;
  straal: number;
  /** De hoek waar de boog begint, in graden; hij loopt een kwartslag verder. */
  van: number;
}

/** Een trap op het plan: de treden van elke vlucht, en eventueel een pijltje naar boven. */
export interface Testtrap {
  vluchten: { treden: [Xy, Xy][]; streepjes?: boolean }[];
  pijl?: { op: Xy; richting: Xy };
}

export interface Testgrondplan {
  titel: string[];
  bladcode: string | null;
  schaaltekst: string | null;
  /** De schaal waarop echt getekend wordt; meestal dezelfde als in het titelblok. */
  tekenschaal: number;
  ruimtes: Testruimte[];
  muren: [Xy, Xy][];
  deuren: Testdeur[];
  ramen: { label: string; op: Xy }[];
  trappen?: Testtrap[];
  /** Luifels: een lijn in streepjes van de gevel tot weer op de gevel, met een tekst erin. */
  luifels?: { lijn: Xy[]; tekst: string; tekstOp: Xy }[];
  /** Waar het huis op het blad ligt, in meter vanaf de linkerbovenhoek van het tekenvak. */
  verschuiving: Xy;
  draai?: 0 | 90 | 180 | 270;
  datum?: string;
}

const BUITENMUREN: [Xy, Xy][] = [
  [[0, 0], [10, 0.4]],
  [[0, 7.6], [10, 8]],
  [[0, 0.4], [0.4, 7.6]],
  [[9.6, 0.4], [10, 7.6]],
];

/**
 * Een trap die halfweg 180° draait, zoals in een echt dossier: de onderste
 * vlucht in volle lijnen met een pijl naar het bordes, de bovenste (boven de
 * snede) in streepjes terug.
 */
export function keertrap(): Testtrap {
  const xs = Array.from({ length: 8 }, (_, k) => 0.6 + k * 0.22);
  return {
    vluchten: [
      { treden: xs.map((x) => [[x, 6.3], [x, 7.3]] as [Xy, Xy]) },
      { treden: xs.map((x) => [[x, 5.14], [x, 6.14]] as [Xy, Xy]), streepjes: true },
    ],
    pijl: { op: [1.3, 6.8], richting: [1, 0] },
  };
}

/** Het gelijkvloers: leefruimte in L-vorm, keuken, inkom met trapbordes, berging/technieken. */
export function gelijkvloers(opties: { keukenwand?: number; trap?: boolean; luifel?: boolean } = {}): Testgrondplan {
  const wand = opties.keukenwand ?? 6.0;
  const leef = (wand - 0.4) * 3.6 + 3.6 * 3.6;
  const keuken = (9.6 - wand - 0.14) * 3.6;
  const komma = (waarde: number) => `${(Math.round(waarde * 100) / 100).toFixed(2).replace(".", ",")}m2`;
  return {
    titel: ["GELIJKVLOERS"],
    bladcode: "BA_woning_P_N_1",
    schaaltekst: "1:50",
    tekenschaal: 50,
    ruimtes: [
      {
        naam: "leefruimte",
        punten: [[0.4, 0.4], [wand, 0.4], [wand, 4.0], [4.0, 4.0], [4.0, 7.6], [0.4, 7.6]],
        label: komma(leef),
        tekstOp: [2.0, 2.5],
        opschriften: ["PH = 280", "NIVO 000"],
      },
      {
        naam: "keuken",
        punten: [[wand + 0.14, 0.4], [9.6, 0.4], [9.6, 4.0], [wand + 0.14, 4.0]],
        label: komma(keuken),
        tekstOp: [(wand + 9.74) / 2, 2.0],
      },
      {
        naam: "inkom",
        punten: [[4.14, 4.14], [7.5, 4.14], [7.5, 7.6], [5.14, 7.6], [5.14, 6.0], [4.14, 6.0]],
        label: "10,03m2",
        tekstOp: [6.3, 5.2],
      },
      {
        naam: "berging/technieken",
        punten: [[7.64, 4.14], [9.6, 4.14], [9.6, 7.6], [7.64, 7.6]],
        label: "6,78m2",
        tekstOp: [8.62, 5.6],
        opschriften: ["wasmachine"],
      },
      {
        naam: "",
        punten: [[4.14, 6.0], [5.14, 6.0], [5.14, 7.6], [4.14, 7.6]],
        label: null,
        tekstOp: [4.64, 6.8],
        opschriften: ["PH = 430"],
      },
    ],
    muren: [
      ...BUITENMUREN,
      [[wand, 0.4], [wand + 0.14, 4.0]],
      [[4.0, 4.0], [9.6, 4.14]],
      [[4.0, 4.14], [4.14, 7.6]],
      [[7.5, 4.14], [7.64, 7.6]],
    ],
    deuren: [
      { scharnier: [4.14, 4.3], straal: 0.9, van: 0 },
      { scharnier: [wand + 0.3, 3.8], straal: 0.9, van: -90 },
      { scharnier: [7.64, 4.3], straal: 0.8, van: 0 },
      { scharnier: [5.3, 7.45], straal: 1.0, van: -90 },
    ],
    ramen: [
      { label: "205 x 275", op: [2.0, -0.7] },
      { label: "120 x 275", op: [8.0, -0.7] },
      // Een maat op een maatlijn buiten de muur, en een borstwering binnen.
      ...(opties.luifel
        ? [
            { label: "180/275", op: [4.5, -1.6] as Xy },
            { label: "BW = 40", op: [8.0, 0.7] as Xy },
          ]
        : []),
    ],
    trappen: opties.trap ? [keertrap()] : [],
    luifels: opties.luifel
      ? [
          {
            lijn: [
              [1, 0],
              [1, -1],
              [8, -1],
              [8, 0],
            ],
            tekst: "oversteek 100 cm",
            tekstOp: [4.5, -0.5],
          },
        ]
      : [],
    verschuiving: [2.0, 2.0],
    datum: "01/10/2026",
  };
}

/** De verdieping: dezelfde buitenmuren, andere ruimtes. */
export function verdieping(): Testgrondplan {
  return {
    titel: ["VERDIEPING"],
    bladcode: "BA_woning_P_N_2",
    schaaltekst: "1:50",
    tekenschaal: 50,
    ruimtes: [
      {
        naam: "slaapkamer 1",
        punten: [[0.4, 0.4], [5.0, 0.4], [5.0, 4.0], [0.4, 4.0]],
        label: "16,56m2",
        tekstOp: [2.7, 2.0],
        opschriften: ["PH = 260", "NIVO 320"],
      },
      {
        naam: "badk 1",
        punten: [[5.14, 0.4], [9.6, 0.4], [9.6, 4.0], [5.14, 4.0]],
        label: "16,06m2",
        tekstOp: [7.37, 2.0],
      },
      {
        naam: "nachthal",
        punten: [[0.4, 4.14], [9.6, 4.14], [9.6, 7.6], [0.4, 7.6]],
        label: "31,83m2",
        tekstOp: [5.0, 5.8],
      },
    ],
    muren: [...BUITENMUREN, [[5.0, 0.4], [5.14, 4.0]], [[0.4, 4.0], [9.6, 4.14]]],
    deuren: [
      { scharnier: [1.0, 4.0], straal: 0.83, van: -90 },
      { scharnier: [6.0, 4.0], straal: 0.83, van: -90 },
    ],
    ramen: [],
    // Iets anders op het blad dan het gelijkvloers, zoals bij een echte architect.
    verschuiving: [2.37, 1.79],
    datum: "01/10/2026",
  };
}

/** Het grondplan van een bijgebouw, met de gebouwnaam apart in het titelblok. */
export function bijgebouw(): Testgrondplan {
  return {
    titel: ["GRONDPLAN", "BIJGEBOUW"],
    bladcode: "BA_bijgebouw_P_N_1",
    schaaltekst: "1:50",
    tekenschaal: 50,
    ruimtes: [
      {
        naam: "tuinberging",
        punten: [[0.3, 0.3], [4.3, 0.3], [4.3, 4.3], [0.3, 4.3]],
        label: "16,00m2",
        tekstOp: [2.3, 2.0],
        opschriften: ["PH = 240", "NIVO 000"],
      },
    ],
    muren: [
      [[0, 0], [4.6, 0.3]],
      [[0, 4.3], [4.6, 4.6]],
      [[0, 0.3], [0.3, 4.3]],
      [[4.3, 0.3], [4.6, 4.3]],
    ],
    deuren: [{ scharnier: [1.0, 4.3], straal: 0.93, van: -90 }],
    ramen: [],
    verschuiving: [3, 3],
    datum: "01/10/2026",
  };
}

/** Hoe breed een tekst ongeveer is, in keer de lettergrootte: Helvetica is gemiddeld een halve letter breed. */
function tekstbreedte(tekst: string): number {
  return tekst.length * 0.5;
}

/** Het titelblok rechtsonder, zoals op elk blad van het dossier. */
function titelblok(
  breedte: number,
  titel: string[],
  bladcode: string | null,
  schaaltekst: string | null,
  datum?: string,
): string[] {
  const x = breedte - 410;
  const regels = [
    pdf.bewaar(),
    pdf.vulkleur("#ffffff"),
    pdf.lijnkleur("#000000"),
    pdf.dikte(0.5),
    pdf.rechthoek(x, 20, 390, 150),
    pdf.vulEnTrek(),
    pdf.vulkleur("#000000"),
    pdf.tekst(x + 10, 150, 12, "OMGEVINGSDOSSIER"),
    ...titel.map((regel, i) => pdf.tekst(x + 10, 120 - i * 24, 19.9, regel)),
  ];
  if (bladcode) regels.push(pdf.tekst(x + 10, 40, 8.9, bladcode));
  if (schaaltekst) regels.push(pdf.tekst(x + 230, 40, 8, schaaltekst));
  if (datum) regels.push(pdf.tekst(x + 300, 40, 8, datum));
  regels.push(pdf.herstel());
  return regels;
}

/** Een kwartcirkel als Bézier-boog rond m met straal r, van hoek a (graden) een kwartslag verder. */
function kwartboog(m: Xy, r: number, a: number): [Xy, Xy, Xy, Xy] {
  const k = 0.5523 * r;
  const t0 = (a * Math.PI) / 180;
  const t1 = t0 + Math.PI / 2;
  const p0: Xy = [m[0] + r * Math.cos(t0), m[1] + r * Math.sin(t0)];
  const p3: Xy = [m[0] + r * Math.cos(t1), m[1] + r * Math.sin(t1)];
  const p1: Xy = [p0[0] - k * Math.sin(t0), p0[1] + k * Math.cos(t0)];
  const p2: Xy = [p3[0] + k * Math.sin(t1), p3[1] - k * Math.cos(t1)];
  return [p0, p1, p2, p3];
}

/** Eén grondplan als bladzijde. */
export function grondplanblad(plan: Testgrondplan): Bladzijde {
  const s = puntPerMeter(plan.tekenschaal);
  const [vx, vy] = plan.verschuiving;
  // Van huis (meter, y naar beneden) naar het blad (punten, y naar boven).
  const naarBlad = ([x, y]: Xy): Xy => [60 + (vx + x) * s, A3.hoogte - (60 + (vy + y) * s)];
  const lijndikte = (punten: number) => pdf.dikte(punten / s);

  const inhoud: string[] = [];
  // Het huis, in meter binnen één transformatie.
  inhoud.push(pdf.bewaar(), pdf.matrix(s, 0, 0, -s, 60 + vx * s, A3.hoogte - 60 - vy * s));

  // Ruimtevlakken eerst, dan de muren erover.
  inhoud.push(pdf.vulkleur("#ffffff"));
  for (const ruimte of plan.ruimtes) inhoud.push(pdf.veelhoek(ruimte.punten), pdf.vul());

  for (const [[x0, y0], [x1, y1]] of plan.muren) {
    inhoud.push(
      pdf.vulkleur("#c8c8c8"),
      pdf.lijnkleur("#000000"),
      lijndikte(0.72),
      pdf.rechthoek(x0, y0, x1 - x0, y1 - y0),
      pdf.vulEnTrek(),
      // De arcering: dunne schuine lijntjes.
      lijndikte(0.07),
      ...Array.from({ length: Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 0.5)) }, (_, i) => {
        const langs = x1 - x0 > y1 - y0;
        const a: Xy = langs ? [x0 + i * 0.5, y0] : [x0, y0 + i * 0.5];
        const b: Xy = langs ? [Math.min(x1, x0 + i * 0.5 + 0.3), y1] : [x1, Math.min(y1, y0 + i * 0.5 + 0.3)];
        return `${pdf.lijn(a, b)} S`;
      }),
    );
  }

  inhoud.push(pdf.lijnkleur("#000000"), lijndikte(0.29));
  for (const deur of plan.deuren) {
    const [p0, p1, p2, p3] = kwartboog(deur.scharnier, deur.straal, deur.van);
    inhoud.push(pdf.boog(p0, p1, p2, p3), pdf.trek(), pdf.lijn(deur.scharnier, p3), pdf.trek());
  }

  // De luifels: boven de snede, dus in streepjes.
  for (const luifel of plan.luifels ?? []) {
    inhoud.push(
      pdf.lijnkleur("#000000"),
      lijndikte(0.36),
      pdf.streep([0.2, 0.1]),
      `${luifel.lijn.map(([x, y], i) => `${g(x)} ${g(y)} ${i === 0 ? "m" : "l"}`).join(" ")} S`,
      pdf.streep([]),
    );
  }

  // De trappen: elke trede een lijn, het deel boven de snede in streepjes, en een gevuld pijltje.
  for (const trap of plan.trappen ?? []) {
    for (const vlucht of trap.vluchten) {
      if (vlucht.streepjes) inhoud.push(pdf.streep([0.2, 0.07]));
      for (const [a, b] of vlucht.treden) inhoud.push(pdf.lijn(a, b), pdf.trek());
      if (vlucht.streepjes) inhoud.push(pdf.streep([]));
    }
    if (trap.pijl) {
      const { op, richting: r } = trap.pijl;
      const n: Xy = [-r[1], r[0]];
      const top: Xy = [op[0] + r[0] * 0.12, op[1] + r[1] * 0.12];
      const a: Xy = [op[0] - r[0] * 0.08 + n[0] * 0.04, op[1] - r[1] * 0.08 + n[1] * 0.04];
      const b: Xy = [op[0] - r[0] * 0.08 - n[0] * 0.04, op[1] - r[1] * 0.08 - n[1] * 0.04];
      inhoud.push(pdf.vulkleur("#000000"), pdf.veelhoek([top, a, b]), pdf.vul());
    }
  }
  inhoud.push(pdf.herstel());

  // Teksten op het blad zelf, met een wit tekstvlak achter elk label.
  const tekstMidden = (tekst: string, grootte: number, op: Xy, regel: number): string[] => {
    const [x, y] = naarBlad(op);
    const breedte = tekstbreedte(tekst) * grootte;
    const basis = y - regel * grootte * 1.3;
    return [pdf.tekst(x - breedte / 2, basis, grootte, tekst)];
  };
  for (const ruimte of plan.ruimtes) {
    let regel = 0;
    if (ruimte.naam) inhoud.push(...tekstMidden(ruimte.naam, 12, ruimte.tekstOp, regel++));
    if (ruimte.label) {
      const [x, y] = naarBlad(ruimte.tekstOp);
      const breedte = tekstbreedte(ruimte.label) * 8;
      const basis = y - regel * 12 * 1.3;
      inhoud.push(
        pdf.vulkleur("#ffffff"),
        pdf.rechthoek(x - breedte / 2 - 1.5, basis - 2, breedte + 3, 10),
        pdf.vul(),
        pdf.vulkleur("#000000"),
        pdf.tekst(x - breedte / 2, basis, 8, ruimte.label),
      );
      regel++;
    }
    inhoud.push(pdf.vulkleur("#000000"));
    for (const opschrift of ruimte.opschriften ?? []) inhoud.push(...tekstMidden(opschrift, 7, ruimte.tekstOp, regel++));
  }
  inhoud.push(pdf.vulkleur("#000000"));
  for (const raam of plan.ramen) inhoud.push(...tekstMidden(raam.label, 7, raam.op, 0));
  for (const luifel of plan.luifels ?? []) inhoud.push(...tekstMidden(luifel.tekst, 6, luifel.tekstOp, 0));

  inhoud.push(...titelblok(A3.breedte, plan.titel, plan.bladcode, plan.schaaltekst, plan.datum));
  return { ...A3, inhoud, draai: plan.draai };
}

/** Een blad met enkel een titelblok en wat lijnen, zoals een gevel of een doorsnede. */
export function anderBlad(titel: string[], bladcode: string | null, schaaltekst: string | null, liggend = true): Bladzijde {
  const maat = liggend ? { breedte: A3.hoogte, hoogte: A3.breedte } : A3;
  return {
    ...maat,
    inhoud: [
      pdf.lijnkleur("#000000"),
      pdf.dikte(0.72),
      pdf.rechthoek(100, 300, 500, 250),
      pdf.trek(),
      ...titelblok(maat.breedte, titel, bladcode, schaaltekst, "01/10/2026"),
    ],
  };
}

export function testplanPdf(plan: Testgrondplan): Uint8Array {
  return maakPdf([grondplanblad(plan)]);
}

/** Een dossier zoals de architect het indient: alle bladen in één PDF. */
export function testdossier(): Uint8Array {
  return maakPdf([
    anderBlad(["LINKERGEVEL", "BIJGEBOUW", "VOORGEVEL"], "BA_bijgebouw_G_N_1", "1:50"),
    grondplanblad(bijgebouw()),
    anderBlad(["VOORGEVEL"], "BA_woning_G_N_1", "1:50"),
    grondplanblad(gelijkvloers()),
    grondplanblad(verdieping()),
    anderBlad(["DAKENPLAN"], "BA_woning_P_N_3", "1:50", false),
    anderBlad(["FUNDERINGS- en RIOLERINGSPLAN"], "BA_woning_P_N_4", "1:50", false),
    anderBlad(["DOORSNEDE AA'"], "BA_woning_S_N_1", "1:50"),
    anderBlad(["INPLANTINGSPLAN", "ontworpen toestand"], "BA_woning_I_N_1", "1:200", false),
    anderBlad(["LEGENDE"], "BA_woning_L_N_1", null),
    anderBlad(["TERREINPROFIEL T1"], "BA_woning_T_N_1", "1:200"),
    anderBlad(["Schets keuken"], null, null),
  ]);
}
