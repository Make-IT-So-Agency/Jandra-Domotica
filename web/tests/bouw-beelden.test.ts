import { beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase, TESTHUIS } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown, ik: null as unknown, huis: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/bouw/huistoegang", () => ({
  huisgebruiker: async () => (nep.ik && nep.huis ? { ik: nep.ik, huis: nep.huis } : null),
}));

import { bewaarBeeldActie, bewaarStandpuntActie, verwijderBeeldActie, wijzigBeeldActie } from "@/app/vastgoed/[huis]/3d/acties";
import { lijstBeelden } from "@/lib/bouw/beelden-opslag";
import {
  beeldInVak,
  cameraKijkhoek,
  camerarichting,
  gebouwVanOog,
  naarWereld,
  schoneTitel,
  schoonStandpunt,
  standpuntVan,
  titelVanBestand,
  uitWereld,
  verdiepingVanOog,
  verplaatsOog,
  vooruit,
  type Xyz,
} from "@/lib/bouw/drie/beelden";

const dicht = (a: readonly number[], b: readonly number[], cijfers = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], cijfers));

describe("een standpunt nakijken", () => {
  it("rondt af op een millimeter en een tiende graad", () => {
    expect(schoonStandpunt({ oog: [1.23456, 2, 1.6], doel: [4, 2.00004, 1.5], kijkhoek: 72.345 })).toEqual({
      oog: [1.235, 2, 1.6],
      doel: [4, 2, 1.5],
      kijkhoek: 72.3,
    });
  });

  it("weigert wat niet klopt", () => {
    const goed = { oog: [1, 2, 1.6], doel: [4, 2, 1.5], kijkhoek: 70 };
    for (const fout of [
      null,
      [],
      "ja",
      { ...goed, oog: [1, 2] },
      { ...goed, oog: [1, "2", 1.6] },
      { ...goed, doel: [1, 2, 1.62] },
      { ...goed, kijkhoek: 10 },
      { ...goed, kijkhoek: 150 },
      { ...goed, oog: [5000, 2, 1.6] },
      { ...goed, oog: [1, 2, 99] },
      { ...goed, doel: [Number.NaN, 2, 1.5] },
    ]) {
      expect(schoonStandpunt(fout), JSON.stringify(fout)).toBeNull();
    }
  });

  it("maakt een titel, ook uit de naam van een bestand", () => {
    expect(schoneTitel("  Keuken,   eiland ")).toBe("Keuken, eiland");
    expect(schoneTitel("")).toBeNull();
    expect(schoneTitel("x".repeat(81))).toBeNull();
    expect(schoneTitel(12)).toBeNull();
    expect(titelVanBestand("vestiaire_open.JPG")).toBe("vestiaire open");
    expect(titelVanBestand("Keuken - zicht op het eiland.png")).toBe("Keuken - zicht op het eiland");
    expect(titelVanBestand(".jpg")).toBe("Beeld");
  });
});

