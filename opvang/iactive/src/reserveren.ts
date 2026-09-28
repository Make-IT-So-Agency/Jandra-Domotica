/**
 * Schrijft exact de definitieve keuze in, op het moment dat i-Active opent,
 * en controleert elk slot daarna in i-Active zelf.
 *
 *   node src/reserveren.ts                 de ronde die binnen 4 uur opent
 *   node src/reserveren.ts --proef         alles behalve de klik op
 *                                          "Inschrijven"; wacht niet op de
 *                                          opening en verandert geen status
 *   node src/reserveren.ts --proef --maand 2026-11
 *                                          proef op enkele tegels die nu al
 *                                          open staan (één vrije, één volzette)
 *   node src/reserveren.ts --test 2026-11-16:voor
 *                                          schrijft ÉCHT dat ene slot in, voor
 *                                          het kind dat ingepland wordt, en
 *                                          controleert het. Enkel met de hand.
 *
 * Regels, zie opvang/LEESMIJ.md:
 * - Enkel wat in opvang_keuzes staat voor een ronde met status definitief.
 * - Een klik is geen inschrijving: gelukt is wat de tegel daarna zegt.
 * - Volzet: toch inschrijven, dan komt het kind op de reservelijst.
 *
 * Telegram krijgt per slot een melding en op het einde een verslag. Het
 * logboek van de workflow is publiek en krijgt enkel aantallen.
 */

import type { Page } from "playwright";

import { herlaad, leesTegels, login, naarKalender, openKalender, schrijfIn, soortVan, startBrowser, zoekTegel, type Poging, type Tegel } from "./iactive.ts";
import { lopendeRondes, ronde as leesRonde, zetStatus, type Ronde } from "./rondes.ts";
import { rest } from "./supabase.ts";
import { afgehandeld, inschrijfbaar, type Staat } from "./tegels.ts";
import { stuur } from "./telegram.ts";
import { dagLabel, langMoment } from "./weergave.ts";

const argumenten = process.argv.slice(2);
const na = (vlag: string) => {
  const i = argumenten.indexOf(vlag);
  return i >= 0 ? argumenten[i + 1] : undefined;
};
const proef = argumenten.includes("--proef");
const proefMaand = na("--maand");
const test = na("--test");
/** Zo lang vóór de opening loggen we in. */
const INLOGGEN_VOOR_MS = 6 * 60_000;
/** Na dit moment vóór de opening kan in Telegram niet meer gewijzigd worden (zie web/lib/opvang/menu.ts). */
const VASTLEGGEN_VOOR_MS = 4 * 60_000;
/** Zo lang na de opening blijven we de kalender herladen tot de tegels opengaan. */
const MAX_WACHTEN_OP_OPENING_MS = 20 * 60_000;

interface Keuze {
  slotId: number;
  kindId: number;
  leerlingId: string;
  kind: string;
  datum: string;
  moment: string;
  locatie: string;
}

type Uitkomst = "ingeschreven" | "reservelijst" | "al_ingeschreven" | "mislukt" | "gestopt";

const slaap = (ms: number) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));

let chat: number | null = null;
async function meld(tekst: string): Promise<void> {
  if (!chat) return;
  await stuur(chat, proef ? `🧪 PROEF · ${tekst}` : tekst).catch((f) => console.log(`Telegram mislukt: ${String(f).slice(0, 120)}`));
}

async function leesChat(): Promise<number | null> {
  const [rij] = await rest<{ waarde: string }[]>("GET", "opvang_instellingen?sleutel=eq.telegram_chat_id");
  return rij && Number.isSafeInteger(Number(rij.waarde)) ? Number(rij.waarde) : null;
}

