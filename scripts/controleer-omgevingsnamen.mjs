#!/usr/bin/env node
/**
 * Bewaakt dat de geheimen uit infra/vercel-omgeving.json ook echt doorgegeven
 * worden in de uitrolworkflow.
 *
 *   node scripts/controleer-omgevingsnamen.mjs
 *
 * Het script zet-vercel-omgeving.mjs leest een geheim per naam uit zijn eigen
 * omgeving. Staat die naam niet in het env-blok van de stap "Vercel-project
 * gelijkzetten", dan is hij daar simpelweg leeg, en meldt het script keurig
 * "overgeslagen, geen waarde beschikbaar" -- zonder te falen. De uitrol wordt
 * dus groen terwijl de variabele nooit bij de app geraakt.
 *
 * Dat is precies wat er misging met RESEND_API_KEY: wel in het manifest, niet
 * in de workflow. Je merkt zoiets pas als de functie die erop steunt stil
 * blijft, en dan zoek je op de verkeerde plek.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(WORTEL, "infra/vercel-omgeving.json");
const WORKFLOW = join(WORTEL, ".github/workflows/productie-uitrollen.yml");
const STAPNAAM = "Vercel-project gelijkzetten";

/** De namen die het script uit zijn omgeving verwacht te kunnen lezen. */
function geheimenUitManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  return manifest.variabelen
    .filter((variabele) => variabele.herkomst === "geheim")
    .map((variabele) => variabele.naam);
}

/**
 * De namen die het env-blok van die ene stap doorgeeft.
 *
 * Bewust geen YAML-ontleder erbij gehaald: dit is één blok met één vorm, en
 * een afhankelijkheid voor twintig regels tekst is het niet waard. Verandert
 * de vorm van de workflow, dan vindt dit niets meer en valt dat meteen op
 * doordat álles ontbrekend lijkt.
 */
function doorgegevenInWorkflow() {
  const regels = readFileSync(WORKFLOW, "utf8").split("\n");
  const begin = regels.findIndex((regel) => regel.includes(`- name: ${STAPNAAM}`));
  if (begin === -1) {
    console.error(`De stap "${STAPNAAM}" staat niet meer in ${WORKFLOW}.`);
    process.exit(1);
  }

  // Tot aan de volgende stap op hetzelfde niveau.
  let eind = regels.length;
  for (let i = begin + 1; i < regels.length; i += 1) {
    if (/^\s{6}- name:/.test(regels[i])) {
      eind = i;
      break;
    }
  }

  const doorgegeven = new Map();
  for (const regel of regels.slice(begin, eind)) {
    const treffer = regel.match(
      /^\s+([A-Z_][A-Z0-9_]*):\s*\$\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}\s*$/,
    );
    if (treffer) doorgegeven.set(treffer[1], treffer[2]);
  }
  return doorgegeven;
}

const verwacht = geheimenUitManifest();
const doorgegeven = doorgegevenInWorkflow();
const fouten = [];

console.log(`Geheimen uit het manifest die de uitrol moet doorgeven (${verwacht.length}):`);
for (const naam of verwacht) {
  const bron = doorgegeven.get(naam);
  if (!bron) {
    fouten.push(
      `${naam} staat in het manifest maar niet in het env-blok van "${STAPNAAM}". ` +
        `Voeg toe: ${naam}: \${{ secrets.${naam} }}`,
    );
    console.log(`  ONTBREEKT: ${naam}`);
  } else if (bron !== naam) {
    // VOORBEELD: ${{ secrets.ANDERE_NAAM }} -- de app leest dan iets anders
    // dan wat er bedoeld was, en niemand ziet het.
    fouten.push(`${naam} wordt gevuld met secrets.${bron} in plaats van secrets.${naam}.`);
    console.log(`  VERKEERDE BRON: ${naam} <- secrets.${bron}`);
  } else {
    console.log(`  in orde: ${naam}`);
  }
}

// Andersom: iets doorgeven dat nergens gebruikt wordt is niet gevaarlijk, maar
// het is wel een spoor dat iemand straks volgt.
const overbodig = [...doorgegeven.keys()].filter(
  (naam) => !verwacht.includes(naam) && !naam.startsWith("VERCEL_"),
);
if (overbodig.length > 0) {
  console.log(`\nLet op: doorgegeven maar niet in het manifest: ${overbodig.join(", ")}`);
}

if (fouten.length > 0) {
  console.error("\nDe uitrol zou deze variabelen stilzwijgend overslaan:");
  for (const fout of fouten) console.error(`  - ${fout}`);
  process.exit(1);
}

console.log("\nAlles wat het manifest verwacht, wordt ook doorgegeven.");
