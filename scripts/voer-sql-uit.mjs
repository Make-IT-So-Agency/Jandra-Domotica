#!/usr/bin/env node
/**
 * Voert een of meer SQL-bestanden uit tegen een Postgres-databank.
 *
 * Gebruikt door installeer.sh, zodat je het schema niet met de hand in de
 * SQL-editor van Supabase hoeft te plakken:
 *
 *   node scripts/voer-sql-uit.mjs "<connectiestring>" bestand.sql [...]
 *
 * De Postgres-bibliotheek wordt bij de eerste keer zelf opgehaald naar een
 * tijdelijke map; je hoeft dus niets vooraf te installeren.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [connectiestring, ...bestanden] = process.argv.slice(2);

if (!connectiestring || bestanden.length === 0) {
  console.error("Gebruik: voer-sql-uit.mjs <connectiestring> <bestand.sql> [...]");
  process.exit(2);
}

/** Laadt 'pg', en installeert het eerst als het er nog niet is. */
function laadPostgresBibliotheek() {
  const require = createRequire(import.meta.url);
  try {
    return require("pg");
  } catch {
    // Niet aanwezig: eenmalig ophalen naar een eigen mapje buiten het project,
    // zodat we niets aan de afhankelijkheden van de app veranderen.
  }

  const map = join(tmpdir(), "laadkosten-hulpmiddelen");
  mkdirSync(map, { recursive: true });
  writeFileSync(
    join(map, "package.json"),
    JSON.stringify({ name: "laadkosten-hulpmiddelen", private: true, version: "1.0.0" }),
  );

  const eigenRequire = createRequire(join(map, "package.json"));
  try {
    return eigenRequire("pg");
  } catch {
    console.log("  De Postgres-bibliotheek ophalen (eenmalig) …");
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error", "pg"], {
      cwd: map,
      stdio: "inherit",
    });
    return eigenRequire("pg");
  }
}

/**
 * Supabase vereist een versleutelde verbinding, een databank op je eigen
 * machine meestal net niet. Daarom kijken we naar het adres.
 */
function sslInstelling(url) {
  try {
    const ontleed = new URL(url);
    const lokaal = ["localhost", "127.0.0.1", "::1", ""].includes(ontleed.hostname);
    if (lokaal || ontleed.searchParams.get("sslmode") === "disable") return false;
  } catch {
    // Geen geldige URL: dan gaan we uit van een externe databank.
  }
  // Supabase gebruikt een certificaat van een eigen tussenpersoon. De
  // verbinding blijft versleuteld, maar we controleren de keten niet.
  return { rejectUnauthorized: false };
}

let pg;
try {
  pg = laadPostgresBibliotheek();
} catch (fout) {
  console.error(`De Postgres-bibliotheek kon niet geladen worden: ${fout.message}`);
  process.exit(2);
}

const client = new pg.Client({
  connectionString: connectiestring,
  ssl: sslInstelling(connectiestring),
  connectionTimeoutMillis: 30000,
});

try {
  await client.connect();
} catch (fout) {
  console.error(`  Verbinden met de databank mislukt: ${fout.message}`);
  console.error(
    "  Controleer of het databankwachtwoord klopt. Staan er tekens als @ of #\n" +
      "  in je wachtwoord, dan moeten die in de connectiestring gecodeerd zijn.",
  );
  process.exit(1);
}

let mislukt = false;

for (const bestand of bestanden) {
  process.stdout.write(`  ${bestand} … `);
  try {
    // Eén grote opdracht met meerdere statements: dat werkt via het eenvoudige
    // queryprotocol, precies zoals plakken in de SQL-editor.
    await client.query(readFileSync(bestand, "utf8"));
    console.log("klaar");
  } catch (fout) {
    console.log("mislukt");
    console.error(`    ${fout.message}`);
    mislukt = true;
  }
}

await client.end();
process.exit(mislukt ? 1 : 0);
