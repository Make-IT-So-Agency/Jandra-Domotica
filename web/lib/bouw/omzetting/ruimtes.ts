import {
  binnenRuimte,
  inKader,
  kaderVan,
  middenVan,
  omtrek,
  rond,
  vergrootKader,
  zwaartepunt,
} from "./geometrie";
import { MARGE, afwijking, meestVoorkomend, oppervlaktelabels, vlakkenRond, type Label } from "./schaal";
import { raadSoort } from "./soorten";
import { isNaamachtig, leesPeil, leesPlafondhoogte } from "./teksten";
import type { Blad, Kader, Kandidaat, Ruimtevoorstel, Schaal, Tekst, Xy } from "./types";
import type { Vlak } from "./vlakken";

/**
 * De ruimtes van een grondplan: elk m²-label met het witte vlak eromheen dat
 * precies die oppervlakte heeft. De naam is de grootste andere tekst in dat
 * vlak. De overige witte vlakken die op een ruimte lijken, zijn kandidaten
 * om met de hand toe te voegen, zoals een trapbordes zonder label.
 */

/** Een label mag tot zoveel afwijken en toch zijn vlak krijgen, met een ⚠. */
const RUIME_MARGE = 0.05;

/** Rond het gebouw: ruimtes plus zoveel meter, voor de kandidaten en de AI-hulp later. */
const GEBIEDSMARGE_M = 1.5;

/** Een kandidaat-ruimte is minstens zo groot, en gemiddeld zo breed (geen muurstuk). */
const KANDIDAAT_MIN_M2 = 1;
const KANDIDAAT_MIN_BREEDTE_M = 0.45;

export interface Ruimteresultaat {
  ruimtes: Ruimtevoorstel[];
  kandidaten: Kandidaat[];
  verdieping: { vloerpeil: number | null; plafondhoogte: number | null };
  gebied: Kader | null;
  meldingen: string[];
}

function tekstpunt(tekst: Tekst): Xy {
  return [tekst.x, tekst.y];
}

function tekstenIn(teksten: Tekst[], vlak: Vlak): Tekst[] {
  return teksten.filter((tekst) => inKader(tekstpunt(tekst), vlak.kader) && binnenRuimte(tekstpunt(tekst), vlak.ringen));
}

/** De meest voorkomende waarde; bij gelijkstand de laagste. Afgerond op de centimeter. */
function gewoonste(waarden: (number | null)[]): number | null {
  return meestVoorkomend(waarden.filter((w): w is number => w !== null).map((w) => rond(w, 2)));
}

function mediaan(waarden: number[]): number {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 ? gesorteerd[midden] : (gesorteerd[midden - 1] + gesorteerd[midden]) / 2;
}

/** De naam uit de teksten in een ruimte: de grootste naamachtige, van boven naar onder gelezen. */
function naamUit(teksten: Tekst[], typisch: number | null): string {
  const kandidaten = teksten.filter((tekst) => isNaamachtig(tekst.tekst));
  if (kandidaten.length === 0) return "";
  const grootste = Math.max(...kandidaten.map((tekst) => tekst.grootte));
  // Een opschrift als "vestiaire" of "wasmachine" is kleiner dan een naam.
  if (typisch !== null && grootste < typisch * 0.8) return "";
  return kandidaten
    .filter((tekst) => tekst.grootte >= grootste * 0.9)
    .sort((a, b) => (Math.abs(a.y - b.y) > a.grootte * 0.5 ? a.y - b.y : a.x - b.x))
    .map((tekst) => tekst.tekst)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
}

function procent(fractie: number): string {
  return `${(fractie * 100).toFixed(1).replace(".", ",")} %`;
}

