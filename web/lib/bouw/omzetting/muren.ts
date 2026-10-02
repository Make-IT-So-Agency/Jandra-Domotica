import { binnen, binnenRuimte, inKader, kaderVan, oppervlakte, vereenvoudig, zwaartepunt } from "./geometrie";
import type { Blad, Kader, Ruimtevoorstel, Xy } from "./types";

/**
 * De muren van een grondplan, voor het 3D-model. Een tekenpakket als
 * Vectorworks vult een doorgesneden muur met grijs: de buitenmuren lichter,
 * de binnenmuren donkerder, en tussen de stukken muur zitten de ramen en
 * deuren als open plekken.
 *
 * Een vlak is een muur als het:
 * - grijs of zwart gevuld is (geen kleur, geen wit of bijna-wit, geen arcering);
 * - buiten de ruimtes ligt: een meubel ligt erin, een muur ertussen;
 * - tegen een ruimte aan ligt, binnen 60 cm;
 * - niet te klein en niet te groot is.
 *
 * Puur, met tests. Alles in paginapunten.
 */

/** Grijs: rood, groen en blauw bijna gelijk, en niet lichter dan #dcdcdc. */
export function isMuurkleur(kleur: string | null): boolean {
  if (!kleur || !/^#[0-9a-f]{6}$/.test(kleur)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(kleur.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 10 && Math.max(r, g, b) <= 0xdc;
}

/** Hoeveel van een veelhoek buiten de ruimtes ligt, geschat met een raster van punten erin. */
function deelBuitenRuimtes(ring: Xy[], ruimtes: Xy[][][], kader: Kader): number {
  let erin = 0;
  let buiten = 0;
  const stappen = 6;
  for (let i = 0; i <= stappen; i++) {
    for (let j = 0; j <= stappen; j++) {
      const p: Xy = [kader.x0 + ((kader.x1 - kader.x0) * (i + 0.5)) / (stappen + 1), kader.y0 + ((kader.y1 - kader.y0) * (j + 0.5)) / (stappen + 1)];
      if (!binnen(p, ring)) continue;
      erin++;
      if (!ruimtes.some((ruimte) => binnenRuimte(p, ruimte))) buiten++;
    }
  }
  // Een smalle muur kan tussen de rasterpunten vallen: dan beslist het zwaartepunt.
  if (erin === 0) return ruimtes.some((ruimte) => binnenRuimte(zwaartepunt(ring), ruimte)) ? 0 : 1;
  return buiten / erin;
}

function afstandTotRuimtes(ring: Xy[], randen: { a: Xy; b: Xy }[], max: number): number {
  let beste = Infinity;
  for (const p of ring) {
    for (const { a, b } of randen) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lengte2 = dx * dx + dy * dy;
      const t = lengte2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengte2));
      const afstand = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      if (afstand < beste) beste = afstand;
      if (beste <= max) return beste;
    }
  }
  return beste;
}

export function vindMuren(blad: Blad, ruimtes: Pick<Ruimtevoorstel, "ringen">[], meterPerPunt: number, gebied: Kader | null): Xy[][] {
  if (ruimtes.length === 0 || !gebied) return [];
  const ringen = ruimtes.map((ruimte) => ruimte.ringen);
  const randen = ringen.flatMap((ruimte) => ruimte.flatMap((ring) => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] }))));
  const m2 = meterPerPunt * meterPerPunt;
  const tegenAan = 0.6 / meterPerPunt;

  const muren: Xy[][] = [];
  for (const pad of blad.paden) {
    if (!isMuurkleur(pad.vul)) continue;
    for (const deel of pad.delen) {
      const ring = vereenvoudig(deel.punten, 0.01);
      if (ring.length < 3) continue;
      const opp = Math.abs(oppervlakte(ring)) * m2;
      if (opp < 0.005 || opp > 40) continue;
      const kader = kaderVan(ring);
      // Een vlak van minder dan 3 cm breed is een lijn, geen muur.
      if (Math.min(kader.x1 - kader.x0, kader.y1 - kader.y0) * meterPerPunt < 0.03 && opp < 0.05) continue;
      if (!inKader(zwaartepunt(ring), gebied)) continue;
      if (deelBuitenRuimtes(ring, ringen, kader) < 0.8) continue;
      if (afstandTotRuimtes(ring, randen, tegenAan) > tegenAan) continue;
      muren.push(ring);
    }
  }
  return muren;
}
