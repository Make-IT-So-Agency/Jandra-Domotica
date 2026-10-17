import { describe, expect, it } from "vitest";

import {
  achtergrondVan,
  kleurenUitPalet,
  leesFoto,
  paletVan,
  patroonVoorStaal,
  schoneFotostaal,
  venster,
  type Pixels,
} from "@/lib/bouw/drie/fotostaal";
import { willekeur } from "@/lib/bouw/drie/stalen";
import { fotosVanPagina, fotosoortVan, grootsteUitSrcset, isPubliekAdres, schoonAdres } from "@/lib/bouw/materiaal-pagina";

describe("de foto's van een productpagina", () => {
  const html = `<!doctype html><html><head>
    <title>Gevelsteen Rood Genuanceerd | Steenbakkerij Voorbeeld</title>
    <meta property="og:image" content="/media/steen/rood-los.jpg?v=2">
    <meta name="twitter:image" content="https://cdn.voorbeeld.be/media/steen/rood-los.jpg?v=2#zoom">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Rood",
      "image":["https://cdn.voorbeeld.be/media/steen/rood-gevel.jpg",{"@type":"ImageObject","url":"https://cdn.voorbeeld.be/media/steen/rood-detail.jpg"}]}</script>
    <script type="application/ld+json">{ kapot </script>
  </head><body>
    <img src="/static/logo.png" alt="Logo">
    <img src="/media/icon-zoeken.png" width="24" height="24">
    <img src="/media/kaart.svg">
    <img data-src="/media/steen/rood-muur.jpg" src="data:image/gif;base64,R0lGOD">
    <picture><source srcset="/media/steen/rood-huis-800.webp 800w, /media/steen/rood-huis-1600.webp 1600w"></picture>
    <img src="https://cdn.voorbeeld.be/media/steen/rood-gevel.jpg">
    <img src="/betalen/bancontact.png">
  </body></html>`;

  it("vindt de foto's, de belangrijkste eerst, zonder logo's, iconen en dubbels", () => {
    const { titel, fotos } = fotosVanPagina(html, "https://www.voorbeeld.be/stenen/rood");
    expect(titel).toBe("Gevelsteen Rood Genuanceerd");
    expect(fotos).toEqual([
      "https://www.voorbeeld.be/media/steen/rood-los.jpg?v=2",
      "https://cdn.voorbeeld.be/media/steen/rood-los.jpg?v=2",
      "https://cdn.voorbeeld.be/media/steen/rood-gevel.jpg",
      "https://cdn.voorbeeld.be/media/steen/rood-detail.jpg",
      "https://www.voorbeeld.be/media/steen/rood-muur.jpg",
      "https://www.voorbeeld.be/media/steen/rood-huis-1600.webp",
    ]);
  });

  it("neemt de grootste uit een srcset", () => {
    expect(grootsteUitSrcset("a.jpg 400w, b.jpg 1200w, c.jpg 800w")).toBe("b.jpg");
    expect(grootsteUitSrcset("a.jpg 1x, b.jpg 2x")).toBe("b.jpg");
    expect(grootsteUitSrcset("a.jpg")).toBe("a.jpg");
    expect(grootsteUitSrcset("https://x.be/a,b.jpg 500w, https://x.be/c.jpg 300w")).toBe("https://x.be/a,b.jpg");
  });

  it("neemt og:title, of de titel zonder de naam van de site", () => {
    expect(fotosVanPagina('<meta property="og:title" content="Parket &amp; eik">', "https://x.be").titel).toBe("Parket & eik");
    expect(fotosVanPagina("<title>Tegels - Winkel</title>", "https://x.be").titel).toBe("Tegels");
    expect(fotosVanPagina("<p>niets</p>", "https://x.be")).toEqual({ titel: null, fotos: [] });
  });
});