async function leesKeuzes(rondeId: number): Promise<Keuze[]> {
  const rijen = await rest<
    { slot_id: number; opvang_slots: { kind_id: number; datum: string; moment: string; locatie: string; opvang_kinderen: { leerling_id: string; naam: string; plannen: boolean } } }[]
  >("GET", `opvang_keuzes?ronde_id=eq.${rondeId}&select=slot_id,opvang_slots(kind_id,datum,moment,locatie,opvang_kinderen(leerling_id,naam,plannen))`);
  return rijen
    .filter((r) => r.opvang_slots?.opvang_kinderen?.plannen)
    .map((r) => ({
      slotId: r.slot_id,
      kindId: r.opvang_slots.kind_id,
      leerlingId: r.opvang_slots.opvang_kinderen.leerling_id,
      kind: r.opvang_slots.opvang_kinderen.naam,
      datum: r.opvang_slots.datum,
      moment: r.opvang_slots.moment,
      locatie: r.opvang_slots.locatie,
    }))
    .sort((a, b) => a.kindId - b.kindId || a.datum.localeCompare(b.datum));
}

async function bewaarResultaat(rondeId: number, slotId: number, uitkomst: Uitkomst, melding?: string): Promise<void> {
  if (proef || rondeId < 0) return;
  await rest(
    "POST",
    "opvang_resultaten?on_conflict=ronde_id,slot_id",
    { ronde_id: rondeId, slot_id: slotId, uitkomst, melding: melding?.slice(0, 300) ?? null, op: new Date().toISOString() },
    "resolution=merge-duplicates,return=minimal",
  );
}

function label(k: Keuze): string {
  const loc = k.locatie.replace(/^BKO\s*-\s*/i, "");
  return `${dagLabel(k.datum)} ${langMoment(k.moment)}${loc ? ` (${loc})` : ""}`;
}

const TEKEN: Record<Uitkomst, string> = {
  ingeschreven: "✔",
  reservelijst: "⏸",
  al_ingeschreven: "✔",
  mislukt: "❌",
  gestopt: "🛑",
};

function uitleg(u: Uitkomst): string {
  return {
    ingeschreven: "ingeschreven",
    reservelijst: "RESERVELIJST (volzet, schuift door als er plaats vrijkomt)",
    al_ingeschreven: "was al ingeschreven",
    mislukt: "NIET gelukt",
    gestopt: "niet gedaan (gestopt)",
  }[u];
}

/** De staat van één gekozen slot zoals de kalender het nu toont. */
async function staatNu(pagina: Page, k: Keuze): Promise<{ staat: Staat | "weg"; tegel: Tegel | null }> {
  const tegel = zoekTegel(await leesTegels(pagina, k.datum.slice(0, 7)), k);
  return { staat: tegel?.staat ?? "weg", tegel };
}

function uitkomstVan(staat: Staat | "weg"): Uitkomst | null {
  if (staat === "ingeschreven") return "ingeschreven";
  if (staat === "reservelijst") return "reservelijst";
  return null;
}

/** Wacht tot de gekozen tegels in de kalender opengaan (of al ingeschreven zijn). */
async function wachtOpOpening(pagina: Page, keuzes: Keuze[]): Promise<boolean> {
  const eerste = keuzes[0];
  const tot = Date.now() + MAX_WACHTEN_OP_OPENING_MS;
  let beurt = 0;
  while (Date.now() < tot) {
    await herlaad(pagina, eerste.leerlingId, eerste.datum.slice(0, 7));
    const tegels = await leesTegels(pagina, eerste.datum.slice(0, 7));
    const open = keuzes
      .filter((k) => k.leerlingId === eerste.leerlingId && k.datum.startsWith(eerste.datum.slice(0, 7)))
      .map((k) => zoekTegel(tegels, k)?.staat)
      .filter((s): s is Staat => !!s && (inschrijfbaar(s) || afgehandeld(s)));
    if (open.length) return true;
    if (++beurt % 20 === 0) console.log(`Nog niet open na ${beurt} pogingen.`);
    await slaap(2000);
  }
  return false;
}

async function stopGevraagd(id: number): Promise<boolean> {
  if (proef || id < 0) return false;
  return (await leesRonde(id))?.stop_gevraagd ?? false;
}

