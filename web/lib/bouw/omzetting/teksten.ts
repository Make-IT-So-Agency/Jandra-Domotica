/**
 * Wat de teksten op een plan betekenen: een oppervlakte, een plafondhoogte,
 * een peil, een raammaat, een schaal, of een naam. Puur, met tests.
 *
 * Afgestemd op hoe Belgische architecten hun plannen beschriften, met wat
 * speling in de schrijfwijze: "12,35 m²", "12.35m2", "PH = 280", "NIVO +320",
 * "205 x 275", "1:50", "schaal 1/50".
 */

function getal(ruw: string): number {
  return Number(ruw.replace(",", "."));
}

/** Een oppervlakte in m², zoals "12,35 m²" of "12,35m2". */
export function leesOppervlakte(tekst: string): number | null {
  const m = tekst.trim().match(/^(\d{1,4}(?:[,.]\d{1,3})?)\s*m(?:2|²)$/i);
  if (!m) return null;
  const waarde = getal(m[1]);
  return waarde > 0 ? waarde : null;
}

/**
 * Een hoogte of peil: in centimeter zonder komma ("280", "+320", "000"), in
 * meter met komma ("2,80", "+3,20").
 */
function hoogteInMeter(ruw: string): number {
  return /[,.]/.test(ruw) ? getal(ruw) : getal(ruw) / 100;
}

/** De plafondhoogte uit "PH = 280" of "PH 2,80", in meter. */
export function leesPlafondhoogte(tekst: string): number | null {
  const m = tekst.trim().match(/^P\.?H\.?\s*[=:]?\s*(\d{1,4}(?:[,.]\d{1,3})?)\s*(?:cm|m)?$/i);
  if (!m) return null;
  const waarde = hoogteInMeter(m[1]);
  return waarde > 1 && waarde < 20 ? waarde : null;
}

/** Het vloerpeil uit "NIVO 000", "NIVO +320" of "peil -0,15", in meter. */
export function leesPeil(tekst: string): number | null {
  const m = tekst.trim().match(/^(?:NIVO|niveau|peil|VP)\s*[=:]?\s*([+-]?\s*\d{1,4}(?:[,.]\d{1,3})?)\s*(?:cm|m)?$/i);
  if (!m) return null;
  const waarde = hoogteInMeter(m[1].replace(/\s/g, ""));
  return Math.abs(waarde) < 100 ? waarde : null;
}

/** Een raam als "205 x 275": breedte en hoogte in centimeter, terug in meter. */
export function leesRaammaat(tekst: string): { breedte: number; hoogte: number } | null {
  const m = tekst.trim().match(/^(\d{2,3})\s*[x×]\s*(\d{2,3})$/i);
  if (!m) return null;
  const breedte = Number(m[1]) / 100;
  const hoogte = Number(m[2]) / 100;
  return breedte >= 0.2 && hoogte >= 0.2 ? { breedte, hoogte } : null;
}

/**
 * De noemer van een schaal: 50 uit "1:50", "1/50", "schaal 1 : 50". Een datum
 * als 01/10/2026 is geen schaal: voor de 1 mag geen cijfer staan, en na de
 * noemer geen schuine streep of cijfer.
 */
export function leesSchaal(tekst: string): number | null {
  if (tekst.length > 40) return null;
  const m = tekst.match(/(?<![\d.,/])1\s*[:/]\s*(\d{1,4})(?![\d/.,])/);
  if (!m) return null;
  const noemer = Number(m[1]);
  return noemer >= 1 && noemer <= 5000 ? noemer : null;
}

/** Een datum als 01/10/2026 of 1-10-2026, als YYYY-MM-DD. */
export function leesDatum(tekst: string): string | null {
  const m = tekst.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [dag, maand, jaar] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const moment = new Date(Date.UTC(jaar, maand - 1, dag));
  if (moment.getUTCFullYear() !== jaar || moment.getUTCMonth() !== maand - 1 || moment.getUTCDate() !== dag) return null;
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

/**
 * Kan dit de naam van een ruimte zijn? Geen getal, maat, oppervlakte,
 * hoogte, peil of technische afkorting.
 */
export function isNaamachtig(tekst: string): boolean {
  const schoon = tekst.trim();
  if (schoon.length < 2 || schoon.length > 60) return false;
  if (!/\p{L}{2}/u.test(schoon)) return false;
  if (leesOppervlakte(schoon) !== null || leesPlafondhoogte(schoon) !== null || leesPeil(schoon) !== null) return false;
  if (/^(P\.?H|BW|VPH|HPH|NIVO|peil)\b/i.test(schoon)) return false;
  if (/deurspleet/i.test(schoon)) return false;
  // Maten met een eenheid of een letter erbij: "90 cm", "2 x 60", "Ø 110".
  if (/^[\d\s.,/x×=+\-–()Øø%°]+(cm|mm|m|m2|m²|m3|m³)?$/i.test(schoon)) return false;
  return true;
}
