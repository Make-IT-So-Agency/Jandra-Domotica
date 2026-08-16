#!/usr/bin/env node
/**
 * Stelt één vraag aan de databank en toont het antwoord.
 *
 *   DATABASE_URL=... node scripts/vraag.mjs "select count(*) from sessions"
 *
 * Alleen lezen. Dat wordt niet afgedwongen door de query te bekijken — dat is
 * altijd te omzeilen — maar door Postgres zelf: de vraag draait in een
 * read-only transactie, en die weigert elke schrijfopdracht, hoe ze ook
 * verpakt is.
 */

import { databankAdres, verbind } from "./lib/postgres.mjs";

const MAX_RIJEN = 200;
const MAX_BREEDTE = 60;

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('Gebruik: node scripts/vraag.mjs "select ..."');
  process.exit(2);
}

const client = await verbind(databankAdres());

try {
  await client.query("begin transaction read only");

  let resultaat;
  try {
    resultaat = await client.query(query);
  } catch (fout) {
    console.error(`De vraag is geweigerd of bevat een fout:\n  ${fout.message}`);
    process.exit(1);
  } finally {
    await client.query("rollback").catch(() => {});
  }

  const rijen = resultaat.rows ?? [];
  if (rijen.length === 0) {
    console.log("Geen rijen.");
    process.exit(0);
  }

  const kolommen = resultaat.fields.map((veld) => veld.name);
  const kort = (waarde) => {
    const tekst = waarde === null ? "∅" : String(waarde);
    return tekst.length > MAX_BREEDTE ? tekst.slice(0, MAX_BREEDTE - 1) + "…" : tekst;
  };

  const getoond = rijen.slice(0, MAX_RIJEN);
  const breedtes = kolommen.map((kolom, i) =>
    Math.max(kolom.length, ...getoond.map((rij) => kort(rij[kolommen[i]]).length)),
  );

  const regel = (waarden) =>
    waarden.map((waarde, i) => String(waarde).padEnd(breedtes[i])).join("  ");

  console.log(regel(kolommen));
  console.log(breedtes.map((b) => "─".repeat(b)).join("  "));
  for (const rij of getoond) {
    console.log(regel(kolommen.map((kolom) => kort(rij[kolom]))));
  }

  if (rijen.length > MAX_RIJEN) {
    console.log(`\n… en nog ${rijen.length - MAX_RIJEN} rijen. Verfijn de vraag met een limit.`);
  } else {
    console.log(`\n${rijen.length} rij(en).`);
  }
} finally {
  await client.end().catch(() => {});
}