describe("van het gebouw naar de wereld van three.js", () => {
  // Een gebouw van 10 op 8 m, met zijn midden op (20, 30) van het terrein, een kwartslag gedraaid.
  const gebouw = { kader: { x0: 0, y0: 0, x1: 10, y1: 8 }, plaatsing: { x: 20, y: 30, hoek: 90 } };

  it("zet een punt op zijn plaats en terug, met de hoogte als y", () => {
    // Het midden van het gebouw komt op de plaatsing.
    dicht(naarWereld([5, 4, 1.6], gebouw), [20, 1.6, 30]);
    // Een meter naar rechts in het gebouw is een kwartslag gedraaid een meter verder in y van het terrein.
    dicht(naarWereld([6, 4, 0], gebouw), [20, 0, 31]);
    const p: Xyz = [2.5, 7.25, 3.1];
    dicht(uitWereld(naarWereld(p, gebouw), gebouw), p);
  });

  it("draait de camera naar het doel, en terug", () => {
    for (const [kijk, op] of [
      [0, 0],
      [1.2, -0.3],
      [-2.5, 0.4],
      [Math.PI / 2, 0.1],
    ]) {
      const r = vooruit(kijk, op);
      expect(Math.hypot(...r)).toBeCloseTo(1);
      const terug = camerarichting([0, 0, 0], r);
      expect(terug.kijk).toBeCloseTo(kijk);
      expect(terug.op).toBeCloseTo(op);
    }
    // Zonder draaiing kijkt de camera naar -z.
    dicht(vooruit(0, 0), [-0, 0, -1]);
  });

  it("bewaart het standpunt van de camera in het gebouw, en zet het terug", () => {
    const oog: Xyz = [22, 1.55, 28];
    const { kijk, op } = { kijk: 0.7, op: -0.05 };
    const s = standpuntVan(oog, kijk, op, 68.04, gebouw);
    expect(s.kijkhoek).toBe(68);
    // Terug in de wereld: hetzelfde oog en dezelfde richting.
    const terugOog = naarWereld(s.oog, gebouw);
    dicht(terugOog, oog, 2);
    const terug = camerarichting(terugOog, naarWereld(s.doel, gebouw));
    expect(terug.kijk).toBeCloseTo(kijk, 2);
    expect(terug.op).toBeCloseTo(op, 2);
    expect(schoonStandpunt(s)).toEqual(s);
  });

  it("houdt het oog op zijn plaats in het gebouw als het gebouw verschuift en draait", () => {
    const oog: Xyz = [21, 1.6, 29];
    const elders = { kader: gebouw.kader, plaatsing: { x: 50, y: -10, hoek: 120 } };
    const stand = verplaatsOog(oog, 0.4, -0.1, gebouw, elders);
    // In het gebouw: hetzelfde oog en dezelfde blik.
    dicht(uitWereld(stand.oog, elders), uitWereld(oog, gebouw));
    const voor = vooruit(0.4, -0.1);
    const doelVoor = uitWereld([oog[0] + voor[0], oog[1] + voor[1], oog[2] + voor[2]], gebouw);
    const na = vooruit(stand.kijk, stand.op);
    dicht(uitWereld([stand.oog[0] + na[0], stand.oog[1] + na[1], stand.oog[2] + na[2]], elders), doelVoor);
    expect(stand.op).toBeCloseTo(-0.1);
  });

  it("vindt het gebouw van het oog, en zijn verdieping", () => {
    const woning = { id: 1, ...gebouw };
    const garage = { id: 2, kader: { x0: 0, y0: 0, x1: 6, y1: 6 }, plaatsing: { x: 40, y: 30, hoek: 0 } };
    expect(gebouwVanOog([woning, garage], [20, 1.6, 30])?.id).toBe(1);
    expect(gebouwVanOog([woning, garage], [41, 1.6, 29])?.id).toBe(2);
    // Buiten allebei: het dichtste.
    expect(gebouwVanOog([woning, garage], [50, 1.6, 30])?.id).toBe(2);
    expect(gebouwVanOog([], [0, 0, 0])).toBeNull();
    const verdiepingen = [
      { id: 11, z0: 2.95 },
      { id: 10, z0: 0 },
      { id: 9, z0: -2.8 },
    ];
    expect(verdiepingVanOog(verdiepingen, 1.6)?.id).toBe(10);
    expect(verdiepingVanOog(verdiepingen, 4.5)?.id).toBe(11);
    // Op de trap net onder de verdieping telt die al.
    expect(verdiepingVanOog(verdiepingen, 2.8)?.id).toBe(11);
    expect(verdiepingVanOog(verdiepingen, -1)?.id).toBe(9);
    expect(verdiepingVanOog(verdiepingen, -9)?.id).toBe(9);
  });
});

describe("het beeld over het 3D-beeld", () => {
  // Een render van 2000 op 1414 pixels, die 70 graden breed kijkt.
  const verhouding = 2000 / 1414;
  const verticaal = (Math.atan(Math.tan((35 * Math.PI) / 180) / verhouding) * 360) / Math.PI;

  it("vult in een breed vak de hoogte: dan kijkt de camera even hoog als het beeld", () => {
    expect(cameraKijkhoek(70, verhouding, { breedte: 1600, hoogte: 800 })).toBeCloseTo(verticaal);
    expect(beeldInVak(verhouding, { breedte: 1600, hoogte: 800 })).toEqual({ x: (1600 - 800 * verhouding) / 2, y: 0, breedte: 800 * verhouding, hoogte: 800 });
  });

  it("vult in een smal vak de breedte: dan ziet de camera boven en onder meer", () => {
    const vak = { breedte: 390, hoogte: 700 };
    const camera = cameraKijkhoek(70, verhouding, vak);
    expect(camera).toBeGreaterThan(verticaal);
    const r = beeldInVak(verhouding, vak);
    expect(r.breedte).toBe(390);
    expect(r.y).toBeCloseTo((700 - 390 / verhouding) / 2);
    // De hoogte van het beeld in het vak is die van de render: tan van de halve hoeken in dezelfde verhouding.
    expect(Math.tan((verticaal * Math.PI) / 360) / Math.tan((camera * Math.PI) / 360)).toBeCloseTo(r.hoogte / vak.hoogte);
  });
});

