/**
 * Het rekenwerk achter inzoomen en verschuiven in de planviewer. Puur, zodat
 * het zonder browser te testen valt.
 *
 * Een beeld zegt waar de pagina op het scherm staat:
 *
 *   scherm = pagina × zoom + (x, y)
 *
 * met de pagina in PDF-punten (1/72 inch, oorsprong linksboven) en het scherm
 * in CSS-pixels binnen het vak van de viewer.
 */

export interface Punt {
  x: number;
  y: number;
}

export interface Beeld {
  x: number;
  y: number;
  zoom: number;
}

export interface Maat {
  breedte: number;
  hoogte: number;
}

export interface Grenzen {
  min: number;
  max: number;
}

export function schermNaarPagina(beeld: Beeld, p: Punt): Punt {
  return { x: (p.x - beeld.x) / beeld.zoom, y: (p.y - beeld.y) / beeld.zoom };
}

export function paginaNaarScherm(beeld: Beeld, p: Punt): Punt {
  return { x: p.x * beeld.zoom + beeld.x, y: p.y * beeld.zoom + beeld.y };
}

export function begrens(zoom: number, grenzen: Grenzen): number {
  return Math.min(grenzen.max, Math.max(grenzen.min, zoom));
}

/** Zoomt met factor rond een punt op het scherm; dat punt blijft liggen. */
export function zoomRond(beeld: Beeld, anker: Punt, factor: number, grenzen: Grenzen): Beeld {
  const zoom = begrens(beeld.zoom * factor, grenzen);
  const onder = schermNaarPagina(beeld, anker);
  return { zoom, x: anker.x - onder.x * zoom, y: anker.y - onder.y * zoom };
}

export function verschuif(beeld: Beeld, dx: number, dy: number): Beeld {
  return { ...beeld, x: beeld.x + dx, y: beeld.y + dy };
}

function midden(a: Punt, b: Punt): Punt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function afstand(a: Punt, b: Punt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface Knijpbegin {
  beeld: Beeld;
  a: Punt;
  b: Punt;
}

/**
 * Twee vingers: de zoom volgt de afstand tussen de vingers, en wat onder het
 * midden lag bij het begin, blijft onder het midden van nu. Zo kan je in één
 * beweging zoomen en verschuiven.
 */
export function knijp(begin: Knijpbegin, a: Punt, b: Punt, grenzen: Grenzen): Beeld {
  const startAfstand = afstand(begin.a, begin.b);
  if (startAfstand < 1) return begin.beeld;

  const zoom = begrens(begin.beeld.zoom * (afstand(a, b) / startAfstand), grenzen);
  const onder = schermNaarPagina(begin.beeld, midden(begin.a, begin.b));
  const nu = midden(a, b);
  return { zoom, x: nu.x - onder.x * zoom, y: nu.y - onder.y * zoom };
}

/** De hele pagina in het vak, gecentreerd, met wat marge. */
export function passendBeeld(vak: Maat, pagina: Maat, marge = 16): Beeld {
  const beschikbaar = {
    breedte: Math.max(1, vak.breedte - 2 * marge),
    hoogte: Math.max(1, vak.hoogte - 2 * marge),
  };
  const zoom = Math.min(beschikbaar.breedte / pagina.breedte, beschikbaar.hoogte / pagina.hoogte);
  return {
    zoom,
    x: (vak.breedte - pagina.breedte * zoom) / 2,
    y: (vak.hoogte - pagina.hoogte * zoom) / 2,
  };
}

/** Een stuk van de pagina in het vak, gecentreerd, met wat marge; bv. enkel het gebouw. */
export function passendStuk(
  vak: Maat,
  stuk: { x: number; y: number; breedte: number; hoogte: number },
  marge = 16,
): Beeld {
  const zoom = Math.min(
    Math.max(1, vak.breedte - 2 * marge) / Math.max(1, stuk.breedte),
    Math.max(1, vak.hoogte - 2 * marge) / Math.max(1, stuk.hoogte),
  );
  return {
    zoom,
    x: (vak.breedte - stuk.breedte * zoom) / 2 - stuk.x * zoom,
    y: (vak.hoogte - stuk.hoogte * zoom) / 2 - stuk.y * zoom,
  };
}

/**
 * Hoe scherp het basisbeeld gerenderd wordt. Een iPad of iPhone weigert een
 * canvas boven ongeveer 16,7 miljoen pixels; we blijven ruim onder de helft,
 * want daarnaast komt nog het detailbeeld.
 */
export const MAX_PIXELS_BASIS = 8_000_000;

export function basisSchaal(pagina: Maat, gewenst: number, maxPixels = MAX_PIXELS_BASIS): number {
  const pixels = pagina.breedte * pagina.hoogte * gewenst * gewenst;
  return pixels <= maxPixels ? gewenst : Math.sqrt(maxPixels / (pagina.breedte * pagina.hoogte));
}

/**
 * Het stuk van de pagina dat nu in beeld is, in paginacoördinaten, begrensd
 * tot de pagina. null als de pagina helemaal buiten beeld ligt.
 */
export function zichtbaarStuk(
  beeld: Beeld,
  vak: Maat,
  pagina: Maat,
): { x: number; y: number; breedte: number; hoogte: number } | null {
  const lb = schermNaarPagina(beeld, { x: 0, y: 0 });
  const ro = schermNaarPagina(beeld, { x: vak.breedte, y: vak.hoogte });
  const x0 = Math.max(0, lb.x);
  const y0 = Math.max(0, lb.y);
  const x1 = Math.min(pagina.breedte, ro.x);
  const y1 = Math.min(pagina.hoogte, ro.y);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, breedte: x1 - x0, hoogte: y1 - y0 };
}
