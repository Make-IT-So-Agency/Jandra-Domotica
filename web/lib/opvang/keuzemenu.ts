/**
 * Het keuzemenu in Telegram: per kind één bericht, met per week de dagen en
 * per dag een knop per opvangmoment. Zuiver: geen databank, geen Telegram,
 * zodat het getest kan worden.
 *
 * De knoppen tonen enkel tegels die i-Active zelf in de kalender zette. Wat
 * niet in de kalender staat, kan je niet aanduiden, en de bot schrijft later
 * exact in wat hier een vinkje heeft.
 */

import { momentLabel, opvangLabel } from "./inschrijfmomenten";
import type { Knoppen } from "./telegram";

export type RondeStatus = "open" | "definitief" | "bezig" | "klaar" | "gemist";

export interface Slot {
  id: number;
  datum: string;
  moment: string;
  locatie: string;
  staat: string;
}

export interface Menu {
  rondeId: number;
  kindId: number;
  kindNaam: string;
  maand: string;
  opent: Date;
  status: RondeStatus;
  slots: Slot[];
  gekozen: ReadonlySet<number>;
  week: number;
  definitiefDoor?: string | null;
  /** In vakanties met meerdere locaties: welke het menu toont. Leeg: de vaste locatie van het kind. */
  vakantieLocatie?: string | null;
}

/** De locaties van dagen waarop i-Active meer dan één locatie aanbiedt (vakanties). */
export function vakantieLocaties(slots: Slot[]): string[] {
  const perDag = new Map<string, Set<string>>();
  for (const s of slots.filter((s) => !VERBORGEN.includes(s.staat))) {
    perDag.set(s.datum, (perDag.get(s.datum) ?? new Set()).add(s.locatie));
  }
  const uit = new Set<string>();
  for (const locs of perDag.values()) if (locs.size > 1) locs.forEach((l) => uit.add(l));
  return [...uit].sort();
}

/**
 * De vakantielocatie die het menu toont: de gekozen, anders de locatie waar
 * het kind op schooldagen naartoe gaat (als die ook in de vakantie open is),
 * anders de eerste.
 */
export function welkeVakantieLocatie(slots: Slot[], gekozen?: string | null): string | null {
  const locs = vakantieLocaties(slots);
  if (!locs.length) return null;
  if (gekozen && locs.includes(gekozen)) return gekozen;
  const telling = new Map<string, number>();
  for (const s of slots) {
    if (VERBORGEN.includes(s.staat)) continue;
    if (new Set(slots.filter((t) => t.datum === s.datum).map((t) => t.locatie)).size === 1) {
      telling.set(s.locatie, (telling.get(s.locatie) ?? 0) + 1);
    }
  }
  const vast = [...telling].sort((a, b) => b[1] - a[1])[0]?.[0];
  return vast && locs.includes(vast) ? vast : locs[0];
}

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function dag(datum: string): Date {
  return new Date(`${datum}T00:00:00Z`);
}

