/**
 * Een materiaal van een site: welke foto's een productpagina toont, hoe het
 * product heet, en of een adres op het openbare internet ligt. De server
 * haalt de pagina en de foto's op (zie ophalen.ts); hier staan enkel de
 * regels. Puur, met tests.
 *
 * Een pagina toont haar foto's op veel manieren: og:image en twitter:image
 * voor wie de link deelt, de beelden van het product in JSON-LD (schema.org),
 * en gewone <img>-tags, vaak met een srcset of lui geladen (data-src). Een
 * logo, een icoon of een betaallogo is geen materiaal.
 */

/** Hoeveel foto's een pagina hoogstens oplevert. */
export const MAX_FOTOS = 24;

/** Hoe lang een adres mag zijn. */
export const MAX_ADRES = 2000;

/** Woorden in het adres van een beeld dat geen foto van het product is. */
const GEEN_FOTO =
  /(^|[/_.-])(logo|logos|icon|icons|favicon|sprite|avatar|flag|flags|payment|payments|badge|badges|placeholder|spinner|loader|loading|blank|pixel|tracking|facebook|instagram|youtube|linkedin|pinterest|twitter|whatsapp|cookie|cookies|klarna|bancontact|visa|mastercard|paypal)([/_.-]|$)/i;

export interface Paginafotos {
  /** Hoe het product heet: de titel van de pagina, zonder de naam van de site. */
  titel: string | null;
  fotos: string[];
}

/** HTML-entiteiten in een tekst of attribuut: &amp;, &quot; en de cijfercodes. */
function ontsnap(tekst: string): string {
  return tekst
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** De attributen van een HTML-tag, met de naam in kleine letters. */
function attributen(tag: string): Map<string, string> {
  const uit = new Map<string, string>();
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const naam = m[1].toLowerCase();
    if (!uit.has(naam)) uit.set(naam, ontsnap(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return uit;
}

/** De grootste uit een srcset: uit "a.jpg 400w, b.jpg 1200w" komt b.jpg. Zonder beschrijving telt de eerste. */
export function grootsteUitSrcset(srcset: string): string | null {
  let beste: string | null = null;
  let maat = -1;
  // Een komma gevolgd door een spatie scheidt de kandidaten; in een adres zelf mag een komma staan.
  for (const kandidaat of srcset.split(/,\s+/)) {
    const [url, beschrijving] = kandidaat.trim().split(/\s+/);
    if (!url) continue;
    const getal = beschrijving ? parseFloat(beschrijving) : NaN;
    const grootte = Number.isFinite(getal) ? (beschrijving.endsWith("x") ? getal * 1000 : getal) : 0;
    if (grootte > maat) {
      maat = grootte;
      beste = url;
    }
  }
  return beste;
}

/** De beelden in JSON-LD: image, als tekst, als lijst of als ImageObject, ook dieper in de structuur. */
function beeldenUitJson(waarde: unknown, diepte = 0): string[] {
  if (diepte > 8 || waarde === null || typeof waarde !== "object") return [];
  if (Array.isArray(waarde)) return waarde.flatMap((w) => beeldenUitJson(w, diepte + 1));
  const object = waarde as Record<string, unknown>;
  const uit: string[] = [];
  for (const beeld of [object.image].flat()) {
    if (typeof beeld === "string") uit.push(beeld);
    else if (beeld && typeof beeld === "object") {
      const { url, contentUrl } = beeld as { url?: unknown; contentUrl?: unknown };
      if (typeof url === "string") uit.push(url);
      else if (typeof contentUrl === "string") uit.push(contentUrl);
    }
  }
  for (const [sleutel, w] of Object.entries(object)) {
    if (sleutel !== "image" && w && typeof w === "object") uit.push(...beeldenUitJson(w, diepte + 1));
  }
  return uit;
}

/** De titel van een pagina: og:title, anders <title>, zonder "| Naam van de site". */
function titelVan(html: string): string | null {
  let titel: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attributen(tag);
    if ((a.get("property") ?? a.get("name") ?? "").toLowerCase() === "og:title" && a.get("content")?.trim()) {
      titel = a.get("content")!;
      break;
    }
  }
  titel ??= html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  if (!titel) return null;
  let tekst = ontsnap(titel).replace(/\s+/g, " ").trim();
  const delen = tekst.split(/\s+[|–—]\s+|\s+-\s+/);
  if (delen.length > 1 && delen[0].length >= 4) tekst = delen[0];
  return tekst.slice(0, 80).trim() || null;
}

/**
 * De foto's van een pagina, de belangrijkste eerst: wat de pagina zelf als
 * beeld opgeeft (og:image, JSON-LD), dan de grote <img>'s in de volgorde
 * van de pagina. Relatieve adressen tegenover `basis`, zonder dubbels.
 */
export function fotosVanPagina(html: string, basis: string): Paginafotos {
  const fotos: string[] = [];
  const voeg = (ruw: string | null | undefined) => {
    const tekst = ruw?.trim();
    if (!tekst || tekst.startsWith("data:") || fotos.length >= MAX_FOTOS) return;
    let url: URL;
    try {
      url = new URL(tekst, basis);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (/\.svgz?$/i.test(url.pathname) || GEEN_FOTO.test(url.pathname)) return;
    url.hash = "";
    const adres = url.toString();
    if (adres.length <= MAX_ADRES && !fotos.includes(adres)) fotos.push(adres);
  };

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attributen(tag);
    const sleutel = (a.get("property") ?? a.get("name") ?? a.get("itemprop") ?? "").toLowerCase();
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image"].includes(sleutel)) voeg(a.get("content"));
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attributen(tag);
    if ((a.get("rel") ?? "").toLowerCase() === "image_src") voeg(a.get("href"));
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const url of beeldenUitJson(JSON.parse(m[1]))) voeg(url);
    } catch {
      // Geen geldige JSON: dan niet.
    }
  }
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    const a = attributen(tag);
    const [breedte, hoogte] = [Number(a.get("width")), Number(a.get("height"))];
    // Een beeldje van minder dan 150 pixels is een icoon of een miniatuur.
    if ((a.has("width") && breedte < 150) || (a.has("height") && hoogte < 150)) continue;
    const srcset = a.get("srcset") ?? a.get("data-srcset");
    voeg((srcset ? grootsteUitSrcset(srcset) : null) ?? a.get("data-src") ?? a.get("data-lazy-src") ?? a.get("data-original") ?? a.get("src"));
  }
  return { titel: titelVan(html), fotos };
}

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

