import "server-only";

import { leesAdrespunt, leesGrb, maakOmgeving, rond, type Kader, type Lambert, type Omgeving } from "./drie/omgeving";

/**
 * De diensten van Digitaal Vlaanderen, gratis en zonder sleutel: het adres
 * naar een punt (Geolocation), de percelen en gebouwen (de WFS van het GRB)
 * en de luchtfoto (de WMS met de orthofoto's). Enkel op de server.
 *
 * Wat we vragen, wijst het huis aan. Daarom:
 * - niets wordt bewaard, ook niet in de datacache van Next (`no-store`);
 * - een fout zegt welke dienst het was en welke HTTP-status, nooit de URL,
 *   het adres of de coördinaten.
 */

const DIENSTEN = "https://geo.api.vlaanderen.be";
const WACHTEN = 15_000;

export class Omgevingsfout extends Error {
  constructor(
    readonly dienst: "adres" | "percelen" | "gebouwen" | "luchtfoto",
    readonly status: number | null,
  ) {
    super(`De dienst voor ${dienst === "adres" ? "het adres" : `de ${dienst}`} van Digitaal Vlaanderen antwoordt niet${status ? ` (HTTP ${status})` : ""}.`);
  }
}

async function haal(dienst: Omgevingsfout["dienst"], url: string): Promise<Response> {
  let antwoord: Response;
  try {
    antwoord = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(WACHTEN) });
  } catch {
    // De oorzaak kan de URL bevatten, en daarmee het adres: die laten we vallen.
    throw new Omgevingsfout(dienst, null);
  }
  if (!antwoord.ok) throw new Omgevingsfout(dienst, antwoord.status);
  return antwoord;
}

/** Het adrespunt in Lambert 72, of null als het adres niet gevonden wordt. */
export async function zoekAdres(adres: string): Promise<Lambert | null> {
  const antwoord = await haal("adres", `${DIENSTEN}/geolocation/v4/Location?${new URLSearchParams({ q: adres, c: "1" })}`);
  return leesAdrespunt(await antwoord.json().catch(() => null));
}

const bbox = (k: Kader) => [k.x0, k.y0, k.x1, k.y1].map((w) => w.toFixed(2)).join(",");

/** De vormen van een laag van het GRB in een kader: GRB:ADP (percelen) of GRB:GBG (gebouwen). */
export async function haalGrb(laag: "GRB:ADP" | "GRB:GBG", kader: Kader) {
  const vraag = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: laag,
    outputFormat: "application/json",
    srsName: "EPSG:31370",
    bbox: `${bbox(kader)},EPSG:31370`,
    count: "500",
  });
  const antwoord = await haal(laag === "GRB:ADP" ? "percelen" : "gebouwen", `${DIENSTEN}/GRB/wfs?${vraag}`);
  return leesGrb(await antwoord.json().catch(() => null));
}

/** Alles rond een adres: het punt, de percelen en de gebouwen binnen 100 m. Null als het adres niet gevonden wordt. */
export async function haalOmgeving(adres: string): Promise<Omgeving | null> {
  const punt = await zoekAdres(adres);
  if (!punt) return null;
  const kader = rond(punt);
  const [percelen, gebouwen] = await Promise.all([haalGrb("GRB:ADP", kader), haalGrb("GRB:GBG", kader)]);
  return maakOmgeving(punt, percelen, gebouwen);
}

// ---------------------------------------------------------------------------
// De luchtfoto
// ---------------------------------------------------------------------------

/** Als de lijst van de WMS niet te lezen is: de nieuwste die we kennen. */
const STANDAARDLAAG = "OMWRGB25VL";
let laag: { naam: string; tot: number } | null = null;

/**
 * De nieuwste winteropname in kleur (OMWRGB<jaar>VL). Elk jaar komt er een
 * bij; de lijst van de dienst zegt welke, en die onthouden we een dag.
 */
export async function nieuwsteLuchtfoto(): Promise<string> {
  if (laag && laag.tot > Date.now()) return laag.naam;
  let naam = STANDAARDLAAG;
  try {
    const antwoord = await haal("luchtfoto", `${DIENSTEN}/OMW/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`);
    const jaren = [...(await antwoord.text()).matchAll(/<Name>OMWRGB(\d{2})VL<\/Name>/g)].map((m) => Number(m[1]));
    if (jaren.length > 0) naam = `OMWRGB${String(Math.max(...jaren)).padStart(2, "0")}VL`;
  } catch {
    // Dan de standaardlaag.
  }
  laag = { naam, tot: Date.now() + 24 * 3600 * 1000 };
  return naam;
}

/** De luchtfoto van een kader als JPEG, zo scherp als de dienst toelaat (2048 pixels). */
export async function haalLuchtfoto(kader: Kader, pixels = 2048): Promise<ArrayBuffer> {
  const vraag = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: await nieuwsteLuchtfoto(),
    STYLES: "",
    CRS: "EPSG:31370",
    BBOX: bbox(kader),
    WIDTH: String(pixels),
    HEIGHT: String(pixels),
    FORMAT: "image/jpeg",
  });
  const antwoord = await haal("luchtfoto", `${DIENSTEN}/OMW/wms?${vraag}`);
  // Een WMS meldt een fout met status 200 en XML in plaats van een beeld.
  if (!antwoord.headers.get("content-type")?.startsWith("image/")) throw new Omgevingsfout("luchtfoto", antwoord.status);
  return antwoord.arrayBuffer();
}