async function verwerk(pagina: Page, r: Ronde, keuzes: Keuze[]): Promise<Map<number, { uitkomst: Uitkomst; melding?: string }>> {
  const klaar = new Map<number, { uitkomst: Uitkomst; melding?: string }>();
  // Wat een vorige, afgebroken run al deed, doen we niet opnieuw.
  if (!proef && r.id > 0) {
    for (const rij of await rest<{ slot_id: number; uitkomst: Uitkomst }[]>("GET", `opvang_resultaten?ronde_id=eq.${r.id}`)) {
      if (rij.uitkomst !== "mislukt" && rij.uitkomst !== "gestopt") klaar.set(rij.slot_id, { uitkomst: rij.uitkomst });
    }
  }

  for (const poging of [1, 2]) {
    let huidig = "";
    for (const k of keuzes) {
      if (klaar.has(k.slotId) && klaar.get(k.slotId)!.uitkomst !== "mislukt") continue;
      if (await stopGevraagd(r.id)) {
        for (const rest of keuzes.filter((x) => !klaar.has(x.slotId) || klaar.get(x.slotId)!.uitkomst === "mislukt")) {
          klaar.set(rest.slotId, { uitkomst: "gestopt" });
          await bewaarResultaat(r.id, rest.slotId, "gestopt");
        }
        await meld("🛑 Gestopt op vraag. Wat hierboven staat, is gebeurd; de rest niet.");
        return klaar;
      }
      const maand = k.datum.slice(0, 7);
      if (huidig !== `${k.leerlingId}|${maand}`) {
        await openKalender(pagina, k.leerlingId, maand);
        huidig = `${k.leerlingId}|${maand}`;
      }

      let { staat } = await staatNu(pagina, k);
      let uitkomst = uitkomstVan(staat);
      let melding: string | undefined;
      if (uitkomst) {
        uitkomst = "al_ingeschreven";
      } else if (staat === "weg") {
        uitkomst = "mislukt";
        melding = "Tegel niet meer gevonden in de kalender.";
      } else if (proef && staat === "nog_niet_open") {
        await meld(`${label(k)}: tegel gevonden, nog niet open.`);
        continue;
      } else if (!inschrijfbaar(staat)) {
        uitkomst = "mislukt";
        melding = staat === "gesloten" ? "Inschrijven is gesloten voor dit slot." : `Tegel is ${staat.replace("_", " ")}.`;
      } else {
        const volzet = staat === "volzet";
        let resultaat: Poging;
        try {
          resultaat = await schrijfIn(pagina, k, k.kind, proef);
        } catch (fout) {
          resultaat = { soort: "fout", melding: fout instanceof Error ? fout.message.split("\n")[0].slice(0, 150) : "onbekende fout" };
        }
        if (resultaat.soort === "proef") {
          uitkomst = null;
          await meld(`${label(k)}: venster geopend, ${k.kind} aangevinkt, knop Inschrijven gevonden${volzet ? " (volzet → reservelijst)" : ""}. Niet geklikt.`);
          continue;
        }
        const geklikt = resultaat.soort === "geklikt" || (resultaat.soort === "fout" && resultaat.geklikt === true);
        if (!geklikt) {
          uitkomst = "mislukt";
          melding =
            resultaat.soort === "fout"
              ? resultaat.melding
              : resultaat.soort === "geen_vinkje"
                ? `Geen vinkje voor ${k.kind} in het venster.`
                : "Tegel niet gevonden.";
        } else {
          // Nu de controle: wat zegt de tegel? Eerst zonder herladen, dan met.
          await pagina.waitForTimeout(1500);
          ({ staat } = await staatNu(pagina, k));
          uitkomst = uitkomstVan(staat);
          if (!uitkomst) {
            await herlaad(pagina, k.leerlingId, maand);
            ({ staat } = await staatNu(pagina, k));
            uitkomst = uitkomstVan(staat);
          }
          if (!uitkomst) {
            uitkomst = "mislukt";
            melding = `Geklikt, maar de tegel toont geen inschrijving (${staat}).${resultaat.soort === "fout" ? ` i-Active: ${resultaat.melding}` : ""}`;
          }
        }
      }
      klaar.set(k.slotId, { uitkomst, melding });
      await bewaarResultaat(r.id, k.slotId, uitkomst, melding);
      if (uitkomst !== "mislukt" || poging === 2) {
        await meld(`${TEKEN[uitkomst]} ${k.kind} · ${label(k)}: ${uitleg(uitkomst)}${melding ? `\n   ${melding}` : ""}`);
      }
    }
    if (proef || ![...klaar.values()].some((v) => v.uitkomst === "mislukt")) break;
    await meld("↻ Tweede poging voor wat niet lukte…");
  }
  return klaar;
}