export function vindRuimtes(blad: Blad, vlakken: Vlak[], schaal: Schaal): Ruimteresultaat {
  const m2 = schaal.meterPerPunt * schaal.meterPerPunt;
  const meldingen: string[] = [];

  // 1. Elk label krijgt het vlak dat het best klopt. Een vlak gaat naar het
  //    label dat er het best bij past.
  const toegewezen = new Map<Vlak, { label: Label; afwijking: number }>();
  for (const label of oppervlaktelabels(blad.teksten)) {
    let beste: { vlak: Vlak; afwijking: number } | null = null;
    for (const vlak of vlakkenRond(label, vlakken)) {
      const verschil = afwijking(vlak, schaal.meterPerPunt, label);
      if (!beste || verschil < beste.afwijking) beste = { vlak, afwijking: verschil };
    }
    const gekozen = beste as { vlak: Vlak; afwijking: number } | null;
    if (!gekozen || gekozen.afwijking > RUIME_MARGE) {
      meldingen.push(`Bij het label ${label.tekst.tekst} vond ik geen vlak met die oppervlakte.`);
      continue;
    }
    const vorig = toegewezen.get(gekozen.vlak);
    if (vorig && vorig.afwijking <= gekozen.afwijking) {
      meldingen.push(`Het label ${label.tekst.tekst} staat in dezelfde ruimte als ${vorig.label.tekst.tekst}.`);
      continue;
    }
    if (vorig) meldingen.push(`Het label ${vorig.label.tekst.tekst} staat in dezelfde ruimte als ${label.tekst.tekst}.`);
    toegewezen.set(gekozen.vlak, { label, afwijking: gekozen.afwijking });
  }

  // 2. De gewone grootte van een naam op dit blad, om opschriften als
  //    "wasmachine" niet voor een naam te houden.
  const labelteksten = new Set([...toegewezen.values()].map((t) => t.label.tekst));
  const inhoud = new Map<Vlak, Tekst[]>();
  for (const vlak of toegewezen.keys()) {
    inhoud.set(vlak, tekstenIn(blad.teksten, vlak).filter((tekst) => !labelteksten.has(tekst)));
  }
  const grootsteNamen = [...inhoud.values()]
    .map((teksten) => teksten.filter((tekst) => isNaamachtig(tekst.tekst)).map((tekst) => tekst.grootte))
    .filter((groottes) => groottes.length > 0)
    .map((groottes) => Math.max(...groottes));
  const typisch = grootsteNamen.length > 0 ? mediaan(grootsteNamen) : null;

  // 3. Het peil en de plafondhoogte van de verdieping: wat het meest op het blad staat.
  const verdieping = {
    plafondhoogte: gewoonste(blad.teksten.map((tekst) => leesPlafondhoogte(tekst.tekst))),
    vloerpeil: gewoonste(blad.teksten.map((tekst) => leesPeil(tekst.tekst))),
  };
  const eigen = (teksten: Tekst[], lees: (tekst: string) => number | null, standaard: number | null) => {
    const waarde = teksten.map((tekst) => lees(tekst.tekst)).find((w) => w !== null) ?? null;
    return waarde !== null && waarde !== standaard ? waarde : null;
  };

  // 4. De ruimtes.
  const ruimtes: Ruimtevoorstel[] = [...toegewezen.entries()]
    .map(([vlak, { label, afwijking: verschil }]) => {
      const teksten = inhoud.get(vlak) ?? [];
      const naam = naamUit(teksten, typisch);
      const redenen: string[] = [];
      if (!naam) redenen.push("geen naam");
      if (verschil > MARGE) redenen.push(`de oppervlakte wijkt ${procent(verschil)} af van het plan`);
      return {
        sleutel: "",
        naam,
        soort: raadSoort(naam),
        ringen: vlak.ringen.map((ring) => ring.map(([x, y]) => [rond(x, 2), rond(y, 2)] as Xy)),
        oppervlakte: rond(vlak.oppervlakte * m2, 2),
        oppervlaktePlan: label.waarde,
        plafondhoogte: eigen(teksten, leesPlafondhoogte, verdieping.plafondhoogte),
        vloerpeil: eigen(teksten, leesPeil, verdieping.vloerpeil),
        status: redenen.length === 0 ? ("goed" as const) : ("nakijken" as const),
        redenen,
        mee: redenen.length === 0,
        ruimteId: null,
        kader: vlak.kader,
      };
    })
    // Zoals je een plan leest: van boven naar onder, en op dezelfde hoogte van links naar rechts.
    .sort((a, b) => (Math.abs(a.kader.y0 - b.kader.y0) > 20 ? a.kader.y0 - b.kader.y0 : a.kader.x0 - b.kader.x0))
    .map(({ kader: _kader, ...ruimte }, i) => ({ ...ruimte, sleutel: `r${i + 1}` }));

  const gebied =
    ruimtes.length > 0
      ? vergrootKader(kaderVan(ruimtes.flatMap((ruimte) => ruimte.ringen[0])), GEBIEDSMARGE_M / schaal.meterPerPunt)
      : null;

  // 5. Kandidaten: witte vlakken zonder label die op een ruimte lijken.
  const bladvlak = blad.breedte * blad.hoogte;
  const gezien: Kader[] = [];
  const kandidaten: Kandidaat[] = [];
  for (const vlak of vlakken) {
    if (toegewezen.has(vlak)) continue;
    const oppervlakteM2 = vlak.oppervlakte * m2;
    if (oppervlakteM2 < KANDIDAAT_MIN_M2 || vlak.oppervlakte > bladvlak * 0.5) continue;
    const gemiddeldeBreedte = (vlak.oppervlakte / (omtrek(vlak.ringen[0]) / 2)) * schaal.meterPerPunt;
    if (gemiddeldeBreedte < KANDIDAAT_MIN_BREEDTE_M) continue;
    const midden = middenVan(vlak.ringen);
    if (gebied && !inKader(midden, gebied)) continue;
    if (ruimtes.some((ruimte) => binnenRuimte(midden, ruimte.ringen))) continue;
    if (ruimtes.some((ruimte) => binnenRuimte(zwaartepunt(ruimte.ringen[0]), vlak.ringen))) continue;
    const dubbel = gezien.some(
      (k) =>
        Math.abs(k.x0 - vlak.kader.x0) < 0.5 &&
        Math.abs(k.y0 - vlak.kader.y0) < 0.5 &&
        Math.abs(k.x1 - vlak.kader.x1) < 0.5 &&
        Math.abs(k.y1 - vlak.kader.y1) < 0.5,
    );
    if (dubbel) continue;
    gezien.push(vlak.kader);
    const teksten = tekstenIn(blad.teksten, vlak);
    kandidaten.push({
      sleutel: `k${kandidaten.length + 1}`,
      ring: vlak.ringen[0].map(([x, y]) => [rond(x, 2), rond(y, 2)] as Xy),
      oppervlakte: rond(oppervlakteM2, 2),
      plafondhoogte: eigen(teksten, leesPlafondhoogte, verdieping.plafondhoogte),
      vloerpeil: eigen(teksten, leesPeil, verdieping.vloerpeil),
    });
  }

  return { ruimtes, kandidaten, verdieping, gebied, meldingen };
}
