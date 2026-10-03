import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { exifDatum } from "@/lib/bouw/exif";
import { maakOpleverPdf } from "@/lib/bouw/oplevering-pdf";
import { ruimOngebruikteBestandenOp } from "@/lib/bouw/opladen";
import {
  CHECKLIST_DICHT,
  actiepuntherinneringen,
  checklistVoor,
  opleverstand,
  pasStapToe,
  perDag,
  stappenVoor,
  type Actiepunt,
  type Opleverpunt,
} from "@/lib/bouw/werf";
import {
  leesOpleverpunt,
  lijstVinkjes,
  verwijderWerffoto,
  voegOpleverpuntToe,
  voegWerffotoToe,
  zetOpleverstap,
  zetVinkje,
} from "@/lib/bouw/werf-opslag";

const NU = new Date("2026-10-02T12:00:00Z");
const leeg = {
  status: "open" as const,
  gemeld_op: null,
  hersteld_op: null,
  hersteld_door: null,
  herstelopmerking: null,
  gecontroleerd_op: null,
  gecontroleerd_door: null,
};

describe("de stappen van een opleverpunt", () => {
  it("gaat van open over gemeld en hersteld naar gecontroleerd", () => {
    const gemeld = pasStapToe(leeg, "melden", "wij", "Jan", NU);
    if (!gemeld.ok) throw new Error(gemeld.melding);
    expect(gemeld.waarde).toMatchObject({ status: "gemeld", gemeld_op: NU.toISOString() });

    const hersteld = pasStapToe(gemeld.waarde, "hersteld", "aannemer", "Bouwbedrijf Voorbeeld", NU, "Voeg opnieuw gezet");
    if (!hersteld.ok) throw new Error(hersteld.melding);
    expect(hersteld.waarde).toMatchObject({ status: "hersteld", hersteld_door: "Bouwbedrijf Voorbeeld", herstelopmerking: "Voeg opnieuw gezet" });

    const goed = pasStapToe(hersteld.waarde, "goedkeuren", "wij", "Sandra", NU);
    if (!goed.ok) throw new Error(goed.melding);
    expect(goed.waarde).toMatchObject({ status: "gecontroleerd", gecontroleerd_door: "Sandra" });
  });

  it("laat enkel ons goedkeuren, en de aannemer enkel melden dat het hersteld is", () => {
    expect(stappenVoor("hersteld", "aannemer")).toEqual([]);
    expect(stappenVoor("open", "aannemer")).toEqual(["hersteld"]);
    expect(pasStapToe({ ...leeg, status: "hersteld" }, "goedkeuren", "aannemer", "x", NU)).toEqual({
      ok: false,
      melding: 'Dit punt staat op "hersteld, te controleren": dat kan nu niet.',
    });
    // Rechtstreeks van open naar gecontroleerd kan niet: eerst hersteld.
    expect(stappenVoor("open", "wij")).not.toContain("goedkeuren");
  });

  it("stuurt een slecht herstel terug, met de reden erbij", () => {
    const punt = { ...leeg, status: "hersteld" as const, gemeld_op: "2026-09-20T08:00:00Z", hersteld_op: "2026-09-30T08:00:00Z", hersteld_door: "x" };
    const af = pasStapToe(punt, "afkeuren", "wij", "Jan", NU, "nog altijd een barst");
    expect(af).toEqual({
      ok: true,
      waarde: expect.objectContaining({ status: "gemeld", hersteld_op: null, hersteld_door: null, herstelopmerking: "Niet in orde: nog altijd een barst", gemeld_op: "2026-09-20T08:00:00Z" }),
    });
    const terug = pasStapToe({ ...punt, status: "gecontroleerd", gecontroleerd_op: "2026-10-01T08:00:00Z", gecontroleerd_door: "Jan" }, "heropenen", "wij", "Jan", NU);
    expect(terug).toEqual({ ok: true, waarde: expect.objectContaining({ status: "gemeld", gecontroleerd_op: null }) });
  });

  it("telt per aannemer hoeveel punten in elke stand staan", () => {
    const stand = opleverstand([
      { partij_id: 4, status: "open" },
      { partij_id: 4, status: "hersteld" },
      { partij_id: 4, status: "gecontroleerd" },
      { partij_id: null, status: "open" },
    ]);
    expect(stand.get(4)).toEqual({ open: 1, gemeld: 0, hersteld: 1, gecontroleerd: 1, totaal: 3 });
    expect(stand.get(null)?.totaal).toBe(1);
  });
});

