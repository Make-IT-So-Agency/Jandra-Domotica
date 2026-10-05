import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Huis } from "@/lib/bouw/types";

/**
 * De routes voor de omgeving, met nagebootste diensten van Digitaal
 * Vlaanderen. Een verzonnen adres en verzonnen coördinaten: nooit die van ons
 * huis.
 */

const ADRES = "Voorbeeldstraat 1, 9999 Nergens";
const PERCEEL = "12345A0678/00B000";
const nep = vi.hoisted(() => ({ huis: null as Huis | null }));
vi.mock("@/lib/bouw/huistoegang", () => ({
  huisVoorRoute: async () => (nep.huis ? { ik: { id: "h", email: "rook@voorbeeld.be", rol: "hoofdbeheerder" }, huis: nep.huis } : null),
}));

const HUIS: Huis = {
  id: 1,
  naam: "Nieuwbouw",
  soort: "nieuwbouw",
  projectnaam: null,
  adres: ADRES,
  perceel: null,
  krediet_totaal: null,
  eigen_inbreng: null,
  volgorde: 0,
  gearchiveerd_op: null,
};

const vierkant = (x: number, y: number, z: number) => [[x, y], [x + z, y], [x + z, y + z], [x, y + z], [x, y]];

/** Wat de diensten antwoorden, per soort vraag; en welke URL's er gevraagd werden. */
function diensten(over: { wfs?: number; luchtfoto?: "beeld" | "xml" } = {}) {
  const gevraagd: URL[] = [];
  const fetchNep = vi.fn(async (adres: string | URL) => {
    const url = new URL(String(adres));
    gevraagd.push(url);
    if (url.pathname.startsWith("/geolocation/")) {
      return Response.json({ LocationResult: [{ Location: { X_Lambert72: 150000, Y_Lambert72: 180000 } }] });
    }
    if (url.pathname.startsWith("/capakey/v2/parcel/")) {
      if (decodeURIComponent(url.pathname) !== `/capakey/v2/parcel/${PERCEEL}`) return new Response("notfound:Parcel not found", { status: 404 });
      return Response.json({ capakey: PERCEEL, geometry: { center: JSON.stringify({ type: "Point", coordinates: [150020, 180010] }) } });
    }
    if (url.pathname === "/GRB/wfs") {
      if (over.wfs) return new Response("stuk", { status: over.wfs });
      const percelen = url.searchParams.get("typeNames") === "GRB:ADP";
      return Response.json({
        type: "FeatureCollection",
        features: percelen
          ? [
              { type: "Feature", geometry: { type: "Polygon", coordinates: [vierkant(149990, 179990, 20)] }, properties: { CAPAKEY: "12345A0678/00B000" } },
              { type: "Feature", geometry: { type: "Polygon", coordinates: [vierkant(150010, 179990, 20)] }, properties: { CAPAKEY: "12345A0679/00C000" } },
            ]
          : [{ type: "Feature", geometry: { type: "Polygon", coordinates: [vierkant(150014, 179995, 10)] }, properties: { LBLTYPE: "hoofdgebouw" } }],
      });
    }
    if (url.pathname === "/OMW/wms" && url.searchParams.get("REQUEST") === "GetCapabilities") {
      return new Response("<Layer><Name>OMWRGB24VL</Name></Layer><Layer><Name>OMWRGB25VL</Name></Layer><Layer><Name>OMWRGB25VL_vdc</Name></Layer>", {
        headers: { "content-type": "text/xml" },
      });
    }
    if (url.pathname === "/OMW/wms") {
      return over.luchtfoto === "xml"
        ? new Response("<ServiceExceptionReport/>", { headers: { "content-type": "text/xml" } })
        : new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("onbekend", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchNep);
  return gevraagd;
}

let fouten: string[];
beforeEach(() => {
  nep.huis = { ...HUIS };
  fouten = [];
  vi.spyOn(console, "error").mockImplementation((...delen: unknown[]) => void fouten.push(delen.map(String).join(" ")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const vraag = (pad: string) => new Request(`https://jandra.voorbeeld.be${pad}?huis=1`);

describe("de omgeving van een huis", () => {
  it("geeft het adrespunt, de percelen met het onze, en de gebouwen; zonder adres of perceelnummers", async () => {
    const gevraagd = diensten();
    const { GET } = await import("@/app/api/bouw/omgeving/route");
    const antwoord = await GET(vraag("/api/bouw/omgeving"));
    expect(antwoord.status).toBe(200);
    expect(antwoord.headers.get("cache-control")).toBe("private, max-age=86400");
    const omgeving = await antwoord.json();
    expect(omgeving.punt).toEqual([150000, 180000]);
    expect(omgeving.percelen.map((p: { eigen: boolean }) => p.eigen)).toEqual([true, false]);
    expect(omgeving.gebouwen).toEqual([{ ring: vierkant(150014, 179995, 10).slice(0, 4), soort: "hoofdgebouw" }]);
    const tekst = JSON.stringify(omgeving);
    expect(tekst).not.toContain("CAPAKEY");
    expect(tekst).not.toContain("12345A");
    expect(tekst).not.toContain("Voorbeeldstraat");

    // Het adres naar Geolocation; de percelen en gebouwen binnen 100 m, in Lambert 72.
    expect(gevraagd[0].searchParams.get("q")).toBe(ADRES);
    const wfs = gevraagd.filter((url) => url.pathname === "/GRB/wfs");
    expect(wfs.map((url) => url.searchParams.get("typeNames")).sort()).toEqual(["GRB:ADP", "GRB:GBG"]);
    for (const url of wfs) {
      expect(url.searchParams.get("bbox")).toBe("149900.00,179900.00,150100.00,180100.00,EPSG:31370");
      expect(url.searchParams.get("srsName")).toBe("EPSG:31370");
      expect(url.searchParams.get("outputFormat")).toBe("application/json");
    }
  });

  it("vraagt eerst een adres, en zegt het als Digitaal Vlaanderen het niet vindt", async () => {
    diensten();
    const { GET } = await import("@/app/api/bouw/omgeving/route");
    nep.huis = { ...HUIS, adres: "  " };
    const zonder = await GET(vraag("/api/bouw/omgeving"));
    expect(zonder.status).toBe(404);
    expect((await zonder.json()).fout).toContain("Overzicht");

    nep.huis = { ...HUIS };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ LocationResult: [] })));
    const onbekend = await GET(vraag("/api/bouw/omgeving"));
    expect(onbekend.status).toBe(404);
    expect((await onbekend.json()).fout).toContain("vindt dit adres niet");

    nep.huis = null;
    expect((await GET(vraag("/api/bouw/omgeving"))).status).toBe(404);
  });

  it("zoekt bij nieuwbouw het perceel: zonder adres, of als het adres niet bestaat", async () => {
    const gevraagd = diensten();
    const { GET } = await import("@/app/api/bouw/omgeving/route");
    nep.huis = { ...HUIS, adres: null, perceel: PERCEEL };
    const antwoord = await GET(vraag("/api/bouw/omgeving"));
    expect(antwoord.status).toBe(200);
    const omgeving = await antwoord.json();
    expect(omgeving.punt).toEqual([150020, 180010]);
    expect(JSON.stringify(omgeving)).not.toContain("12345A");
    // Het perceel, met zijn kader in Lambert 72; geen adres gevraagd.
    expect(gevraagd.some((url) => url.pathname.startsWith("/geolocation/"))).toBe(false);
    const perceel = gevraagd.find((url) => url.pathname.startsWith("/capakey/"))!;
    expect([perceel.searchParams.get("geometry"), perceel.searchParams.get("srs")]).toEqual(["bbox", "31370"]);

    // Een perceel dat niet bestaat: zeg het, zonder het nummer te loggen.
    nep.huis = { ...HUIS, perceel: "12345A9999/00B000" };
    const onbekend = await GET(vraag("/api/bouw/omgeving"));
    expect(onbekend.status).toBe(404);
    expect((await onbekend.json()).fout).toContain("vindt dit perceel niet");
    expect(fouten.join(" ")).not.toContain("12345A");

    // Een adres dat niet bestaat: dan het perceelnummer.
    nep.huis = { ...HUIS };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ LocationResult: [] })));
    expect((await (await GET(vraag("/api/bouw/omgeving"))).json()).fout).toContain("perceelnummer");
  });

  it("meldt een dienst die niet antwoordt, zonder het adres of de coördinaten te loggen", async () => {
    diensten({ wfs: 503 });
    const { GET } = await import("@/app/api/bouw/omgeving/route");
    const antwoord = await GET(vraag("/api/bouw/omgeving"));
    expect(antwoord.status).toBe(502);
    expect((await antwoord.json()).fout).toContain("HTTP 503");
    expect(fouten).toHaveLength(1);
    for (const verboden of ["Voorbeeldstraat", "150000", "180000", "149900", "geo.api"]) expect(fouten[0]).not.toContain(verboden);

    // Ook een netwerkfout, waarvan de oorzaak de URL kan bevatten.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Promise.reject(new TypeError(`fetch failed: ${url}`))));
    const weg = await GET(vraag("/api/bouw/omgeving"));
    expect(weg.status).toBe(502);
    expect(JSON.stringify(await weg.json())).not.toContain("Voorbeeldstraat");
    expect(fouten.join(" ")).not.toContain("Voorbeeldstraat");
  });
});

