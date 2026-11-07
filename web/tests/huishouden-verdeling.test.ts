import { describe, expect, it } from "vitest";

import { magDoorgeven, magNieuweRonde, magUitlenen, naarDeAnder } from "@/lib/huishouden/verdeling";

const vast = { fase: "vastgelegd" as const };

describe("tijdelijk uitlenen", () => {
  it("kan de owner, bij een kaart via het spel of een vaste kaart", () => {
    expect(magUitlenen(vast, { eigenaar: "jan", regel: "R1" }, "jan")).toEqual({ ok: true });
    expect(magUitlenen(vast, { eigenaar: "sandra", regel: "vast" }, "sandra")).toEqual({ ok: true });
  });

  it("kan de ander niet", () => {
    expect(magUitlenen(vast, { eigenaar: "jan", regel: "R1" }, "sandra").ok).toBe(false);
  });

  it("kan niet bij eigen tijd, uitbesteed of samen", () => {
    expect(magUitlenen(vast, { eigenaar: "elk", regel: "elk" }, "jan").ok).toBe(false);
    expect(magUitlenen(vast, { eigenaar: "uitbesteed", regel: "R5" }, "jan").ok).toBe(false);
    expect(magUitlenen(vast, { eigenaar: "samen", regel: "samen" }, "jan").ok).toBe(false);
  });

  it("kan pas als de verdeling vastligt", () => {
    expect(magUitlenen({ fase: "voorstel" }, { eigenaar: "jan", regel: "R1" }, "jan").ok).toBe(false);
  });
});

describe("doorgeven", () => {
  it("kan de owner, enkel bij een vaste kaart", () => {
    expect(magDoorgeven(vast, { eigenaar: "sandra", regel: "vast" }, "sandra")).toEqual({ ok: true });
    expect(magDoorgeven(vast, { eigenaar: "sandra", regel: "R1" }, "sandra").ok).toBe(false);
    expect(magDoorgeven(vast, { eigenaar: "sandra", regel: "vast" }, "jan").ok).toBe(false);
    expect(magDoorgeven({ fase: "voorstel" }, { eigenaar: "sandra", regel: "vast" }, "sandra").ok).toBe(false);
  });

  it("gaat altijd naar de ander", () => {
    expect(naarDeAnder("sandra")).toBe("jan");
    expect(naarDeAnder("jan")).toBe("sandra");
  });
});

describe("een nieuwe ronde", () => {
  it("kan enkel als de verdeling vastligt", () => {
    expect(magNieuweRonde(vast)).toEqual({ ok: true });
    expect(magNieuweRonde({ fase: "voorstel" }).ok).toBe(false);
    expect(magNieuweRonde({ fase: "lijst" }).ok).toBe(false);
  });
});
