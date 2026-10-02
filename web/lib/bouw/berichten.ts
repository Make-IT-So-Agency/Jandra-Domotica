import { dagMetWeekdag, dagenTekst, korteDatum, plusDagen } from "./kalender";
import type { Weekregel } from "./planning";

/**
 * Wat de bot van Bouw zegt: de weekplanning, de deadlines en de herinneringen
 * van de dagelijkse ronde. Puur, zodat elke tekst te testen valt; versturen
 * gebeurt in ronde.ts en bot.ts.
 *
 * Gewone tekst, zonder opmaak: dan kan een titel met een * of _ niets breken.
 */

const WEEKSOORTEN: Record<Weekregel["soort"], string> = {
  loopt: "loopt nog:",
  begint: "begint:",
  eindigt: "eindigt:",
  mijlpaal: "◆",
  deadline: "beslissen:",
};

export function weekbericht(week: { van: string; tot: string; regels: Weekregel[] }): string {
  const kop = `Deze en volgende week (${korteDatum(week.van, week.tot)} – ${korteDatum(week.tot, week.tot)})`;
  if (week.regels.length === 0) return `${kop}: niets gepland.`;
  return [
    `${kop}:`,
    ...week.regels.map((regel) => `• ${dagMetWeekdag(regel.datum)} · ${WEEKSOORTEN[regel.soort]} ${regel.tekst}`),
  ].join("\n");
}

export interface Openstaand {
  keuzeId: number;
  titel: string;
  datum: string;
  dagen: number;
}

export function deadlinebericht(deadlines: Openstaand[], vandaag: string, max = 10): string {
  if (deadlines.length === 0) return "Geen keuzes met een deadline die nog open staan.";
  const regels = deadlines
    .slice(0, max)
    .map((d) => `• ${d.titel}: ${d.dagen < 0 ? `⚠️ ${dagenTekst(d.dagen)}` : dagenTekst(d.dagen)} (${korteDatum(d.datum, vandaag)})`);
  if (deadlines.length > max) regels.push(`… en nog ${deadlines.length - max}.`);
  return ["Te beslissen:", ...regels].join("\n");
}

export interface Tebetalen {
  factuurId: number;
  /** "factuur 2026-031 van Architect (€ 2.420,00)" */
  wat: string;
  vervaldag: string;
  dagen: number;
}

export function factuurbericht(facturen: Tebetalen[], vandaag: string, max = 10): string {
  if (facturen.length === 0) return "Geen facturen die nog betaald moeten worden.";
  const regels = facturen.slice(0, max).map((f) => {
    const wanneer = f.dagen < 0 ? `⚠️ ${dagenTekst(f.dagen)}` : dagenTekst(f.dagen);
    return `• ${f.wat.charAt(0).toLocaleUpperCase("nl-BE")}${f.wat.slice(1)}: ${wanneer} (${korteDatum(f.vervaldag, vandaag)})`;
  });
  if (facturen.length > max) regels.push(`… en nog ${facturen.length - max}.`);
  return ["Te betalen:", ...regels].join("\n");
}

export interface Herinnering {
  /** Uniek per melding: zo vertrekt ze maar één keer. */
  sleutel: string;
  tekst: string;
  /** Het scherm in de webapp, als pad. */
  pad: string;
}

/** Zoveel dagen vóór een deadline herinnert de bot, en één keer de dag erna. */
export const HERINNEREN_OP = [14, 7, 3, 1, 0, -1];

interface Planningsregel {
  id: number;
  soort: "fase" | "taak" | "mijlpaal";
  titel: string;
  begindatum: string;
  status: "gepland" | "bezig" | "klaar";
  partij: string | null;
}

/**
 * Wat de dagelijkse ronde vandaag meldt:
 * - een deadline die binnen 14, 7, 3 of 1 dag valt, vandaag, of gisteren was;
 * - wat morgen begint, en een mijlpaal van vandaag;
 * - op maandag de week, als er iets gepland is.
 *
 * De sleutel bevat de datum waarover het gaat: schuift een taak op, dan komt
 * er voor de nieuwe datum een nieuwe herinnering.
 */
export function herinneringen(
  deadlines: Openstaand[],
  planning: Planningsregel[],
  week: { van: string; tot: string; regels: Weekregel[] },
  vandaag: string,
): Herinnering[] {
  const uit: Herinnering[] = [];

  if (week.van === vandaag && week.regels.length > 0) {
    uit.push({ sleutel: `week:${week.van}`, tekst: `📅 ${weekbericht(week)}`, pad: "/bouw/planning" });
  }

  for (const deadline of deadlines) {
    if (!HERINNEREN_OP.includes(deadline.dagen)) continue;
    const tegen = korteDatum(deadline.datum, vandaag);
    const tekst =
      deadline.dagen === -1
        ? `⚠️ De deadline voor ${deadline.titel} was gisteren (${tegen}). Nog niet beslist.`
        : deadline.dagen === 0
          ? `⏰ ${deadline.titel}: vandaag beslissen.`
          : `⏰ ${deadline.titel}: beslissen ${dagenTekst(deadline.dagen)} (tegen ${tegen}).`;
    uit.push({
      sleutel: `deadline:${deadline.keuzeId}:${deadline.datum}:${deadline.dagen}`,
      tekst,
      pad: `/bouw/keuzes/${deadline.keuzeId}`,
    });
  }

  const morgen = plusDagen(vandaag, 1);
  for (const item of planning) {
    if (item.status === "klaar") continue;
    if (item.soort === "mijlpaal" && item.begindatum === vandaag) {
      uit.push({ sleutel: `mijlpaal:${item.id}:${item.begindatum}`, tekst: `◆ Vandaag: ${item.titel}.`, pad: "/bouw/planning" });
    } else if (item.soort !== "mijlpaal" && item.begindatum === morgen) {
      uit.push({
        sleutel: `begint:${item.id}:${item.begindatum}`,
        tekst: `🏗️ Morgen begint ${item.soort === "fase" ? "de fase " : ""}${item.titel}${item.partij ? ` (${item.partij})` : ""}.`,
        pad: `/bouw/planning?item=${item.id}#wijzigen`,
      });
    }
  }

  return uit;
}

export const HULP = [
  "/week: wat er deze en volgende week gebeurt",
  "/deadlines: welke keuzes nog open staan, en tegen wanneer",
  "/facturen: welke facturen nog betaald moeten worden",
  "/taken: wat er in de app nog te doen is",
  "/hier: stuur mijn herinneringen voortaan naar deze chat",
  "/id: je Telegram-id",
].join("\n");
