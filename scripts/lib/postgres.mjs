/**
 * Gedeelde databankhulp voor de scripts in deze map.
 *
 * De Postgres-bibliotheek wordt bij de eerste keer zelf opgehaald naar een
 * tijdelijke map. Zo hoeft er niets vooraf geïnstalleerd te zijn en blijven de
 * afhankelijkheden van de webapp ongemoeid.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

let bibliotheek = null;

export function laadPostgres() {
  if (bibliotheek) return bibliotheek;

  const require = createRequire(import.meta.url);
  try {
    bibliotheek = require("pg");
    return bibliotheek;
  } catch {
    // Niet aanwezig: eenmalig ophalen naar een eigen mapje buiten het project.
  }

  const map = join(tmpdir(), "laadkosten-hulpmiddelen");
  mkdirSync(map, { recursive: true });
  writeFileSync(
    join(map, "package.json"),
    JSON.stringify({ name: "laadkosten-hulpmiddelen", private: true, version: "1.0.0" }),
  );

  const eigenRequire = createRequire(join(map, "package.json"));
  try {
    bibliotheek = eigenRequire("pg");
  } catch {
    console.log("  De Postgres-bibliotheek ophalen (eenmalig) …");
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error", "pg"], {
      cwd: map,
      stdio: "inherit",
    });
    bibliotheek = eigenRequire("pg");
  }
  return bibliotheek;
}

/**
 * Supabase vereist een versleutelde verbinding, een databank op je eigen
 * machine meestal net niet. Daarom kijken we naar het adres.
 */
export function sslInstelling(url) {
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

export async function verbind(url) {
  const pg = laadPostgres();
  const client = new pg.Client({
    connectionString: url,
    ssl: sslInstelling(url),
    connectionTimeoutMillis: 30000,
  });

  try {
    await client.connect();
  } catch (fout) {
    console.error(`  Verbinden met de databank mislukt: ${fout.message}`);
    console.error(
      "  Controleer het databankwachtwoord. Staan er tekens als @ of # in,\n" +
        "  dan moeten die in de connectiestring gecodeerd zijn (%40, %23).",
    );
    process.exit(1);
  }
  return client;
}

/** Leest de connectiestring uit de omgeving en stopt met uitleg als hij ontbreekt. */
export function databankAdres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ontbreekt.");
    console.error(
      "Zet die op de connectiestring van je Supabase-databank, te vinden onder\n" +
        "Project Settings → Database → Connection string → URI.",
    );
    process.exit(2);
  }
  return url;
}
