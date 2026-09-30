import { describe, expect, it } from "vitest";

import { conflicten, keuzemenu, overzicht, slotsVanWeek, weken, type Slot } from "@/lib/opvang/keuzemenu";
import { dagenTot } from "@/lib/opvang/menu";

let id = 0;
const slot = (datum: string, moment: string, staat = "nog_niet_open", locatie = "BKO - Speelhuis"): Slot => ({
  id: ++id,
  datum,
  moment,
  locatie,
  staat,
});

const schoolweek = [
  slot("2026-12-01", "Voorschoolse opvang (verwerking)"),
  slot("2026-12-01", "Naschoolse opvang (verwerking)"),
  slot("2026-12-02", "Voorschoolse opvang (verwerking)"),
  slot("2026-12-02", "Woensdagmiddag opvang (verwerking)"),
  slot("2026-12-08", "Voorschoolse opvang (verwerking)"),
  slot("2026-12-08", "Feestdag: opvang gesloten", "gesloten"),
];
const vakantie = [
  slot("2026-12-22", "Kerstvakantie Voormiddag", "nog_niet_open", "BKO - Speelhuis"),
  slot("2026-12-22", "Kerstvakantie Namiddag", "nog_niet_open", "BKO - Speelhuis"),
  slot("2026-12-22", "Kerstvakantie Voormiddag", "nog_niet_open", "BKO - Robbedoes"),
];

const basis = {
  rondeId: 7,
  kindId: 3,
  kindNaam: "Kind",
  maand: "2026-12",
  opent: new Date("2026-10-06T16:00:00Z"),
  status: "open" as const,
  gekozen: new Set<number>(),
  week: 0,
};

describe("keuzemenu", () => {
  it("groepeert per week, zonder gesloten tegels", () => {
    expect(weken(schoolweek)).toEqual([["2026-12-01", "2026-12-02"], ["2026-12-08"]]);
  });

  it("één rij per dag, een knop per moment, en enkel tegels uit de kalender", () => {
    const { knoppen } = keuzemenu({ ...basis, slots: schoolweek, gekozen: new Set([schoolweek[0].id]) });
    expect(knoppen[0].map((k) => k.text)).toEqual(["di 1/12", "✅ voor", "▫️ na"]);
    expect(knoppen[0][1].callback_data).toBe(`o:t:7:3:${schoolweek[0].id}`);
    expect(knoppen[1].map((k) => k.text)).toEqual(["wo 2/12", "▫️ voor", "▫️ woe-nm"]);
    expect(knoppen.slice(0, -1).flat().some((k) => k.text.includes("🔒") || /Feestdag/.test(k.text))).toBe(false);
    expect(knoppen.at(-1)).toEqual([{ text: "🔒 Definitief maken", callback_data: "o:d:7" }]);
  });

  it("alle callback-data past in de 64 bytes van Telegram", () => {
    const { knoppen } = keuzemenu({ ...basis, rondeId: 999_999, kindId: 999_999, slots: [slot("2026-12-01", "Voorschoolse opvang")] });
    for (const k of knoppen.flat()) expect(new TextEncoder().encode(k.callback_data).length).toBeLessThanOrEqual(64);
  });

  it("in een vakantie met meer locaties: één rij per locatie", () => {
    const { knoppen } = keuzemenu({ ...basis, slots: vakantie });
    const rijen = knoppen.filter((r) => r[0].text.startsWith("di 22/12"));
    expect(rijen.map((r) => r[0].text)).toEqual(["di 22/12 Robbedoes", "di 22/12 Speelhuis"]);
    expect(rijen[1].map((k) => k.text)).toEqual(["di 22/12 Speelhuis", "▫️ vm", "▫️ nm"]);
  });

  it("volzet toont ⏸, ingeschreven kan niet meer aangeklikt worden", () => {
    const lijst = [slot("2026-12-03", "Naschoolse opvang", "volzet"), slot("2026-12-03", "Voorschoolse opvang", "ingeschreven")];
    const { knoppen } = keuzemenu({ ...basis, slots: lijst });
    expect(knoppen[0].map((k) => k.text)).toEqual(["do 3/12", "✔ voor", "▫️ na ⏸"]);
    expect(knoppen[0][1].callback_data).toBe("o:x");
  });

  it("na definitief: niets meer aan te klikken, enkel Wijzigen", () => {
    const { knoppen, tekst } = keuzemenu({ ...basis, status: "definitief", definitiefDoor: "Sandra", slots: schoolweek });
    expect(knoppen.flat().filter((k) => k.callback_data.startsWith("o:t:"))).toEqual([]);
    expect(knoppen.at(-1)).toEqual([{ text: "✏️ Wijzigen", callback_data: "o:e:7" }]);
    expect(tekst).toContain("definitief (door Sandra)");
  });

  it("'alles deze week' laat vakantiedagen met meer locaties weg", () => {
    const lijst = [...schoolweek, ...vakantie];
    const week = weken(lijst).findIndex((w) => w.includes("2026-12-22"));
    expect(slotsVanWeek(lijst, week, true)).toEqual([]);
    expect(slotsVanWeek(lijst, week).length).toBe(3);
    expect(slotsVanWeek(lijst, 0, true).map((s) => s.id)).toEqual(schoolweek.slice(0, 4).map((s) => s.id));
  });
});

describe("tegels die i-Active niet meer toont", () => {
  it("krijgen geen knop meer, en het overzicht waarschuwt als ze gekozen waren", () => {
    const weg = slot("2026-12-03", "Voorschoolse opvang", "weg");
    const { knoppen } = keuzemenu({ ...basis, slots: [weg, slot("2026-12-03", "Naschoolse opvang")] });
    expect(knoppen[0].map((k) => k.text)).toEqual(["do 3/12", "▫️ na"]);
    expect(overzicht([{ naam: "Kind", slots: [weg] }])).toContain("⚠️ niet meer in i-Active");
  });
});

describe("conflicten en overzicht", () => {
  it("twee keer hetzelfde moment op één dag, of een volle dag met een halve", () => {
    expect(conflicten([vakantie[0], vakantie[2]])).toEqual(["di 22/12: voormiddag op meer dan één plaats"]);
    expect(conflicten([slot("2026-12-23", "Kerstvakantie Volle dag"), slot("2026-12-23", "Kerstvakantie Namiddag")])).toEqual([
      "wo 23/12: volle dag én een halve dag",
    ]);
    expect(conflicten(schoolweek.slice(0, 4))).toEqual([]);
  });

  it("vast overzicht in datumvolgorde", () => {
    expect(overzicht([{ naam: "Kind", slots: [schoolweek[1], schoolweek[0]] }])).toBe(
      ["🧒 Kind: 2 momenten", "• di 1/12  voorschools (BKO - Speelhuis)", "• di 1/12  naschools (BKO - Speelhuis)"].join("\n"),
    );
  });
});

describe("dagen tot de opening", () => {
  it("telt kalenderdagen in Belgische tijd", () => {
    const opent = new Date("2026-10-06T16:00:00Z");
    expect(dagenTot(opent, new Date("2026-10-06T06:00:00Z"))).toBe(0);
    expect(dagenTot(opent, new Date("2026-10-05T22:30:00Z"))).toBe(0);
    expect(dagenTot(opent, new Date("2026-10-05T21:30:00Z"))).toBe(1);
    expect(dagenTot(opent, new Date("2026-09-29T08:00:00Z"))).toBe(7);
  });
});