/** Een adres dat iemand plakt, nagekeken: http of https, zonder wachtwoord, niet te lang. Null als het niet kan. */
export function schoonAdres(ruw: unknown): URL | null {
  if (typeof ruw !== "string") return null;
  const tekst = ruw.trim();
  if (!tekst || tekst.length > MAX_ADRES) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(tekst) ? tekst : `https://${tekst}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname) return null;
  // Enkel de gewone poorten: wat op een andere poort draait, is zelden een winkel.
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  return url;
}

/** Een IPv4-adres als vier getallen, of null. */
function vierVan(adres: string): number[] | null {
  const m = adres.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const delen = m.slice(1).map(Number);
  return delen.every((d) => d <= 255) ? delen : null;
}

/** Een IPv6-adres als acht groepen van 16 bit, of null. Ook met :: en met een IPv4-adres achteraan. */
function zesVan(adres: string): number[] | null {
  let tekst = adres.toLowerCase();
  if (tekst.startsWith("[") && tekst.endsWith("]")) tekst = tekst.slice(1, -1);
  tekst = tekst.split("%")[0];
  if (!tekst.includes(":")) return null;
  const helften = tekst.split("::");
  if (helften.length > 2) return null;
  const groepen = (deel: string): number[] | null => {
    if (deel === "") return [];
    const uit: number[] = [];
    const stukken = deel.split(":");
    for (const [i, stuk] of stukken.entries()) {
      if (i === stukken.length - 1 && stuk.includes(".")) {
        const vier = vierVan(stuk);
        if (!vier) return null;
        uit.push(vier[0] * 256 + vier[1], vier[2] * 256 + vier[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(stuk)) uit.push(parseInt(stuk, 16));
      else return null;
    }
    return uit;
  };
  const links = groepen(helften[0]);
  const rechts = helften.length === 2 ? groepen(helften[1]) : [];
  if (!links || !rechts) return null;
  if (helften.length === 1) return links.length === 8 ? links : null;
  const nullen = 8 - links.length - rechts.length;
  if (nullen < 1) return null;
  return [...links, ...Array<number>(nullen).fill(0), ...rechts];
}

function publiekV4([a, b, c]: readonly number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  // Multicast, gereserveerd en broadcast.
  return a < 224;
}

const vierUit = (hoog: number, laag: number) => [hoog >> 8, hoog & 255, laag >> 8, laag & 255];

function publiekV6(g: readonly number[]): boolean {
  if (g.slice(0, 6).every((x) => x === 0)) {
    // ::, ::1 en ::a.b.c.d
    if (g[6] === 0 && g[7] <= 1) return false;
    return publiekV4(vierUit(g[6], g[7]));
  }
  // ::ffff:a.b.c.d en 64:ff9b::a.b.c.d: een IPv4-adres in een IPv6-jasje.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publiekV4(vierUit(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return publiekV4(vierUit(g[6], g[7]));
  if ((g[0] & 0xfe00) === 0xfc00) return false; // eigen netwerk
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false; // documentatie en Teredo
  if (g[0] === 0x2002) return publiekV4(vierUit(g[1], g[2])); // 6to4
  if (g[0] === 0x100 && g.slice(1, 4).every((x) => x === 0)) return false; // weggooien
  return true;
}

/**
 * Ligt dit IP-adres op het openbare internet? Niet: de eigen machine, een
 * eigen netwerk (10.x, 192.168.x...), link-local (zoals de metadata van een
 * cloud op 169.254.169.254), multicast en de gereserveerde blokken. Zo kan
 * het ophalen van een foto nooit bij een dienst binnen het netwerk komen.
 */
export function isPubliekAdres(adres: string): boolean {
  const vier = vierVan(adres);
  if (vier) return publiekV4(vier);
  const zes = zesVan(adres);
  return zes ? publiekV6(zes) : false;
}

// ---------------------------------------------------------------------------
// Foto's
// ---------------------------------------------------------------------------

export type Fotosoort = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Wat voor foto het is, aan de eerste bytes; null als het geen JPEG, PNG, WebP of GIF is (een SVG of HTML ook niet). */
export function fotosoortVan(bytes: Uint8Array): Fotosoort | null {
  const begint = (...waarden: number[]) => waarden.every((w, i) => bytes[i] === w);
  if (begint(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (begint(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (begint(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (begint(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
