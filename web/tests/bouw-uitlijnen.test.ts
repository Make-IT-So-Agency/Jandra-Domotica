import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { leesBlad } from "@/lib/bouw/omzetting/lezen";
import { zetOm } from "@/lib/bouw/omzetting/pijplijn";
import type { Blad } from "@/lib/bouw/omzetting/types";
import { inHuis, lijnUitOpLijnen, lijnUitOpNamen, muurlijnen } from "@/lib/bouw/omzetting/uitlijnen";

import { gelijkvloers, testplanPdf, verdieping, type Testgrondplan } from "./fixtures/bouw/testplan";

async function lees(plan: Testgrondplan): Promise<Blad> {
  const taak = getDocument({ data: testplanPdf(plan), verbosity: 0 });
  try {
    return await leesBlad(await (await taak.promise).getPage(1));
  } finally {
    await taak.destroy();
  }
}

/** Het gelijkvloers is de referentie: het huis ligt waar het blad het zegt. */
async function referentie() {
  const blad = await lees(gelijkvloers());
  const voorstel = zetOm(blad);
  const meterPerPunt = voorstel.schaal!.meterPerPunt;
  const kalibratie = { meterPerPunt, kwartslagen: 0, dx: 0, dy: 0 };
  return { blad, voorstel, meterPerPunt, kalibratie, lijnen: inHuis(muurlijnen(blad, meterPerPunt, voorstel.gebied), kalibratie) };
}

describe("de muren van een blad", () => {
  it("neemt de dikke lijnen, niet de arcering of de deurbogen", async () => {
    const { blad, meterPerPunt, voorstel } = await referentie();
    const lijnen = muurlijnen(blad, meterPerPunt, voorstel.gebied);
    expect(lijnen.length).toBeGreaterThan(10);
    // Elk stuk is minstens een meter lang.
    for (const [a, b] of lijnen) expect(Math.hypot(b[0] - a[0], b[1] - a[1]) * meterPerPunt).toBeGreaterThanOrEqual(1);
  });
});

describe("een andere verdieping uitlijnen", () => {
  it("vindt hoe de verdieping verschoven op haar blad staat", async () => {
    const ref = await referentie();
    const blad = await lees(verdieping());
    const voorstel = zetOm(blad);
    const uitlijning = lijnUitOpLijnen(muurlijnen(blad, ref.meterPerPunt, voorstel.gebied), ref.meterPerPunt, ref.lijnen);
    // De verdieping staat 0,37 m verder naar rechts en 0,21 m hoger op haar blad.
    expect(uitlijning).not.toBeNull();
    expect(uitlijning!.kwartslagen).toBe(0);
    expect(uitlijning!.dx).toBeCloseTo(-0.37, 1);
    expect(uitlijning!.dy).toBeCloseTo(0.21, 1);
    expect(Math.abs(uitlijning!.dx + 0.37)).toBeLessThanOrEqual(0.021);
    expect(Math.abs(uitlijning!.dy - 0.21)).toBeLessThanOrEqual(0.021);
    expect(uitlijning!.zekerheid).toBeGreaterThan(0.05);
  });

  it("vindt ook een tekening die een kwartslag gedraaid staat, als dat gevraagd wordt", async () => {
    const ref = await referentie();
    const blad = await lees({ ...gelijkvloers(), draai: 90 });
    const voorstel = zetOm(blad);
    const uitlijning = lijnUitOpLijnen(muurlijnen(blad, ref.meterPerPunt, voorstel.gebied), ref.meterPerPunt, ref.lijnen, {
      kwartslagen: [0, 1, 2, 3],
    });
    // Het blad staat met de klok mee gedraaid; terugdraaien is drie kwartslagen.
    expect(uitlijning!.kwartslagen).toBe(3);
  });
});

describe("een nieuwe versie uitlijnen", () => {
  it("op namen ongeveer, en met de lijnen daarna precies", async () => {
    const ref = await referentie();
    const oud = ref.voorstel.ruimtes.map((r) => ({
      naam: r.naam,
      ringen: r.ringen.map((ring) => ring.map(([x, y]) => [x * ref.meterPerPunt, y * ref.meterPerPunt] as [number, number])),
    }));
    // Versie 2: de keuken is groter, en het huis staat een halve meter verder op het blad.
    const blad = await lees({ ...gelijkvloers({ keukenwand: 5.5 }), verschuiving: [2.5, 2.0] });
    const voorstel = zetOm(blad);

    const opNamen = lijnUitOpNamen(voorstel.ruimtes, oud, ref.meterPerPunt);
    expect(opNamen).not.toBeNull();
    expect(Math.abs(opNamen!.dx + 0.5)).toBeLessThan(0.3);
    expect(Math.abs(opNamen!.dy)).toBeLessThan(0.05);

    const opLijnen = lijnUitOpLijnen(muurlijnen(blad, ref.meterPerPunt, voorstel.gebied), ref.meterPerPunt, ref.lijnen, {
      begin: opNamen!,
      bereikM: 0.6,
    });
    expect(Math.abs(opLijnen!.dx + 0.5)).toBeLessThanOrEqual(0.021);
    expect(Math.abs(opLijnen!.dy)).toBeLessThanOrEqual(0.021);
  });

  it("heeft minstens twee namen nodig", () => {
    expect(lijnUitOpNamen([{ naam: "keuken", ringen: [[[0, 0], [1, 0], [1, 1]]] }], [], 1)).toBeNull();
  });
});