describe("welke adressen mogen", () => {
  it("laat enkel http en https toe, op de gewone poort, zonder wachtwoord", () => {
    expect(schoonAdres("www.voorbeeld.be/steen")?.toString()).toBe("https://www.voorbeeld.be/steen");
    expect(schoonAdres(" https://www.voorbeeld.be:443/a ")?.hostname).toBe("www.voorbeeld.be");
    expect(schoonAdres("http://voorbeeld.be:80/a")).not.toBeNull();
    for (const fout of ["ftp://voorbeeld.be/a", "javascript:alert(1)", "https://naam:geheim@voorbeeld.be", "https://voorbeeld.be:8080/", "", 12, `https://x.be/${"a".repeat(2001)}`]) {
      expect(schoonAdres(fout), String(fout)).toBeNull();
    }
  });

  it("weigert alles wat niet op het openbare internet ligt", () => {
    for (const ja of ["8.8.8.8", "172.32.0.1", "2001:4860:4860::8888", "::ffff:8.8.8.8", "[2a02:1810::1]"]) expect(isPubliekAdres(ja), ja).toBe(true);
    for (const nee of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "[::1]",
      "fe80::1%eth0",
      "fd00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a9fe:a9fe",
      "2002:7f00:1::",
      "2001:db8::1",
      "voorbeeld.be",
      "1.2.3",
      "1:2:3:4:5:6:7:8:9",
    ]) {
      expect(isPubliekAdres(nee), nee).toBe(false);
    }
  });

  it("herkent een foto aan haar eerste bytes", () => {
    const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
    expect(fotosoortVan(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(fotosoortVan(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(fotosoortVan(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(fotosoortVan(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(fotosoortVan(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(fotosoortVan(new TextEncoder().encode("<!doctype html>"))).toBeNull();
  });
});

/** Een foto van breedte op hoogte, met een kleur per pixel. */
function foto(breedte: number, hoogte: number, kleur: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(breedte * hoogte * 4);
  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      const [r, g, b, a = 255] = kleur(x, y);
      data.set([r, g, b, a], (y * breedte + x) * 4);
    }
  }
  return { breedte, hoogte, data };
}

const ROOD: [number, number, number] = [160, 60, 40];
const WIT: [number, number, number] = [255, 255, 255];
const VOEG: [number, number, number] = [200, 196, 188];

describe("een staal op een effen achtergrond", () => {
  // Een baksteen van 120 op 30 pixels, op wit, met een stofje in de hoek.
  const steen = foto(200, 100, (x, y) => (x === 2 && y === 2 ? [0, 0, 0] : x >= 40 && x < 160 && y >= 35 && y < 65 ? ROOD : WIT));

  it("vindt de achtergrond, en waar de steen staat, een beetje binnen de rand", () => {
    expect(achtergrondVan(steen)).toEqual(WIT);
    const lezing = leesFoto(steen);
    expect(lezing.soort).toBe("staal");
    expect(lezing.achtergrond).toBe("#ffffff");
    const [x0, y0, x1, y1] = lezing.uitsnede;
    expect(x0).toBeGreaterThan(0.2);
    expect(x0).toBeLessThan(0.25);
    expect(x1).toBeLessThan(0.8);
    expect(x1).toBeGreaterThan(0.75);
    expect(y0).toBeGreaterThan(0.35);
    expect(y1).toBeLessThan(0.65);
    expect(lezing.verhouding).toBeGreaterThan(3.5);
  });

  it("telt een doorzichtige achtergrond als wit", () => {
    const png = foto(60, 60, (x, y) => (x >= 20 && x < 40 && y >= 20 && y < 40 ? [...ROOD, 255] : [0, 0, 0, 0]));
    expect(achtergrondVan(png)).toEqual(WIT);
    expect(leesFoto(png).soort).toBe("staal");
  });

  it("geeft de kleur van de steen, zonder de achtergrond", () => {
    const palet = paletVan(steen, [0, 0, 1, 1], 3, WIT);
    expect(palet[0].kleur).toBe("#a03c28");
    expect(palet[0].aandeel).toBeGreaterThan(0.9);
  });
});

describe("een vlak: een muur tot aan de rand", () => {
  // Stenen van 20 op 6 pixels met een voeg van 2, halfsteens: de voeg is ongeveer een vijfde.
  const muur = foto(120, 80, (x, y) => {
    const rij = Math.floor(y / 8);
    const xs = (x + (rij % 2) * 11) % 22;
    return y % 8 >= 6 || xs >= 20 ? VOEG : ROOD;
  });

  it("is geen staal, en telt eerst helemaal", () => {
    expect(achtergrondVan(muur)).toBeNull();
    expect(leesFoto(muur)).toMatchObject({ soort: "vlak", uitsnede: [0, 0, 1, 1], achtergrond: null });
  });

  it("geeft de steen als kleur, en de voeg", () => {
    const { kleur, voegkleur } = kleurenUitPalet(paletVan(muur, [0, 0, 1, 1], 3));
    expect(kleur).toBe("#a03c28");
    expect(voegkleur).toBe("#c8c4bc");
    // Eén kleur: geen voeg.
    expect(kleurenUitPalet([{ kleur: "#a03c28", aandeel: 1 }])).toEqual({ kleur: "#a03c28", voegkleur: null });
  });
});

describe("hout met nerven", () => {
  const HOUT: [number, number, number] = [180, 130, 85];
  const NERF: [number, number, number] = [110, 70, 40];
  const nerf = (y: number) => y % 8 === 4;

  it("tot aan de rand is een vlak, ook al is de rand bijna overal de kleur van het hout", () => {
    const hout = foto(200, 120, (_x, y) => (nerf(y) ? NERF : HOUT));
    expect(achtergrondVan(hout)).toEqual(HOUT);
    expect(leesFoto(hout)).toMatchObject({ soort: "vlak", uitsnede: [0, 0, 1, 1], achtergrond: null });
  });

  it("een plank op wit is een staal", () => {
    const plank = foto(200, 120, (x, y) => (x >= 20 && x < 180 && y >= 45 && y < 75 ? (nerf(y) ? NERF : HOUT) : WIT));
    const lezing = leesFoto(plank);
    expect(lezing.soort).toBe("staal");
    expect(lezing.uitsnede[0]).toBeGreaterThan(0.1);
    expect(lezing.uitsnede[2]).toBeLessThan(0.9);
  });
});

describe("welk patroon, en welk stukje per steen", () => {
  it("kiest het patroon uit de vorm van het staal", () => {
    expect(patroonVoorStaal("gevel", 4.2)).toBe("baksteen");
    expect(patroonVoorStaal("gevel", 1)).toBeNull();
    expect(patroonVoorStaal("dak", 0.8)).toBe("pannen");
    expect(patroonVoorStaal("vloer", 7)).toBe("parket");
    expect(patroonVoorStaal("vloer", 1.05)).toBe("tegels");
    expect(patroonVoorStaal("vloer", 2)).toBeNull();
    expect(patroonVoorStaal("binnenmuur", 0.25)).toBe("planken");
    expect(patroonVoorStaal("meubel", 1)).toBeNull();
  });

  it("neemt een stukje met de vorm van de steen, binnen de uitsnede", () => {
    const toeval = willekeur("test");
    for (let i = 0; i < 50; i++) {
      const v = venster([100, 50, 500, 150], 4, toeval);
      expect(v.breedte / v.hoogte).toBeCloseTo(4);
      expect(v.x).toBeGreaterThanOrEqual(100);
      expect(v.y).toBeGreaterThanOrEqual(50);
      expect(v.x + v.breedte).toBeLessThanOrEqual(500.0001);
      expect(v.y + v.hoogte).toBeLessThanOrEqual(150.0001);
      expect(v.breedte).toBeGreaterThanOrEqual(0.8 * 400 - 0.001);
    }
  });

  it("kijkt na wat bewaard wordt", () => {
    expect(schoneFotostaal({ bron: "staal", uitsnede: [0.2, 0.35, 0.8, 0.65], breedte: null })).toEqual({ bron: "staal", uitsnede: [0.2, 0.35, 0.8, 0.65], breedte: null });
    expect(schoneFotostaal({ bron: "vlak", uitsnede: [0, 0, 1, 1], breedte: 1.2 })?.breedte).toBe(1.2);
    for (const fout of [
      { bron: "vlak", uitsnede: [0, 0, 1, 1], breedte: null },
      { bron: "staal", uitsnede: [0.5, 0, 0.4, 1], breedte: null },
      { bron: "staal", uitsnede: [0, 0, 1], breedte: null },
      { bron: "staal", uitsnede: [0, 0, 1.2, 1], breedte: null },
      { bron: "vlak", uitsnede: [0, 0, 1, 1], breedte: 50 },
      { bron: "foto", uitsnede: [0, 0, 1, 1], breedte: 1 },
      null,
    ]) {
      expect(schoneFotostaal(fout), JSON.stringify(fout)).toBeNull();
    }
  });
});

describe("ophalen van een andere site", () => {
  it("komt nooit bij de eigen machine of een eigen netwerk, ook niet via een naam", async () => {
    const { haalOp } = await import("@/lib/bouw/ophalen");
    for (const adres of ["http://127.0.0.1/x", "http://localhost/x", "http://[::1]/", "https://169.254.169.254/latest/meta-data", "http://10.0.0.1/"]) {
      await expect(haalOp(adres, { maxBytes: 1000 }), adres).rejects.toThrow("niet op het openbare internet");
    }
    await expect(haalOp("ftp://voorbeeld.be/a", { maxBytes: 1000 })).rejects.toThrow("geen geldig adres");
    await expect(haalOp("https://voorbeeld.be:8443/a", { maxBytes: 1000 })).rejects.toThrow("geen geldig adres");
  });
});
