/**
 * Wanneer een foto genomen werd, uit de EXIF-gegevens van een JPEG. Werffoto's
 * worden vaak 's avonds in één keer opgeladen; dan telt de dag van de foto,
 * niet die van het opladen. Puur, voor de browser en de tests.
 *
 * Enkel de datum wordt gelezen. Het verkleinen daarna (verklein.ts) laat alle
 * EXIF-gegevens weg, en dus ook de plaats waar de foto genomen werd.
 */

const DATUM_ORIGINEEL = 0x9003;
const DATUM_GEDIGITALISEERD = 0x9004;
const ZONE_ORIGINEEL = 0x9011;
const DATUM_BESTAND = 0x0132;
const EXIF_IFD = 0x8769;

interface Veld {
  type: number;
  aantal: number;
  plaats: number;
}

/**
 * "2026-10-02T14:31:05+02:00" als de foto haar tijdzone kent, anders
 * "2026-10-02T14:31:05" (plaatselijke tijd). Null zonder bruikbare datum.
 */
export function exifDatum(buffer: ArrayBuffer): string | null {
  try {
    const v = new DataView(buffer);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xff) return null;
      const merker = v.getUint8(p + 1);
      // Het beeld zelf begint, of het bestand eindigt: geen EXIF meer te verwachten.
      if (merker === 0xda || merker === 0xd9) return null;
      const lengte = v.getUint16(p + 2);
      if (merker === 0xe1 && lengte >= 16 && tekst(v, p + 4, 6) === "Exif\0\0") {
        return leesTiff(new DataView(buffer, p + 10, Math.min(lengte - 8, v.byteLength - p - 10)));
      }
      p += 2 + lengte;
    }
    return null;
  } catch {
    // Een kapot of afgekapt bestand: dan maar zonder datum.
    return null;
  }
}

function tekst(v: DataView, van: number, lengte: number): string {
  let uit = "";
  for (let i = 0; i < lengte; i++) uit += String.fromCharCode(v.getUint8(van + i));
  return uit;
}

function leesTiff(t: DataView): string | null {
  const orde = t.getUint16(0);
  if (orde !== 0x4949 && orde !== 0x4d4d) return null;
  const klein = orde === 0x4949;
  const u16 = (plaats: number) => t.getUint16(plaats, klein);
  const u32 = (plaats: number) => t.getUint32(plaats, klein);
  if (u16(2) !== 42) return null;

  const lijst = (plaats: number): Map<number, Veld> => {
    const velden = new Map<number, Veld>();
    const aantal = u16(plaats);
    for (let i = 0; i < aantal && i < 500; i++) {
      const e = plaats + 2 + i * 12;
      velden.set(u16(e), { type: u16(e + 2), aantal: u32(e + 4), plaats: e + 8 });
    }
    return velden;
  };
  const ascii = (veld: Veld | undefined): string | null => {
    // Type 2 is ASCII; tot vier tekens staan in het veld zelf, anders verderop.
    if (!veld || veld.type !== 2 || veld.aantal < 2 || veld.aantal > 64) return null;
    const waar = veld.aantal <= 4 ? veld.plaats : u32(veld.plaats);
    return tekst(t, waar, veld.aantal - 1);
  };

  const ifd0 = lijst(u32(4));
  let datum: string | null = null;
  let zone: string | null = null;
  const exifplaats = ifd0.get(EXIF_IFD);
  if (exifplaats) {
    const exif = lijst(u32(exifplaats.plaats));
    datum = ascii(exif.get(DATUM_ORIGINEEL)) ?? ascii(exif.get(DATUM_GEDIGITALISEERD));
    zone = ascii(exif.get(ZONE_ORIGINEEL));
  }
  datum ??= ascii(ifd0.get(DATUM_BESTAND));

  const delen = datum?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!delen || delen[1] === "0000") return null;
  const [, jaar, maand, dag, uur, minuut, seconde] = delen;
  if (Number(maand) < 1 || Number(maand) > 12 || Number(dag) < 1 || Number(dag) > 31 || Number(uur) > 23) return null;
  const iso = `${jaar}-${maand}-${dag}T${uur}:${minuut}:${seconde}`;
  return zone && /^[+-]\d{2}:\d{2}$/.test(zone) ? `${iso}${zone}` : iso;
}
