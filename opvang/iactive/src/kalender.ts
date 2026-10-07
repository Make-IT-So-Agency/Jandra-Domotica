/**
 * Leest de kalender van i-Active voor de lopende inschrijfrondes en zet de
 * tegels in Supabase, zodat de bot er een keuzemenu van kan maken. Wijzigt
 * niets in i-Active.
 *
 *   node src/kalender.ts            elke ronde die binnen 21 dagen opent,
 *                                   of al opende en waarvan de opvang nog komt
 *   node src/kalender.ts 2026-12    enkel die opvangmaand, ook zonder ronde
 *   node src/kalender.ts --stil     zonder de webapp te roepen: geen
 *                                   berichten in Telegram
 *
 * Daarna vraagt het de webapp om het keuzemenu te sturen of bij te werken.
 * In het logboek komen enkel aantallen: geen namen, geen keuzes.
 */

import { leesLeerlingen, leesTegels, login, naarKalender, openKalender, startBrowser } from "./iactive.ts";
import { kalenderMaanden, rondesMetOpvangVanaf, type Ronde } from "./rondes.ts";
import { rest } from "./supabase.ts";

const VOORUIT_DAGEN = 21;

async function main() {
  const stil = process.argv.includes("--stil");
  // Eerst de webapp: die maakt de volgende ronde aan als ze binnen tien dagen opent.
  if (!stil) await vraagMenu(false);
  const gevraagd = process.argv.slice(2).find((a) => /^(\d{4}-\d{2}|zomer-\d{4})$/.test(a));
  const nu = Date.now();
  const rondes: Pick<Ronde, "id" | "maand">[] = (await rondesMetOpvangVanaf(new Date(nu).toISOString().slice(0, 7))).filter((r) =>
    gevraagd ? r.maand === gevraagd : new Date(r.opent).getTime() - nu < VOORUIT_DAGEN * 86_400_000,
  );
  // Een gevraagde maand zonder ronde: toch lezen, de tegels hangen aan het kind.
  if (gevraagd && !rondes.length) rondes.push({ id: 0, maand: gevraagd });
  if (!rondes.length) {
    console.log("Geen ronde om de kalender voor te lezen.");
    return;
  }

  const email = process.env.IACTIVE_EMAIL;
  const wachtwoord = process.env.IACTIVE_WACHTWOORD;
  if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");

  const start = new Date().toISOString();
  const { browser, pagina } = await startBrowser();
  try {
    await login(pagina, email, wachtwoord);
    await naarKalender(pagina);
    const leerlingen = await leesLeerlingen(pagina);
    const kinderen = await rest<{ id: number; leerling_id: string }[]>(
      "POST",
      "opvang_kinderen?on_conflict=leerling_id",
      leerlingen.map((l) => ({ leerling_id: l.id, naam: l.naam, gezien_op: new Date().toISOString() })),
      "resolution=merge-duplicates,return=representation",
    );
    console.log(`Kinderen gevonden: ${kinderen.length}`);

    for (const ronde of rondes) {
      let totaal = 0;
      for (const kind of kinderen) {
        for (const maand of kalenderMaanden(ronde.maand)) {
          await openKalender(pagina, kind.leerling_id, maand);
          // Twee tegels met dezelfde sleutel kunnen niet samen in één upsert,
          // en de bot zou ze bij het inschrijven niet uit elkaar houden: weg ermee.
          const alle = await leesTegels(pagina, maand);
          const sleutel = (t: (typeof alle)[number]) => `${t.datum}|${t.moment}|${t.locatie}`;
          const tegels = alle.filter((t) => alle.filter((u) => sleutel(u) === sleutel(t)).length === 1);
          if (tegels.length < alle.length) console.log(`Tegels met een dubbele sleutel weggelaten: ${alle.length - tegels.length}`);
          totaal += tegels.length;
          if (!tegels.length) continue;
          await rest(
            "POST",
            "opvang_slots?on_conflict=kind_id,datum,moment,locatie",
            tegels.map((t) => ({
              kind_id: kind.id,
              maand,
              datum: t.datum,
              moment: t.moment,
              locatie: t.locatie,
              staat: t.staat,
              titel: t.titel.slice(0, 200),
              gezien_op: new Date().toISOString(),
            })),
            "resolution=merge-duplicates,return=minimal",
          );
          // Wat i-Active niet meer toont, is er niet meer: niet meer aan te duiden.
          const weg = await rest<unknown[]>(
            "PATCH",
            `opvang_slots?kind_id=eq.${kind.id}&maand=eq.${maand}&gezien_op=lt.${encodeURIComponent(start)}&staat=neq.weg`,
            { staat: "weg" },
          );
          if (weg.length) console.log(`Tegels niet meer in de kalender: ${weg.length}`);
          const telling = new Map<string, number>();
          for (const t of tegels) telling.set(t.staat, (telling.get(t.staat) ?? 0) + 1);
          console.log(`Ronde ${ronde.maand}, kind ${kinderen.indexOf(kind) + 1}, ${maand}: ${tegels.length} tegels (${[...telling].map(([s, n]) => `${s} ${n}`).join(", ")})`);
        }
      }
      if (ronde.id) await rest("PATCH", `opvang_rondes?id=eq.${ronde.id}`, { kalender_gelezen_op: new Date().toISOString() }, "return=minimal");
      if (!totaal) console.log(`Ronde ${ronde.maand}: geen tegels gevonden.`);
    }
  } finally {
    await browser.close();
  }
  if (!stil) await vraagMenu();
}

/** Laat de webapp het keuzemenu sturen of bijwerken met de nieuwe tegels. */
export async function vraagMenu(vernieuw = true): Promise<void> {
  const app = process.env.AUTH_URL;
  const geheim = process.env.CRON_SECRET;
  if (!app || !geheim) {
    console.log("AUTH_URL of CRON_SECRET ontbreekt: het menu komt bij de volgende dagelijkse ronde.");
    return;
  }
  const r = await fetch(new URL(`/api/cron/opvang${vernieuw ? "?vernieuw=1" : ""}`, app), {
    headers: { Authorization: `Bearer ${geheim}` },
  }).catch(() => null);
  if (!r) {
    console.log("Webapp niet bereikbaar.");
    return;
  }
  const inhoud = (await r.json().catch(() => null)) as { gedaan?: string[]; error?: string } | null;
  console.log(`Webapp: HTTP ${r.status}${inhoud?.gedaan ? `, ${inhoud.gedaan.length} stappen` : ""}${inhoud?.error ? `, fout: ${inhoud.error.slice(0, 120)}` : ""}`);
}

export type { Ronde };

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((fout) => {
    console.log(`Gestopt: ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
    process.exitCode = 1;
  });
}
