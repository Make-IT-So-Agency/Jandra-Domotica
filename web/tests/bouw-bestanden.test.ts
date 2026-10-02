import { describe, expect, it } from "vitest";

import {
  MAX_GROOTTE,
  controleerUpload,
  isGeldigPad,
  isPdfBegin,
  leesbareGrootte,
  maakPad,
  vertaalOpslagfout,
} from "@/lib/bouw/bestanden";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("controleerUpload", () => {
  it("aanvaardt een PDF", () => {
    expect(controleerUpload({ naam: "grondplan.pdf", type: "application/pdf", grootte: 1000 }, "plan")).toEqual({
      ok: true,
      contentType: "application/pdf",
    });
  });

  it("aanvaardt een PDF zonder type als de extensie klopt", () => {
    const uitkomst = controleerUpload({ naam: "PLAN.PDF", type: "", grootte: 1000 }, "plan");
    expect(uitkomst).toEqual({ ok: true, contentType: "application/pdf" });
  });

  it("weigert een ander type, ook met een pdf-extensie", () => {
    const uitkomst = controleerUpload({ naam: "foto.pdf", type: "image/png", grootte: 1000 }, "plan");
    expect(uitkomst.ok).toBe(false);
  });

  it("weigert een leeg bestand", () => {
    expect(controleerUpload({ naam: "a.pdf", type: "application/pdf", grootte: 0 }, "plan").ok).toBe(false);
  });

  it("weigert alles boven de limiet, met de grootte in de melding", () => {
    const uitkomst = controleerUpload({ naam: "a.pdf", type: "application/pdf", grootte: MAX_GROOTTE + 1 }, "plan");
    expect(uitkomst.ok).toBe(false);
    if (!uitkomst.ok) expect(uitkomst.melding).toContain("50 MB");
  });

  it("aanvaardt precies de limiet", () => {
    expect(controleerUpload({ naam: "a.pdf", type: "application/pdf", grootte: MAX_GROOTTE }, "plan").ok).toBe(true);
  });
});

describe("paden", () => {
  it("maakt een pad met enkel een UUID", () => {
    expect(maakPad("plan", UUID)).toBe(`plannen/${UUID}.pdf`);
  });

  it("weigert een UUID die er geen is", () => {
    expect(() => maakPad("plan", "../geheim")).toThrow();
  });

  it("herkent een geldig pad en niets anders", () => {
    expect(isGeldigPad(`plannen/${UUID}.pdf`)).toBe(true);
    expect(isGeldigPad(`plannen/${UUID}.png`)).toBe(false);
    expect(isGeldigPad(`plannen/sub/${UUID}.pdf`)).toBe(false);
    expect(isGeldigPad(`fotos/${UUID}.pdf`)).toBe(false);
    expect(isGeldigPad("plannen/Kerkstraat 1.pdf")).toBe(false);
  });
});

describe("isPdfBegin", () => {
  const bytes = (tekst: string) => new TextEncoder().encode(tekst);

  it("herkent een PDF", () => {
    expect(isPdfBegin(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
  });

  it("aanvaardt wat rommel vóór de kop", () => {
    expect(isPdfBegin(bytes(`${"x".repeat(500)}%PDF-1.4`))).toBe(true);
  });

  it("weigert een PNG of een te late kop", () => {
    expect(isPdfBegin(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
    expect(isPdfBegin(bytes(`${"x".repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(isPdfBegin(new Uint8Array())).toBe(false);
  });
});

describe("meldingen", () => {
  it("leest groottes zoals in België", () => {
    expect(leesbareGrootte(MAX_GROOTTE)).toBe("50 MB");
    expect(leesbareGrootte(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(leesbareGrootte(2048)).toBe("2 kB");
    expect(leesbareGrootte(10)).toBe("1 kB");
  });

  it("vertaalt de fouten van Storage", () => {
    expect(vertaalOpslagfout(413, "")).toContain("te groot");
    expect(vertaalOpslagfout(400, '{"error":"invalid_mime_type"}')).toContain("niet aanvaard");
    expect(vertaalOpslagfout(400, '{"message":"jwt expired"}')).toContain("verlopen");
    expect(vertaalOpslagfout(0, "")).toContain("Geen verbinding");
    expect(vertaalOpslagfout(500, "")).toContain("HTTP 500");
  });
});
