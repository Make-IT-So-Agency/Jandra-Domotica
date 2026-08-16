#!/usr/bin/env node
/**
 * Past de migraties uit infra/migrations toe op de databank.
 *
 *   DATABASE_URL=... node scripts/migreer.mjs
 *   DATABASE_URL=... node scripts/migreer.mjs --droogloop
 *   DATABASE_URL=... node scripts/migreer.mjs --markeer-als-toegepast
 *
 * Houdt in de tabel schema_migraties bij wat al gedraaid heeft, samen met een
 * vingerafdruk van het bestand. Wijzigt een reeds toegepaste migratie achteraf,
 * dan stopt het script: dat betekent dat de databank iets anders bevat dan wat
 * de repository beweert, en dat wil je weten in plaats van stilzwijgend
 * overslaan.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { databankAdres, verbind } from "./lib/postgres.mjs";

const MAP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "infra", "migrations");
const BESTANDSNAAM = /^\d{4}_[a-z0-9-]+\.sql$/;

const vlaggen = new Set(process.argv.slice(2));
const droogloop = vlaggen.has("--droogloop") || vlaggen.has("--dry-run");
const markeren = vlaggen.has("--markeer-als-toegepast");

function vingerafdruk(inhoud) {
  // Regeleindes normaliseren: anders verschilt de vingerafdruk tussen
  // besturingssystemen zonder dat er inhoudelijk iets veranderd is.
  return createHash("sha256").update(inhoud.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

function leesMigraties() {
  const bestanden = readdirSync(MAP).filter((naam) => naam.endsWith(".sql")).sort();

  const ongeldig = bestanden.filter((naam) => !BESTANDSNAAM.test(naam));
  if (ongeldig.length > 0) {
    console.error(`Ongeldige bestandsnaam: ${ongeldig.join(", ")}`);
    console.error("Verwacht wordt bijvoorbeeld 0002_extra-kolom.sql");
    process.exit(2);
  }

  return bestanden.map((naam) => {
    const inhoud = readFileSync(join(MAP, naam), "utf8");
    return { naam, inhoud, vingerafdruk: vingerafdruk(inhoud) };
  });
}

const client = await verbind(databankAdres());

try {
  await client.query(`
    create table if not exists schema_migraties (
      versie        text primary key,
      vingerafdruk  text not null,
      toegepast_op  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select versie, vingerafdruk from schema_migraties");
  const toegepast = new Map(rows.map((rij) => [rij.versie, rij.vingerafdruk]));

  const migraties = leesMigraties();
  const afwijkend = migraties.filter(
    (m) => toegepast.has(m.naam) && toegepast.get(m.naam) !== m.vingerafdruk,
  );

  if (afwijkend.length > 0) {
    console.error("Deze migraties zijn na het toepassen nog gewijzigd:");
    for (const m of afwijkend) console.error(`  ${m.naam}`);
    console.error(
      "\nDe databank bevat dus iets anders dan de repository beweert. Zet de\n" +
        "wijziging in een nieuwe migratie in plaats van een bestaande aan te passen.",
    );
    process.exit(1);
  }

  // Toegepast, maar het bestand staat er niet meer. Ook een vorm van afwijking,
  // al is die niet erg genoeg om op te stoppen: de databank heeft de wijziging
  // nog, de repository vertelt alleen niet meer wat ze was.
  const inRepo = new Set(migraties.map((m) => m.naam));
  const verdwenen = [...toegepast.keys()].filter((naam) => !inRepo.has(naam));
  if (verdwenen.length > 0) {
    console.warn("Let op: toegepast, maar niet meer in de repository:");
    for (const naam of verdwenen) console.warn(`  ${naam}`);
  }

  const openstaand = migraties.filter((m) => !toegepast.has(m.naam));

  if (openstaand.length === 0) {
    console.log(`Niets te doen: ${migraties.length} migratie(s), allemaal toegepast.`);
    process.exit(0);
  }

  if (droogloop) {
    console.log(`Nog toe te passen (${openstaand.length}):`);
    for (const m of openstaand) console.log(`  ${m.naam}`);
    process.exit(0);
  }

  for (const migratie of openstaand) {
    process.stdout.write(`  ${migratie.naam} … `);

    if (markeren) {
      await client.query(
        "insert into schema_migraties (versie, vingerafdruk) values ($1, $2)",
        [migratie.naam, migratie.vingerafdruk],
      );
      console.log("gemarkeerd als toegepast (niet uitgevoerd)");
      continue;
    }

    // Alles of niets: loopt de migratie halverwege vast, dan blijft de
    // databank achter zoals ze was.
    try {
      await client.query("begin");
      await client.query(migratie.inhoud);
      await client.query(
        "insert into schema_migraties (versie, vingerafdruk) values ($1, $2)",
        [migratie.naam, migratie.vingerafdruk],
      );
      await client.query("commit");
      console.log("toegepast");
    } catch (fout) {
      await client.query("rollback").catch(() => {});
      console.log("mislukt");
      console.error(`    ${fout.message}`);
      process.exit(1);
    }
  }

  console.log(`Klaar: ${openstaand.length} migratie(s) ${markeren ? "gemarkeerd" : "toegepast"}.`);
} finally {
  await client.end().catch(() => {});
}
