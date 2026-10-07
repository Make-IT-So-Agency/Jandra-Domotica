/**
 * Het startsein van de workflow "Opvang - inschrijven": moet deze run iets
 * doen, en wat?
 *
 * Op het uur van een geplande workflow kan je bij GitHub niet rekenen: in
 * oktober 2026 vertrok hij elke dag 3 tot 7 uur te laat. De runs voor de
 * opening van dinsdag 6 oktober, 18:00, startten om 21:22, 22:09 en 22:31,
 * en schreven niets in. Daarom:
 *
 * - De workflow start om de vier uur. Opent er binnen 30 uur een ronde, dan
 *   begint de run een estafette: hij wacht, en start na hoogstens 5 uur zelf
 *   een nieuwe run (GitHub stopt een job na 6 uur). Een run die zo gestart
 *   wordt, vertrekt meteen, niet uren later.
 * - De run die 2 uur of minder vóór de opening vertrekt, schrijft zelf in.
 * - Is de opening al voorbij, maar minder dan 24 uur, dan schrijft de run
 *   meteen in, en zegt in Telegram dat hij te laat is. Later dan dat enkel
 *   met de hand (modus inhalen): wie een dag niets hoorde, heeft misschien
 *   intussen zelf ingeschreven, of iets anders geregeld.
 *
 *   node src/startsein.ts             beslissen, en bij een estafette wachten
 *   node src/startsein.ts --mislukt   in Telegram melden dat de run misliep
 *                                     vóór hij kon inschrijven of doorgeven
 *
 * Het besluit gaat als besluit=niets|estafette|inschrijven naar
 * $GITHUB_OUTPUT. Geen browser en geen afhankelijkheden: dit loopt vóór de
 * installatie van Playwright, ook als die hapert.
 */

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { lopendeRondes, type Ronde } from "./rondes.ts";
import { leesChat, stuur } from "./telegram.ts";
import { duur, momentLabel } from "./weergave.ts";

const UUR = 3_600_000;

export const WACHTEN = {
  /** Opent de ronde binnen deze tijd, dan schrijft deze run zelf in. */
  zelfMs: 2 * UUR,
  /** Zo lang wacht één run hoogstens vóór hij een nieuwe start. */
  beurtMs: 5 * UUR,
  /** Zo ver vooruit begint een geplande run aan de estafette. */
  vooruitMs: 30 * UUR,
  /** Zo lang na de opening schrijft een te late run nog vanzelf in. */
  inhalenMs: 24 * UUR,
};

export type Besluit =
  | { soort: "niets"; reden: string }
  | { soort: "estafette"; ronde: Ronde; wachtMs: number }
  | { soort: "inschrijven"; ronde: Ronde; laatMs: number };

/**
 * Wat een run met de lopende rondes (open, definitief, bezig) doet. Met
 * `inhalen`: de laatste ronde waarvan de opening voorbij is en die definitief
 * is (of bleef hangen), hoe lang ook geleden. Nooit een ronde die nog open
 * staat: wat niet definitief is, wordt niet ingeschreven.
 */
export function besluit(rondes: Ronde[], nu: number, inhalen = false): Besluit {
  const opent = (r: Ronde) => Date.parse(r.opent);
  if (inhalen) {
    const [r] = rondes
      .filter((r) => opent(r) <= nu && (r.status === "definitief" || r.status === "bezig"))
      .sort((a, b) => opent(b) - opent(a));
    return r
      ? { soort: "inschrijven", ronde: r, laatMs: nu - opent(r) }
      : { soort: "niets", reden: "Geen definitieve keuze waarvan de opening voorbij is." };
  }
  const [r] = rondes.filter((r) => nu - opent(r) < WACHTEN.inhalenMs).sort((a, b) => opent(a) - opent(b));
  if (!r) return { soort: "niets", reden: "Geen inschrijving vandaag." };
  const tot = opent(r) - nu;
  if (tot > WACHTEN.vooruitMs) return { soort: "niets", reden: `De volgende opening (${r.maand}) is pas over ${duur(tot)}.` };
  if (tot > WACHTEN.zelfMs) return { soort: "estafette", ronde: r, wachtMs: Math.min(tot - WACHTEN.zelfMs, WACHTEN.beurtMs) };
  return { soort: "inschrijven", ronde: r, laatMs: Math.max(0, -tot) };
}

function uitvoer(naam: string, waarde: string): void {
  const bestand = process.env.GITHUB_OUTPUT;
  if (bestand) appendFileSync(bestand, `${naam}=${waarde}\n`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--mislukt")) return meldMislukt();
  const nu = Date.now();
  const b = besluit(await lopendeRondes(), nu);
  uitvoer("besluit", b.soort);
  if (b.soort === "niets") {
    console.log(b.reden);
    return;
  }
  const tot = Date.parse(b.ronde.opent) - nu;
  if (b.soort === "inschrijven") {
    console.log(`Ronde ${b.ronde.maand} ${tot >= 0 ? `opent over ${duur(tot)}` : `opende ${duur(tot)} geleden`}: deze run schrijft in.`);
    return;
  }
  console.log(`Ronde ${b.ronde.maand} opent over ${duur(tot)}. Ik wacht ${duur(b.wachtMs)} en start dan een nieuwe run.`);
  await new Promise((ok) => setTimeout(ok, b.wachtMs));
}

/**
 * De run liep mis vóór het inschrijven begon (npm, Playwright) of vóór hij
 * kon doorgeven aan een nieuwe run. Zonder dit bericht hoort niemand het
 * vóór de opening. Enkel als er een ronde in de buurt is.
 */
async function meldMislukt(): Promise<void> {
  const b = besluit(await lopendeRondes(), Date.now());
  const chat = await leesChat();
  if (b.soort === "niets" || !chat) return;
  const opent = Date.parse(b.ronde.opent);
  // Een run die nu start, wacht en geeft door; pas in de laatste 2 uur schrijft hij zelf in.
  const wanneer = b.soort === "estafette" ? `vanaf ${momentLabel(opent - WACHTEN.zelfMs)}` : "nu";
  await stuur(
    chat,
    [
      `⚠️ De taak die opvang ${b.ronde.maand} inschrijft (opening ${momentLabel(opent)}), liep vast in GitHub.`,
      `Een volgende geplande run probeert het opnieuw, maar wacht daar niet op: start ze ${wanneer} zelf via Actions → Opvang - inschrijven → Run workflow, modus normaal.`,
      `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    ].join("\n"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main().catch((fout) => {
    console.log(`Gestopt: ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
    process.exitCode = 1;
  });
}