describe("de luchtfoto", () => {
  it("haalt de nieuwste winteropname, 200 × 200 m rond het adrespunt, op 2048 pixels", async () => {
    const gevraagd = diensten();
    vi.resetModules();
    const { GET } = await import("@/app/api/bouw/omgeving/luchtfoto/route");
    const antwoord = await GET(vraag("/api/bouw/omgeving/luchtfoto"));
    expect(antwoord.status).toBe(200);
    expect(antwoord.headers.get("content-type")).toBe("image/jpeg");
    expect(antwoord.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await antwoord.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    const kaart = gevraagd.find((url) => url.searchParams.get("REQUEST") === "GetMap")!;
    expect(kaart.searchParams.get("LAYERS")).toBe("OMWRGB25VL");
    expect(kaart.searchParams.get("CRS")).toBe("EPSG:31370");
    expect(kaart.searchParams.get("BBOX")).toBe("149900.00,179900.00,150100.00,180100.00");
    expect([kaart.searchParams.get("WIDTH"), kaart.searchParams.get("HEIGHT")]).toEqual(["2048", "2048"]);

    // Met een perceel: rond het perceel.
    const metPerceel = diensten();
    nep.huis = { ...HUIS, perceel: PERCEEL };
    expect((await GET(vraag("/api/bouw/omgeving/luchtfoto"))).status).toBe(200);
    expect(metPerceel.find((url) => url.searchParams.get("REQUEST") === "GetMap")!.searchParams.get("BBOX")).toBe(
      "149920.00,179910.00,150120.00,180110.00",
    );
  });

  it("geeft een fout als de dienst XML terugstuurt in plaats van een beeld", async () => {
    diensten({ luchtfoto: "xml" });
    vi.resetModules();
    const { GET } = await import("@/app/api/bouw/omgeving/luchtfoto/route");
    const antwoord = await GET(vraag("/api/bouw/omgeving/luchtfoto"));
    expect(antwoord.status).toBe(502);
    expect(fouten.join(" ")).not.toContain("150000");
  });
});