describe("beelden bewaren", () => {
  const ik = { id: "h", email: "jan@voorbeeld.be", naam: null, rol: "hoofdbeheerder" };
  let db: ReturnType<typeof nepSupabase>;
  const bestand = (id: number, huis: number, doel = "foto") => ({ id, huis_id: huis, doel, status: "klaar", pad: `fotos/${id}.jpg`, mime_type: "image/jpeg", naam: `${id}.jpg`, grootte_bytes: 1000 });

  beforeEach(() => {
    nep.huis = { ...TESTHUIS };
    db = nepSupabase({
      bouw_huizen: [{ ...TESTHUIS }, { ...TESTHUIS, id: 2, naam: "Ander huis" }],
      bouw_gebouwen: [...metHuis([{ id: 1, naam: "Woning", volgorde: 0 }]), { id: 2, huis_id: 2, naam: "Woning", volgorde: 0 }],
      bouw_verdiepingen: [
        { id: 1, gebouw_id: 1, naam: "Gelijkvloers", volgorde: 0 },
        { id: 2, gebouw_id: 2, naam: "Gelijkvloers", volgorde: 0 },
      ],
      bouw_ruimtes: [
        { id: 11, verdieping_id: 1, naam: "Keuken" },
        { id: 21, verdieping_id: 2, naam: "Keuken" },
      ],
      bouw_bestanden: [bestand(70, 1), bestand(71, 1), bestand(72, 1, "plan"), bestand(90, 2)],
      bouw_beelden: [],
    });
    for (const id of [70, 71, 72, 90]) db.objecten.set(`fotos/${id}.jpg`, { inhoud: new Uint8Array([0xff, 0xd8, 0xff]), type: "image/jpeg" });
    nep.client = db.client;
    nep.ik = ik;
  });

  it("bewaart een beeld met zijn ruimte, wijzigt het, en zet een standpunt", async () => {
    const uit = await bewaarBeeldActie(1, { bestandId: 70, titel: " Keuken,  het eiland ", ruimteId: 11 });
    expect(uit).toMatchObject({ ok: true });
    const beeldId = uit.ok ? uit.data.id : 0;
    expect(await lijstBeelden(1)).toEqual([
      expect.objectContaining({ id: beeldId, bestand_id: 70, titel: "Keuken, het eiland", ruimte_id: 11, verdieping_id: null, standpunt: null }),
    ]);

    expect(await wijzigBeeldActie(1, { id: beeldId, titel: "Eiland", ruimteId: null })).toMatchObject({ ok: true });
    const standpunt = { oog: [3, 4, 1.6], doel: [6, 4, 1.5], kijkhoek: 70 };
    expect(await bewaarStandpuntActie(1, { id: beeldId, verdiepingId: 1, standpunt })).toMatchObject({ ok: true });
    expect((await lijstBeelden(1))[0]).toMatchObject({ titel: "Eiland", ruimte_id: null, verdieping_id: 1, standpunt });

    // Een standpunt dat niet klopt, of op een verdieping van een ander huis: niet.
    expect(await bewaarStandpuntActie(1, { id: beeldId, verdiepingId: 1, standpunt: { ...standpunt, kijkhoek: 5 } })).toMatchObject({ ok: false });
    expect(await bewaarStandpuntActie(1, { id: beeldId, verdiepingId: 2, standpunt })).toMatchObject({ ok: false });
    // Wissen.
    expect(await bewaarStandpuntActie(1, { id: beeldId, verdiepingId: null, standpunt: null })).toMatchObject({ ok: true });
    expect((await lijstBeelden(1))[0]).toMatchObject({ verdieping_id: null, standpunt: null });
  });

  it("weigert een ruimte of een foto van een ander huis, een plan, en wie geen toegang heeft", async () => {
    expect(await bewaarBeeldActie(1, { bestandId: 70, titel: "Keuken", ruimteId: 21 })).toMatchObject({ ok: false });
    expect(await bewaarBeeldActie(1, { bestandId: 90, titel: "Keuken", ruimteId: null })).toMatchObject({ ok: false });
    expect(await bewaarBeeldActie(1, { bestandId: 72, titel: "Plan", ruimteId: null })).toMatchObject({ ok: false, melding: expect.stringContaining("geen foto") });
    expect(await bewaarBeeldActie(1, { bestandId: 71, titel: "", ruimteId: null })).toMatchObject({ ok: false });
    nep.ik = null;
    expect(await bewaarBeeldActie(1, { bestandId: 71, titel: "Keuken", ruimteId: null })).toMatchObject({ ok: false });
    expect(await lijstBeelden(1)).toEqual([]);
  });

  it("haalt een beeld weg, met zijn foto", async () => {
    const uit = await bewaarBeeldActie(1, { bestandId: 71, titel: "Vestiaire", ruimteId: null });
    const beeldId = uit.ok ? uit.data.id : 0;
    expect(await verwijderBeeldActie(1, { id: beeldId })).toMatchObject({ ok: true });
    expect(await lijstBeelden(1)).toEqual([]);
    expect(db.objecten.has("fotos/71.jpg")).toBe(false);
    expect(db.tabellen.bouw_bestanden.some((b) => b.id === 71)).toBe(false);
    // Een beeld van een ander huis blijft.
    db.tabellen.bouw_beelden.push({ id: 500, huis_id: 2, bestand_id: 90, titel: "Ander", ruimte_id: null, verdieping_id: null, standpunt: null, volgorde: 0 });
    await verwijderBeeldActie(1, { id: 500 });
    expect(db.tabellen.bouw_beelden).toHaveLength(1);
  });
});