export function dagLabel(datum: string): string {
  const d = dag(datum);
  return `${DAGEN[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** Kort, voor op een knop: "voor", "na", "woe", "vm", "nm". */
export function kortMoment(moment: string): string {
  if (/voorschool/i.test(moment)) return "voor";
  if (/naschool/i.test(moment)) return "na";
  if (/woensdag/i.test(moment)) return "woe-nm";
  if (/voormiddag/i.test(moment)) return "vm";
  if (/namiddag/i.test(moment)) return "nm";
  if (/volle dag|hele dag/i.test(moment)) return "dag";
  return moment.split(/\s+/)[0].toLowerCase().slice(0, 10);
}

/** Leesbaar, voor in een overzicht: "voorschools", "naschools", … */
export function langMoment(moment: string): string {
  const kort = kortMoment(moment);
  return (
    { voor: "voorschools", na: "naschools", "woe-nm": "woensdagnamiddag", vm: "voormiddag", nm: "namiddag", dag: "volle dag" }[kort] ??
    moment.toLowerCase()
  );
}

const VOLGORDE = ["voor", "vm", "dag", "woe-nm", "na", "nm"];

export function sorteer(slots: Slot[]): Slot[] {
  const rang = (s: Slot) => {
    const i = VOLGORDE.indexOf(kortMoment(s.moment));
    return i < 0 ? VOLGORDE.length : i;
  };
  return [...slots].sort(
    (a, b) => a.datum.localeCompare(b.datum) || rang(a) - rang(b) || a.locatie.localeCompare(b.locatie),
  );
}

/** De maandag van de week waarin een datum valt. */
function maandag(datum: string): string {
  const d = dag(datum);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** De weken met tegels, elk als de lijst van haar dagen met tegels. */
export function weken(slots: Slot[]): string[][] {
  const perWeek = new Map<string, Set<string>>();
  for (const s of sorteer(slots.filter((s) => !VERBORGEN.includes(s.staat)))) {
    const w = maandag(s.datum);
    if (!perWeek.has(w)) perWeek.set(w, new Set());
    perWeek.get(w)!.add(s.datum);
  }
  return [...perWeek.keys()].sort().map((w) => [...perWeek.get(w)!]);
}

const STATUS: Record<RondeStatus, string> = {
  open: "nog niet definitief",
  definitief: "✅ definitief",
  bezig: "⏳ de bot is aan het inschrijven",
  klaar: "✔ ingeschreven, zie het verslag",
  gemist: "⚠️ niet definitief gemaakt vóór de opening",
};

export function kortLocatie(locatie: string): string {
  return locatie.replace(/^BKO\s*-\s*/i, "").slice(0, 12);
}

function knopTekst(s: Slot, gekozen: boolean): string {
  const naam = kortMoment(s.moment);
  if (s.staat === "ingeschreven") return `✔ ${naam}`;
  if (s.staat === "reservelijst") return `⏸ ${naam}`;
  if (s.staat === "gesloten") return `🔒 ${naam}`;
  return `${gekozen ? "✅" : "▫️"} ${naam}${s.staat === "volzet" ? " ⏸" : ""}`;
}

/** Kan dit slot nog aan- of uitgevinkt worden? */
/** Geen knop: gesloten, of niet meer in de kalender van i-Active. */
const VERBORGEN = ["gesloten", "weg"];

export function aanklikbaar(s: Slot): boolean {
  return !["gesloten", "weg", "ingeschreven", "reservelijst"].includes(s.staat);
}

export function keuzemenu(m: Menu): { tekst: string; knoppen: Knoppen } {
  const alle = weken(m.slots);
  const week = Math.min(Math.max(m.week, 0), Math.max(alle.length - 1, 0));
  const dagen = alle[week] ?? [];
  const aantal = m.slots.filter((s) => m.gekozen.has(s.id)).length;
  const open = m.status === "open";

  const tekst = [
    `🧒 ${m.kindNaam} · opvang ${opvangLabel(m.maand)}`,
    `Inschrijving opent ${momentLabel(m.opent)}.`,
    "",
    alle.length
      ? `Week ${week + 1}/${alle.length}: ${dagLabel(dagen[0])} tot ${dagLabel(dagen[dagen.length - 1])}`
      : "Nog geen tegels in de kalender van i-Active.",
    `Gekozen deze maand: ${aantal}`,
    `Status: ${STATUS[m.status]}${m.status === "definitief" && m.definitiefDoor ? ` (door ${m.definitiefDoor})` : ""}`,
    "",
    open ? "✅ gekozen · ▫️ niet · ⏸ volzet: komt op de reservelijst" : "Druk op Wijzigen om nog iets aan te passen.",
    ...(open && vakantieLocaties(m.slots).length ? ["In de vakantie zijn er meerdere locaties: 📍 toont er één, tik erop om te wisselen."] : []),
  ].join("\n");

  const vakantie = welkeVakantieLocatie(m.slots, m.vakantieLocatie);
  const locaties = vakantieLocaties(m.slots);
  const weekHeeftVakantie = dagen.some((d) => new Set(m.slots.filter((s) => s.datum === d && !VERBORGEN.includes(s.staat)).map((s) => s.locatie)).size > 1);

  const knoppen: Knoppen = [];
  if (weekHeeftVakantie && vakantie) {
    knoppen.push([
      {
        text: `📍 ${kortLocatie(vakantie)}${locaties.length > 1 ? " · tik voor een andere locatie" : ""}`,
        callback_data: locaties.length > 1 ? `o:v:${m.rondeId}:${m.kindId}` : "o:x",
      },
    ]);
  }
  for (const d of dagen) {
    // Gesloten tegels (feestdagen, "opvang gesloten") krijgen geen knop.
    const vandaag = sorteer(m.slots.filter((s) => s.datum === d && !VERBORGEN.includes(s.staat)));
    let locaties = [...new Set(vandaag.map((s) => s.locatie))];
    if (locaties.length > 1 && vakantie && locaties.includes(vakantie)) {
      // Vakantie: enkel de getoonde locatie, plus een andere waar al iets gekozen is.
      locaties = locaties.filter((l) => l === vakantie || vandaag.some((s) => s.locatie === l && m.gekozen.has(s.id)));
    }
    for (const loc of locaties) {
      const label = locaties.length > 1 ? `${dagLabel(d)} ${kortLocatie(loc)}` : dagLabel(d);
      const rij = [{ text: label, callback_data: "o:x" }];
      for (const s of vandaag.filter((s) => s.locatie === loc)) {
        const kan = open && aanklikbaar(s);
        rij.push({
          text: knopTekst(s, m.gekozen.has(s.id)),
          callback_data: kan ? `o:t:${m.rondeId}:${m.kindId}:${s.id}` : "o:x",
        });
      }
      knoppen.push(rij.slice(0, 8));
    }
  }
  if (alle.length > 1) {
    knoppen.push([
      { text: week > 0 ? "◀ vorige" : "·", callback_data: week > 0 ? `o:w:${m.rondeId}:${m.kindId}:${week - 1}` : "o:x" },
      { text: `week ${week + 1}/${alle.length}`, callback_data: "o:x" },
      {
        text: week < alle.length - 1 ? "volgende ▶" : "·",
        callback_data: week < alle.length - 1 ? `o:w:${m.rondeId}:${m.kindId}:${week + 1}` : "o:x",
      },
    ]);
  }
  if (open) {
    knoppen.push([
      { text: "Alles deze week", callback_data: `o:a:${m.rondeId}:${m.kindId}:${week}` },
      { text: "Week leegmaken", callback_data: `o:l:${m.rondeId}:${m.kindId}:${week}` },
    ]);
    knoppen.push([{ text: "🔒 Definitief maken", callback_data: `o:d:${m.rondeId}` }]);
  } else if (m.status === "definitief") {
    knoppen.push([{ text: "✏️ Wijzigen", callback_data: `o:e:${m.rondeId}` }]);
  }
  return { tekst, knoppen };
}

/**
 * De slots van een week. Met `enkelEénLocatie` (de knop "Alles deze week")
 * vallen dagen met meer dan één locatie weg: in een vakantie moet je zelf
 * kiezen waar, anders zou het kind op vier plaatsen tegelijk staan.
 */
export function slotsVanWeek(slots: Slot[], week: number, enkelEénLocatie = false): Slot[] {
  const dagen = new Set(weken(slots)[week] ?? []);
  const lijst = slots.filter((s) => dagen.has(s.datum) && aanklikbaar(s) && !VERBORGEN.includes(s.staat));
  if (!enkelEénLocatie) return lijst;
  return lijst.filter((s) => new Set(lijst.filter((t) => t.datum === s.datum).map((t) => t.locatie)).size === 1);
}

/**
 * Keuzes die elkaar uitsluiten, voor één kind: twee keer hetzelfde moment op
 * één dag (op twee locaties), of een volle dag samen met een halve.
 */
export function conflicten(gekozen: Slot[]): string[] {
  const uit: string[] = [];
  const perDag = new Map<string, Slot[]>();
  for (const s of gekozen) perDag.set(s.datum, [...(perDag.get(s.datum) ?? []), s]);
  for (const [d, lijst] of perDag) {
    const soorten = lijst.map((s) => kortMoment(s.moment));
    const dubbel = soorten.filter((k, i) => soorten.indexOf(k) !== i);
    if (dubbel.length) uit.push(`${dagLabel(d)}: ${langMoment(lijst.find((s) => kortMoment(s.moment) === dubbel[0])!.moment)} op meer dan één plaats`);
    else if (soorten.includes("dag") && (soorten.includes("vm") || soorten.includes("nm"))) uit.push(`${dagLabel(d)}: volle dag én een halve dag`);
  }
  return uit;
}

/** Het vaste overzicht van wat definitief is, per kind, in datumvolgorde. */
export function overzicht(perKind: { naam: string; slots: Slot[] }[]): string {
  const regels: string[] = [];
  for (const k of perKind) {
    regels.push("", `🧒 ${k.naam}: ${k.slots.length} ${k.slots.length === 1 ? "moment" : "momenten"}`);
    for (const s of sorteer(k.slots)) {
      regels.push(`• ${dagLabel(s.datum)}  ${langMoment(s.moment)}${s.locatie ? ` (${s.locatie})` : ""}${s.staat === "volzet" ? "  ⏸ volzet" : ""}${s.staat === "weg" ? "  ⚠️ niet meer in i-Active" : ""}`);
    }
  }
  return regels.join("\n").trim();
}