describe("actiepunten en de checklist", () => {
  const punt = (deadline: string | null, status: Actiepunt["status"] = "open"): Actiepunt => ({
    id: 3, titel: "Stelling afbreken", omschrijving: null, partij_id: 4, deadline, status, klaar_op: null, door: null, created_at: "",
  });
  const naam = (id: number | null) => (id === 4 ? "Bouwbedrijf Voorbeeld" : null);

  it("herinnert de dag ervoor, op de dag zelf en de dag erna", () => {
    expect(actiepuntherinneringen([punt("2026-10-03")], naam, "2026-10-02")).toEqual([
      {
        sleutel: "actiepunt:3:2026-10-03:1",
        tekst: "📌 Actiepunt Stelling afbreken (Bouwbedrijf Voorbeeld): klaar tegen morgen.",
        pad: "/bouw/werf/actiepunten",
      },
    ]);
    expect(actiepuntherinneringen([punt("2026-10-01")], naam, "2026-10-02")[0].tekst).toContain("de deadline was gisteren (1 okt)");
    expect(actiepuntherinneringen([punt("2026-10-05")], naam, "2026-10-02")).toEqual([]);
    expect(actiepuntherinneringen([punt("2026-10-02", "klaar"), punt(null)], naam, "2026-10-02")).toEqual([]);
  });

  it("geeft elke ruimte de checklist die bij haar soort past", () => {
    expect(checklistVoor("wc").map((p) => p.sleutel)).toContain("sanitair");
    expect(checklistVoor("slaapkamer").map((p) => p.sleutel)).not.toContain("sanitair");
    expect(checklistVoor("terras").map((p) => p.sleutel)).toEqual(["foto_muren", "luchtdicht"]);
    expect(new Set(CHECKLIST_DICHT.map((p) => p.sleutel)).size).toBe(CHECKLIST_DICHT.length);
    for (const p of CHECKLIST_DICHT) expect(p.sleutel).toMatch(/^[a-z0-9_]{1,40}$/);
  });
});

describe("foto's", () => {
  it("zet foto's per Belgische dag, de laatste dag eerst", () => {
    const dagen = perDag([
      { id: 1, genomen_op: "2026-10-02T08:00:00Z" },
      { id: 2, genomen_op: "2026-10-02T22:30:00Z" }, // 0.30 uur op 3 oktober in België
      { id: 3, genomen_op: "2026-10-02T06:00:00Z" },
    ]);
    expect(dagen.map((d) => [d.dag, d.fotos.map((f) => f.id)])).toEqual([
      ["2026-10-03", [2]],
      ["2026-10-02", [3, 1]],
    ]);
  });
});

/** Een kleine JPEG met enkel een EXIF-blok, zoals een gsm dat schrijft. */
function jpegMetExif({ origineel, zone, bestand }: { origineel?: string; zone?: string; bestand?: string }, klein = false): ArrayBuffer {
  const u16 = (w: number) => (klein ? [w & 0xff, w >> 8] : [w >> 8, w & 0xff]);
  const u32 = (w: number) => (klein ? [w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, w >>> 24] : [w >>> 24, (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]);
  const ascii = (tekst: string) => [...tekst].map((c) => c.charCodeAt(0)).concat([0]);

  const ifd0Velden = (bestand ? 1 : 0) + 1;
  const exifVelden = (origineel ? 1 : 0) + (zone ? 1 : 0);
  const ifd0 = 8;
  const exif = ifd0 + 2 + 12 * ifd0Velden + 4;
  let data = exif + 2 + 12 * exifVelden + 4;
  const gegevens: number[] = [];
  const veld = (tag: number, waarde: string) => {
    const bytes = ascii(waarde);
    const plaats = data + gegevens.length;
    gegevens.push(...bytes);
    return [...u16(tag), ...u16(2), ...u32(bytes.length), ...u32(plaats)];
  };

  const tiff: number[] = [...(klein ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0)];
  tiff.push(...u16(ifd0Velden));
  if (bestand) tiff.push(...veld(0x0132, bestand));
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exif), ...u32(0));
  tiff.push(...u16(exifVelden));
  if (origineel) tiff.push(...veld(0x9003, origineel));
  if (zone) tiff.push(...veld(0x9011, zone));
  tiff.push(...u32(0), ...gegevens);

  const app1 = [0xff, 0xe1, ...[(tiff.length + 8) >> 8, (tiff.length + 8) & 0xff], ...ascii("Exif"), 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]).buffer;
}

