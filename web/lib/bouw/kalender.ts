import { TIJDZONE } from "../periods";

/**
 * Rekenen met kalenderdagen (YYYY-MM-DD) voor de planning, de deadlines en de
 * bot. Een kalenderdag is geen tijdstip: alles gebeurt in UTC, zodat een
 * zomeruur er nooit een dag naast doet. Enkel "vandaag" hangt af van de
 * tijdzone, en dat is die van Brussel. Puur.
 */

const DAG_MS = 24 * 60 * 60 * 1000;

const vandaagFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIJDZONE });

/** Vandaag in Brussel, als YYYY-MM-DD. */
export function vandaag(nu = new Date()): string {
  return vandaagFormatter.format(nu);
}

function alsUtc(datum: string): number {
  const [jaar, maand, dag] = datum.split("-").map(Number);
  return Date.UTC(jaar, maand - 1, dag);
}

function alsDatum(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function plusDagen(datum: string, dagen: number): string {
  return alsDatum(alsUtc(datum) + dagen * DAG_MS);
}

/** Hoeveel dagen van `van` tot `tot`: negatief als `tot` al voorbij is. */
export function dagenTussen(van: string, tot: string): number {
  return Math.round((alsUtc(tot) - alsUtc(van)) / DAG_MS);
}

/** De maandag van de week waarin deze dag valt. */
export function maandagVan(datum: string): string {
  const weekdag = new Date(alsUtc(datum)).getUTCDay();
  return plusDagen(datum, -((weekdag + 6) % 7));
}

/** De eerste dag van de maand, en van de maand erna. */
export function beginVanMaand(datum: string): string {
  return `${datum.slice(0, 7)}-01`;
}

export function volgendeMaand(datum: string): string {
  const [jaar, maand] = datum.split("-").map(Number);
  return alsDatum(Date.UTC(jaar, maand, 1));
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

/** "9 mrt", of "9 mrt 2027" als het jaar verschilt van `tenOpzichteVan`. */
export function korteDatum(datum: string, tenOpzichteVan?: string): string {
  const [jaar, maand, dag] = datum.split("-").map(Number);
  const zelfdeJaar = tenOpzichteVan ? tenOpzichteVan.slice(0, 4) === datum.slice(0, 4) : false;
  return `${dag} ${MAANDEN[maand - 1]}${zelfdeJaar ? "" : ` ${jaar}`}`;
}

/** "ma 9 mrt": voor een lijst van deze en volgende week. */
export function dagMetWeekdag(datum: string): string {
  const weekdag = new Date(alsUtc(datum)).getUTCDay();
  const [, maand, dag] = datum.split("-").map(Number);
  return `${WEEKDAGEN[weekdag]} ${dag} ${MAANDEN[maand - 1]}`;
}

export function maandnaam(datum: string): string {
  return MAANDEN[Number(datum.slice(5, 7)) - 1];
}

/** "over 3 dagen", "morgen", "vandaag", "gisteren", "5 dagen te laat". */
export function dagenTekst(dagen: number): string {
  if (dagen === 0) return "vandaag";
  if (dagen === 1) return "morgen";
  if (dagen === -1) return "gisteren";
  if (dagen < 0) return `${-dagen} dagen te laat`;
  if (dagen < 14) return `over ${dagen} dagen`;
  if (dagen < 60) return `over ${Math.round(dagen / 7)} weken`;
  return `over ${Math.round(dagen / 30.44)} maanden`;
}
