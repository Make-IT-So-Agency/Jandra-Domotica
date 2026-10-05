import "server-only";

import { leesAdrespunt, leesGrb, leesPerceelpunt, maakOmgeving, rond, type Kader, type Lambert, type Omgeving } from "./drie/omgeving";

/**
 * De diensten van Digitaal Vlaanderen, gratis en zonder sleutel: het adres
 * naar een punt (Geolocation), een perceelnummer naar een punt (CaPaKey), de
 * percelen en gebouwen (de WFS van het GRB) en de luchtfoto (de WMS met de
 * orthofoto's). Enkel op de server.
 *
 * Wat we vragen, wijst het huis aan. Daarom:
 * - niets wordt bewaard, ook niet in de datacache van Next (`no-store`);
 * - een fout zegt welke dienst het was en welke HTTP-status, nooit de URL,
 *   het adres, het perceelnummer of de coördinaten.
 */

const DIENSTEN = "https://geo.api.vlaanderen.be";
const WACHTEN = 15_000;

export class Omgevingsfout extends Error {
  constructor(
    readonly dienst: "adres" | "perceel" | "percelen" | "gebouwen" | "luchtfoto",
    readonly status: number | null,
  ) {
    const wat = dienst === "adres" || dienst === "perceel" ? `het ${dienst}` : `de ${dienst}`;
    super(`De dienst voor ${wat} van Digitaal Vlaanderen antwoordt niet${status ? ` (HTTP ${status})` : ""}.`);
  }
}

/** Een vraag aan een dienst, met elk antwoord. */
async function vraagAan(dienst: Omgevingsfout["dienst"], url: string): Promise<Response> {
  try {
    return await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(WACHTEN) });
  } catch {
    // De oorzaak kan de URL bevatten, en daarmee het adres: die laten we vallen.
    throw new Omgevingsfout(dienst, null);
  }
}

/** Een vraag aan een dienst die moet lukken. */
async function haal(dienst: Omgevingsfout["dienst"], url: string): Promise<Response> {
  const antwoord = await vraagAan(dienst, url);
  if (!antwoord.ok) throw new Omgevingsfout(dienst, antwoord.status);
  return antwoord;
}

/** Het adrespunt in Lambert 72, of null als het adres niet gevonden wordt. */
export async function zoekAdres(adres: string): Promise<Lambert | null> {
  const antwoord = await haal("adres", `${DIENSTEN}/geolocation/v4/Location?${new URLSearchParams({ q: adres, c: "1" })}`);
  return leesAdrespunt(await antwoord.json().catch(() => null));
}

/** Het middelpunt van een perceel in Lambert 72, op zijn CaPaKey; null als het niet bestaat. */
export async function zoekPerceel(capakey: string): Promise<Lambert | null> {
  const vraag = new URLSearchParams({ geometry: "bbox", srs: "31370" });
  const antwoord = await vraagAan("perceel", `${DIENSTEN}/capakey/v2/parcel/${encodeURIComponent(capakey)}?${vraag}`);
  // Een perceel dat niet bestaat, geeft 404.
  if (antwoord.status === 404) return null;
  if (!antwoord.ok) throw new Omgevingsfout("perceel", antwoord.status);
  return leesPerceelpunt(await antwoord.json().catch(() => null));
}

/**
 * Waar het huis ligt: het perceel als het ingevuld is, anders het adres. Bij
 * nieuwbouw kent Digitaal Vlaanderen het adres vaak nog niet, het perceel wel.
 * Zonder punt zegt `fout` waarom, voor de gebruiker.
 */
export async function plaatsVanHuis(huis: { adres: string | null; perceel: string | null }): Promise<{ punt: Lambert } | { punt: null; fout: string }> {
  const perceel = huis.perceel?.trim();
  if (perceel) {
    const punt = await zoekPerceel(perceel);
    return punt ? { punt } : { punt: null, fout: "Digitaal Vlaanderen vindt dit perceel niet. Kijk het perceelnummer na bij Overzicht." };
  }
  const adres = huis.adres?.trim();
  if (!adres) return { punt: null, fout: "Er staat nog geen adres of perceel bij dit huis. Vul het in bij Overzicht." };
  const punt = await zoekAdres(adres);
  return punt
    ? { punt }
    : { punt: null, fout: "Digitaal Vlaanderen vindt dit adres niet. Is het een nieuw adres? Vul dan bij Overzicht het perceelnummer in." };
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

/** Alles rond een punt: de percelen en de gebouwen binnen 100 m. */
export async function haalOmgeving(punt: Lambert): Promise<Omgeving> {
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
