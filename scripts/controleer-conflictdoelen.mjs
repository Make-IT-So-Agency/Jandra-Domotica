#!/usr/bin/env node
/**
 * Controleert of elke upsert in de webapp een conflictdoel gebruikt waar de
 * databank ook echt een unieke index voor heeft.
 *
 *   node scripts/controleer-conflictdoelen.mjs <psql-host> [databank]
 *
 * Waarom dit bestaat: supabase-js vertaalt `{ onConflict: "a,b" }` naar
 * ON CONFLICT (a, b), en Postgres aanvaardt dat alleen als er een unieke index
 * op precies die kolommen staat. Een unieke index op een expressie — denk aan
 * lower(naam) — dekt dezelfde rijen maar telt niet mee als conflictdoel. Het
 * verschil is onzichtbaar tot een uitrol, en levert dan 42P10 op:
 * "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification". Precies dat overkwam /api/ingest met meter_readings.
 *
 * De lijst met conflictdoelen wordt uit de broncode gelezen en niet hier
 * herhaald, zodat deze controle niet stilletjes achterop kan raken.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRON = join(WORTEL, "web");

const host = process.argv[2];
const databank = process.argv[3] ?? "proef";
if (!host) {
  console.error("Gebruik: node scripts/controleer-conflictdoelen.mjs <psql-host> [databank]");
  process.exit(2);
}

/** Alle .ts/.tsx onder web/, zonder de mappen die niet van ons zijn. */
function bronbestanden(map) {
  const overslaan = new Set(["node_modules", ".next", "dist", ".turbo"]);
  const gevonden = [];
  for (const naam of readdirSync(map)) {
    if (overslaan.has(naam)) continue;
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) gevonden.push(...bronbestanden(pad));
    else if (/\.tsx?$/.test(naam)) gevonden.push(pad);
  }
  return gevonden;
}

/**
 * Zoekt elk conflictdoel en de tabel waar het bij hoort.
 *
 * De tabel staat altijd vóór het conflictdoel, maar niet noodzakelijk op
 * dezelfde regel: soms is het één keten, soms staan er regels tussen. Daarom
 * zoeken we vanaf het conflictdoel terug naar de dichtstbijzijnde .from(...).
 */
function leesConflictdoelen() {
  const doelen = [];
  const zonderTabel = [];

  for (const pad of bronbestanden(BRON)) {
    const inhoud = readFileSync(pad, "utf8");
    const bestand = relative(WORTEL, pad);

    for (const treffer of inhoud.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      const regel = inhoud.slice(0, treffer.index).split("\n").length;
      const ervoor = inhoud.slice(0, treffer.index);
      const tabellen = [...ervoor.matchAll(/\.from\(\s*"([A-Za-z0-9_]+)"\s*\)/g)];
      const tabel = tabellen.at(-1)?.[1];

      if (!tabel) {
        zonderTabel.push(`${bestand}:${regel}`);
        continue;
      }
      doelen.push({
        bestand,
        regel,
        tabel,
        kolommen: treffer[1].split(",").map((k) => k.trim()).filter(Boolean),
      });
    }
  }

  return { doelen, zonderTabel };
}

/** Unieke indexen op gewone kolommen. Expressies vallen hier bewust uit. */
function unieke_indexen() {
  const query = `
    select c.relname || ' ' || string_agg(a.attname, ',' order by a.attname)
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(i.indkey) with ordinality as k(attnum, positie) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
    where n.nspname = 'public'
      and i.indisunique
      and i.indpred is null
      and k.positie <= i.indnkeyatts
      and 0 <> all (i.indkey)
    group by c.relname, i.indexrelid;
  `;
  const uitvoer = execFileSync("psql", ["-h", host, "-U", "postgres", "-d", databank, "-tAc", query], {
    encoding: "utf8",
  });

  const perTabel = new Map();
  for (const regel of uitvoer.split("\n").map((r) => r.trim()).filter(Boolean)) {
    const [tabel, kolommen] = regel.split(" ");
    if (!perTabel.has(tabel)) perTabel.set(tabel, []);
    perTabel.get(tabel).push(kolommen);
  }
  return perTabel;
}

const { doelen, zonderTabel } = leesConflictdoelen();
const indexen = unieke_indexen();

let fout = 0;

// Een conflictdoel dat we niet aan een tabel kunnen koppelen, is geen groen
// licht: dan is de code anders geschreven dan deze controle verwacht, en moet
// iemand ernaar kijken.
for (const plek of zonderTabel) {
  console.log(`  ONDUIDELIJK: ${plek} — geen .from(...) gevonden vóór dit conflictdoel`);
  fout = 1;
}

for (const doel of doelen) {
  const gezocht = [...doel.kolommen].sort().join(",");
  const aanwezig = (indexen.get(doel.tabel) ?? []).includes(gezocht);
  const waar = `${doel.tabel} (${doel.kolommen.join(", ")})`;

  if (aanwezig) {
    console.log(`  in orde: ${waar}`);
  } else {
    console.log(`  GEEN UNIEKE INDEX: ${waar}`);
    console.log(`    gebruikt in ${doel.bestand}:${doel.regel}`);
    console.log(`    ON CONFLICT hierop faalt met 42P10 zodra deze upsert draait.`);
    console.log(`    Voeg een migratie toe met:`);
    console.log(
      `      create unique index if not exists ${doel.tabel}_${doel.kolommen.join("_")}_key`,
    );
    console.log(`        on ${doel.tabel} (${doel.kolommen.join(", ")});`);
    fout = 1;
  }
}

if (doelen.length === 0 && zonderTabel.length === 0) {
  console.log("  geen conflictdoelen gevonden in web/");
}

process.exit(fout);