/** Leest elke gekozen tegel opnieuw, van nul, en zet de uitkomst gelijk met wat i-Active zegt. */
async function eindcontrole(pagina: Page, r: Ronde, keuzes: Keuze[], klaar: Map<number, { uitkomst: Uitkomst; melding?: string }>) {
  const perKalender = new Map<string, Keuze[]>();
  for (const k of keuzes) perKalender.set(`${k.leerlingId}|${k.datum.slice(0, 7)}`, [...(perKalender.get(`${k.leerlingId}|${k.datum.slice(0, 7)}`) ?? []), k]);
  const verschil: string[] = [];
  let eerste = true;
  for (const [sleutel, lijst] of perKalender) {
    const [leerling, maand] = sleutel.split("|");
    if (eerste) await herlaad(pagina, leerling, maand);
    else await openKalender(pagina, leerling, maand);
    eerste = false;
    const tegels = await leesTegels(pagina, maand);
    for (const k of lijst) {
      const staat = zoekTegel(tegels, k)?.staat ?? "weg";
      const gezien = uitkomstVan(staat);
      const vorig = klaar.get(k.slotId);
      if (!vorig || vorig.uitkomst === "gestopt") continue;
      const wasGoed = vorig.uitkomst !== "mislukt";
      if (gezien && !wasGoed) {
        klaar.set(k.slotId, { uitkomst: gezien });
        await bewaarResultaat(r.id, k.slotId, gezien, "Bij de eindcontrole toch ingeschreven gevonden.");
      } else if (!gezien && wasGoed) {
        klaar.set(k.slotId, { uitkomst: "mislukt", melding: `Bij de eindcontrole niet ingeschreven (${staat}).` });
        await bewaarResultaat(r.id, k.slotId, "mislukt", `Bij de eindcontrole niet ingeschreven (${staat}).`);
        verschil.push(`${k.kind} · ${label(k)}`);
      } else if (gezien === "reservelijst" && vorig.uitkomst === "ingeschreven") {
        klaar.set(k.slotId, { uitkomst: "reservelijst" });
        await bewaarResultaat(r.id, k.slotId, "reservelijst");
      }
    }
  }
  return verschil;
}

function verslag(r: Ronde, keuzes: Keuze[], klaar: Map<number, { uitkomst: Uitkomst; melding?: string }>): string {
  const groepen: [string, Uitkomst[]][] = [
    ["✔ Ingeschreven", ["ingeschreven", "al_ingeschreven"]],
    ["⏸ Reservelijst (volzet)", ["reservelijst"]],
    ["❌ Niet gelukt, doe dit zelf", ["mislukt"]],
    ["🛑 Niet gedaan", ["gestopt"]],
  ];
  const regels = [`📋 Verslag opvang ${r.maand}: ${keuzes.length} gekozen momenten, gecontroleerd in i-Active.`];
  for (const [kop, soorten] of groepen) {
    const lijst = keuzes.filter((k) => soorten.includes(klaar.get(k.slotId)?.uitkomst ?? "mislukt"));
    if (!lijst.length) continue;
    regels.push("", `${kop}: ${lijst.length}`);
    for (const k of lijst) {
      const m = klaar.get(k.slotId)?.melding;
      regels.push(`• ${k.kind} · ${label(k)}${m ? ` (${m})` : ""}`);
    }
  }
  return regels.join("\n");
}

