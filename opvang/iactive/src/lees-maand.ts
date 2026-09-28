/**
 * Leest de kalender van één of meer maanden, zonder iets te wijzigen, en
 * toont een samenvatting zonder persoonsgegevens: per soort opvang, locatie
 * en staat hoeveel tegels er zijn. Kinderen worden enkel genummerd.
 *
 *   node src/lees-maand.ts 2026-11 2026-12
 */

import { leesLeerlingen, leesTegels, login, naarKalender, openKalender, startBrowser } from "./iactive.ts";
import { zuiverLabel } from "./verslag.ts";

const maanden = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
const email = process.env.IACTIVE_EMAIL;
const wachtwoord = process.env.IACTIVE_WACHTWOORD;
if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");

const { browser, pagina } = await startBrowser();
const uit: string[] = [];
try {
  await login(pagina, email, wachtwoord);
  await naarKalender(pagina);
  const kinderen = await leesLeerlingen(pagina);
  uit.push(`Kinderen in de kalender: ${kinderen.length}`);
  for (const [k, kind] of kinderen.entries()) {
    for (const maand of maanden) {
      await openKalender(pagina, kind.id, maand);
      const tegels = await leesTegels(pagina, maand);
      uit.push("", `## Kind ${k + 1}, ${maand}: ${tegels.length} tegels`);
      const tel = new Map<string, number>();
      for (const t of tegels) {
        const sleutel = `${zuiverLabel(t.moment, 40)} | ${zuiverLabel(t.locatie, 40)} | ${t.staat}`;
        tel.set(sleutel, (tel.get(sleutel) ?? 0) + 1);
      }
      for (const [s, n] of [...tel].sort()) uit.push(`- ${s}: ${n}`);
      const titels = new Set(tegels.map((t) => zuiverLabel(t.titel.replace(/\d/g, "9"), 60)));
      uit.push(`- titels: ${[...titels].join(" ; ")}`);
      const dubbel = new Map<string, number>();
      for (const t of tegels) dubbel.set(`${t.datum}|${t.moment}|${t.locatie}`, (dubbel.get(`${t.datum}|${t.moment}|${t.locatie}`) ?? 0) + 1);
      uit.push(`- dubbele sleutels: ${[...dubbel.values()].filter((n) => n > 1).length}`);
      uit.push(`- dagen met tegels: ${new Set(tegels.map((t) => t.datum)).size}`);
      // De ruwe klassen en iconen van één tegel per staat, om de regels te controleren.
      const staal = await pagina.evaluate(() =>
        Array.from(document.querySelectorAll("td[data-date] .fc-event"))
          .slice(0, 400)
          .map((e) => ({
            klassen: `${e.className} ${Array.from(e.querySelectorAll("[class]")).map((x) => x.className).join(" ")}`,
            iconen: Array.from(e.querySelectorAll("[class*=fa-]")).map((x) => x.className).join(" "),
          })),
      );
      const klassen = new Set(staal.map((s) => s.klassen.replace(/\s+/g, " ").trim()));
      uit.push(`- klassen (${klassen.size} soorten):`, ...[...klassen].slice(0, 8).map((k) => `  - ${zuiverLabel(k, 200)}`));
    }
  }
} catch (fout) {
  uit.push(`Gestopt: ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(uit.join("\n"));
