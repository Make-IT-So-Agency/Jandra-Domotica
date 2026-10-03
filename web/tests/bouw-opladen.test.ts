import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metHuis, nepSupabase } from "./stubs/nep-supabase";

const nep = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", () => ({ db: () => nep.client }));

import { MAX_GROOTTE } from "@/lib/bouw/bestanden";
import { rondUploadAf, ruimOngebruikteBestandenOp, ruimVerlatenUploadsOp, startUpload } from "@/lib/bouw/opladen";

let db: ReturnType<typeof nepSupabase>;

const pdf = (extra = "") => new TextEncoder().encode(`%PDF-1.7\n${extra}`);

beforeEach(() => {
  db = nepSupabase({
    bouw_bestanden: metHuis([
      { id: 1, pad: "plannen/oud.pdf", status: "wacht", created_at: "2026-10-01T00:00:00.000Z" },
      { id: 2, pad: "plannen/gebruikt.pdf", status: "klaar", created_at: "2026-09-01T00:00:00.000Z" },
      { id: 3, pad: "plannen/los.pdf", status: "klaar", created_at: "2026-09-01T00:00:00.000Z" },
    ]),
    bouw_planversies: [{ id: 9, plan_id: 1, bestand_id: 2, label: "v1" }],
  });
  nep.client = db.client;

  // Storage-URL's lezen uit de nagebootste objecten, met Range zoals Storage.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const pad = new URL(url).pathname.slice(1);
      const object = db.objecten.get(pad);
      if (!object) return new Response("niet gevonden", { status: 404 });
      const bereik = new Headers(init?.headers).get("Range")?.match(/bytes=0-(\d+)/);
      const inhoud = bereik ? object.inhoud.slice(0, Number(bereik[1]) + 1) : object.inhoud;
      return new Response(new Blob([new Uint8Array(inhoud)]), { status: bereik ? 206 : 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startUpload", () => {
  it("zet een rij op wacht en geeft een upload-URL, met enkel een UUID in het pad", async () => {
    const uitkomst = await startUpload(1, { naam: "Grondplan Kerkstraat 12.pdf", type: "application/pdf", grootte: 1234 }, "plan", "jan@voorbeeld.be");
    expect(uitkomst.ok).toBe(true);
    if (!uitkomst.ok) return;

    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === uitkomst.data.bestandId)!;
    expect(rij.status).toBe("wacht");
    expect(rij.oorspronkelijke_naam).toBe("Grondplan Kerkstraat 12.pdf");
    expect(rij.pad).toMatch(/^plannen\/[0-9a-f-]{36}\.pdf$/);
    expect(String(rij.pad)).not.toContain("Kerkstraat");
    expect(uitkomst.data.uploadUrl).toContain(String(rij.pad));
    expect(uitkomst.data.contentType).toBe("application/pdf");
  });

  it("weigert te grote bestanden voor er iets gebeurt", async () => {
    const aantal = db.tabellen.bouw_bestanden.length;
    const uitkomst = await startUpload(1, { naam: "a.pdf", type: "application/pdf", grootte: MAX_GROOTTE + 1 }, "plan", "jan@voorbeeld.be");
    expect(uitkomst.ok).toBe(false);
    expect(db.tabellen.bouw_bestanden).toHaveLength(aantal);
  });
});

describe("rondUploadAf", () => {
  async function gestart(inhoud: Uint8Array | null) {
    const uitkomst = await startUpload(1, { naam: "plan.pdf", type: "application/pdf", grootte: 100 }, "plan", "jan@voorbeeld.be");
    if (!uitkomst.ok) throw new Error(uitkomst.melding);
    const pad = String(db.tabellen.bouw_bestanden.find((b) => b.id === uitkomst.data.bestandId)!.pad);
    if (inhoud) db.objecten.set(pad, { inhoud, type: "application/pdf" });
    return { id: uitkomst.data.bestandId, pad };
  }

  it("zet een echte PDF op klaar, met de grootte die Storage kent", async () => {
    const { id } = await gestart(pdf("x".repeat(2000)));
    const uitkomst = await rondUploadAf(1, id);
    expect(uitkomst.ok).toBe(true);
    const rij = db.tabellen.bouw_bestanden.find((b) => b.id === id)!;
    expect(rij.status).toBe("klaar");
    expect(rij.grootte_bytes).toBe(2009);
  });

  it("zegt het als het bestand nooit aankwam", async () => {
    const { id } = await gestart(null);
    const uitkomst = await rondUploadAf(1, id);
    expect(uitkomst).toEqual({ ok: false, melding: "Het bestand is niet aangekomen. Laad het opnieuw op." });
  });

  it("gooit iets weg dat geen PDF is, uit Storage en uit het register", async () => {
    const { id, pad } = await gestart(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
    const uitkomst = await rondUploadAf(1, id);
    expect(uitkomst.ok).toBe(false);
    expect(db.objecten.has(pad)).toBe(false);
    expect(db.tabellen.bouw_bestanden.some((b) => b.id === id)).toBe(false);
  });

  it("zet een foto enkel op klaar als ze echt een JPEG is", async () => {
    const foto = async (inhoud: number[]) => {
      const uitkomst = await startUpload(1, { naam: "IMG_0001.jpg", type: "image/jpeg", grootte: 100 }, "foto", "jan@voorbeeld.be");
      if (!uitkomst.ok) throw new Error(uitkomst.melding);
      const pad = String(db.tabellen.bouw_bestanden.find((b) => b.id === uitkomst.data.bestandId)!.pad);
      expect(pad).toMatch(/^fotos\/[0-9a-f-]{36}\.jpg$/);
      db.objecten.set(pad, { inhoud: new Uint8Array(inhoud), type: "image/jpeg" });
      return uitkomst.data.bestandId;
    };
    expect((await rondUploadAf(1, await foto([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).ok).toBe(true);
    expect(await rondUploadAf(1, await foto([0x89, 0x50, 0x4e, 0x47, 1, 2]))).toEqual({
      ok: false,
      melding: "Dit bestand is geen JPEG-foto. Het werd niet bewaard.",
    });
  });

  it("is herhaalbaar: een bestand dat al klaar is, blijft klaar", async () => {
    const uitkomst = await rondUploadAf(1, 2);
    expect(uitkomst.ok).toBe(true);
  });
});

describe("opruimen", () => {
  it("ruimt uploads op die meer dan drie uur op wacht staan", async () => {
    db.objecten.set("plannen/oud.pdf", { inhoud: pdf(), type: "application/pdf" });
    const aantal = await ruimVerlatenUploadsOp(new Date("2026-10-01T04:00:00.000Z"));
    expect(aantal).toBe(1);
    expect(db.objecten.has("plannen/oud.pdf")).toBe(false);
    expect(db.tabellen.bouw_bestanden.some((b) => b.id === 1)).toBe(false);
  });

  it("laat recente uploads staan", async () => {
    expect(await ruimVerlatenUploadsOp(new Date("2026-10-01T02:00:00.000Z"))).toBe(0);
  });

  it("laat een foto staan die een optie van een keuze nog gebruikt", async () => {
    db.tabellen.bouw_opties = [{ id: 5, keuze_id: 1, naam: "Eik", foto_bestand_id: 3 }];
    await ruimOngebruikteBestandenOp(1, [3]);
    expect(db.verwijderd).toEqual([]);
  });

  it("ruimt enkel bestanden op die geen versie nog gebruikt", async () => {
    await ruimOngebruikteBestandenOp(1, [2, 3]);
    expect(db.verwijderd).toEqual(["plannen/los.pdf"]);
    expect(db.tabellen.bouw_bestanden.map((b) => b.id)).toEqual([1, 2]);
  });
});