describe("de PDF met opleverpunten", () => {
  it("is een PDF, ook als er niets meer te herstellen is", async () => {
    const regel = { nummer: 1, titel: "Barst in de voeg", omschrijving: "Naast de voordeur", waar: "Inkom", ronde: "Voorlopige oplevering", status: "te herstellen", opmerking: null, foto: null };
    const pdf = await maakOpleverPdf({ partij: "Bouwbedrijf Voorbeeld", project: "Ons huis", regels: [regel], metLink: true, opgemaakt: NU });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const leeg = await maakOpleverPdf({ partij: "Bouwbedrijf Voorbeeld", project: null, regels: [], metLink: false, opgemaakt: NU });
    expect(leeg.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("de datum uit de EXIF van een foto", () => {
  it("leest de opnamedatum, met de tijdzone als de foto die kent", () => {
    expect(exifDatum(jpegMetExif({ origineel: "2026:10:02 14:31:05", zone: "+02:00" }))).toBe("2026-10-02T14:31:05+02:00");
    expect(exifDatum(jpegMetExif({ origineel: "2026:10:02 14:31:05" }, true))).toBe("2026-10-02T14:31:05");
  });

  it("valt terug op de datum van het bestand, en weigert onzin", () => {
    expect(exifDatum(jpegMetExif({ bestand: "2026:09:30 08:00:00" }))).toBe("2026-09-30T08:00:00");
    expect(exifDatum(jpegMetExif({ origineel: "0000:00:00 00:00:00" }))).toBeNull();
    expect(exifDatum(jpegMetExif({}))).toBeNull();
    expect(exifDatum(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(exifDatum(jpegMetExif({ origineel: "2026:10:02 14:31:05" }).slice(0, 30))).toBeNull();
  });
});

describe("de werf in de databank", () => {
  let db: ReturnType<typeof nepSupabase>;
  beforeEach(() => {
    db = nepSupabase({
      bouw_partijen: metHuis([{ id: 4, soort: "aannemer", naam: "Bouwbedrijf Voorbeeld" }]),
      bouw_gebouwen: metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]),
      bouw_verdiepingen: [{ id: 2, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0 }],
      bouw_ruimtes: [{ id: 5, verdieping_id: 2, naam: "badkamer", soort: "badkamer", veelhoek: [] }],
      bouw_opleverpunten: [],
      bouw_werffotos: [],
      bouw_checklist: [],
      bouw_bestanden: metHuis([
        { id: 80, pad: "fotos/werf.jpg", doel: "foto", status: "klaar", oorspronkelijke_naam: "IMG.jpg" },
        { id: 81, pad: "fotos/werf-klein.jpg", doel: "foto", status: "klaar", oorspronkelijke_naam: "IMG.jpg" },
      ]),
      bouw_planversies: [],
      bouw_opties: [],
      bouw_offertes: [],
      bouw_facturen: [],
      bouw_inzendingen: [],
    });
    nep.client = db.client;
  });

  it("bewaart een stap enkel als het punt nog in dezelfde stand staat", async () => {
    const id = await voegOpleverpuntToe(1, {
      titel: "Barst in de voeg", omschrijving: null, partij_id: 4, verdieping_id: null, ruimte_id: null, x_m: null, y_m: null, ronde: "voorlopig", door: "Jan",
    });
    const punt = (await leesOpleverpunt(1, id)) as Opleverpunt;
    const stap = pasStapToe(punt, "melden", "wij", "Jan", NU);
    if (!stap.ok) throw new Error(stap.melding);
    expect(await zetOpleverstap(1, id, "open", stap.waarde)).toBe(true);
    // Iemand anders drukte ook: het punt staat niet meer op open.
    expect(await zetOpleverstap(1, id, "open", stap.waarde)).toBe(false);
    expect(await leesOpleverpunt(1, id)).toMatchObject({ status: "gemeld" });
  });

  it("vinkt aan en weer af, één keer per ruimte en punt", async () => {
    await zetVinkje(1, 5, "sanitair", true, "Jan");
    await zetVinkje(1, 5, "sanitair", true, "Sandra");
    expect(await lijstVinkjes(1)).toEqual([expect.objectContaining({ ruimte_id: 5, sleutel: "sanitair", door: "Sandra" })]);
    await zetVinkje(1, 5, "sanitair", false, "Jan");
    expect(await lijstVinkjes(1)).toEqual([]);
  });

  it("houdt de foto in de opslag zolang de werf ze gebruikt", async () => {
    const fotoId = await voegWerffotoToe(1, {
      bestand_id: 80, duim_bestand_id: 81, genomen_op: "2026-10-02T08:00:00Z", onderschrift: "Leidingen keuken", verdieping_id: null,
      ruimte_id: null, x_m: null, y_m: null, dagboek_id: null, opleverpunt_id: null, door: "Jan",
    });
    await ruimOngebruikteBestandenOp(1, [80, 81]);
    expect(db.verwijderd).toEqual([]);
    expect(await verwijderWerffoto(1, fotoId)).toEqual([80, 81]);
    await ruimOngebruikteBestandenOp(1, [80, 81]);
    expect(db.verwijderd).toEqual(["fotos/werf.jpg", "fotos/werf-klein.jpg"]);
  });
});