/** Het kind dat ingepland wordt (voor --maand en --test): precies één, anders stoppen. */
async function planKind(): Promise<{ id: number; leerling_id: string; naam: string }> {
  const lijst = await rest<{ id: number; leerling_id: string; naam: string }[]>("GET", "opvang_kinderen?plannen=is.true&order=id");
  if (lijst.length !== 1) throw new Error(`Verwacht precies één kind dat ingepland wordt, gevonden: ${lijst.length}.`);
  return lijst[0];
}

/** Proef of test op tegels die nu al open staan, zonder ronde. */
async function losseRun(): Promise<void> {
  const kind = await planKind();
  const email = process.env.IACTIVE_EMAIL;
  const wachtwoord = process.env.IACTIVE_WACHTWOORD;
  if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");
  const { browser, pagina } = await startBrowser();
  try {
    await login(pagina, email, wachtwoord);
    await naarKalender(pagina);
    const maand = (test ?? proefMaand ?? "").slice(0, 7);
    await openKalender(pagina, kind.leerling_id, maand);
    const tegels = await leesTegels(pagina, maand);
    let gekozen: Tegel[];
    if (test) {
      const [datum, soort] = test.split(":");
      gekozen = tegels.filter((t) => t.datum === datum && soortVan(t.moment) === soort);
      if (gekozen.length !== 1) throw new Error(`Voor ${test} ${gekozen.length} tegels gevonden in plaats van één.`);
    } else {
      gekozen = [tegels.find((t) => t.staat === "vrij"), tegels.find((t) => t.staat === "volzet")].filter((t): t is Tegel => !!t);
    }
    const keuzes: Keuze[] = gekozen.map((t, i) => ({ slotId: -1 - i, kindId: kind.id, leerlingId: kind.leerling_id, kind: kind.naam, datum: t.datum, moment: t.moment, locatie: t.locatie }));
    await meld(test ? `🧪 ECHTE TEST: ik schrijf ${kind.naam} in voor ${keuzes.map(label).join(", ")} en controleer het.` : `Proef op ${keuzes.length} open tegels van ${maand}.`);
    const nep: Ronde = { id: -1, maand, ronde: "test", opent: new Date().toISOString(), status: "bezig", stop_gevraagd: false, bezig_sinds: null };
    const klaar = await verwerk(pagina, nep, keuzes);
    if (test) {
      await eindcontrole(pagina, nep, keuzes, klaar);
      await meld(verslag(nep, keuzes, klaar));
    } else {
      await meld("Proef klaar. Er is niets ingeschreven.");
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  chat = await leesChat();
  if (test || proefMaand) return losseRun();
  const nu = Date.now();
  const kandidaten = (await lopendeRondes()).filter((r) => {
    const opent = new Date(r.opent).getTime();
    return proef ? true : opent - nu < 4 * 3_600_000 && nu - opent < 3 * 3_600_000;
  });
  const r = kandidaten[0];
  if (!r) {
    console.log("Geen inschrijving vandaag.");
    return;
  }
  const opent = new Date(r.opent).getTime();
  console.log(`Ronde ${r.maand}, status ${r.status}, opent over ${Math.round((opent - nu) / 60_000)} min.`);

  if (r.status === "bezig" && !proef) {
    const sinds = r.bezig_sinds ? Date.now() - new Date(r.bezig_sinds).getTime() : Infinity;
    if (sinds < 30 * 60_000) {
      console.log("Een andere run is al bezig.");
      return;
    }
    await meld("Een vorige run is blijven hangen; ik neem over en doe enkel wat nog niet gebeurd is.");
  }

  if (!proef && r.status === "open") {
    await meld(
      `⚠️ Opvang ${r.maand} is nog NIET definitief. De inschrijving opent vandaag om ${new Date(opent).toLocaleTimeString("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" })}. Druk vóór dan op 🔒 Definitief maken, anders schrijf ik niets in.`,
    );
    while (Date.now() < opent - VASTLEGGEN_VOOR_MS) {
      await slaap(60_000);
      const vers = await leesRonde(r.id);
      if (vers?.status !== "open") break;
    }
    const vers = await leesRonde(r.id);
    if (vers?.status !== "definitief") {
      if (await zetStatus(r.id, ["open"], "gemist")) {
        await meld(`Niet definitief gemaakt. Ik schrijf niets in voor ${r.maand}.`);
      }
      return;
    }
    r.status = "definitief";
  }

  if (!proef) await slaap(opent - INLOGGEN_VOOR_MS - Date.now());

  const email = process.env.IACTIVE_EMAIL;
  const wachtwoord = process.env.IACTIVE_WACHTWOORD;
  if (!email || !wachtwoord) throw new Error("IACTIVE_EMAIL of IACTIVE_WACHTWOORD ontbreekt.");
  const { browser, pagina } = await startBrowser();
  let geclaimd = false;
  try {
    await login(pagina, email, wachtwoord);
    await naarKalender(pagina);

    if (!proef) await slaap(opent - VASTLEGGEN_VOOR_MS - Date.now());
    const keuzes = await leesKeuzes(r.id);
    if (!keuzes.length) {
      await meld(`Er is niets gekozen voor ${r.maand}; ik doe niets.`);
      if (!proef) await zetStatus(r.id, ["definitief"], "klaar", { klaar_op: new Date().toISOString() });
      return;
    }
    if (!proef) {
      geclaimd = await zetStatus(r.id, ["definitief", "bezig"], "bezig", { bezig_sinds: new Date().toISOString() });
      if (!geclaimd) {
        await meld(`De keuze voor ${r.maand} is niet meer definitief; ik doe niets.`);
        return;
      }
    }
    console.log(`Gekozen momenten: ${keuzes.length}`);
    await meld(
      proef
        ? `Proef met ${keuzes.length} momenten: ik open elk venster, vink aan, en klik NIET op Inschrijven.`
        : `🟢 Ingelogd bij i-Active. Om ${new Date(opent).toLocaleTimeString("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", second: "2-digit" })} schrijf ik ${keuzes.length} momenten in. Stoppen kan met /stop.`,
    );

    if (!proef) {
      await slaap(opent - Date.now() + 1000);
      if (!(await wachtOpOpening(pagina, keuzes))) {
        await meld("❌ De tegels gingen niet open binnen 20 minuten na het openingsuur. Ik stop; schrijf zelf in via i-Active.");
        await zetStatus(r.id, ["bezig"], "definitief");
        return;
      }
      await meld("🚀 i-Active is open. Ik schrijf in…");
    }

    const klaar = await verwerk(pagina, r, keuzes);
    if (proef) {
      await meld("Proef klaar. Er is niets ingeschreven en niets gewijzigd.");
      return;
    }
    const verschil = await eindcontrole(pagina, r, keuzes, klaar);
    if (verschil.length) await meld(`⚠️ Bij de eindcontrole bleken deze toch niet ingeschreven:\n${verschil.map((v) => `• ${v}`).join("\n")}`);
    await meld(verslag(r, keuzes, klaar));
    const telling = new Map<string, number>();
    for (const v of klaar.values()) telling.set(v.uitkomst, (telling.get(v.uitkomst) ?? 0) + 1);
    console.log(`Klaar: ${[...telling].map(([u, n]) => `${u} ${n}`).join(", ")}`);
    await zetStatus(r.id, ["bezig"], "klaar", { klaar_op: new Date().toISOString() });
  } catch (fout) {
    const reden = fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout";
    console.log(`Gestopt: ${reden}`);
    await meld(`❌ Fout tijdens het inschrijven: ${reden}\nKijk in i-Active wat er al staat en schrijf de rest zelf in. Het verslag hierboven klopt tot hier.`);
    // Terug naar definitief, zodat een nieuwe run meteen verder kan waar deze stopte.
    if (geclaimd) await zetStatus(r.id, ["bezig"], "definitief").catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main().catch(async (fout) => {
  console.log(`Gestopt: ${fout instanceof Error ? fout.message.split("\n")[0].slice(0, 200) : "onbekende fout"}`);
  await meld("❌ De inschrijving kon niet starten. Schrijf zelf in via i-Active.");
  process.exitCode = 1;
});
