#!/usr/bin/env node
/**
 * Zet de instellingen en de omgevingsvariabelen van het Vercel-project gelijk
 * met wat infra/vercel-omgeving.json declareert.
 *
 *   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... node scripts/zet-vercel-omgeving.mjs
 *   ... node scripts/zet-vercel-omgeving.mjs --droogloop
 *
 * De waarden zelf komen uit de omgeving van dit proces, met dezelfde naam als
 * de variabele. In de workflow worden die uit de GitHub Actions-secrets gevuld,
 * zodat er nooit een geheim in de repository staat.
 *
 * Ontbreekt een secret, dan slaat het script die variabele over en meldt dat.
 * Dat is bewust geen fout: bij de eerste opzet bestaan de Google-gegevens nog
 * niet, en de rest moet dan wel al gezet kunnen worden.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "infra",
  "vercel-omgeving.json",
);

const droogloop = process.argv.includes("--droogloop") || process.argv.includes("--dry-run");

const token = process.env.VERCEL_TOKEN;
const project = process.env.VERCEL_PROJECT_ID;
const team = process.env.VERCEL_ORG_ID;

if (!token || !project) {
  console.error("VERCEL_TOKEN en VERCEL_PROJECT_ID zijn allebei nodig.");
  process.exit(2);
}

const teamDeel = team ? `?teamId=${encodeURIComponent(team)}` : "";
const teamExtra = team ? `&teamId=${encodeURIComponent(team)}` : "";

async function vercel(pad, opties = {}) {
  const antwoord = await fetch(`https://api.vercel.com${pad}`, {
    ...opties,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opties.headers ?? {}),
    },
  });

  const tekst = await antwoord.text();
  if (!antwoord.ok) {
    let reden = tekst;
    try {
      reden = JSON.parse(tekst).error?.message ?? tekst;
    } catch {
      // Geen JSON: dan tonen we de ruwe tekst.
    }
    throw new Error(`Vercel gaf ${antwoord.status}: ${reden}`);
  }
  return tekst ? JSON.parse(tekst) : null;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// De instellingen van het project zelf. Deze gaan vóór de variabelen, want de
// uitrol die hierna volgt leest ze meteen mee met `vercel pull`.
const instellingen = Object.entries(manifest.projectinstellingen ?? {}).filter(
  ([sleutel]) => !sleutel.startsWith("$"),
);

if (instellingen.length > 0) {
  console.log("Projectinstellingen:");
  const huidig = await vercel(`/v9/projects/${project}${teamDeel}`);
  const afwijkend = instellingen.filter(([sleutel, waarde]) => huidig[sleutel] !== waarde);

  if (afwijkend.length === 0) {
    console.log("  staan al goed");
  } else if (droogloop) {
    for (const [sleutel, waarde] of afwijkend) {
      console.log(
        `  ${sleutel}: zou van ${JSON.stringify(huidig[sleutel])} naar ${JSON.stringify(waarde)} gaan`,
      );
    }
  } else {
    await vercel(`/v9/projects/${project}${teamDeel}`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(afwijkend)),
    });
    for (const [sleutel, waarde] of afwijkend) {
      console.log(`  ${sleutel}: gezet op ${JSON.stringify(waarde)}`);
    }
  }
  console.log("\nOmgevingsvariabelen:");
}

const bestaande = (await vercel(`/v9/projects/${project}/env${teamDeel}`)).envs ?? [];
const perNaam = new Map();
for (const rij of bestaande) {
  if (!perNaam.has(rij.key)) perNaam.set(rij.key, []);
  perNaam.get(rij.key).push(rij);
}

let gezet = 0;
let overgeslagen = 0;

for (const variabele of manifest.variabelen) {
  const { naam, herkomst, omgevingen } = variabele;

  let waarde;
  if (herkomst === "waarde") {
    waarde = variabele.waarde;
  } else {
    waarde = process.env[naam];
  }

  if (waarde === undefined || waarde === "") {
    console.log(`  ${naam}: overgeslagen, geen waarde beschikbaar`);
    overgeslagen += 1;
    continue;
  }

  const huidige = perNaam.get(naam) ?? [];

  if (droogloop) {
    console.log(`  ${naam}: zou gezet worden voor ${omgevingen.join(", ")}`);
    gezet += 1;
    continue;
  }

  // Eén bestaande rij kan bijgewerkt worden. Zijn er meerdere, dan is de
  // toestand onduidelijk en zetten we ze schoon opnieuw neer.
  if (huidige.length === 1) {
    await vercel(`/v9/projects/${project}/env/${huidige[0].id}${teamDeel}`, {
      method: "PATCH",
      body: JSON.stringify({ value: waarde, target: omgevingen, type: "encrypted" }),
    });
  } else {
    for (const rij of huidige) {
      await vercel(`/v9/projects/${project}/env/${rij.id}${teamDeel}`, { method: "DELETE" });
    }
    await vercel(`/v10/projects/${project}/env?upsert=true${teamExtra}`, {
      method: "POST",
      body: JSON.stringify({ key: naam, value: waarde, target: omgevingen, type: "encrypted" }),
    });
  }

  console.log(`  ${naam}: gezet voor ${omgevingen.join(", ")}`);
  gezet += 1;
}

// Variabelen die bij Vercel staan maar nergens gedeclareerd zijn. Die halen we
// niet automatisch weg — misschien heb je ze met opzet toegevoegd — maar je
// hoort wel te weten dat ze buiten de repository om bestaan.
const gedeclareerd = new Set(manifest.variabelen.map((v) => v.naam));
const onbekend = [...perNaam.keys()].filter((naam) => !gedeclareerd.has(naam));
if (onbekend.length > 0) {
  console.log("\nStaat bij Vercel maar niet in infra/vercel-omgeving.json:");
  for (const naam of onbekend) console.log(`  ${naam}`);
}

console.log(
  `\n${droogloop ? "Droogloop: " : ""}${gezet} gezet, ${overgeslagen} overgeslagen.`,
);
