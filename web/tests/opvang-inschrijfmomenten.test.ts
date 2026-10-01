import { describe, expect, it } from "vitest";

import {
  alleMomenten,
  berekendeMomenten,
  momentLabel,
  opvangLabel,
  volgendeMomenten,
} from "@/lib/opvang/inschrijfmomenten";

describe("inschrijfmomenten BKO", () => {
  it("rekent de openingsuren om naar UTC, zomer- en wintertijd", () => {
    const dec = alleMomenten().find((m) => m.opvang === "2026-12" && m.ronde === "inwoners")!;
    expect(dec.opent.toISOString()).toBe("2026-10-06T16:00:00.000Z"); // 18:00 zomertijd
    const jan = alleMomenten().find((m) => m.opvang === "2027-01" && m.ronde === "inwoners")!;
    expect(jan.opent.toISOString()).toBe("2026-11-03T17:00:00.000Z"); // 18:00 wintertijd
    const niet = alleMomenten().find((m) => m.opvang === "2027-01" && m.ronde === "niet_inwoners")!;
    expect(niet.opent.toISOString()).toBe("2026-11-05T08:00:00.000Z"); // 09:00
  });

  it("valt altijd op een dinsdag (inwoners, tweede ronde) of donderdag", () => {
    for (const m of alleMomenten()) {
      const dag = new Date(m.opent.getTime() + 3 * 3_600_000).getUTCDay();
      expect(dag, `${m.opvang} ${m.ronde}`).toBe(m.ronde === "niet_inwoners" ? 4 : 2);
    }
  });

  it("de regel geeft exact de officiële tabel voor alle gewone maanden", () => {
    const tabel = alleMomenten().filter((m) => !m.opvang.startsWith("zomer"));
    for (const m of tabel) {
      const [jaar, maand] = m.opvang.split("-").map(Number);
      const verwacht = berekendeMomenten(jaar, maand)[m.ronde];
      const datum = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(m.opent);
      expect(datum, `${m.opvang} ${m.ronde}`).toBe(verwacht);
    }
  });

  it("vindt de eerstvolgende opening voor inwoners", () => {
    const [volgende] = volgendeMomenten("inwoners", new Date("2026-09-28T12:00:00Z"));
    expect(volgende.opvang).toBe("2026-12");
    expect(volgende.bron).toBe("tabel");
    expect(momentLabel(volgende.opent)).toContain("18:00");
  });

  it("rekent voorbij de tabel verder met de regel, en zegt dat erbij", () => {
    const [na] = volgendeMomenten("inwoners", new Date("2027-04-28T00:00:00Z"));
    expect(na).toMatchObject({ opvang: "2027-09", bron: "berekend" });
    // Eerste dinsdag van juli 2027 is 6 juli.
    expect(na.opent.toISOString()).toBe("2027-07-06T16:00:00.000Z");
  });

  it("geeft leesbare namen", () => {
    expect(opvangLabel("2026-12")).toBe("december 2026");
    expect(opvangLabel("zomer-2027")).toBe("zomervakantie 2027");
  });
});
